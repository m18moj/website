const { EmbedBuilder } = require('discord.js');
const guildConfig = require('./models/guildConfig');
const modActionsModel = require('./models/modActions');

const COLORS = { warn: 0xf1c40f, timeout: 0xe67e22, kick: 0xe74c3c, ban: 0x992d22, unban: 0x2ecc71 };

async function logAction(guild, moderator, target, actionType, reason, durationMs = null) {
  modActionsModel.record({
    guildId: guild.id,
    targetDiscordId: target.id,
    targetTag: target.tag,
    moderatorDiscordId: moderator.id,
    moderatorTag: moderator.tag,
    actionType,
    reason: reason || null,
    durationMs
  });

  const modLogChannelId = guildConfig.get(guild.id, 'modLogChannelId');
  if (!modLogChannelId) return;
  const channel = await guild.channels.fetch(modLogChannelId).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS[actionType] || 0x95a5a6)
    .setTitle(`${actionType.toUpperCase()} — ${target.tag}`)
    .addFields(
      { name: 'User', value: `${target} (${target.id})`, inline: true },
      { name: 'Moderator', value: `${moderator}`, inline: true },
      { name: 'Reason', value: reason || '(none given)' }
    )
    .setTimestamp();
  if (durationMs) embed.addFields({ name: 'Duration', value: `${Math.round(durationMs / 60000)} minute(s)` });

  await channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = { logAction };
