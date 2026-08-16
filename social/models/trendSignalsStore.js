// CRUD for trend_signals — the persisted output of social/lib/trendSignals.js's
// computations (lifecycle stage, velocity, half-life, latest anomaly flag) for
// each (source, topic) pair social_trends has enough repeated captures of to
// analyze. One row per (source, topic): each computation run upserts the
// latest snapshot rather than keeping a full history, since the underlying
// time series already lives in social_trends and momentum()/dailyRollup()
// there cover the rollup case — this table exists so agents can read a
// cheap, already-computed "what stage is this topic at right now" instead of
// recomputing trendSignals over raw captures on every prompt build.
const db = require('../db');

db.exec(`
  CREATE TABLE IF NOT EXISTS trend_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    topic TEXT NOT NULL,
    lifecycle_stage TEXT NOT NULL CHECK (lifecycle_stage IN ('emerging', 'peaking', 'saturating', 'declining')),
    lifecycle_confidence REAL NOT NULL DEFAULT 0.5,
    velocity REAL NOT NULL DEFAULT 0,
    half_life_days REAL,
    peak_score REAL NOT NULL DEFAULT 0,
    peak_at TEXT,
    latest_score REAL NOT NULL DEFAULT 0,
    capture_count INTEGER NOT NULL DEFAULT 0,
    is_anomaly INTEGER NOT NULL DEFAULT 0,
    anomaly_z REAL,
    computed_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(source, topic)
  );
  CREATE INDEX IF NOT EXISTS idx_trend_signals_stage ON trend_signals(lifecycle_stage);
  CREATE INDEX IF NOT EXISTS idx_trend_signals_computed_at ON trend_signals(computed_at);
`);

const columns = `
  id, source, topic, lifecycle_stage AS lifecycleStage, lifecycle_confidence AS lifecycleConfidence,
  velocity, half_life_days AS halfLifeDays, peak_score AS peakScore, peak_at AS peakAt,
  latest_score AS latestScore, capture_count AS captureCount, is_anomaly AS isAnomaly,
  anomaly_z AS anomalyZ, computed_at AS computedAt
`;

const statements = {
  upsert: db.prepare(`
    INSERT INTO trend_signals (
      source, topic, lifecycle_stage, lifecycle_confidence, velocity, half_life_days,
      peak_score, peak_at, latest_score, capture_count, is_anomaly, anomaly_z, computed_at
    )
    VALUES (
      @source, @topic, @lifecycleStage, @lifecycleConfidence, @velocity, @halfLifeDays,
      @peakScore, @peakAt, @latestScore, @captureCount, @isAnomaly, @anomalyZ, datetime('now')
    )
    ON CONFLICT(source, topic) DO UPDATE SET
      lifecycle_stage = excluded.lifecycle_stage,
      lifecycle_confidence = excluded.lifecycle_confidence,
      velocity = excluded.velocity,
      half_life_days = excluded.half_life_days,
      peak_score = excluded.peak_score,
      peak_at = excluded.peak_at,
      latest_score = excluded.latest_score,
      capture_count = excluded.capture_count,
      is_anomaly = excluded.is_anomaly,
      anomaly_z = excluded.anomaly_z,
      computed_at = datetime('now')
  `),
  find: db.prepare(`SELECT ${columns} FROM trend_signals WHERE source = @source AND topic = @topic`),
  byStage: db.prepare(`SELECT ${columns} FROM trend_signals WHERE lifecycle_stage = @stage ORDER BY computed_at DESC LIMIT @limit`),
  anomalies: db.prepare(`
    SELECT ${columns} FROM trend_signals
    WHERE is_anomaly = 1 AND computed_at >= datetime('now', @since)
    ORDER BY ABS(anomaly_z) DESC LIMIT @limit
  `),
  recent: db.prepare(`SELECT ${columns} FROM trend_signals ORDER BY computed_at DESC LIMIT @limit`),
  purgeStale: db.prepare(`DELETE FROM trend_signals WHERE computed_at < datetime('now', @cutoff)`)
};

function upsert({
  source, topic, lifecycleStage, lifecycleConfidence = 0.5, velocity = 0, halfLifeDays = null,
  peakScore = 0, peakAt = null, latestScore = 0, captureCount = 0, isAnomaly = false, anomalyZ = null
}) {
  statements.upsert.run({
    source, topic, lifecycleStage, lifecycleConfidence, velocity, halfLifeDays,
    peakScore, peakAt, latestScore, captureCount, isAnomaly: isAnomaly ? 1 : 0, anomalyZ
  });
  return statements.find.get({ source, topic });
}

function find(source, topic) {
  return statements.find.get({ source, topic });
}

function byStage(stage, limit = 20) {
  return statements.byStage.all({ stage, limit });
}

// Anomalies from the most recent computation runs — snapshots older than the
// window are assumed stale (superseded by a later run or the topic dropped
// out of rotation) rather than a standing alert.
function recentAnomalies(sqliteModifier = '-3 days', limit = 20) {
  return statements.anomalies.all({ since: sqliteModifier, limit });
}

function recent(limit = 50) {
  return statements.recent.all({ limit });
}

// Snapshots are cheap to recompute from social_trends (same as social_insights'
// retireStale pattern), so old ones for topics that stopped being captured are
// just dropped rather than kept accumulating forever.
function purgeStale(sqliteModifier = '-30 days') {
  statements.purgeStale.run({ cutoff: sqliteModifier });
}

module.exports = { upsert, find, byStage, recentAnomalies, recent, purgeStale };
