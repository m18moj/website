const { SlashCommandBuilder } = require('discord.js');
const assistant = require('../assistant');
const rateLimiter = require('../rateLimiter');
const conversationStore = require('../conversationStore');
const discordLinksModel = require('../models/discordLinks');
const usersModel = require('../../server/models/users');

const data = new SlashCommandBuilder()
  .setName('ask')
  .setDescription('Ask the ScripForge assistant a question about scripts, orders, or how things work.')
  .addStringOption((opt) => opt.setName('question').setDescription('Your question').setRequired(true))
  .setDMPermission(true);

async function execute(interaction) {
  const question = interaction.options.getString('question', true);

  const limit = rateLimiter.checkAndRecord(interaction.user.id);
  if (!limit.allowed) return interaction.reply({ content: limit.reason, ephemeral: true });

  await interaction.deferReply({ ephemeral: true });

  const link = discordLinksModel.findByDiscordId(interaction.user.id);
  const userContext = link ? (() => {
    const user = usersModel.findById(link.user_id);
    return user ? { userId: user.id, username: user.username } : null;
  })() : null;

  const key = `ask:${interaction.user.id}`;
  const history = conversationStore.append(key, 'user', question);
  const result = await assistant.getReply({ history, userContext });

  if (result.error) return interaction.editReply(result.error);
  conversationStore.append(key, 'assistant', result.reply);
  await interaction.editReply(result.reply.slice(0, 1900));
}

module.exports = { data, execute };
