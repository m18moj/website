// Chart-rank tracking for Roblox (or any other configured app) across both
// mobile stores, so a jump in chart position — a leading indicator of a
// broader spike in interest — shows up before it's visible in YouTube/Reddit
// content volume.
//
// Apple: rss.applemarketingtools.com is Apple's own official, documented,
// public "RSS Feed Generator" API (https://rss.applemarketingtools.com/) —
// no API key, returns a ranked JSON array for any country/chart/genre.
// Google Play: has no equivalent official public API, so this falls back to
// scraping a store "collection" listing page and reading off app ordering
// from the `/store/apps/details?id=...` links in the returned HTML, in the
// order they first appear. This is inherently fragile (Play Store markup can
// change at any time without notice) — it's wrapped defensively and any
// parse failure degrades to a per-store `errors` entry rather than throwing,
// same never-throw convention as platforms/reddit.js.
const APPLE_FEED_URL = 'https://rss.applemarketingtools.com/api/v2';
const PLAY_COLLECTION_URL = 'https://play.google.com/store/apps/collection';

const APPLE_APPS = (process.env.APPSTORE_APPLE_APPS || 'Roblox').split(',').map((s) => s.trim()).filter(Boolean);
const APPLE_COUNTRY = process.env.APPSTORE_APPLE_COUNTRY || 'us';
const APPLE_CHART = process.env.APPSTORE_APPLE_CHART || 'top-free';
// Apple's feed generator 500s above 100 despite documentation implying
// higher limits work — verified empirically (100 succeeds, 150+ fails).
const APPLE_LIMIT = Number(process.env.APPSTORE_APPLE_LIMIT) || 100;

const PLAY_APP_IDS = (process.env.APPSTORE_PLAY_APP_IDS || 'com.roblox.client').split(',').map((s) => s.trim()).filter(Boolean);
const PLAY_COUNTRY = process.env.APPSTORE_PLAY_COUNTRY || 'us';
const PLAY_COLLECTION = process.env.APPSTORE_PLAY_COLLECTION || 'topselling_free';

function scoreForRank(rank, ceiling) {
  return rank ? Math.max(0, ceiling - rank + 1) : 0;
}

async function fetchAppleTopChart({ apps = APPLE_APPS, country = APPLE_COUNTRY, chart = APPLE_CHART, limit = APPLE_LIMIT } = {}) {
  if (!apps.length) return { ok: false, reason: 'no apps configured' };

  const url = `${APPLE_FEED_URL}/${country}/apps/${chart}/${limit}/apps.json`;
  let res;
  try {
    res = await fetch(url);
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

  const results = data?.feed?.results || [];
  const items = [];
  for (const appName of apps) {
    const index = results.findIndex((r) => (r.name || '').toLowerCase().includes(appName.toLowerCase()));
    if (index === -1) continue;
    const rank = index + 1;
    items.push({
      topic: appName,
      store: 'apple_app_store',
      rank,
      score: scoreForRank(rank, limit),
      raw: { country, chart, entry: results[index] }
    });
  }
  return { ok: true, items };
}

async function fetchGooglePlayTopChart({ appIds = PLAY_APP_IDS, country = PLAY_COUNTRY, collection = PLAY_COLLECTION } = {}) {
  if (!appIds.length) return { ok: false, reason: 'no app ids configured' };

  const url = `${PLAY_COLLECTION_URL}/${collection}?hl=en&gl=${encodeURIComponent(country)}`;
  let html;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; scripforge-trend-scanner/1.0)' } });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    html = await res.text();
  } catch (err) {
    return { ok: false, reason: err.message };
  }

  let ordered;
  try {
    const seen = new Set();
    ordered = [];
    for (const match of html.matchAll(/\/store\/apps\/details\?id=([a-zA-Z0-9._]+)/g)) {
      const id = match[1];
      if (!seen.has(id)) {
        seen.add(id);
        ordered.push(id);
      }
    }
    if (!ordered.length) throw new Error('no app ids found in listing page (markup may have changed)');
  } catch (err) {
    return { ok: false, reason: err.message };
  }

  const items = [];
  for (const appId of appIds) {
    const index = ordered.indexOf(appId);
    if (index === -1) continue;
    const rank = index + 1;
    items.push({
      topic: appId,
      store: 'google_play',
      rank,
      score: scoreForRank(rank, ordered.length),
      raw: { country, collection, listingSize: ordered.length }
    });
  }
  return { ok: true, items };
}

async function fetchChartRanks(opts = {}) {
  const [apple, play] = await Promise.all([
    fetchAppleTopChart(opts.apple),
    fetchGooglePlayTopChart(opts.play)
  ]);

  const items = [...(apple.ok ? apple.items : []), ...(play.ok ? play.items : [])];
  const errors = [];
  if (!apple.ok) errors.push(`apple: ${apple.reason}`);
  if (!play.ok) errors.push(`google_play: ${play.reason}`);

  if (!apple.ok && !play.ok) return { ok: false, reason: errors.join('; ') };
  return errors.length ? { ok: true, items, errors } : { ok: true, items };
}

module.exports = { fetchAppleTopChart, fetchGooglePlayTopChart, fetchChartRanks };

// INTEGRATION NOTES:
// - Add APPSTORE_APPLE_APPS / APPSTORE_APPLE_COUNTRY / APPSTORE_APPLE_CHART /
//   APPSTORE_APPLE_LIMIT / APPSTORE_PLAY_APP_IDS / APPSTORE_PLAY_COUNTRY /
//   APPSTORE_PLAY_COLLECTION to env-var docs, mirroring REDDIT_* for
//   platforms/reddit.js. Defaults track Roblox on both stores with zero
//   configuration.
// - trendsAgent.refresh() should call fetchChartRanks() and record() each
//   item into social/models/webSignals.js with source 'apple_app_store' /
//   'google_play' (item.store already distinguishes them, or use it directly
//   as the source value).
// - fetchGooglePlayTopChart's HTML-scrape approach WILL eventually break
//   silently (returns { ok:false }, never throws) when Google changes Play
//   Store markup — whatever cron/monitoring wraps the scheduler should not
//   treat isolated { ok:false } from this one source as a hard failure.
