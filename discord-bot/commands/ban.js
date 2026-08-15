const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { logAction } = require('../moderationLog');

const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a member from the server.')
  .addUserOption((opt) => opt.setName('user').setDescription('The member to ban').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Why they\'re being banned').setRequired(true))
  .addIntegerOption((opt) => opt.setName('delete_days').setDescription('Delete their messages from the last N days (0-7)').setMinValue(0).setMaxValue(7))
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .setDMPermission(false);

async function execute(interaction) {
  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true);
  const deleteDays = interaction.options.getInteger('delete_days') || 0;

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (member && !member.bannable) {
    return interaction.reply({ content: "I can't ban that member (role hierarchy or missing permission).", ephemeral: true });
  }

  await target.send(`You've been banned from **${interaction.guild.name}**: ${reason}`).catch(() => {});
  await interaction.guild.members.ban(target.id, { deleteMessageSeconds: deleteDays * 86400, reason });
  await logAction(interaction.guild, interaction.user, target, 'ban', reason);

  await interaction.reply({ content: `Banned ${target.tag}.`, ephemeral: true });
}

module.exports = { data, execute };
