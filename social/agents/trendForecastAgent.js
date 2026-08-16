// The forward-looking half of trend intelligence: social_trends/momentum()
// describe what IS happening and what's happened lately, but neither says
// what's likely to happen NEXT. This agent asks the model to make that call
// explicitly, with a confidence score and a horizon, grounded in (a) real
// momentum data and (b) whether campaigns that trend-jacked in the past
// actually outperformed the ones that didn't — real pattern evidence, not
// vibes. Every forecast is resolved later (resolveForecasts, run nightly
// alongside generation) by recomputing momentum for real and checking
// whether it matches, which writes a reward/punish row to
// social/models/scorecard.js. That scorecard is fed back into THIS agent's
// own prompt on the next run, so a string of bad calls visibly lowers its
// standing before the next forecast is made — the actual mechanism by which
// an LLM-scored system can be said to "learn" between runs.
const { structured, isConfigured } = require('./llm');
const trendsModel = require('../models/trends');
const analyticsModel = require('../models/analytics');
const forecastsModel = require('../models/forecasts');
const scorecardModel = require('../models/scorecard');

const DEFAULT_HORIZON_DAYS = 7;
const MAX_FORECASTS_PER_RUN = 6;

const SCHEMA = {
  type: 'object',
  properties: {
    forecasts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Must exactly match one of the source names given in the momentum data.' },
          topic: { type: 'string', description: 'The specific topic/example this forecast is about, not just the source name.' },
          predictedDirection: { type: 'string', enum: ['rising', 'falling', 'flat'] },
          confidence: { type: 'number', minimum: 0, maximum: 1, description: 'Calibrate honestly — overconfident wrong calls are punished harder than hedged ones.' },
          reasoning: { type: 'string', description: 'One or two sentences citing the specific momentum figures and/or historical pattern this is based on.' }
        },
        required: ['source', 'topic', 'predictedDirection', 'confidence', 'reasoning']
      },
      maxItems: MAX_FORECASTS_PER_RUN
    }
  },
  required: ['forecasts']
};

const SYSTEM = `You are the Trend Forecast agent for ScripForge's short-form video system. You predict what a given trend signal source is likely to do over the coming week — keep rising, start falling, or flatten out — so the content strategy can lean into what's about to matter instead of what already peaked. Ground every forecast in the real momentum data and historical performance pattern you're given, never generic intuition. Your own past accuracy is shown to you below — take it seriously: if you've been overconfident and wrong, hedge more; if a pattern has held up repeatedly, you can be more confident in it. Output only via the submit_result tool.`;

// Real pattern evidence: did campaigns whose strategy explicitly trend-jacked
// (contentPillar === 'trend_jack') actually outperform the rest? This is the
// closest honest answer this system can give to "trends that led to
// popularity in the past" without inventing a fuzzy topic-similarity metric.
function summarizeTrendJackPattern(rows) {
  if (!rows.length) return '(no published campaign performance data yet)';
  let trendJackViews = 0;
  let trendJackCount = 0;
  let otherViews = 0;
  let otherCount = 0;
  for (const row of rows) {
    let pillar = 'unknown';
    try { pillar = JSON.parse(row.strategyJson || '{}').contentPillar || 'unknown'; } catch { /* legacy/malformed row */ }
    if (pillar === 'trend_jack') { trendJackViews += row.views || 0; trendJackCount += 1; }
    else { otherViews += row.views || 0; otherCount += 1; }
  }
  const trendJackAvg = trendJackCount ? Math.round(trendJackViews / trendJackCount) : null;
  const otherAvg = otherCount ? Math.round(otherViews / otherCount) : null;
  if (trendJackAvg === null) return `(no trend-jack campaigns published yet to compare against the ${otherCount} non-trend-jack posts averaging ${otherAvg?.toLocaleString() ?? 0} views)`;
  if (otherAvg === null) return `Only trend-jack campaigns published so far (${trendJackCount}, averaging ${trendJackAvg.toLocaleString()} views) — no baseline to compare against yet.`;
  const verdict = trendJackAvg > otherAvg ? 'outperformed' : trendJackAvg < otherAvg ? 'underperformed relative to' : 'performed about the same as';
  return `Trend-jack campaigns (${trendJackCount} posts) averaged ${trendJackAvg.toLocaleString()} views and ${verdict} non-trend-jack campaigns (${otherCount} posts, averaging ${otherAvg.toLocaleString()} views).`;
}

function summarizeTrackRecord(stats, recent) {
  if (!stats.total) return '(no forecasts resolved yet — this is early; keep confidence modest until a track record builds up)';
  const lines = [`${stats.correct}/${stats.correct + stats.incorrect} judged forecasts correct (${stats.accuracyPct}%), ${stats.inconclusive} inconclusive, average reward ${stats.avgReward}.`];
  if (recent.length) {
    lines.push('Most recent resolutions:');
    for (const r of recent.slice(0, 5)) {
      lines.push(`- [${r.outcome}] predicted ${r.predicted_value}, actual ${r.actual_value} (reward ${r.reward})`);
    }
  }
  return lines.join('\n');
}

function topTopicPerSource(recentTrends) {
  const bySource = new Map();
  for (const t of recentTrends) {
    const existing = bySource.get(t.source);
    if (!existing || t.score > existing.score) bySource.set(t.source, t);
  }
  return bySource;
}

function buildPrompt({ momentum, topicsBySource, trendJackPattern, trackRecordText }) {
  const momentumLines = momentum
    .map((m) => {
      const example = topicsBySource.get(m.source);
      return `- ${m.source}: ${m.direction} (${m.changePct > 0 ? '+' : ''}${m.changePct}% vs the earlier half of the window)${example ? ` — recent example: "${example.topic}"` : ''}`;
    })
    .join('\n');

  return `## Trend momentum (last 14 days, split earlier vs recent)
${momentumLines}

## Historical pattern: does trend-jacking actually work for this business?
${trendJackPattern}

## Your track record on past forecasts
${trackRecordText}

Predict what each source above is likely to do over the next ${DEFAULT_HORIZON_DAYS} days. Only forecast sources with real momentum data given — do not invent sources.`;
}

async function generateForecasts() {
  if (!isConfigured()) return { written: 0, reason: 'not_configured' };

  const momentum = trendsModel.momentum('-14 days');
  if (!momentum.length) return { written: 0, reason: 'not enough trend history yet to compute momentum' };

  const recentTrends = trendsModel.recent(60, '-3 days');
  const topicsBySource = topTopicPerSource(recentTrends);
  const performanceRows = analyticsModel.sinceWithCampaignDetail('-180 days');
  const trendJackPattern = summarizeTrendJackPattern(performanceRows);
  const stats = scorecardModel.accuracyStats('trend_forecast');
  const recent = scorecardModel.recentFor('trend_forecast', 5);
  const trackRecordText = summarizeTrackRecord(stats, recent);

  const result = await structured({
    system: SYSTEM,
    prompt: buildPrompt({ momentum, topicsBySource, trendJackPattern, trackRecordText }),
    schema: SCHEMA,
    maxTokens: 1200
  });

  let written = 0;
  for (const f of result.forecasts) {
    const momentumEntry = momentum.find((m) => m.source === f.source);
    if (!momentumEntry) continue; // model invented a source we didn't give it — skip rather than store garbage
    forecastsModel.create({
      source: f.source,
      topic: f.topic,
      predictedDirection: f.predictedDirection,
      confidence: f.confidence,
      reasoning: f.reasoning,
      basedOn: `momentum ${momentumEntry.changePct > 0 ? '+' : ''}${momentumEntry.changePct}% (${momentumEntry.earlierAvg} -> ${momentumEntry.recentAvg})`,
      horizonDays: DEFAULT_HORIZON_DAYS
    });
    written += 1;
  }
  return { written };
}

const DIRECTION_VALUE = { rising: 1, flat: 0, falling: -1 };

// Re-derives momentum fresh (never trusts the original snapshot) over a
// window sized to the forecast's horizon, and checks whether reality matched
// the call. Confidence-weighted reward: a confident wrong call costs more
// than a hedged one, and a confident right call earns more than a hedged
// one — the calibration incentive that makes "punish" mean something more
// useful than a flat -1.
function resolveForecasts() {
  const due = forecastsModel.duePending();
  let resolved = 0;
  for (const forecast of due) {
    const window = Math.max(14, forecast.horizonDays * 2);
    const freshMomentum = trendsModel.momentum(`-${window} days`);
    const match = freshMomentum.find((m) => m.source === forecast.source);

    let status, actualDirection, reward, notes;
    if (!match) {
      status = 'inconclusive';
      actualDirection = null;
      reward = 0;
      notes = `Not enough trend history over the trailing ${window} days to recompute momentum for this source.`;
    } else {
      actualDirection = match.direction;
      const correct = actualDirection === forecast.predictedDirection;
      status = correct ? 'correct' : 'incorrect';
      reward = correct ? forecast.confidence : -forecast.confidence;
      notes = `Recomputed momentum over trailing ${window} days: ${actualDirection} (${match.changePct > 0 ? '+' : ''}${match.changePct}%).`;
    }

    forecastsModel.resolve(forecast.id, { status, actualDirection, resolutionNotes: notes });
    scorecardModel.record({
      agent: 'trend_forecast',
      subjectType: 'trend_forecast',
      subjectId: forecast.id,
      outcome: status,
      predictedValue: DIRECTION_VALUE[forecast.predictedDirection],
      actualValue: actualDirection ? DIRECTION_VALUE[actualDirection] : null,
      reward,
      notes
    });
    resolved += 1;
  }
  return { resolved };
}

module.exports = { generateForecasts, resolveForecasts };
