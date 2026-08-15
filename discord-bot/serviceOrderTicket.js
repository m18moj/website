// Opens a dedicated Discord channel the moment a paid order includes a
// Discord bot, website, or SMM plan — these are build-to-order services with
// no file to deliver, so a staff conversation IS the fulfillment (see
// js/downloads.js, which points customers here instead of a download).
// Runs from server/orderFulfillment.js, the same place license issuance and
// the receipt email happen, so it fires exactly once per paid order no
// matter which payment provider confirmed it.
const config = require('./config');
const discordRest = require('./discordRest');
const discordLinks = require('./models/discordLinks');
const { isServicePack } = require('../server/servicePacks');

function planLinesFor(order) {
  return order.items
    .filter((item) => isServicePack(item.pack_id))
    .map((item) => `• **${item.pack_name}** — ${item.script_title} (${(item.price_cents / 100).toFixed(2)} ${String(order.currency || 'usd').toUpperCase()})`);
}

// Discord hard-caps embed field values at 1024 characters — the customer's
// notes are already capped at 1500 server-side (server/routes/checkout.js),
// so this is a second, narrower belt-and-braces cap on the specific field
// they land in.
function truncate(text, max) {
  if (!text) return text;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

async function createServiceOrderTicket(order, user) {
  if (!order || !order.items || !order.items.some((item) => isServicePack(item.pack_id))) return;
  if (order.service_ticket_channel_id) return; // already opened for this order

  const restClient = discordRest.client();
  if (!restClient || !config.GUILD_ID) return; // bot not configured — nothing to open

  const link = discordLinks.findByUserId(order.user_id);
  const planLines = planLinesFor(order);

  const embed = {
    title: `New order — SF-${order.id}`,
    color: 0x00d9ff,
    fields: [
      { name: 'Customer', value: link ? `<@${link.discord_id}> (${user.username})` : user.username, inline: false },
      { name: 'Plan(s) & add-ons purchased', value: planLines.join('\n') || 'None', inline: false },
      { name: 'Total paid', value: `${(order.total_cents / 100).toFixed(2)} ${String(order.currency || 'usd').toUpperCase()}`, inline: true },
      { name: 'Order', value: `SF-${order.id}`, inline: true }
    ],
    timestamp: new Date().toISOString()
  };

  if (order.customer_notes) {
    embed.fields.push({ name: 'Customer notes (domain / feature requests)', value: truncate(order.customer_notes, 1024), inline: false });
  }

  try {
    const channel = await discordRest.createChannel({
      guildId: config.GUILD_ID,
      name: `order-${order.id}-${user.username}`,
      parentId: config.CUSTOM_BUILDS_CATEGORY_ID,
      topic: `ScripForge order SF-${order.id} — ${user.username}`
    });
    if (!channel || !channel.id) return;

    await discordRest.sendMessage(channel.id, {
      content: link ? `<@${link.discord_id}> — thanks for your order! Our team will follow up here shortly.` : undefined,
      embeds: [embed]
    });

    return channel.id;
  } catch (err) {
    console.error('Failed to open Discord service ticket for order', order.id, err.message);
    return null;
  }
}

module.exports = { createServiceOrderTicket };
