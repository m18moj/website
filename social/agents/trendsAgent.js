// Refreshes social_trends from multiple independent sources so the system
// isn't reasoning off a single signal: YouTube's broad "Gaming" chart, a
// YouTube search scoped specifically to Roblox (the niche ScripForge sells
// into, which the broad gaming chart mostly won't surface), and Reddit's
// Roblox/dev subreddits (community discussion signal, not just view counts —
// a topic can be trending as a conversation before it shows up as high-view
// video content). An LLM synthesis step then reasons over all three real
// signals plus general short-form-content knowledge to propose TikTok-
// specific angles, since TikTok's own trend-discovery APIs require an
// approved Research API grant most small businesses can't get. That
// synthesis is clearly labeled as its own `source` value so strategyAgent
// (and anyone reading social_trends directly) never confuses it with a
// directly-measured platform metric.
const llm = require('./llm');
const youtube = require('../platforms/youtube');
const reddit = require('../platforms/reddit');
const trendsModel = require('../models/trends');

const SYNTHESIS_SCHEMA = {
  type: 'object',
  properties: {
    tiktokAngles: {
      type: 'array',
      items: { type: 'object', properties: { topic: { type: 'string' }, score: { type: 'number', minimum: 0, maximum: 1 } }, required: ['topic', 'score'] },
      minItems: 3,
      maxItems: 8
    }
  },
  required: ['tiktokAngles']
};

const SYSTEM = `You are the Trends agent for ScripForge, a game-script/developer-tools marketplace. Given real current YouTube gaming trending signal, Roblox-specific YouTube search signal, and Reddit community discussion signal, propose short-form video angle ideas plausible for TikTok's gaming/dev-tools niche right now. Be specific (name mechanics, games, or formats), not generic. Output only via the submit_result tool.`;

async function refresh() {
  const results = [];

  const trending = await youtube.fetchTrendingGaming({ maxResults: 15 });
  if (trending.ok) {
    for (const video of trending.videos) {
      const record = { source: 'youtube_trending_gaming', topic: video.title, score: video.viewCount, raw: video };
      trendsModel.record(record);
      results.push(record);
    }
  }

  const robloxSearch = await youtube.searchTopVideos({ query: 'roblox script exploit', maxResults: 15, publishedAfterDays: 7 });
  if (robloxSearch.ok) {
    for (const video of robloxSearch.videos) {
      const record = { source: 'youtube_search_roblox', topic: video.title, score: video.viewCount, raw: video };
      trendsModel.record(record);
      results.push(record);
    }
  }

  const redditPosts = await reddit.fetchTopPosts({ timeframe: 'day', maxResults: 20 });
  if (redditPosts.ok) {
    for (const post of redditPosts.posts) {
      const record = { source: 'reddit_roblox', topic: post.title, score: post.score, raw: post };
      trendsModel.record(record);
      results.push(record);
    }
  }

  if (llm.isConfigured()) {
    const signalBlocks = [];
    if (trending.ok) {
      signalBlocks.push(`YouTube gaming trending chart:\n${trending.videos.slice(0, 10).map((v) => `- ${v.title} (${v.viewCount.toLocaleString()} views)`).join('\n')}`);
    }
    if (robloxSearch.ok && robloxSearch.videos.length) {
      signalBlocks.push(`Recent high-view Roblox videos on YouTube:\n${robloxSearch.videos.slice(0, 10).map((v) => `- ${v.title} (${v.viewCount.toLocaleString()} views)`).join('\n')}`);
    }
    if (redditPosts.ok && redditPosts.posts.length) {
      signalBlocks.push(`Top posts today in r/${redditPosts.posts[0].subreddit} and related Roblox subreddits:\n${redditPosts.posts.slice(0, 10).map((p) => `- ${p.title} (${p.score} upvotes, ${p.numComments} comments)`).join('\n')}`);
    }

    const prompt = signalBlocks.length
      ? `${signalBlocks.join('\n\n')}\n\nPropose TikTok-relevant angles a game-script/dev-tools marketplace could use, drawing on whichever signal above is most specific/actionable.`
      : `No fresh trend data available right now from any source. Propose TikTok-relevant angles for a game-script/dev-tools marketplace based on general current short-form gaming content patterns.`;

    const synthesis = await llm.structured({ system: SYSTEM, prompt, schema: SYNTHESIS_SCHEMA });
    for (const { topic, score } of synthesis.tiktokAngles) {
      const record = { source: 'llm_synthesis_tiktok', topic, score, raw: {} };
      trendsModel.record(record);
      results.push(record);
    }
  }

  trendsModel.purgeOld();
  return results;
}

module.exports = { refresh };
