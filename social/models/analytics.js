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
  `),
  // Same join as sinceWithCampaign plus strategy_json, so a caller can group
  // real performance by content pillar/angle — the grounding
  // social/agents/predictionAgent.js needs to judge a not-yet-published
  // video against how similar past videos actually did, not just guess.
  sinceWithCampaignDetail: db.prepare(`
    SELECT snapshots.views, snapshots.likes, snapshots.comments, snapshots.shares, snapshots.captured_at AS capturedAt,
      publications.campaign_id AS campaignId, publications.platform AS platform,
      campaigns.pack_id AS packId, campaigns.strategy_json AS strategyJson
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

function sinceWithCampaignDetail(sqliteModifier = '-90 days') {
  return statements.sinceWithCampaignDetail.all({ since: sqliteModifier });
}

module.exports = { record, latestForPublication, sinceWithCampaign, sinceWithCampaignDetail };
