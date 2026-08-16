// CRUD for ensemble_forecasts — written by social/agents/ensembleForecastAgent.js,
// which blends an LLM directional call with a plain statistical trend-line
// extrapolation (from social/models/trends.js's dailyRollup/momentum data)
// into one prediction with an explicit confidence interval, per content
// pillar and per horizon (24h/3d/7d/14d). Parallel structure to
// social/models/forecasts.js (trend_forecasts) — same source/topic/
// predicted_direction/confidence/reasoning/based_on/horizon_days/status/
// actual_direction/resolution_notes/resolved_at/created_at shape — plus
// confidence_low/confidence_high/content_pillar/point_estimate/current_value/
// actual_value (needed to grade whether reality actually landed inside the
// forecast's own confidence interval, not just whether the direction call
// was right) and llm_direction/llm_confidence/stat_direction/stat_confidence
// (so the two halves of the blend stay individually inspectable, not just
// their merged output).
//
// Owns its own table (CREATE TABLE IF NOT EXISTS at module load) rather than
// server/db.js, same convention social/models/webSignals.js established.
// Deliberately does NOT write to social/models/scorecard.js's ai_scorecard
// table — that table's `agent` column has a CHECK constraint limited to
// ('trend_forecast', 'popularity_prediction'), and scorecard.js is one of
// the existing files this pass must not edit. accuracyStats()/
// recentResolutions() below reimplement the same "track record" shape
// directly against this table instead, so ensembleForecastAgent can still
// show itself its own calibration history. See INTEGRATION NOTES at the
// bottom of ensembleForecastAgent.js for how to unify these later.
const db = require('../db');

db.exec(`
  CREATE TABLE IF NOT EXISTS ensemble_forecasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    topic TEXT NOT NULL,
    content_pillar TEXT NOT NULL CHECK (content_pillar IN (
      'product_showcase', 'tutorial_snippet', 'before_after', 'trend_jack', 'social_proof', 'behind_the_scenes'
    )),
    horizon_days INTEGER NOT NULL CHECK (horizon_days IN (1, 3, 7, 14)),
    predicted_direction TEXT NOT NULL CHECK (predicted_direction IN ('rising', 'falling', 'flat')),
    confidence REAL NOT NULL,
    confidence_low REAL,
    confidence_high REAL,
    point_estimate REAL,
    current_value REAL,
    llm_direction TEXT,
    llm_confidence REAL,
    stat_direction TEXT,
    stat_confidence REAL,
    reasoning TEXT,
    based_on TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'correct', 'incorrect', 'inconclusive')),
    actual_direction TEXT,
    actual_value REAL,
    resolution_notes TEXT,
    resolved_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_ensemble_forecasts_status ON ensemble_forecasts(status);
  CREATE INDEX IF NOT EXISTS idx_ensemble_forecasts_source_pillar ON ensemble_forecasts(source, content_pillar, created_at);
`);

const columns = `
  id, source, topic, content_pillar AS contentPillar, horizon_days AS horizonDays,
  predicted_direction AS predictedDirection, confidence, confidence_low AS confidenceLow,
  confidence_high AS confidenceHigh, point_estimate AS pointEstimate, current_value AS currentValue,
  llm_direction AS llmDirection, llm_confidence AS llmConfidence, stat_direction AS statDirection,
  stat_confidence AS statConfidence, reasoning, based_on AS basedOn, status,
  actual_direction AS actualDirection, actual_value AS actualValue, resolution_notes AS resolutionNotes,
  resolved_at AS resolvedAt, created_at AS createdAt
`;

const statements = {
  insert: db.prepare(`
    INSERT INTO ensemble_forecasts (
      source, topic, content_pillar, horizon_days, predicted_direction, confidence, confidence_low,
      confidence_high, point_estimate, current_value, llm_direction, llm_confidence, stat_direction,
      stat_confidence, reasoning, based_on
    ) VALUES (
      @source, @topic, @contentPillar, @horizonDays, @predictedDirection, @confidence, @confidenceLow,
      @confidenceHigh, @pointEstimate, @currentValue, @llmDirection, @llmConfidence, @statDirection,
      @statConfidence, @reasoning, @basedOn
    )
  `),
  findById: db.prepare(`SELECT ${columns} FROM ensemble_forecasts WHERE id = ?`),
  duePending: db.prepare(`
    SELECT ${columns} FROM ensemble_forecasts
    WHERE status = 'pending' AND datetime(created_at, '+' || horizon_days || ' days') <= datetime('now')
    ORDER BY created_at ASC
  `),
  active: db.prepare(`SELECT ${columns} FROM ensemble_forecasts WHERE status = 'pending' ORDER BY created_at DESC LIMIT @limit`),
  recentResolved: db.prepare(`
    SELECT ${columns} FROM ensemble_forecasts WHERE status != 'pending' ORDER BY resolved_at DESC LIMIT @limit
  `),
  // Most recent live (pending, not-yet-expired) forecast for a given
  // source+pillar — what trendJackScorer.js reuses instead of always paying
  // for a fresh LLM call.
  mostRecentFor: db.prepare(`
    SELECT ${columns} FROM ensemble_forecasts
    WHERE source = @source AND content_pillar = @contentPillar AND created_at >= datetime('now', @since)
    ORDER BY created_at DESC LIMIT 1
  `),
  resolve: db.prepare(`
    UPDATE ensemble_forecasts
    SET status = @status, actual_direction = @actualDirection, actual_value = @actualValue,
        resolution_notes = @resolutionNotes, resolved_at = datetime('now')
    WHERE id = @id
  `),
  statsSince: db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'correct' THEN 1 ELSE 0 END) AS correct,
      SUM(CASE WHEN status = 'incorrect' THEN 1 ELSE 0 END) AS incorrect,
      SUM(CASE WHEN status = 'inconclusive' THEN 1 ELSE 0 END) AS inconclusive,
      AVG(CASE WHEN status IN ('correct', 'incorrect') THEN confidence ELSE NULL END) AS avgConfidenceJudged
    FROM ensemble_forecasts
    WHERE status != 'pending' AND resolved_at >= datetime('now', @since)
  `)
};

function create({
  source, topic, contentPillar, horizonDays, predictedDirection, confidence, confidenceLow = null,
  confidenceHigh = null, pointEstimate = null, currentValue = null, llmDirection = null,
  llmConfidence = null, statDirection = null, statConfidence = null, reasoning = '', basedOn = ''
}) {
  const result = statements.insert.run({
    source, topic, contentPillar, horizonDays, predictedDirection, confidence, confidenceLow,
    confidenceHigh, pointEstimate, currentValue, llmDirection, llmConfidence, statDirection,
    statConfidence, reasoning, basedOn
  });
  return statements.findById.get(result.lastInsertRowid);
}

function duePending() {
  return statements.duePending.all();
}

function active(limit = 20) {
  return statements.active.all({ limit });
}

function recentResolved(limit = 20) {
  return statements.recentResolved.all({ limit });
}

function mostRecentFor(source, contentPillar, sqliteModifier = '-3 days') {
  return statements.mostRecentFor.get({ source, contentPillar, since: sqliteModifier }) || null;
}

function resolve(id, { status, actualDirection = null, actualValue = null, resolutionNotes = '' }) {
  statements.resolve.run({ id, status, actualDirection, actualValue, resolutionNotes });
  return statements.findById.get(id);
}

// Self-contained equivalent of social/models/scorecard.js's accuracyStats(),
// scoped to this table instead of ai_scorecard (see the note at the top of
// this file for why). Judged rate excludes inconclusive resolutions from the
// denominator, same convention as scorecard.js.
function accuracyStats(sqliteModifier = '-90 days') {
  const row = statements.statsSince.get({ since: sqliteModifier });
  const total = row.total || 0;
  const correct = row.correct || 0;
  const incorrect = row.incorrect || 0;
  const inconclusive = row.inconclusive || 0;
  const judged = correct + incorrect;
  return {
    total,
    correct,
    incorrect,
    inconclusive,
    accuracyPct: judged > 0 ? Number(((correct / judged) * 100).toFixed(1)) : null,
    avgConfidenceJudged: row.avgConfidenceJudged != null ? Number(row.avgConfidenceJudged.toFixed(2)) : null
  };
}

module.exports = { create, duePending, active, recentResolved, mostRecentFor, resolve, accuracyStats };
