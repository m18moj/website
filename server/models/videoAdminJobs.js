// CRUD for video_admin_jobs — render jobs triggered from the Video Studio
// admin tab. Distinct from social/models/videoJobs.js (server/models/), which
// owns the separate video_jobs contract table (see
// social/VIDEO_JOB_CONTRACT.md); this one never touches that table.
const db = require('../db');

const columns = `
  id, kind, pack_id AS packId, status, command, log, output_path AS outputPath,
  qa_json AS qaJson, error, pid, triggered_by AS triggeredBy,
  quality, pacing, length, angle, speed, animation_intensity AS animationIntensity,
  captions_enabled AS captionsEnabled, tts_enabled AS ttsEnabled, music_enabled AS musicEnabled, beat_match AS beatMatch,
  predicted_score AS predictedScore, prediction_json AS predictionJson, redo_of AS redoOf,
  created_at AS createdAt, updated_at AS updatedAt
`;

const statements = {
  insert: db.prepare(`
    INSERT INTO video_admin_jobs (
      kind, pack_id, command, triggered_by, quality, pacing, length, angle,
      speed, animation_intensity, captions_enabled, tts_enabled, music_enabled, beat_match, redo_of
    )
    VALUES (
      @kind, @packId, @command, @triggeredBy, @quality, @pacing, @length, @angle,
      @speed, @animationIntensity, @captionsEnabled, @ttsEnabled, @musicEnabled, @beatMatch, @redoOf
    )
  `),
  findById: db.prepare(`SELECT ${columns} FROM video_admin_jobs WHERE id = ?`),
  // Most recent completed job that produced a given output file — used to
  // trace a published post's real performance back to the render controls
  // (quality/pacing/length/angle) that made it. LIMIT 1 covers the rare case
  // of a re-render reusing the same output path.
  findByOutputPath: db.prepare(`SELECT ${columns} FROM video_admin_jobs WHERE output_path = ? ORDER BY id DESC LIMIT 1`),
  // Whether a job has already had an automatic redo spawned for it — the
  // guard that caps the popularity-prediction auto-redo at one level per
  // original job (see scoreAndMaybeRedoJob in routes/videoAdmin.js).
  findRedoChild: db.prepare(`SELECT ${columns} FROM video_admin_jobs WHERE redo_of = ? LIMIT 1`),
  list: db.prepare(`SELECT ${columns} FROM video_admin_jobs ORDER BY id DESC LIMIT ?`),
  listActive: db.prepare(`SELECT ${columns} FROM video_admin_jobs WHERE status IN ('queued', 'running') ORDER BY id DESC`),
  setPid: db.prepare(`UPDATE video_admin_jobs SET pid = @pid, status = 'running', updated_at = datetime('now') WHERE id = @id`),
  appendLog: db.prepare(`UPDATE video_admin_jobs SET log = log || @chunk, updated_at = datetime('now') WHERE id = @id`),
  complete: db.prepare(`
    UPDATE video_admin_jobs
    SET status = 'completed', output_path = @outputPath, qa_json = @qaJson, updated_at = datetime('now')
    WHERE id = @id
  `),
  fail: db.prepare(`
    UPDATE video_admin_jobs SET status = 'failed', error = @error, updated_at = datetime('now') WHERE id = @id
  `),
  cancel: db.prepare(`
    UPDATE video_admin_jobs SET status = 'cancelled', updated_at = datetime('now') WHERE id = @id
  `),
  setPrediction: db.prepare(`
    UPDATE video_admin_jobs SET predicted_score = @score, prediction_json = @data, updated_at = datetime('now') WHERE id = @id
  `),
  countByStatus: db.prepare(`SELECT status, COUNT(*) AS count FROM video_admin_jobs GROUP BY status`)
};

function create({ kind, packId, command, triggeredBy, quality, pacing, length, angle, speed, animationIntensity, captionsEnabled, ttsEnabled, musicEnabled, beatMatch, redoOf }) {
  const result = statements.insert.run({
    kind,
    packId: packId || null,
    command,
    triggeredBy,
    quality: quality || null,
    pacing: pacing || null,
    length: length || null,
    angle: angle || null,
    speed: speed || null,
    animationIntensity: animationIntensity || null,
    captionsEnabled: captionsEnabled === undefined ? null : (captionsEnabled ? 1 : 0),
    ttsEnabled: ttsEnabled === undefined ? null : (ttsEnabled ? 1 : 0),
    musicEnabled: musicEnabled === undefined ? null : (musicEnabled ? 1 : 0),
    beatMatch: beatMatch === undefined ? null : (beatMatch ? 1 : 0),
    redoOf: redoOf || null
  });
  return withParsed(statements.findById.get(result.lastInsertRowid));
}

function findByOutputPath(outputPath) {
  return withParsed(statements.findByOutputPath.get(outputPath));
}

function findRedoChild(id) {
  return withParsed(statements.findRedoChild.get(id));
}

function withParsed(row) {
  if (!row) return row;
  const { qaJson, predictionJson, captionsEnabled, ttsEnabled, musicEnabled, beatMatch, ...rest } = row;
  return {
    ...rest,
    captionsEnabled: captionsEnabled === null ? null : !!captionsEnabled,
    ttsEnabled: ttsEnabled === null ? null : !!ttsEnabled,
    musicEnabled: musicEnabled === null ? null : !!musicEnabled,
    beatMatch: beatMatch === null ? null : !!beatMatch,
    qa: qaJson ? JSON.parse(qaJson) : null,
    prediction: predictionJson ? JSON.parse(predictionJson) : null
  };
}

function findById(id) {
  return withParsed(statements.findById.get(id));
}

function list(limit = 50) {
  return statements.list.all(limit).map(withParsed);
}

function listActive() {
  return statements.listActive.all().map(withParsed);
}

function setPid(id, pid) {
  statements.setPid.run({ id, pid });
}

function appendLog(id, chunk) {
  statements.appendLog.run({ id, chunk });
}

function complete(id, { outputPath, qa }) {
  statements.complete.run({ id, outputPath: outputPath || null, qaJson: qa ? JSON.stringify(qa) : null });
}

function fail(id, error) {
  statements.fail.run({ id, error: (error && error.message) || String(error) });
}

function cancel(id) {
  statements.cancel.run({ id });
}

function setPrediction(id, prediction) {
  statements.setPrediction.run({ id, score: prediction.score, data: JSON.stringify(prediction) });
  return findById(id);
}

function statusCounts() {
  const counts = { queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
  for (const row of statements.countByStatus.all()) counts[row.status] = row.count;
  return counts;
}

module.exports = {
  create,
  findById,
  findByOutputPath,
  findRedoChild,
  list,
  listActive,
  setPid,
  appendLog,
  complete,
  fail,
  cancel,
  setPrediction,
  statusCounts
};
