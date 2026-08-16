// CRUD for social_campaigns — one row per piece of content moving through
// the strategy -> script -> creative -> video -> QA -> schedule -> publish
// pipeline. Same thin-accessor style as server/models/*.js.
const db = require('../db');

const columns = `
  id, trigger_type AS triggerType, pack_id AS packId, platform, status, account_id AS accountId,
  strategy_json AS strategyJson, script_json AS scriptJson, creative_json AS creativeJson,
  metadata_json AS metadataJson, qa_json AS qaJson, predicted_score AS predictedScore,
  prediction_json AS predictionJson, trend_context_json AS trendContextJson,
  prediction_outcome AS predictionOutcome, retry_count AS retryCount, error,
  created_at AS createdAt, updated_at AS updatedAt
`;

const statements = {
  insert: db.prepare(`
    INSERT INTO social_campaigns (trigger_type, pack_id, platform, account_id)
    VALUES (@triggerType, @packId, @platform, @accountId)
  `),
  findById: db.prepare(`SELECT ${columns} FROM social_campaigns WHERE id = ?`),
  setJsonField: (field) => db.prepare(`
    UPDATE social_campaigns SET ${field} = @value, status = @status, updated_at = datetime('now') WHERE id = @id
  `),
  setPrediction: db.prepare(`
    UPDATE social_campaigns SET predicted_score = @score, prediction_json = @data, status = @status, updated_at = datetime('now') WHERE id = @id
  `),
  setTrendContext: db.prepare(`UPDATE social_campaigns SET trend_context_json = @data, updated_at = datetime('now') WHERE id = @id`),
  setPredictionOutcome: db.prepare(`UPDATE social_campaigns SET prediction_outcome = @outcome, updated_at = datetime('now') WHERE id = @id`),
  // Published campaigns whose prediction hasn't been graded yet, once their
  // analytics have had a few days to settle (a video's first hours are too
  // noisy to judge a popularity call against) — the work list for
  // analyticsLearningAgent.resolvePredictions().
  awaitingPredictionResolution: db.prepare(`
    SELECT ${columns} FROM social_campaigns campaigns
    WHERE campaigns.prediction_json IS NOT NULL
      AND campaigns.prediction_outcome IS NULL
      AND EXISTS (
        SELECT 1 FROM social_publications pub
        WHERE pub.campaign_id = campaigns.id AND pub.status = 'published' AND pub.published_at <= datetime('now', @cutoff)
      )
  `),
  setStatus: db.prepare(`UPDATE social_campaigns SET status = @status, error = @error, updated_at = datetime('now') WHERE id = @id`),
  bumpRetry: db.prepare(`UPDATE social_campaigns SET retry_count = retry_count + 1, updated_at = datetime('now') WHERE id = ?`),
  list: db.prepare(`SELECT ${columns} FROM social_campaigns ORDER BY created_at DESC LIMIT @limit OFFSET @offset`),
  listByStatus: db.prepare(`SELECT ${columns} FROM social_campaigns WHERE status = @status ORDER BY created_at DESC LIMIT @limit OFFSET @offset`),
  hasNewPackCampaign: db.prepare(`SELECT 1 FROM social_campaigns WHERE pack_id = ? AND trigger_type = 'new_pack' LIMIT 1`),
  // Packs that have never been promoted, or were promoted longest ago —
  // drives the evergreen rotation (social/scheduler.js evergreen_tick).
  leastRecentlyPromotedPackIds: db.prepare(`
    SELECT packs.id AS packId
    FROM packs
    LEFT JOIN (
      SELECT pack_id, MAX(created_at) AS lastPromotedAt
      FROM social_campaigns
      WHERE pack_id IS NOT NULL
      GROUP BY pack_id
    ) promoted ON promoted.pack_id = packs.id
    WHERE packs.hidden = 0
    ORDER BY promoted.lastPromotedAt ASC NULLS FIRST, packs.created_at ASC
    LIMIT ?
  `),
  statusCounts: db.prepare(`SELECT status, COUNT(*) AS count FROM social_campaigns GROUP BY status`)
};

function create({ triggerType, packId = null, platform, accountId = null }) {
  const result = statements.insert.run({ triggerType, packId, platform, accountId });
  return findById(result.lastInsertRowid);
}

function findById(id) {
  return statements.findById.get(id);
}

function setStage(id, field, value, status) {
  statements.setJsonField(field).run({ id, value: JSON.stringify(value), status });
  return findById(id);
}

const setStrategy = (id, data, status = 'scripting') => setStage(id, 'strategy_json', data, status);
const setScript = (id, data, status = 'creative') => setStage(id, 'script_json', data, status);
const setCreative = (id, data, status = 'video_queued') => setStage(id, 'creative_json', data, status);
const setMetadata = (id, data, status) => setStage(id, 'metadata_json', data, status);
const setQa = (id, data, status) => setStage(id, 'qa_json', data, status);

// Popularity prediction is a separate column pair (not another JSON stage
// field), since it carries a numeric score that needs to be queried/sorted
// on directly (ranking, "below threshold" checks) rather than only read back
// as a JSON blob.
function setPrediction(id, prediction, status) {
  statements.setPrediction.run({ id, score: prediction.score, data: JSON.stringify(prediction), status });
  return findById(id);
}

function setTrendContext(id, context) {
  statements.setTrendContext.run({ id, data: JSON.stringify(context) });
}

function setPredictionOutcome(id, outcome) {
  statements.setPredictionOutcome.run({ id, outcome });
  return findById(id);
}

function awaitingPredictionResolution(sqliteModifier = '-3 days') {
  return statements.awaitingPredictionResolution.all({ cutoff: sqliteModifier });
}

function setStatus(id, status, error = null) {
  statements.setStatus.run({ id, status, error });
  return findById(id);
}

function bumpRetry(id) {
  statements.bumpRetry.run(id);
  return findById(id);
}

function list({ status = null, limit = 50, offset = 0 } = {}) {
  if (status) return statements.listByStatus.all({ status, limit, offset });
  return statements.list.all({ limit, offset });
}

function hasBeenPromotedBefore(packId) {
  return Boolean(statements.hasNewPackCampaign.get(packId));
}

function packsNeedingEvergreen(limit) {
  return statements.leastRecentlyPromotedPackIds.all(limit).map((r) => r.packId);
}

function statusCounts() {
  const rows = statements.statusCounts.all();
  const out = {};
  for (const row of rows) out[row.status] = row.count;
  return out;
}

module.exports = {
  create,
  findById,
  setStrategy,
  setScript,
  setCreative,
  setMetadata,
  setQa,
  setPrediction,
  setTrendContext,
  setPredictionOutcome,
  awaitingPredictionResolution,
  setStatus,
  bumpRetry,
  list,
  hasBeenPromotedBefore,
  packsNeedingEvergreen,
  statusCounts
};
