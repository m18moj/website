// Polls social_jobs for due work and dispatches each to its handler in
// social/orchestrator.js. A plain setInterval poll loop rather than an
// event-driven queue — appropriate at this system's scale (a handful of
// campaigns in flight at once) and keeps the whole thing dependency-free
// (no Redis/broker to run alongside SQLite).
const config = require('./config');
const jobQueue = require('./jobQueue');
const orchestrator = require('./orchestrator');

const WORKER_ID = `social-worker-${process.pid}`;

async function tick() {
  const jobs = jobQueue.claimBatch(config.BATCH_SIZE, WORKER_ID);
  for (const job of jobs) {
    const handler = orchestrator.handlers[job.job_type];
    if (!handler) {
      console.error(`[social] no handler registered for job_type "${job.job_type}" (job ${job.id})`);
      jobQueue.fail(job.id, new Error(`Unknown job_type: ${job.job_type}`));
      continue;
    }
    try {
      const result = await handler(job);
      jobQueue.complete(job.id);
      if (result && typeof result === 'object') console.log(`[social] ${job.job_type} #${job.id} done —`, result);
    } catch (err) {
      console.error(`[social] job ${job.id} (${job.job_type}) failed:`, err.message);
      jobQueue.fail(job.id, err);
    }
  }
}

let timer = null;

function start() {
  if (timer) return;
  timer = setInterval(() => {
    tick().catch((err) => console.error('[social] job runner tick error:', err));
  }, config.POLL_INTERVAL_MS);
  tick().catch((err) => console.error('[social] job runner tick error:', err));
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick };
