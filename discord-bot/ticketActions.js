const { ChannelType, PermissionFlagsBits } = require('discord.js');
const guildConfig = require('./models/guildConfig');
const ticketsModel = require('./models/tickets');
const ordersModel = require('../server/models/orders');
const discordLinksModel = require('./models/discordLinks');

// Shared by the "Get Support" button (events/interactionCreate.js) — the
// only entry point today, but kept as its own function in case a slash
// command entry point is added later without duplicating this logic.
async function openTicket(interaction) {
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
    name: `ticket-${interaction.user.username}`.slice(0, 90),
    type: ChannelType.PrivateThread,
    invitable: false,
    reason: `Support ticket opened by ${interaction.user.tag}`
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

  ticketsModel.create({ guildId: guild.id, threadId: thread.id, openerDiscordId: interaction.user.id, openerTag: interaction.user.tag, orderId });

  await thread.send({
    content:
      `${staffRoleId ? `<@&${staffRoleId}> ` : ''}${interaction.user} opened a support ticket.${orderContext}\n\n` +
      `Describe your issue and staff will be with you shortly. Staff: use /ticket-claim to claim this ticket and /ticket-close when it's resolved.`
  });

  return { thread };
}

module.exports = { openTicket };
