// Backend for the dedicated bot admin dashboard (bot-admin/index.html) — a
// separate page from the website's own admin panel, but deliberately reusing
// the exact same server-side admin auth (requireAdmin) rather than inventing
// a second permission system: a site admin account is still what's required,
// checked fresh against the database on every request, same as everywhere
// else. Every write here also lands in bot_audit_log (actor_type: 'site_admin').
const express = require('express');
const { Routes, GuildVerificationLevel } = require('discord.js');
const { body, param, query, validationResult } = require('express-validator');

const { requireAdmin } = require('../middleware/auth');
const { verifyCsrfToken } = require('../middleware/csrf');
const { securityActionLimiter } = require('../middleware/rateLimit');

const config = require('../../discord-bot/config');
const guildConfig = require('../../discord-bot/models/guildConfig');
const modActionsModel = require('../../discord-bot/models/modActions');
const ticketsModel = require('../../discord-bot/models/tickets');
const discordRest = require('../../discord-bot/discordRest');
const automod = require('../../discord-bot/automod');
const raidProtection = require('../../discord-bot/raidProtection');
const productAnnounce = require('../../discord-bot/productAnnounce');
const { TICKET_CATEGORIES } = require('../../discord-bot/ticketCategories');
const { logBotAction, recentBotActions, countBotActionsSince } = require('../../discord-bot/botAuditLog');

const promoCodesModel = require('../models/promoCodes');
const ordersModel = require('../models/orders');
const catalogModel = require('../models/catalog');

const router = express.Router();
router.use(requireAdmin);

function actorLabel(req) {
  return `${req.currentUser.username} (dashboard)`;
}

function guildId() {
  return config.GUILD_ID;
}

// --- Status / health -------------------------------------------------------

router.get('/status', async (req, res) => {
  const gid = guildId();
  const heartbeat = gid ? guildConfig.get(gid, 'botStatus') : null;
  const heartbeatAgeMs = heartbeat ? Date.now() - new Date(heartbeat.updatedAt).getTime() : null;

  res.json({
    configured: {
      token: Boolean(config.TOKEN),
      clientId: Boolean(config.CLIENT_ID),
      guildId: Boolean(config.GUILD_ID),
      oauthLinking: Boolean(config.OAUTH_CLIENT_SECRET && config.OAUTH_REDIRECT_URI),
      assistant: Boolean(config.ANTHROPIC_API_KEY),
      productAnnounceChannel: Boolean(config.PRODUCT_ANNOUNCE_CHANNEL_ID),
      catalogueChannel: Boolean(config.CATALOGUE_CHANNEL_ID)
    },
    // The gateway process (discord-bot/index.js) heartbeats every 30s — if
    // it's been much longer than that, the bot process is down or stalled,
    // even though this HTTP dashboard itself is up. Never claim "online"
    // from a stale heartbeat.
    gateway: heartbeat
      ? { ...heartbeat, stale: heartbeatAgeMs > 90_000, heartbeatAgeMs }
      : { online: false, reason: 'No heartbeat recorded yet — start the bot with `npm run bot`.' },
    raid: gid ? raidProtection.status(gid) : null
  });
});

router.get('/server-info', async (req, res) => {
  const info = await discordRest.fetchGuildInfo();
  res.json({ guild: info });
});

// --- Moderation --------------------------------------------------------

router.get('/mod-actions', [query('limit').optional().isInt({ min: 1, max: 200 }).toInt()], (req, res) => {
  res.json({ actions: modActionsModel.recent(guildId(), req.query.limit || 50) });
});

const MOD_ACTION_TYPES = ['kick', 'ban', 'unban', 'timeout'];

router.post(
  '/mod-actions',
  verifyCsrfToken,
  securityActionLimiter,
  [
    body('discordId').isString().trim().isLength({ min: 5, max: 32 }),
    body('actionType').isIn(MOD_ACTION_TYPES),
    body('reason').optional({ nullable: true }).isString().isLength({ max: 500 }),
    body('durationMs').optional({ nullable: true }).isInt({ min: 60000, max: 28 * 24 * 60 * 60 * 1000 }).toInt()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request.' });
    if (!discordRest.client() || !guildId()) return res.status(503).json({ error: 'Discord bot is not configured.' });

    const { discordId, actionType, reason, durationMs } = req.body;
    const client = discordRest.client();

    try {
      if (actionType === 'ban') {
        await client.put(Routes.guildBan(guildId(), discordId), { body: { reason: reason || undefined } });
      } else if (actionType === 'unban') {
        await client.delete(Routes.guildBan(guildId(), discordId));
      } else if (actionType === 'kick') {
        await client.delete(Routes.guildMember(guildId(), discordId), { reason: reason || undefined });
      } else if (actionType === 'timeout') {
        const until = new Date(Date.now() + (durationMs || 10 * 60 * 1000)).toISOString();
        await client.patch(Routes.guildMember(guildId(), discordId), { body: { communication_disabled_until: until }, reason: reason || undefined });
      }
    } catch (err) {
      return res.status(502).json({ error: `Discord rejected that action: ${err.message}` });
    }

    modActionsModel.record({
      guildId: guildId(),
      targetDiscordId: discordId,
      targetTag: discordId,
      moderatorDiscordId: 'dashboard',
      moderatorTag: actorLabel(req),
      actionType,
      reason: reason || null,
      durationMs: actionType === 'timeout' ? durationMs || 600000 : null
    });
    logBotAction({ guildId: guildId(), actorType: 'site_admin', actorId: String(req.currentUser.id), actorLabel: actorLabel(req), action: `mod.${actionType}`, target: discordId, details: { reason } });

    res.json({ ok: true });
  }
);

// --- Automod -------------------------------------------------------------

router.get('/automod/config', (req, res) => {
  res.json({ config: automod.getAutomodConfig(guildId()) });
});

router.put(
  '/automod/config',
  verifyCsrfToken,
  [
    body('enabled').optional().isBoolean(),
    body('maxMentions').optional().isInt({ min: 1, max: 50 }).toInt(),
    body('spamMessageCount').optional().isInt({ min: 1, max: 50 }).toInt(),
    body('spamWindowMs').optional().isInt({ min: 1000, max: 120000 }).toInt(),
    body('blockInviteLinks').optional().isBoolean(),
    body('blockAllLinks').optional().isBoolean(),
    body('bannedWords').optional().isArray({ max: 200 }),
    body('exemptRoleIds').optional().isArray({ max: 50 }),
    body('exemptChannelIds').optional().isArray({ max: 50 })
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid automod config.' });

    const updated = automod.setAutomodConfig(guildId(), req.body);
    logBotAction({ guildId: guildId(), actorType: 'site_admin', actorId: String(req.currentUser.id), actorLabel: actorLabel(req), action: 'automod.config.update' });
    res.json({ config: updated });
  }
);

router.get('/automod/infractions', [query('limit').optional().isInt({ min: 1, max: 500 }).toInt()], (req, res) => {
  const db = require('../db');
  const rows = db
    .prepare('SELECT * FROM automod_infractions WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(guildId(), req.query.limit || 100);
  res.json({ infractions: rows });
});

// --- Tickets ---------------------------------------------------------------

router.get(
  '/tickets',
  [query('status').optional().isIn(['open', 'claimed', 'closed']), query('category').optional().isString()],
  (req, res) => {
    const tickets = ticketsModel.listForDashboard(guildId(), { status: req.query.status, category: req.query.category });
    res.json({ tickets, categories: TICKET_CATEGORIES });
  }
);

router.get('/tickets/stats', (req, res) => {
  res.json({ stats: ticketsModel.stats(guildId()) });
});

router.post('/tickets/:threadId/note', verifyCsrfToken, [param('threadId').isString(), body('text').isString().isLength({ min: 1, max: 1000 })], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request.' });

  const ticket = ticketsModel.addNote(req.params.threadId, { authorTag: actorLabel(req), text: req.body.text });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  logBotAction({ guildId: guildId(), actorType: 'site_admin', actorId: String(req.currentUser.id), actorLabel: actorLabel(req), action: 'ticket.note', target: req.params.threadId });
  res.json({ ticket });
});

router.post('/tickets/:threadId/close', verifyCsrfToken, [param('threadId').isString()], async (req, res) => {
  const ticket = ticketsModel.close(req.params.threadId, {});
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

  if (discordRest.client()) {
    await discordRest.client().patch(Routes.channel(req.params.threadId), { body: { locked: true, archived: true } }).catch(() => {});
  }
  logBotAction({ guildId: guildId(), actorType: 'site_admin', actorId: String(req.currentUser.id), actorLabel: actorLabel(req), action: 'ticket.close', target: req.params.threadId });
  res.json({ ticket });
});

router.post('/tickets/:threadId/reopen', verifyCsrfToken, [param('threadId').isString()], async (req, res) => {
  const ticket = ticketsModel.reopen(req.params.threadId);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

  if (discordRest.client()) {
    await discordRest.client().patch(Routes.channel(req.params.threadId), { body: { locked: false, archived: false } }).catch(() => {});
  }
  logBotAction({ guildId: guildId(), actorType: 'site_admin', actorId: String(req.currentUser.id), actorLabel: actorLabel(req), action: 'ticket.reopen', target: req.params.threadId });
  res.json({ ticket });
});

// --- Server management -------------------------------------------------

router.get('/roles', async (req, res) => {
  if (!discordRest.client() || !guildId()) return res.json({ roles: [] });
  try {
    const roles = await discordRest.client().get(Routes.guildRoles(guildId()));
    res.json({ roles });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get('/channels', async (req, res) => {
  if (!discordRest.client() || !guildId()) return res.json({ channels: [] });
  try {
    const channels = await discordRest.client().get(Routes.guildChannels(guildId()));
    res.json({ channels });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- Config (channel/role IDs, raid protection thresholds) ---------------

const CONFIG_KEYS = [
  'staffRoleId', 'verifiedRoleId', 'modLogChannelId', 'ticketArchiveChannelId',
  'supportChannelId', 'raidProtectionEnabled', 'raidWindowMs', 'raidThreshold'
];

router.get('/config', (req, res) => {
  const values = Object.fromEntries(CONFIG_KEYS.map((key) => [key, guildConfig.get(guildId(), key)]));
  res.json({ config: values, productAnnounceChannelId: config.PRODUCT_ANNOUNCE_CHANNEL_ID, catalogueChannelId: config.CATALOGUE_CHANNEL_ID });
});

router.put('/config', verifyCsrfToken, (req, res) => {
  const updates = {};
  for (const key of CONFIG_KEYS) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      guildConfig.set(guildId(), key, req.body[key]);
      updates[key] = req.body[key];
    }
  }
  logBotAction({ guildId: guildId(), actorType: 'site_admin', actorId: String(req.currentUser.id), actorLabel: actorLabel(req), action: 'config.update', details: updates });
  res.json({ ok: true, updated: updates });
});

// --- Store integration ------------------------------------------------

const db = require('../db');

router.get('/store', (req, res) => {
  const discordVerifyCodes = promoCodesModel.listAll().filter((c) => c.source === 'discord_verify');
  res.json({
    linkedAccounts: db.prepare('SELECT COUNT(*) AS count FROM discord_links').get().count,
    verifiedAccounts: db.prepare('SELECT COUNT(*) AS count FROM discord_links WHERE member_verified_at IS NOT NULL').get().count,
    discountCodesIssued: discordVerifyCodes.length,
    discountCodesRedeemed: discordVerifyCodes.filter((c) => c.uses_count > 0).length,
    bestSellers: ordersModel.topPacks(5),
    catalogueSize: catalogModel.listAll({ includeHidden: false }).length
  });
});

router.post('/store/sync-catalogue', verifyCsrfToken, securityActionLimiter, async (req, res) => {
  const result = await productAnnounce.syncCatalogueChannel();
  logBotAction({ guildId: guildId(), actorType: 'site_admin', actorId: String(req.currentUser.id), actorLabel: actorLabel(req), action: 'store.sync_catalogue' });
  res.json(result);
});

router.post('/store/sync-best-sellers', verifyCsrfToken, securityActionLimiter, async (req, res) => {
  guildConfig.set(guildId(), 'bestSellersLastSyncAt', 0); // manual trigger bypasses the 1h cooldown
  const result = await productAnnounce.syncBestSellers();
  logBotAction({ guildId: guildId(), actorType: 'site_admin', actorId: String(req.currentUser.id), actorLabel: actorLabel(req), action: 'store.sync_best_sellers' });
  res.json(result);
});

// --- Analytics ------------------------------------------------------------

router.get('/analytics', (req, res) => {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  res.json({
    botActions24h: countBotActionsSince(since24h),
    botActions7d: countBotActionsSince(since7d),
    ticketStats: ticketsModel.stats(guildId()),
    modActionsRecent: modActionsModel.recent(guildId(), 200).reduce((acc, a) => {
      acc[a.action_type] = (acc[a.action_type] || 0) + 1;
      return acc;
    }, {}),
    bestSellers: ordersModel.topPacks(5)
  });
});

// --- Audit log --------------------------------------------------------

router.get('/audit-log', [query('limit').optional().isInt({ min: 1, max: 500 }).toInt()], (req, res) => {
  res.json({ entries: recentBotActions({ guildId: guildId(), limit: req.query.limit || 150 }) });
});

module.exports = router;
