const { Events } = require('discord.js');
const { buildOnboardingMessage } = require('../onboarding');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
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
  }
};
