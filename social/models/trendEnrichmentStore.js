// CRUD for trend_enrichment — the persisted output of social/lib/trendEnrichment.js's
// second-layer analytics (cross-platform correlation, YouTube→TikTok arbitrage,
// seasonality, evergreen recurrence, Reddit sentiment, topic dedup clusters,
// and per-source forecast reliability weights). One generic table rather than
// seven bespoke ones: every kind is a fully-recomputable derived fact
// (subject + a headline score + a JSON payload of supporting detail), so a
// single shape covers all seven without forcing unrelated data into shared
// columns. Same "cheap to regenerate, so don't bother reconciling" philosophy
// as social/models/insights.js and social/models/trendSignalsStore.js.
const db = require('../db');

db.exec(`
  CREATE TABLE IF NOT EXISTS trend_enrichment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('correlation', 'arbitrage', 'seasonality', 'evergreen', 'sentiment', 'cluster', 'reliability')),
    subject TEXT NOT NULL,
    score REAL,
    data_json TEXT NOT NULL DEFAULT '{}',
    computed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_trend_enrichment_kind ON trend_enrichment(kind, score);
`);

const statements = {
  insert: db.prepare(`INSERT INTO trend_enrichment (kind, subject, score, data_json) VALUES (@kind, @subject, @score, @dataJson)`),
  deleteKind: db.prepare(`DELETE FROM trend_enrichment WHERE kind = @kind`),
  byKind: db.prepare(`SELECT * FROM trend_enrichment WHERE kind = @kind ORDER BY score DESC LIMIT @limit`),
  allLatest: db.prepare(`SELECT * FROM trend_enrichment ORDER BY kind ASC, score DESC`),
  latestComputedAt: db.prepare(`SELECT MAX(computed_at) AS latest FROM trend_enrichment WHERE kind = @kind`)
};

function parse(row) {
  let data = {};
  try { data = JSON.parse(row.data_json || '{}'); } catch { /* malformed row — treat as empty payload */ }
  return { id: row.id, kind: row.kind, subject: row.subject, score: row.score, data, computedAt: row.computed_at };
}

// Every enrichment kind is fully recomputed on each run (a topic that
// dropped out of the window, a cluster that no longer forms, a correlation
// that's gone stale should all vanish, not linger as a row nobody deletes),
// so a run always replaces the entire prior set for that kind rather than
// upserting row-by-row.
function replaceKind(kind, rows) {
  const run = db.transaction((items) => {
    statements.deleteKind.run({ kind });
    for (const item of items) {
      statements.insert.run({
        kind,
        subject: item.subject,
        score: item.score ?? null,
        dataJson: JSON.stringify(item.data ?? {})
      });
    }
  });
  run(rows);
  return rows.length;
}

function byKind(kind, limit = 50) {
  return statements.byKind.all({ kind, limit }).map(parse);
}

function allLatest() {
  return statements.allLatest.all().map(parse);
}

function latestComputedAt(kind) {
  return statements.latestComputedAt.get({ kind })?.latest || null;
}

module.exports = { replaceKind, byKind, allLatest, latestComputedAt };
