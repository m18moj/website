// CRUD for video_admin_jobs — render jobs triggered from the Video Studio
// admin tab. Distinct from social/models/videoJobs.js (server/models/), which
// owns the separate video_jobs contract table (see
// social/VIDEO_JOB_CONTRACT.md); this one never touches that table.
const db = require('../db');

const columns = `
  id, kind, pack_id AS packId, status, command, log, output_path AS outputPath,
  qa_json AS qaJson, error, pid, triggered_by AS triggeredBy,
  created_at AS createdAt, updated_at AS updatedAt
`;

const statements = {
  insert: db.prepare(`
    INSERT INTO video_admin_jobs (kind, pack_id, command, triggered_by)
    VALUES (@kind, @packId, @command, @triggeredBy)
  `),
  findById: db.prepare(`SELECT ${columns} FROM video_admin_jobs WHERE id = ?`),
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
  countByStatus: db.prepare(`SELECT status, COUNT(*) AS count FROM video_admin_jobs GROUP BY status`)
};

function create({ kind, packId, command, triggeredBy }) {
  const result = statements.insert.run({ kind, packId: packId || null, command, triggeredBy });
  return withParsedQa(statements.findById.get(result.lastInsertRowid));
}

function withParsedQa(row) {
  if (!row) return row;
  const { qaJson, ...rest } = row;
  return { ...rest, qa: qaJson ? JSON.parse(qaJson) : null };
}

function findById(id) {
  return withParsedQa(statements.findById.get(id));
}

function list(limit = 50) {
  return statements.list.all(limit).map(withParsedQa);
}

function listActive() {
  return statements.listActive.all().map(withParsedQa);
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

function statusCounts() {
  const counts = { queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
  for (const row of statements.countByStatus.all()) counts[row.status] = row.count;
  return counts;
}

module.exports = { create, findById, list, listActive, setPid, appendLog, complete, fail, cancel, statusCounts };
