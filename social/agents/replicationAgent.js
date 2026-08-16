// Learns WHICH CONCRETE PRODUCTION ELEMENTS make a video win, not just which
// topic did — social/models/insights.js (written by analyticsLearningAgent)
// already covers "what angle/pillar worked"; this agent looks at the actual
// script_json/creative_json of the best- and worst-performing published
// campaigns side by side and asks the model to name the mechanical
// differences: hook phrasing/structure, pacing, visual style, beat ordering,
// CTA placement, on-screen text conventions. Findings are written to
// social/models/contentPatterns.js as reusable, confidence-scored patterns a
// later pass can feed back into scriptAgent/creativeDirectionAgent (see
// INTEGRATION NOTES at the bottom of this file).
//
// Sibling agents (visualStyleAgent.js, audioPairingAgent.js,
// audienceRequestAgent.js) reuse selectTopAndBottom()/detailFor() from here
// rather than re-deriving the same top/bottom split, so every mining pass
// agrees on which campaigns count as "winners" and "losers".
const { structured, isConfigured } = require('./llm');
const analyticsModel = require('../models/analytics');
const campaignsModel = require('../models/campaigns');
const contentPatternsModel = require('../models/contentPatterns');

// Below this many distinct published-and-measured campaigns, a top-N/bottom-N
// split is just noise — there isn't enough spread to tell a real pattern from
// chance. Same spirit as predictionAgent/trendForecastAgent hedging hard (or
// refusing) when history is thin.
const MIN_SAMPLE = 6;
const DEFAULT_GROUP_SIZE = 5;

function pillarOf(strategyJson) {
  try { return JSON.parse(strategyJson || '{}').contentPillar || 'unknown'; } catch { return 'unknown'; }
}

// Views is the same ranking metric predictionAgent/trendForecastAgent already
// use as ground truth (see analyticsLearningAgent.actualScoreFor) — kept
// consistent rather than inventing a second scoring formula.
function performanceScore(row) {
  return row.views || 0;
}

// analyticsModel.sinceWithCampaignDetail returns one row per analytics
// snapshot (a campaign is measured repeatedly over time), ordered most-recent
// first — collapse to one row per campaign (its latest snapshot) before
// ranking, so a frequently-re-measured campaign doesn't crowd out others.
function latestPerCampaign(rows) {
  const seen = new Map();
  for (const row of rows) {
    if (!seen.has(row.campaignId)) seen.set(row.campaignId, row);
  }
  return Array.from(seen.values());
}

// Returns { top, bottom } (each an array of analytics rows) or null if there
// isn't enough published/measured history yet to split meaningfully.
function selectTopAndBottom(sqliteModifier = '-180 days', groupSize = DEFAULT_GROUP_SIZE) {
  const perCampaign = latestPerCampaign(analyticsModel.sinceWithCampaignDetail(sqliteModifier));
  if (perCampaign.length < MIN_SAMPLE) return null;
  const sorted = [...perCampaign].sort((a, b) => performanceScore(b) - performanceScore(a));
  const n = Math.min(groupSize, Math.floor(sorted.length / 2));
  return { top: sorted.slice(0, n), bottom: sorted.slice(-n) };
}

// Joins an analytics row with the campaign's actual script_json/creative_json
// — the real hook/beats/visual choices that produced the performance number,
// which sinceWithCampaignDetail alone doesn't carry.
function detailFor(row) {
  const campaign = campaignsModel.findById(row.campaignId);
  if (!campaign) return null;
  let script = {};
  let creative = {};
  try { script = JSON.parse(campaign.scriptJson || '{}'); } catch { /* not scripted yet / legacy row */ }
  try { creative = JSON.parse(campaign.creativeJson || '{}'); } catch { /* no creative brief yet */ }
  return {
    campaignId: row.campaignId,
    platform: row.platform,
    pillar: pillarOf(row.strategyJson),
    views: row.views || 0,
    likes: row.likes || 0,
    comments: row.comments || 0,
    shares: row.shares || 0,
    hook: script.hookLine || null,
    beats: (script.beats || []).map((b) => `${b.visual || ''} — VO: "${b.voiceover || ''}" / on-screen: "${b.onScreenText || ''}"`),
    cta: script.ctaLine || null,
    visualStyle: creative.visualStyle || null,
    pacing: creative.pacing || null,
    onScreenTextStyle: creative.onScreenTextStyle || null,
    musicVibe: creative.musicVibe || null
  };
}

const SCHEMA = {
  type: 'object',
  properties: {
    patterns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          patternType: { type: 'string', enum: ['hook_style', 'pacing', 'visual_style', 'structure', 'audio', 'on_screen_text'] },
          description: { type: 'string', description: 'One concrete, mechanical finding a scriptwriter could directly act on, e.g. \'Hooks phrased as a direct question naming the specific pain point ("Still copy-pasting X?") outperform generic hype openers.\' Never describe topic/pack choice — only production mechanics.' },
          scopePlatform: { type: 'string', description: 'Exact platform value from the data this pattern is scoped to, or omit if it held across platforms.' },
          scopeContentPillar: { type: 'string', description: 'Exact content pillar value this pattern is scoped to, or omit if it held across pillars.' },
          confidence: { type: 'number', minimum: 0, maximum: 1, description: 'Calibrate to sample size — a pattern seen in 1-2 examples should be well under 0.5.' },
          performanceLiftPct: { type: 'number', description: 'Rough estimated percentage the top group outperforms the bottom group attributable to this element.' },
          supportingCampaignIds: { type: 'array', items: { type: 'number' }, description: 'Campaign IDs from the TOP group that exemplify this pattern.' }
        },
        required: ['patternType', 'description', 'confidence', 'supportingCampaignIds']
      }
    }
  },
  required: ['patterns']
};

const SYSTEM = `You are the Replication agent for ScripForge's short-form video system. social_insights already tells the team WHAT topic/angle worked; your job is to explain HOW the winning videos were actually made — the concrete production choices: exact hook phrasing/structure, cut pacing, visual style, beat ordering, CTA placement, on-screen text conventions. You are given the top-performing and bottom-performing published videos side by side, with their real hook/beats/CTA/visual-brief data and view counts. Compare the two groups directly and only report a pattern that plausibly explains part of the performance gap between them — with a thin or ambiguous sample, use low confidence rather than overclaiming, and never invent a pattern from a single example. Always include at least one hook_style finding describing the actual recurring phrasing/structure of the top group's hooks (not just "strong hooks work better") when hook lines are present in the data. Never report topic or featured-pack choice as a "pattern" — that's out of scope here. Output only via the submit_result tool.`;

function formatGroup(label, entries) {
  if (!entries.length) return `${label}: (no data)`;
  return `${label}:\n${entries
    .map((e) => `- Campaign #${e.campaignId} [${e.platform}, pillar: ${e.pillar}] — ${e.views} views, ${e.likes} likes, ${e.comments} comments, ${e.shares} shares
  Hook: ${e.hook || '(none)'}
  Beats: ${e.beats.length ? e.beats.join(' | ') : '(none)'}
  CTA: ${e.cta || '(none)'}
  Visual style: ${e.visualStyle || '(none)'} | Pacing: ${e.pacing || '(none)'} | On-screen text style: ${e.onScreenTextStyle || '(none)'} | Music vibe: ${e.musicVibe || '(none)'}`)
    .join('\n')}`;
}

function buildPrompt({ top, bottom }) {
  return `${formatGroup('## Top performers', top)}

${formatGroup('## Bottom performers', bottom)}

Identify the concrete production elements that correlate with the top group vs. the bottom group.`;
}

async function run({ sqliteModifier = '-180 days', groupSize = DEFAULT_GROUP_SIZE } = {}) {
  if (!isConfigured()) return { written: 0, reason: 'not_configured' };

  const selection = selectTopAndBottom(sqliteModifier, groupSize);
  if (!selection) return { written: 0, reason: `need at least ${MIN_SAMPLE} published campaigns with analytics data to split top vs. bottom performers` };

  const top = selection.top.map(detailFor).filter(Boolean);
  const bottom = selection.bottom.map(detailFor).filter(Boolean);
  if (!top.length || !bottom.length) return { written: 0, reason: 'no campaign detail (script/creative) available for the selected publications yet' };

  const result = await structured({ system: SYSTEM, prompt: buildPrompt({ top, bottom }), schema: SCHEMA, maxTokens: 2000 });

  let written = 0;
  for (const p of result.patterns) {
    contentPatternsModel.record({
      patternType: p.patternType,
      platform: p.scopePlatform || null,
      contentPillar: p.scopeContentPillar || null,
      description: p.description,
      confidence: p.confidence,
      supportingCampaignIds: p.supportingCampaignIds || [],
      avgPerformanceLift: typeof p.performanceLiftPct === 'number' ? p.performanceLiftPct : null
    });
    written += 1;
  }
  contentPatternsModel.retireStale('-120 days');
  return { written };
}

// Thin passthrough so a caller only needs to import replicationAgent, not
// both this and social/models/contentPatterns.js directly.
function patternsFor({ platform, contentPillar, patternType } = {}) {
  return contentPatternsModel.patternsFor({ platform, contentPillar, patternType });
}

module.exports = { run, patternsFor, selectTopAndBottom, detailFor, MIN_SAMPLE };

// INTEGRATION NOTES:
// - No cron entry exists yet for this agent (or its siblings visualStyleAgent.js,
//   audioPairingAgent.js, audienceRequestAgent.js — all in social/agents/).
//   social/scheduler.js currently calls analyticsLearningAgent.learn() on some
//   interval; add a similar low-frequency call (e.g. daily or weekly — this is
//   comparative analysis over accumulated history, not something that needs to
//   run every poll tick) to replicationAgent.run(), then the three siblings the
//   same way. All four return { written, reason? } like the existing agents.
// - To actually make new videos replicate winning elements, wire patternsFor()
//   into the two content-generation agents:
//     - social/agents/scriptAgent.js: in buildPrompt(), alongside how
//       strategyAgent already reads insightsModel.relevantTo(), read
//       replicationAgent.patternsFor({ platform, contentPillar: strategy.contentPillar,
//       patternType: 'hook_style' }) (and 'structure') and inject the
//       descriptions as "known winning patterns to replicate" — same pattern
//       strategyAgent.js:32-34 uses for insights.
//     - social/agents/creativeDirectionAgent.js: same idea with patternType
//       'pacing', 'visual_style', and 'on_screen_text' feeding its own prompt.
//   Neither agent file was touched here per the "don't edit existing
//   social/agents/ files" instruction.
// - server/routes/videoAdmin.js could expose contentPatternsModel.activeRecent()
//   next to the existing insights read endpoint, for a "Content DNA" panel in
//   the Video Studio Trend Intelligence tab (same read-only display role
//   insightsModel.activeRecent() already serves) — not wired here.
// - audienceRequestAgent.js currently no-ops: neither social/platforms/tiktok.js
//   nor social/platforms/youtube.js expose a way to fetch comment TEXT (both
//   only expose aggregate stats — fetchVideoStats/fetchStats). To make it
//   produce data, add a fetchComments(videoId) export to one or both (YouTube:
//   commentThreads.list on API_BASE; TikTok: no comment-read endpoint on the
//   Content Posting API used here — would need TikTok's separate Display API
//   or a different auth scope). Not implemented here since it's a real
//   external-API capability gap, not something this file can fake.
// - audioPairingAgent.js currently no-ops: it feature-detects
//   social/models/tiktokSignals.js exporting a trendingSounds() function,
//   which does not exist yet. Once a trending-sounds table/model is built
//   (mentioned as Tab 2 work), audioPairingAgent.run() will start producing
//   pattern_type: 'audio' rows automatically — no changes needed to this file.
// - visualStyleAgent.js needs ffmpeg reachable on PATH (video/pipeline/lib/render.mjs
//   already depends on it for rendering) and social_publications.output_path
//   pointing at a video file readable from this process — remote-only storage
//   would need a download step added there first.
