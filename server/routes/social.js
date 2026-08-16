// Read-only-ish control surface for the AI/Social automation worker
// (social/) — status, campaign listing, manual trigger, and retry. No UI
// consumes this yet (it's callable via curl/Postman by an admin); it exists
// so the pipeline can be inspected and nudged without touching the site's
// admin dashboard, which is out of scope for this system. Same
// requireAdmin gate as every other admin-only route.
const express = require('express');
const { param, query, body, validationResult } = require('express-validator');

const { requireAdmin } = require('../middleware/auth');
const { verifyCsrfToken } = require('../middleware/csrf');
const { securityActionLimiter } = require('../middleware/rateLimit');

const socialConfig = require('../../social/config');
const jobQueue = require('../../social/jobQueue');
const campaignsModel = require('../../social/models/campaigns');
const catalogModel = require('../models/catalog');
const youtube = require('../../social/platforms/youtube');
const tiktok = require('../../social/platforms/tiktok');

const router = express.Router();
router.use(requireAdmin);

function checkValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: errors.array()[0].msg });
    return false;
  }
  return true;
}

router.get('/status', (req, res) => {
  res.json({
    enabled: socialConfig.ENABLED,
    dryRun: socialConfig.DRY_RUN,
    configured: {
      anthropic: Boolean(socialConfig.ANTHROPIC_API_KEY),
      youtube: youtube.isConfigured(),
      youtubeTrends: youtube.hasApiKey(),
      tiktok: tiktok.isConfigured()
    },
    jobs: jobQueue.statusCounts(),
    campaigns: campaignsModel.statusCounts()
  });
});

router.get('/campaigns', [query('status').optional().isString(), query('limit').optional().isInt({ min: 1, max: 200 }).toInt()], (req, res) => {
  if (!checkValidation(req, res)) return;
  res.json({ campaigns: campaignsModel.list({ status: req.query.status || null, limit: req.query.limit || 50 }) });
});

router.get('/campaigns/:id', [param('id').isInt().toInt()], (req, res) => {
  if (!checkValidation(req, res)) return;
  const campaign = campaignsModel.findById(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
  res.json({ campaign });
});

// Manually starts the pipeline for a specific pack on both platforms —
// bypasses the detect_new_products/evergreen_tick cadence for testing or a
// one-off push. Rate-limited like every other admin action with real
// consequences (securityActionLimiter).
router.post(
  '/campaigns/:packId/promote',
  verifyCsrfToken,
  securityActionLimiter,
  [param('packId').isString(), body('platform').optional().isIn(['tiktok', 'youtube_shorts'])],
  (req, res) => {
    if (!checkValidation(req, res)) return;
    const pack = catalogModel.getPack(req.params.packId, { includeHidden: true });
    if (!pack) return res.status(404).json({ error: 'Pack not found.' });

    const orchestrator = require('../../social/orchestrator');
    const platforms = req.body.platform ? [req.body.platform] : ['tiktok', 'youtube_shorts'];
    const campaigns = platforms.map((platform) => orchestrator.startCampaign({ triggerType: 'manual', packId: pack.packId, platform }));
    res.json({ campaigns });
  }
);

// Re-runs a campaign stuck in qa_failed/failed from the strategy stage —
// clears nothing, just re-enters the pipeline so a transient issue (bad LLM
// output, a video-pipeline hiccup) doesn't require deleting and recreating it.
router.post('/campaigns/:id/retry', verifyCsrfToken, securityActionLimiter, [param('id').isInt().toInt()], (req, res) => {
  if (!checkValidation(req, res)) return;
  const campaign = campaignsModel.findById(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
  if (!['failed', 'qa_failed', 'cancelled'].includes(campaign.status)) {
    return res.status(400).json({ error: `Campaign is currently "${campaign.status}" — only failed/qa_failed/cancelled campaigns can be retried.` });
  }
  campaignsModel.setStatus(campaign.id, 'strategy');
  jobQueue.enqueue({ jobType: 'run_strategy', dedupKey: `run_strategy:campaign:${campaign.id}`, payload: { campaignId: campaign.id } });
  res.json({ campaign: campaignsModel.findById(campaign.id) });
});

module.exports = router;
