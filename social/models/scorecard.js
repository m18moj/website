// CRUD for ai_scorecard — the reward/punish ledger. Every time a forecast or
// popularity prediction is resolved against reality, one row is written here
// (+1 reward for correct, -1 for incorrect, 0 for inconclusive). Both
// trendForecastAgent and predictionAgent read accuracyStats()/recentFor()
// back into their own prompts before making the next prediction, which is
// what actually closes the loop for an LLM-scored system: there's no weight
// to update, so "learning" has to mean showing the model its own track
// record and asking it to calibrate against it.
const db = require('../db');

const statements = {
  insert: db.prepare(`
    INSERT INTO ai_scorecard (agent, subject_type, subject_id, outcome, predicted_value, actual_value, reward, notes)
    VALUES (@agent, @subjectType, @subjectId, @outcome, @predictedValue, @actualValue, @reward, @notes)
  `),
  recentFor: db.prepare(`SELECT * FROM ai_scorecard WHERE agent = @agent ORDER BY created_at DESC LIMIT @limit`),
  statsFor: db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN outcome = 'correct' THEN 1 ELSE 0 END) AS correct,
      SUM(CASE WHEN outcome = 'incorrect' THEN 1 ELSE 0 END) AS incorrect,
      SUM(CASE WHEN outcome = 'inconclusive' THEN 1 ELSE 0 END) AS inconclusive,
      AVG(reward) AS avgReward
    FROM ai_scorecard
    WHERE agent = @agent AND created_at >= datetime('now', @since)
  `)
};

function record({ agent, subjectType, subjectId, outcome, predictedValue = null, actualValue = null, reward, notes = '' }) {
  statements.insert.run({ agent, subjectType, subjectId, outcome, predictedValue, actualValue, reward, notes });
}

function recentFor(agent, limit = 10) {
  return statements.recentFor.all({ agent, limit });
}

// Judged (correct/incorrect) rate excludes inconclusive resolutions from the
// denominator — "not enough data to judge" shouldn't count against or for
// accuracy, only against sample size.
function accuracyStats(agent, sqliteModifier = '-90 days') {
  const row = statements.statsFor.get({ agent, since: sqliteModifier });
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
    avgReward: total > 0 ? Number((row.avgReward || 0).toFixed(2)) : null
  };
}

module.exports = { record, recentFor, accuracyStats };
