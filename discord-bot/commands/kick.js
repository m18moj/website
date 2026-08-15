const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { logAction } = require('../moderationLog');

const data = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Kick a member from the server.')
  .addUserOption((opt) => opt.setName('user').setDescription('The member to kick').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Why they\'re being kicked').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .setDMPermission(false);

async function execute(interaction) {
  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true);

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!member) return interaction.reply({ content: 'That user is not in this server.', ephemeral: true });
  if (!member.kickable) return interaction.reply({ content: "I can't kick that member (role hierarchy or missing permission).", ephemeral: true });

  await target.send(`You've been kicked from **${interaction.guild.name}**: ${reason}`).catch(() => {});
  await member.kick(reason);
  await logAction(interaction.guild, interaction.user, target, 'kick', reason);

  await interaction.reply({ content: `Kicked ${target.tag}.`, ephemeral: true });
}

module.exports = { data, execute };
