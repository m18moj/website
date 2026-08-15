const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const guildConfig = require('../models/guildConfig');

const data = new SlashCommandBuilder()
  .setName('setup-server')
  .setDescription('Wire the bot up to this server\'s existing channels/roles (creates nothing new).')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false);

async function findOrCreateRole(guild, name, options = {}) {
  const existing = guild.roles.cache.find((r) => r.name === name);
  if (existing) return existing;
  return guild.roles.create({ name, mentionable: false, ...options });
}

// This server already has a full channel structure (see
// discord-bot/server-tree.txt) — /setup-server must reuse those exact
// channels by ID, never create new ones. A channel is only "missing" here if
// it was deleted or the ID was misconfigured, in which case we report it
// instead of silently creating a duplicate.
async function fetchExisting(guild, id) {
  if (!id) return null;
  return guild.channels.fetch(id).catch(() => null);
}

async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;

  const staffRole = await findOrCreateRole(guild, config.STAFF_ROLE_NAME, { color: 'Red', hoist: true, permissions: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageThreads] });
  const verifiedRole = await findOrCreateRole(guild, config.VERIFIED_ROLE_NAME, { color: 'Green' });

  const [announcements, general, supportChannel, vipChannel, modLog, ticketLog, staffChat] = await Promise.all([
    fetchExisting(guild, config.ANNOUNCEMENTS_CHANNEL_ID),
    fetchExisting(guild, config.GENERAL_CHANNEL_ID),
    fetchExisting(guild, config.SUPPORT_CHANNEL_ID),
    fetchExisting(guild, config.VIP_CHANNEL_ID),
    fetchExisting(guild, config.MOD_LOG_CHANNEL_ID),
    fetchExisting(guild, config.TICKET_LOG_CHANNEL_ID),
    fetchExisting(guild, config.STAFF_CHAT_CHANNEL_ID)
  ]);

  const missing = [];
  if (!announcements) missing.push('announcements');
  if (!general) missing.push('general');
  if (!supportChannel) missing.push('support (open-ticket)');
  if (!vipChannel) missing.push('vip-lounge');
  if (!modLog) missing.push('mod-log');
  if (!ticketLog) missing.push('ticket log (sales-log)');
  if (!staffChat) missing.push('staff-chat');

  // Grant the Verified role view access on the VIP channel without
  // clobbering any of its other existing permission overwrites.
  if (vipChannel && vipChannel.permissionOverwrites) {
    await vipChannel.permissionOverwrites.edit(verifiedRole.id, { ViewChannel: true }).catch(() => {});
  }
  if (modLog && modLog.permissionOverwrites) {
    await modLog.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: false }).catch(() => {});
    await modLog.permissionOverwrites.edit(staffRole.id, { ViewChannel: true }).catch(() => {});
  }
  if (staffChat && staffChat.permissionOverwrites) {
    await staffChat.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: false }).catch(() => {});
    await staffChat.permissionOverwrites.edit(staffRole.id, { ViewChannel: true }).catch(() => {});
  }
  if (ticketLog && ticketLog.permissionOverwrites) {
    await ticketLog.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: false }).catch(() => {});
    await ticketLog.permissionOverwrites.edit(staffRole.id, { ViewChannel: true }).catch(() => {});
  }

  // Post (or refresh) the support button once, in the real support channel,
  // so opening a ticket never requires remembering a slash command.
  if (supportChannel) {
    const existingPinned = await supportChannel.messages.fetchPinned().catch(() => null);
    const alreadyPosted = existingPinned && existingPinned.some((m) => m.author.id === interaction.client.user.id && m.components.length > 0);
    if (!alreadyPosted) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sf-open-ticket').setLabel('Get Support').setStyle(ButtonStyle.Primary).setEmoji('🎫')
      );
      const sent = await supportChannel.send({
        content: 'Need help with an order, license, or something else? Click below to open a private ticket with staff.',
        components: [row]
      });
      await sent.pin().catch(() => {});
    }
  }

  // Same idea in #general — a permanent, Discord-style Verify button so
  // existing members (not just new joiners, who already get one via DM) can
  // link their account any time.
  if (general) {
    const verifyPinned = await general.messages.fetchPinned().catch(() => null);
    const verifyAlreadyPosted = verifyPinned && verifyPinned.some((m) => m.author.id === interaction.client.user.id && m.components.some((row) => row.components.some((c) => c.label === 'Verify')));
    if (!verifyAlreadyPosted) {
      const siteOrigin = process.env.SITE_URL || 'https://scripforge.net';
      const verifyRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Verify').setStyle(ButtonStyle.Link).setEmoji('🔗').setURL(`${siteOrigin}/pages/account`)
      );
      const verifySent = await general.send({
        content: '🔗 **Verify your ScripForge account** to get the Verified Customer role and a one-time 15% welcome discount (valid 7 days).',
        components: [verifyRow]
      });
      await verifySent.pin().catch(() => {});
    }
  }

  guildConfig.set(guild.id, 'staffRoleId', staffRole.id);
  guildConfig.set(guild.id, 'verifiedRoleId', verifiedRole.id);
  if (modLog) guildConfig.set(guild.id, 'modLogChannelId', modLog.id);
  if (ticketLog) guildConfig.set(guild.id, 'ticketArchiveChannelId', ticketLog.id);
  if (supportChannel) guildConfig.set(guild.id, 'supportChannelId', supportChannel.id);

  const lines = [
    'Bot is wired up to this server\'s existing channels — nothing was created.',
    '',
    `**Roles:** ${staffRole} ${verifiedRole}`,
    `**Announcements:** ${announcements || '(not found)'}`,
    `**General (Verify button):** ${general || '(not found)'}`,
    `**Support (ticket button):** ${supportChannel || '(not found)'}`,
    `**VIP lounge (Verified-only):** ${vipChannel || '(not found)'}`,
    `**Mod log:** ${modLog || '(not found)'}`,
    `**Ticket log:** ${ticketLog || '(not found)'}`,
    `**Staff chat:** ${staffChat || '(not found)'}`,
    '',
    `Assign the ${staffRole} role to your moderators — moderation/ticket commands work for anyone with the "Moderate Members" / "Manage Threads" Discord permission, which ${staffRole} grants. Safe to re-run any time.`
  ];
  if (missing.length) {
    lines.splice(1, 0, `⚠️ Could not find: ${missing.join(', ')} — these channel IDs may be wrong or the channel was deleted/renamed. Update the matching env var in discord-bot/.env (see .env.example) or restore the channel, then re-run.`);
  }

  await interaction.editReply(lines.join('\n'));
}

module.exports = { data, execute };
