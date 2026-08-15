// The one place that runs whenever an order actually becomes 'paid' —
// called from both webhooks and the admin manual status-change route, so
// license issuance and the receipt email happen exactly once no matter
// which path confirmed the payment.
const ordersModel = require('./models/orders');
const usersModel = require('./models/users');
const licensesModel = require('./models/licenses');
const email = require('./email');
const { serializeOrder } = require('./serialize');
const discordLinks = require('../discord-bot/models/discordLinks');
const discordRest = require('../discord-bot/discordRest');
const productAnnounce = require('../discord-bot/productAnnounce');
const { createServiceOrderTicket } = require('../discord-bot/serviceOrderTicket');

async function fulfillOrder(orderId) {
  const order = ordersModel.withItems(ordersModel.findById(orderId));
  if (!order || order.status !== 'paid') return;

  licensesModel.createForOrder(order);

  const user = usersModel.findById(order.user_id);
  if (user && user.email) {
    try {
      await email.orderReceiptEmail({ to: user.email, username: user.username, order: serializeOrder(order) });
    } catch (err) {
      console.error('Failed to send order receipt email:', err.message);
    }
  }

  // If this account is already linked to a Discord account, their first
  // paid order is exactly the moment /verify would have granted the
  // Verified role anyway — do it automatically so a customer who linked
  // before buying doesn't need to run /verify again after paying. Still
  // membership-gated: syncVerifiedRole's PUT only succeeds if Discord itself
  // confirms they're in the guild (adding a role to a non-member 404s).
  const link = discordLinks.findByUserId(order.user_id);
  if (link) {
    try {
      const result = await discordRest.syncVerifiedRole(link.discord_id, { add: true });
      if (result.ok) discordLinks.setMemberVerified(link.discord_id);
    } catch (err) {
      console.error('Failed to sync Discord Verified role:', err.message);
    }
  }

  // Best-effort, self-cooldown'd (see productAnnounce.syncBestSellers) — a
  // paid order is the natural trigger for refreshing "Best Sellers" without
  // needing a scheduler/cron process.
  productAnnounce.syncBestSellers().catch(() => {});

  // Discord bots, websites, and SMM plans are build-to-order — there's no
  // file to deliver, so the "fulfillment" is a staff conversation. Opens
  // automatically rather than waiting on the customer to notice and open a
  // ticket themselves.
  if (user) {
    try {
      const channelId = await createServiceOrderTicket(order, user);
      if (channelId) ordersModel.setServiceTicketChannel(order.id, channelId);
    } catch (err) {
      console.error('Failed to open Discord service ticket:', err.message);
    }
  }
}

module.exports = { fulfillOrder };
