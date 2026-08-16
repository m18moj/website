// X/Twitter trend signal via the official X API v2 recent-search endpoint
// (https://api.twitter.com/2/tweets/search/recent). X removed the old free
// v1.1 trends/place endpoint; there is no free "give me trending topics"
// call left, so this uses the best available documented free/low-tier path
// instead: recent-search (available starting on the Basic tier, and to Free
// tier for a v2 App-only Bearer token with tight rate limits) filtered to a
// configurable set of gaming/Roblox queries, with engagement (like+retweet+
// reply+quote count) summed per extracted hashtag as the "trending" score.
// This mirrors platforms/reddit.js's shape: no trends/place access required,
// same { ok:false, reason } / { ok:true, items } convention, resolves rather
// than throws.
//
// Env vars (read inline, not via social/config.js):
//   TWITTER_BEARER_TOKEN   - App-only Bearer token from the X Developer
//                            Portal (developer.x.com). Required.
//   TWITTER_SEARCH_QUERIES - comma-separated search queries, e.g.
//                            "roblox script,roblox exploit,roblox scripting"
//                            (default below covers ScripForge's niche).
const DEFAULT_QUERIES = ['roblox script', 'roblox exploit', 'roblox scripting', 'roblox dev'];
const BASE = 'https://api.twitter.com/2/tweets/search/recent';

function bearerToken() {
  return process.env.TWITTER_BEARER_TOKEN || null;
}

function isConfigured() {
  return Boolean(bearerToken());
}

function queries() {
  const raw = process.env.TWITTER_SEARCH_QUERIES;
  if (!raw) return DEFAULT_QUERIES;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function extractHashtags(text) {
  const matches = text.match(/#\w+/g) || [];
  return matches.map((h) => h.toLowerCase());
}

async function searchOne(query, maxResults, token) {
  const url = new URL(BASE);
  url.search = new URLSearchParams({
    query: `${query} -is:retweet lang:en`,
    max_results: String(Math.min(Math.max(maxResults, 10), 100)),
    'tweet.fields': 'public_metrics,created_at'
  }).toString();

  let res;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    return { ok: false, reason: err.message };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false, reason: `HTTP ${res.status} ${body}`.trim() };
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    return { ok: false, reason: `invalid JSON response: ${err.message}` };
  }

  return { ok: true, tweets: data.data || [] };
}

// Runs the configured queries and rolls tweets up into per-hashtag/topic
// trend items (falls back to the query itself as the topic when a tweet has
// no hashtags), scored by summed engagement across matching tweets.
async function fetchTrendingTopics({ maxResultsPerQuery = 25 } = {}) {
  if (!isConfigured()) return { ok: false, reason: 'not_configured' };
  const token = bearerToken();

  const byTopic = new Map();
  let anyOk = false;
  const errors = [];

  for (const query of queries()) {
    const result = await searchOne(query, maxResultsPerQuery, token);
    if (!result.ok) {
      errors.push(`${query}: ${result.reason}`);
      continue;
    }
    anyOk = true;
    for (const tweet of result.tweets) {
      const metrics = tweet.public_metrics || {};
      const engagement = Number(metrics.like_count || 0) + Number(metrics.retweet_count || 0)
        + Number(metrics.reply_count || 0) + Number(metrics.quote_count || 0);
      const topics = extractHashtags(tweet.text || '');
      const keys = topics.length ? topics : [query];
      for (const topic of keys) {
        const entry = byTopic.get(topic) || { topic, score: 0, sampleTweetIds: [] };
        entry.score += engagement;
        if (entry.sampleTweetIds.length < 5) entry.sampleTweetIds.push(tweet.id);
        byTopic.set(topic, entry);
      }
    }
  }

  if (!anyOk) return { ok: false, reason: errors.join('; ') || 'no queries returned results' };
  return { ok: true, items: Array.from(byTopic.values()).sort((a, b) => b.score - a.score) };
}

module.exports = { isConfigured, fetchTrendingTopics };
