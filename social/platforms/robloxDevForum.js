// Content-opportunity signal: polls the Roblox DevForum's Announcements
// category for upcoming engine features/updates. The DevForum runs on
// Discourse, which serves a public JSON view of every category/topic by
// appending ".json" to its URL — no API key or auth needed for public
// categories, same as platforms/reddit.js's use of Reddit's public
// <subreddit>/top.json. Verified live against
// https://devforum.roblox.com/c/updates/announcements.json, which returns
// topic_list.topics with id/title/slug/created_at/views/like_count/tags.
// A new engine feature announced here is a leading indicator for "make a
// video about this new Roblox capability" content, ahead of it showing up as
// search/view volume elsewhere. Same { ok:false, reason } / { ok:true, items }
// convention, never throws.
//
// Env vars (read inline, not via social/config.js):
//   ROBLOX_DEVFORUM_USER_AGENT - descriptive User-Agent string sent with
//                               requests (Discourse/Roblox don't require a
//                               key, but a descriptive UA is good citizenship
//                               and mirrors REDDIT_USER_AGENT's convention).
//                               Optional, has a sane default.
const BASE = 'https://devforum.roblox.com';
const CATEGORY_PATH = '/c/updates/announcements.json';

function userAgent() {
  return process.env.ROBLOX_DEVFORUM_USER_AGENT || 'scripforge-devforum-scanner/1.0 (+https://scripforge.net)';
}

async function fetchAnnouncements({ maxResults = 20 } = {}) {
  const url = `${BASE}${CATEGORY_PATH}`;

  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': userAgent() } });
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

  const topics = data?.topic_list?.topics || [];
  return {
    ok: true,
    items: topics.slice(0, maxResults).map((t) => ({
      id: t.id,
      title: t.title,
      slug: t.slug,
      url: `${BASE}/t/${t.slug}/${t.id}`,
      views: Number(t.views || 0),
      likeCount: Number(t.like_count || 0),
      replyCount: Number(t.reply_count || 0),
      tags: t.tags || [],
      createdAt: t.created_at
    }))
  };
}

module.exports = { fetchAnnouncements };
