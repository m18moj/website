const { SlashCommandBuilder } = require('discord.js');
const config = require('../config');
const guildConfig = require('../models/guildConfig');
const discordLinks = require('../models/discordLinks');
const rateLimiter = require('../rateLimiter');
const discordRest = require('../discordRest');
const usersModel = require('../../server/models/users');
const ordersModel = require('../../server/models/orders');
const promoCodesModel = require('../../server/models/promoCodes');

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

  // Server-side membership check (bot's own REST token, not anything the
  // requester could spoof) — the Verified role and the one-time discount
  // code are only ever granted once this actually confirms membership, never
  // just because the command ran successfully. Works whether /verify was run
  // inside the guild (interaction.guild is set) or via DM.
  const guildId = interaction.guild ? interaction.guild.id : config.GUILD_ID;
  if (!guildId) {
    return interaction.editReply('Your account is linked. Run this again from inside the server to also get the Verified Customer role.');
  }

  const membership = await discordRest.isGuildMember(interaction.user.id);
  if (!membership.known) {
    return interaction.editReply('Your account is linked, but I couldn\'t confirm your server membership right now (Discord may be having issues) — try again shortly.');
  }
  if (!membership.member) {
    return interaction.editReply('Your account is linked, but you don\'t appear to be a member of the server, so the Verified Customer role wasn\'t granted. Join the server and run /verify again.');
  }

  const verifiedRoleId = guildConfig.get(guildId, 'verifiedRoleId');
  if (!verifiedRoleId) {
    return interaction.editReply('Your account is linked, but the Verified Customer role hasn\'t been set up yet — ask staff to run /setup-server.');
  }

  const roleResult = await discordRest.syncVerifiedRole(interaction.user.id, { add: true });
  if (!roleResult.ok) {
    return interaction.editReply('Your account is linked and your membership was confirmed, but I couldn\'t assign the role (check my role is above Verified Customer in Server Settings -> Roles).');
  }

  const promo = promoCodesModel.issueDiscordVerifyDiscount(user.id, user.username);
  await interaction.editReply(
    `Verified! Linked to ScripForge account "${user.username}" and gave you the Verified Customer role.\n\n` +
      `🎁 Here's a welcome discount: **${promo.code}** — 15% off, valid for 7 days, one-time use.`
  );
}

module.exports = { data, execute };
