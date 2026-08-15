const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ticketsModel = require('../models/tickets');

const data = new SlashCommandBuilder()
  .setName('ticket-claim')
  .setDescription('Claim the support ticket in this thread (run inside the ticket).')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads)
  .setDMPermission(false);

async function execute(interaction) {
  const ticket = ticketsModel.findByThreadId(interaction.channel.id);
  if (!ticket) return interaction.reply({ content: 'This command only works inside a ticket thread.', ephemeral: true });
  if (ticket.status === 'closed') return interaction.reply({ content: 'This ticket is already closed.', ephemeral: true });

  ticketsModel.claim(interaction.channel.id, { claimedByDiscordId: interaction.user.id, claimedByTag: interaction.user.tag });
  await interaction.reply(`🎫 Ticket claimed by ${interaction.user}.`);
}

module.exports = { data, execute };
