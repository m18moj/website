const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { logAction } = require('../moderationLog');

const MAX_TIMEOUT_MINUTES = 40320; // Discord's own cap: 28 days.

const data = new SlashCommandBuilder()
  .setName('timeout')
  .setDescription('Time out a member (they can\'t send messages/speak until it expires).')
  .addUserOption((opt) => opt.setName('user').setDescription('The member to time out').setRequired(true))
  .addIntegerOption((opt) => opt.setName('minutes').setDescription('Duration in minutes (max 40320 = 28 days)').setRequired(true).setMinValue(1).setMaxValue(MAX_TIMEOUT_MINUTES))
  .addStringOption((opt) => opt.setName('reason').setDescription('Why they\'re being timed out').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setDMPermission(false);

async function execute(interaction) {
  const target = interaction.options.getUser('user', true);
  const minutes = interaction.options.getInteger('minutes', true);
  const reason = interaction.options.getString('reason', true);
  const durationMs = minutes * 60 * 1000;

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!member) return interaction.reply({ content: 'That user is not in this server.', ephemeral: true });
  if (!member.moderatable) return interaction.reply({ content: "I can't time out that member (role hierarchy or missing permission).", ephemeral: true });

  await member.timeout(durationMs, reason);
  await logAction(interaction.guild, interaction.user, target, 'timeout', reason, durationMs);

  await interaction.reply({ content: `Timed out ${target.tag} for ${minutes} minute(s).`, ephemeral: true });
}

module.exports = { data, execute };
