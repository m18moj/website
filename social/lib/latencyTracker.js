// Lightweight pipeline-latency tracker: wraps any async function and records
// its wall-clock duration to the pipeline_latency table (see
// social/models/pipelineLatency.js). Intended to be called from
// social/orchestrator.js around each handler invocation so pipeline-wide
// latency data accumulates automatically without the handlers themselves
// needing to know about it.
//
// Usage:
//   const { timed } = require('../lib/latencyTracker');
//   const result = await timed('run_strategy', () => runStrategy(campaignId));
//
// The table is append-only (no updates/deletes) and purged by the same
// purge_new_tables scheduler entry that cleans up web_signals /
// community_signals / tiktok_signals.
const latencyModel = require('../models/pipelineLatency');

// Wraps an async function, records its duration, and returns the result.
// If the function throws, the error is recorded but NOT swallowed — the
// caller still gets the throw so retry/error-handling logic upstream
// isn't bypassed.
async function timed(stage, fn) {
  const start = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - start;
    latencyModel.record({ stage, durationMs, ok: true });
    return result;
  } catch (err) {
    const durationMs = Date.now() - start;
    latencyModel.record({ stage, durationMs, ok: false, error: err.message || String(err) });
    throw err;
  }
}

// Convenience: measure a synchronous block.
function timedSync(stage, fn) {
  const start = Date.now();
  try {
    const result = fn();
    const durationMs = Date.now() - start;
    latencyModel.record({ stage, durationMs, ok: true });
    return result;
  } catch (err) {
    const durationMs = Date.now() - start;
    latencyModel.record({ stage, durationMs, ok: false, error: err.message || String(err) });
    throw err;
  }
}

// Quick summary of latency for a stage over the recent window.
function recentStats(stage, limit = 100) {
  return latencyModel.recentStats(stage, limit);
}

module.exports = { timed, timedSync, recentStats };
