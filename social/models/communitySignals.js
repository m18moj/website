// CRUD for community_signals — the unified capture table for the four
// early-signal platform sources (platforms/twitter.js, discordSignal.js,
// robloxDevForum.js, twitch.js), mirroring social/models/trends.js's shape
// (source/topic/score/raw_json/captured_at) but kept as its own table since
// these are leading/community signals rather than trendsAgent's existing
// measured-content signals. Per this codebase's convention, the table is
// created here at module load rather than in server/db.js.
const db = require('../db');

db.exec(`
  CREATE TABLE IF NOT EXISTS community_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    topic TEXT NOT NULL,
    score REAL NOT NULL DEFAULT 0,
    raw_json TEXT,
    captured_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_community_signals_captured_at ON community_signals(captured_at);
  CREATE INDEX IF NOT EXISTS idx_community_signals_source ON community_signals(source);
`);

const statements = {
  insert: db.prepare(`INSERT INTO community_signals (source, topic, score, raw_json) VALUES (@source, @topic, @score, @rawJson)`),
  recent: db.prepare(`SELECT * FROM community_signals WHERE captured_at >= datetime('now', @since) ORDER BY score DESC LIMIT @limit`),
  recentBySource: db.prepare(`
    SELECT * FROM community_signals WHERE source = @source AND captured_at >= datetime('now', @since)
    ORDER BY score DESC LIMIT @limit
  `),
  purgeOld: db.prepare(`DELETE FROM community_signals WHERE captured_at < datetime('now', '-365 days')`)
};

function record({ source, topic, score = 0, raw = {} }) {
  statements.insert.run({ source, topic, score, rawJson: JSON.stringify(raw) });
}

function recent(limit = 20, sqliteModifier = '-3 days') {
  return statements.recent.all({ since: sqliteModifier, limit });
}

function recentBySource(source, limit = 20, sqliteModifier = '-3 days') {
  return statements.recentBySource.all({ source, since: sqliteModifier, limit });
}

function purgeOld() {
  statements.purgeOld.run();
}

module.exports = { record, recent, recentBySource, purgeOld };

// INTEGRATION NOTES:
// - New env vars needed for these four sources (all read inline by their
//   respective platform files, none added to social/config.js):
//     TWITTER_BEARER_TOKEN, TWITTER_SEARCH_QUERIES (optional)
//     DISCORD_BOT_TOKEN, DISCORD_SIGNAL_CHANNEL_IDS
//     ROBLOX_DEVFORUM_USER_AGENT (optional, has a default)
//     TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET
// - No cron entry currently calls these four platform files or writes to
//   this table. A later pass should add a refresh step (in
//   social/agents/trendsAgent.js's refresh(), or a new sibling agent) that
//   calls platforms/twitter.js#fetchTrendingTopics,
//   platforms/discordSignal.js#fetchChannelActivity,
//   platforms/robloxDevForum.js#fetchAnnouncements, and
//   platforms/twitch.js#fetchTopGames/#fetchClipVelocity, then writes each
//   result via communitySignals.record({ source, topic, score, raw }) —
//   same pattern trendsAgent.refresh() already uses for youtube/reddit
//   against models/trends.js. Suggested source values: 'twitter_hashtag',
//   'discord_activity', 'roblox_devforum', 'twitch_top_game',
//   'twitch_clip_velocity'.
// - social/scheduler.js should call communitySignals.purgeOld() alongside
//   its existing trendsModel.purgeOld() call on whatever cadence that
//   already runs on.
// - social/agents/strategyAgent.js's prompt-building step is the natural
//   place to read communitySignals.recent()/recentBySource() back in
//   alongside trendsModel.recent(), the same way it currently folds in
//   social/models/insights.js's relevantTo() output.
// - Video Studio's Trend Intelligence panel (server/routes/videoAdmin.js,
//   video-admin/index.html) is a reasonable place to surface these once
//   there's live data, alongside the existing social_trends/trend_forecasts
//   views.
