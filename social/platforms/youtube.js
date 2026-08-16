// Real YouTube Data API v3 client: OAuth2 refresh, trending search (for
// trendsAgent), resumable video upload (for publishingAgent), and stats
// pulls (for analyticsLearningAgent). Endpoints/flow verified against
// Google's current docs (oauth2.googleapis.com token endpoint, the
// upload/youtube/v3/videos resumable protocol, videos.list). Every export
// resolves to { ok:false, reason:'not_configured' } rather than throwing
// when the required env vars are absent — see server/nowpayments.js for the
// same "silently unavailable, never crashes the caller" convention.
//
// uploadVideo/fetchStats/isConfigured take an optional trailing `account`
// argument — { id, credentials: { clientId, clientSecret, refreshToken } }
// from social/models/accounts.js — so the same client can upload as any
// number of connected channels. Omitted, they fall back to the single
// legacy channel configured via social/config.js's YOUTUBE env vars.
const fs = require('fs');
const path = require('path');
const config = require('../config');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://www.googleapis.com/youtube/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3/videos';

function credsFor(account) {
  if (account) {
    const c = account.credentials || {};
    return { clientId: c.clientId, clientSecret: c.clientSecret, refreshToken: c.refreshToken };
  }
  return { clientId: config.YOUTUBE.CLIENT_ID, clientSecret: config.YOUTUBE.CLIENT_SECRET, refreshToken: config.YOUTUBE.REFRESH_TOKEN };
}

function isConfigured(account) {
  const { clientId, clientSecret, refreshToken } = credsFor(account);
  return Boolean(clientId && clientSecret && refreshToken);
}

function hasApiKey() {
  return Boolean(config.YOUTUBE.API_KEY);
}

// Keyed by account id (or 'legacy') — each connected channel caches its own
// access token independently.
const tokenCache = new Map();

async function getAccessToken(account) {
  const cacheKey = account ? `account:${account.id}` : 'legacy';
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.accessToken;
  if (!isConfigured(account)) throw Object.assign(new Error('YouTube OAuth is not configured'), { code: 'not_configured' });

  const { clientId, clientSecret, refreshToken } = credsFor(account);
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const data = await res.json();
  if (!res.ok) throw new Error(`YouTube token refresh failed: ${data.error_description || data.error || res.status}`);

  const token = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  tokenCache.set(cacheKey, token);
  return token.accessToken;
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

// Niche-specific complement to fetchTrendingGaming's broad "Gaming" chart:
// a view-count-sorted search over recent uploads matching `query`, so
// trendsAgent can see what's resonating specifically within ScripForge's
// Roblox-scripting niche rather than gaming content in general. Two calls —
// search.list to find candidates (it doesn't return view counts), then
// videos.list to pull real statistics for them — same pattern as
// fetchTrendingGaming's shape so trendsAgent can treat both sources
// identically.
async function searchTopVideos({ query, regionCode = 'US', maxResults = 15, publishedAfterDays = 7 } = {}) {
  if (!hasApiKey()) return { ok: false, reason: 'not_configured' };

  const publishedAfter = new Date(Date.now() - publishedAfterDays * 24 * 60 * 60 * 1000).toISOString();
  const searchUrl = new URL(`${API_BASE}/search`);
  searchUrl.search = new URLSearchParams({
    part: 'id',
    q: query,
    type: 'video',
    order: 'viewCount',
    publishedAfter,
    regionCode,
    maxResults: String(maxResults),
    key: config.YOUTUBE.API_KEY
  }).toString();

  const searchRes = await fetch(searchUrl);
  const searchData = await searchRes.json();
  if (!searchRes.ok) return { ok: false, reason: searchData.error?.message || `HTTP ${searchRes.status}` };

  const ids = (searchData.items || []).map((item) => item.id?.videoId).filter(Boolean);
  if (!ids.length) return { ok: true, videos: [] };

  const statsUrl = new URL(`${API_BASE}/videos`);
  statsUrl.search = new URLSearchParams({ part: 'snippet,statistics', id: ids.join(','), key: config.YOUTUBE.API_KEY }).toString();
  const statsRes = await fetch(statsUrl);
  const statsData = await statsRes.json();
  if (!statsRes.ok) return { ok: false, reason: statsData.error?.message || `HTTP ${statsRes.status}` };

  return {
    ok: true,
    videos: (statsData.items || []).map((item) => ({
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
async function uploadVideo({ filePath, title, description, tags = [], privacyStatus = 'public', account }) {
  if (!isConfigured(account)) return { ok: false, reason: 'not_configured' };

  const accessToken = await getAccessToken(account);
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

async function fetchStats(videoId, account) {
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

module.exports = { isConfigured, hasApiKey, fetchTrendingGaming, searchTopVideos, uploadVideo, fetchStats };
