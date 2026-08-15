const { Events } = require('discord.js');
const { buildOnboardingMessage } = require('../onboarding');
const guildConfig = require('../models/guildConfig');
const discordLinksModel = require('../models/discordLinks');
const promoCodesModel = require('../../server/models/promoCodes');
const usersModel = require('../../server/models/users');
const raidProtection = require('../raidProtection');
const { logBotAction } = require('../botAuditLog');

// If this Discord account already linked a ScripForge account before
// joining (via the website's OAuth flow while not yet a member), grant the
// Verified role and the one-time welcome discount the moment they actually
// join — this is the "when a user joins/verifies" trigger, the mirror image
// of the OAuth callback granting it the moment a member links.
async function grantVerifiedOnJoin(member) {
  const link = discordLinksModel.findByDiscordId(member.id);
  if (!link) return;

  const verifiedRoleId = guildConfig.get(member.guild.id, 'verifiedRoleId');
  if (verifiedRoleId) {
    await member.roles.add(verifiedRoleId).catch(() => {});
    discordLinksModel.setMemberVerified(member.id);
  }

  const user = usersModel.findById(link.user_id);
  if (!user) return;
  const promo = promoCodesModel.issueDiscordVerifyDiscount(user.id, user.username);
  discordLinksModel.setDiscountCode(member.id, promo.code);

  await member
    .send(`🎁 Welcome discount unlocked: **${promo.code}** — 15% off, valid for 7 days, one-time use.`)
    .catch(() => {});
}

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    await raidProtection.recordJoin(member).catch((err) => console.error('[raid-protection]', err));

    const payload = buildOnboardingMessage(member.guild);

    const dmSent = await member.send(payload).then(() => true).catch(() => false);

    if (!dmSent) {
      // DMs closed — fall back to posting in the general channel, tagged so
      // it's still clearly theirs to interact with.
      const generalChannel = member.guild.channels.cache.find((c) => c.name === 'general' && c.isTextBased && c.isTextBased());
      if (generalChannel) {
        await generalChannel.send({ content: `${member}`, ...payload }).catch(() => {});
      }
    }

    await grantVerifiedOnJoin(member).catch((err) => console.error('[verify-on-join]', err));

    logBotAction({
      guildId: member.guild.id,
      actorType: 'system',
      actorLabel: 'guildMemberAdd',
      action: 'member.join',
      target: member.user.tag
    });
  }
};
