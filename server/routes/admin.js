const os = require('os');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult, param } = require('express-validator');

const { requireAdmin } = require('../middleware/auth');
const { verifyCsrfToken } = require('../middleware/csrf');
const { securityActionLimiter } = require('../middleware/rateLimit');
const usersModel = require('../models/users');
const ordersModel = require('../models/orders');
const auditLog = require('../models/auditLog');
const totp = require('../totp');
const nowpayments = require('../nowpayments');
const catalogModel = require('../models/catalog');
const settingsModel = require('../models/settings');
const promoCodesModel = require('../models/promoCodes');
const reviewsModel = require('../models/reviews');
const bundlesModel = require('../models/bundles');
const licensesModel = require('../models/licenses');
const errorLogModel = require('../models/errorLog');
const { fulfillOrder } = require('../orderFulfillment');
const discordLinks = require('../../discord-bot/models/discordLinks');
const discordRest = require('../../discord-bot/discordRest');
const productAnnounce = require('../../discord-bot/productAnnounce');
const db = require('../db');
const packageJson = require('../../package.json');
const { serializeOrder, serializeAdminOrder } = require('../serialize');

const router = express.Router();
const BCRYPT_ROUNDS = 12;

// Set once, when this module first loads at server boot — used to compute
// uptime for the System Status panel.
const SERVER_STARTED_AT = new Date();

// How long a "temporary" admin-created account stays valid for, keyed by the
// option the dashboard's New User form sends. Sign-in is refused once this
// passes (see usersModel.getAccountBlock) — nothing deletes the row, so an
// admin can still find and extend/convert it afterward.
const TEMP_ACCOUNT_DURATIONS_MS = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000
};

function randomUsername() {
  return `guest_${crypto.randomBytes(3).toString('hex')}`;
}

function randomPassword() {
  return crypto.randomBytes(9).toString('base64url');
}

// Every route below requires an authenticated session belonging to a user
// whose role is currently 'admin' in the database (checked fresh per request
// by requireAdmin) — this is the site's one privileged surface with access
// to every user's account and order data.
router.use(requireAdmin);

router.get('/stats', (req, res) => {
  const orderStats = ordersModel.stats();
  res.json({
    userCount: usersModel.countAll(),
    adminCount: usersModel.countAdmins(),
    paidOrders: orderStats.paidOrders,
    // An array, not one number — orders can be placed in GBP/USD/EUR, and
    // summing raw amounts across currencies would be meaningless.
    revenueByCurrency: orderStats.revenueByCurrency
  });
});

router.get('/users', (req, res) => {
  res.json({ users: usersModel.listAll() });
});

// Admin-created accounts, for QA/demos and one-off "let me try this as a
// customer" checks — the only HTTP-reachable way to create a user besides
// self-registration. Always a 'customer' (see usersModel.createAdminUser for
// why granting admin can't happen this way). Username/password are optional;
// when omitted, one is generated and returned once in the response body —
// same pattern as a password reset token, this is the only time the caller
// ever sees the raw generated password, since only its bcrypt hash is stored.
router.post(
  '/users',
  verifyCsrfToken,
  [
    body('username').optional({ nullable: true }).trim().matches(/^[a-zA-Z0-9_-]{3,24}$/)
      .withMessage('Username must be 3-24 characters: letters, numbers, underscores, or hyphens only.'),
    body('password').optional({ nullable: true }).isString().isLength({ min: 8, max: 128 })
      .withMessage('Password must be at least 8 characters.'),
    body('isTest').optional().isBoolean(),
    body('expiresIn').optional({ nullable: true }).isIn(Object.keys(TEMP_ACCOUNT_DURATIONS_MS))
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

      let username = (req.body.username || '').trim();
      if (username) {
        if (usersModel.findByUsername(username)) {
          return res.status(409).json({ error: 'That username is already taken.' });
        }
      } else {
        do {
          username = randomUsername();
        } while (usersModel.findByUsername(username));
      }

      const generatedPassword = req.body.password ? null : randomPassword();
      const password = req.body.password || generatedPassword;

      const expiresAt = req.body.expiresIn
        ? new Date(Date.now() + TEMP_ACCOUNT_DURATIONS_MS[req.body.expiresIn]).toISOString()
        : null;

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const user = usersModel.createAdminUser({
        username,
        passwordHash,
        isTest: Boolean(req.body.isTest),
        expiresAt,
        createdBy: req.currentUser.username
      });

      auditLog.record({
        actor: req.currentUser,
        action: 'user.create',
        target: user.username,
        details: { isTest: Boolean(req.body.isTest), expiresAt, temporary: Boolean(expiresAt) }
      });

      res.status(201).json({
        user,
        generatedUsername: req.body.username ? null : username,
        generatedPassword
      });
    } catch (err) {
      next(err);
    }
  }
);

// Everything about one user in a single response — profile, login history,
// and purchase summary — so the dashboard doesn't need three round trips (or
// three separate places on screen) to answer "who is this account".
router.get('/users/:id', [param('id').isInt().toInt()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request.' });

  usersModel.clearExpiredBans();
  const users = usersModel.listAll();
  const user = users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const discordLink = discordLinks.findByUserId(req.params.id);

  res.json({
    user,
    loginHistory: usersModel.loginHistoryForUser(req.params.id, 20),
    purchases: ordersModel.statsForUser(req.params.id),
    orders: ordersModel.ordersForUser(req.params.id).map(serializeOrder),
    licenses: licensesModel.listForUser(req.params.id),
    // Role changes, unlocks, bans, disables — everything an admin has ever
    // done to this specific account, most recent first. The audit log is
    // already the record of this; this just filters it to one person.
    moderationHistory: auditLog.forTarget(user.username, 20),
    discordLink: discordLink ? { discordId: discordLink.discord_id, discordTag: discordLink.discord_tag, linkedAt: discordLink.linked_at } : null
  });
});

// Lets an admin sever a Discord link without needing the customer's
// cooperation — useful if a link looks wrong/compromised, or a customer
// asks staff to unlink them because they can no longer access Discord.
router.post('/users/:id/discord-unlink', verifyCsrfToken, [param('id').isInt().toInt()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request.' });

  const target = usersModel.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  const link = discordLinks.findByUserId(req.params.id);
  if (!link) return res.status(404).json({ error: 'That account has no linked Discord account.' });

  await discordRest.syncVerifiedRole(link.discord_id, { add: false });
  discordLinks.unlink(link.discord_id);
  auditLog.record({ actor: req.currentUser, action: 'discord.admin_unlink', target: target.username, details: { discordTag: link.discord_tag } });

  res.json({ ok: true });
});

router.get('/analytics', (req, res) => {
  res.json({
    ordersByDay: ordersModel.ordersByDay(14),
    topPacks: ordersModel.topPacks(5)
  });
});

// A direct download link (not a fetch call) — the browser's existing admin
// session cookie authenticates it, same as any other page navigation.
router.get('/orders/export.csv', (req, res) => {
  const orders = ordersModel.allOrders().map(serializeAdminOrder);
  const header = 'Order ID,Customer,Status,Payment,Currency,Total,Created,Paid At\n';
  const rows = orders.map((o) => [
    `SF-${o.id}`,
    o.customerUsername,
    o.status,
    o.paymentProvider,
    o.currency,
    o.totalAmount.toFixed(2),
    o.createdAt,
    o.paidAt || ''
  ].map((field) => `"${String(field).replace(/"/g, '""')}"`).join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="scripforge-orders.csv"');
  res.send(header + rows);
});

// Demote-only. Granting admin access is deliberately impossible from any web
// UI/API — the only way to create an admin is the `npm run create-admin` CLI
// (server/scripts/create-admin.js), run locally on the machine itself. This
// used to also accept role: 'admin' (the dashboard's old "Make Admin"
// button), which meant a compromised admin session could mint arbitrary new
// admins over HTTP; that capability has been removed entirely rather than
// just hidden in the UI.
router.patch(
  '/users/:id/role',
  verifyCsrfToken,
  [param('id').isInt().toInt(), body('role').equals('customer')],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Admin access can only be granted via the create-admin CLI on the server itself — this endpoint can only demote an admin to customer.' });
    }

    const targetId = req.params.id;
    if (targetId === req.currentUser.id) {
      return res.status(400).json({ error: "You can't change your own role from here." });
    }

    const target = usersModel.findById(targetId);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (target.role !== 'admin') return res.status(400).json({ error: 'That account is already a customer.' });

    const updated = usersModel.setRole(targetId, 'customer');
    auditLog.record({
      actor: req.currentUser,
      action: 'user.role.change',
      target: target.username,
      details: { from: target.role, to: 'customer' }
    });
    res.json({ user: updated });
  }
);

router.post('/users/:id/unlock', verifyCsrfToken, [param('id').isInt().toInt()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request.' });

  const target = usersModel.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  const updated = usersModel.unlockAccount(req.params.id);
  auditLog.record({ actor: req.currentUser, action: 'user.unlock', target: target.username });
  res.json({ user: updated });
});

// Quick, no-reason-required toggle — distinct from the ban below, which
// records a reason, a duration, and who did it. Admin-on-admin is allowed
// (any admin can manage any other, same as the role toggle above) but never
// on your own account, so a compromised session can't lock out everyone else.
router.post('/users/:id/disable', verifyCsrfToken, [param('id').isInt().toInt()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request.' });

  const targetId = req.params.id;
  if (targetId === req.currentUser.id) {
    return res.status(400).json({ error: "You can't disable your own account from here." });
  }

  const target = usersModel.findById(targetId);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  const updated = usersModel.setDisabled(targetId, true);
  auditLog.record({ actor: req.currentUser, action: 'user.disable', target: target.username });
  res.json({ user: updated });
});

router.post('/users/:id/enable', verifyCsrfToken, [param('id').isInt().toInt()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request.' });

  const target = usersModel.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  const updated = usersModel.setDisabled(req.params.id, false);
  auditLog.record({ actor: req.currentUser, action: 'user.enable', target: target.username });
  res.json({ user: updated });
});

router.post(
  '/users/:id/ban',
  verifyCsrfToken,
  [
    param('id').isInt().toInt(),
    body('banType').isIn(usersModel.BAN_TYPES),
    body('reason').optional({ nullable: true }).isString().isLength({ max: 500 })
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request.' });

    const targetId = req.params.id;
    if (targetId === req.currentUser.id) {
      return res.status(400).json({ error: "You can't ban your own account from here." });
    }

    const target = usersModel.findById(targetId);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const updated = usersModel.banUser(targetId, {
      banType: req.body.banType,
      reason: req.body.reason,
      bannedBy: req.currentUser.username
    });
    auditLog.record({
      actor: req.currentUser,
      action: 'user.ban',
      target: target.username,
      details: { banType: req.body.banType, reason: req.body.reason || null }
    });
    res.json({ user: updated });
  }
);

router.post('/users/:id/unban', verifyCsrfToken, [param('id').isInt().toInt()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request.' });

  const target = usersModel.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  const updated = usersModel.unbanUser(req.params.id);
  auditLog.record({ actor: req.currentUser, action: 'user.unban', target: target.username });
  res.json({ user: updated });
});

// Marks an account's own purchases/activity as QA/demo data rather than a
// real customer, so the dashboard's revenue and buyer counts aren't
// misleading. Doesn't affect the account's ability to sign in or buy.
router.patch(
  '/users/:id/test',
  verifyCsrfToken,
  [param('id').isInt().toInt(), body('isTest').isBoolean()],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request.' });

    const target = usersModel.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const updated = usersModel.setTestFlag(req.params.id, req.body.isTest);
    auditLog.record({
      actor: req.currentUser,
      action: req.body.isTest ? 'user.test.mark' : 'user.test.unmark',
      target: target.username
    });
    res.json({ user: updated });
  }
);

// Lets an admin briefly sign in "as" a non-admin account to check exactly
// what that account can see/do — genuinely switches the session's identity
// (req.session.userId/role) rather than just changing the UI, so every
// permission check downstream sees the real target account. The original
// admin identity is kept in req.session.impersonatorId so
// POST /api/auth/stop-impersonating can restore it; that route deliberately
// lives outside this admin-only router since, while impersonating, the
// session's role is the target's (often 'customer'), which requireAdmin
// above would reject.
router.post(
  '/users/:id/impersonate',
  verifyCsrfToken,
  [param('id').isInt().toInt()],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request.' });

    const targetId = req.params.id;
    if (targetId === req.currentUser.id) {
      return res.status(400).json({ error: "You're already signed in as yourself." });
    }

    const target = usersModel.findById(targetId);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (target.role === 'admin') {
      return res.status(400).json({ error: "You can't view the site as another admin account." });
    }

    const block = usersModel.getAccountBlock(target);
    if (block) return res.status(400).json({ error: `That account can't be viewed right now: ${block.message}` });

    req.session.impersonatorId = req.currentUser.id;
    req.session.impersonatorUsername = req.currentUser.username;
    req.session.userId = target.id;
    req.session.role = target.role;

    auditLog.record({ actor: req.currentUser, action: 'user.impersonate.start', target: target.username });
    res.json({ user: usersModel.toPublicUser(target) });
  }
);

router.delete('/users/:id', verifyCsrfToken, [param('id').isInt().toInt()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request.' });

  const targetId = req.params.id;
  if (targetId === req.currentUser.id) {
    return res.status(400).json({ error: "You can't delete your own account from here." });
  }

  const target = usersModel.findById(targetId);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  usersModel.deleteUser(targetId);
  auditLog.record({ actor: req.currentUser, action: 'user.delete', target: target.username });
  res.json({ ok: true });
});

router.get('/orders', (req, res) => {
  res.json({ orders: ordersModel.allOrders().map(serializeAdminOrder) });
});

router.patch(
  '/orders/:id/status',
  verifyCsrfToken,
  [param('id').isInt().toInt(), body('status').isIn(ordersModel.ORDER_STATUSES)],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request.' });

    const existing = ordersModel.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Order not found.' });

    const updated = ordersModel.setStatus(req.params.id, req.body.status);
    if (existing.status !== 'paid' && req.body.status === 'paid') {
      fulfillOrder(req.params.id).catch((err) => console.error('Order fulfillment failed:', err));
    }
    auditLog.record({
      actor: req.currentUser,
      action: 'order.status.change',
      target: `order #${req.params.id}`,
      details: { from: existing.status, to: req.body.status }
    });
    res.json({ order: serializeOrder(updated) });
  }
);

// Marks a single order as QA/demo data (a Stripe test-mode checkout, a
// manually-created order for a walkthrough, etc.) so it's excluded from the
// dashboard's real revenue and paid-order totals (see orders.js stats()).
// Doesn't change the order's status, so a paid test order still shows up in
// the customer's own purchase/license history for testing downloads.
router.patch(
  '/orders/:id/test',
  verifyCsrfToken,
  [param('id').isInt().toInt(), body('isTest').isBoolean()],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request.' });

    const existing = ordersModel.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Order not found.' });

    const updated = ordersModel.setTestFlag(req.params.id, req.body.isTest);
    auditLog.record({
      actor: req.currentUser,
      action: req.body.isTest ? 'order.test.mark' : 'order.test.unmark',
      target: `order #${req.params.id}`
    });
    res.json({ order: serializeOrder(updated) });
  }
);

router.get('/audit-log', (req, res) => {
  res.json({ entries: auditLog.recent(200) });
});

// --- Catalog management --------------------------------------------------
// Full read/write access to what's actually for sale, backed by the
// packs/scripts tables (server/models/catalog.js) — this IS the data
// checkout pricing reads from, so changes here take effect immediately.

router.get('/catalog', (req, res) => {
  res.json({ catalog: catalogModel.listAll({ includeHidden: true }) });
});

// Fire-and-forget catalogue-channel resync after any catalog mutation —
// each of productAnnounce's functions already catches its own errors and
// returns { ok: false } rather than throwing, so this never risks the
// catalog write itself failing because Discord is unreachable.
function resyncCatalogueChannel() {
  productAnnounce.syncCatalogueChannel().catch(() => {});
}

const packBody = [
  body('packName').trim().isLength({ min: 1, max: 80 }),
  body('gameTitle').optional({ nullable: true }).trim().isLength({ max: 80 }),
  body('genre').optional({ nullable: true }).trim().isLength({ max: 40 }),
  body('description').optional({ nullable: true }).trim().isLength({ max: 400 }),
  body('detailUrl').optional({ nullable: true }).trim().isLength({ max: 200 })
];

router.post('/catalog/packs', verifyCsrfToken, packBody, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid pack details.' });

  const pack = catalogModel.createPack(req.body);
  auditLog.record({ actor: req.currentUser, action: 'catalog.pack.create', target: pack.packId });
  // New packs are visible immediately (no separate "publish" step), so this
  // is the one true "product launch" moment — announce it here. Best-effort:
  // Discord being unreachable/unconfigured must never fail catalog creation.
  await productAnnounce.announceNewProduct(pack.packId).catch(() => {});
  await productAnnounce.syncCatalogueChannel().catch(() => {});
  res.status(201).json({ pack });
});

router.patch(
  '/catalog/packs/:packId',
  verifyCsrfToken,
  [param('packId').isString().notEmpty(), ...packBody],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid pack details.' });

    const pack = catalogModel.updatePack(req.params.packId, req.body);
    if (!pack) return res.status(404).json({ error: 'Pack not found.' });

    auditLog.record({ actor: req.currentUser, action: 'catalog.pack.update', target: pack.packId });
    resyncCatalogueChannel();
    res.json({ pack });
  }
);

router.patch(
  '/catalog/packs/:packId/hidden',
  verifyCsrfToken,
  [param('packId').isString().notEmpty(), body('hidden').isBoolean()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request.' });

    const pack = catalogModel.setPackHidden(req.params.packId, req.body.hidden);
    if (!pack) return res.status(404).json({ error: 'Pack not found.' });

    auditLog.record({
      actor: req.currentUser,
      action: req.body.hidden ? 'catalog.pack.hide' : 'catalog.pack.show',
      target: pack.packId
    });

    // A pack made visible for the first time (e.g. created hidden, finished
    // being prepped, then published) is just as much a "launch" as a
    // brand-new pack — announceNewProduct() is itself dedupe-safe either way.
    if (!req.body.hidden) await productAnnounce.announceNewProduct(pack.packId).catch(() => {});
    resyncCatalogueChannel();
    res.json({ pack });
  }
);

router.delete('/catalog/packs/:packId', verifyCsrfToken, [param('packId').isString().notEmpty()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request.' });

  const existing = catalogModel.getPack(req.params.packId, { includeHidden: true });
  if (!existing) return res.status(404).json({ error: 'Pack not found.' });

  catalogModel.deletePack(req.params.packId);
  auditLog.record({ actor: req.currentUser, action: 'catalog.pack.delete', target: req.params.packId });
  resyncCatalogueChannel();
  res.json({ ok: true });
});

const scriptBody = [
  body('title').trim().isLength({ min: 1, max: 80 }),
  body('description').optional({ nullable: true }).trim().isLength({ max: 300 }),
  body('category').optional({ nullable: true }).trim().isLength({ max: 40 }),
  body('price').isFloat({ min: 0, max: 1000 })
];

router.post(
  '/catalog/packs/:packId/scripts',
  verifyCsrfToken,
  [param('packId').isString().notEmpty(), ...scriptBody],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid script details.' });

    const pack = catalogModel.createScript(req.params.packId, req.body);
    if (!pack) return res.status(404).json({ error: 'Pack not found.' });

    auditLog.record({ actor: req.currentUser, action: 'catalog.script.create', target: `${req.params.packId}/${req.body.title}` });
    resyncCatalogueChannel();
    res.status(201).json({ pack });
  }
);

router.patch(
  '/catalog/packs/:packId/scripts/:scriptId',
  verifyCsrfToken,
  [param('packId').isString().notEmpty(), param('scriptId').isString().notEmpty(), ...scriptBody],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid script details.' });

    const pack = catalogModel.updateScript(req.params.packId, req.params.scriptId, req.body);
    if (!pack) return res.status(404).json({ error: 'Script not found.' });

    auditLog.record({ actor: req.currentUser, action: 'catalog.script.update', target: `${req.params.packId}/${req.params.scriptId}` });
    resyncCatalogueChannel();
    res.json({ pack });
  }
);

router.patch(
  '/catalog/packs/:packId/scripts/:scriptId/hidden',
  verifyCsrfToken,
  [param('packId').isString().notEmpty(), param('scriptId').isString().notEmpty(), body('hidden').isBoolean()],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request.' });

    const pack = catalogModel.setScriptHidden(req.params.packId, req.params.scriptId, req.body.hidden);
    if (!pack) return res.status(404).json({ error: 'Script not found.' });

    auditLog.record({
      actor: req.currentUser,
      action: req.body.hidden ? 'catalog.script.hide' : 'catalog.script.show',
      target: `${req.params.packId}/${req.params.scriptId}`
    });
    resyncCatalogueChannel();
    res.json({ pack });
  }
);

router.delete(
  '/catalog/packs/:packId/scripts/:scriptId',
  verifyCsrfToken,
  [param('packId').isString().notEmpty(), param('scriptId').isString().notEmpty()],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request.' });

    const pack = catalogModel.deleteScript(req.params.packId, req.params.scriptId);
    if (!pack) return res.status(404).json({ error: 'Pack not found.' });

    auditLog.record({ actor: req.currentUser, action: 'catalog.script.delete', target: `${req.params.packId}/${req.params.scriptId}` });
    res.json({ pack });
  }
);

router.post(
  '/catalog/packs/:packId/scripts/:scriptId/changelog',
  verifyCsrfToken,
  [
    param('packId').isString().notEmpty(),
    param('scriptId').isString().notEmpty(),
    body('version').trim().notEmpty().isLength({ max: 20 }),
    body('notes').trim().notEmpty().isLength({ max: 300 })
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Enter a version and a note.' });

    const pack = catalogModel.addChangelogEntry(req.params.packId, req.params.scriptId, {
      version: req.body.version,
      notes: req.body.notes
    });
    if (!pack) return res.status(404).json({ error: 'Script not found.' });
    auditLog.record({
      actor: req.currentUser,
      action: 'catalog.script.changelog',
      target: `${req.params.packId}/${req.params.scriptId}`,
      details: { version: req.body.version }
    });
    res.json({ pack });
  }
);

// --- Promo codes -------------------------------------------------------

router.get('/promo-codes', (req, res) => {
  res.json({ promoCodes: promoCodesModel.listAll() });
});

router.post(
  '/promo-codes',
  verifyCsrfToken,
  [
    body('code').trim().isLength({ min: 3, max: 30 }),
    body('discountType').isIn(['percent', 'fixed']),
    body('discountValue').isFloat({ min: 0.01 }),
    body('maxUses').optional({ nullable: true }).isInt({ min: 1 }),
    body('expiresAt').optional({ nullable: true }).isISO8601()
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid promo code details.' });

    if (promoCodesModel.findByCode(req.body.code)) {
      return res.status(409).json({ error: 'A promo code with that name already exists.' });
    }

    // Fixed discounts are stored in cents (whole-currency-unit input * 100);
    // percent discounts are stored as a plain 1-100 integer.
    const discountValue = req.body.discountType === 'fixed'
      ? Math.round(req.body.discountValue * 100)
      : req.body.discountValue;

    const promo = promoCodesModel.createCode({
      code: req.body.code,
      discountType: req.body.discountType,
      discountValue,
      maxUses: req.body.maxUses || null,
      expiresAt: req.body.expiresAt || null
    });
    auditLog.record({ actor: req.currentUser, action: 'promo.create', target: promo.code });
    res.status(201).json({ promoCode: promo });
  }
);

router.patch('/promo-codes/:code/active', verifyCsrfToken, [body('active').isBoolean()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request.' });

  const promo = promoCodesModel.setActive(req.params.code, req.body.active);
  if (!promo) return res.status(404).json({ error: 'Promo code not found.' });
  auditLog.record({ actor: req.currentUser, action: req.body.active ? 'promo.enable' : 'promo.disable', target: promo.code });
  res.json({ promoCode: promo });
});

router.delete('/promo-codes/:code', verifyCsrfToken, (req, res) => {
  promoCodesModel.deleteCode(req.params.code);
  auditLog.record({ actor: req.currentUser, action: 'promo.delete', target: req.params.code });
  res.json({ ok: true });
});

// --- Bundles -------------------------------------------------------------

router.get('/bundles', (req, res) => {
  res.json({ bundles: bundlesModel.listAll() });
});

router.post(
  '/bundles',
  verifyCsrfToken,
  [
    body('name').trim().isLength({ min: 1, max: 100 }),
    body('description').optional({ nullable: true }).trim().isLength({ max: 400 }),
    body('packIds').isArray({ min: 2 }),
    body('discountPercent').isFloat({ min: 0, max: 90 })
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'A bundle needs a name, at least 2 packs, and a discount between 0-90%.' });

    const bundle = bundlesModel.createBundle(req.body);
    auditLog.record({ actor: req.currentUser, action: 'bundle.create', target: bundle.name });
    res.status(201).json({ bundle });
  }
);

router.patch(
  '/bundles/:id',
  verifyCsrfToken,
  [param('id').isInt().toInt()],
  (req, res) => {
    const bundle = bundlesModel.updateBundle(req.params.id, req.body);
    if (!bundle) return res.status(404).json({ error: 'Bundle not found.' });
    auditLog.record({ actor: req.currentUser, action: 'bundle.update', target: bundle.name });
    res.json({ bundle });
  }
);

router.patch('/bundles/:id/active', verifyCsrfToken, [param('id').isInt().toInt(), body('active').isBoolean()], (req, res) => {
  const bundle = bundlesModel.setActive(req.params.id, req.body.active);
  if (!bundle) return res.status(404).json({ error: 'Bundle not found.' });
  auditLog.record({ actor: req.currentUser, action: req.body.active ? 'bundle.enable' : 'bundle.disable', target: bundle.name });
  res.json({ bundle });
});

router.delete('/bundles/:id', verifyCsrfToken, [param('id').isInt().toInt()], (req, res) => {
  bundlesModel.deleteBundle(req.params.id);
  auditLog.record({ actor: req.currentUser, action: 'bundle.delete', target: `bundle #${req.params.id}` });
  res.json({ ok: true });
});

// --- Reviews (moderation) -------------------------------------------------

router.get('/reviews/:packId', [param('packId').isString().notEmpty()], (req, res) => {
  res.json({ reviews: reviewsModel.forPack(req.params.packId), summary: reviewsModel.summaryForPack(req.params.packId) });
});

router.delete('/reviews/:packId/:userId', verifyCsrfToken, [param('packId').isString().notEmpty(), param('userId').isInt().toInt()], (req, res) => {
  reviewsModel.deleteReview(req.params.packId, req.params.userId);
  auditLog.record({ actor: req.currentUser, action: 'review.delete', target: `${req.params.packId}/user#${req.params.userId}` });
  res.json({ ok: true });
});

// --- License keys ----------------------------------------------------------
// Admin visibility + the one override a customer legitimately needs: moving
// a license to a new device (lost phone, new PC, etc).

router.post('/licenses/:licenseKey/reset-device', verifyCsrfToken, (req, res) => {
  const license = licensesModel.resetDevice(req.params.licenseKey);
  if (!license) return res.status(404).json({ error: 'License not found.' });
  auditLog.record({ actor: req.currentUser, action: 'license.reset_device', target: req.params.licenseKey });
  res.json({ ok: true });
});

// Every download attempt (success or refused) against this key — IP, device
// id, and why it was refused if it was, for spotting sharing/abuse patterns.
router.get('/licenses/:licenseKey/activity', (req, res) => {
  res.json({ entries: licensesModel.logForKey(req.params.licenseKey, 30) });
});

// --- Error log ---------------------------------------------------------

router.get('/error-log', (req, res) => {
  res.json({ entries: errorLogModel.recent(200), last24h: errorLogModel.countLast24h() });
});

router.delete('/error-log', verifyCsrfToken, (req, res) => {
  errorLogModel.clearAll();
  auditLog.record({ actor: req.currentUser, action: 'error_log.clear' });
  res.json({ ok: true });
});

// --- Site settings / feature flags -----------------------------------------
// Toggleable from the admin dashboard's Settings tab. See
// server/models/settings.js for the full list and defaults.

router.get('/settings', (req, res) => {
  res.json({ settings: settingsModel.getAll() });
});

router.patch(
  '/settings/:key',
  verifyCsrfToken,
  [param('key').isString().notEmpty()],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request.' });

    try {
      const value = settingsModel.set(req.params.key, req.body.value);
      auditLog.record({
        actor: req.currentUser,
        action: 'settings.update',
        target: req.params.key,
        details: { value }
      });
      res.json({ key: req.params.key, value });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  }
);

// --- System status ---------------------------------------------------------
// Every field here is read from a real, live source (process/os/db) at
// request time — nothing hardcoded or simulated.

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

router.get('/system-status', (req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const stripeConfigured = Boolean(stripeKey) && !stripeKey.includes('...') && Boolean(process.env.STRIPE_WEBHOOK_SECRET);

  const { page_count: pageCount } = db.prepare('PRAGMA page_count').get();
  const { page_size: pageSize } = db.prepare('PRAGMA page_size').get();
  const activeSessions = db.prepare(`SELECT COUNT(*) AS count FROM sessions WHERE datetime('now') < datetime(expire)`).get().count;
  const mem = process.memoryUsage();
  const uptimeSeconds = process.uptime();

  res.json({
    appVersion: packageJson.version,
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || 'development',
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    cpuCount: os.cpus().length,
    stripeConfigured,
    cryptoConfigured: nowpayments.isConfigured() && Boolean(process.env.NOWPAYMENTS_IPN_SECRET),
    packCount: catalogModel.listAll({ includeHidden: true }).length,
    scriptCount: catalogModel.totalScriptCount(),
    userCount: usersModel.countAll(),
    adminCount: usersModel.countAdmins(),
    activeSessions,
    databaseSizeBytes: pageCount * pageSize,
    memoryUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    memoryTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
    rssMb: Math.round(mem.rss / 1024 / 1024),
    uptimeSeconds: Math.round(uptimeSeconds),
    uptimeText: formatUptime(uptimeSeconds),
    startedAt: SERVER_STARTED_AT.toISOString()
  });
});

// Self-service 2FA for the signed-in admin's own account. 2FA is
// deliberately admin-only (customers use a CAPTCHA instead — see
// server/routes/auth.js) since it protects the one account type with real
// power over the store; requireAdmin above already guarantees req.currentUser
// is an admin, so no extra role check is needed here.
router.get('/2fa/setup', securityActionLimiter, (req, res) => {
  const secret = totp.generateSecret();
  usersModel.setTotpSecret(req.currentUser.id, secret);

  res.json({
    secret,
    otpauthUri: totp.generateOtpAuthUri({ secret, label: req.currentUser.username, issuer: 'ScripForge Admin' })
  });
});

router.post(
  '/2fa/enable',
  verifyCsrfToken,
  securityActionLimiter,
  [body('code').isString().notEmpty()],
  (req, res) => {
    const user = usersModel.findById(req.currentUser.id);
    if (!user.totp_secret) return res.status(400).json({ error: 'Start setup first by requesting a new 2FA secret.' });

    if (!totp.verifyTotp(req.body.code, user.totp_secret)) {
      return res.status(401).json({ error: 'That code is incorrect or expired. Try the next code your app generates.' });
    }

    usersModel.enableTotp(user.id);
    auditLog.record({ actor: req.currentUser, action: '2fa.enable', target: user.username });
    res.json({ ok: true });
  }
);

router.post(
  '/2fa/disable',
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

module.exports = router;
