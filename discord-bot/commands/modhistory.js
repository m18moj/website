const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const modActionsModel = require('../models/modActions');

const data = new SlashCommandBuilder()
  .setName('modhistory')
  .setDescription("View a member's moderation history in this server.")
  .addUserOption((opt) => opt.setName('user').setDescription('The member to look up').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setDMPermission(false);

async function execute(interaction) {
  const target = interaction.options.getUser('user', true);
  const actions = modActionsModel.forTarget(interaction.guild.id, target.id, 25);

  if (actions.length === 0) {
    return interaction.reply({ content: `${target.tag} has no moderation history in this server.`, ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle(`Moderation history — ${target.tag}`)
    .setColor(0x5865f2)
    .setDescription(
      actions
        .map((a) => `**${a.action_type.toUpperCase()}** — ${a.created_at} by ${a.moderator_tag}${a.reason ? `\n> ${a.reason}` : ''}`)
        .join('\n\n')
        .slice(0, 4000)
    );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { data, execute };
