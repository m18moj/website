const os = require('os');
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
const db = require('../db');
const packageJson = require('../../package.json');
const { serializeOrder, serializeAdminOrder } = require('../serialize');

const router = express.Router();

// Set once, when this module first loads at server boot — used to compute
// uptime for the System Status panel.
const SERVER_STARTED_AT = new Date();

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

router.patch(
  '/users/:id/role',
  verifyCsrfToken,
  [param('id').isInt().toInt(), body('role').isIn(['customer', 'admin'])],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request.' });

    const targetId = req.params.id;
    if (targetId === req.currentUser.id) {
      return res.status(400).json({ error: "You can't change your own role from here." });
    }

    const target = usersModel.findById(targetId);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const updated = usersModel.setRole(targetId, req.body.role);
    auditLog.record({
      actor: req.currentUser,
      action: 'user.role.change',
      target: target.username,
      details: { from: target.role, to: req.body.role }
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

const packBody = [
  body('packName').trim().isLength({ min: 1, max: 80 }),
  body('gameTitle').optional({ nullable: true }).trim().isLength({ max: 80 }),
  body('genre').optional({ nullable: true }).trim().isLength({ max: 40 }),
  body('description').optional({ nullable: true }).trim().isLength({ max: 400 }),
  body('detailUrl').optional({ nullable: true }).trim().isLength({ max: 200 })
];

router.post('/catalog/packs', verifyCsrfToken, packBody, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid pack details.' });

  const pack = catalogModel.createPack(req.body);
  auditLog.record({ actor: req.currentUser, action: 'catalog.pack.create', target: pack.packId });
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
    res.json({ pack });
  }
);

router.patch(
  '/catalog/packs/:packId/hidden',
  verifyCsrfToken,
  [param('packId').isString().notEmpty(), body('hidden').isBoolean()],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request.' });

    const pack = catalogModel.setPackHidden(req.params.packId, req.body.hidden);
    if (!pack) return res.status(404).json({ error: 'Pack not found.' });

    auditLog.record({
      actor: req.currentUser,
      action: req.body.hidden ? 'catalog.pack.hide' : 'catalog.pack.show',
      target: pack.packId
    });
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
