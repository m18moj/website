const { Events, ChannelType } = require('discord.js');
const automod = require('../automod');
const { logAction } = require('../moderationLog');
const assistant = require('../assistant');
const rateLimiter = require('../rateLimiter');
const conversationStore = require('../conversationStore');
const discordLinksModel = require('../models/discordLinks');
const usersModel = require('../../server/models/users');

async function handleAutomod(message) {
  const reason = automod.checkMessage(message);
  if (!reason) return;

  await message.delete().catch(() => {});
  await message.channel
    .send({ content: `${message.author}, that message was removed automatically (${reason}).` })
    .then((notice) => setTimeout(() => notice.delete().catch(() => {}), 8000))
    .catch(() => {});

  await logAction(message.guild, message.client.user, message.author, 'warn', `Automod: ${reason}`).catch(() => {});
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
