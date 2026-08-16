// CRUD + snapshot storage for competitor tracking. competitor_channels is
// which TikTok/YouTube accounts we watch; competitor_videos is a
// point-in-time snapshot per video per capture (NOT an upsert) — the same
// platform_video_id reappears across many rows as its views/likes/comments
// change over time, so performanceOverTime()/postingCadence() below have a
// real time series to read instead of only ever seeing the latest number.
// Same thin-accessor style as social/models/campaigns.js and
// social/models/accounts.js. Per this feature's file-ownership rule, the two
// tables are created here at module load rather than in server/db.js.
const db = require('../db');

db.exec(`
  -- Competitor accounts the automation watches. UNIQUE(platform, handle) so
  -- re-adding the same handle is a no-op rather than a duplicate row.
  CREATE TABLE IF NOT EXISTS competitor_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL CHECK (platform IN ('youtube', 'tiktok')),
    handle TEXT NOT NULL,
    label TEXT,
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(platform, handle)
  );
  CREATE INDEX IF NOT EXISTS idx_competitor_channels_platform ON competitor_channels(platform);

  -- One row per capture, not per video: recordVideoSnapshot() below always
  -- inserts, never updates, so views/likes/comments growth and posting
  -- cadence stay queryable as real history instead of collapsing to whatever
  -- the most recent refresh happened to see.
  CREATE TABLE IF NOT EXISTS competitor_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL REFERENCES competitor_channels(id) ON DELETE CASCADE,
    platform_video_id TEXT NOT NULL,
    title TEXT,
    published_at TEXT,
    views INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0,
    comments INTEGER NOT NULL DEFAULT 0,
    captured_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_competitor_videos_channel_video ON competitor_videos(channel_id, platform_video_id);
  CREATE INDEX IF NOT EXISTS idx_competitor_videos_published ON competitor_videos(published_at);
`);

const channelColumns = `id, platform, handle, label, added_at AS addedAt`;
const videoColumns = `
  id, channel_id AS channelId, platform_video_id AS platformVideoId, title,
  published_at AS publishedAt, views, likes, comments, captured_at AS capturedAt
`;

const statements = {
  insertChannel: db.prepare(`INSERT OR IGNORE INTO competitor_channels (platform, handle, label) VALUES (@platform, @handle, @label)`),
  findChannelById: db.prepare(`SELECT ${channelColumns} FROM competitor_channels WHERE id = ?`),
  findChannelByHandle: db.prepare(`SELECT ${channelColumns} FROM competitor_channels WHERE platform = @platform AND handle = @handle`),
  listChannels: db.prepare(`SELECT ${channelColumns} FROM competitor_channels ORDER BY platform ASC, label ASC`),
  listChannelsByPlatform: db.prepare(`SELECT ${channelColumns} FROM competitor_channels WHERE platform = ? ORDER BY label ASC`),
  removeChannel: db.prepare(`DELETE FROM competitor_channels WHERE id = ?`),

  insertVideoSnapshot: db.prepare(`
    INSERT INTO competitor_videos (channel_id, platform_video_id, title, published_at, views, likes, comments)
    VALUES (@channelId, @platformVideoId, @title, @publishedAt, @views, @likes, @comments)
  `),

  // Most recent capture per (channel, video) — the "what does this channel's
  // catalog look like right now" read.
  // "Latest" is keyed on MAX(id) rather than MAX(captured_at): captured_at
  // only has second-level resolution, so two snapshots taken within the same
  // second (a backfill, a fast retry, or just two refreshes landing close
  // together) would otherwise tie and both survive the dedupe. The
  // AUTOINCREMENT primary key strictly increases with insertion order, so it
  // never ties.
  latestSnapshotsForChannel: db.prepare(`
    SELECT cv.id, cv.channel_id AS channelId, cv.platform_video_id AS platformVideoId, cv.title,
      cv.published_at AS publishedAt, cv.views, cv.likes, cv.comments, cv.captured_at AS capturedAt
    FROM competitor_videos cv
    JOIN (
      SELECT platform_video_id, MAX(id) AS maxId
      FROM competitor_videos
      WHERE channel_id = @channelId
      GROUP BY platform_video_id
    ) latest ON latest.platform_video_id = cv.platform_video_id AND latest.maxId = cv.id
    WHERE cv.channel_id = @channelId
    ORDER BY cv.published_at DESC
    LIMIT @limit
  `),

  // Same "latest capture per video" dedupe (see the id-vs-captured_at note
  // above), across every watched channel, joined with channel identity —
  // this is the shape competitorAgent.js hands the LLM as "what competitors
  // have posted lately".
  recentAcrossChannels: db.prepare(`
    SELECT cv.id, cv.channel_id AS channelId, cv.platform_video_id AS platformVideoId, cv.title,
      cv.published_at AS publishedAt, cv.views, cv.likes, cv.comments, cv.captured_at AS capturedAt,
      cc.platform AS platform, cc.handle AS handle, cc.label AS label
    FROM competitor_videos cv
    JOIN competitor_channels cc ON cc.id = cv.channel_id
    JOIN (
      SELECT channel_id, platform_video_id, MAX(id) AS maxId
      FROM competitor_videos
      GROUP BY channel_id, platform_video_id
    ) latest ON latest.channel_id = cv.channel_id AND latest.platform_video_id = cv.platform_video_id AND latest.maxId = cv.id
    WHERE cv.published_at >= datetime('now', @since)
    ORDER BY cv.published_at DESC
    LIMIT @limit
  `),

  // Full snapshot history for one video, oldest first — the growth curve.
  performanceOverTime: db.prepare(`SELECT ${videoColumns} FROM competitor_videos WHERE platform_video_id = ? ORDER BY captured_at ASC`),

  // Day-of-week/hour histogram of when this channel actually publishes,
  // deduping to one row per video (published_at doesn't change across
  // recaptures of the same video, so COUNT(*) here would otherwise
  // double-count every video by however many times it's been recaptured).
  postingCadence: db.prepare(`
    SELECT strftime('%w', published_at) AS dayOfWeek, strftime('%H', published_at) AS hourOfDay, COUNT(*) AS count
    FROM (SELECT DISTINCT platform_video_id, published_at FROM competitor_videos WHERE channel_id = @channelId AND published_at IS NOT NULL)
    GROUP BY dayOfWeek, hourOfDay
    ORDER BY count DESC
  `),

  distinctChannelCount: db.prepare(`SELECT COUNT(*) AS count FROM competitor_channels`)
};

function addChannel({ platform, handle, label = null }) {
  statements.insertChannel.run({ platform, handle, label });
  return statements.findChannelByHandle.get({ platform, handle });
}

function findChannelById(id) {
  return statements.findChannelById.get(id);
}

function findChannelByHandle(platform, handle) {
  return statements.findChannelByHandle.get({ platform, handle });
}

function listChannels(platform = null) {
  if (platform) return statements.listChannelsByPlatform.all(platform);
  return statements.listChannels.all();
}

function removeChannel(id) {
  statements.removeChannel.run(id);
}

function recordVideoSnapshot({ channelId, platformVideoId, title = '', publishedAt = null, views = 0, likes = 0, comments = 0 }) {
  statements.insertVideoSnapshot.run({ channelId, platformVideoId, title, publishedAt, views, likes, comments });
}

function latestSnapshotsForChannel(channelId, limit = 20) {
  return statements.latestSnapshotsForChannel.all({ channelId, limit });
}

function recentAcrossChannels(sqliteModifier = '-14 days', limit = 100) {
  return statements.recentAcrossChannels.all({ since: sqliteModifier, limit });
}

function performanceOverTime(platformVideoId) {
  return statements.performanceOverTime.all(platformVideoId);
}

function postingCadence(channelId) {
  return statements.postingCadence.all({ channelId });
}

function distinctChannelCount() {
  return statements.distinctChannelCount.get().count;
}

module.exports = {
  addChannel,
  findChannelById,
  findChannelByHandle,
  listChannels,
  removeChannel,
  recordVideoSnapshot,
  latestSnapshotsForChannel,
  recentAcrossChannels,
  performanceOverTime,
  postingCadence,
  distinctChannelCount
};

// INTEGRATION NOTES: see the bottom of social/agents/competitorAgent.js for
// how this model's data is meant to reach strategyAgent.js.
