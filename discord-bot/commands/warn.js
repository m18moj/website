const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { logAction } = require('../moderationLog');

const data = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Warn a member. Logged to the mod log and their moderation history.')
  .addUserOption((opt) => opt.setName('user').setDescription('The member to warn').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Why they\'re being warned').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setDMPermission(false);

async function execute(interaction) {
  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true);

  if (target.id === interaction.user.id) {
    return interaction.reply({ content: "You can't warn yourself.", ephemeral: true });
  }

  await logAction(interaction.guild, interaction.user, target, 'warn', reason);

  await target.send(`You've been warned in **${interaction.guild.name}**: ${reason}`).catch(() => {});
  await interaction.reply({ content: `Warned ${target.tag}.`, ephemeral: true });
}

module.exports = { data, execute };
