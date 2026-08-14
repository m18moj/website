// The one place that runs whenever an order actually becomes 'paid' —
// called from both webhooks and the admin manual status-change route, so
// license issuance and the receipt email happen exactly once no matter
// which path confirmed the payment.
const ordersModel = require('./models/orders');
const usersModel = require('./models/users');
const licensesModel = require('./models/licenses');
const email = require('./email');
const { serializeOrder } = require('./serialize');

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
}

module.exports = { fulfillOrder };
