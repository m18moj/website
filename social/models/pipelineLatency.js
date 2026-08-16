// CRUD for pipeline_latency — one row per handler invocation, recording
// wall-clock duration. Owned by social/lib/latencyTracker.js which writes
// every row; this model is the thin accessor layer. Owns its own table
// (CREATE TABLE IF NOT EXISTS at module load) following the same convention
// social/models/webSignals.js, communitySignals.js, contentPatterns.js use.
const db = require('../db');

db.exec([
  'CREATE TABLE IF NOT EXISTS pipeline_latency (',
  '  id INTEGER PRIMARY KEY AUTOINCREMENT,',
  '  stage TEXT NOT NULL,',
  '  duration_ms INTEGER NOT NULL,',
  '  ok INTEGER NOT NULL DEFAULT 1,',
  '  error TEXT,',
  '  created_at TEXT NOT NULL DEFAULT (datetime(\'now\'))',
  ');',
  'CREATE INDEX IF NOT EXISTS idx_pipeline_latency_stage ON pipeline_latency(stage, created_at);'
].join('\n'));

const statements = {
  insert: db.prepare(
    'INSERT INTO pipeline_latency (stage, duration_ms, ok, error) ' +
    'VALUES (@stage, @durationMs, @ok, @error)'
  ),
  recentByStage: db.prepare(
    'SELECT * FROM pipeline_latency ' +
    'WHERE stage = @stage AND created_at >= datetime(\'now\', @since) ' +
    'ORDER BY created_at DESC LIMIT @limit'
  ),
  statsByStage: db.prepare(
    'SELECT ' +
    '  COUNT(*) AS total, ' +
    '  SUM(CASE WHEN ok = 1 THEN 1 ELSE 0 END) AS successCount, ' +
    '  SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS errorCount, ' +
    '  AVG(duration_ms) AS avgDurationMs, ' +
    '  MIN(duration_ms) AS minDurationMs, ' +
    '  MAX(duration_ms) AS maxDurationMs ' +
    'FROM pipeline_latency ' +
    'WHERE stage = @stage AND created_at >= datetime(\'now\', @since)'
  ),
  purgeOld: db.prepare('DELETE FROM pipeline_latency WHERE created_at < datetime(\'now\', @cutoff)')
};

function record({ stage, durationMs, ok = true, error = null }) {
  statements.insert.run({ stage, durationMs, ok: ok ? 1 : 0, error: error || null });
}

function recentByStage(stage, limit = 50, sqliteModifier = '-30 days') {
  return statements.recentByStage.all({ stage, since: sqliteModifier, limit });
}

function recentStats(stage, limit = 100, sqliteModifier = '-30 days') {
  const row = statements.statsByStage.get({ stage, since: sqliteModifier });
  const durations = recentByStage(stage, limit, sqliteModifier).map((r) => r.duration_ms).sort((a, b) => a - b);
  return {
    stage,
    total: row.total || 0,
    successCount: row.successCount || 0,
    errorCount: row.errorCount || 0,
    avgDurationMs: row.avgDurationMs != null ? Math.round(row.avgDurationMs) : null,
    minDurationMs: row.minDurationMs || null,
    maxDurationMs: row.maxDurationMs || null,
    p50DurationMs: durations.length ? durations[Math.floor(durations.length * 0.5)] : null,
    p95DurationMs: durations.length ? durations[Math.floor(durations.length * 0.95)] : null
  };
}

function purgeOld(sqliteModifier = '-90 days') {
  statements.purgeOld.run({ cutoff: sqliteModifier });
}

module.exports = { record, recentByStage, recentStats, purgeOld };
