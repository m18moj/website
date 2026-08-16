// Generic persistent job queue backing every recurring trigger and every
// pipeline stage in the AI/social system (see social/scheduler.js and
// social/orchestrator.js). Everything lives in the social_jobs table
// (server/db.js) rather than in-memory timers, so a process restart or crash
// never loses queued work and never silently re-runs it twice — the
// dedup_key + partial unique index (idx_social_jobs_dedup_active) is what
// makes enqueuing the same logical job while one is already
// pending/running a safe no-op.
const db = require('./db');

const statements = {
  insert: db.prepare(`
    INSERT INTO social_jobs (job_type, dedup_key, payload_json, run_at, max_attempts)
    VALUES (@jobType, @dedupKey, @payloadJson, COALESCE(@runAt, datetime('now')), @maxAttempts)
  `),
  findPendingCandidateIds: db.prepare(`
    SELECT id FROM social_jobs
    WHERE status = 'pending' AND run_at <= datetime('now')
    ORDER BY run_at ASC
    LIMIT ?
  `),
  claim: db.prepare(`
    UPDATE social_jobs SET status = 'running', locked_by = @lockedBy, locked_at = datetime('now'),
      attempts = attempts + 1, updated_at = datetime('now')
    WHERE id = @id
  `),
  getById: db.prepare('SELECT * FROM social_jobs WHERE id = ?'),
  complete: db.prepare(`UPDATE social_jobs SET status = 'done', updated_at = datetime('now') WHERE id = ?`),
  requeueWithBackoff: db.prepare(`
    UPDATE social_jobs SET status = 'pending', run_at = datetime('now', @offset),
      last_error = @error, locked_by = NULL, locked_at = NULL, updated_at = datetime('now')
    WHERE id = @id
  `),
  markFailed: db.prepare(`
    UPDATE social_jobs SET status = 'failed', last_error = @error, locked_by = NULL, locked_at = NULL,
      updated_at = datetime('now')
    WHERE id = @id
  `),
  counts: db.prepare(`SELECT status, COUNT(*) AS count FROM social_jobs GROUP BY status`),
  cleanupOld: db.prepare(`
    DELETE FROM social_jobs
    WHERE status IN ('done', 'failed', 'cancelled') AND updated_at < datetime('now', '-7 days')
  `)
};

function isDuplicateKeyError(err) {
  return typeof err.message === 'string' && err.message.includes('UNIQUE constraint failed') && err.message.includes('social_jobs.dedup_key');
}

function jobOut(row) {
  if (!row) return null;
  let payload = {};
  try { payload = JSON.parse(row.payload_json || '{}'); } catch (err) { payload = {}; }
  return { ...row, payload };
}

// runAt: optional ISO-ish string ('YYYY-MM-DD HH:MM:SS') for future
// scheduling; omit for "as soon as a worker is free". dedupKey: pass a
// stable key (e.g. `strategy:campaign:42`) for anything that must never be
// queued twice concurrently — recurring cron triggers and every orchestrator
// stage transition both do this.
function enqueue({ jobType, dedupKey = null, payload = {}, runAt = null, maxAttempts = 5 }) {
  try {
    const result = statements.insert.run({
      jobType,
      dedupKey,
      payloadJson: JSON.stringify(payload),
      runAt,
      maxAttempts
    });
    return { enqueued: true, id: result.lastInsertRowid };
  } catch (err) {
    if (isDuplicateKeyError(err)) return { enqueued: false, reason: 'duplicate' };
    throw err;
  }
}

// Atomically claims up to `limit` due jobs for `workerId` — wrapped in
// db.transaction() (server/db.js) so the select-then-update is a single unit
// even though node:sqlite has no built-in UPDATE ... RETURNING helper here.
const claimBatch = db.transaction((limit, workerId) => {
  const candidateIds = statements.findPendingCandidateIds.all(limit).map((r) => r.id);
  const claimed = [];
  for (const id of candidateIds) {
    statements.claim.run({ id, lockedBy: workerId });
    claimed.push(jobOut(statements.getById.get(id)));
  }
  return claimed;
});

function complete(id) {
  statements.complete.run(id);
}

// Exponential backoff capped at 1 hour: 30s, 60s, 120s, 240s, ... — keeps a
// flaky external API (Discord-style outage, platform rate limit) from being
// hammered while still recovering promptly once it's back.
function backoffOffset(attempts) {
  const seconds = Math.min(30 * 2 ** Math.max(0, attempts - 1), 3600);
  return `+${seconds} seconds`;
}

function fail(id, error) {
  const job = statements.getById.get(id);
  if (!job) return;
  const message = (error && error.message) || String(error);
  if (job.attempts < job.max_attempts) {
    statements.requeueWithBackoff.run({ id, offset: backoffOffset(job.attempts), error: message });
  } else {
    statements.markFailed.run({ id, error: message });
  }
}

function statusCounts() {
  const rows = statements.counts.all();
  const out = { pending: 0, running: 0, done: 0, failed: 0, cancelled: 0 };
  for (const row of rows) out[row.status] = row.count;
  return out;
}

function cleanupOld() {
  const result = statements.cleanupOld.run();
  return result.changes;
}

module.exports = { enqueue, claimBatch, complete, fail, statusCounts, cleanupOld };
