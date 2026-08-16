// Real TikTok Content Posting API v2 client: OAuth2 refresh, creator_info
// (required before every post), direct-post video init/upload, and status
// polling. Endpoints/flow verified against TikTok for Developers' current
// docs. Resolves to { ok:false, reason:'not_configured' } rather than
// throwing when env vars are absent, same convention as platforms/youtube.js.
//
// Note: TikTok caps unaudited apps' posts to "private viewing mode" and
// limits the init endpoint to 6 requests/minute per token — fine under this
// system's cadence (publish_due_posts runs every 5 minutes), but worth
// knowing if SOCIAL_EVERGREEN_PER_DAY is turned up a lot.
const fs = require('fs');
const config = require('../config');

const BASE = 'https://open.tiktokapis.com/v2';

function isConfigured() {
  const { CLIENT_KEY, CLIENT_SECRET, REFRESH_TOKEN } = config.TIKTOK;
  return Boolean(CLIENT_KEY && CLIENT_SECRET && REFRESH_TOKEN);
}

let cachedToken = null; // { accessToken, openId, expiresAt }

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken;
  if (!isConfigured()) throw Object.assign(new Error('TikTok OAuth is not configured'), { code: 'not_configured' });

  const body = new URLSearchParams({
    client_key: config.TIKTOK.CLIENT_KEY,
    client_secret: config.TIKTOK.CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: config.TIKTOK.REFRESH_TOKEN
  });
  const res = await fetch(`${BASE}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`TikTok token refresh failed: ${data.error_description || data.error || res.status}`);

  cachedToken = { accessToken: data.access_token, openId: data.open_id, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken;
}

async function creatorInfo() {
  if (!isConfigured()) return { ok: false, reason: 'not_configured' };
  const { accessToken } = await getAccessToken();
  const res = await fetch(`${BASE}/post/publish/creator_info/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' }
  });
  const data = await res.json();
  if (!res.ok || data.error?.code !== 'ok') return { ok: false, reason: data.error?.message || `HTTP ${res.status}` };
  return { ok: true, ...data.data };
}

// Direct-post via FILE_UPLOAD: init reserves an upload_url, then the whole
// file is PUT as a single chunk — vertical short-form clips are small enough
// (well under TikTok's per-chunk cap) that multi-chunk splitting isn't
// needed here.
async function publishVideo({ filePath, title, privacyLevel = 'PUBLIC_TO_EVERYONE', disableComment = false, disableDuet = false, disableStitch = false }) {
  if (!isConfigured()) return { ok: false, reason: 'not_configured' };

  const { accessToken } = await getAccessToken();
  const fileBuffer = fs.readFileSync(filePath);

  const initRes = await fetch(`${BASE}/post/publish/video/init/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      post_info: {
        title: title.slice(0, 2200),
        privacy_level: privacyLevel,
        disable_comment: disableComment,
        disable_duet: disableDuet,
        disable_stitch: disableStitch
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: fileBuffer.length,
        chunk_size: fileBuffer.length,
        total_chunk_count: 1
      }
    })
  });
  const initData = await initRes.json();
  if (!initRes.ok || initData.error?.code !== 'ok') return { ok: false, reason: initData.error?.message || `HTTP ${initRes.status}` };

  const { publish_id: publishId, upload_url: uploadUrl } = initData.data;

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes 0-${fileBuffer.length - 1}/${fileBuffer.length}`
    },
    body: fileBuffer
  });
  if (!uploadRes.ok) return { ok: false, reason: `video upload failed: HTTP ${uploadRes.status}` };

  return { ok: true, publishId };
}

// Poll after publishVideo() until status is a terminal value
// (PUBLISH_COMPLETE / FAILED) — TikTok processes asynchronously, so the
// caller (social/scheduler.js publish_due_posts, or a dedicated poll job) is
// expected to call this on an interval rather than treating publishVideo's
// return as final.
async function fetchPublishStatus(publishId) {
  if (!isConfigured()) return { ok: false, reason: 'not_configured' };
  const { accessToken } = await getAccessToken();
  const res = await fetch(`${BASE}/post/publish/status/fetch/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ publish_id: publishId })
  });
  const data = await res.json();
  if (!res.ok || data.error?.code !== 'ok') return { ok: false, reason: data.error?.message || `HTTP ${res.status}` };
  return { ok: true, status: data.data.status, publiclyAvailablePostId: data.data.publicaly_available_post_id || data.data.publicly_available_post_id || null };
}

// Stats for our own already-posted videos, via the Video Query API. Needs
// the `video.list` scope in addition to `video.publish` on the token minted
// by social/scripts/tiktok-oauth-setup.js — up to 20 ids per call.
async function fetchVideoStats(videoIds) {
  if (!isConfigured()) return { ok: false, reason: 'not_configured' };
  const { accessToken } = await getAccessToken();
  const res = await fetch(`${BASE}/video/query/?fields=id,like_count,comment_count,share_count,view_count`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ filters: { video_ids: videoIds.slice(0, 20) } })
  });
  const data = await res.json();
  if (!res.ok || data.error?.code !== 'ok') return { ok: false, reason: data.error?.message || `HTTP ${res.status}` };
  return {
    ok: true,
    videos: (data.data.videos || []).map((v) => ({
      id: v.id,
      views: v.view_count || 0,
      likes: v.like_count || 0,
      comments: v.comment_count || 0,
      shares: v.share_count || 0
    }))
  };
}

module.exports = { isConfigured, creatorInfo, publishVideo, fetchPublishStatus, fetchVideoStats };
