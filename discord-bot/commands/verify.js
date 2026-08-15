const { SlashCommandBuilder } = require('discord.js');
const config = require('../config');
const guildConfig = require('../models/guildConfig');
const discordLinks = require('../models/discordLinks');
const rateLimiter = require('../rateLimiter');
const usersModel = require('../../server/models/users');
const ordersModel = require('../../server/models/orders');

const data = new SlashCommandBuilder()
  .setName('verify')
  .setDescription('Link your Discord account to your ScripForge account to get the Verified Customer role.')
  .addStringOption((opt) => opt.setName('email').setDescription('The email on your ScripForge account').setRequired(true))
  .setDMPermission(true);

// Deliberately only ever confirms/denies a match for the email the requester
// themselves typed — never returns account details. The "no account" and
// "no completed purchase" cases share one generic failure message (rather
// than two distinct ones) so this can't be used as an oracle to enumerate
// which emails have a ScripForge account, mirroring the same generic-response
// pattern the website's own /forgot-password route uses for the same reason.
// Combined with the rate limit below, this closes off enumeration at any
// real scale.
async function execute(interaction) {
  const limit = rateLimiter.checkVerifyLimit(interaction.user.id);
  if (!limit.allowed) return interaction.reply({ content: limit.reason, ephemeral: true });

  await interaction.deferReply({ ephemeral: true });
  const email = interaction.options.getString('email', true).trim();

  const genericFailure =
    "Couldn't verify that — either no ScripForge account uses that email, or it doesn't have a completed purchase yet. " +
    'Double-check the email (Account -> Settings on the website), or use the "Connect Discord" button on the Account page instead — it links automatically, no typing required.';

  const user = usersModel.findByEmail(email);
  if (!user) {
    return interaction.editReply(genericFailure);
  }

  const hasPaidOrder = ordersModel.ordersForUser(user.id).some((o) => o.status === 'paid');
  if (!hasPaidOrder) {
    return interaction.editReply(genericFailure);
  }

  discordLinks.unlinkByUserId(user.id);
  discordLinks.link({ discordId: interaction.user.id, discordTag: interaction.user.tag, userId: user.id });

  if (!interaction.guild) {
    return interaction.editReply('Your account is linked. Run this again from inside the server to also get the Verified Customer role.');
  }

  const verifiedRoleId = guildConfig.get(interaction.guild.id, 'verifiedRoleId');
  if (!verifiedRoleId) {
    return interaction.editReply('Your account is linked, but the Verified Customer role hasn\'t been set up yet — ask staff to run /setup-server.');
  }

  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    await member.roles.add(verifiedRoleId);
    await interaction.editReply(`Verified! Linked to ScripForge account "${user.username}" and gave you the Verified Customer role.`);
  } catch (err) {
    await interaction.editReply('Your account is linked, but I couldn\'t assign the role (check my role is above Verified Customer in Server Settings -> Roles).');
  }
}

module.exports = { data, execute };
