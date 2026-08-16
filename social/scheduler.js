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
  { name: 'refresh_trends', expr: '0 */12 * * *' }, // twice a day
  { name: 'collect_analytics', expr: '0 */6 * * *' }, // every 6 hours
  { name: 'run_learning', expr: '30 3 * * *' }, // once nightly, off-peak
  { name: 'cleanup_jobs', expr: '0 4 * * *' } // once nightly — trims old done/failed job rows
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
