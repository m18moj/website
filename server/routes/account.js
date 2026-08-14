const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');

const { requireAuth } = require('../middleware/auth');
const { verifyCsrfToken } = require('../middleware/csrf');
const { securityActionLimiter } = require('../middleware/rateLimit');
const ordersModel = require('../models/orders');
const usersModel = require('../models/users');
const auditLog = require('../models/auditLog');
const settingsModel = require('../models/settings');
const wishlistModel = require('../models/wishlist');
const catalogModel = require('../models/catalog');
const reviewsModel = require('../models/reviews');
const { serializeOrder } = require('../serialize');

const router = express.Router();
const BCRYPT_ROUNDS = 12;

router.get('/orders', requireAuth, (req, res) => {
  const orders = ordersModel.ordersForUser(req.session.userId).map(serializeOrder);
  res.json({ orders });
});

function requireWishlistEnabled(req, res, next) {
  if (!settingsModel.get('wishlist')) {
    return res.status(404).json({ error: 'The wishlist feature is turned off right now.' });
  }
  next();
}

// Returns the saved packs with their current live catalog data (name, price,
// hidden state) rather than just the bare pack ids, so the account page can
// render them without a second round trip — and so a pack that's since been
// hidden or deleted shows correctly instead of as a dangling reference.
router.get('/wishlist', requireAuth, requireWishlistEnabled, (req, res) => {
  const items = wishlistModel.listForUser(req.session.userId);
  const packs = items
    .map((item) => {
      const pack = catalogModel.getPack(item.pack_id, { includeHidden: true });
      return pack ? { ...pack, savedAt: item.created_at } : null;
    })
    .filter(Boolean);
  res.json({ packs });
});

router.post('/wishlist/:packId', requireAuth, requireWishlistEnabled, verifyCsrfToken, (req, res) => {
  const pack = catalogModel.getPack(req.params.packId, { includeHidden: false });
  if (!pack) return res.status(404).json({ error: 'Pack not found.' });
  wishlistModel.add(req.session.userId, req.params.packId);
  res.json({ ok: true });
});

router.delete('/wishlist/:packId', requireAuth, requireWishlistEnabled, verifyCsrfToken, (req, res) => {
  wishlistModel.remove(req.session.userId, req.params.packId);
  res.json({ ok: true });
});

router.post(
  '/email',
  requireAuth,
  verifyCsrfToken,
  securityActionLimiter,
  [body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Enter a valid email address, or leave it blank to remove it.')],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const email = (req.body.email || '').trim() || null;
    if (email) {
      const existing = usersModel.findByEmail(email);
      if (existing && existing.id !== req.session.userId) {
        return res.status(409).json({ error: 'That email is already in use on another account.' });
      }
    }

    usersModel.setEmail(req.session.userId, email);
    res.json({ email });
  }
);

// One review per user per pack, only from someone who's actually paid for
// it — enforced here, not just in the UI, since this is a public-facing
// trust signal that shouldn't be fakeable via a direct API call.
router.post(
  '/reviews/:packId',
  requireAuth,
  verifyCsrfToken,
  [
    body('rating').isInt({ min: 1, max: 5 }),
    body('comment').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 1000 })
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Rating must be 1-5 stars.' });

    if (!reviewsModel.hasPurchasedPack(req.session.userId, req.params.packId)) {
      return res.status(403).json({ error: "You can only review packs you've purchased." });
    }

    const review = reviewsModel.upsertReview({
      packId: req.params.packId,
      userId: req.session.userId,
      rating: req.body.rating,
      comment: req.body.comment || ''
    });
    res.json({ review });
  }
);

router.get('/reviews/:packId', requireAuth, (req, res) => {
  res.json({
    review: reviewsModel.ownReview(req.params.packId, req.session.userId) || null,
    canReview: reviewsModel.hasPurchasedPack(req.session.userId, req.params.packId)
  });
});

router.delete('/reviews/:packId', requireAuth, verifyCsrfToken, (req, res) => {
  reviewsModel.deleteReview(req.params.packId, req.session.userId);
  res.json({ ok: true });
});

router.post(
  '/password',
  requireAuth,
  verifyCsrfToken,
  securityActionLimiter,
  [
    body('currentPassword').isString().notEmpty(),
    body('newPassword').isLength({ min: 8, max: 128 }).withMessage('New password must be at least 8 characters.')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

      const user = usersModel.findById(req.session.userId);
      const valid = await bcrypt.compare(req.body.currentPassword, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });

      const passwordHash = await bcrypt.hash(req.body.newPassword, BCRYPT_ROUNDS);
      usersModel.setPassword(user.id, passwordHash);
      auditLog.record({ actor: user, action: 'password.change', target: user.username });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
