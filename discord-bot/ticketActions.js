const { ChannelType, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const guildConfig = require('./models/guildConfig');
const ticketsModel = require('./models/tickets');
const ordersModel = require('../server/models/orders');
const discordLinksModel = require('./models/discordLinks');
const { TICKET_CATEGORIES, labelFor } = require('./ticketCategories');
const { logBotAction } = require('./botAuditLog');

// Step 1 of opening a ticket: the "Get Support" button no longer creates a
// thread directly — it first makes the opener pick a category, so every
// ticket is filterable/reportable by category from the moment it exists.
function buildCategoryPrompt() {
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('sf-ticket-category')
      .setPlaceholder('What is this ticket about?')
      .addOptions(TICKET_CATEGORIES.map((c) => ({ label: c.label, value: c.value, emoji: c.emoji, description: c.description })))
  );
  return { content: 'Choose a category for your ticket:', components: [row], ephemeral: true };
}

// Step 2: called once a category is picked (events/interactionCreate.js).
async function openTicket(interaction, category) {
  const guild = interaction.guild;
  const existing = ticketsModel.openTicketForUser(guild.id, interaction.user.id);
  if (existing) {
    const thread = await guild.channels.fetch(existing.thread_id).catch(() => null);
    return { alreadyOpen: true, thread };
  }

  const supportChannelId = guildConfig.get(guild.id, 'supportChannelId');
  const supportChannel = supportChannelId ? await guild.channels.fetch(supportChannelId).catch(() => null) : interaction.channel;
  if (!supportChannel) return { error: 'The support channel is not set up. Ask staff to run /setup-server.' };

  const thread = await supportChannel.threads.create({
    name: `${category}-${interaction.user.username}`.slice(0, 90),
    type: ChannelType.PrivateThread,
    invitable: false,
    reason: `Support ticket opened by ${interaction.user.tag} (${category})`
  });

  await thread.members.add(interaction.user.id);

  const staffRoleId = guildConfig.get(guild.id, 'staffRoleId');
  const link = discordLinksModel.findByDiscordId(interaction.user.id);
  let orderContext = '';
  let orderId = null;
  if (link) {
    const paidOrders = ordersModel.ordersForUser(link.user_id).filter((o) => o.status === 'paid');
    if (paidOrders.length > 0) {
      orderId = paidOrders[0].id;
      orderContext = `\n\nLinked ScripForge account has ${paidOrders.length} completed order(s), most recent: #${orderId}.`;
    }
  }

  ticketsModel.create({ guildId: guild.id, threadId: thread.id, openerDiscordId: interaction.user.id, openerTag: interaction.user.tag, orderId, category });
  logBotAction({ guildId: guild.id, actorType: 'discord_user', actorId: interaction.user.id, actorLabel: interaction.user.tag, action: 'ticket.open', target: thread.id, details: { category } });

  await thread.send({
    content:
      `${staffRoleId ? `<@&${staffRoleId}> ` : ''}${interaction.user} opened a **${labelFor(category)}** support ticket.${orderContext}\n\n` +
      `Describe your issue and staff will be with you shortly. Staff: use /ticket-claim to claim this ticket, /ticket-note to leave an internal note, and /ticket-close when it's resolved.`
  });

  return { thread };
}

module.exports = { openTicket, buildCategoryPrompt };
