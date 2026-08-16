// The campaign state machine. Every function here is one pipeline stage or
// one recurring trigger (see social/VIDEO_JOB_CONTRACT.md and
// social/README.md for the full picture); `handlers` at the bottom is the
// job_type -> function dispatch table social/jobRunner.js uses. Stage
// handlers persist their agent's output on the campaign row, advance
// `status`, then enqueue the next stage with a dedup key
// (`<stage>:campaign:<id>`) so a retried/duplicate job for the same
// campaign+stage is always a safe no-op.
const config = require('./config');
const jobQueue = require('./jobQueue');
const catalogModel = require('../server/models/catalog');
const campaignsModel = require('./models/campaigns');
const videoJobsModel = require('./models/videoJobs');
const publicationsModel = require('./models/publications');
const insightsModel = require('./models/insights');
const trendsModel = require('./models/trends');
const analyticsModel = require('./models/analytics');
const accountsModel = require('./models/accounts');
const trendOverridesModel = require('./models/trendOverrides');
const ensembleForecastsModel = require('./models/ensembleForecasts');

const strategyAgent = require('./agents/strategyAgent');
const scriptAgent = require('./agents/scriptAgent');
const creativeDirectionAgent = require('./agents/creativeDirectionAgent');
const productPromotionAgent = require('./agents/productPromotionAgent');
const trendsAgent = require('./agents/trendsAgent');
const publishingAgent = require('./agents/publishingAgent');
const qaAgent = require('./agents/qaAgent');
const predictionAgent = require('./agents/predictionAgent');
const analyticsLearningAgent = require('./agents/analyticsLearningAgent');
const trendForecastAgent = require('./agents/trendForecastAgent');
const ensembleForecastAgent = require('./agents/ensembleForecastAgent');

const youtube = require('./platforms/youtube');
const tiktok = require('./platforms/tiktok');

const googleTrends = require('./platforms/googleTrends');
const wikipedia = require('./platforms/wikipedia');
const appStoreCharts = require('./platforms/appStoreCharts');
const newsRss = require('./platforms/newsRss');
const twitter = require('./platforms/twitter');
const discordSignal = require('./platforms/discordSignal');
const robloxDevForum = require('./platforms/robloxDevForum');
const twitch = require('./platforms/twitch');
const tiktokTrends = require('./platforms/tiktokTrends');
const reddit = require('./platforms/reddit');
const webSignalsModel = require('./models/webSignals');
const communitySignalsModel = require('./models/communitySignals');
const tiktokSignalsModel = require('./models/tiktokSignals');
const trendSignalsLib = require('./lib/trendSignals');
const trendEnrichmentLib = require('./lib/trendEnrichment');
const trendSignalsStore = require('./models/trendSignalsStore');

const PLATFORMS = ['tiktok', 'youtube_shorts'];
// Shared retry budget for "this attempt isn't good enough, try again" —
// covers both a QA policy/technical failure (loops back to run_creative,
// unchanged) and a predicted-popularity score below MIN_POPULARITY_SCORE
// (loops back to run_script, since the hook/framing is usually what needs
// to change to actually raise a popularity prediction). One shared cap
// rather than two independent ones so a campaign can't loop indefinitely by
// alternating between the two failure reasons.
const MAX_QA_RETRIES = 3;
// Predicted popularity, 0-100 (see social/agents/predictionAgent.js) a
// video must clear to be scheduled for publish. Below this and retries
// remain, the script gets rewritten with the model's own named weaknesses
// as feedback; once retries are exhausted, the campaign is marked
// 'qa_failed' rather than publishing a predicted flop.
const MIN_POPULARITY_SCORE = 60;

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || 'null') ?? fallback; } catch (err) { return fallback; }
}

function packOf(campaign) {
  return campaign.packId ? catalogModel.getPack(campaign.packId, { includeHidden: true }) : null;
}

function enqueueStage(jobType, campaignId, payload = {}) {
  jobQueue.enqueue({ jobType, dedupKey: `${jobType}:campaign:${campaignId}`, payload: { campaignId, ...payload } });
}

// --- Manual entry point (used by detectNewProducts/evergreenTick below and
// by server/routes/social.js's manual-trigger endpoint) ---
// accountId ties this campaign to one connected social_accounts row (see
// social/models/accounts.js) so schedulePublish/publishOne know which
// account's credentials to post with. null means the legacy single account
// configured via social/config.js's env vars — every call site written
// before multi-account support keeps working unchanged.
function startCampaign({ triggerType, packId = null, platform, accountId = null }) {
  const campaign = campaignsModel.create({ triggerType, packId, platform, accountId });
  if (accountId) accountsModel.touchLastUsed(accountId);
  enqueueStage('run_strategy', campaign.id);
  return campaign;
}

// --- Pipeline stages ---

async function runStrategy(campaignId) {
  const campaign = campaignsModel.findById(campaignId);
  if (!campaign) return;
  const pack = packOf(campaign);
  const insights = insightsModel.relevantTo({ platform: campaign.platform, packId: campaign.packId });
  const trends = trendsModel.recent(8);
  const momentum = trendsModel.momentum();
  const overrides = trendOverridesModel.list();
  const webSignalsMomentum = webSignalsModel.momentum();
  const communitySignals = communitySignalsModel.recent(10);
  const ensembleForecasts = ensembleForecastsModel.active(8);

  let competitorContext = null;
  try {
    const competitorAgent = require('./agents/competitorAgent');
    competitorContext = await competitorAgent.analyze();
  } catch (e) { /* competitor analysis is best-effort */ }

  const strategy = await strategyAgent.run({ pack, platform: campaign.platform, triggerType: campaign.triggerType, insights, trends, momentum, overrides, competitorContext, webSignalsMomentum, communitySignals, ensembleForecasts });
  // Captured at decision time (not reconstructed later) so it can be
  // verifiably joined against this campaign's eventual real performance —
  // see trendForecastAgent's trend-jack pattern summary and
  // analyticsLearningAgent.resolvePredictions.
  campaignsModel.setTrendContext(campaignId, { trends, momentum });
  campaignsModel.setStrategy(campaignId, strategy);
  enqueueStage('run_script', campaignId);
}

async function runScript(campaignId, feedback) {
  const campaign = campaignsModel.findById(campaignId);
  if (!campaign) return;
  const pack = packOf(campaign);
  const strategy = parseJson(campaign.strategyJson);
  const script = await scriptAgent.run({ strategy, pack, platform: campaign.platform, feedback });
  campaignsModel.setScript(campaignId, script);
  enqueueStage('run_creative', campaignId);
}

async function runCreative(campaignId) {
  const campaign = campaignsModel.findById(campaignId);
  if (!campaign) return;
  const pack = packOf(campaign);
  const strategy = parseJson(campaign.strategyJson);
  const script = parseJson(campaign.scriptJson);
  const [creative, promotion] = await Promise.all([
    creativeDirectionAgent.run({ script, strategy, pack }),
    productPromotionAgent.run({ pack })
  ]);
  campaignsModel.setCreative(campaignId, { creative, promotion });
  enqueueStage('enqueue_video_job', campaignId);
}

// Writes the hand-off row for the separate video-generation pipeline — see
// social/VIDEO_JOB_CONTRACT.md for exactly what belongs in input_json.
// Nothing past this point renders video; poll_video_jobs (a recurring
// trigger, not a stage this system drives directly) is what notices
// completion and resumes the pipeline at run_qa.
async function enqueueVideoJob(campaignId) {
  const campaign = campaignsModel.findById(campaignId);
  if (!campaign) return;
  const pack = packOf(campaign);
  const script = parseJson(campaign.scriptJson);
  const { creative, promotion } = parseJson(campaign.creativeJson, {});

  videoJobsModel.create(campaignId, {
    campaignId,
    platform: campaign.platform,
    aspectRatio: '9:16',
    targetDurationSeconds: script.targetDurationSeconds,
    pack: pack ? { packId: pack.packId, packName: pack.packName, gameTitle: pack.gameTitle } : null,
    script,
    creative,
    promotion,
    brand: creativeDirectionAgent.BRAND
  });
  campaignsModel.setStatus(campaignId, 'video_rendering');
}

async function runQa(campaignId) {
  const campaign = campaignsModel.findById(campaignId);
  if (!campaign) return;
  const pack = packOf(campaign);
  const strategy = parseJson(campaign.strategyJson);
  const script = parseJson(campaign.scriptJson);
  const { creative, promotion } = parseJson(campaign.creativeJson, {});
  const videoJob = videoJobsModel.findByCampaignId(campaignId);

  const qaResult = await qaAgent.run({ script, creative, promotion, videoJob });

  if (!qaResult.pass) {
    if (campaign.retryCount < MAX_QA_RETRIES) {
      campaignsModel.bumpRetry(campaignId);
      campaignsModel.setQa(campaignId, qaResult, 'creative');
      enqueueStage('run_creative', campaignId);
      return;
    }
    campaignsModel.setQa(campaignId, qaResult, 'qa_failed');
    return;
  }
  campaignsModel.setQa(campaignId, qaResult, 'qa');

  // Popularity prediction gate — only runs once content has already cleared
  // policy/technical QA, so a low prediction can never mask a real policy
  // problem. Grounded in real historical performance (see
  // predictionAgent.js), so the bar this holds content to gets more
  // reliable — not just stricter — as more posts get tracked over time.
  const prediction = await predictionAgent.run({
    pack,
    platform: campaign.platform,
    angleLabel: `${strategy.contentPillar} — ${strategy.angle}`,
    hook: script.hookLine,
    beats: script.beats.map((b) => b.voiceover),
    cta: script.ctaLine,
    visualStyle: creative.visualStyle,
    trends: trendsModel.recent(10),
    insights: insightsModel.relevantTo({ platform: campaign.platform, packId: campaign.packId }),
    performanceRows: analyticsModel.sinceWithCampaignDetail('-90 days')
  });

  const passedPrediction = prediction.score >= MIN_POPULARITY_SCORE;

  if (!passedPrediction && campaign.retryCount < MAX_QA_RETRIES) {
    campaignsModel.bumpRetry(campaignId);
    campaignsModel.setPrediction(campaignId, prediction, 'scripting');
    // Redo from the script stage (not just creative) — a low popularity
    // score is usually a hook/framing problem, and predictionAgent's named
    // weaknesses are threaded back in as feedback so the rewrite targets
    // them directly instead of blindly re-rolling.
    enqueueStage('run_script', campaignId, { feedback: prediction.weaknesses });
    return;
  }

  campaignsModel.setPrediction(campaignId, prediction, passedPrediction ? 'scheduled' : 'qa_failed');
  if (passedPrediction) enqueueStage('schedule_publish', campaignId);
}

async function schedulePublish(campaignId) {
  const campaign = campaignsModel.findById(campaignId);
  if (!campaign) return;
  const strategy = parseJson(campaign.strategyJson);
  const script = parseJson(campaign.scriptJson);
  const { creative, promotion } = parseJson(campaign.creativeJson, {});

  const metadata = await publishingAgent.run({
    campaignId,
    packId: campaign.packId,
    platform: campaign.platform,
    strategy,
    script,
    creative,
    promotion
  });
  campaignsModel.setMetadata(campaignId, metadata, 'scheduled');
  publicationsModel.create({
    campaignId,
    platform: campaign.platform,
    title: metadata.title,
    description: `${metadata.description}\n\n${metadata.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`,
    scheduledAt: metadata.scheduledAt
  });
}

// Admin-approved path (Video Studio → "Approve & schedule"): takes a render
// the admin already reviewed and creates a 'manual' campaign + publication
// row directly, bypassing the strategy/script/creative/video stages entirely.
// The rendered video path lives on the publication itself (output_path) since
// there's no video_jobs contract row for it — publishOne falls back to it.
function scheduleAdminApproved({ platform, packId, videoPath, title, description, scheduledAt }) {
  if (!PLATFORMS.includes(platform)) throw new Error(`Unsupported platform "${platform}".`);
  if (!videoPath) throw new Error('A rendered video path is required.');

  const existing = publicationsModel.findByOutputPath(videoPath);
  if (existing && ['scheduled', 'publishing', 'published'].includes(existing.status)) {
    return { campaign: campaignsModel.findById(existing.campaignId), publication: existing, alreadyScheduled: true };
  }

  const campaign = startCampaign({ triggerType: 'manual', packId, platform });
  const at = scheduledAt || publishingAgent.pickScheduledAt({ platform, packId, campaignId: campaign.id });
  const updated = campaignsModel.setMetadata(campaign.id, { title, description, scheduledAt: at, source: 'admin_approval' }, 'scheduled');
  const publication = publicationsModel.create({
    campaignId: campaign.id,
    platform,
    title,
    description,
    scheduledAt: at,
    outputPath: videoPath
  });
  return { campaign: updated, publication, alreadyScheduled: false };
}

// --- Recurring triggers ---

// Accounts eligible for a platform+pack, or [null] (the legacy single
// account) when nothing is connected yet — the one place both triggers
// below ask "who posts this?".
function targetsFor(platform, packId) {
  const accounts = accountsModel.listEnabledForPlatform(platform, packId);
  return accounts.length ? accounts : [null];
}

function detectNewProducts() {
  const packs = catalogModel.listAll({ includeHidden: false });
  let started = 0;
  for (const pack of packs) {
    if (campaignsModel.hasBeenPromotedBefore(pack.packId)) continue;
    // A brand-new pack is a one-time, bounded fan-out — every eligible
    // connected account (per platform) gets its own campaign so all of
    // them announce it, not just one.
    for (const platform of PLATFORMS) {
      for (const account of targetsFor(platform, pack.packId)) {
        startCampaign({ triggerType: 'new_pack', packId: pack.packId, platform, accountId: account ? account.id : null });
        started += 1;
      }
    }
  }
  return { started };
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

// Picks the account most overdue for a post (oldest last_used_at first,
// never-used accounts first of all) across every enabled connected account
// on either platform — one evergreen slot per tick, round-robined across
// however many accounts are connected.
function pickAccountForEvergreen() {
  const accounts = accountsModel.list().filter((a) => a.enabled);
  if (!accounts.length) return null;
  return accounts.slice().sort((a, b) => {
    if (!a.lastUsedAt && !b.lastUsedAt) return a.id - b.id;
    if (!a.lastUsedAt) return -1;
    if (!b.lastUsedAt) return 1;
    return new Date(a.lastUsedAt) - new Date(b.lastUsedAt);
  })[0];
}

function evergreenTick(count = 1) {
  const account = pickAccountForEvergreen();

  // No accounts connected yet — exactly the original single-account
  // behavior, untouched.
  if (!account) {
    const packIds = campaignsModel.packsNeedingEvergreen(count);
    for (const packId of packIds) {
      const platform = PLATFORMS[hashString(`${packId}:${Date.now()}`) % PLATFORMS.length];
      startCampaign({ triggerType: 'evergreen', packId, platform });
    }
    return { started: packIds.length };
  }

  const niche = accountsModel.findByIdPublic(account.id)?.nichePackIds;
  const candidates = campaignsModel.packsNeedingEvergreen(10);
  const packId = candidates.find((id) => !niche || !niche.length || niche.includes(id)) || candidates[0];
  if (!packId) return { started: 0 };

  startCampaign({ triggerType: 'evergreen', packId, platform: account.platform, accountId: account.id });
  return { started: 1 };
}

async function refreshTrends() {
  const found = await trendsAgent.refresh();
  try { trendSignalsLib.computeTrendSignals({ sinceDays: 90, persist: true }); } catch (e) { /* non-critical */ }
  return { found: found.length };
}

function pollVideoJobs() {
  let advanced = 0;
  let failed = 0;
  for (const videoJob of videoJobsModel.listInFlight()) {
    if (videoJob.status === 'completed') {
      campaignsModel.setStatus(videoJob.campaignId, 'qa');
      enqueueStage('run_qa', videoJob.campaignId);
      advanced += 1;
    } else if (videoJob.status === 'failed') {
      campaignsModel.setStatus(videoJob.campaignId, 'failed', videoJob.error || 'Video generation failed');
      failed += 1;
    }
    // 'pending' / 'claimed' / 'rendering' — still waiting, nothing to do yet.
  }
  return { advanced, failed };
}

function handlePublishFailure(pub, reason) {
  if (pub.attempts >= 3) {
    publicationsModel.markFailed(pub.id, new Error(reason));
    campaignsModel.setStatus(pub.campaignId, 'failed', reason);
  } else {
    publicationsModel.resetToScheduled(pub.id, new Error(reason));
  }
}

// Resolves a campaign's connected account into the { id, credentials } shape
// platforms/tiktok.js and platforms/youtube.js expect, or undefined when the
// campaign has no account_id (the legacy single-account path — those
// clients fall back to social/config.js's env vars on their own).
function accountForCampaign(campaignId) {
  const campaign = campaignsModel.findById(campaignId);
  if (!campaign || !campaign.accountId) return undefined;
  const credentials = accountsModel.credentialsFor(campaign.accountId);
  return credentials ? { id: campaign.accountId, credentials } : undefined;
}

async function publishOne(pub) {
  publicationsModel.markPublishing(pub.id);
  const videoJob = videoJobsModel.findByCampaignId(pub.campaignId);
  // Admin-approved publications carry the rendered video path on the row
  // itself (no video_jobs entry exists for them) — prefer the contract row
  // when present, fall back to the publication's own path.
  const filePath = (videoJob && videoJob.outputPath) || pub.outputPath;
  if (!filePath) {
    handlePublishFailure(pub, 'No rendered video output found at publish time.');
    return;
  }
  const account = accountForCampaign(pub.campaignId);

  if (config.DRY_RUN) {
    console.log(`[social] DRY RUN — would publish campaign ${pub.campaignId} to ${pub.platform}${account ? ` (account #${account.id})` : ''}: "${pub.title}" (video: ${filePath})`);
    publicationsModel.markPublished(pub.id, { platformPostId: 'dry-run', platformUrl: null });
    campaignsModel.setStatus(pub.campaignId, 'published');
    return;
  }

  if (pub.platform === 'youtube_shorts') {
    const result = await youtube.uploadVideo({ filePath, title: pub.title, description: pub.description, account });
    if (result.ok) {
      publicationsModel.markPublished(pub.id, { platformPostId: result.videoId, platformUrl: result.url });
      campaignsModel.setStatus(pub.campaignId, 'published');
    } else {
      handlePublishFailure(pub, result.reason);
    }
    return;
  }

  if (pub.platform === 'tiktok') {
    const result = await tiktok.publishVideo({ filePath, title: pub.title, account });
    if (result.ok) {
      // Post accepted — the real, publicly-usable post id/url resolves
      // asynchronously (see resolvePendingTiktokPosts below). Marking
      // published now, not retrying, is deliberate: retrying an
      // already-accepted upload would double-post.
      publicationsModel.markPublished(pub.id, { platformPostId: result.publishId, platformUrl: null });
      campaignsModel.setStatus(pub.campaignId, 'published');
    } else {
      handlePublishFailure(pub, result.reason);
    }
  }
}

async function resolvePendingTiktokPosts() {
  for (const pub of publicationsModel.listUnresolvedTiktok()) {
    const account = accountForCampaign(pub.campaignId);
    const status = await tiktok.fetchPublishStatus(pub.platformPostId, account);
    if (!status.ok) continue;
    if (status.status === 'PUBLISH_COMPLETE' && status.publiclyAvailablePostId) {
      publicationsModel.resolvePlatformId(pub.id, {
        platformPostId: status.publiclyAvailablePostId,
        platformUrl: `https://www.tiktok.com/@_/video/${status.publiclyAvailablePostId}`
      });
    } else if (status.status === 'FAILED') {
      publicationsModel.markFailed(pub.id, new Error('TikTok reported the post failed after upload was accepted.'));
    }
  }
}

async function publishDuePosts() {
  if (!config.ENABLED) return { skipped: true, reason: 'SOCIAL_ENABLED is not true' };
  const due = publicationsModel.due(config.BATCH_SIZE);
  for (const pub of due) await publishOne(pub);
  if (!config.DRY_RUN) await resolvePendingTiktokPosts();
  return { published: due.length };
}

async function collectAnalytics() {
  return analyticsLearningAgent.collect();
}

// Nightly (see social/scheduler.js run_learning): grades yesterday's-and-older
// predictions against what actually happened, then generates the next round
// of trend forecasts informed by that grading — insight learning and
// forecast/reward learning share a cadence since both are "look back and get
// smarter" work that only needs to run once a day, not on every trend
// refresh.
async function runLearning() {
  const insights = await analyticsLearningAgent.learn();
  const predictionResolutions = analyticsLearningAgent.resolvePredictions();
  const forecastResolutions = trendForecastAgent.resolveForecasts();
  const forecasts = await trendForecastAgent.generateForecasts();
  const ensembleForecasts = await ensembleForecastAgent.generateEnsembleForecasts();
  const ensembleResolutions = ensembleForecastAgent.resolveEnsembleForecasts();
  return { insights, predictionResolutions, forecastResolutions, forecasts, ensembleForecasts, ensembleResolutions };
}

function cleanupJobs() {
  return { removed: jobQueue.cleanupOld() };
}

async function refreshWebSignals() {
  const items = [];
  const [google, wiki, appStore, news] = await Promise.all([
    googleTrends.fetchInterestOverTime(),
    wikipedia.fetchPageviewSpikes(),
    appStoreCharts.fetchChartRanks(),
    newsRss.fetchMatchingArticles()
  ]);
  for (const result of [google, wiki, appStore, news]) {
    if (result.ok && result.items) {
      for (const item of result.items) {
        webSignalsModel.record({ source: item.store || 'unknown', topic: item.topic, score: item.score || 0, raw: item.raw || {} });
        items.push(item);
      }
    }
  }
  return { fetched: items.length };
}

async function refreshCommunitySignals() {
  const items = [];
  const [twitterResult, discordResult, devForumResult, twitchGames] = await Promise.all([
    twitter.fetchTrendingTopics(),
    discordSignal.fetchChannelActivity(),
    robloxDevForum.fetchAnnouncements(),
    twitch.fetchTopGames()
  ]);
  if (twitterResult.ok && twitterResult.items) {
    for (const item of twitterResult.items) {
      communitySignalsModel.record({ source: 'twitter', topic: item.topic, score: item.score || 0, raw: item });
      items.push(item);
    }
  }
  if (discordResult.ok && discordResult.items) {
    for (const item of discordResult.items) {
      communitySignalsModel.record({ source: 'discord', topic: item.channelId, score: item.velocityPerHour || 0, raw: item });
      items.push(item);
    }
  }
  if (devForumResult.ok && devForumResult.items) {
    for (const item of devForumResult.items) {
      communitySignalsModel.record({ source: 'roblox_devforum', topic: item.title, score: item.views || 0, raw: item });
      items.push(item);
    }
  }
  if (twitchGames.ok && twitchGames.items) {
    for (const item of twitchGames.items) {
      communitySignalsModel.record({ source: 'twitch', topic: item.name, score: item.rank || 0, raw: item });
      items.push(item);
    }
  }
  return { fetched: items.length };
}

async function refreshTiktokTrends() {
  const region = process.env.TIKTOK_CC_REGION || 'US';
  const [hashtags, sounds] = await Promise.all([
    tiktokTrends.fetchTrendingHashtags({ region }),
    tiktokTrends.fetchTrendingSounds({ region })
  ]);
  let count = 0;
  if (hashtags.ok && hashtags.hashtags) {
    for (const h of hashtags.hashtags) {
      tiktokSignalsModel.record({ kind: 'hashtag', topic: h.name, score: h.videoViews || 0, region, raw: h });
      count += 1;
    }
  }
  if (sounds.ok && sounds.sounds) {
    for (const s of sounds.sounds) {
      tiktokSignalsModel.record({ kind: 'sound', topic: s.title, score: s.videoViews || 0, region, raw: s });
      count += 1;
    }
  }
  return { fetched: count };
}

async function refreshCompetitors() {
  const competitorAgent = require('./agents/competitorAgent');
  return competitorAgent.refreshAll();
}

async function analyzeCompetitors() {
  const competitorAgent = require('./agents/competitorAgent');
  return competitorAgent.analyze();
}

async function runReplication() {
  const replicationAgent = require('./agents/replicationAgent');
  return replicationAgent.run();
}

async function runVisualStyle() {
  const visualStyleAgent = require('./agents/visualStyleAgent');
  return visualStyleAgent.run();
}

async function runAudioPairing() {
  const audioPairingAgent = require('./agents/audioPairingAgent');
  return audioPairingAgent.run();
}

async function runAudienceRequest() {
  const audienceRequestAgent = require('./agents/audienceRequestAgent');
  return audienceRequestAgent.run();
}

async function runEnrichment() {
  return trendEnrichmentLib.runEnrichment();
}

async function runSentimentAndClusters() {
  const sentiment = await trendEnrichmentLib.persistSentiment();
  const topics = trendSignalsLib.loadCaptures({ sinceDays: 90, limit: 5000 });
  const topicStrings = topics.map((t) => t.topic);
  const clusters = await trendEnrichmentLib.persistClusters(topicStrings);
  return { sentiment: sentiment.length, clusters: clusters.clusters ? clusters.clusters.length : 0 };
}

function purgeNewTables() {
  webSignalsModel.purgeOld();
  communitySignalsModel.purgeOld();
  tiktokSignalsModel.purgeOld();
  trendSignalsStore.purgeStale();
  return { purged: true };
}

const handlers = {
  run_strategy: (job) => runStrategy(job.payload.campaignId),
  run_script: (job) => runScript(job.payload.campaignId, job.payload.feedback),
  run_creative: (job) => runCreative(job.payload.campaignId),
  enqueue_video_job: (job) => enqueueVideoJob(job.payload.campaignId),
  run_qa: (job) => runQa(job.payload.campaignId),
  schedule_publish: (job) => schedulePublish(job.payload.campaignId),

  detect_new_products: () => detectNewProducts(),
  evergreen_tick: () => evergreenTick(1),
  refresh_trends: () => refreshTrends(),
  poll_video_jobs: () => pollVideoJobs(),
  publish_due_posts: () => publishDuePosts(),
  collect_analytics: () => collectAnalytics(),
  run_learning: () => runLearning(),
  cleanup_jobs: () => cleanupJobs(),
  refresh_web_signals: () => refreshWebSignals(),
  refresh_community_signals: () => refreshCommunitySignals(),
  refresh_tiktok_trends: () => refreshTiktokTrends(),
  refresh_competitors: () => refreshCompetitors(),
  analyze_competitors: () => analyzeCompetitors(),
  run_replication: () => runReplication(),
  run_visual_style: () => runVisualStyle(),
  run_audio_pairing: () => runAudioPairing(),
  run_audience_request: () => runAudienceRequest(),
  run_enrichment: () => runEnrichment(),
  run_sentiment_clusters: () => runSentimentAndClusters(),
  purge_new_tables: () => purgeNewTables()
};

module.exports = { handlers, startCampaign, detectNewProducts, evergreenTick, scheduleAdminApproved };
