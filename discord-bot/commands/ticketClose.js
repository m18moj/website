const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const guildConfig = require('../models/guildConfig');
const ticketsModel = require('../models/tickets');
const { saveTranscript } = require('../transcript');

const data = new SlashCommandBuilder()
  .setName('ticket-close')
  .setDescription('Close and archive the support ticket in this thread (run inside the ticket).')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads)
  .setDMPermission(false);

async function execute(interaction) {
  const ticket = ticketsModel.findByThreadId(interaction.channel.id);
  if (!ticket) return interaction.reply({ content: 'This command only works inside a ticket thread.', ephemeral: true });
  if (ticket.status === 'closed') return interaction.reply({ content: 'This ticket is already closed.', ephemeral: true });

  await interaction.deferReply();

  const transcriptPath = await saveTranscript(interaction.channel).catch(() => null);
  ticketsModel.close(interaction.channel.id, { transcriptPath });

  const archiveChannelId = guildConfig.get(interaction.guild.id, 'ticketArchiveChannelId');
  if (archiveChannelId) {
    const archiveChannel = await interaction.guild.channels.fetch(archiveChannelId).catch(() => null);
    if (archiveChannel) {
      const embed = new EmbedBuilder()
        .setTitle(`Ticket closed — ${ticket.opener_tag}`)
        .setColor(0x2ecc71)
        .addFields(
          { name: 'Opened by', value: ticket.opener_tag, inline: true },
          { name: 'Claimed by', value: ticket.claimed_by_tag || '(unclaimed)', inline: true },
          { name: 'Closed by', value: interaction.user.tag, inline: true },
          { name: 'Order', value: ticket.order_id ? `#${ticket.order_id}` : '(none attached)' }
        )
        .setTimestamp();
      await archiveChannel.send({ embeds: [embed] }).catch(() => {});
    }
  }

  await interaction.editReply('Ticket closed. This thread will lock and archive shortly.');
  await interaction.channel.setLocked(true).catch(() => {});
  await interaction.channel.setArchived(true).catch(() => {});
}

module.exports = { data, execute };
