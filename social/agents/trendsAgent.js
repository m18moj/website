// Refreshes social_trends. Real signal where a real API is realistically
// obtainable — YouTube Data API's gaming "most popular" chart, via a plain
// API key — and, since TikTok's own trend-discovery APIs require an
// approved Research API grant most small businesses can't get, an LLM
// synthesis step that reasons over the YouTube signal plus general
// short-form-gaming-content knowledge to propose TikTok-relevant angles.
// That synthesis is clearly labeled as its own `source` value so
// strategyAgent (and anyone reading social_trends directly) never confuses
// it with a directly-measured platform metric.
const llm = require('./llm');
const youtube = require('../platforms/youtube');
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

const SYSTEM = `You are the Trends agent for ScripForge, a game-script/developer-tools marketplace. Given real current YouTube gaming trending signal, propose short-form video angle ideas plausible for TikTok's gaming/dev-tools niche right now. Be specific (name mechanics, games, or formats), not generic. Output only via the submit_result tool.`;

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

  if (llm.isConfigured()) {
    const prompt = trending.ok
      ? `Current top gaming videos on YouTube right now:\n${trending.videos.slice(0, 10).map((v) => `- ${v.title} (${v.viewCount.toLocaleString()} views)`).join('\n')}\n\nPropose TikTok-relevant angles a game-script/dev-tools marketplace could use.`
      : `No fresh YouTube trending data available right now. Propose TikTok-relevant angles for a game-script/dev-tools marketplace based on general current short-form gaming content patterns.`;

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
