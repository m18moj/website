// Twitch Helix API (https://dev.twitch.tv/docs/api/reference) — top games by
// concurrent viewer count, plus clip-creation velocity for a given game, as
// a leading indicator: a game climbing Twitch's top-games list or seeing a
// burst of new clips often surfaces as short-form video demand before it
// shows up in YouTube/TikTok view counts. Uses the standard app access token
// (client credentials) flow, cached until near expiry. Same
// { ok:false, reason } / { ok:true, items } convention as platforms/reddit.js;
// never throws.
//
// Env vars (read inline, not via social/config.js):
//   TWITCH_CLIENT_ID     - from the Twitch Developer Console. Required.
//   TWITCH_CLIENT_SECRET - from the Twitch Developer Console. Required.
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const API_BASE = 'https://api.twitch.tv/helix';

function clientId() {
  return process.env.TWITCH_CLIENT_ID || null;
}

function clientSecret() {
  return process.env.TWITCH_CLIENT_SECRET || null;
}

function isConfigured() {
  return Boolean(clientId() && clientSecret());
}

let tokenCache = null;

async function getAppAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.accessToken;
  if (!isConfigured()) throw Object.assign(new Error('Twitch client credentials not configured'), { code: 'not_configured' });

  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: 'client_credentials'
  });
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const data = await res.json();
  if (!res.ok) throw new Error(`Twitch token request failed: ${data.message || res.status}`);

  tokenCache = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return tokenCache.accessToken;
}

async function helixGet(path, params) {
  const accessToken = await getAppAccessToken();
  const url = new URL(`${API_BASE}${path}`);
  url.search = params.toString();
  return fetch(url, {
    headers: { 'Client-Id': clientId(), Authorization: `Bearer ${accessToken}` }
  });
}

async function fetchTopGames({ maxResults = 20 } = {}) {
  if (!isConfigured()) return { ok: false, reason: 'not_configured' };

  let res;
  try {
    res = await helixGet('/games/top', new URLSearchParams({ first: String(Math.min(Math.max(maxResults, 1), 100)) }));
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

  // Helix's /games/top ranks by concurrent viewers but doesn't return the
  // count itself — rank position (index) is used as the ordering signal,
  // consistent with how Twitch's own front page presents this list.
  return {
    ok: true,
    items: (data.data || []).map((g, index) => ({ id: g.id, name: g.name, rank: index + 1, boxArtUrl: g.box_art_url }))
  };
}

// Clip-creation velocity for a specific game over the trailing window —
// counts clips whose created_at falls in [now - lookbackHours, now]. Requires
// the caller to already know the game's Twitch id (e.g. from fetchTopGames,
// or Twitch's game search) since Helix clips are queried by id, not name.
async function fetchClipVelocity({ gameId, lookbackHours = 24, maxResults = 100 }) {
  if (!isConfigured()) return { ok: false, reason: 'not_configured' };
  if (!gameId) return { ok: false, reason: 'gameId is required' };

  const startedAt = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
  const endedAt = new Date().toISOString();

  let res;
  try {
    res = await helixGet('/clips', new URLSearchParams({
      game_id: gameId,
      started_at: startedAt,
      ended_at: endedAt,
      first: String(Math.min(Math.max(maxResults, 1), 100))
    }));
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

  const clips = data.data || [];
  const totalViews = clips.reduce((sum, c) => sum + Number(c.view_count || 0), 0);
  return {
    ok: true,
    gameId,
    windowHours: lookbackHours,
    clipCount: clips.length,
    velocityPerHour: Number((clips.length / lookbackHours).toFixed(2)),
    totalViews
  };
}

module.exports = { isConfigured, fetchTopGames, fetchClipVelocity };
