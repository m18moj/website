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

const strategyAgent = require('./agents/strategyAgent');
const scriptAgent = require('./agents/scriptAgent');
const creativeDirectionAgent = require('./agents/creativeDirectionAgent');
const productPromotionAgent = require('./agents/productPromotionAgent');
const trendsAgent = require('./agents/trendsAgent');
const publishingAgent = require('./agents/publishingAgent');
const qaAgent = require('./agents/qaAgent');
const analyticsLearningAgent = require('./agents/analyticsLearningAgent');

const youtube = require('./platforms/youtube');
const tiktok = require('./platforms/tiktok');

const PLATFORMS = ['tiktok', 'youtube_shorts'];
const MAX_QA_RETRIES = 2;

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
function startCampaign({ triggerType, packId = null, platform }) {
  const campaign = campaignsModel.create({ triggerType, packId, platform });
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
  const strategy = await strategyAgent.run({ pack, platform: campaign.platform, triggerType: campaign.triggerType, insights, trends });
  campaignsModel.setStrategy(campaignId, strategy);
  enqueueStage('run_script', campaignId);
}

async function runScript(campaignId) {
  const campaign = campaignsModel.findById(campaignId);
  if (!campaign) return;
  const pack = packOf(campaign);
  const strategy = parseJson(campaign.strategyJson);
  const script = await scriptAgent.run({ strategy, pack, platform: campaign.platform });
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
  const script = parseJson(campaign.scriptJson);
  const { creative, promotion } = parseJson(campaign.creativeJson, {});
  const videoJob = videoJobsModel.findByCampaignId(campaignId);

  const qaResult = await qaAgent.run({ script, creative, promotion, videoJob });

  if (qaResult.pass) {
    campaignsModel.setQa(campaignId, qaResult, 'scheduled');
    enqueueStage('schedule_publish', campaignId);
    return;
  }

  if (campaign.retryCount < MAX_QA_RETRIES) {
    campaignsModel.bumpRetry(campaignId);
    campaignsModel.setQa(campaignId, qaResult, 'creative');
    enqueueStage('run_creative', campaignId);
    return;
  }

  campaignsModel.setQa(campaignId, qaResult, 'qa_failed');
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

function detectNewProducts() {
  const packs = catalogModel.listAll({ includeHidden: false });
  let started = 0;
  for (const pack of packs) {
    if (campaignsModel.hasBeenPromotedBefore(pack.packId)) continue;
    for (const platform of PLATFORMS) startCampaign({ triggerType: 'new_pack', packId: pack.packId, platform });
    started += 1;
  }
  return { started };
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function evergreenTick(count = 1) {
  const packIds = campaignsModel.packsNeedingEvergreen(count);
  for (const packId of packIds) {
    const platform = PLATFORMS[hashString(`${packId}:${Date.now()}`) % PLATFORMS.length];
    startCampaign({ triggerType: 'evergreen', packId, platform });
  }
  return { started: packIds.length };
}

async function refreshTrends() {
  const found = await trendsAgent.refresh();
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

  if (config.DRY_RUN) {
    console.log(`[social] DRY RUN — would publish campaign ${pub.campaignId} to ${pub.platform}: "${pub.title}" (video: ${filePath})`);
    publicationsModel.markPublished(pub.id, { platformPostId: 'dry-run', platformUrl: null });
    campaignsModel.setStatus(pub.campaignId, 'published');
    return;
  }

  if (pub.platform === 'youtube_shorts') {
    const result = await youtube.uploadVideo({ filePath, title: pub.title, description: pub.description });
    if (result.ok) {
      publicationsModel.markPublished(pub.id, { platformPostId: result.videoId, platformUrl: result.url });
      campaignsModel.setStatus(pub.campaignId, 'published');
    } else {
      handlePublishFailure(pub, result.reason);
    }
    return;
  }

  if (pub.platform === 'tiktok') {
    const result = await tiktok.publishVideo({ filePath, title: pub.title });
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
    const status = await tiktok.fetchPublishStatus(pub.platformPostId);
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

async function runLearning() {
  return analyticsLearningAgent.learn();
}

function cleanupJobs() {
  return { removed: jobQueue.cleanupOld() };
}

const handlers = {
  run_strategy: (job) => runStrategy(job.payload.campaignId),
  run_script: (job) => runScript(job.payload.campaignId),
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
  cleanup_jobs: () => cleanupJobs()
};

module.exports = { handlers, startCampaign, detectNewProducts, evergreenTick, scheduleAdminApproved };
