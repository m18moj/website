const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ticketsModel = require('../models/tickets');

const data = new SlashCommandBuilder()
  .setName('ticket-note')
  .setDescription('Leave an internal staff note on this ticket (not visible to the customer).')
  .addStringOption((opt) => opt.setName('text').setDescription('Note text').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads)
  .setDMPermission(false);

async function execute(interaction) {
  const ticket = ticketsModel.findByThreadId(interaction.channel.id);
  if (!ticket) return interaction.reply({ content: 'This command only works inside a ticket thread.', ephemeral: true });

  const text = interaction.options.getString('text', true);
  ticketsModel.addNote(interaction.channel.id, { authorTag: interaction.user.tag, text });

  await interaction.reply({ content: `📝 Note saved (visible to staff/dashboard only): "${text}"`, ephemeral: true });
}

module.exports = { data, execute };
