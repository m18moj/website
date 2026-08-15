const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const catalogModel = require('../server/models/catalog');

// customIds carry the guild id (e.g. "sf-ack-rules:123456") since this is
// sent over DM where interaction.guild is null — the handler in
// events/interactionCreate.js needs to know which guild's roles to touch.
function buildOnboardingMessage(guild) {
  const packs = catalogModel.listAll({ includeHidden: false });
  const gameTitles = [...new Set(packs.map((p) => p.gameTitle))].slice(0, 25);

  const embed = new EmbedBuilder()
    .setTitle(`Welcome to ${guild.name}!`)
    .setColor(0x5865f2)
    .setDescription(
      `A few quick things:\n` +
        `1. Be respectful, no spam/self-promo, no invite links outside of #general — the usual.\n` +
        `2. Check #announcements for updates and #support if you need help with an order or license.\n` +
        `3. Pick which games you're interested in below to get pinged for relevant drops (optional).\n\n` +
        `Click "I agree to the rules" once you've read them.`
    );

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sf-ack-rules:${guild.id}`).setLabel('I agree to the rules').setStyle(ButtonStyle.Success).setEmoji('✅')
    )
  ];

  if (gameTitles.length > 0) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`sf-game-roles:${guild.id}`)
          .setPlaceholder('Which games are you interested in? (optional)')
          .setMinValues(0)
          .setMaxValues(gameTitles.length)
          .addOptions(gameTitles.map((title) => ({ label: title.slice(0, 100), value: title.slice(0, 100) })))
      )
    );
  }

  return { embeds: [embed], components: rows };
}

module.exports = { buildOnboardingMessage };
