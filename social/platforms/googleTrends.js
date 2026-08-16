// Google Trends has no official public API. This uses the same undocumented
// JSON endpoint the trends.google.com website itself calls (widely relied on
// by open-source Trends clients) rather than an unofficial third-party
// wrapper package, so there's no extra dependency to trust. Two-step flow:
// 1) /api/explore resolves a request into a signed per-widget `token`.
// 2) /api/widgetdata/multiline uses that token to fetch the actual
//    interest-over-time series (0-100, relative to the request's own peak).
// Both responses are prefixed with a `)]}',` XSSI-protection line before the
// JSON body, which has to be stripped before parsing. Because this endpoint
// is undocumented it can change shape or start rate-limiting without notice
// — every failure mode (network, non-200, bad prefix, missing widget,
// missing token) is caught and degrades to { ok:false, reason }, same
// never-throw convention as platforms/reddit.js and platforms/youtube.js.
const EXPLORE_URL = 'https://trends.google.com/trends/api/explore';
const WIDGETDATA_URL = 'https://trends.google.com/trends/api/widgetdata/multiline';

const KEYWORDS = (process.env.GOOGLE_TRENDS_KEYWORDS || 'roblox scripts,roblox exploit,roblox executor')
  .split(',').map((s) => s.trim()).filter(Boolean);
const GEO = process.env.GOOGLE_TRENDS_GEO || '';
const TIMEFRAME = process.env.GOOGLE_TRENDS_TIMEFRAME || 'now 7-d';

// Google Trends' "compare" request only accepts up to 5 terms at once.
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Strips the ")]}'," XSSI-protection prefix by finding the first '{' rather
// than assuming a fixed offset, since the exact prefix length has drifted
// between Google Trends deployments in the past.
function parseGuardedJson(text) {
  const start = text.indexOf('{');
  if (start === -1) throw new Error('no JSON object found in response');
  return JSON.parse(text.slice(start));
}

async function fetchBatch(keywords, geo, timeframe) {
  const exploreReq = {
    comparisonItem: keywords.map((keyword) => ({ keyword, geo, time: timeframe })),
    category: 0,
    property: ''
  };
  const exploreUrl = `${EXPLORE_URL}?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(exploreReq))}`;

  const exploreRes = await fetch(exploreUrl);
  if (!exploreRes.ok) throw new Error(`explore HTTP ${exploreRes.status}`);
  const exploreData = parseGuardedJson(await exploreRes.text());

  const widget = (exploreData.widgets || []).find((w) => w.id === 'TIMESERIES');
  if (!widget || !widget.token) throw new Error('no TIMESERIES widget/token in explore response');

  const widgetUrl = `${WIDGETDATA_URL}?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(widget.request))}&token=${encodeURIComponent(widget.token)}`;
  const widgetRes = await fetch(widgetUrl);
  if (!widgetRes.ok) throw new Error(`widgetdata HTTP ${widgetRes.status}`);
  const widgetData = parseGuardedJson(await widgetRes.text());

  const timeline = widgetData?.default?.timelineData || [];
  if (!timeline.length) throw new Error('empty timelineData');

  const latest = timeline[timeline.length - 1];
  const earlier = timeline.slice(0, -1);

  return keywords.map((keyword, i) => {
    const series = timeline.map((point) => Number(point.value?.[i] || 0));
    const latestValue = Number(latest.value?.[i] || 0);
    const earlierAvg = earlier.length ? earlier.reduce((sum, p) => sum + Number(p.value?.[i] || 0), 0) / earlier.length : 0;
    return {
      topic: keyword,
      keyword,
      score: latestValue,
      latestValue,
      earlierAvg: Number(earlierAvg.toFixed(2)),
      raw: { geo, timeframe, points: timeline.map((p) => ({ time: p.formattedTime || p.time, value: Number(p.value?.[i] || 0) })) }
    };
  });
}

async function fetchInterestOverTime({ keywords = KEYWORDS, geo = GEO, timeframe = TIMEFRAME } = {}) {
  if (!keywords.length) return { ok: false, reason: 'no keywords configured' };

  const items = [];
  const errors = [];
  for (const batch of chunk(keywords, 5)) {
    try {
      items.push(...(await fetchBatch(batch, geo, timeframe)));
    } catch (err) {
      errors.push(`[${batch.join(', ')}] ${err.message}`);
    }
  }

  if (!items.length) return { ok: false, reason: errors.join('; ') || 'no data returned' };
  return errors.length ? { ok: true, items, errors } : { ok: true, items };
}

module.exports = { fetchInterestOverTime };

// INTEGRATION NOTES:
// - Add GOOGLE_TRENDS_KEYWORDS / GOOGLE_TRENDS_GEO / GOOGLE_TRENDS_TIMEFRAME
//   to whatever env-var documentation the project keeps (e.g. .env.example),
//   same as REDDIT_* vars for platforms/reddit.js. Defaults work with zero
//   configuration.
// - trendsAgent.refresh() should call fetchInterestOverTime() and record()
//   each item into social/models/webSignals.js with source
//   'google_trends_<keyword>' or a single 'google_trends' source (topic
//   already carries the keyword) — see webSignals.js's INTEGRATION NOTES.
// - This endpoint is undocumented and Google may rate-limit or block
//   datacenter IPs; the scheduler should call this on a much longer interval
//   (e.g. every few hours, not every poll tick) and treat repeated
//   { ok:false } as expected/non-fatal rather than alerting.
