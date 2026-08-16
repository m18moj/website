const config = require('./config');

// Bootstraps the shared DB connection (server/db.js runs its schema/migration
// setup on require) before anything else touches it — same pattern
// discord-bot/index.js uses for the same shared SQLite file.
require('./db');

const scheduler = require('./scheduler');
const jobRunner = require('./jobRunner');

console.log(`[social] Starting AI/Social worker — SOCIAL_ENABLED=${config.ENABLED} SOCIAL_DRY_RUN=${config.DRY_RUN}`);
if (!config.ANTHROPIC_API_KEY) {
  console.warn('[social] ANTHROPIC_API_KEY is not set — every LLM-backed pipeline stage will fail (and retry/backoff) until social/.env is configured.');
}
if (!config.ENABLED) {
  console.warn('[social] SOCIAL_ENABLED is not "true" — the pipeline will still run end-to-end (strategy/script/creative/QA/scheduling), but nothing will ever actually publish to TikTok/YouTube. Set SOCIAL_ENABLED=true in social/.env when ready to go live.');
}

process.on('unhandledRejection', (err) => console.error('[social] Unhandled rejection:', err));

scheduler.start();
jobRunner.start();

function shutdown() {
  console.log('\n[social] Shutting down…');
  scheduler.stop();
  jobRunner.stop();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
