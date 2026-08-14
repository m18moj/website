const nowpayments = require('./nowpayments');
const ordersModel = require('./models/orders');
const { fulfillOrder } = require('./orderFulfillment');

// NOWPayments' signature scheme is computed over the parsed-then-resorted
// JSON body (not the raw bytes the way Stripe/most webhook providers work),
// so unlike the Stripe webhook this one runs after express.json() has
// already parsed the body — see server/nowpayments.js for the exact scheme.
function nowpaymentsWebhookHandler(req, res) {
  const signature = req.headers['x-nowpayments-sig'];

  if (!nowpayments.verifyWebhookSignature(req.body, signature)) {
    console.error('NOWPayments webhook signature verification failed.');
    return res.status(400).send('Invalid signature.');
  }

  const status = req.body && req.body.payment_status;
  const orderId = req.body && req.body.order_id;

  if (status === 'finished' || status === 'confirmed') {
    ordersModel.markPaidByOrderId(orderId);
    if (orderId) fulfillOrder(Number(orderId)).catch((err) => console.error('Order fulfillment failed:', err));
  }

  res.json({ received: true });
}

module.exports = nowpaymentsWebhookHandler;
