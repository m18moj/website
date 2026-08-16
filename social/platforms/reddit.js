// Reddit's read-only JSON endpoints (https://www.reddit.com/r/<sub>/top.json)
// require no OAuth for public subreddits — just a descriptive User-Agent, per
// Reddit's API rules, to avoid being lumped in with default-UA scraper
// traffic. This gives trendsAgent a second genuinely independent, real data
// source (community discussion signal) alongside YouTube's view-count signal,
// specifically scoped to the Roblox scripting/dev niche ScripForge sells
// into. Resolves to { ok:false, reason } rather than throwing, same
// convention as platforms/youtube.js and platforms/tiktok.js.
const config = require('../config');

const BASE = 'https://www.reddit.com';

async function fetchTopPosts({ subreddits = config.REDDIT.SUBREDDITS, timeframe = 'day', maxResults = 20 } = {}) {
  if (!subreddits.length) return { ok: false, reason: 'no subreddits configured' };
  const combined = subreddits.join('+');
  const url = `${BASE}/r/${encodeURIComponent(combined)}/top.json?t=${timeframe}&limit=${maxResults}`;

  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': config.REDDIT.USER_AGENT } });
  } catch (err) {
    return { ok: false, reason: err.message };
  }
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };

  let data;
  try {
    data = await res.json();
  } catch (err) {
    return { ok: false, reason: `invalid JSON response: ${err.message}` };
  }

  const children = data?.data?.children || [];
  return {
    ok: true,
    posts: children.map((c) => ({
      id: c.data.id,
      title: c.data.title,
      subreddit: c.data.subreddit,
      score: Number(c.data.score || 0),
      numComments: Number(c.data.num_comments || 0),
      permalink: `https://www.reddit.com${c.data.permalink}`,
      createdUtc: c.data.created_utc
    }))
  };
}

module.exports = { fetchTopPosts };
