// Admin CRUD for social/models/trendOverrides.js — lets an admin pin a
// topic as "always pursue" or blocklist it from ever being trend-jacked,
// overriding what the automated trend/forecast pipeline would otherwise
// surface on its own. New, standalone route file (see INTEGRATION NOTES at
// the bottom for the one server/index.js mount line it needs) rather than
// an addition to server/routes/videoAdmin.js, since that file belongs to a
// different pass.
const express = require('express');
const { body, param, validationResult } = require('express-validator');

const { requireAdmin } = require('../middleware/auth');
const { verifyCsrfToken } = require('../middleware/csrf');
const { securityActionLimiter } = require('../middleware/rateLimit');
const trendOverridesModel = require('../../social/models/trendOverrides');

const router = express.Router();
router.use(requireAdmin);

router.get('/', (req, res) => {
  res.json({ overrides: trendOverridesModel.list() });
});

router.post(
  '/',
  verifyCsrfToken,
  securityActionLimiter,
  [
    body('topic').isString().trim().isLength({ min: 1, max: 200 }),
    body('mode').isIn(['always_pursue', 'blocklist']),
    body('reason').optional({ nullable: true }).isString().trim().isLength({ max: 500 })
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const override = trendOverridesModel.upsert({
      topic: req.body.topic,
      mode: req.body.mode,
      reason: req.body.reason || null,
      createdBy: req.currentUser.username
    });
    res.status(201).json({ override });
  }
);

router.delete('/:id', verifyCsrfToken, securityActionLimiter, [param('id').isInt().toInt()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  trendOverridesModel.remove(req.params.id);
  res.status(204).end();
});

module.exports = router;

// INTEGRATION NOTES:
// - Needs exactly one line added to server/index.js, next to the other
//   `/api/*` route mounts (after `app.use('/api/video-admin', videoAdminRoutes);`):
//     const trendOverridesRoutes = require('./routes/trendOverrides');
//     app.use('/api/trend-overrides', trendOverridesRoutes);
// - If maintenance mode should still let an admin manage overrides while
//   the site is down (same reasoning as the existing '/video-admin' entry),
//   also add '/trend-overrides' to the `allowedPrefixes` array in the
//   maintenance-mode gate a few lines above the route mounts.
// - No other tab's instructions mention server/index.js, so this mount is
//   safe to add without conflicting with parallel work.
