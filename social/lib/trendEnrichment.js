// Second analytics layer over the trend signal captured by social_trends and
// (where present) the newer signal tables other passes have been landing
// alongside it — web_signals, community_signals, tiktok_signals. Where
// social/models/trends.js answers "what's happening and is it rising", this
// module answers seven higher-order questions those raw captures alone
// don't: does a signal on one source predict another N days later, is
// YouTube momentum going uncovered on TikTok, do topics recur on a
// schedule, which topics are evergreen vs. one-off spikes, what's the
// emotional tone of the community discussion, which near-duplicate topic
// strings are actually the same thing, and how much should each source be
// trusted based on its forecasting track record. All of it reads existing
// models read-only (never writes to social_trends or any other table this
// file doesn't own) and persists its own derived output via
// social/models/trendEnrichmentStore.js.
//
// The newer signal tables are feature-detected via a try/catch require so
// this still works standalone (falling back to social_trends alone) before
// or if any of them isn't present in a given checkout — see loadOptional()
// below. Every function that reads signal rows goes through allSignalRows(),
// so a table landing later is picked up automatically without this file
// needing to change.
const trendsModel = require('../models/trends');
const scorecardModel = require('../models/scorecard');
const forecastsModel = require('../models/forecasts');
const store = require('../models/trendEnrichmentStore');
const { structured, isConfigured } = require('../agents/llm');

function loadOptional(path) {
  try { return require(path); } catch { return null; }
}

const webSignalsModel = loadOptional('../models/webSignals');
const communitySignalsModel = loadOptional('../models/communitySignals');
const tiktokSignalsModel = loadOptional('../models/tiktokSignals');

// ---------------------------------------------------------------------------
// Unified signal rows — every source normalized to {source, topic, score,
// capturedAt}, regardless of which table/model it actually lives in. This is
// the one place table-shape differences (tiktok_signals uses kind+region
// instead of source, for example) get absorbed, so every analysis below can
// stay source-agnostic.
// ---------------------------------------------------------------------------

function fromGenericSignalModel(model, sqliteModifier) {
  if (!model) return [];
  return model.recent(5000, sqliteModifier).map((r) => ({
    source: r.source,
    topic: r.topic,
    score: r.score,
    capturedAt: r.captured_at
  }));
}

function tiktokSignalRows(sqliteModifier) {
  if (!tiktokSignalsModel) return [];
  const hashtags = tiktokSignalsModel.recentHashtags(2000, sqliteModifier);
  const sounds = tiktokSignalsModel.recentSounds(2000, sqliteModifier);
  return [...hashtags, ...sounds].map((r) => ({
    source: `tiktok_${r.kind}`,
    topic: r.topic,
    score: r.score,
    capturedAt: r.captured_at
  }));
}

function allSignalRows(sqliteModifier = '-180 days') {
  return [
    ...fromGenericSignalModel(trendsModel, sqliteModifier),
    ...fromGenericSignalModel(webSignalsModel, sqliteModifier),
    ...fromGenericSignalModel(communitySignalsModel, sqliteModifier),
    ...tiktokSignalRows(sqliteModifier)
  ];
}

function availableSources(sqliteModifier = '-180 days') {
  return Array.from(new Set(allSignalRows(sqliteModifier).map((r) => r.source))).sort();
}

// ---------------------------------------------------------------------------
// (1) Cross-platform correlation scoring, with lag
// ---------------------------------------------------------------------------

function dailySeriesBySource(rows) {
  const bySource = new Map();
  for (const r of rows) {
    if (!r.capturedAt) continue;
    const day = r.capturedAt.slice(0, 10);
    if (!bySource.has(r.source)) bySource.set(r.source, new Map());
    const days = bySource.get(r.source);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(r.score);
  }
  const out = new Map();
  for (const [source, days] of bySource) {
    const series = new Map();
    for (const [day, scores] of days) series.set(day, scores.reduce((a, b) => a + b, 0) / scores.length);
    out.set(source, series);
  }
  return out;
}

function addDays(dayStr, n) {
  const d = new Date(`${dayStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX, dy = ys[i] - meanY;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  if (dx2 === 0 || dy2 === 0) return null;
  return num / Math.sqrt(dx2 * dy2);
}

// Compares leaderSeries[day] against followerSeries[day + lagDays] — i.e.
// "does the leader's score on day X predict the follower's score lagDays
// later" — over whatever days both series actually cover after the shift.
function lagCorrelation(leaderSeries, followerSeries, lagDays) {
  const xs = [], ys = [];
  for (const [day, leaderVal] of leaderSeries) {
    const shifted = addDays(day, lagDays);
    if (followerSeries.has(shifted)) { xs.push(leaderVal); ys.push(followerSeries.get(shifted)); }
  }
  return { n: xs.length, r: pearson(xs, ys) };
}

function bestLagFor(leaderSeries, followerSeries, maxLagDays, minOverlapDays) {
  let best = null;
  for (let lag = 0; lag <= maxLagDays; lag++) {
    const { n, r } = lagCorrelation(leaderSeries, followerSeries, lag);
    if (r === null || n < minOverlapDays) continue;
    if (!best || Math.abs(r) > Math.abs(best.correlation)) best = { lagDays: lag, correlation: Number(r.toFixed(3)), sampleDays: n };
  }
  return best;
}

// Every ordered pair of distinct sources (direction matters — "reddit leads
// tiktok" and "tiktok leads reddit" are different claims), scored by the
// strongest correlation found across 0..maxLagDays. Generalizes item (1)'s
// "does Reddit/YouTube predict TikTok" ask to whatever sources actually
// exist at runtime rather than hardcoding source names that may not match
// what trendsAgent/webSignals/communitySignals/tiktokSignals happen to be
// recording.
function crossPlatformCorrelationReport({ maxLagDays = 7, sqliteModifier = '-180 days', minAbsCorrelation = 0.3, minOverlapDays = 5 } = {}) {
  const bySource = dailySeriesBySource(allSignalRows(sqliteModifier));
  const sources = Array.from(bySource.keys());
  const results = [];
  for (const leader of sources) {
    for (const follower of sources) {
      if (leader === follower) continue;
      const best = bestLagFor(bySource.get(leader), bySource.get(follower), maxLagDays, minOverlapDays);
      if (best && Math.abs(best.correlation) >= minAbsCorrelation) {
        results.push({ leadingSource: leader, followingSource: follower, ...best });
      }
    }
  }
  return results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}

function persistCorrelations(opts) {
  const results = crossPlatformCorrelationReport(opts);
  for (const r of results) store.upsert({ kind: 'correlation', key: `${r.leadingSource}->${r.followingSource}`, payload: r });
  return results;
}

// ---------------------------------------------------------------------------
// Shared text-similarity helper, used by both the arbitrage detector (2) and
// topic clustering (6) — no embeddings endpoint is wired into social/agents/
// llm.js (Anthropic messages API only), so both lean on cheap token-overlap
// similarity, with an LLM batch pass available for higher-precision naming.
// ---------------------------------------------------------------------------

function tokenize(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// (2) YouTube -> TikTok arbitrage detector
// ---------------------------------------------------------------------------

// Topics with real YouTube Gaming momentum but no comparable TikTok-side
// coverage yet (tiktok_signals if present, otherwise whatever source names
// contain "tiktok" — e.g. trendsAgent's 'llm_synthesis_tiktok'). A topic
// counts as "covered" if any TikTok-side topic's token overlap with it
// clears similarityThreshold; below that, it's flagged as an opportunity.
function detectArbitrage({ sqliteModifier = '-14 days', similarityThreshold = 0.25, minYoutubeScore = 0 } = {}) {
  const rows = allSignalRows(sqliteModifier);
  const youtubeRows = rows.filter((r) => r.source.includes('youtube') && r.score >= minYoutubeScore);
  const tiktokTokenSets = rows
    .filter((r) => r.source.includes('tiktok'))
    .map((r) => tokenize(r.topic));

  const byTopic = new Map();
  for (const r of youtubeRows) {
    const existing = byTopic.get(r.topic);
    if (!existing || r.score > existing.score) byTopic.set(r.topic, r);
  }

  const opportunities = [];
  for (const yt of byTopic.values()) {
    const ytTokens = tokenize(yt.topic);
    let bestOverlap = 0;
    for (const tt of tiktokTokenSets) bestOverlap = Math.max(bestOverlap, jaccard(ytTokens, tt));
    if (bestOverlap < similarityThreshold) {
      opportunities.push({ topic: yt.topic, youtubeSource: yt.source, youtubeScore: yt.score, bestTiktokOverlap: Number(bestOverlap.toFixed(2)) });
    }
  }
  return opportunities.sort((a, b) => b.youtubeScore - a.youtubeScore);
}

function persistArbitrage(opts) {
  const opportunities = detectArbitrage(opts);
  for (const o of opportunities) store.upsert({ kind: 'arbitrage', key: `${o.youtubeSource}::${o.topic}`, payload: o });
  return opportunities;
}

// ---------------------------------------------------------------------------
// (3) Seasonality detection — recurring weekly patterns per source
// ---------------------------------------------------------------------------

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Buckets each source's daily-average score by day-of-week and flags a
// weekday whose average sits meaningfully above the source's overall mean
// (z-score >= zThreshold) as a recurring weekly pattern — e.g. "new Roblox
// update Fridays" showing up as reddit_roblox's score reliably spiking on
// Fridays. Requires at least minSamplesPerWeekday daily points for every
// weekday before calling a pattern, so it stays silent on thin history
// rather than reporting a pattern it can't support.
function detectWeeklySeasonality(source, { sqliteModifier = '-180 days', minSamplesPerWeekday = 3, zThreshold = 1.0 } = {}) {
  const rows = allSignalRows(sqliteModifier).filter((r) => r.source === source);
  if (!rows.length) return null;

  const byDay = new Map();
  for (const r of rows) {
    const day = r.capturedAt.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(r.score);
  }
  const dailyAvgs = Array.from(byDay.entries()).map(([day, scores]) => ({
    day,
    weekday: new Date(`${day}T00:00:00Z`).getUTCDay(),
    avg: scores.reduce((a, b) => a + b, 0) / scores.length
  }));

  const byWeekday = Array.from({ length: 7 }, () => []);
  for (const d of dailyAvgs) byWeekday[d.weekday].push(d.avg);
  if (byWeekday.some((arr) => arr.length < minSamplesPerWeekday)) return null;

  const overallMean = dailyAvgs.reduce((a, b) => a + b.avg, 0) / dailyAvgs.length;
  const overallStd = Math.sqrt(dailyAvgs.reduce((a, b) => a + (b.avg - overallMean) ** 2, 0) / dailyAvgs.length);
  if (overallStd === 0) return null;

  const weekdayStats = byWeekday.map((scores, idx) => {
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    return { weekday: WEEKDAY_NAMES[idx], mean: Number(mean.toFixed(2)), z: Number(((mean - overallMean) / overallStd).toFixed(2)), samples: scores.length };
  });

  const peak = weekdayStats.reduce((a, b) => (b.z > a.z ? b : a));
  if (peak.z < zThreshold) return null;

  return { source, pattern: 'weekly', peakWeekday: peak.weekday, zScore: peak.z, weekdayStats };
}

function detectSeasonalityAcrossSources(opts = {}) {
  return availableSources(opts.sqliteModifier)
    .map((source) => detectWeeklySeasonality(source, opts))
    .filter(Boolean);
}

function persistSeasonality(opts) {
  const results = detectSeasonalityAcrossSources(opts);
  for (const r of results) store.upsert({ kind: 'seasonality', key: r.source, payload: r });
  return results;
}

// ---------------------------------------------------------------------------
// (4) Evergreen-topic recurrence detection
// ---------------------------------------------------------------------------

// A topic that appears, goes dormant for at least dormancyDays, and then
// reappears — at least minCycles times — is evergreen (recurs on its own,
// not tied to a single moment) as opposed to a one-off spike (appears in one
// tight window and never comes back). Grouped by (source, topic) exact
// match; near-duplicate topic strings are a job for clusterTopics() (6)
// upstream of this, not something this function tries to resolve itself.
function detectEvergreenTopics({ sqliteModifier = '-365 days', dormancyDays = 21, minCycles = 2 } = {}) {
  const rows = allSignalRows(sqliteModifier);
  const byTopic = new Map();
  for (const r of rows) {
    if (!r.capturedAt) continue;
    const key = `${r.source}::${r.topic}`;
    if (!byTopic.has(key)) byTopic.set(key, []);
    byTopic.get(key).push(r);
  }

  const evergreen = [];
  for (const [key, entries] of byTopic) {
    const days = Array.from(new Set(entries.map((e) => e.capturedAt.slice(0, 10)))).sort();
    if (days.length < 2) continue;

    let cycles = 1;
    let lastDay = days[0];
    for (let i = 1; i < days.length; i++) {
      const gapDays = (new Date(`${days[i]}T00:00:00Z`) - new Date(`${lastDay}T00:00:00Z`)) / 86400000;
      if (gapDays >= dormancyDays) cycles += 1;
      lastDay = days[i];
    }

    if (cycles >= minCycles) {
      const [source, topic] = key.split('::');
      const scores = entries.map((e) => e.score);
      evergreen.push({
        source,
        topic,
        recurrenceCycles: cycles,
        firstSeen: days[0],
        lastSeen: days[days.length - 1],
        avgScore: Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2))
      });
    }
  }
  return evergreen.sort((a, b) => b.recurrenceCycles - a.recurrenceCycles);
}

function persistEvergreen(opts) {
  const results = detectEvergreenTopics(opts);
  for (const r of results) store.upsert({ kind: 'evergreen', key: `${r.source}::${r.topic}`, payload: r });
  return results;
}

// ---------------------------------------------------------------------------
// (5) Sentiment scoring on Reddit post titles via batched LLM classification
// ---------------------------------------------------------------------------

const SENTIMENT_BATCH_SIZE = 15;

const SENTIMENT_SCHEMA = {
  type: 'object',
  properties: {
    classifications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer', description: 'Matches the numbered item in the prompt.' },
          sentiment: { type: 'string', enum: ['excitement', 'controversy', 'fatigue', 'neutral'] },
          intensity: { type: 'number', minimum: 0, maximum: 1, description: 'How strongly the title reads that way, not how popular the post is.' }
        },
        required: ['index', 'sentiment', 'intensity']
      }
    }
  },
  required: ['classifications']
};

const SENTIMENT_SYSTEM = `You classify Reddit post titles from Roblox scripting/dev communities by emotional tone: excitement/hype (genuinely enthusiastic about something new), controversy (disagreement, drama, callouts, exploit-detection concerns), fatigue (tired of a repeated topic, complaints about oversaturation or reposts), or neutral (informational, no strong tone). Judge the title's tone itself, not whether the topic is good or bad for business. Output only via the submit_result tool.`;

async function classifySentimentBatch(posts) {
  if (!isConfigured() || !posts.length) return [];
  const prompt = posts.map((p, i) => `${i}. ${p.topic}`).join('\n');
  const result = await structured({
    system: SENTIMENT_SYSTEM,
    prompt: `Classify each numbered Reddit post title:\n${prompt}`,
    schema: SENTIMENT_SCHEMA,
    maxTokens: 1000
  });
  return result.classifications
    .map((c) => (posts[c.index] ? { ...posts[c.index], sentiment: c.sentiment, intensity: c.intensity } : null))
    .filter(Boolean);
}

async function scoreRedditSentiment({ sqliteModifier = '-7 days', limit = 200 } = {}) {
  const rows = trendsModel.recent(limit, sqliteModifier).filter((r) => r.source.startsWith('reddit'));
  const out = [];
  for (let i = 0; i < rows.length; i += SENTIMENT_BATCH_SIZE) {
    const batch = rows.slice(i, i + SENTIMENT_BATCH_SIZE);
    out.push(...(await classifySentimentBatch(batch)));
  }
  return out;
}

async function persistSentiment(opts) {
  const classified = await scoreRedditSentiment(opts);
  for (const c of classified) store.upsert({ kind: 'sentiment', key: `${c.source}::${c.id}`, payload: c });
  return classified;
}

// ---------------------------------------------------------------------------
// (6) Topic clustering / dedup
// ---------------------------------------------------------------------------

// Cheap union-find over token-overlap similarity — groups obvious
// near-duplicates ("roblox exploit" / "roblox script exploit") without any
// LLM cost. Runs in O(n^2) token comparisons, fine for the per-window batch
// sizes this is meant to run over (a source's recent topics), not the full
// history.
function preclusterTopics(topics, threshold) {
  const parent = new Map(topics.map((t) => [t, t]));
  function find(x) {
    while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); }
    return x;
  }
  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  const tokenSets = new Map(topics.map((t) => [t, tokenize(t)]));
  for (let i = 0; i < topics.length; i++) {
    for (let j = i + 1; j < topics.length; j++) {
      if (jaccard(tokenSets.get(topics[i]), tokenSets.get(topics[j])) >= threshold) union(topics[i], topics[j]);
    }
  }

  const clusters = new Map();
  for (const t of topics) {
    const root = find(t);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(t);
  }
  return Array.from(clusters.values()).filter((members) => members.length > 1);
}

const DEDUP_SCHEMA = {
  type: 'object',
  properties: {
    clusters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          canonicalTopic: { type: 'string', description: 'Short canonical name for what this cluster of topics actually refers to.' },
          memberIndexes: { type: 'array', items: { type: 'integer' }, description: 'Indexes (from the numbered list) of every topic that belongs in this cluster.' }
        },
        required: ['canonicalTopic', 'memberIndexes']
      }
    }
  },
  required: ['clusters']
};

const DEDUP_SYSTEM = `You merge near-duplicate trend topic strings from a Roblox scripting/dev-tools content system (e.g. "roblox exploit" and "roblox script exploit" refer to the same thing). Group the numbered topics below into clusters of topics that refer to the same underlying thing, and give each cluster a short canonical name. Leave genuinely distinct topics out of any cluster rather than forcing a match. Output only via the submit_result tool.`;

// Confirms/names precluster candidates via one batched LLM call rather than
// re-clustering every topic from scratch — the cheap token-overlap pass
// already narrowed the field, this pass just adjudicates the ambiguous ones
// and picks a human-readable canonical name for each.
async function confirmClustersWithLLM(candidateTopics) {
  if (!isConfigured() || candidateTopics.length < 2) return [];
  const prompt = candidateTopics.map((t, i) => `${i}. ${t}`).join('\n');
  const result = await structured({ system: DEDUP_SYSTEM, prompt, schema: DEDUP_SCHEMA, maxTokens: 1200 });
  return result.clusters
    .map((c) => ({ canonicalTopic: c.canonicalTopic, members: c.memberIndexes.map((i) => candidateTopics[i]).filter(Boolean) }))
    .filter((c) => c.members.length > 1);
}

async function clusterTopics(topics, { useLLM = false, precisionThreshold = 0.5 } = {}) {
  const unique = Array.from(new Set(topics.filter(Boolean)));
  const preclusters = preclusterTopics(unique, precisionThreshold);
  const clusteredMembers = new Set(preclusters.flat());
  const singles = unique.filter((t) => !clusteredMembers.has(t));

  if (!useLLM) {
    return {
      clusters: preclusters.map((members) => ({ canonicalTopic: members.slice().sort((a, b) => b.length - a.length)[0], members })),
      singles
    };
  }

  const llmClusters = await confirmClustersWithLLM(preclusters.flat());
  return { clusters: llmClusters, singles };
}

async function persistClusters(topics, opts) {
  const { clusters, singles } = await clusterTopics(topics, opts);
  for (const c of clusters) store.upsert({ kind: 'cluster', key: c.canonicalTopic, payload: c });
  return { clusters, singles };
}

// ---------------------------------------------------------------------------
// (7) Trend-source reliability weighting
// ---------------------------------------------------------------------------

// Blends two read-only signals into a per-source trust weight: (a) each
// source's own empirical accuracy from trend_forecasts whose forecasts were
// grounded in it (source + resolution status, via social/models/forecasts.js),
// and (b) scorecardModel.accuracyStats('trend_forecast')'s overall accuracy
// as a Bayesian shrinkage prior. A source with only 1-2 resolved forecasts
// gets pulled toward the agent's overall track record instead of being
// judged confidently on a tiny sample; a source with dozens of resolutions
// is judged mostly on its own record.
function computeSourceTrustWeights({ priorPseudoCount = 4, sqliteModifier = '-365 days', resolvedLimit = 500 } = {}) {
  const globalStats = scorecardModel.accuracyStats('trend_forecast', sqliteModifier);
  const globalAccuracy = globalStats.accuracyPct !== null ? globalStats.accuracyPct / 100 : 0.5;

  const resolved = forecastsModel.recentResolved(resolvedLimit).filter((f) => f.status === 'correct' || f.status === 'incorrect');
  const bySource = new Map();
  for (const f of resolved) {
    if (!bySource.has(f.source)) bySource.set(f.source, { correct: 0, incorrect: 0 });
    const bucket = bySource.get(f.source);
    if (f.status === 'correct') bucket.correct += 1; else bucket.incorrect += 1;
  }

  const weights = [];
  for (const [source, { correct, incorrect }] of bySource) {
    const total = correct + incorrect;
    const trustWeight = (correct + priorPseudoCount * globalAccuracy) / (total + priorPseudoCount);
    weights.push({
      source,
      total,
      correct,
      incorrect,
      empiricalAccuracy: Number((correct / total).toFixed(3)),
      trustWeight: Number(trustWeight.toFixed(3))
    });
  }
  weights.sort((a, b) => b.trustWeight - a.trustWeight);
  return { globalAccuracy: Number(globalAccuracy.toFixed(3)), globalSampleSize: globalStats.total, weights };
}

function persistTrustWeights(opts) {
  const result = computeSourceTrustWeights(opts);
  for (const w of result.weights) store.upsert({ kind: 'trust_weight', key: w.source, payload: w });
  store.upsert({ kind: 'trust_weight', key: '__global__', payload: { globalAccuracy: result.globalAccuracy, globalSampleSize: result.globalSampleSize } });
  return result;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

// The synchronous computations (1-4, 7) in one pass — cheap, no LLM cost,
// safe to run on a tight schedule. Sentiment scoring (5) and LLM-confirmed
// clustering (6) are exported separately since they cost tokens and clustering
// needs a caller-supplied topic list; see INTEGRATION NOTES below for how a
// scheduler should combine all of this.
function runEnrichment(opts = {}) {
  return {
    correlations: persistCorrelations(opts),
    arbitrage: persistArbitrage(opts),
    seasonality: persistSeasonality(opts),
    evergreen: persistEvergreen(opts),
    trustWeights: persistTrustWeights(opts)
  };
}

module.exports = {
  availableSources,
  crossPlatformCorrelationReport,
  persistCorrelations,
  detectArbitrage,
  persistArbitrage,
  detectWeeklySeasonality,
  detectSeasonalityAcrossSources,
  persistSeasonality,
  detectEvergreenTopics,
  persistEvergreen,
  scoreRedditSentiment,
  persistSentiment,
  clusterTopics,
  persistClusters,
  computeSourceTrustWeights,
  persistTrustWeights,
  runEnrichment
};

// INTEGRATION NOTES:
// - Scheduled via social/scheduler.js: run_enrichment at '10 3 * * *'
//   (daily, after trendsAgent.refresh() and trendForecastAgent.resolveForecasts()
//   have run — trust weights read resolved forecasts, so running before any
//   exist just returns an empty weights list, which is harmless but pointless).
// - persistSentiment() and persistClusters(topics) cost LLM tokens and are
//   deliberately NOT part of runEnrichment(). A separate scheduler entry
//   (run_sentiment_clusters at '20 3 * * *') calls persistSentiment()
//   directly and calls persistClusters() with the topic list from
//   trendSignalsLib.loadCaptures() — the concatenation happens in
//   orchestrator.js runSentimentAndClusters(), not in this file.
// - strategyAgent.js (social/agents/strategyAgent.js) is the active reader
//   of this data: store.byKind('correlation'/'arbitrage'/'seasonality'/
//   'evergreen'/'trust_weight') via social/models/trendEnrichmentStore.js
//   gives it lead/lag relationships, uncovered-on-TikTok opportunities,
//   evergreen topics worth revisiting, and which sources to weight more
//   heavily when multiple sources disagree on what's trending.
// - trendForecastAgent.js could read computeSourceTrustWeights() directly (no
//   persistence needed for that use) to weight which sources' momentum it
//   forecasts against first, or to hedge confidence down for a
//   historically-unreliable source — it isn't wired to do so yet.
// - trendEnrichmentStore uses replaceKind() which deletes all rows of a
//   given kind before inserting new ones, so stale data is overwritten on
//   each enrichment run. No explicit purgeStale() is needed — the orchestrator's
//   purge_new_tables job handles the other signal tables separately.
// - If/when the signal tables this file feature-detects (webSignals,
//   communitySignals, tiktokSignals) land under different module paths, update
//   the loadOptional() calls near the top — every analysis function reads
//   through allSignalRows()/availableSources(), so that's the only place a
//   path change needs to happen.
