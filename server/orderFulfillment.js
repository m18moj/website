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
  // before buying doesn't need to run /verify again after paying.
  const link = discordLinks.findByUserId(order.user_id);
  if (link) {
    try {
      await discordRest.syncVerifiedRole(link.discord_id, { add: true });
    } catch (err) {
      console.error('Failed to sync Discord Verified role:', err.message);
    }
  }
}

module.exports = { fulfillOrder };
