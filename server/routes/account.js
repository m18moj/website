const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const QRCode = require('qrcode');
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
const totp = require('../totp');
const { serializeOrder } = require('../serialize');

const router = express.Router();
const BCRYPT_ROUNDS = 12;

function generateRecoveryCodes(count = 10) {
  // XXXX-XXXX, from an unambiguous alphabet (no 0/O/1/I) — 10 codes, each
  // single-use. Returned raw exactly once; only bcrypt hashes are persisted.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const codes = [];
  for (let i = 0; i < count; i += 1) {
    let code = '';
    for (let j = 0; j < 8; j += 1) {
      if (j === 4) code += '-';
      code += alphabet[crypto.randomInt(alphabet.length)];
    }
    codes.push(code);
  }
  return codes;
}

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

// Self-service account deletion (GDPR right to erasure). Requires the current
// password as confirmation, same bar as disabling 2FA. Deleting the row
// cascades to orders, wishlist, reviews, licenses, etc. via the ON DELETE
// CASCADE foreign keys in server/db.js — the same effect admin-initiated
// deletes have in server/routes/admin.js, just self-triggered here.
router.post(
  '/delete',
  requireAuth,
  verifyCsrfToken,
  securityActionLimiter,
  [body('password').isString().notEmpty().withMessage('Enter your password to confirm.')],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

      const user = usersModel.findById(req.session.userId);
      if (!user) return res.status(401).json({ error: 'Sign in required.' });

      const valid = await bcrypt.compare(req.body.password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Password is incorrect.' });

      // Never let this leave the store with zero admins — same guardrail the
      // admin dashboard's user-delete route effectively provides by blocking
      // an admin from deleting themselves there at all.
      if (user.role === 'admin' && usersModel.countAdmins() <= 1) {
        return res
          .status(400)
          .json({ error: "You're the only admin account. Promote another admin before deleting this account." });
      }

      // Record the audit entry before the row disappears. audit_log.actor_id
      // is ON DELETE SET NULL, so the entry (with target username) survives
      // the user row being deleted right after.
      auditLog.record({ actor: user, action: 'user.self_delete', target: user.username });

      usersModel.deleteUser(user.id);

      req.session.destroy((err) => {
        if (err) return next(err);
        res.clearCookie('sf.sid');
        res.json({ ok: true });
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/nickname',
  requireAuth,
  verifyCsrfToken,
  securityActionLimiter,
  [body('nickname').trim().matches(usersModel.NICKNAME_PATTERN).withMessage('Nickname must be 1-8 characters (letters, numbers, spaces, - or _).')],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const updated = usersModel.setNickname(req.session.userId, req.body.nickname.trim());
    res.json({ user: usersModel.toPublicUser(updated) });
  }
);

// Self-service TOTP 2FA, available to every account (not just admins — see
// server/routes/admin.js for the parallel admin-dashboard copy of this flow,
// kept separate only so "My Security" in the admin panel doesn't change).
router.get('/2fa/setup', requireAuth, securityActionLimiter, async (req, res, next) => {
  try {
    const secret = totp.generateSecret();
    usersModel.setTotpSecret(req.currentUser.id, secret);
    const otpauthUri = totp.generateOtpAuthUri({ secret, label: req.currentUser.username, issuer: 'ScripForge' });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri, { margin: 1, width: 240 });

    res.json({ secret, otpauthUri, qrCodeDataUrl });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/2fa/enable',
  requireAuth,
  verifyCsrfToken,
  securityActionLimiter,
  [body('code').isString().notEmpty()],
  async (req, res, next) => {
    try {
      const user = usersModel.findById(req.currentUser.id);
      if (!user.totp_secret) return res.status(400).json({ error: 'Start setup first by requesting a new 2FA secret.' });

      if (!totp.verifyTotp(req.body.code, user.totp_secret)) {
        return res.status(401).json({ error: 'That code is incorrect or expired. Try the next code your app generates.' });
      }

      usersModel.enableTotp(user.id);

      const rawCodes = generateRecoveryCodes();
      const hashedCodes = await Promise.all(rawCodes.map((code) => bcrypt.hash(code, BCRYPT_ROUNDS)));
      usersModel.setRecoveryCodes(user.id, hashedCodes);

      auditLog.record({ actor: req.currentUser, action: '2fa.enable', target: user.username });
      res.json({ ok: true, recoveryCodes: rawCodes });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/2fa/disable',
  requireAuth,
  verifyCsrfToken,
  securityActionLimiter,
  [body('password').isString().notEmpty()],
  async (req, res, next) => {
    try {
      const user = usersModel.findById(req.currentUser.id);
      const valid = await bcrypt.compare(req.body.password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Password is incorrect.' });

      usersModel.disableTotp(user.id);
      auditLog.record({ actor: req.currentUser, action: '2fa.disable', target: user.username });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// Invalidates every existing recovery code and issues a fresh set — requires
// the current password (same bar as disabling 2FA outright) since this is
// shown raw exactly once and is powerful enough to bypass a lost authenticator.
router.post(
  '/2fa/recovery-codes/regenerate',
  requireAuth,
  verifyCsrfToken,
  securityActionLimiter,
  [body('password').isString().notEmpty()],
  async (req, res, next) => {
    try {
      const user = usersModel.findById(req.currentUser.id);
      if (!user.totp_enabled) return res.status(400).json({ error: '2FA is not enabled on this account.' });

      const valid = await bcrypt.compare(req.body.password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Password is incorrect.' });

      const rawCodes = generateRecoveryCodes();
      const hashedCodes = await Promise.all(rawCodes.map((code) => bcrypt.hash(code, BCRYPT_ROUNDS)));
      usersModel.setRecoveryCodes(user.id, hashedCodes);

      auditLog.record({ actor: req.currentUser, action: '2fa.recovery_codes.regenerate', target: user.username });
      res.json({ ok: true, recoveryCodes: rawCodes });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
