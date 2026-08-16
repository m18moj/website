// CRUD for social_insights — the optimization feedback loop. Written by
// analyticsLearningAgent, read by strategyAgent before it plans a campaign.
const db = require('../db');

const statements = {
  insert: db.prepare(`
    INSERT INTO social_insights (scope, insight, confidence, supporting_data_json)
    VALUES (@scope, @insight, @confidence, @supportingDataJson)
  `),
  activeForScopes: db.prepare(`
    SELECT * FROM social_insights WHERE active = 1 AND scope IN ('global', @platformScope, @packScope)
    ORDER BY created_at DESC LIMIT 15
  `),
  activeRecent: db.prepare(`SELECT * FROM social_insights WHERE active = 1 ORDER BY created_at DESC LIMIT @limit`),
  deactivateOlderThan: db.prepare(`UPDATE social_insights SET active = 0 WHERE created_at < datetime('now', @cutoff)`)
};

function record({ scope, insight, confidence = 0.5, supportingData = {} }) {
  statements.insert.run({ scope, insight, confidence, supportingDataJson: JSON.stringify(supportingData) });
}

// Pulls what StrategyAgent should read before planning: global insights plus
// anything scoped to this platform or pack specifically.
function relevantTo({ platform, packId }) {
  return statements.activeForScopes.all({
    platformScope: `platform:${platform}`,
    packScope: packId ? `pack:${packId}` : '__none__'
  });
}

// Insights are cheap to regenerate from analytics history, so old ones are
// just retired rather than kept accumulating forever.
function retireStale(sqliteModifier = '-60 days') {
  statements.deactivateOlderThan.run({ cutoff: sqliteModifier });
}

// All active insights regardless of scope, most recent first — the
// Video Studio "Trend Intelligence" panel's read view (server/routes/videoAdmin.js),
// as opposed to relevantTo() which strategyAgent uses to filter to one
// platform/pack while planning a specific campaign.
function activeRecent(limit = 20) {
  return statements.activeRecent.all({ limit });
}

module.exports = { record, relevantTo, retireStale, activeRecent };
