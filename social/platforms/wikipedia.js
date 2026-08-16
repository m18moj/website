// Wikimedia's Pageviews REST API (wikimedia.org/api/rest_v1/metrics/pageviews)
// is official, documented, and public — no API key, just a descriptive
// User-Agent identifying the client, which Wikimedia's API etiquette policy
// requires (same reasoning as platforms/reddit.js's User-Agent requirement).
// Docs: https://wikimedia.org/api/rest_v1/#/Pageviews%20data
// Pulls a daily view-count series per configured article and surfaces it as
// a spike signal — a game/topic getting an unusual pageview bump on
// Wikipedia often means it just became newsworthy (patch, controversy,
// event), which is a different and earlier signal than YouTube view counts
// or Reddit upvotes. Never throws — resolves { ok:false, reason } on any
// failure, same convention as the other platforms/*.js clients.
const BASE = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';

const ARTICLES = (process.env.WIKIPEDIA_ARTICLES || 'Roblox,Fortnite,Minecraft')
  .split(',').map((s) => s.trim()).filter(Boolean);
const PROJECT = process.env.WIKIPEDIA_PROJECT || 'en.wikipedia';
const LOOKBACK_DAYS = Number(process.env.WIKIPEDIA_LOOKBACK_DAYS) || 14;
const USER_AGENT = process.env.WIKIPEDIA_USER_AGENT || 'scripforge-trend-scanner/1.0 (https://scripforge.net; contact via site)';

function formatDate(d) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function fetchArticleSeries(article, project) {
  const end = new Date();
  const start = new Date(end.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const url = `${BASE}/${project}/all-access/user/${encodeURIComponent(article)}/daily/${formatDate(start)}/${formatDate(end)}`;

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (res.status === 404) throw new Error('article not found');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  const items = data?.items || [];
  if (!items.length) throw new Error('no pageview data');

  const series = items.map((i) => ({ date: i.timestamp.slice(0, 8), views: i.views }));
  const latest = series[series.length - 1];
  const earlier = series.slice(0, -1);
  const earlierAvg = earlier.length ? earlier.reduce((sum, p) => sum + p.views, 0) / earlier.length : 0;
  const spikeRatio = earlierAvg > 0 ? Number((latest.views / earlierAvg).toFixed(2)) : null;

  return {
    topic: article,
    score: latest.views,
    latestViews: latest.views,
    earlierAvgViews: Number(earlierAvg.toFixed(1)),
    spikeRatio,
    raw: { project, series }
  };
}

async function fetchPageviewSpikes({ articles = ARTICLES, project = PROJECT } = {}) {
  if (!articles.length) return { ok: false, reason: 'no articles configured' };

  const items = [];
  const errors = [];
  for (const article of articles) {
    try {
      items.push(await fetchArticleSeries(article, project));
    } catch (err) {
      errors.push(`[${article}] ${err.message}`);
    }
  }

  if (!items.length) return { ok: false, reason: errors.join('; ') || 'no data returned' };
  return errors.length ? { ok: true, items, errors } : { ok: true, items };
}

module.exports = { fetchPageviewSpikes };

// INTEGRATION NOTES:
// - Add WIKIPEDIA_ARTICLES / WIKIPEDIA_PROJECT / WIKIPEDIA_LOOKBACK_DAYS /
//   WIKIPEDIA_USER_AGENT to env-var docs, mirroring REDDIT_* for
//   platforms/reddit.js. Defaults track Roblox/Fortnite/Minecraft with zero
//   configuration.
// - trendsAgent.refresh() should call fetchPageviewSpikes() and record()
//   each item into social/models/webSignals.js with source
//   'wikipedia_pageviews' (topic already carries the article name); items
//   whose spikeRatio is notably > 1 are the ones worth surfacing to
//   strategyAgent as "something happened" signals.
// - This is safe to run on the same cadence as the existing hourly trends
//   refresh — Wikimedia's pageviews API has no strict rate limit for
//   reasonable polling frequencies, unlike googleTrends.js.
