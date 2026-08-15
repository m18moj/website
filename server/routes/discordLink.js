// Website-initiated Discord account linking via real Discord OAuth2 — the
// counterpart to the bot's /verify command, for customers who'd rather click
// a button than type their email into Discord. Deliberately minimal-scope:
// only ever requests the `identify` scope, and never stores the OAuth
// access/refresh token anywhere — it's used once, synchronously, to read the
// Discord user's id/tag, then discarded. Role sync afterward goes through
// the bot's own token (discordRest.js), not the user's OAuth token.
const crypto = require('crypto');
const express = require('express');

const { requireAuth } = require('../middleware/auth');
const { verifyCsrfToken } = require('../middleware/csrf');
const { discordLinkLimiter } = require('../middleware/rateLimit');
const ordersModel = require('../models/orders');
const auditLog = require('../models/auditLog');
const promoCodesModel = require('../models/promoCodes');
const config = require('../../discord-bot/config');
const discordLinks = require('../../discord-bot/models/discordLinks');
const discordRest = require('../../discord-bot/discordRest');

const router = express.Router();

const DISCORD_API = 'https://discord.com/api/v10';
const STATE_TTL_MS = 10 * 60 * 1000;

function isConfigured() {
  return Boolean(config.TOKEN && config.CLIENT_ID && config.OAUTH_CLIENT_SECRET && config.OAUTH_REDIRECT_URI);
}

function accountUrl(req, query) {
  const origin = `${req.protocol}://${req.get('host')}`;
  const qs = new URLSearchParams(query).toString();
  return `${origin}/pages/account${qs ? `?${qs}` : ''}`;
}

async function fetchWithTimeout(url, options, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

router.get('/status', requireAuth, (req, res) => {
  const link = discordLinks.findByUserId(req.session.userId);
  res.json({
    configured: isConfigured(),
    linked: Boolean(link),
    discordId: link ? link.discord_id : null,
    discordTag: link ? link.discord_tag : null,
    linkedAt: link ? link.linked_at : null
  });
});

router.get('/start', requireAuth, discordLinkLimiter, (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: 'Discord linking is not configured yet.' });
  }

  // Bound to this exact session + user so the callback can't be replayed
  // against a different signed-in account, and expires quickly since the
  // user is expected to complete the Discord consent screen within minutes.
  const state = crypto.randomBytes(32).toString('hex');
  req.session.discordOAuthState = { value: state, userId: req.session.userId, expiresAt: Date.now() + STATE_TTL_MS };

  const params = new URLSearchParams({
    client_id: config.CLIENT_ID,
    redirect_uri: config.OAUTH_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    state,
    prompt: 'consent'
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

router.get('/callback', requireAuth, discordLinkLimiter, async (req, res) => {
  const pending = req.session.discordOAuthState;
  req.session.discordOAuthState = null; // one-time use regardless of outcome

  if (!isConfigured()) return res.redirect(accountUrl(req, { discord: 'error', reason: 'not_configured' }));

  const { code, state, error: oauthError } = req.query;
  if (oauthError) return res.redirect(accountUrl(req, { discord: 'error', reason: 'denied' }));

  if (
    !pending ||
    !code ||
    typeof state !== 'string' ||
    state !== pending.value ||
    pending.userId !== req.session.userId ||
    Date.now() > pending.expiresAt
  ) {
    return res.redirect(accountUrl(req, { discord: 'error', reason: 'invalid_state' }));
  }

  try {
    const tokenRes = await fetchWithTimeout(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.CLIENT_ID,
        client_secret: config.OAUTH_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.OAUTH_REDIRECT_URI
      })
    });
    if (!tokenRes.ok) return res.redirect(accountUrl(req, { discord: 'error', reason: 'exchange_failed' }));
    const tokenData = await tokenRes.json();

    const identifyRes = await fetchWithTimeout(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    if (!identifyRes.ok) return res.redirect(accountUrl(req, { discord: 'error', reason: 'exchange_failed' }));
    const discordUser = await identifyRes.json();
    // access_token/refresh_token deliberately never persisted or logged —
    // nothing beyond this handler ever needs them again.

    const discordTag = discordUser.discriminator && discordUser.discriminator !== '0'
      ? `${discordUser.username}#${discordUser.discriminator}`
      : discordUser.username;

    const existing = discordLinks.findByDiscordId(discordUser.id);
    if (existing && existing.user_id !== req.session.userId) {
      return res.redirect(accountUrl(req, { discord: 'error', reason: 'already_linked' }));
    }

    discordLinks.unlinkByUserId(req.session.userId);
    discordLinks.link({ discordId: discordUser.id, discordTag, userId: req.session.userId });
    auditLog.record({
      actor: req.currentUser,
      action: 'discord.link',
      target: req.currentUser.username,
      details: { discordTag }
    });

    // The Verified role (and the one-time welcome discount) are only ever
    // granted after confirming, server-side via the bot's own token, that
    // this Discord account is actually a member of the configured guild —
    // never just because the OAuth identity check succeeded, and no longer
    // gated on having a paid order (linking and buying are independent).
    const membership = await discordRest.isGuildMember(discordUser.id);
    let redirectExtra = {};
    if (membership.known && membership.member) {
      const roleResult = await discordRest.syncVerifiedRole(discordUser.id, { add: true });
      if (roleResult.ok) {
        discordLinks.setMemberVerified(discordUser.id);
        const promo = promoCodesModel.issueDiscordVerifyDiscount(req.session.userId, req.currentUser.username);
        discordLinks.setDiscountCode(discordUser.id, promo.code);
        redirectExtra = { verified: '1', promo: promo.code };
      }
    }

    return res.redirect(accountUrl(req, { discord: 'linked', ...redirectExtra }));
  } catch (err) {
    console.error('[discord-link] callback error:', err.message);
    return res.redirect(accountUrl(req, { discord: 'error', reason: 'unknown' }));
  }
});

router.post('/unlink', requireAuth, verifyCsrfToken, discordLinkLimiter, async (req, res) => {
  const link = discordLinks.findByUserId(req.session.userId);
  if (!link) return res.json({ ok: true });

  await discordRest.syncVerifiedRole(link.discord_id, { add: false });
  discordLinks.unlink(link.discord_id);
  auditLog.record({
    actor: req.currentUser,
    action: 'discord.unlink',
    target: req.currentUser.username,
    details: { discordTag: link.discord_tag }
  });

  res.json({ ok: true });
});

module.exports = router;
