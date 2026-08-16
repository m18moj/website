// CRUD for trend_overrides — an admin's manual say-so layered on top of the
// automated trend/forecast pipeline (social/agents/trendsAgent.js,
// trendForecastAgent.js). Two modes: 'always_pursue' pins a topic so it's
// flagged as a standing priority regardless of what the automated scoring
// says about it right now, and 'blocklist' hides a topic from
// trend-jacking surfaces entirely (e.g. a topic that's technically trending
// but off-brand, legally risky, or just not something this store wants to
// associate with). Matching is substring-based, not exact — real trend
// topics are full video titles/post titles ("Roblox Doors update BREAKS
// the game"), so an admin overriding on "Doors" needs to catch every title
// that mentions it, not just an identical string.
//
// Table owned entirely by this file, per the project's one-table-per-file
// convention (see social/models/trends.js, social/models/accounts.js).
const db = require('../db');

db.exec(`
  CREATE TABLE IF NOT EXISTS trend_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    normalized_topic TEXT NOT NULL UNIQUE,
    topic TEXT NOT NULL,
    mode TEXT NOT NULL CHECK(mode IN ('always_pursue', 'blocklist')),
    reason TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const columns = `
  id, normalized_topic AS normalizedTopic, topic, mode, reason,
  created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
`;

const statements = {
  upsert: db.prepare(`
    INSERT INTO trend_overrides (normalized_topic, topic, mode, reason, created_by)
    VALUES (@normalizedTopic, @topic, @mode, @reason, @createdBy)
    ON CONFLICT(normalized_topic) DO UPDATE SET
      topic = excluded.topic, mode = excluded.mode, reason = excluded.reason,
      created_by = excluded.created_by, updated_at = datetime('now')
  `),
  findById: db.prepare(`SELECT ${columns} FROM trend_overrides WHERE id = ?`),
  findByNormalizedTopic: db.prepare(`SELECT ${columns} FROM trend_overrides WHERE normalized_topic = ?`),
  list: db.prepare(`SELECT ${columns} FROM trend_overrides ORDER BY mode ASC, updated_at DESC`),
  remove: db.prepare(`DELETE FROM trend_overrides WHERE id = ?`)
};

function normalize(topic) {
  return String(topic || '').trim().toLowerCase();
}

function upsert({ topic, mode, reason = null, createdBy = null }) {
  const normalizedTopic = normalize(topic);
  statements.upsert.run({ normalizedTopic, topic: topic.trim(), mode, reason, createdBy });
  return statements.findByNormalizedTopic.get(normalizedTopic);
}

function list() {
  return statements.list.all();
}

function remove(id) {
  statements.remove.run(id);
}

// Whether `candidateTopic` (a real trend/forecast topic string) matches any
// stored override, in either direction — the override's topic appears in
// the candidate, or vice versa — so a short pinned/blocked term ("Doors")
// matches a long real title ("Roblox Doors update BREAKS the game") and a
// long override phrase still matches a shorter topic that contains it.
// Returns the override's mode ('always_pursue' | 'blocklist') or null.
// Accepts a pre-fetched `overrides` list to avoid re-querying in a loop.
function classify(candidateTopic, overrides = null) {
  const rows = overrides || list();
  if (!rows.length) return null;
  const candidate = normalize(candidateTopic);
  if (!candidate) return null;
  const hit = rows.find((o) => candidate.includes(o.normalizedTopic) || o.normalizedTopic.includes(candidate));
  return hit ? hit.mode : null;
}

module.exports = { upsert, list, remove, classify, normalize };

// INTEGRATION NOTES:
// - New table `trend_overrides`, owned entirely by this file — no schema
//   changes needed anywhere else.
// - Currently read by server/routes/trendInsights.js (GET /rising and
//   GET /alerts, both filter out 'blocklist' topics and surface
//   'always_pursue' ones first) and written by server/routes/trendOverrides.js.
// - Read by the automated pipeline: orchestrator.js runStrategy() calls
//   trendOverridesModel.list() and passes the result into
//   strategyAgent.run(). strategyAgent.js formats overrides as
//   '[always_pursue]'/'[blocklist]' lines in its prompt and instructs the
//   LLM to respect them — never pursue a blocklisted topic, strongly prefer
//   always_pursue topics when they fit.
