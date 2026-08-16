// Read-only source-health monitoring: for each signal source that feeds the
// trend-intelligence system (social_trends, web_signals, community_signals,
// tiktok_signals), computes freshness (time since last capture), capture
// velocity (captures per day over the last 7 days), and a simple
// healthy/degraded/down verdict. No LLM cost, no writes to any signal
// table — purely observational, consumed by the CLI script
// social/scripts/checkSourceHealth.js and optionally exposed via an admin
// endpoint in the future.
const trendsModel = require('../models/trends');

function loadOptional(path) {
  try { return require(path); } catch { return null; }
}

const webSignalsModel = loadOptional('../models/webSignals');
const communitySignalsModel = loadOptional('../models/communitySignals');
const tiktokSignalsModel = loadOptional('../models/tiktokSignals');

// ---------------------------------------------------------------------------
// Unified recency query — returns { source, capturedAt } rows from every
// signal table, normalized to the same shape regardless of which table
// owns the data. tiktok_signals uses kind+region instead of source, so
// its rows get a prefixed source label here.
// ---------------------------------------------------------------------------

function allRecentRows(limit = 5000) {
  const rows = [];
  const trendRows = trendsModel.recent(limit, '-180 days');
  for (const r of trendRows) rows.push({ source: r.source, capturedAt: r.captured_at });

  if (webSignalsModel) {
    for (const r of webSignalsModel.recent(limit, '-180 days')) rows.push({ source: r.source, capturedAt: r.captured_at });
  }
  if (communitySignalsModel) {
    for (const r of communitySignalsModel.recent(limit, '-180 days')) rows.push({ source: r.source, capturedAt: r.captured_at });
  }
  if (tiktokSignalsModel) {
    for (const r of tiktokSignalsModel.recentHashtags(limit, '-180 days')) rows.push({ source: `tiktok_${r.kind}`, capturedAt: r.captured_at });
    for (const r of tiktokSignalsModel.recentSounds(limit, '-180 days')) rows.push({ source: `tiktok_${r.kind}`, capturedAt: r.captured_at });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Per-source freshness and velocity
// ---------------------------------------------------------------------------

function computeSourceStats(rows, now = Date.now()) {
  const bySource = new Map();
  for (const r of rows) {
    if (!bySource.has(r.source)) bySource.set(r.source, []);
    bySource.get(r.source).push(r);
  }

  const stats = [];
  const MS_PER_DAY = 86400000;
  const sevenDaysAgo = now - 7 * MS_PER_DAY;

  for (const [source, entries] of bySource) {
    const timestamps = entries
      .map((e) => new Date(e.capturedAt).getTime())
      .filter((t) => !Number.isNaN(t))
      .sort((a, b) => b - a);

    const lastSeen = timestamps.length ? new Date(timestamps[0]) : null;
    const firstSeen = timestamps.length ? new Date(timestamps[timestamps.length - 1]) : null;
    const ageHours = lastSeen ? Number(((now - lastSeen.getTime()) / 3600000).toFixed(1)) : null;

    // Velocity: captures in the last 7 days
    const recentCaptures = timestamps.filter((t) => t >= sevenDaysAgo).length;
    const velocityPerDay = Number((recentCaptures / 7).toFixed(2));

    // Verdict
    let verdict = 'healthy';
    if (ageHours === null || ageHours > 48) verdict = 'down';
    else if (ageHours > 24 || velocityPerDay < 0.5) verdict = 'degraded';

    stats.push({
      source,
      lastSeen: lastSeen ? lastSeen.toISOString() : null,
      firstSeen: firstSeen ? firstSeen.toISOString() : null,
      ageHours,
      totalCaptures: entries.length,
      recentCaptures,
      velocityPerDay,
      verdict
    });
  }

  return stats.sort((a, b) => {
    const order = { down: 0, degraded: 1, healthy: 2 };
    return (order[a.verdict] ?? 3) - (order[b.verdict] ?? 3) || (a.ageHours || 9999) - (b.ageHours || 9999);
  });
}

// ---------------------------------------------------------------------------
// Aggregate health summary
// ---------------------------------------------------------------------------

function sourceHealth() {
  const rows = allRecentRows();
  const stats = computeSourceStats(rows);

  const healthy = stats.filter((s) => s.verdict === 'healthy').length;
  const degraded = stats.filter((s) => s.verdict === 'degraded').length;
  const down = stats.filter((s) => s.verdict === 'down').length;

  return {
    totalSources: stats.length,
    healthy,
    degraded,
    down,
    overall: down > 0 ? 'degraded' : degraded > 0 ? 'degraded' : 'healthy',
    stats
  };
}

module.exports = { sourceHealth, computeSourceStats, allRecentRows };
