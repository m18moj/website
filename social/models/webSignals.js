// CRUD for web_signals — captures from the independent, non-platform trend
// sources in social/platforms/ (googleTrends.js, wikipedia.js,
// appStoreCharts.js, newsRss.js). Deliberately mirrors social/models/trends.js
// (same source/topic/score/captured_at shape, same record/recent/dailyRollup/
// momentum/purgeOld API) so a later pass can wire these sources into
// trendsAgent's refresh() and strategyAgent's prompt-building with minimal
// glue — swap `trendsModel` for `webSignalsModel` (or merge both result sets)
// rather than inventing a second read pattern.
//
// Owns its own table (CREATE TABLE IF NOT EXISTS at module load) rather than
// server/db.js, same convention social/models/forecasts.js and
// social/models/accounts.js already established for tables added after the
// initial schema.
const db = require('../db');

db.exec(`
  CREATE TABLE IF NOT EXISTS web_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    topic TEXT NOT NULL,
    score REAL NOT NULL DEFAULT 0,
    raw_json TEXT,
    captured_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_web_signals_captured_at ON web_signals(captured_at);
`);

const statements = {
  insert: db.prepare(`INSERT INTO web_signals (source, topic, score, raw_json) VALUES (@source, @topic, @score, @rawJson)`),
  recent: db.prepare(`SELECT * FROM web_signals WHERE captured_at >= datetime('now', @since) ORDER BY score DESC LIMIT @limit`),
  dailyRollup: db.prepare(`
    SELECT date(captured_at) AS day, source, COUNT(*) AS captures, AVG(score) AS avgScore, MAX(score) AS maxScore
    FROM web_signals
    WHERE captured_at >= datetime('now', @since)
    GROUP BY day, source
    ORDER BY day DESC
  `),
  purgeOld: db.prepare(`DELETE FROM web_signals WHERE captured_at < datetime('now', '-365 days')`)
};

function record({ source, topic, score = 0, raw = {} }) {
  statements.insert.run({ source, topic, score, rawJson: JSON.stringify(raw) });
}

function recent(limit = 10, sqliteModifier = '-3 days') {
  return statements.recent.all({ since: sqliteModifier, limit });
}

function dailyRollup(sqliteModifier = '-90 days') {
  return statements.dailyRollup.all({ since: sqliteModifier });
}

// Same earlier-half-vs-recent-half comparison as trendsModel.momentum() —
// kept identical on purpose so callers already integrated with trends
// momentum can point at this one too without learning a new shape.
function momentum(sqliteModifier = '-14 days') {
  const rows = statements.dailyRollup.all({ since: sqliteModifier });
  if (!rows.length) return [];
  const days = Array.from(new Set(rows.map((r) => r.day))).sort();
  if (days.length < 4) return [];
  const midpoint = days[Math.floor(days.length / 2)];

  const bySource = new Map();
  for (const row of rows) {
    if (!bySource.has(row.source)) bySource.set(row.source, { earlier: [], recent: [] });
    const bucket = bySource.get(row.source);
    (row.day < midpoint ? bucket.earlier : bucket.recent).push(row.avgScore);
  }

  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const out = [];
  for (const [source, { earlier, recent }] of bySource) {
    if (earlier.length < 2 || recent.length < 2) continue;
    const earlierAvg = avg(earlier);
    const recentAvg = avg(recent);
    const changePct = earlierAvg > 0 ? Number((((recentAvg - earlierAvg) / earlierAvg) * 100).toFixed(1)) : 0;
    out.push({
      source,
      earlierAvg: Number(earlierAvg.toFixed(2)),
      recentAvg: Number(recentAvg.toFixed(2)),
      changePct,
      direction: changePct > 5 ? 'rising' : changePct < -5 ? 'falling' : 'flat'
    });
  }
  return out.sort((a, b) => b.changePct - a.changePct);
}

function purgeOld() {
  statements.purgeOld.run();
}

module.exports = { record, recent, dailyRollup, momentum, purgeOld };

// INTEGRATION NOTES:
// - trendsAgent.refresh() (social/agents/trendsAgent.js) currently calls
//   youtube.fetchTrendingGaming / youtube.searchTopVideos / reddit.fetchTopPosts
//   and records each into social/models/trends.js. Add calls to the four new
//   platforms/{googleTrends,wikipedia,appStoreCharts,newsRss}.js fetchers the
//   same way, but record() their items into THIS model (web_signals), not
//   trends.js — the two tables intentionally stay separate so a bad/flaky new
//   source can't pollute the existing trends signal strategyAgent already
//   depends on. Once web_signals has accumulated real data, strategyAgent
//   (social/agents/strategyAgent.js) can additionally read
//   webSignalsModel.recent()/momentum() alongside trendsModel's, or the two
//   models can be merged into one query if that separation turns out not to
//   matter in practice.
// - No cron entry exists yet for calling the four new platform fetchers —
//   social/scheduler.js currently only triggers trendsAgent.refresh(). Either
//   fold the new fetchers into that same refresh() call, or add a second
//   scheduled job (e.g. refreshWebSignals()) on its own interval, since
//   Google Trends/App Store chart scraping should probably run less
//   frequently than the existing hourly trends refresh to avoid rate-limiting.
// - No new config keys were added to social/config.js — each platform file
//   reads its own env vars directly via process.env (see the top of each file
//   in social/platforms/ for the exact variable names and defaults). If this
//   project prefers all config centralized, those reads can be moved into a
//   new config.WEB_SIGNALS block later, but per the "don't touch
//   social/config.js" instruction that move is left to this integration pass.
