const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');

const usersModel = require('../models/users');
const auditLog = require('../models/auditLog');
const totp = require('../totp');
const captcha = require('../captcha');
const email = require('../email');
const { parseRequestContext } = require('../ua');
const { verifyCsrfToken, rotateCsrfToken } = require('../middleware/csrf');
const { loginLimiter, registerLimiter, passwordResetLimiter } = require('../middleware/rateLimit');

const router = express.Router();
const BCRYPT_ROUNDS = 12;
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,24}$/;
const RECOVERY_CODE_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

function completeLogin(req, user) {
  req.session.userId = user.id;
  req.session.role = user.role;
  usersModel.clearFailedLogins(user.id);
  usersModel.recordLogin(user.id, req.ip);
  usersModel.recordLoginHistory(user.id, parseRequestContext(req));
  if (user.role === 'admin') auditLog.record({ actor: user, action: 'auth.login', target: user.username });
  return rotateCsrfToken(req);
}

router.get('/csrf-token', (req, res) => {
  res.json({ csrfToken: req.session.csrfToken });
});

// Customers get a CAPTCHA instead of 2FA — cheap, no account required to
// solve it, and it's what actually stops scripted registration/login spam.
// Called fresh by the frontend before every register/login attempt (each
// answer is one-time use, see server/captcha.js).
router.get('/captcha', (req, res) => {
  res.json(captcha.generate(req));
});

router.post(
  '/register',
  registerLimiter,
  verifyCsrfToken,
  [
    body('username')
      .trim()
      .matches(USERNAME_PATTERN)
      .withMessage('Username must be 3-24 characters: letters, numbers, underscores, or hyphens only.'),
    body('nickname')
      .trim()
      .matches(usersModel.NICKNAME_PATTERN)
      .withMessage('Nickname is required: 1-8 characters (letters, numbers, spaces, - or _).'),
    body('password').isLength({ min: 8, max: 128 }).withMessage('Password must be at least 8 characters.')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      if (!captcha.verify(req, req.body.captchaAnswer)) {
        return res.status(400).json({ error: 'That answer isn\'t right. Try the new question.', captchaFailed: true });
      }

      const username = req.body.username.trim();
      const nickname = req.body.nickname.trim();
      const password = req.body.password;
      const emailInput = (req.body.email || '').trim();

      if (usersModel.findByUsername(username)) {
        return res.status(409).json({ error: 'That username is already taken.' });
      }

      if (emailInput && usersModel.findByEmail(emailInput)) {
        return res.status(409).json({ error: 'That email is already in use on another account.' });
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const user = usersModel.createUser({ username, passwordHash, role: 'customer', email: emailInput || null, nickname });

      // Regenerate the session id on privilege change (anonymous -> authenticated)
      // to prevent session fixation attacks.
      await regenerateSession(req);
      const csrfToken = completeLogin(req, user);

      res.status(201).json({ user: usersModel.toPublicUser(user), csrfToken });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/login',
  loginLimiter,
  verifyCsrfToken,
  [body('username').trim().notEmpty(), body('password').isString().notEmpty()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Invalid username or password.' });
      }

      if (!captcha.verify(req, req.body.captchaAnswer)) {
        return res.status(400).json({ error: 'That answer isn\'t right. Try the new question.', captchaFailed: true });
      }

      const username = req.body.username.trim();
      const password = req.body.password;
      const user = usersModel.findByUsername(username);

      if (!user) {
        // Hash a dummy value so failed lookups take roughly the same time as
        // a real password check — avoids leaking account existence via timing.
        await bcrypt.hash(password, BCRYPT_ROUNDS);
        return res.status(401).json({ error: 'Invalid username or password.' });
      }

      if (usersModel.isLocked(user)) {
        return res.status(423).json({ error: 'This account is temporarily locked after too many failed attempts. Try again in 15 minutes.' });
      }

      usersModel.clearExpiredBans();
      const block = usersModel.getAccountBlock(user);
      if (block) return res.status(403).json({ error: block.message, accountBlocked: block.type });

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        usersModel.registerFailedLogin(user);
        return res.status(401).json({ error: 'Invalid username or password.' });
      }

      // Password is correct. If 2FA is on, the session only gets a
      // "pending" marker — req.session.userId (what requireAuth checks)
      // isn't set until the TOTP code is also verified below.
      if (user.totp_enabled) {
        await regenerateSession(req);
        req.session.pendingTotpUserId = user.id;
        const csrfToken = rotateCsrfToken(req);
        return res.json({ requiresTotp: true, csrfToken });
      }

      await regenerateSession(req);
      const csrfToken = completeLogin(req, user);

      res.json({ user: usersModel.toPublicUser(user), csrfToken });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/login-totp',
  loginLimiter,
  verifyCsrfToken,
  [body('code').isString().notEmpty()],
  async (req, res, next) => {
    try {
      const pendingUserId = req.session.pendingTotpUserId;
      if (!pendingUserId) {
        return res.status(400).json({ error: 'No sign-in in progress. Enter your username and password again.' });
      }

      const user = usersModel.findById(pendingUserId);
      if (!user || !user.totp_enabled) {
        return res.status(400).json({ error: 'No sign-in in progress. Enter your username and password again.' });
      }

      if (usersModel.isLocked(user)) {
        return res.status(423).json({ error: 'This account is temporarily locked after too many failed attempts. Try again in 15 minutes.' });
      }

      usersModel.clearExpiredBans();
      const block = usersModel.getAccountBlock(user);
      if (block) return res.status(403).json({ error: block.message, accountBlocked: block.type });

      const submitted = String(req.body.code || '').trim();
      let verified = totp.verifyTotp(submitted, user.totp_secret);

      // Fall back to a recovery code if the input looks like one (XXXX-XXXX)
      // rather than a 6-digit TOTP code — each code is single-use and is
      // removed the moment it's successfully consumed.
      if (!verified && RECOVERY_CODE_PATTERN.test(submitted.toUpperCase())) {
        const hashes = usersModel.getRecoveryCodeHashes(user);
        for (const hash of hashes) {
          // eslint-disable-next-line no-await-in-loop
          if (await bcrypt.compare(submitted.toUpperCase(), hash)) {
            usersModel.removeRecoveryCodeHash(user.id, hash);
            verified = true;
            break;
          }
        }
      }

      if (!verified) {
        usersModel.registerFailedLogin(user);
        return res.status(401).json({ error: 'That code is incorrect or expired.' });
      }

      await regenerateSession(req);
      const csrfToken = completeLogin(req, user);

      res.json({ user: usersModel.toPublicUser(user), csrfToken });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/forgot-password',
  passwordResetLimiter,
  verifyCsrfToken,
  [body('username').trim().notEmpty()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: 'Enter your username.' });

      // Same generic response regardless of what's found — this is the one
      // place account existence must never leak, since it's reachable by
      // anyone without a password.
      const genericResponse = { ok: true, message: "If that account has an email on file, we've sent reset instructions to it." };

      const user = usersModel.findByUsername(req.body.username.trim());
      if (!user || !user.email) return res.json(genericResponse);

      const rawToken = usersModel.createPasswordResetToken(user.id);
      const origin = `${req.protocol}://${req.get('host')}`;
      const resetUrl = `${origin}/pages/reset-password?token=${rawToken}`;
      await email.passwordResetEmail({ to: user.email, username: user.username, resetUrl });

      res.json(genericResponse);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/reset-password',
  passwordResetLimiter,
  verifyCsrfToken,
  [
    body('token').isString().notEmpty(),
    body('newPassword').isLength({ min: 8, max: 128 }).withMessage('Password must be at least 8 characters.')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

      const user = usersModel.consumePasswordResetToken(req.body.token);
      if (!user) return res.status(400).json({ error: 'That reset link is invalid or has expired. Request a new one.' });

      const passwordHash = await bcrypt.hash(req.body.newPassword, BCRYPT_ROUNDS);
      usersModel.setPassword(user.id, passwordHash);
      usersModel.clearFailedLogins(user.id);
      auditLog.record({ actor: user, action: 'password.reset', target: user.username });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/logout', verifyCsrfToken, (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('sf.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null, impersonating: null });
  const user = usersModel.findPublicById(req.session.userId);
  if (!user) return res.json({ user: null, impersonating: null });

  const impersonating = req.session.impersonatorId
    ? { asUsername: user.username, adminUsername: req.session.impersonatorUsername }
    : null;

  res.json({ user: usersModel.toPublicUser(user), impersonating });
});

// Lets an admin who's currently "viewing as" another account (see
// POST /api/admin/users/:id/impersonate) switch straight back to their own
// session without logging out — req.session.userId/role point at the
// impersonated account while this is active, so this can't be gated by
// requireAdmin (that would re-check the *impersonated* account's role and
// reject it); instead it only trusts the separately-tracked impersonatorId.
router.post('/stop-impersonating', verifyCsrfToken, (req, res) => {
  if (!req.session.impersonatorId) {
    return res.status(400).json({ error: "You're not currently viewing the site as another account." });
  }

  const admin = usersModel.findById(req.session.impersonatorId);
  if (!admin || admin.role !== 'admin') {
    return req.session.destroy(() => {
      res.clearCookie('sf.sid');
      res.status(401).json({ error: 'Your admin session is no longer valid. Please sign in again.' });
    });
  }

  const impersonatedUser = usersModel.findById(req.session.userId);
  auditLog.record({
    actor: admin,
    action: 'user.impersonate.stop',
    target: impersonatedUser ? impersonatedUser.username : null
  });

  req.session.userId = admin.id;
  req.session.role = admin.role;
  delete req.session.impersonatorId;
  delete req.session.impersonatorUsername;

  res.json({ user: usersModel.toPublicUser(admin) });
});

module.exports = router;
