// Thin wrapper around discord.js's REST client for actions that need to
// happen from a plain HTTP request context (the website's /api/discord
// routes, order fulfillment) where there is no live gateway connection to
// piggyback on — just the bot token. Deliberately separate from index.js's
// gateway Client so requiring this module never opens a socket.
const { REST, Routes } = require('discord.js');
const config = require('./config');
const guildConfig = require('./models/guildConfig');

let rest = null;
function client() {
  if (!config.TOKEN) return null;
  if (!rest) rest = new REST({ version: '10' }).setToken(config.TOKEN);
  return rest;
}

// Adds or removes the "Verified Customer" role for a Discord user in the
// configured home guild. Best-effort and silent on failure (bot not in the
// guild, member left, role deleted, missing permission, GUILD_ID/role not
// configured yet) — this is a nice-to-have sync, not something that should
// ever surface as an error to a customer linking/unlinking their account.
async function syncVerifiedRole(discordId, { add }) {
  const restClient = client();
  if (!restClient || !config.GUILD_ID) return { skipped: true };

  const roleId = guildConfig.get(config.GUILD_ID, 'verifiedRoleId');
  if (!roleId) return { skipped: true };

  try {
    if (add) {
      await restClient.put(Routes.guildMemberRole(config.GUILD_ID, discordId, roleId));
    } else {
      await restClient.delete(Routes.guildMemberRole(config.GUILD_ID, discordId, roleId));
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// The server-side source of truth for "is this Discord account actually in
// our server right now" — used by both the website OAuth callback and the
// /verify command so the Verified role (and the one-time discount code) can
// never be granted just because someone *claims* membership; it's confirmed
// against Discord's own API using the bot's token, which only works if the
// bot itself is in the guild and can see the member list. Returns a plain
// object rather than throwing so callers can treat "can't tell right now"
// (rate limited, Discord outage, bot not in guild) distinctly from "not a
// member" without a try/catch at every call site.
async function isGuildMember(discordId) {
  const restClient = client();
  if (!restClient || !config.GUILD_ID) return { known: false, member: false, reason: 'not_configured' };

  try {
    const member = await restClient.get(Routes.guildMember(config.GUILD_ID, discordId));
    return { known: true, member: true, data: member };
  } catch (err) {
    // Discord returns 404 for "not a member of this guild" — that's a
    // confident, known answer, not a failure. Anything else (rate limit,
    // 401/403, network error) means the check itself failed, not that the
    // user isn't a member, so it must not be treated as a denial.
    if (err.status === 404 || err.code === 10007) return { known: true, member: false };
    return { known: false, member: false, reason: err.message };
  }
}

async function fetchGuildInfo() {
  const restClient = client();
  if (!restClient || !config.GUILD_ID) return null;
  try {
    return await restClient.get(Routes.guild(config.GUILD_ID), { query: new URLSearchParams({ with_counts: 'true' }) });
  } catch (err) {
    return null;
  }
}

// Discord channel names: lowercase, ascii, spaces/most punctuation become
// hyphens, capped well under the 100-char limit. Used for the auto-opened
// service order channels below (see discord-bot/serviceOrderTicket.js) —
// deliberately plain rather than reusing catalog.js's slugify, since this
// also needs to strip characters slugify would leave in (accents, emoji).
function toChannelName(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 90) || 'ticket';
}

// Creates a new text channel in the given guild, nested under parentId if
// provided (a category channel id). Used for order-triggered tickets, which
// need a real channel of their own rather than a thread under an existing
// support channel — see ticketActions.js for the thread-based flow that
// powers the in-Discord "Get Support" button.
async function createChannel({ guildId, name, parentId, topic } = {}) {
  const restClient = client();
  if (!restClient || !guildId) return null;
  return restClient.post(Routes.guildChannels(guildId), {
    body: {
      name: toChannelName(name),
      type: 0, // GUILD_TEXT
      parent_id: parentId || undefined,
      topic: topic ? String(topic).slice(0, 1024) : undefined
    }
  });
}

async function sendMessage(channelId, payload) {
  const restClient = client();
  if (!restClient || !channelId) return null;
  const body = typeof payload === 'string' ? { content: payload } : payload;
  return restClient.post(Routes.channelMessages(channelId), { body });
}

module.exports = { syncVerifiedRole, isGuildMember, fetchGuildInfo, createChannel, sendMessage, toChannelName, client };
