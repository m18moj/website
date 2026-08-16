// CRUD for tiktok_signals — real TikTok-native trend data captured by
// platforms/tiktokTrends.js (Creative Center's trending-hashtag and
// trending-sound charts), kept in its own table rather than social_trends
// because a 'hashtag'/'sound' row shape and TikTok's own rank/region axes
// don't map cleanly onto social_trends' generic (source, topic, score)
// shape built around YouTube/Reddit signal. Table is created here at module
// load (not in server/db.js) per this project's convention that each new
// table lives in its own model file.
const db = require('../db');

db.exec(`
  CREATE TABLE IF NOT EXISTS tiktok_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('hashtag', 'sound')),
    topic TEXT NOT NULL,
    score REAL NOT NULL DEFAULT 0,
    region TEXT NOT NULL DEFAULT 'US',
    raw_json TEXT,
    captured_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_tiktok_signals_captured_at ON tiktok_signals(captured_at);
  CREATE INDEX IF NOT EXISTS idx_tiktok_signals_kind ON tiktok_signals(kind);
`);

const statements = {
  insert: db.prepare(`INSERT INTO tiktok_signals (kind, topic, score, region, raw_json) VALUES (@kind, @topic, @score, @region, @rawJson)`),
  recent: db.prepare(`
    SELECT * FROM tiktok_signals
    WHERE kind = @kind AND captured_at >= datetime('now', @since)
    ORDER BY score DESC LIMIT @limit
  `),
  // Same earlier-half-vs-recent-half comparison as social/models/trends.js
  // momentum(), scoped per kind+region since a hashtag rank in the US and
  // one in Brazil aren't the same signal.
  dailyRollup: db.prepare(`
    SELECT date(captured_at) AS day, kind, region, topic, AVG(score) AS avgScore, MAX(score) AS maxScore
    FROM tiktok_signals
    WHERE captured_at >= datetime('now', @since)
    GROUP BY day, kind, region, topic
    ORDER BY day DESC
  `),
  purgeOld: db.prepare(`DELETE FROM tiktok_signals WHERE captured_at < datetime('now', '-365 days')`)
};

function record({ kind, topic, score = 0, region = 'US', raw = {} }) {
  statements.insert.run({ kind, topic, score, region, rawJson: JSON.stringify(raw) });
}

function recent(kind, limit = 20, sqliteModifier = '-3 days') {
  return statements.recent.all({ kind, limit, since: sqliteModifier });
}

function recentHashtags(limit = 20, sqliteModifier = '-3 days') {
  return recent('hashtag', limit, sqliteModifier);
}

function recentSounds(limit = 20, sqliteModifier = '-3 days') {
  return recent('sound', limit, sqliteModifier);
}

// Topics whose average score is trending up, comparing the earlier vs. more
// recent half of the window — same shape/rationale as
// social/models/trends.js momentum(), just scoped to a single topic per
// row instead of per-source, since here the entity of interest is the
// individual hashtag/sound rather than the whole feed.
function momentum(sqliteModifier = '-14 days') {
  const rows = statements.dailyRollup.all({ since: sqliteModifier });
  if (!rows.length) return [];
  const days = Array.from(new Set(rows.map((r) => r.day))).sort();
  if (days.length < 4) return [];
  const midpoint = days[Math.floor(days.length / 2)];

  const byTopic = new Map();
  for (const row of rows) {
    const key = `${row.kind}::${row.region}::${row.topic}`;
    if (!byTopic.has(key)) byTopic.set(key, { kind: row.kind, region: row.region, topic: row.topic, earlier: [], recent: [] });
    const bucket = byTopic.get(key);
    (row.day < midpoint ? bucket.earlier : bucket.recent).push(row.avgScore);
  }

  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const out = [];
  for (const { kind, region, topic, earlier, recent } of byTopic.values()) {
    if (earlier.length < 2 || recent.length < 2) continue;
    const earlierAvg = avg(earlier);
    const recentAvg = avg(recent);
    const changePct = earlierAvg > 0 ? Number((((recentAvg - earlierAvg) / earlierAvg) * 100).toFixed(1)) : 0;
    out.push({ kind, region, topic, earlierAvg: Number(earlierAvg.toFixed(2)), recentAvg: Number(recentAvg.toFixed(2)), changePct, direction: changePct > 5 ? 'rising' : changePct < -5 ? 'falling' : 'flat' });
  }
  return out.sort((a, b) => b.changePct - a.changePct);
}

function purgeOld() {
  statements.purgeOld.run();
}

module.exports = { record, recent, recentHashtags, recentSounds, momentum, purgeOld };
