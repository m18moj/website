const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ticketsModel = require('../models/tickets');
const { logBotAction } = require('../botAuditLog');

const data = new SlashCommandBuilder()
  .setName('ticket-reopen')
  .setDescription('Reopen a closed support ticket (run inside the archived ticket thread).')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads)
  .setDMPermission(false);

async function execute(interaction) {
  const ticket = ticketsModel.findByThreadId(interaction.channel.id);
  if (!ticket) return interaction.reply({ content: 'This command only works inside a ticket thread.', ephemeral: true });
  if (ticket.status !== 'closed') return interaction.reply({ content: 'This ticket is not closed.', ephemeral: true });

  ticketsModel.reopen(interaction.channel.id);
  logBotAction({ guildId: interaction.guild.id, actorType: 'discord_user', actorId: interaction.user.id, actorLabel: interaction.user.tag, action: 'ticket.reopen', target: interaction.channel.id });

  await interaction.channel.setArchived(false).catch(() => {});
  await interaction.channel.setLocked(false).catch(() => {});
  await interaction.reply(`🔓 Ticket reopened by ${interaction.user}.`);
}

module.exports = { data, execute };
