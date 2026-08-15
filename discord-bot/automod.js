// Full automod pipeline: spam, invite/generic links, a per-guild word filter,
// excessive mentions, plus escalating punishments and exemptions. Config is
// per-guild (guildConfig, editable from the bot dashboard) with the same
// sensible defaults config.js always had, so a guild that's never touched
// the dashboard behaves exactly as before.
const config = require('./config');
const guildConfig = require('./models/guildConfig');
const db = require('./db');
const { logBotAction } = require('./botAuditLog');

const INVITE_REGEX = /(discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+/i;
const URL_REGEX = /https?:\/\/[^\s]+/i;

// Per-user rolling message timestamps for spam detection, in-memory (a
// restart clearing this is harmless — nothing here needs to survive it).
const recentMessages = new Map();

const insertInfraction = db.prepare(`
  INSERT INTO automod_infractions (guild_id, discord_id, discord_tag, rule, action_taken, message_excerpt)
  VALUES (@guildId, @discordId, @discordTag, @rule, @actionTaken, @messageExcerpt)
`);
const countRecentInfractions = db.prepare(`
  SELECT COUNT(*) AS count FROM automod_infractions
  WHERE guild_id = ? AND discord_id = ? AND created_at >= datetime('now', ?)
`);

function getAutomodConfig(guildId) {
  const stored = guildConfig.get(guildId, 'automodConfig');
  return {
    enabled: config.AUTOMOD.ENABLED,
    maxMentions: config.AUTOMOD.MAX_MENTIONS,
    spamMessageCount: config.AUTOMOD.SPAM_MESSAGE_COUNT,
    spamWindowMs: config.AUTOMOD.SPAM_WINDOW_MS,
    blockInviteLinks: config.AUTOMOD.BLOCK_INVITE_LINKS,
    blockAllLinks: false,
    bannedWords: [],
    exemptRoleIds: [],
    exemptChannelIds: [],
    escalation: [
      { atInfractions: 1, action: 'delete' },
      { atInfractions: 3, action: 'timeout', durationMs: 10 * 60 * 1000 },
      { atInfractions: 5, action: 'timeout', durationMs: 60 * 60 * 1000 },
      { atInfractions: 8, action: 'kick' }
    ],
    escalationWindow: '-24 hours',
    ...(stored || {})
  };
}

function setAutomodConfig(guildId, partial) {
  const current = getAutomodConfig(guildId);
  const next = { ...current, ...partial };
  guildConfig.set(guildId, 'automodConfig', next);
  return next;
}

function isSpam(authorId, cfg) {
  const now = Date.now();
  const timestamps = (recentMessages.get(authorId) || []).filter((t) => now - t < cfg.spamWindowMs);
  timestamps.push(now);
  recentMessages.set(authorId, timestamps);
  return timestamps.length > cfg.spamMessageCount;
}

function hasMassMentions(message, cfg) {
  return message.mentions.users.size + message.mentions.roles.size > cfg.maxMentions;
}

function hasInviteLink(message, cfg) {
  return cfg.blockInviteLinks && INVITE_REGEX.test(message.content);
}

function hasBlockedLink(message, cfg) {
  if (cfg.blockAllLinks && URL_REGEX.test(message.content)) return true;
  return false;
}

function matchesWordFilter(message, cfg) {
  if (!cfg.bannedWords || cfg.bannedWords.length === 0) return null;
  const normalized = message.content.toLowerCase();
  return cfg.bannedWords.find((word) => word && normalized.includes(String(word).toLowerCase())) || null;
}

function isExempt(message, cfg) {
  if (message.member && message.member.permissions.has('ManageMessages')) return true;
  if (cfg.exemptChannelIds.includes(message.channel.id)) return true;
  if (message.member && cfg.exemptRoleIds.some((roleId) => message.member.roles.cache.has(roleId))) return true;
  return false;
}

// Returns null if the message is fine, or { rule, reason } if it should be
// actioned. Pure detection only — no side effects — so it stays easy to test
// and reuse from the dashboard's "preview" endpoint if ever needed.
function checkMessage(message) {
  const cfg = getAutomodConfig(message.guild.id);
  if (!cfg.enabled) return null;
  if (isExempt(message, cfg)) return null;

  if (hasInviteLink(message, cfg)) return { rule: 'invite_link', reason: 'posting an invite link' };
  if (hasBlockedLink(message, cfg)) return { rule: 'link', reason: 'posting a link' };
  const bannedWord = matchesWordFilter(message, cfg);
  if (bannedWord) return { rule: 'word_filter', reason: 'using a filtered word/phrase' };
  if (hasMassMentions(message, cfg)) return { rule: 'mass_mentions', reason: 'mass-mentioning users/roles' };
  if (isSpam(message.author.id, cfg)) return { rule: 'spam', reason: 'sending messages too quickly' };
  return null;
}

function recordInfraction(message, rule, actionTaken) {
  insertInfraction.run({
    guildId: message.guild.id,
    discordId: message.author.id,
    discordTag: message.author.tag,
    rule,
    actionTaken,
    messageExcerpt: (message.content || '').slice(0, 200)
  });
  logBotAction({
    guildId: message.guild.id,
    actorType: 'system',
    actorLabel: 'automod',
    action: `automod.${rule}`,
    target: message.author.tag,
    details: { actionTaken, channel: message.channel.id }
  });
}

// Escalating punishment: counts this user's infractions in the configured
// rolling window (including the one just recorded) and applies the
// highest-tier action they've now crossed. Returns the action actually
// applied, for the caller (events/messageCreate.js) to notify/log with.
function determineEscalation(guildId, discordId, cfg) {
  const count = countRecentInfractions.get(guildId, discordId, cfg.escalationWindow).count;
  const applicable = cfg.escalation.filter((tier) => count >= tier.atInfractions);
  return applicable.length ? applicable[applicable.length - 1] : { action: 'delete' };
}

module.exports = { checkMessage, recordInfraction, determineEscalation, getAutomodConfig, setAutomodConfig };
