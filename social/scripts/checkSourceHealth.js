#!/usr/bin/env node
// CLI diagnostic: prints a per-source health report to stdout. Safe, read-only,
// no side effects. Run via: node social/scripts/checkSourceHealth.js
const { sourceHealth } = require('../lib/sourceHealth');

const health = sourceHealth();

console.log(`\n=== Signal Source Health Report ===`);
console.log(`Overall: ${health.overall} (${health.healthy} healthy, ${health.degraded} degraded, ${health.down} down out of ${health.totalSources} sources)\n`);

if (!health.stats.length) {
  console.log('No signal sources have been captured yet.');
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n);
console.log(
  `${pad('Source', 30)} ${pad('Verdict', 10)} ${pad('Age (hrs)', 10)} ${pad('Captures', 10)} ${pad('7d velocity', 12)}`
);
console.log('-'.repeat(82));
for (const s of health.stats) {
  console.log(
    `${pad(s.source, 30)} ${pad(s.verdict, 10)} ${pad(s.ageHours != null ? String(s.ageHours) : 'n/a', 10)} ${pad(String(s.totalCaptures), 10)} ${pad(String(s.velocityPerDay) + '/day', 12)}`
  );
}
console.log('');
