// Read-only extensions to the Video Studio Trend Intelligence tab: a
// rising-trends ranking that merges momentum direction with forecast
// confidence, a per-row explainability breakdown for a trend/forecast/
// prediction, a high-confidence-rising-trend alert feed (with an optional
// Discord/Slack webhook ping), and a downloadable weekly digest. New,
// standalone route file rather than additions to server/routes/videoAdmin.js
// (see INTEGRATION NOTES at the bottom for the one server/index.js mount
// line this needs) — everything here only reads social/models/* and
// server/models/videoAdminJobs.js, it never writes to them.
const express = require('express');
const { query, validationResult } = require('express-validator');

const { requireAdmin } = require('../middleware/auth');
const db = require('../db');
const jobsModel = require('../models/videoAdminJobs');
const trendsModel = require('../../social/models/trends');
const forecastsModel = require('../../social/models/forecasts');
const scorecardModel = require('../../social/models/scorecard');
const trendOverridesModel = require('../../social/models/trendOverrides');

const router = express.Router();
router.use(requireAdmin);

// --- Rising trends radar: momentum direction + forecast confidence, merged --

// A source-level forecast (trendForecastAgent's unit of prediction) that
// best matches a specific trend topic — exact-ish substring match first,
// falling back to that source's highest-confidence forecast so every rising
// topic still gets *some* forward-looking read when one exists.
function bestMatchForecast(forecasts, source, topic) {
  const candidates = forecasts.filter((f) => f.source === source);
  if (!candidates.length) return null;
  const topicLower = topic.toLowerCase();
  const close = candidates.find((f) => topicLower.includes(f.topic.toLowerCase()) || f.topic.toLowerCase().includes(topicLower));
  if (close) return close;
  return candidates.slice().sort((a, b) => b.confidence - a.confidence)[0];
}

router.get(
  '/rising',
  [query('days').optional().isInt({ min: 1, max: 60 }).toInt(), query('limit').optional().isInt({ min: 1, max: 100 }).toInt()],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const days = req.query.days || 14;
    const limit = req.query.limit || 25;

    const momentum = trendsModel.momentum(`-${days} days`);
    const risingMomentum = momentum.filter((m) => m.direction === 'rising');
    const risingSources = new Set(risingMomentum.map((m) => m.source));
    if (!risingSources.size) return res.json({ trends: [], momentum: risingMomentum });

    const activeForecasts = forecastsModel.active(50);
    const overrides = trendOverridesModel.list();

    const trends = trendsModel
      .recent(200, `-${days} days`)
      .filter((t) => risingSources.has(t.source))
      .map((t) => {
        const m = momentum.find((mm) => mm.source === t.source);
        const forecast = bestMatchForecast(activeForecasts, t.source, t.topic);
        return {
          id: t.id,
          source: t.source,
          topic: t.topic,
          score: t.score,
          capturedAt: t.captured_at,
          momentumDirection: m ? m.direction : null,
          changePct: m ? m.changePct : null,
          forecastConfidence: forecast ? forecast.confidence : null,
          forecastReasoning: forecast ? forecast.reasoning : null,
          override: trendOverridesModel.classify(t.topic, overrides)
        };
      })
      .filter((t) => t.override !== 'blocklist')
      .sort((a, b) => {
        if ((a.override === 'always_pursue') !== (b.override === 'always_pursue')) return a.override === 'always_pursue' ? -1 : 1;
        const confA = a.forecastConfidence || 0;
        const confB = b.forecastConfidence || 0;
        if (confB !== confA) return confB - confA;
        return (b.changePct || 0) - (a.changePct || 0);
      })
      .slice(0, limit);

    res.json({ trends, momentum: risingMomentum });
  }
);

// --- Explainability: expand a trend's raw_json / a forecast's based_on / --
// --- a prediction's reasoning into a readable breakdown -------------------

// Per-source shape of social_trends.raw_json (see social/agents/trendsAgent.js
// refresh()) — each source stores a different real payload, so the
// breakdown has to know which fields that source actually captured rather
// than dumping the same generic keys for everything.
function buildTrendBreakdown(source, raw) {
  if (source === 'youtube_trending_gaming' || source === 'youtube_search_roblox') {
    return [
      { label: 'Signal', value: source === 'youtube_trending_gaming' ? "YouTube's Gaming trending chart" : 'YouTube search for "roblox script exploit"' },
      { label: 'Channel', value: raw.channelTitle || 'unknown' },
      { label: 'View count', value: raw.viewCount != null ? Number(raw.viewCount).toLocaleString() : 'unknown' },
      { label: 'Published', value: raw.publishedAt || 'unknown' },
      { label: 'Video ID', value: raw.id || 'unknown' }
    ];
  }
  if (source === 'reddit_roblox') {
    return [
      { label: 'Signal', value: 'Reddit Roblox/dev subreddit top posts (day)' },
      { label: 'Subreddit', value: raw.subreddit ? `r/${raw.subreddit}` : 'unknown' },
      { label: 'Upvotes', value: raw.score != null ? Number(raw.score).toLocaleString() : 'unknown' },
      { label: 'Comments', value: raw.numComments != null ? String(raw.numComments) : 'unknown' },
      { label: 'Link', value: raw.permalink || 'unknown' }
    ];
  }
  if (source === 'llm_synthesis_tiktok') {
    return [
      { label: 'Signal', value: 'Claude synthesis of the YouTube + Reddit signals above into a TikTok-specific angle' },
      { label: 'Note', value: 'No independent raw source data captured for this row — it is an AI-proposed angle, not a directly-measured metric.' }
    ];
  }
  return [
    { label: 'Signal', value: source },
    { label: 'Raw data', value: Object.keys(raw).length ? JSON.stringify(raw) : '(none captured)' }
  ];
}

router.get(
  '/explain',
  [query('type').isIn(['trend', 'forecast', 'prediction']), query('id').isInt().toInt()],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { type, id } = req.query;

    if (type === 'trend') {
      const row = db.prepare('SELECT id, source, topic, score, raw_json AS rawJson, captured_at AS capturedAt FROM social_trends WHERE id = ?').get(id);
      if (!row) return res.status(404).json({ error: 'Trend not found.' });
      let raw = {};
      try { raw = JSON.parse(row.rawJson || '{}'); } catch { /* legacy/malformed row */ }
      return res.json({
        type,
        subject: { id: row.id, source: row.source, topic: row.topic, score: row.score, capturedAt: row.capturedAt },
        breakdown: buildTrendBreakdown(row.source, raw)
      });
    }

    if (type === 'forecast') {
      const row = db
        .prepare(
          `SELECT id, source, topic, predicted_direction AS predictedDirection, confidence, reasoning, based_on AS basedOn,
                  horizon_days AS horizonDays, status, actual_direction AS actualDirection, resolution_notes AS resolutionNotes,
                  created_at AS createdAt, resolved_at AS resolvedAt
           FROM trend_forecasts WHERE id = ?`
        )
        .get(id);
      if (!row) return res.status(404).json({ error: 'Forecast not found.' });
      const breakdown = [
        { label: 'Predicted direction', value: row.predictedDirection },
        { label: 'Confidence', value: `${Math.round((row.confidence || 0) * 100)}%` },
        { label: 'Reasoning', value: row.reasoning || '(none given)' },
        { label: 'Based on', value: row.basedOn || '(not recorded)' },
        { label: 'Horizon', value: `${row.horizonDays} days from ${row.createdAt}` },
        { label: 'Status', value: row.status }
      ];
      if (row.status !== 'pending') {
        breakdown.push(
          { label: 'Actual direction', value: row.actualDirection || 'unknown' },
          { label: 'Resolution notes', value: row.resolutionNotes || '(none)' },
          { label: 'Resolved at', value: row.resolvedAt }
        );
      }
      return res.json({ type, subject: row, breakdown });
    }

    // type === 'prediction' — a render's popularity-prediction row (see
    // social/agents/predictionAgent.js), keyed by its video_admin_jobs id.
    const job = jobsModel.findById(id);
    if (!job || !job.prediction) return res.status(404).json({ error: 'No popularity prediction recorded for this render.' });
    const p = job.prediction;
    const breakdown = [
      { label: 'Predicted score', value: `${Math.round(p.score)}/100` },
      { label: 'Confidence', value: `${Math.round((p.confidence || 0) * 100)}%` },
      { label: 'Reasoning', value: p.reasoning || '(none given)' },
      { label: 'Weaknesses flagged', value: (p.weaknesses || []).length ? p.weaknesses.join('; ') : '(none flagged)' }
    ];
    return res.json({
      type,
      subject: { id: job.id, kind: job.kind, packId: job.packId, angle: job.angle, pacing: job.pacing, length: job.length, quality: job.quality },
      breakdown
    });
  }
);

// --- Alerts: high-confidence rising trends crossing a threshold -----------
//
// Stateless recompute on every poll (no new table needed for what's already
// a lightweight in-dashboard banner) — the only state kept is an in-memory
// per-topic "last webhook ping" map, purely to stop a Discord/Slack webhook
// (see maybeNotifyWebhook below) from re-firing every few seconds while the
// dashboard tab is left open polling; it resets on server restart, which is
// harmless since the alert itself is always recomputed fresh from real data.
const ALERT_THRESHOLD = { minChangePct: 15, minConfidence: 0.6 };
const lastWebhookPingAt = new Map();
const WEBHOOK_REPEAT_GAP_MS = 6 * 60 * 60 * 1000;

async function maybeNotifyWebhook(alerts) {
  const url = process.env.TREND_ALERT_WEBHOOK_URL;
  if (!url || !alerts.length) return;
  const fresh = alerts.filter((a) => {
    const key = `${a.source}::${a.topic}`;
    const last = lastWebhookPingAt.get(key);
    if (last && Date.now() - last < WEBHOOK_REPEAT_GAP_MS) return false;
    lastWebhookPingAt.set(key, Date.now());
    return true;
  });
  if (!fresh.length) return;
  // Discord expects `content`, Slack expects `text` — sending both in one
  // payload lets either webhook URL work without asking which service it is.
  const message = fresh
    .map((a) => `📈 ${a.topic} (${a.source}) — momentum +${a.changePct}%, forecast confidence ${Math.round(a.confidence * 100)}%`)
    .join('\n');
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: message, text: message }) });
  } catch (err) {
    console.error(`[trend-insights] webhook notify failed: ${err.message}`);
  }
}

router.get('/alerts', async (req, res) => {
  const momentum = trendsModel.momentum('-14 days').filter((m) => m.direction === 'rising' && m.changePct >= ALERT_THRESHOLD.minChangePct);
  const activeForecasts = forecastsModel.active(50);
  const overrides = trendOverridesModel.list();

  const alerts = [];
  for (const m of momentum) {
    const forecast = activeForecasts.find((f) => f.source === m.source && f.predictedDirection === 'rising' && f.confidence >= ALERT_THRESHOLD.minConfidence);
    if (!forecast) continue;
    if (trendOverridesModel.classify(forecast.topic, overrides) === 'blocklist') continue;
    alerts.push({ source: m.source, topic: forecast.topic, changePct: m.changePct, confidence: forecast.confidence, reasoning: forecast.reasoning });
  }

  maybeNotifyWebhook(alerts).catch(() => {});
  res.json({ alerts, threshold: ALERT_THRESHOLD, webhookConfigured: Boolean(process.env.TREND_ALERT_WEBHOOK_URL) });
});

// --- Weekly digest export (CSV / Markdown) --------------------------------

function csvField(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildDigestData(days) {
  const since = `-${days} days`;
  const cutoffMs = Date.now() - days * 86400000;
  const topTrends = trendsModel.recent(30, since);
  const resolvedForecasts = forecastsModel
    .recentResolved(50)
    .filter((f) => f.resolvedAt && new Date(`${f.resolvedAt.replace(' ', 'T')}Z`).getTime() >= cutoffMs);
  const scorecard = {
    trendForecast: scorecardModel.accuracyStats('trend_forecast', since),
    popularityPrediction: scorecardModel.accuracyStats('popularity_prediction', since)
  };
  return { days, topTrends, resolvedForecasts, scorecard };
}

function digestToCsv({ topTrends, resolvedForecasts, scorecard }) {
  const lines = ['section,topic,source,detail,confidence_or_accuracy_pct,notes'];
  for (const t of topTrends) lines.push([csvField('trend'), csvField(t.topic), csvField(t.source), csvField(t.score), '', ''].join(','));
  for (const f of resolvedForecasts) {
    lines.push(
      [
        csvField('forecast'),
        csvField(f.topic),
        csvField(f.source),
        csvField(f.predictedDirection),
        csvField(Math.round((f.confidence || 0) * 100)),
        csvField(`${f.status}${f.actualDirection ? ` (actual: ${f.actualDirection})` : ''}`)
      ].join(',')
    );
  }
  lines.push(
    [csvField('accuracy'), csvField('trend_forecast'), '', '', csvField(scorecard.trendForecast.accuracyPct ?? ''), csvField(`${scorecard.trendForecast.total} resolved`)].join(',')
  );
  lines.push(
    [
      csvField('accuracy'),
      csvField('popularity_prediction'),
      '',
      '',
      csvField(scorecard.popularityPrediction.accuracyPct ?? ''),
      csvField(`${scorecard.popularityPrediction.total} resolved`)
    ].join(',')
  );
  return lines.join('\n');
}

function digestToMarkdown({ days, topTrends, resolvedForecasts, scorecard }) {
  const lines = [`# Trend digest — last ${days} days`, ''];
  lines.push('## What trended', '');
  lines.push(...(topTrends.length ? topTrends.slice(0, 20).map((t) => `- **${t.topic}** (${t.source}, score ${t.score})`) : ['_No trend captures in this window._']));
  lines.push('', '## What was forecast', '');
  lines.push(
    ...(resolvedForecasts.length
      ? resolvedForecasts.map(
          (f) =>
            `- [${f.status === 'correct' ? '✓' : f.status === 'incorrect' ? '✗' : '?'}] **${f.topic}** (${f.source}) — predicted ${f.predictedDirection} at ${Math.round((f.confidence || 0) * 100)}% confidence${f.actualDirection ? `, actually ${f.actualDirection}` : ''}`
        )
      : ['_No forecasts resolved in this window._'])
  );
  lines.push('', '## Forecast accuracy', '');
  lines.push(`- Trend forecasts: ${scorecard.trendForecast.accuracyPct != null ? `${scorecard.trendForecast.accuracyPct}%` : 'n/a'} (${scorecard.trendForecast.total} resolved)`);
  lines.push(`- Popularity predictions: ${scorecard.popularityPrediction.accuracyPct != null ? `${scorecard.popularityPrediction.accuracyPct}%` : 'n/a'} (${scorecard.popularityPrediction.total} resolved)`);
  return lines.join('\n');
}

router.get('/digest', [query('format').optional().isIn(['csv', 'md']), query('days').optional().isInt({ min: 1, max: 90 }).toInt()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const format = req.query.format === 'md' ? 'md' : 'csv';
  const days = req.query.days || 7;
  const data = buildDigestData(days);

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="trend-digest-${days}d.csv"`);
    return res.send(digestToCsv(data));
  }
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="trend-digest-${days}d.md"`);
  res.send(digestToMarkdown(data));
});

module.exports = router;

// INTEGRATION NOTES:
// - Needs exactly one line added to server/index.js, next to the other
//   `/api/*` route mounts (after `app.use('/api/video-admin', videoAdminRoutes);`):
//     const trendInsightsRoutes = require('./routes/trendInsights');
//     app.use('/api/trend-insights', trendInsightsRoutes);
// - If maintenance mode should still let an admin view trend intelligence
//   while the site is down (same reasoning as the existing '/video-admin'
//   entry), also add '/trend-insights' to the `allowedPrefixes` array in
//   the maintenance-mode gate a few lines above the route mounts.
// - Optional env var: TREND_ALERT_WEBHOOK_URL — a Discord or Slack
//   incoming-webhook URL. When set, GET /api/trend-insights/alerts pings it
//   (rate-limited to once per topic per 6h) whenever a rising trend crosses
//   the confidence/momentum threshold. Unset by default; the in-dashboard
//   alert banner works with no webhook at all. Add it to video/.env or the
//   project root .env, whichever this deployment already uses for secrets
//   (see envKeyPresent() in server/routes/videoAdmin.js for the existing
//   fallback chain, if a later pass wants to surface "configured" status).
// - No other tab's instructions mention server/index.js, so this mount is
//   safe to add without conflicting with parallel work.
