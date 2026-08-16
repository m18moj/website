// Recurring triggers: node-cron ticks just enqueue a social_jobs row (via
// jobQueue.enqueue with a fixed dedup_key equal to the trigger name), never
// run the work directly — social/jobRunner.js picks it up. That split means
// a trigger that's still running when its next cron tick fires is a safe
// no-op (the dedup key is still active) rather than an overlapping run, and
// a process restart never loses a trigger that was about to fire.
const cron = require('node-cron');
const jobQueue = require('./jobQueue');
const config = require('./config');

const RECURRING = [
  { name: 'detect_new_products', expr: '*/5 * * * *' }, // every 5 min — catches newly-visible packs
  { name: 'poll_video_jobs', expr: '*/2 * * * *' }, // every 2 min — watches the video-pipeline hand-off
  { name: 'publish_due_posts', expr: '*/5 * * * *' }, // every 5 min — posts anything scheduled and due
  { name: 'refresh_trends', expr: '0 * * * *' }, // hourly — continuous trend ingestion, not just twice a day
  { name: 'collect_analytics', expr: '0 */6 * * *' }, // every 6 hours
  { name: 'run_learning', expr: '30 3 * * *' }, // once nightly, off-peak
  { name: 'cleanup_jobs', expr: '0 4 * * *' }, // once nightly — trims old done/failed job rows
  // Signal-source fetchers — less frequent than trend refresh to avoid rate limits
  { name: 'refresh_web_signals', expr: '15 */6 * * *' }, // every 6 hours — google trends, wikipedia, app store, news RSS
  { name: 'refresh_community_signals', expr: '45 */8 * * *' }, // every 8 hours — twitter, discord, roblox devforum, twitch
  { name: 'refresh_tiktok_trends', expr: '30 */6 * * *' }, // every 6 hours — TikTok Creative Center hashtags/sounds
  { name: 'refresh_competitors', expr: '0 */4 * * *' }, // every 4 hours — competitor channel snapshots
  // Daily analysis agents — off-peak, after data fetchers have run
  { name: 'analyze_competitors', expr: '0 2 * * *' }, // 2 AM — competitor gap analysis (LLM)
  { name: 'run_replication', expr: '15 2 * * *' }, // 2:15 AM — content DNA mining (LLM)
  { name: 'run_visual_style', expr: '30 2 * * *' }, // 2:30 AM — thumbnail/visual analysis (LLM + vision)
  { name: 'run_audio_pairing', expr: '45 2 * * *' }, // 2:45 AM — trending audio pairing
  { name: 'run_audience_request', expr: '0 3 * * *' }, // 3 AM — comment mining (blocked until fetchComments is implemented)
  { name: 'run_enrichment', expr: '10 3 * * *' }, // 3:10 AM — cross-platform correlation, arbitrage, seasonality, evergreen
  { name: 'run_sentiment_clusters', expr: '20 3 * * *' }, // 3:20 AM — LLM sentiment + topic clustering
  { name: 'purge_new_tables', expr: '45 4 * * *' } // 4:45 AM — purge old rows from web_signals, community_signals, tiktok_signals
];

function enqueueTrigger(name) {
  jobQueue.enqueue({ jobType: name, dedupKey: name, payload: {} });
}

let tasks = [];

function start() {
  tasks = RECURRING.map(({ name, expr }) => cron.schedule(expr, () => enqueueTrigger(name)));

  // Evergreen cadence is the one knob meant to be tuned per-deployment
  // (SOCIAL_EVERGREEN_PER_DAY) rather than hardcoded like the triggers above.
  const perDay = Math.max(1, config.EVERGREEN_PER_DAY);
  const everyMinutes = Math.max(5, Math.floor((24 * 60) / perDay));
  tasks.push(cron.schedule(`*/${everyMinutes} * * * *`, () => enqueueTrigger('evergreen_tick')));

  // Fire the fast-moving triggers once immediately on boot so a freshly
  // started worker doesn't sit idle until the first cron tick.
  enqueueTrigger('detect_new_products');
  enqueueTrigger('poll_video_jobs');
  enqueueTrigger('publish_due_posts');
}

function stop() {
  tasks.forEach((task) => task.stop());
  tasks = [];
}

module.exports = { start, stop };
