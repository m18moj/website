// CRUD for social_trends — refreshed by trendsAgent on a cron, read by
// strategyAgent when planning trend-driven campaigns.
const db = require('../db');

const statements = {
  insert: db.prepare(`INSERT INTO social_trends (source, topic, score, raw_json) VALUES (@source, @topic, @score, @rawJson)`),
  recent: db.prepare(`SELECT * FROM social_trends WHERE captured_at >= datetime('now', @since) ORDER BY score DESC LIMIT @limit`),
  purgeOld: db.prepare(`DELETE FROM social_trends WHERE captured_at < datetime('now', '-14 days')`)
};

function record({ source, topic, score = 0, raw = {} }) {
  statements.insert.run({ source, topic, score, rawJson: JSON.stringify(raw) });
}

function recent(limit = 10, sqliteModifier = '-3 days') {
  return statements.recent.all({ since: sqliteModifier, limit });
}

function purgeOld() {
  statements.purgeOld.run();
}

module.exports = { record, recent, purgeOld };
