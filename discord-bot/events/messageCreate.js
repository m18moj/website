const { Events, ChannelType } = require('discord.js');
const automod = require('../automod');
const { logAction } = require('../moderationLog');
const assistant = require('../assistant');
const rateLimiter = require('../rateLimiter');
const conversationStore = require('../conversationStore');
const discordLinksModel = require('../models/discordLinks');
const usersModel = require('../../server/models/users');

async function handleAutomod(message) {
  const hit = automod.checkMessage(message);
  if (!hit) return;

  await message.delete().catch(() => {});

  const cfg = automod.getAutomodConfig(message.guild.id);
  automod.recordInfraction(message, hit.rule, 'delete');
  const tier = automod.determineEscalation(message.guild.id, message.author.id, cfg);

  let punishmentNote = '';
  if (tier.action === 'timeout' && message.member) {
    await message.member.timeout(tier.durationMs, `Automod escalation: ${hit.reason}`).catch(() => {});
    punishmentNote = ` and timed out for ${Math.round(tier.durationMs / 60000)} minute(s)`;
    await logAction(message.guild, message.client.user, message.author, 'timeout', `Automod escalation: ${hit.reason}`, tier.durationMs).catch(() => {});
  } else if (tier.action === 'kick' && message.member && message.member.kickable) {
    await message.member.kick(`Automod escalation: ${hit.reason}`).catch(() => {});
    punishmentNote = ' and removed from the server';
    await logAction(message.guild, message.client.user, message.author, 'kick', `Automod escalation: ${hit.reason}`).catch(() => {});
  } else {
    await logAction(message.guild, message.client.user, message.author, 'warn', `Automod: ${hit.reason}`).catch(() => {});
  }

  await message.channel
    .send({ content: `${message.author}, that message was removed automatically (${hit.reason})${punishmentNote}.` })
    .then((notice) => setTimeout(() => notice.delete().catch(() => {}), 8000))
    .catch(() => {});
}

// DMs to the bot are treated as a chat with the shared assistant — the same
// "brain" as the website widget and /ask, just a different entry point.
async function handleDirectMessage(message) {
  const limit = rateLimiter.checkAndRecord(message.author.id);
  if (!limit.allowed) return message.reply(limit.reason).catch(() => {});

  const link = discordLinksModel.findByDiscordId(message.author.id);
  const userContext = link ? (() => {
    const user = usersModel.findById(link.user_id);
    return user ? { userId: user.id, username: user.username } : null;
  })() : null;

  const key = `dm:${message.author.id}`;
  const history = conversationStore.append(key, 'user', message.content);

  await message.channel.sendTyping().catch(() => {});
  const result = await assistant.getReply({ history, userContext });

  if (result.error) return message.reply(result.error).catch(() => {});
  conversationStore.append(key, 'assistant', result.reply);
  await message.reply(result.reply.slice(0, 1900)).catch(() => {});
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;

    if (message.channel.type === ChannelType.DM) {
      return handleDirectMessage(message);
    }

    if (message.guild) {
      await handleAutomod(message);
    }
  }
};
