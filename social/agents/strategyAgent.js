// Turns a trigger (new pack, evergreen slot, or trend) into a campaign
// strategy: the angle, audience, goal, and hook concept everything
// downstream (script, creative, publishing) builds on. Reads back
// social_insights (what's worked before) and social_trends (what's hot
// right now) so the loop actually optimizes over time instead of repeating
// the same angle forever.
const { structured } = require('./llm');
const trendEnrichmentStore = require('../models/trendEnrichmentStore');

const SCHEMA = {
  type: 'object',
  properties: {
    angle: { type: 'string', description: 'The specific creative angle for this video, one sentence.' },
    goal: { type: 'string', enum: ['awareness', 'conversion', 'engagement'] },
    targetAudience: { type: 'string', description: 'Who this is for, e.g. "Roblox scripters looking for a starting point".' },
    contentPillar: {
      type: 'string',
      enum: ['product_showcase', 'tutorial_snippet', 'before_after', 'trend_jack', 'social_proof', 'behind_the_scenes']
    },
    hook: { type: 'string', description: 'The literal first line/visual of the video — must earn attention in under 2 seconds.' },
    rationale: { type: 'string', description: 'One or two sentences on why this angle, referencing any insight/trend used.' }
  },
  required: ['angle', 'goal', 'targetAudience', 'contentPillar', 'hook', 'rationale']
};

const SYSTEM = `You are the Strategy agent for ScripForge's short-form video marketing system. ScripForge sells game-script "packs" (developer/customization scripts and tools for games like Minecraft, Roblox, GTA V, Fortnite, etc.) and related services (Discord bots, SMM, websites) — always frame these as developer tools / customization scripts, never as "cheats" or "hacks" (that framing risks platform strikes and misrepresents the product). Output only via the submit_result tool.`;

function buildPrompt({ pack, platform, triggerType, insights, trends, momentum, overrides, competitorContext, webSignalsMomentum, communitySignals, ensembleForecasts }) {
  const packSummary = pack
    ? `Featured pack: "${pack.packName}" for ${pack.gameTitle} (${pack.genre}). ${pack.description || ''}\nScripts: ${pack.scripts.slice(0, 8).map((s) => `${s.title} ($${s.price.toFixed(2)})`).join(', ')}`
    : 'No specific pack — this is a trend-driven or brand-awareness campaign for ScripForge generally.';

  const insightLines = insights.length
    ? insights.map((i) => `- (${i.scope}, confidence ${i.confidence}) ${i.insight}`).join('\n')
    : '(no prior performance data yet — use general short-form best practices)';

  const trendLines = trends.length
    ? trends.map((t) => `- [${t.source}] ${t.topic} (score ${t.score})`).join('\n')
    : '(no fresh trend data)';

  // Point-in-time trend score alone can't say whether something is heating
  // up or already cooling — momentum (social/models/trends.js) compares
  // recent captures against older ones for the same source, so this only
  // has real signal once the trend feed has run continuously for a while.
  const momentumLines = momentum && momentum.length
    ? momentum.map((m) => `- ${m.source}: ${m.direction} (${m.changePct > 0 ? '+' : ''}${m.changePct}% vs the earlier half of the window)`).join('\n')
    : '(not enough trend history yet to say what\'s rising or falling)';

  // Trend overrides: admin-pinned topics that should always be pursued or blocked
  const overrideLines = overrides && overrides.length
    ? overrides.map((o) => `- [${o.mode}] "${o.topic}"${o.reason ? ` — ${o.reason}` : ''}`).join('\n')
    : '(no admin overrides set)';

  // Competitor intelligence: content gaps, saturation scores, first-mover alerts
  const competitorLines = competitorContext && competitorContext.ok
    ? [
        competitorContext.contentGaps && competitorContext.contentGaps.length
          ? `Content gaps competitors haven't covered:\n${competitorContext.contentGaps.map((g) => `- ${g}`).join('\n')}`
          : null,
        competitorContext.saturation && Object.keys(competitorContext.saturation).length
          ? `Topic saturation scores (higher = more competitor coverage):\n${Object.entries(competitorContext.saturation).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`
          : null,
        competitorContext.firstMoverAlerts && competitorContext.firstMoverAlerts.length
          ? `First-mover opportunities (trending but competitors haven't posted yet):\n${competitorContext.firstMoverAlerts.map((a) => `- ${a}`).join('\n')}`
          : null
      ].filter(Boolean).join('\n\n')
    : '(no competitor data available yet)';

  // Web signal momentum (Google Trends, Wikipedia, App Store, News RSS)
  const webSignalLines = webSignalsMomentum && webSignalsMomentum.length
    ? webSignalsMomentum.map((m) => `- ${m.source}: ${m.direction} (${m.changePct > 0 ? '+' : ''}${m.changePct}%)`).join('\n')
    : '(no web signal momentum data yet)';

  // Community signal recency (Twitter, Discord, Roblox DevForum, Twitch)
  const communityLines = communitySignals && communitySignals.length
    ? communitySignals.slice(0, 10).map((s) => `- [${s.source}] ${s.topic} (score ${s.score})`).join('\n')
    : '(no community signal data yet)';

  // Ensemble forecasts: pillar-specific, confidence-interval-aware predictions
  const ensembleLines = ensembleForecasts && ensembleForecasts.length
    ? ensembleForecasts.slice(0, 8).map((f) => `- [${f.source}] "${f.topic}" (${f.contentPillar}, ${f.horizonDays}d horizon): ${f.predictedDirection} at ${Math.round(f.confidence * 100)}% confidence${f.basedOn ? ` — ${f.basedOn}` : ''}`).join('\n')
    : '(no ensemble forecasts available yet)';

  // Higher-order enrichment signals computed by trendEnrichment.js —
  // cross-platform correlations, YouTube→TikTok arbitrage, weekly
  // seasonality, evergreen recurrence, and per-source trust weights.
  // Only surfaced when present (the enrichment pass runs daily); empty
  // state is the normal starting condition.
  const enrichmentLines = [];
  try {
    const correlations = trendEnrichmentStore.byKind('correlation');
    if (correlations.length) {
      enrichmentLines.push(`Cross-platform correlations:\n${correlations.slice(0, 5).map((c) => `- ${c.key}: r=${c.payload.correlation} (lag ${c.payload.lagDays}d, ${c.payload.sampleDays} days overlap)`).join('\n')}`);
    }
    const arbitrage = trendEnrichmentStore.byKind('arbitrage');
    if (arbitrage.length) {
      enrichmentLines.push(`YouTube→TikTok arbitrage opportunities:\n${arbitrage.slice(0, 5).map((a) => `- ${a.key}: score ${a.payload.youtubeScore}, TikTok overlap ${a.payload.bestTiktokOverlap}` ).join('\n')}`);
    }
    const evergreen = trendEnrichmentStore.byKind('evergreen');
    if (evergreen.length) {
      enrichmentLines.push(`Evergreen recurring topics:\n${evergreen.slice(0, 5).map((e) => `- ${e.key}: ${e.payload.recurrenceCycles} cycles, avg score ${e.payload.avgScore}`).join('\n')}`);
    }
    const trustWeights = trendEnrichmentStore.byKind('trust_weight').filter((w) => w.key !== '__global__');
    if (trustWeights.length) {
      enrichmentLines.push(`Source reliability weights:\n${trustWeights.slice(0, 5).map((w) => `- ${w.key}: trust=${w.payload.trustWeight} (${w.payload.total} forecasts, ${w.payload.empiricalAccuracy} accuracy)`).join('\n')}`);
    }
  } catch { /* enrichment store not yet populated — fine */ }
  const enrichmentBlock = enrichmentLines.length
    ? `\n\n## Higher-order trend intelligence\n${enrichmentLines.join('\n\n')}`
    : '';

  return `Platform: ${platform}
Trigger: ${triggerType}

${packSummary}

## Learned insights from past campaigns
${insightLines}

## Current trends
${trendLines}

## Trend momentum (is each signal source heating up or cooling down?)
${momentumLines}

## Admin overrides (always pursue / blocklist)
${overrideLines}

## Competitor intelligence
${competitorLines}

## Web signal momentum (Google Trends, Wikipedia, App Store, News)
${webSignalLines}

## Community signals (Twitter, Discord, Roblox DevForum, Twitch)
${communityLines}

## Ensemble forecasts (pillar-specific, with confidence intervals)
${ensembleLines}
${enrichmentBlock}

Plan the strategy for one short-form video (15-60s) promoting this. Prefer an angle that hasn't been overused per the insights above, and lean toward rising trend sources over flat/falling ones when relevant. Respect admin overrides: never pursue a blocklisted topic, and strongly prefer always_pursue topics when they fit. Use competitor intelligence to find gaps and avoid saturated angles. Use ensemble forecasts to pick the right content pillar and timing.`;
}

async function run({ pack, platform, triggerType, insights = [], trends = [], momentum = [], overrides = [], competitorContext = null, webSignalsMomentum = [], communitySignals = [], ensembleForecasts = [] }) {
  return structured({ system: SYSTEM, prompt: buildPrompt({ pack, platform, triggerType, insights, trends, momentum, overrides, competitorContext, webSignalsMomentum, communitySignals, ensembleForecasts }), schema: SCHEMA });
}

module.exports = { run };
