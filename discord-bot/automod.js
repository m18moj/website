const config = require('./config');

const INVITE_REGEX = /(discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+/i;

// Per-user rolling message timestamps for spam detection, in-memory (same
// reasoning as rateLimiter.js — a restart clearing this is harmless).
const recentMessages = new Map();

function isSpam(authorId) {
  const now = Date.now();
  const timestamps = (recentMessages.get(authorId) || []).filter((t) => now - t < config.AUTOMOD.SPAM_WINDOW_MS);
  timestamps.push(now);
  recentMessages.set(authorId, timestamps);
  return timestamps.length > config.AUTOMOD.SPAM_MESSAGE_COUNT;
}

function hasMassMentions(message) {
  return message.mentions.users.size + message.mentions.roles.size > config.AUTOMOD.MAX_MENTIONS;
}

function hasInviteLink(message) {
  return config.AUTOMOD.BLOCK_INVITE_LINKS && INVITE_REGEX.test(message.content);
}

// Returns null if the message is fine, or a short reason string if it should
// be deleted. Staff/admins are exempt — automod is for the general member
// base, not for moderators posting invite links to a partner server, etc.
function checkMessage(message) {
  if (!config.AUTOMOD.ENABLED) return null;
  if (message.member && message.member.permissions.has('ManageMessages')) return null;

  if (hasInviteLink(message)) return 'posting an invite link';
  if (hasMassMentions(message)) return 'mass-mentioning users/roles';
  if (isSpam(message.author.id)) return 'sending messages too quickly';
  return null;
}

module.exports = { checkMessage };
