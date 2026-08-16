// Two responsibilities, kept in one module because they're two halves of
// the same feedback loop the user asked for as a single "analytics/learning"
// agent: collect() pulls real stats for published posts from each platform;
// learn() periodically has Claude synthesize those stats (joined with the
// strategy/creative choices that produced them, via social/models/analytics
// sinceWithCampaign) into reusable social_insights that strategyAgent and
// publishingAgent read back on the next campaign — this is what makes the
// system actually optimize over time instead of repeating itself.
const llm = require('./llm');
const youtube = require('../platforms/youtube');
const tiktok = require('../platforms/tiktok');
const publicationsModel = require('../models/publications');
const analyticsModel = require('../models/analytics');
const insightsModel = require('../models/insights');
const campaignsModel = require('../models/campaigns');
const scorecardModel = require('../models/scorecard');

// Same threshold predictionAgent's caller (social/orchestrator.js runQa)
// gates on — duplicated here rather than imported to avoid a circular
// require (orchestrator already requires this module), same convention as
// MIN_POPULARITY_SCORE's existing duplication into server/routes/videoAdmin.js.
const MIN_POPULARITY_SCORE = 60;

async function collect() {
  const recent = publicationsModel.listPublishedSince('-14 days');
  const tiktokPosts = recent.filter((p) => p.platform === 'tiktok' && p.platformPostId);
  const youtubePosts = recent.filter((p) => p.platform === 'youtube_shorts' && p.platformPostId);

  let collected = 0;

  if (tiktokPosts.length) {
    const result = await tiktok.fetchVideoStats(tiktokPosts.map((p) => p.platformPostId));
    if (result.ok) {
      for (const video of result.videos) {
        const pub = tiktokPosts.find((p) => p.platformPostId === video.id);
        if (!pub) continue;
        analyticsModel.record(pub.id, { views: video.views, likes: video.likes, comments: video.comments, shares: video.shares, raw: video });
        collected += 1;
      }
    }
  }

  for (const pub of youtubePosts) {
    const result = await youtube.fetchStats(pub.platformPostId);
    if (result.ok) {
      analyticsModel.record(pub.id, { views: result.views, likes: result.likes, comments: result.comments, raw: result.raw });
      collected += 1;
    }
  }

  return { collected };
}

const SCHEMA = {
  type: 'object',
  properties: {
    insights: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          scope: { type: 'string', description: '"global", "platform:tiktok", "platform:youtube_shorts", or "pack:<packId>".' },
          insight: { type: 'string', description: 'One concrete, actionable finding, e.g. "before/after framing outperforms tutorial-style for Roblox packs".' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          bestHourUtc: { type: 'number', minimum: 0, maximum: 23, description: 'Only when scope is platform-specific and the data supports a time-of-day recommendation; omit otherwise.' }
        },
        required: ['scope', 'insight', 'confidence']
      }
    }
  },
  required: ['insights']
};

const SYSTEM = `You are the Learning half of ScripForge's Analytics/Learning agent. Given recent campaign strategy/creative choices joined with their real performance stats, extract concrete, actionable insights for future campaigns to act on. Only report a finding if the data plausibly supports it — with little data, say so with low confidence rather than overclaiming. Output only via the submit_result tool.`;

function buildPrompt(rows) {
  if (!rows.length) return 'No published campaigns with analytics data yet — return an empty insights array.';
  const lines = rows
    .slice(0, 60)
    .map((r) => `- [${r.platform}${r.packId ? `, pack:${r.packId}` : ''}] captured ${r.captured_at}: ${r.views} views, ${r.likes} likes, ${r.comments} comments, ${r.shares} shares`);
  return `Recent performance data (most recent first):\n${lines.join('\n')}\n\nSynthesize reusable insights for future campaigns.`;
}

async function learn() {
  if (!llm.isConfigured()) return { written: 0, reason: 'not_configured' };

  const rows = analyticsModel.sinceWithCampaign('-30 days');
  const result = await llm.structured({ system: SYSTEM, prompt: buildPrompt(rows), schema: SCHEMA });

  for (const item of result.insights) {
    insightsModel.record({
      scope: item.scope,
      insight: item.insight,
      confidence: item.confidence,
      supportingData: typeof item.bestHourUtc === 'number' ? { bestHourUtc: item.bestHourUtc } : {}
    });
  }
  insightsModel.retireStale('-60 days');
  return { written: result.insights.length };
}

function pillarOf(strategyJson) {
  try { return JSON.parse(strategyJson || '{}').contentPillar || 'unknown'; } catch { return 'unknown'; }
}

// Real views are a raw number with no fixed scale, but predictionAgent's
// score is 0-100 relative to history — so grading a prediction means putting
// the actual outcome on the same relative footing: 50 means "performed
// exactly at this pillar's historical average", above/below scales from
// there. Capped at 100 so one outlier viral post doesn't blow the scale out;
// floored at 0 for symmetry.
function actualScoreFor(views, baselineAvg) {
  if (baselineAvg <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((views / baselineAvg) * 50)));
}

// Grades every published campaign's pre-publish popularity prediction against
// what actually happened, once its analytics have had a few days to settle.
// This is the reward/punish step: each resolution writes a scorecard row
// that predictionAgent reads back into its own prompt on the next call (see
// summarizeTrackRecord there), so a run of bad calls visibly lowers its
// stated confidence before the next prediction rather than silently
// repeating the same miscalibration forever.
function resolvePredictions() {
  const pending = campaignsModel.awaitingPredictionResolution('-3 days');
  if (!pending.length) return { resolved: 0 };

  const history = analyticsModel.sinceWithCampaignDetail('-180 days');
  const byPillar = new Map();
  for (const row of history) {
    const pillar = pillarOf(row.strategyJson);
    if (!byPillar.has(pillar)) byPillar.set(pillar, []);
    byPillar.get(pillar).push(row);
  }

  let resolved = 0;
  for (const campaign of pending) {
    const prediction = JSON.parse(campaign.predictionJson);
    const pub = publicationsModel.findByCampaignId(campaign.id);
    const snapshot = pub ? analyticsModel.latestForPublication(pub.id) : null;

    if (!snapshot) {
      campaignsModel.setPredictionOutcome(campaign.id, 'inconclusive');
      scorecardModel.record({ agent: 'popularity_prediction', subjectType: 'campaign', subjectId: campaign.id, outcome: 'inconclusive', predictedValue: prediction.score, actualValue: null, reward: 0, notes: 'Published but no analytics snapshot collected yet.' });
      resolved += 1;
      continue;
    }

    const pillar = pillarOf(campaign.strategyJson);
    // Baseline excludes this campaign's own publication so it isn't
    // compared against itself.
    const comparableViews = (byPillar.get(pillar) || []).filter((r) => r.campaignId !== campaign.id).map((r) => r.views || 0);
    const baselineAvg = comparableViews.length ? comparableViews.reduce((a, b) => a + b, 0) / comparableViews.length : 0;
    const actualScore = actualScoreFor(snapshot.views, baselineAvg);

    if (actualScore === null) {
      campaignsModel.setPredictionOutcome(campaign.id, 'inconclusive');
      scorecardModel.record({ agent: 'popularity_prediction', subjectType: 'campaign', subjectId: campaign.id, outcome: 'inconclusive', predictedValue: prediction.score, actualValue: null, reward: 0, notes: `No comparable published campaigns yet in content pillar "${pillar}" to baseline against.` });
      resolved += 1;
      continue;
    }

    const predictedPass = prediction.score >= MIN_POPULARITY_SCORE;
    const actualPass = actualScore >= 50;
    const correct = predictedPass === actualPass;
    const confidence = typeof prediction.confidence === 'number' ? prediction.confidence : 0.5;
    const outcome = correct ? 'correct' : 'incorrect';
    const notes = `Predicted ${prediction.score}/100 (${predictedPass ? 'pass' : 'fail'}); actual ${snapshot.views.toLocaleString()} views vs. pillar "${pillar}" baseline ${Math.round(baselineAvg).toLocaleString()} -> normalized ${actualScore}/100 (${actualPass ? 'pass' : 'fail'}).`;

    campaignsModel.setPredictionOutcome(campaign.id, outcome);
    scorecardModel.record({
      agent: 'popularity_prediction',
      subjectType: 'campaign',
      subjectId: campaign.id,
      outcome,
      predictedValue: prediction.score,
      actualValue: actualScore,
      reward: correct ? confidence : -confidence,
      notes
    });
    resolved += 1;
  }

  return { resolved };
}

module.exports = { collect, learn, resolvePredictions };
