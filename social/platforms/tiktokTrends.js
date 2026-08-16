// A real, native TikTok trend source — as opposed to social/agents/trendsAgent.js's
// current workaround of synthesizing TikTok angles from YouTube+Reddit data,
// because TikTok's official Research API isn't reachable by this project.
// This module pulls from TikTok Creative Center's own trending-hashtag and
// trending-sound charts (ads.tiktok.com/creative_radar_api) — the same
// public marketing data Creative Center shows advertisers, not the gated
// Research API.
//
// IMPORTANT — verified live on 2026-08-17: unauthenticated requests to
// these endpoints (any params, any region) now return
// {"code":40101,"msg":"no permission"}. TikTok's own help docs as of July
// 2026 confirm Creative Center's Trends tools now require "Log in to
// Creative Center" first. So this is no longer a fully public,
// no-auth endpoint the way it was in 2023-2024 — but it's still a
// materially lower bar than the Research API: any ordinary TikTok account
// can log into Creative Center, no business/app review needed, and the
// resulting browser session cookie is enough to read these charts.
//
// So: this module authenticates via a captured session cookie
// (TIKTOK_CC_COOKIE) rather than OAuth. Until that's set, every function
// below resolves { ok: false, reason: 'not configured' } — same
// never-throw, { ok, reason } convention as platforms/reddit.js and
// platforms/tiktok.js — so the rest of the pipeline degrades cleanly with
// zero setup, and starts returning real data the moment a cookie is added.
//
// To obtain a cookie: log into https://ads.tiktok.com/business/creativecenter
// in a browser with any TikTok account, open devtools > Network, find any
// creative_radar_api request, and copy its full Cookie request header into
// TIKTOK_CC_COOKIE. These sessions expire (observed: a few weeks), so it
// will need periodic refreshing — see INTEGRATION NOTES below for where
// that should surface as a health signal.
//
// Response field names below (hashtagName/rank/videoViews for hashtags;
// title/authorName/rank for sounds) are TikTok's last publicly-documented
// creative_radar_api shape. They could not be re-verified against a live
// authenticated response while building this (no session cookie available
// in this environment) — parsing is deliberately defensive (tries several
// plausible key names, falls back to raw item id/index) so a shape drift
// degrades to a slightly-worse topic label rather than a thrown error, and
// the full raw item is always kept in `raw` so nothing is lost either way.

const BASE = 'https://ads.tiktok.com/creative_radar_api/v1/popular_trend';

function cookie() {
  return process.env.TIKTOK_CC_COOKIE || null;
}

function defaultRegion() {
  return process.env.TIKTOK_CC_REGION || 'US';
}

async function callCreativeRadar(path, params) {
  const sessionCookie = cookie();
  if (!sessionCookie) return { ok: false, reason: 'not configured' };

  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}/${path}?${qs}`;

  let res;
  try {
    res = await fetch(url, {
      headers: {
        Cookie: sessionCookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'application/json'
      }
    });
  } catch (err) {
    return { ok: false, reason: err.message };
  }
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };

  let json;
  try {
    json = await res.json();
  } catch (err) {
    return { ok: false, reason: `invalid JSON response: ${err.message}` };
  }

  if (json.code !== 0 && json.code !== undefined) {
    return { ok: false, reason: `TikTok Creative Center error ${json.code}: ${json.msg || 'unknown'}` };
  }

  const list = json?.data?.list || json?.data?.items || [];
  return { ok: true, list };
}

function firstDefined(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

async function fetchTrendingHashtags({ region = defaultRegion(), period = 7, industry = '', maxResults = 20 } = {}) {
  const params = { page: 1, limit: maxResults, period, country_code: region };
  if (industry) params.industry_id = industry;

  const result = await callCreativeRadar('hashtag/list', params);
  if (!result.ok) return result;

  return {
    ok: true,
    hashtags: result.list.slice(0, maxResults).map((item, i) => ({
      name: firstDefined(item.hashtag_name, item.hashtagName, item.name, `unknown_${i}`),
      rank: firstDefined(item.rank, item.ranking, i + 1),
      videoViews: Number(firstDefined(item.video_views, item.videoViews, item.publish_cnt, item.publishCnt, 0)),
      region,
      raw: item
    }))
  };
}

async function fetchTrendingSounds({ region = defaultRegion(), period = 7, maxResults = 20 } = {}) {
  const params = { page: 1, limit: maxResults, period, country_code: region };

  const result = await callCreativeRadar('music/list', params);
  if (!result.ok) return result;

  return {
    ok: true,
    sounds: result.list.slice(0, maxResults).map((item, i) => ({
      title: firstDefined(item.title, item.music_name, item.name, `unknown_${i}`),
      author: firstDefined(item.author, item.author_name, item.authorName, null),
      rank: firstDefined(item.rank, item.ranking, i + 1),
      videoViews: Number(firstDefined(item.video_views, item.videoViews, item.related_cnt, 0)),
      region,
      raw: item
    }))
  };
}

module.exports = { fetchTrendingHashtags, fetchTrendingSounds };

// INTEGRATION NOTES:
// - Add TIKTOK_CC_COOKIE (required) and optionally TIKTOK_CC_REGION (default
//   'US') to social/.env / social/config.js's TIKTOK block once that file is
//   next touched — this file reads process.env directly for now since
//   social/config.js is off-limits for this change.
// - social/agents/trendsAgent.js's refresh() should add this as a fourth
//   real source alongside youtube_trending_gaming, youtube_search_roblox,
//   and reddit_roblox: call fetchTrendingHashtags() and
//   fetchTrendingSounds() from social/platforms/tiktokTrends.js, and for
//   each `ok` result record every item via
//   social/models/tiktokSignals.js's record({ kind: 'hashtag'|'sound',
//   topic: name/title, score: videoViews, region, raw }) — mirroring how
//   trendsAgent.js already calls trendsModel.record() for youtube/reddit
//   results. Also fold a summarized block of the hashtag/sound names into
//   the signalBlocks array passed to the llm_synthesis_tiktok prompt, since
//   this is the one source in that prompt that's actually TikTok-native
//   rather than inferred from YouTube/Reddit.
// - social/scheduler.js should call tiktokSignals.purgeOld() on the same
//   cadence social_trends is purged, and trigger a refresh (e.g. hourly,
//   matching the existing trend refresh cadence) that calls both
//   fetchTrendingHashtags() and fetchTrendingSounds() for each configured
//   region and pushes results into tiktokSignals.record(). If
//   TIKTOK_CC_COOKIE isn't set, both calls resolve { ok:false,
//   reason:'not configured' } immediately (no network call, no throw), so
//   wiring this into the scheduler unconditionally is safe even before
//   anyone sets the cookie.
// - Session cookies expire (observed on the order of a few weeks). Whatever
//   wires the scheduler tick should log (or surface in the admin dashboard,
//   alongside the existing health signals in server/routes/videoAdmin.js)
//   when fetchTrendingHashtags()/fetchTrendingSounds() start returning
//   ok:false with a reason other than 'not configured' — that's the signal
//   the cookie needs refreshing, not that the feature is broken.
// - The field-name parsing in this file (hashtag_name/rank/video_views etc.)
//   is best-effort against TikTok's last publicly-documented
//   creative_radar_api response shape and could not be verified live (no
//   session cookie available while building this). First integration pass
//   should sanity-check a real authenticated response's field names against
//   the `raw` object stored on each tiktok_signals row and adjust the
//   firstDefined(...) fallbacks in fetchTrendingHashtags/fetchTrendingSounds
//   above if TikTok's actual field names differ.
