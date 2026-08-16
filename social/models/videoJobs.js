// CRUD for video_jobs — the hand-off contract table with the separate
// video-generation pipeline. See social/VIDEO_JOB_CONTRACT.md for what
// belongs in inputJson and what the other side is expected to write back.
// This module only ever reads status/output columns; it never renders
// anything itself.
const db = require('../db');

const columns = `
  id, campaign_id AS campaignId, status, input_json AS inputJson, output_path AS outputPath,
  output_meta_json AS outputMetaJson, claimed_by AS claimedBy, claimed_at AS claimedAt,
  error, attempts, priority, created_at AS createdAt, updated_at AS updatedAt
`;

const statements = {
  insert: db.prepare(`
    INSERT INTO video_jobs (campaign_id, input_json, priority)
    VALUES (@campaignId, @inputJson, @priority)
  `),
  findById: db.prepare(`SELECT ${columns} FROM video_jobs WHERE id = ?`),
  findByCampaignId: db.prepare(`SELECT ${columns} FROM video_jobs WHERE campaign_id = ? ORDER BY id DESC LIMIT 1`),
  listInFlight: db.prepare(`SELECT ${columns} FROM video_jobs WHERE status IN ('pending', 'claimed', 'rendering')`),
  markFailed: db.prepare(`UPDATE video_jobs SET status = 'failed', error = @error, updated_at = datetime('now') WHERE id = @id`)
};

function create(campaignId, inputSpec, { priority = 0 } = {}) {
  const result = statements.insert.run({ campaignId, inputJson: JSON.stringify(inputSpec), priority });
  return statements.findById.get(result.lastInsertRowid);
}

function findByCampaignId(campaignId) {
  return statements.findByCampaignId.get(campaignId);
}

function listInFlight() {
  return statements.listInFlight.all();
}

function markFailed(id, error) {
  statements.markFailed.run({ id, error: (error && error.message) || String(error) });
}

module.exports = { create, findByCampaignId, listInFlight, markFailed };
