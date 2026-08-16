// Polls a configurable list of gaming-press RSS/Atom feeds for recent
// articles matching a keyword list — a game/mechanic getting press coverage
// is a distinct, often-earlier signal than community discussion (Reddit) or
// view counts (YouTube). No RSS parsing dependency exists in this project's
// package.json, so this uses a small regex-based extractor rather than
// adding one; it covers the common RSS 2.0 <item> and Atom <entry> shapes,
// which is sufficient for mainstream gaming-press feeds. Any feed that
// doesn't parse cleanly is skipped rather than thrown, same never-throw
// convention as platforms/reddit.js.
const FEEDS = (process.env.NEWS_RSS_FEEDS || 'https://www.pcgamer.com/rss/,https://kotaku.com/rss')
  .split(',').map((s) => s.trim()).filter(Boolean);
const KEYWORDS = (process.env.NEWS_RSS_KEYWORDS || 'roblox,exploit,script')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const LOOKBACK_HOURS = Number(process.env.NEWS_RSS_LOOKBACK_HOURS) || 72;
const USER_AGENT = process.env.NEWS_RSS_USER_AGENT || 'scripforge-trend-scanner/1.0 (https://scripforge.net; contact via site)';

function decodeEntities(str) {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim();
}

function extractTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeEntities(match[1]) : '';
}

function extractLink(block) {
  const withHref = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (withHref) return withHref[1];
  return extractTag(block, 'link');
}

function parseFeedItems(xml) {
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  return blocks.map((block) => ({
    title: extractTag(block, 'title'),
    link: extractLink(block),
    pubDate: extractTag(block, 'pubDate') || extractTag(block, 'published') || extractTag(block, 'updated'),
    description: extractTag(block, 'description') || extractTag(block, 'summary')
  })).filter((item) => item.title);
}

function matchedKeywords(item, keywords) {
  const haystack = `${item.title} ${item.description}`.toLowerCase();
  return keywords.filter((kw) => haystack.includes(kw));
}

async function fetchFeed(feedUrl, keywords, cutoff) {
  const res = await fetch(feedUrl, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const items = parseFeedItems(xml);

  const matches = [];
  for (const item of items) {
    const hits = matchedKeywords(item, keywords);
    if (!hits.length) continue;
    const published = item.pubDate ? new Date(item.pubDate) : null;
    if (published && !Number.isNaN(published.getTime()) && published.getTime() < cutoff) continue;
    matches.push({
      topic: item.title,
      score: hits.length,
      matchedKeywords: hits,
      raw: { feed: feedUrl, link: item.link, pubDate: item.pubDate, description: item.description }
    });
  }
  return matches;
}

async function fetchMatchingArticles({ feeds = FEEDS, keywords = KEYWORDS, lookbackHours = LOOKBACK_HOURS } = {}) {
  if (!feeds.length) return { ok: false, reason: 'no feeds configured' };
  if (!keywords.length) return { ok: false, reason: 'no keywords configured' };

  const cutoff = Date.now() - lookbackHours * 60 * 60 * 1000;
  const items = [];
  const errors = [];
  for (const feedUrl of feeds) {
    try {
      items.push(...(await fetchFeed(feedUrl, keywords, cutoff)));
    } catch (err) {
      errors.push(`[${feedUrl}] ${err.message}`);
    }
  }

  if (!items.length && errors.length === feeds.length) return { ok: false, reason: errors.join('; ') };
  return errors.length ? { ok: true, items, errors } : { ok: true, items };
}

module.exports = { fetchMatchingArticles };

// INTEGRATION NOTES:
// - Add NEWS_RSS_FEEDS / NEWS_RSS_KEYWORDS / NEWS_RSS_LOOKBACK_HOURS /
//   NEWS_RSS_USER_AGENT to env-var docs, mirroring REDDIT_* for
//   platforms/reddit.js. NEWS_RSS_FEEDS defaults to two general gaming-press
//   feeds as placeholders — swap in feeds actually scoped to Roblox/dev-tools
//   coverage before relying on this in production.
// - trendsAgent.refresh() should call fetchMatchingArticles() and record()
//   each item into social/models/webSignals.js with source 'news_rss' (topic
//   is the article title; raw.link/raw.feed identify where it came from).
// - The regex-based feed parser handles common RSS 2.0/Atom shapes but is not
//   a full XML parser — a feed with unusual nesting or namespaced tags may
//   yield partial/empty titles. If that turns out to matter for the feeds
//   actually configured, swap in a real XML parser dependency at that point.
