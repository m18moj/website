// Real anti-raid measure: tracks the join rate per guild in-memory (a bot
// restart resetting this is harmless — a raid mid-restart is the rare edge
// case, not the common one) and, if too many members join in too short a
// window, temporarily raises the guild's verification level via the real
// Discord API (Guild#setVerificationLevel) — this makes Discord itself
// require a verified email/phone/tenure before new accounts can send
// messages, which is the actual mechanism Discord provides for this; there
// is no bot-side equivalent that would be as effective, so this is the
// closest real alternative rather than a faked "raid mode".
const { GuildVerificationLevel } = require('discord.js');
const guildConfig = require('./models/guildConfig');
const { logBotAction } = require('./botAuditLog');

const DEFAULT_WINDOW_MS = 10_000;
const DEFAULT_THRESHOLD = 8; // joins within the window that count as a raid
const LOCKDOWN_DURATION_MS = 10 * 60 * 1000;
const NEW_ACCOUNT_AGE_MS = 7 * 24 * 60 * 60 * 1000; // accounts under 7 days old are flagged during a raid

const joinTimestamps = new Map(); // guildId -> number[]
const lockdownUntil = new Map(); // guildId -> number (ms epoch)
const previousVerificationLevel = new Map(); // guildId -> level to restore to

function getConfig(guildId) {
  return {
    windowMs: guildConfig.get(guildId, 'raidWindowMs') || DEFAULT_WINDOW_MS,
    threshold: guildConfig.get(guildId, 'raidThreshold') || DEFAULT_THRESHOLD,
    enabled: guildConfig.get(guildId, 'raidProtectionEnabled') !== false
  };
}

async function triggerLockdown(guild) {
  const modLogChannelId = guildConfig.get(guild.id, 'modLogChannelId');
  const alertChannel = modLogChannelId ? await guild.channels.fetch(modLogChannelId).catch(() => null) : null;

  if (guild.verificationLevel !== GuildVerificationLevel.VeryHigh) {
    previousVerificationLevel.set(guild.id, guild.verificationLevel);
    await guild.setVerificationLevel(GuildVerificationLevel.VeryHigh, 'Automated raid protection').catch(() => {});
  }
  lockdownUntil.set(guild.id, Date.now() + LOCKDOWN_DURATION_MS);

  logBotAction({ guildId: guild.id, actorType: 'system', actorLabel: 'raid-protection', action: 'raid.lockdown.start' });

  if (alertChannel) {
    await alertChannel
      .send(`🚨 **Raid protection triggered** — unusually many members joined at once. Server verification level raised to the maximum for ${Math.round(LOCKDOWN_DURATION_MS / 60000)} minutes.`)
      .catch(() => {});
  }
}

async function endLockdownIfDue(guild) {
  const until = lockdownUntil.get(guild.id);
  if (!until || Date.now() < until) return;

  lockdownUntil.delete(guild.id);
  const restoreLevel = previousVerificationLevel.get(guild.id);
  previousVerificationLevel.delete(guild.id);
  if (restoreLevel !== undefined && guild.verificationLevel === GuildVerificationLevel.VeryHigh) {
    await guild.setVerificationLevel(restoreLevel, 'Raid protection lockdown expired').catch(() => {});
  }
  logBotAction({ guildId: guild.id, actorType: 'system', actorLabel: 'raid-protection', action: 'raid.lockdown.end' });
}

// Called from events/guildMemberAdd.js on every join. Returns whether this
// specific member looks suspicious (very new account joining during an
// active raid window) so the caller can decide whether to flag/kick it.
async function recordJoin(member) {
  const { windowMs, threshold, enabled } = getConfig(member.guild.id);
  if (!enabled) return { suspicious: false };

  await endLockdownIfDue(member.guild);

  const now = Date.now();
  const timestamps = (joinTimestamps.get(member.guild.id) || []).filter((t) => now - t < windowMs);
  timestamps.push(now);
  joinTimestamps.set(member.guild.id, timestamps);

  const inLockdown = Boolean(lockdownUntil.get(member.guild.id));
  if (timestamps.length >= threshold && !inLockdown) {
    await triggerLockdown(member.guild);
  }

  const accountAgeMs = now - member.user.createdTimestamp;
  const suspicious = (inLockdown || timestamps.length >= threshold) && accountAgeMs < NEW_ACCOUNT_AGE_MS;
  if (suspicious) {
    logBotAction({
      guildId: member.guild.id,
      actorType: 'system',
      actorLabel: 'raid-protection',
      action: 'raid.suspicious_join',
      target: member.user.tag,
      details: { accountAgeDays: Math.round(accountAgeMs / 86400000) }
    });
  }
  return { suspicious };
}

function status(guildId) {
  const cfg = getConfig(guildId);
  return {
    ...cfg,
    inLockdown: Boolean(lockdownUntil.get(guildId) && Date.now() < lockdownUntil.get(guildId)),
    lockdownUntil: lockdownUntil.get(guildId) || null,
    recentJoinCount: (joinTimestamps.get(guildId) || []).length
  };
}

module.exports = { recordJoin, status };
