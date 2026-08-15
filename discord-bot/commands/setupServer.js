const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const config = require('../config');
const guildConfig = require('../models/guildConfig');
const catalogModel = require('../../server/models/catalog');

const data = new SlashCommandBuilder()
  .setName('setup-server')
  .setDescription('Scaffold (or repair) the standard ScripForge server structure — channels, roles, categories.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false);

async function findOrCreateRole(guild, name, options = {}) {
  const existing = guild.roles.cache.find((r) => r.name === name);
  if (existing) return existing;
  return guild.roles.create({ name, mentionable: false, ...options });
}

async function findOrCreateCategory(guild, name) {
  const existing = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === name);
  if (existing) return existing;
  return guild.channels.create({ name, type: ChannelType.GuildCategory });
}

async function findOrCreateTextChannel(guild, name, parent, overwrites) {
  const existing = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === name && (!parent || c.parentId === parent.id));
  if (existing) return existing;
  return guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: parent ? parent.id : undefined,
    permissionOverwrites: overwrites
  });
}

function gameChannelName(gameTitle) {
  return gameTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 90);
}

async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;
  const everyone = guild.roles.everyone;

  const staffRole = await findOrCreateRole(guild, config.STAFF_ROLE_NAME, { color: 'Red', hoist: true, permissions: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageThreads] });
  const verifiedRole = await findOrCreateRole(guild, config.VERIFIED_ROLE_NAME, { color: 'Green' });

  const communityCategory = await findOrCreateCategory(guild, 'ScripForge');
  const staffCategory = await findOrCreateCategory(guild, 'Staff');
  const gamesCategory = await findOrCreateCategory(guild, 'Games');

  const announcements = await findOrCreateTextChannel(guild, 'announcements', communityCategory, [
    { id: everyone.id, deny: [PermissionFlagsBits.SendMessages] }
  ]);
  const general = await findOrCreateTextChannel(guild, 'general', communityCategory);
  const supportChannel = await findOrCreateTextChannel(guild, config.SUPPORT_CHANNEL_NAME, communityCategory);
  const customerOnly = await findOrCreateTextChannel(guild, 'customers', communityCategory, [
    { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: verifiedRole.id, allow: [PermissionFlagsBits.ViewChannel] }
  ]);

  const modLog = await findOrCreateTextChannel(guild, config.MOD_LOG_CHANNEL_NAME, staffCategory, [
    { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel] }
  ]);
  const ticketArchive = await findOrCreateTextChannel(guild, config.TICKET_ARCHIVE_CHANNEL_NAME, staffCategory, [
    { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel] }
  ]);
  const staffChat = await findOrCreateTextChannel(guild, 'staff-chat', staffCategory, [
    { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel] }
  ]);

  const packs = catalogModel.listAll({ includeHidden: false });
  const gameTitles = [...new Set(packs.map((p) => p.gameTitle))];
  const gameChannels = [];
  for (const title of gameTitles) {
    const channel = await findOrCreateTextChannel(guild, gameChannelName(title), gamesCategory);
    gameChannels.push(channel);
  }

  // Post (or refresh) the support button once, in #support, so opening a
  // ticket never requires remembering a slash command.
  const existingPinned = await supportChannel.messages.fetchPinned().catch(() => null);
  const alreadyPosted = existingPinned && existingPinned.some((m) => m.author.id === interaction.client.user.id && m.components.length > 0);
  if (!alreadyPosted) {
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('sf-open-ticket').setLabel('Get Support').setStyle(ButtonStyle.Primary).setEmoji('🎫')
    );
    const sent = await supportChannel.send({
      content: 'Need help with an order, license, or something else? Click below to open a private ticket with staff.',
      components: [row]
    });
    await sent.pin().catch(() => {});
  }

  guildConfig.set(guild.id, 'staffRoleId', staffRole.id);
  guildConfig.set(guild.id, 'verifiedRoleId', verifiedRole.id);
  guildConfig.set(guild.id, 'modLogChannelId', modLog.id);
  guildConfig.set(guild.id, 'ticketArchiveChannelId', ticketArchive.id);
  guildConfig.set(guild.id, 'supportChannelId', supportChannel.id);
  guildConfig.set(guild.id, 'ticketCategoryId', communityCategory.id);

  await interaction.editReply(
    `Server structure is set up.\n\n` +
      `**Roles:** ${staffRole} ${verifiedRole}\n` +
      `**Channels:** ${announcements}, ${general}, ${supportChannel}, ${customerOnly}, ${modLog}, ${ticketArchive}, ${staffChat}\n` +
      `**Game channels:** ${gameChannels.length ? gameChannels.map((c) => c.toString()).join(', ') : '(none — catalog has no packs yet)'}\n\n` +
      `Assign the ${staffRole} role to your moderators — moderation/ticket commands work for anyone with the "Moderate Members" / "Manage Threads" Discord permission, which ${staffRole} grants. Safe to re-run any time; existing roles/channels are reused, not duplicated.`
  );
}

module.exports = { data, execute };
