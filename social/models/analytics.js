// CRUD for social_analytics_snapshots — periodic stat pulls per publication.
const db = require('../db');

const statements = {
  insert: db.prepare(`
    INSERT INTO social_analytics_snapshots
      (publication_id, views, likes, comments, shares, saves, watch_time_seconds, raw_json)
    VALUES (@publicationId, @views, @likes, @comments, @shares, @saves, @watchTimeSeconds, @rawJson)
  `),
  latestForPublication: db.prepare(`
    SELECT * FROM social_analytics_snapshots WHERE publication_id = ? ORDER BY captured_at DESC LIMIT 1
  `),
  sinceWithCampaign: db.prepare(`
    SELECT snapshots.*, publications.campaign_id AS campaignId, publications.platform AS platform,
      campaigns.pack_id AS packId
    FROM social_analytics_snapshots snapshots
    JOIN social_publications publications ON publications.id = snapshots.publication_id
    JOIN social_campaigns campaigns ON campaigns.id = publications.campaign_id
    WHERE snapshots.captured_at >= datetime('now', @since)
    ORDER BY snapshots.captured_at DESC
  `)
};

function record(publicationId, stats) {
  statements.insert.run({
    publicationId,
    views: stats.views || 0,
    likes: stats.likes || 0,
    comments: stats.comments || 0,
    shares: stats.shares || 0,
    saves: stats.saves || 0,
    watchTimeSeconds: stats.watchTimeSeconds ?? null,
    rawJson: JSON.stringify(stats.raw || {})
  });
}

function latestForPublication(publicationId) {
  return statements.latestForPublication.get(publicationId);
}

// Joined view used by analyticsLearningAgent to correlate performance with
// campaign strategy/creative choices when synthesizing social_insights.
function sinceWithCampaign(sqliteModifier = '-30 days') {
  return statements.sinceWithCampaign.all({ since: sqliteModifier });
}

module.exports = { record, latestForPublication, sinceWithCampaign };
