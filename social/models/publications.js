// CRUD for social_publications — one row per actual post made to a
// platform. UNIQUE(campaign_id, platform) (server/db.js) is the
// duplicate-publish guard, enforced here by treating that constraint
// violation as "already scheduled" rather than an error.
const db = require('../db');

const columns = `
  id, campaign_id AS campaignId, platform, platform_post_id AS platformPostId, platform_url AS platformUrl,
  title, description, scheduled_at AS scheduledAt, published_at AS publishedAt, status, attempts, error,
  created_at AS createdAt, updated_at AS updatedAt
`;

const statements = {
  insert: db.prepare(`
    INSERT INTO social_publications (campaign_id, platform, title, description, scheduled_at)
    VALUES (@campaignId, @platform, @title, @description, @scheduledAt)
  `),
  findById: db.prepare(`SELECT ${columns} FROM social_publications WHERE id = ?`),
  findByCampaignId: db.prepare(`SELECT ${columns} FROM social_publications WHERE campaign_id = ?`),
  due: db.prepare(`SELECT ${columns} FROM social_publications WHERE status = 'scheduled' AND scheduled_at <= datetime('now') ORDER BY scheduled_at ASC LIMIT ?`),
  markPublishing: db.prepare(`UPDATE social_publications SET status = 'publishing', attempts = attempts + 1, updated_at = datetime('now') WHERE id = ?`),
  markPublished: db.prepare(`
    UPDATE social_publications SET status = 'published', platform_post_id = @platformPostId,
      platform_url = @platformUrl, published_at = datetime('now'), updated_at = datetime('now')
    WHERE id = @id
  `),
  markFailed: db.prepare(`UPDATE social_publications SET status = 'failed', error = @error, updated_at = datetime('now') WHERE id = @id`),
  resetToScheduled: db.prepare(`UPDATE social_publications SET status = 'scheduled', error = @error, updated_at = datetime('now') WHERE id = @id`),
  listPublishedSince: db.prepare(`SELECT ${columns} FROM social_publications WHERE status = 'published' AND published_at >= datetime('now', @since)`),
  // TikTok's init/upload only returns a publish_id — the real, publicly
  // usable post id/url is resolved asynchronously via a status-fetch call
  // (see social/platforms/tiktok.js fetchPublishStatus). Until that
  // resolves, platform_url stays NULL, which is what marks a row as
  // "accepted but not yet confirmed" here.
  listUnresolvedTiktok: db.prepare(`SELECT ${columns} FROM social_publications WHERE platform = 'tiktok' AND status = 'published' AND platform_url IS NULL LIMIT 10`),
  resolvePlatformId: db.prepare(`
    UPDATE social_publications SET platform_post_id = @platformPostId, platform_url = @platformUrl, updated_at = datetime('now')
    WHERE id = @id
  `)
};

function isDuplicateError(err) {
  return typeof err.message === 'string' && err.message.includes('UNIQUE constraint failed') && err.message.includes('social_publications');
}

function create({ campaignId, platform, title, description, scheduledAt }) {
  try {
    const result = statements.insert.run({ campaignId, platform, title, description, scheduledAt });
    return statements.findById.get(result.lastInsertRowid);
  } catch (err) {
    if (isDuplicateError(err)) return statements.findByCampaignId.get(campaignId) || null;
    throw err;
  }
}

function due(limit = 10) {
  return statements.due.all(limit);
}

function markPublishing(id) {
  statements.markPublishing.run(id);
}

function markPublished(id, { platformPostId, platformUrl }) {
  statements.markPublished.run({ id, platformPostId: platformPostId || null, platformUrl: platformUrl || null });
}

function markFailed(id, error) {
  statements.markFailed.run({ id, error: (error && error.message) || String(error) });
}

// Transient failure (rate limit, network blip) — put it back in the queue
// for the next publish_due_posts tick instead of terminally failing it.
function resetToScheduled(id, error) {
  statements.resetToScheduled.run({ id, error: (error && error.message) || String(error) });
}

function listPublishedSince(sqliteModifier = '-7 days') {
  return statements.listPublishedSince.all({ since: sqliteModifier });
}

function listUnresolvedTiktok() {
  return statements.listUnresolvedTiktok.all();
}

function resolvePlatformId(id, { platformPostId, platformUrl }) {
  statements.resolvePlatformId.run({ id, platformPostId, platformUrl });
}

module.exports = {
  create,
  due,
  markPublishing,
  markPublished,
  markFailed,
  resetToScheduled,
  listPublishedSince,
  listUnresolvedTiktok,
  resolvePlatformId
};
