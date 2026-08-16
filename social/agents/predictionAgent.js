// Predicts how well a not-yet-published video is likely to perform, and why
// — the gate between "passed policy/technical QA" and "worth publishing",
// used both by social/orchestrator.js (AI-authored campaigns, before
// scheduling) and server/routes/videoAdmin.js (admin-triggered Video Studio
// renders, after completion). A fixed formula can't judge hook/framing
// strength, so this is LLM-scored; grounding it in real historical
// performance-by-content-pillar data (not just the current trend feed) is
// what makes the score actually improve as more posts get tracked over
// time, rather than staying a static guess forever.
//
// Deliberately takes flattened primitives (hook/beats/cta strings) rather
// than the AI pipeline's own strategy/script/creative shapes, so an
// admin-triggered render — which only ever produces a flat `copy` object,
// never those richer stage objects — can call this with the same interface
// as the AI pipeline, no adapter object needed.
const { structured, isConfigured } = require('./llm');
const scorecardModel = require('../models/scorecard');

const SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'number', minimum: 0, maximum: 100, description: 'Predicted popularity, 0-100 — calibrate against the historical performance data given, not an abstract scale.' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reasoning: { type: 'string', description: 'One or two sentences on what drives the score.' },
    weaknesses: {
      type: 'array',
      items: { type: 'string' },
      description: 'Specific, actionable things that would raise the score if fixed (e.g. "hook is generic, name the actual mechanic in the first line"). Empty array if there are none worth flagging.'
    }
  },
  required: ['score', 'confidence', 'reasoning', 'weaknesses']
};

const SYSTEM = `You are the Popularity Prediction agent for ScripForge's short-form video system — the step after content passes policy/technical QA that judges whether it's actually likely to perform well before it gets scheduled to publish. Score against the REAL historical performance data and current trend signal you're given, not generic intuition; with little history, say so via lower confidence rather than inventing certainty. Be honest and a little harsh — this gate exists specifically to catch and redo mediocre videos before they publish, so a lazy high score defeats its purpose. Your own past accuracy (shown below) is real feedback, not decoration — if you've been overconfident and wrong, that's a reason to hedge harder now, not a footnote. Output only via the submit_result tool.`;

// Confidence-weighted reward/punish history from resolved predictions (see
// analyticsLearningAgent.resolvePredictions and social/models/scorecard.js)
// — fed back into every new prediction so the agent can see whether it's
// actually been calibrated well lately, the closest thing an LLM-scored gate
// has to "learning from mistakes" between runs.
function summarizeTrackRecord() {
  const stats = scorecardModel.accuracyStats('popularity_prediction');
  if (!stats.total) return '(no resolved predictions yet — this gate is new or nothing published under it has settled; keep confidence modest)';
  const recent = scorecardModel.recentFor('popularity_prediction', 5);
  const lines = [`${stats.correct}/${stats.correct + stats.incorrect} judged predictions correct (${stats.accuracyPct}%), ${stats.inconclusive} inconclusive, average reward ${stats.avgReward}.`];
  if (recent.length) {
    lines.push('Most recent resolutions (predicted score vs. actual relative performance, 0-100 scale):');
    for (const r of recent) lines.push(`- [${r.outcome}] predicted ${r.predicted_value}, actual ${r.actual_value} — ${r.notes}`);
  }
  return lines.join('\n');
}

// Groups real past performance by content pillar (the only creative
// attribute every published post reliably has, whether it came from the AI
// pipeline's strategyAgent or an admin-approved render's angle) so the model
// has an actual performance baseline to calibrate against, not just a raw
// list of numbers.
function summarizePerformance(rows) {
  if (!rows.length) return '(no historical performance data yet — score based on trend fit and hook/CTA strength alone, and keep confidence low)';
  const byPillar = new Map();
  for (const row of rows) {
    let pillar = 'unknown';
    try { pillar = JSON.parse(row.strategyJson || '{}').contentPillar || 'unknown'; } catch { /* legacy/malformed row — bucket as unknown */ }
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

function buildPrompt({ pack, platform, angleLabel, hook, beats, cta, visualStyle, trends, insights, performanceRows }) {
  const trendLines = trends.length ? trends.map((t) => `- [${t.source}] ${t.topic} (score ${t.score})`).join('\n') : '(no fresh trend data)';
  const insightLines = insights.length ? insights.map((i) => `- (confidence ${i.confidence}) ${i.insight}`).join('\n') : '(none yet)';

  return `Platform: ${platform}
${pack ? `Pack: ${pack.packName} (${pack.gameTitle})` : 'No specific pack featured.'}
Angle/content pillar: ${angleLabel || 'unspecified'}

Hook: ${hook}
Beats: ${(beats || []).join(' / ')}
CTA: ${cta}
${visualStyle ? `Visual style: ${visualStyle}` : ''}

## Current trends
${trendLines}

## Learned insights from past campaigns
${insightLines}

## Historical performance by content pillar (last 90 days)
${summarizePerformance(performanceRows)}

## Your track record on past predictions
${summarizeTrackRecord()}

Predict how this specific video is likely to perform relative to the historical data above.`;
}

async function run({ pack, platform, angleLabel, hook, beats = [], cta, visualStyle, trends = [], insights = [], performanceRows = [] }) {
  if (!isConfigured()) {
    return {
      score: 70,
      confidence: 0,
      reasoning: 'ANTHROPIC_API_KEY not configured — skipped, defaulted to a neutral pass-through score so this gate never blocks the pipeline while unconfigured.',
      weaknesses: []
    };
  }
  return structured({
    system: SYSTEM,
    prompt: buildPrompt({ pack, platform, angleLabel, hook, beats, cta, visualStyle, trends, insights, performanceRows }),
    schema: SCHEMA,
    maxTokens: 800
  });
}

module.exports = { run };
