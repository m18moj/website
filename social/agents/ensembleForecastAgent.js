// An enhanced sibling to social/agents/trendForecastAgent.js. That agent
// asks the LLM alone for a single-horizon rising/falling/flat call per
// source. This one blends that same kind of LLM judgment with an
// independent, non-LLM statistical extrapolation (linear or exponential
// least-squares fit over social/models/trends.js's dailyRollup history) into
// one ensemble prediction that carries an explicit confidence interval
// instead of a bare point guess, across four horizons (24h/3d/7d/14d) and
// specialized per content pillar (the enum strategyAgent.js plans campaigns
// against) — because how fast a trend needs to be acted on, and how much
// confidence is warranted, plausibly differs between e.g. a reactive
// trend_jack post and a slow-burn tutorial_snippet.
//
// Deliberately does not replace trendForecastAgent.js or touch
// social/models/forecasts.js — this is an additive, parallel forecasting
// layer. See INTEGRATION NOTES at the bottom for how the two could be
// reconciled later.
const { structured, isConfigured } = require('./llm');
const trendsModel = require('../models/trends');
const analyticsModel = require('../models/analytics');
const ensembleForecastsModel = require('../models/ensembleForecasts');

// Mirrors the enum strategyAgent.js's SCHEMA defines for contentPillar.
// Duplicated rather than imported — same convention as MIN_POPULARITY_SCORE
// being duplicated into server/routes/videoAdmin.js, to avoid a cross-agent
// require for a single constant list.
const CONTENT_PILLARS = ['product_showcase', 'tutorial_snippet', 'before_after', 'trend_jack', 'social_proof', 'behind_the_scenes'];

const HORIZONS = [
  { key: '24h', days: 1 },
  { key: '3d', days: 3 },
  { key: '7d', days: 7 },
  { key: '14d', days: 14 }
];

// Fewer than this many distinct days of dailyRollup history for a source and
// a trend-line fit isn't trustworthy — same spirit as trendsModel.momentum()
// requiring at least 4 days before it will report a direction.
const MIN_DAYS_FOR_FIT = 5;
const MAX_SOURCES_IN_PROMPT = 8;
const MAX_ENSEMBLE_FORECASTS_PER_RUN = 8;

// --- Plain-JS statistical extrapolation (no LLM involved) -----------------

function linearRegression(xs, ys) {
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let ssXY = 0, ssXX = 0, ssYY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    ssXY += dx * dy;
    ssXX += dx * dx;
    ssYY += dy * dy;
  }
  const slope = ssXX === 0 ? 0 : ssXY / ssXX;
  const intercept = meanY - slope * meanX;
  const predict = (x) => intercept + slope * x;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const resid = ys[i] - predict(xs[i]);
    ssRes += resid * resid;
  }
  const r2 = ssYY === 0 ? (ssRes === 0 ? 1 : 0) : Math.max(0, 1 - ssRes / ssYY);
  const stderr = n > 2 ? Math.sqrt(ssRes / (n - 2)) : Math.sqrt(ssRes / Math.max(n - 1, 1));
  return { slope, intercept, predict, r2, stderr };
}

// Fits both a straight line and (when every value is positive) an
// exponential curve to a source's daily average score, and keeps whichever
// fits better (higher R²) — trend/virality data plausibly compounds rather
// than moving linearly, so trying both beats assuming one shape.
function fitSource(rollupRowsForSource) {
  const byDay = [...rollupRowsForSource].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  if (byDay.length < MIN_DAYS_FOR_FIT) return null;

  const xs = byDay.map((_, i) => i);
  const ys = byDay.map((r) => r.avgScore);

  const linear = { ...linearRegression(xs, ys), model: 'linear' };
  let chosen = linear;

  if (ys.every((y) => y > 0)) {
    const logYs = ys.map((y) => Math.log(y));
    const logFit = linearRegression(xs, logYs);
    const exponential = { ...logFit, predict: (x) => Math.exp(logFit.predict(x)), model: 'exponential', r2: logFit.r2, stderr: logFit.stderr };
    if (exponential.r2 > linear.r2) chosen = exponential;
  }

  return { ...chosen, lastIndex: xs[xs.length - 1], currentValue: ys[ys.length - 1], days: byDay.length };
}

// Projects a fitted source `horizonDays` past its last observed day and
// turns that into the same rising/falling/flat shape trendsModel.momentum()
// uses (same +-5% threshold, for consistency across the codebase's two
// trend-direction signals).
function statForecast(fit, horizonDays) {
  const projectedX = fit.lastIndex + horizonDays;
  const rawProjected = Math.max(0, fit.predict(projectedX));
  const currentValue = fit.currentValue;
  const changePct = currentValue > 0 ? Number((((rawProjected - currentValue) / currentValue) * 100).toFixed(1)) : 0;
  const direction = changePct > 5 ? 'rising' : changePct < -5 ? 'falling' : 'flat';
  // R² as a confidence proxy, floored/ceilinged so neither a suspiciously
  // perfect nor a totally unexplained fit reads as absolute certainty.
  const confidence = Number(Math.max(0.05, Math.min(0.95, fit.r2)).toFixed(2));
  // fit.stderr is in log-space for an exponential fit; for small errors
  // exp(x+e)-exp(x) ~= exp(x)*e, so scaling by the projected value converts
  // it back to value-space before it's used to size a confidence interval.
  const stderr = fit.model === 'exponential' ? Math.abs(rawProjected * fit.stderr) : fit.stderr;
  return {
    projectedValue: Number(rawProjected.toFixed(2)),
    currentValue: Number(currentValue.toFixed(2)),
    changePct,
    direction,
    confidence,
    stderr,
    model: fit.model
  };
}

// Pure, DB-free lookup used by social/agents/trendJackScorer.js when it
// wants a numeric forecast for a source but doesn't want to force a fresh
// LLM call (or one hasn't been generated yet for that source/pillar).
// Returns null when there isn't enough trend history to fit a trend line.
function statForecastForSource(source, horizonDays) {
  const rows = trendsModel.dailyRollup('-90 days').filter((r) => r.source === source);
  const fit = fitSource(rows);
  if (!fit) return null;
  return statForecast(fit, horizonDays);
}

// --- Blending the statistical fit with the LLM's call ----------------------

// Combines the statistical extrapolation with the LLM's independent
// directional call. When they agree, confidence goes up and the interval
// stays tight; when they disagree, the final direction favors whichever side
// is more confident but the interval widens and the blended confidence drops
// — disagreement between two independent methods is itself information.
function blendForecast(stat, llm) {
  if (!llm) {
    const spread = Math.max(stat.stderr, 0.01) * 1.28; // ~80% interval
    return {
      predictedDirection: stat.direction,
      confidence: stat.confidence,
      confidenceLow: Number((stat.projectedValue - spread).toFixed(2)),
      confidenceHigh: Number((stat.projectedValue + spread).toFixed(2)),
      pointEstimate: stat.projectedValue,
      llmDirection: null,
      llmConfidence: null,
      statDirection: stat.direction,
      statConfidence: stat.confidence,
      basedOn: `statistical-only (${stat.model} fit, R^2=${stat.confidence}, ${stat.changePct > 0 ? '+' : ''}${stat.changePct}% projected)`
    };
  }

  const agree = stat.direction === llm.direction;
  const blendedConfidence = agree
    ? Math.min(0.95, (stat.confidence + llm.confidence) / 2 + 0.15)
    : Math.max(0.1, Math.abs(stat.confidence - llm.confidence) * 0.6);
  const finalDirection = agree ? stat.direction : (stat.confidence >= llm.confidence ? stat.direction : llm.direction);
  const spread = Math.max(stat.stderr, 0.01) * (agree ? 1 : 1.75) * (1 + (1 - blendedConfidence)) * 1.28;

  return {
    predictedDirection: finalDirection,
    confidence: Number(blendedConfidence.toFixed(2)),
    confidenceLow: Number((stat.projectedValue - spread).toFixed(2)),
    confidenceHigh: Number((stat.projectedValue + spread).toFixed(2)),
    pointEstimate: stat.projectedValue,
    llmDirection: llm.direction,
    llmConfidence: llm.confidence,
    statDirection: stat.direction,
    statConfidence: stat.confidence,
    basedOn: `${agree ? 'LLM and statistical model agree' : 'LLM and statistical model disagree'} (stat: ${stat.direction} via ${stat.model} fit R^2=${stat.confidence}, ${stat.changePct > 0 ? '+' : ''}${stat.changePct}%; llm: ${llm.direction} confidence=${llm.confidence})`
  };
}

// --- LLM half --------------------------------------------------------------

const SCHEMA = {
  type: 'object',
  properties: {
    forecasts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Must exactly match one of the source names given in the statistical extrapolation table.' },
          topic: { type: 'string', description: 'The specific topic/example this forecast is about, not just the source name.' },
          horizon: { type: 'string', enum: ['24h', '3d', '7d', '14d'], description: 'Pick whichever horizon is most decision-relevant for this source/pillar combo.' },
          contentPillar: { type: 'string', enum: CONTENT_PILLARS, description: 'Which content pillar this forecast is specialized for — dynamics differ by pillar (e.g. trend_jack cares about a fast, short window; tutorial_snippet cares less about short-term spikes).' },
          predictedDirection: { type: 'string', enum: ['rising', 'falling', 'flat'] },
          confidence: { type: 'number', minimum: 0, maximum: 1, description: 'Your own confidence, independent of the statistical model shown to you. Calibrate honestly.' },
          reasoning: { type: 'string', description: 'One or two sentences. If you disagree with the statistical extrapolation for this source/horizon, say why.' }
        },
        required: ['source', 'topic', 'horizon', 'contentPillar', 'predictedDirection', 'confidence', 'reasoning']
      },
      maxItems: MAX_ENSEMBLE_FORECASTS_PER_RUN
    }
  },
  required: ['forecasts']
};

const SYSTEM = `You are the Ensemble Forecast agent for ScripForge's short-form video system. You are shown a purely statistical trend-line extrapolation (computed without you) for each trend source, and asked to add your own independent directional judgment per source/horizon/content-pillar combination — your call is later blended with the statistical one, so your value is in catching things the raw numbers can't (context, saturation, seasonality, whether a pillar's dynamics differ from the raw trend). Agreeing with the statistical model when it looks right is fine; disagreeing when you have a real reason is more valuable than reflexively hedging toward it. Pick the source/horizon/pillar combos most worth forecasting this run — you don't need to cover everything. Output only via the submit_result tool.`;

function summarizePillarPerformance(rows) {
  if (!rows.length) return '(no historical performance data yet by content pillar)';
  const byPillar = new Map();
  for (const row of rows) {
    let pillar = 'unknown';
    try { pillar = JSON.parse(row.strategyJson || '{}').contentPillar || 'unknown'; } catch { /* legacy/malformed row */ }
    if (!byPillar.has(pillar)) byPillar.set(pillar, { count: 0, views: 0 });
    const bucket = byPillar.get(pillar);
    bucket.count += 1;
    bucket.views += row.views || 0;
  }
  return Array.from(byPillar.entries())
    .sort((a, b) => b[1].views / b[1].count - a[1].views / a[1].count)
    .map(([pillar, b]) => `- ${pillar}: ${Math.round(b.views / b.count).toLocaleString()} avg views across ${b.count} post${b.count === 1 ? '' : 's'}`)
    .join('\n');
}

function summarizeTrackRecord() {
  const stats = ensembleForecastsModel.accuracyStats();
  if (!stats.total) return '(no ensemble forecasts resolved yet — this is early; keep confidence modest until a track record builds up)';
  return `${stats.correct}/${stats.correct + stats.incorrect} judged forecasts correct (${stats.accuracyPct}%), ${stats.inconclusive} inconclusive.`;
}

function buildStatTable(dailyRollup) {
  const bySource = new Map();
  for (const row of dailyRollup) {
    if (!bySource.has(row.source)) bySource.set(row.source, []);
    bySource.get(row.source).push(row);
  }
  const table = new Map();
  for (const [source, rows] of bySource) {
    const fit = fitSource(rows);
    if (!fit) continue;
    const byHorizon = {};
    for (const h of HORIZONS) byHorizon[h.key] = statForecast(fit, h.days);
    table.set(source, { fit, byHorizon });
  }
  return table;
}

function buildPrompt({ statTable, topicsBySource, pillarPerformanceText, trackRecordText }) {
  const sources = Array.from(statTable.entries())
    .sort((a, b) => Math.abs(b[1].byHorizon['7d'].changePct) - Math.abs(a[1].byHorizon['7d'].changePct))
    .slice(0, MAX_SOURCES_IN_PROMPT);

  const lines = [];
  for (const [source, { byHorizon }] of sources) {
    const example = topicsBySource.get(source);
    lines.push(`### ${source}${example ? ` — recent example: "${example.topic}"` : ''}`);
    for (const h of HORIZONS) {
      const f = byHorizon[h.key];
      lines.push(`- [${h.key}] projected ${f.projectedValue} (current ${f.currentValue}, ${f.changePct > 0 ? '+' : ''}${f.changePct}%) -> ${f.direction}, ${f.model} fit R^2=${f.confidence}`);
    }
  }

  return `## Statistical trend extrapolation (linear/exponential fit per source, computed without you)
${lines.join('\n')}

## Historical performance by content pillar (last 180 days)
${pillarPerformanceText}

## Your track record on past ensemble forecasts
${trackRecordText}

Only forecast sources listed above — do not invent sources. For each forecast you produce, pick the horizon and content pillar where your judgment is most likely to add something the statistical extrapolation alone misses.`;
}

async function generateEnsembleForecasts() {
  const dailyRollup = trendsModel.dailyRollup('-90 days');
  const statTable = buildStatTable(dailyRollup);
  if (!statTable.size) return { written: 0, reason: 'not enough trend history yet to fit a statistical model for any source' };

  const recentTrends = trendsModel.recent(60, '-3 days');
  const topicsBySource = new Map();
  for (const t of recentTrends) {
    const existing = topicsBySource.get(t.source);
    if (!existing || t.score > existing.score) topicsBySource.set(t.source, t);
  }

  if (!isConfigured()) {
    // Statistical-only fallback so this layer still produces something
    // useful without an API key, same spirit as predictionAgent.js's
    // neutral-default fallback. No LLM judgment is available to pick a
    // pillar, so this defaults to 'trend_jack' (the pillar most directly
    // about "is this source rising right now") at the original single
    // DEFAULT_HORIZON_DAYS-equivalent 7-day horizon.
    let written = 0;
    for (const [source, { byHorizon }] of statTable) {
      if (written >= MAX_ENSEMBLE_FORECASTS_PER_RUN) break;
      const stat = byHorizon['7d'];
      const blended = blendForecast(stat, null);
      const example = topicsBySource.get(source);
      ensembleForecastsModel.create({
        source,
        topic: example ? example.topic : source,
        contentPillar: 'trend_jack',
        horizonDays: 7,
        predictedDirection: blended.predictedDirection,
        confidence: blended.confidence,
        confidenceLow: blended.confidenceLow,
        confidenceHigh: blended.confidenceHigh,
        pointEstimate: blended.pointEstimate,
        currentValue: stat.currentValue,
        llmDirection: null,
        llmConfidence: null,
        statDirection: blended.statDirection,
        statConfidence: blended.statConfidence,
        reasoning: 'ANTHROPIC_API_KEY not configured — statistical-only forecast; content pillar defaulted since no LLM judgment was available to specialize it.',
        basedOn: blended.basedOn
      });
      written += 1;
    }
    return { written, reason: written ? undefined : 'not_configured' };
  }

  const performanceRows = analyticsModel.sinceWithCampaignDetail('-180 days');
  const pillarPerformanceText = summarizePillarPerformance(performanceRows);
  const trackRecordText = summarizeTrackRecord();

  const result = await structured({
    system: SYSTEM,
    prompt: buildPrompt({ statTable, topicsBySource, pillarPerformanceText, trackRecordText }),
    schema: SCHEMA,
    maxTokens: 1600
  });

  let written = 0;
  for (const f of result.forecasts) {
    const entry = statTable.get(f.source);
    if (!entry) continue; // model invented a source we didn't give it — skip rather than store garbage
    const stat = entry.byHorizon[f.horizon];
    if (!stat) continue;
    const horizonDays = HORIZONS.find((h) => h.key === f.horizon).days;
    const blended = blendForecast(stat, { direction: f.predictedDirection, confidence: f.confidence });

    ensembleForecastsModel.create({
      source: f.source,
      topic: f.topic,
      contentPillar: f.contentPillar,
      horizonDays,
      predictedDirection: blended.predictedDirection,
      confidence: blended.confidence,
      confidenceLow: blended.confidenceLow,
      confidenceHigh: blended.confidenceHigh,
      pointEstimate: blended.pointEstimate,
      currentValue: stat.currentValue,
      llmDirection: blended.llmDirection,
      llmConfidence: blended.llmConfidence,
      statDirection: blended.statDirection,
      statConfidence: blended.statConfidence,
      reasoning: f.reasoning,
      basedOn: blended.basedOn
    });
    written += 1;
  }
  return { written };
}

// Re-derives a fresh statistical fit (never trusts the original) over a
// window sized to the forecast's horizon and checks both whether the
// direction call held up and whether reality actually landed inside the
// forecast's own confidence interval — same "recompute for real, don't trust
// the snapshot" approach as trendForecastAgent.resolveForecasts().
function resolveEnsembleForecasts() {
  const due = ensembleForecastsModel.duePending();
  let resolved = 0;
  for (const f of due) {
    const window = Math.max(14, f.horizonDays * 2);
    const rows = trendsModel.dailyRollup(`-${window} days`).filter((r) => r.source === f.source);
    const fit = fitSource(rows);

    let status, actualDirection, actualValue, notes;
    if (!fit) {
      status = 'inconclusive';
      actualDirection = null;
      actualValue = null;
      notes = `Not enough trend history over the trailing ${window} days to recompute a statistical fit for this source.`;
    } else {
      actualValue = fit.currentValue;
      const changePct = f.currentValue > 0 ? Number((((actualValue - f.currentValue) / f.currentValue) * 100).toFixed(1)) : 0;
      actualDirection = changePct > 5 ? 'rising' : changePct < -5 ? 'falling' : 'flat';
      status = actualDirection === f.predictedDirection ? 'correct' : 'incorrect';
      const withinCI = f.confidenceLow != null && f.confidenceHigh != null && actualValue >= f.confidenceLow && actualValue <= f.confidenceHigh;
      notes = `Actual value ${actualValue} (${changePct > 0 ? '+' : ''}${changePct}% vs value at forecast time) -> ${actualDirection}. ${withinCI ? 'Fell within' : 'Fell outside'} the forecasted confidence interval [${f.confidenceLow}, ${f.confidenceHigh}].`;
    }

    ensembleForecastsModel.resolve(f.id, { status, actualDirection, actualValue, resolutionNotes: notes });
    resolved += 1;
  }
  return { resolved };
}

module.exports = { generateEnsembleForecasts, resolveEnsembleForecasts, statForecastForSource, CONTENT_PILLARS, HORIZONS };

// INTEGRATION NOTES:
// - No cron entry exists yet for this agent. social/scheduler.js currently
//   calls trendForecastAgent.generateForecasts()/resolveForecasts() on its
//   own schedule (check social/scheduler.js's run_learning-equivalent stage
//   for the exact cadence). Add generateEnsembleForecasts()/
//   resolveEnsembleForecasts() alongside those same two calls — they're
//   independent tables and safe to run on the same tick.
// - Nothing currently reads ensemble_forecasts except this file and the new
//   social/agents/trendJackScorer.js. To actually replace or run alongside
//   trendForecastAgent in orchestrator.js's run_learning stage: strategyAgent.js
//   (social/agents/strategyAgent.js's buildPrompt) currently only reads
//   trendsModel.momentum() for the "is this rising/falling" signal it hands
//   the LLM. It could additionally (or instead) read
//   ensembleForecastsModel.active() filtered to the campaign's chosen
//   contentPillar, which would let strategy planning use a pillar-specific,
//   confidence-interval-aware forecast instead of the pillar-agnostic
//   momentum() figure it uses today.
// - Real weight-updating (not just in-context track record): today, exactly
//   like trendForecastAgent, "learning" means showing the LLM its own recent
//   accuracy in the prompt (summarizeTrackRecord() above) and trusting it to
//   self-calibrate — there's no numeric weight being adjusted anywhere. A
//   later pass could add a per-source (or per-source-per-pillar) blend
//   weight, persisted in a new small table keyed by source (+ optionally
//   contentPillar), initialized at 0.5/0.5 for {llmWeight, statWeight}, and
//   nudged after each resolveEnsembleForecasts() call: increase whichever of
//   llm_confidence/stat_confidence was closer to the eventual outcome
//   (actual_direction) and decrease the other, clamped to e.g. [0.1, 0.9] so
//   neither side is ever fully zeroed out. blendForecast() above would then
//   read that source's stored weight instead of the fixed 50/50 average it
//   uses today. ai_scorecard's history (social/models/scorecard.js) already
//   has the right shape (predicted_value/actual_value/reward per resolved
//   prediction) to backfill an initial weight per source if
//   ensemble_forecasts is ever unified with it — see the note in
//   social/models/ensembleForecasts.js about ai_scorecard's CHECK constraint
//   needing 'ensemble_forecast' added to its agent enum before this table's
//   rows could be written there directly instead of tracking accuracy
//   separately.
