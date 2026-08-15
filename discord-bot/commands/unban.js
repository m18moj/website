const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { logAction } = require('../moderationLog');

const data = new SlashCommandBuilder()
  .setName('unban')
  .setDescription('Unban a user by their Discord user ID.')
  .addStringOption((opt) => opt.setName('user_id').setDescription('The Discord user ID to unban').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Why they\'re being unbanned'))
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .setDMPermission(false);

async function execute(interaction) {
  const userId = interaction.options.getString('user_id', true).trim();
  const reason = interaction.options.getString('reason') || null;

  const bans = await interaction.guild.bans.fetch();
  const ban = bans.get(userId);
  if (!ban) return interaction.reply({ content: 'That user ID is not currently banned.', ephemeral: true });

  await interaction.guild.members.unban(userId, reason || undefined);
  await logAction(interaction.guild, interaction.user, ban.user, 'unban', reason);

  await interaction.reply({ content: `Unbanned ${ban.user.tag}.`, ephemeral: true });
}

module.exports = { data, execute };
