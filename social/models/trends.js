// CRUD for social_trends — refreshed by trendsAgent on a cron, read by
// strategyAgent when planning trend-driven campaigns.
const db = require('../db');

const statements = {
  insert: db.prepare(`INSERT INTO social_trends (source, topic, score, raw_json) VALUES (@source, @topic, @score, @rawJson)`),
  recent: db.prepare(`SELECT * FROM social_trends WHERE captured_at >= datetime('now', @since) ORDER BY score DESC LIMIT @limit`),
  // Coarse per-day/per-source rollup — raw captures are too granular (and,
  // for the LLM-synthesized source, too wordy/non-repeating) to read as a
  // trend line directly; count + avg/max score per day is the shape that
  // actually shows movement over time.
  dailyRollup: db.prepare(`
    SELECT date(captured_at) AS day, source, COUNT(*) AS captures, AVG(score) AS avgScore, MAX(score) AS maxScore
    FROM social_trends
    WHERE captured_at >= datetime('now', @since)
    GROUP BY day, source
    ORDER BY day DESC
  `),
  // Kept a full year (not the original 14 days) specifically so momentum()
  // below has enough history to compare against — a two-week window can
  // only ever say "trends exist", not "this is rising".
  purgeOld: db.prepare(`DELETE FROM social_trends WHERE captured_at < datetime('now', '-365 days')`)
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

// The actual "looks at trends over time" signal: splits the window in half
// by day and compares each source's average score in the earlier half
// against the recent half. This is only meaningful because captures now
// accumulate continuously (hourly refresh, see social/scheduler.js) and are
// retained for a year instead of two weeks — with only a few captures on
// each side of the split it stays silent (returns nothing for that source)
// rather than reporting a rising/falling direction it can't actually
// support, and gets more reliable the longer the system has been running.
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
