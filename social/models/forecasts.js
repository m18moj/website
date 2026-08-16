// CRUD for trend_forecasts — social/agents/trendForecastAgent.js writes
// "what's going to happen next" predictions here, and resolves them once
// their horizon passes by comparing against real momentum recomputed at
// resolution time. Read by the Video Studio Trend Intelligence tab
// (server/routes/videoAdmin.js) and by strategyAgent's prompt (via
// trendsModel.momentum() already; forecasts add the forward-looking half).
const db = require('../db');

const columns = `
  id, source, topic, predicted_direction AS predictedDirection, confidence, reasoning,
  based_on AS basedOn, horizon_days AS horizonDays, status, actual_direction AS actualDirection,
  resolution_notes AS resolutionNotes, resolved_at AS resolvedAt, created_at AS createdAt
`;

const statements = {
  insert: db.prepare(`
    INSERT INTO trend_forecasts (source, topic, predicted_direction, confidence, reasoning, based_on, horizon_days)
    VALUES (@source, @topic, @predictedDirection, @confidence, @reasoning, @basedOn, @horizonDays)
  `),
  findById: db.prepare(`SELECT ${columns} FROM trend_forecasts WHERE id = ?`),
  // Forecasts whose horizon has passed and haven't been resolved yet — the
  // work list for trendForecastAgent.resolveForecasts().
  duePending: db.prepare(`
    SELECT ${columns} FROM trend_forecasts
    WHERE status = 'pending' AND datetime(created_at, '+' || horizon_days || ' days') <= datetime('now')
    ORDER BY created_at ASC
  `),
  active: db.prepare(`SELECT ${columns} FROM trend_forecasts WHERE status = 'pending' ORDER BY created_at DESC LIMIT @limit`),
  recentResolved: db.prepare(`
    SELECT ${columns} FROM trend_forecasts WHERE status != 'pending' ORDER BY resolved_at DESC LIMIT @limit
  `),
  resolve: db.prepare(`
    UPDATE trend_forecasts
    SET status = @status, actual_direction = @actualDirection, resolution_notes = @resolutionNotes, resolved_at = datetime('now')
    WHERE id = @id
  `)
};

function create({ source, topic, predictedDirection, confidence, reasoning = '', basedOn = '', horizonDays = 7 }) {
  const result = statements.insert.run({ source, topic, predictedDirection, confidence, reasoning, basedOn, horizonDays });
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

function resolve(id, { status, actualDirection = null, resolutionNotes = '' }) {
  statements.resolve.run({ id, status, actualDirection, resolutionNotes });
  return statements.findById.get(id);
}

module.exports = { create, duePending, active, recentResolved, resolve };
