// Posts new-product announcements and keeps a synced full-catalogue message
// up to date in Discord. Called from server/routes/admin.js (a plain HTTP
// request context, not the bot's gateway process) via discordRest's REST
// client and the bot's own token — works whether or not the gateway process
// (discord-bot/index.js) happens to be running. Every call is best-effort:
// a Discord outage, missing permission, or unconfigured bot must never break
// a catalog edit in the admin dashboard.
const { Routes } = require('discord.js');
const config = require('./config');
const discordRest = require('./discordRest');
const guildConfig = require('./models/guildConfig');
const catalogModel = require('../server/models/catalog');
const ordersModel = require('../server/models/orders');
const { logBotAction } = require('./botAuditLog');

function isConfigured() {
  return Boolean(discordRest.client() && config.PRODUCT_ANNOUNCE_CHANNEL_ID);
}

function siteOrigin() {
  return process.env.SITE_URL || 'https://scripforge.net';
}

function packEmbed(pack) {
  const prices = pack.scripts.filter((s) => !s.hidden).map((s) => s.price);
  const priceLine = prices.length
    ? prices.length === 1
      ? `$${prices[0].toFixed(2)}`
      : `$${Math.min(...prices).toFixed(2)} – $${Math.max(...prices).toFixed(2)}`
    : 'See store';

  return {
    title: `🆕 New: ${pack.packName}`,
    description: pack.description ? pack.description.slice(0, 300) : `${pack.scriptCount} script(s) now available for ${pack.gameTitle}.`,
    color: 0x5865f2,
    fields: [
      { name: 'Game', value: pack.gameTitle, inline: true },
      { name: 'Scripts', value: String(pack.scriptCount), inline: true },
      { name: 'Price', value: priceLine, inline: true }
    ],
    url: `${siteOrigin()}/pages/catalog?pack=${pack.packId}`,
    timestamp: new Date().toISOString(),
    footer: { text: 'ScripForge Store' }
  };
}

// Announces a newly launched (i.e. visible for the first time) pack in the
// product-announcement channel. Dedupe is enforced via packs.discord_announced_at
// (checked by the caller before this runs, and re-checked here) so a
// double-click, a webhook retry, or two admins editing at once can never
// produce two announcements for the same pack.
async function announceNewProduct(packId) {
  if (!isConfigured()) return { skipped: true, reason: 'not_configured' };

  const raw = catalogModel.getRawPack(packId);
  if (!raw || raw.discord_announced_at) return { skipped: true, reason: 'already_announced' };

  const pack = catalogModel.getPack(packId, { includeHidden: false });
  if (!pack) return { skipped: true, reason: 'not_found_or_hidden' };

  try {
    const message = await discordRest.client().post(Routes.channelMessages(config.PRODUCT_ANNOUNCE_CHANNEL_ID), {
      body: { embeds: [packEmbed(pack)] }
    });
    catalogModel.markPackAnnounced(packId, message.id);
    logBotAction({ guildId: config.GUILD_ID, actorType: 'system', actorLabel: 'product-announce', action: 'product.announce', target: packId });
    return { ok: true, messageId: message.id };
  } catch (err) {
    console.error('[product-announce] failed:', err.message);
    return { ok: false, error: err.message };
  }
}

// Keeps one pinned "Full Catalogue" message per guild up to date (edited in
// place via the message id stored in guildConfig) rather than reposting on
// every catalog change — reposting on every price/description edit would
// spam the channel and blow through rate limits on a busy catalog.
async function syncCatalogueChannel() {
  if (!discordRest.client() || !config.CATALOGUE_CHANNEL_ID) return { skipped: true };

  const packs = catalogModel.listAll({ includeHidden: false });
  const embed = {
    title: '📚 Full Product Catalogue',
    description: packs.length ? undefined : 'Nothing in the catalogue yet — check back soon!',
    color: 0x2ecc71,
    fields: packs.slice(0, 25).map((pack) => {
      const prices = pack.scripts.filter((s) => !s.hidden).map((s) => s.price);
      const priceLine = prices.length ? `$${Math.min(...prices).toFixed(2)} – $${Math.max(...prices).toFixed(2)}` : 'See store';
      return { name: pack.packName, value: `${pack.gameTitle} • ${pack.scriptCount} script(s) • ${priceLine}` };
    }),
    url: `${siteOrigin()}/pages/catalog`,
    timestamp: new Date().toISOString(),
    footer: { text: `${packs.length} product(s) — auto-synced from the store` }
  };

  const existingMessageId = guildConfig.get(config.GUILD_ID, 'catalogueMessageId');
  try {
    if (existingMessageId) {
      await discordRest.client().patch(Routes.channelMessage(config.CATALOGUE_CHANNEL_ID, existingMessageId), { body: { embeds: [embed] } });
      return { ok: true, messageId: existingMessageId, updated: true };
    }
    const message = await discordRest.client().post(Routes.channelMessages(config.CATALOGUE_CHANNEL_ID), { body: { embeds: [embed] } });
    guildConfig.set(config.GUILD_ID, 'catalogueMessageId', message.id);
    return { ok: true, messageId: message.id, updated: false };
  } catch (err) {
    // The stored message may have been deleted out from under us — clear it
    // so the next sync posts a fresh one instead of failing forever.
    if (err.status === 404 || err.code === 10008) guildConfig.set(config.GUILD_ID, 'catalogueMessageId', null);
    console.error('[catalogue-sync] failed:', err.message);
    return { ok: false, error: err.message };
  }
}

// Refreshes a "Best Sellers" pinned embed in the product-announcement
// channel. Rate-limited to once per hour (tracked in guildConfig) since this
// is meant to be triggered on every paid order — without a cooldown, a busy
// store would hammer the edit endpoint.
async function syncBestSellers() {
  if (!isConfigured()) return { skipped: true };

  const lastSync = guildConfig.get(config.GUILD_ID, 'bestSellersLastSyncAt');
  if (lastSync && Date.now() - lastSync < 60 * 60 * 1000) return { skipped: true, reason: 'cooldown' };

  const top = ordersModel.topPacks(5);
  const embed = {
    title: '🔥 Best Sellers',
    color: 0xf1c40f,
    description: top.length
      ? top.map((p, i) => `**${i + 1}.** ${p.packName} — ${p.itemsSold} sold`).join('\n')
      : 'No sales yet.',
    timestamp: new Date().toISOString(),
    footer: { text: 'Auto-synced from the store' }
  };

  const existingMessageId = guildConfig.get(config.GUILD_ID, 'bestSellersMessageId');
  try {
    if (existingMessageId) {
      await discordRest.client().patch(Routes.channelMessage(config.PRODUCT_ANNOUNCE_CHANNEL_ID, existingMessageId), { body: { embeds: [embed] } });
    } else {
      const message = await discordRest.client().post(Routes.channelMessages(config.PRODUCT_ANNOUNCE_CHANNEL_ID), { body: { embeds: [embed] } });
      guildConfig.set(config.GUILD_ID, 'bestSellersMessageId', message.id);
    }
    guildConfig.set(config.GUILD_ID, 'bestSellersLastSyncAt', Date.now());
    return { ok: true };
  } catch (err) {
    if (err.status === 404 || err.code === 10008) guildConfig.set(config.GUILD_ID, 'bestSellersMessageId', null);
    console.error('[best-sellers-sync] failed:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { announceNewProduct, syncCatalogueChannel, syncBestSellers, isConfigured };
