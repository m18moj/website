#!/usr/bin/env node
// CLI diagnostic/utility: replays trendsAgent.refresh() once to backfill
// trend captures. Safe — only writes to social_trends (the same table
// the hourly cron already populates), never touches publications,
// campaigns, or any platform API that would create public posts.
//
// Usage: node social/scripts/backfillTrends.js [count]
//   count — how many refresh cycles to replay (default: 1)
//
// Each call is idempotent: duplicate topic/source pairs from the same
// refresh just add a new row with a fresh timestamp, which
// trendEnrichment.js already handles (it collapses by source+topic over
// time windows). Purging is handled by trendsModel.purgeOld() at the
// end of each refresh.
const trendsAgent = require('../agents/trendsAgent');

const cycles = Math.max(1, parseInt(process.argv[2], 10) || 1);

async function main() {
  console.log(`[backfill] Running ${cycles} refresh cycle(s)...\n`);
  for (let i = 0; i < cycles; i++) {
    try {
      const results = await trendsAgent.refresh();
      console.log(`  Cycle ${i + 1}/${cycles}: captured ${results.length} trend rows`);
    } catch (err) {
      console.error(`  Cycle ${i + 1}/${cycles}: FAILED — ${err.message}`);
    }
  }
  console.log('\n[backfill] Done.');
}

main().catch((err) => {
  console.error('[backfill] Fatal error:', err.message);
  process.exit(1);
});
