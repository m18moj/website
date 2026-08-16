// Real YouTube Data API v3 client: OAuth2 refresh, trending search (for
// trendsAgent), resumable video upload (for publishingAgent), and stats
// pulls (for analyticsLearningAgent). Endpoints/flow verified against
// Google's current docs (oauth2.googleapis.com token endpoint, the
// upload/youtube/v3/videos resumable protocol, videos.list). Every export
// resolves to { ok:false, reason:'not_configured' } rather than throwing
// when the required env vars are absent — see server/nowpayments.js for the
// same "silently unavailable, never crashes the caller" convention.
const fs = require('fs');
const path = require('path');
const config = require('../config');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://www.googleapis.com/youtube/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3/videos';

function isConfigured() {
  const { CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN } = config.YOUTUBE;
  return Boolean(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN);
}

function hasApiKey() {
  return Boolean(config.YOUTUBE.API_KEY);
}

let cachedToken = null; // { accessToken, expiresAt }

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.accessToken;
  if (!isConfigured()) throw Object.assign(new Error('YouTube OAuth is not configured'), { code: 'not_configured' });

  const body = new URLSearchParams({
    client_id: config.YOUTUBE.CLIENT_ID,
    client_secret: config.YOUTUBE.CLIENT_SECRET,
    refresh_token: config.YOUTUBE.REFRESH_TOKEN,
    grant_type: 'refresh_token'
  });
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const data = await res.json();
  if (!res.ok) throw new Error(`YouTube token refresh failed: ${data.error_description || data.error || res.status}`);

  cachedToken = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.accessToken;
}

const MIME_BY_EXT = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm' };

function guessMime(filePath) {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] || 'video/mp4';
}

// Gaming category (videoCategoryId=20), used by trendsAgent to see what's
// currently resonating so strategyAgent can consider trend-jacking.
async function fetchTrendingGaming({ regionCode = 'US', maxResults = 15 } = {}) {
  if (!hasApiKey()) return { ok: false, reason: 'not_configured' };
  const url = new URL(`${API_BASE}/videos`);
  url.search = new URLSearchParams({
    part: 'snippet,statistics',
    chart: 'mostPopular',
    videoCategoryId: '20',
    regionCode,
    maxResults: String(maxResults),
    key: config.YOUTUBE.API_KEY
  }).toString();

  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) return { ok: false, reason: data.error?.message || `HTTP ${res.status}` };
  return {
    ok: true,
    videos: (data.items || []).map((item) => ({
      id: item.id,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      tags: item.snippet.tags || [],
      viewCount: Number(item.statistics.viewCount || 0)
    }))
  };
}

// Resumable upload: (1) POST metadata to reserve a session URI, (2) PUT the
// file bytes to that URI. Shorts convention (vertical video, <=3min,
// "#Shorts" in title/description) is the caller's responsibility via the
// metadata it passes in — this function just performs the upload mechanics.
async function uploadVideo({ filePath, title, description, tags = [], privacyStatus = 'public' }) {
  if (!isConfigured()) return { ok: false, reason: 'not_configured' };

  const accessToken = await getAccessToken();
  const fileBuffer = fs.readFileSync(filePath);
  const mime = guessMime(filePath);

  const metadata = {
    snippet: { title: title.slice(0, 100), description: description.slice(0, 5000), tags: tags.slice(0, 15), categoryId: '20' },
    status: { privacyStatus, selfDeclaredMadeForKids: false }
  };

  const sessionRes = await fetch(`${UPLOAD_BASE}?uploadType=resumable&part=snippet,status`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mime,
      'X-Upload-Content-Length': String(fileBuffer.length)
    },
    body: JSON.stringify(metadata)
  });
  if (!sessionRes.ok) {
    const errBody = await sessionRes.text();
    return { ok: false, reason: `session init failed: HTTP ${sessionRes.status} ${errBody}` };
  }
  const uploadUrl = sessionRes.headers.get('location');
  if (!uploadUrl) return { ok: false, reason: 'no resumable session URI returned' };

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': mime,
      'Content-Length': String(fileBuffer.length)
    },
    body: fileBuffer
  });
  const uploadData = await uploadRes.json();
  if (!uploadRes.ok) return { ok: false, reason: uploadData.error?.message || `HTTP ${uploadRes.status}` };

  return { ok: true, videoId: uploadData.id, url: `https://www.youtube.com/shorts/${uploadData.id}` };
}

async function fetchStats(videoId) {
  if (!hasApiKey()) return { ok: false, reason: 'not_configured' };
  const url = new URL(`${API_BASE}/videos`);
  url.search = new URLSearchParams({ part: 'statistics', id: videoId, key: config.YOUTUBE.API_KEY }).toString();
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !data.items?.length) return { ok: false, reason: data.error?.message || 'video not found' };
  const stats = data.items[0].statistics;
  return {
    ok: true,
    views: Number(stats.viewCount || 0),
    likes: Number(stats.likeCount || 0),
    comments: Number(stats.commentCount || 0),
    raw: stats
  };
}

module.exports = { isConfigured, hasApiKey, fetchTrendingGaming, uploadVideo, fetchStats };
