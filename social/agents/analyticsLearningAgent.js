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

module.exports = { collect, learn };
