#!/usr/bin/env node
// CLI diagnostic: evaluates trend-forecast accuracy across different
// historical horizons to help pick the best default for
// trendForecastAgent. Safe, read-only — only reads trend_forecasts and
// ai_scorecard, never writes or deletes anything.
//
// Usage: node social/scripts/forecastHorizonExperiment.js
//
// Groups resolved trend_forecasts by their horizon_days, computes
// accuracy (correct / (correct + incorrect)) per group, and prints a
// summary table so an admin can see which horizon the system is most
// reliable at predicting.
const db = require('../db');

const rows = db
  .prepare(`
    SELECT
      horizon_days AS horizonDays,
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'correct' THEN 1 ELSE 0 END) AS correct,
      SUM(CASE WHEN status = 'incorrect' THEN 1 ELSE 0 END) AS incorrect,
      SUM(CASE WHEN status = 'inconclusive' THEN 1 ELSE 0 END) AS inconclusive,
      AVG(confidence) AS avgConfidence
    FROM trend_forecasts
    WHERE status != 'pending'
    GROUP BY horizon_days
    ORDER BY horizon_days
  `)
  .all();

console.log('\n=== Forecast Horizon Accuracy Experiment ===\n');

if (!rows.length) {
  console.log('No resolved trend forecasts exist yet. Let the system run for a few days and re-check.');
  process.exit(0);
}

const pad = (s, n) => String(s).padStart(n);
console.log(
  `  Horizon   Total   Correct   Incorrect   Inconclusive   Accuracy   Avg Confidence`
);
console.log('  ' + '-'.repeat(85));

for (const r of rows) {
  const judged = r.correct + r.incorrect;
  const accuracy = judged > 0 ? ((r.correct / judged) * 100).toFixed(1) : 'n/a';
  const avgConf = r.avgConfidence != null ? (r.avgConfidence * 100).toFixed(1) + '%' : 'n/a';
  console.log(
    `  ${pad(r.horizonDays + 'd', 8)} ${pad(r.total, 6)} ${pad(r.correct, 9)} ${pad(r.incorrect, 12)} ${pad(r.inconclusive, 15)} ${pad(accuracy + '%', 10)} ${avgConf}`
  );
}

// Overall stats
const overall = db
  .prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'correct' THEN 1 ELSE 0 END) AS correct,
      SUM(CASE WHEN status = 'incorrect' THEN 1 ELSE 0 END) AS incorrect
    FROM trend_forecasts
    WHERE status != 'pending'
  `)
  .get();

const judged = overall.correct + overall.incorrect;
if (judged > 0) {
  console.log(`\n  Overall accuracy: ${((overall.correct / judged) * 100).toFixed(1)}% (${overall.correct}/${judged} judged, ${overall.total} total)`);
} else {
  console.log('\n  No judged forecasts yet.');
}
console.log('');
