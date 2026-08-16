// CRUD for content_patterns — the "content DNA" table. social_insights
// (social/models/insights.js) already captures WHAT topic/angle worked;
// this captures HOW a winning video was actually made: hook phrasing,
// pacing, visual style, structural beat ordering, on-screen text
// conventions, audio choice, and recurring audience requests mined from
// comments. Written by social/agents/replicationAgent.js (and its sibling
// mining agents), read back by whichever agent is wired to steer new
// scripts/creative briefs toward replicating winning elements (see
// replicationAgent.js's INTEGRATION NOTES for the hookup).
//
// Owns its own table (CREATE TABLE IF NOT EXISTS at module load) rather than
// server/db.js, same convention social/models/webSignals.js, forecasts.js,
// and accounts.js already established for tables added after the initial
// schema.
const db = require('../db');

db.exec(`
  CREATE TABLE IF NOT EXISTS content_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_type TEXT NOT NULL,
    platform TEXT,
    content_pillar TEXT,
    pattern_description TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.5,
    supporting_campaign_ids_json TEXT,
    avg_performance_lift REAL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_content_patterns_active ON content_patterns(active, pattern_type);
`);

const columns = `
  id, pattern_type AS patternType, platform, content_pillar AS contentPillar,
  pattern_description AS patternDescription, confidence, supporting_campaign_ids_json AS supportingCampaignIdsJson,
  avg_performance_lift AS avgPerformanceLift, active, created_at AS createdAt
`;

const statements = {
  insert: db.prepare(`
    INSERT INTO content_patterns (pattern_type, platform, content_pillar, pattern_description, confidence, supporting_campaign_ids_json, avg_performance_lift)
    VALUES (@patternType, @platform, @contentPillar, @patternDescription, @confidence, @supportingCampaignIdsJson, @avgPerformanceLift)
  `),
  // Sentinel '__none__' for unset platform/contentPillar mirrors
  // social/models/insights.js's relevantTo() trick: a real column value never
  // equals the sentinel, so "column IS NULL OR column = @param" only ever
  // matches global (NULL) rows when the caller didn't scope the query.
  patternsFor: db.prepare(`
    SELECT ${columns} FROM content_patterns
    WHERE active = 1
      AND (platform IS NULL OR platform = @platform)
      AND (content_pillar IS NULL OR content_pillar = @contentPillar)
      AND (@patternType = '__none__' OR pattern_type = @patternType)
    ORDER BY confidence DESC, created_at DESC
    LIMIT @limit
  `),
  activeRecent: db.prepare(`SELECT ${columns} FROM content_patterns WHERE active = 1 ORDER BY created_at DESC LIMIT @limit`),
  deactivateOlderThan: db.prepare(`UPDATE content_patterns SET active = 0 WHERE created_at < datetime('now', @cutoff)`)
};

function record({ patternType, platform = null, contentPillar = null, description, confidence = 0.5, supportingCampaignIds = [], avgPerformanceLift = null }) {
  statements.insert.run({
    patternType,
    platform: platform || null,
    contentPillar: contentPillar || null,
    patternDescription: description,
    confidence,
    supportingCampaignIdsJson: JSON.stringify(supportingCampaignIds || []),
    avgPerformanceLift: typeof avgPerformanceLift === 'number' ? avgPerformanceLift : null
  });
}

// What scriptAgent/creativeDirectionAgent would read before writing a new
// video for this platform/pillar — active, most-confident patterns first,
// optionally narrowed to one pattern_type (e.g. 'hook_style').
function patternsFor({ platform = null, contentPillar = null, patternType = null, limit = 20 } = {}) {
  return statements.patternsFor.all({
    platform: platform || '__none__',
    contentPillar: contentPillar || '__none__',
    patternType: patternType || '__none__',
    limit
  });
}

// All active patterns regardless of scope, most recent first — for an admin
// panel read view, same role as insightsModel.activeRecent().
function activeRecent(limit = 30) {
  return statements.activeRecent.all({ limit });
}

// Patterns are cheap to regenerate from campaign history, same rationale as
// social_insights — old ones are retired rather than accumulated forever.
function retireStale(sqliteModifier = '-120 days') {
  statements.deactivateOlderThan.run({ cutoff: sqliteModifier });
}

module.exports = { record, patternsFor, activeRecent, retireStale };
