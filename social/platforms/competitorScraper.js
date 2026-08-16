// Read-only public data fetchers for competitor tracking — no OAuth, no
// write scopes, never touches ScripForge's own posting credentials
// (platforms/tiktok.js / platforms/youtube.js are untouched by this file).
//
// YouTube: reuses the same public Data API v3 key platforms/youtube.js
// already uses for trend discovery (config.YOUTUBE.API_KEY), just scoped to
// a specific competitor channel's uploads instead of a keyword search.
//
// TikTok: the Content Posting API only ever exposes the token's own
// account — there is no public, authenticated endpoint for a third party's
// channel. Competitor video lists instead come from parsing the same
// embedded JSON (`__UNIVERSAL_DATA_FOR_REHYDRATION__`) TikTok's own web
// client hydrates from when a profile page loads. This is unofficial and can
// break if TikTok changes that page's structure — every function here
// resolves to { ok:false, reason } rather than throwing, same convention as
// platforms/youtube.js and platforms/reddit.js, so a broken scrape just
// skips that channel's refresh instead of crashing the job.
const config = require('../config');

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';
const TIKTOK_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function hasYouTubeKey() {
  return Boolean(config.YOUTUBE.API_KEY);
}

// Resolves an @handle (what a human adds a competitor by) to the channelId
// competitor_channels/competitor_videos actually key on — channels.list
// supports forHandle directly, so this avoids needing the operator to dig up
// the raw UC... id themselves.
async function resolveYouTubeChannelId(handle) {
  if (!hasYouTubeKey()) return { ok: false, reason: 'not_configured' };
  const cleanHandle = handle.startsWith('@') ? handle : `@${handle}`;
  const url = new URL(`${YT_API_BASE}/channels`);
  url.search = new URLSearchParams({ part: 'id', forHandle: cleanHandle, key: config.YOUTUBE.API_KEY }).toString();

  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) return { ok: false, reason: data.error?.message || `HTTP ${res.status}` };
  const channelId = data.items?.[0]?.id;
  if (!channelId) return { ok: false, reason: 'no channel found for that handle' };
  return { ok: true, channelId };
}

// Recent uploads + stats for one channel. Every channel has a hidden
// "uploads" playlist whose id is its channelId with the UC prefix swapped
// for UU — pulling that playlist is far cheaper (in API quota) than
// search.list for a simple "list this channel's videos" query, same
// uploads-playlist trick YouTube's own docs recommend for this exact case.
async function fetchYouTubeChannelVideos({ channelId, maxResults = 15 } = {}) {
  if (!hasYouTubeKey()) return { ok: false, reason: 'not_configured' };
  if (!channelId || !channelId.startsWith('UC')) return { ok: false, reason: 'channelId must be a UC... channel id (see resolveYouTubeChannelId)' };

  const uploadsPlaylistId = `UU${channelId.slice(2)}`;
  const playlistUrl = new URL(`${YT_API_BASE}/playlistItems`);
  playlistUrl.search = new URLSearchParams({
    part: 'contentDetails',
    playlistId: uploadsPlaylistId,
    maxResults: String(maxResults),
    key: config.YOUTUBE.API_KEY
  }).toString();

  const playlistRes = await fetch(playlistUrl);
  const playlistData = await playlistRes.json();
  if (!playlistRes.ok) return { ok: false, reason: playlistData.error?.message || `HTTP ${playlistRes.status}` };

  const ids = (playlistData.items || []).map((item) => item.contentDetails?.videoId).filter(Boolean);
  if (!ids.length) return { ok: true, videos: [] };

  const statsUrl = new URL(`${YT_API_BASE}/videos`);
  statsUrl.search = new URLSearchParams({ part: 'snippet,statistics', id: ids.join(','), key: config.YOUTUBE.API_KEY }).toString();
  const statsRes = await fetch(statsUrl);
  const statsData = await statsRes.json();
  if (!statsRes.ok) return { ok: false, reason: statsData.error?.message || `HTTP ${statsRes.status}` };

  return {
    ok: true,
    videos: (statsData.items || []).map((item) => ({
      id: item.id,
      title: item.snippet.title,
      publishedAt: item.snippet.publishedAt,
      views: Number(item.statistics.viewCount || 0),
      likes: Number(item.statistics.likeCount || 0),
      comments: Number(item.statistics.commentCount || 0)
    }))
  };
}

// Parses a TikTok profile page's embedded hydration JSON for that user's
// recent posts. Wrapped end-to-end so any shape change (TikTok ships new
// frontend bundles often) degrades to { ok:false, reason } instead of
// throwing and taking down whatever job called this.
async function fetchTikTokUserVideos({ handle, maxResults = 15 } = {}) {
  if (!handle) return { ok: false, reason: 'handle is required' };
  const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;

  let res;
  try {
    res = await fetch(`https://www.tiktok.com/@${encodeURIComponent(cleanHandle)}`, {
      headers: { 'User-Agent': TIKTOK_UA, 'Accept-Language': 'en-US,en;q=0.9' }
    });
  } catch (err) {
    return { ok: false, reason: err.message };
  }
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };

  let html;
  try {
    html = await res.text();
  } catch (err) {
    return { ok: false, reason: `failed to read profile page body: ${err.message}` };
  }

  const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return { ok: false, reason: 'could not find embedded profile data (TikTok page structure may have changed, or the profile is private/blocked/does not exist)' };

  let parsed;
  try {
    parsed = JSON.parse(match[1]);
  } catch (err) {
    return { ok: false, reason: `failed to parse embedded profile data: ${err.message}` };
  }

  const scope = parsed?.__DEFAULT_SCOPE__ || {};
  const itemList = scope['webapp.user-post']?.itemList || scope['webapp.user-detail']?.itemList || [];
  if (!Array.isArray(itemList) || !itemList.length) {
    // Page loaded fine but the initial payload didn't include posts (can
    // happen for low-activity or newly-created profiles) — not an error.
    return { ok: true, videos: [] };
  }

  return {
    ok: true,
    videos: itemList.slice(0, maxResults).map((item) => ({
      id: item.id,
      title: item.desc || '',
      publishedAt: item.createTime ? new Date(Number(item.createTime) * 1000).toISOString() : null,
      views: Number(item.stats?.playCount || 0),
      likes: Number(item.stats?.diggCount || 0),
      comments: Number(item.stats?.commentCount || 0)
    }))
  };
}

module.exports = { hasYouTubeKey, resolveYouTubeChannelId, fetchYouTubeChannelVideos, fetchTikTokUserVideos };
