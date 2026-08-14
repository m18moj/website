const Stripe = require('stripe');
const ordersModel = require('./models/orders');
const { fulfillOrder } = require('./orderFulfillment');

// Stripe calls this directly (no browser session, no CSRF token). Trust comes
// entirely from verifying the request signature against STRIPE_WEBHOOK_SECRET,
// which only Stripe and this server know — anyone else posting a fake
// "payment succeeded" body gets rejected before any order is touched. This
// route must receive the raw request body (not JSON-parsed) for the
// signature check to work, so it's mounted before express.json() in index.js.
async function stripeWebhookHandler(req, res) {
  if (!process.env.STRIPE_WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY) {
    console.error('Stripe webhook received but STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET are not configured.');
    return res.status(503).send('Stripe is not configured.');
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    ordersModel.markPaid(session.id, session.payment_intent);
    const order = ordersModel.findBySessionId(session.id);
    if (order) fulfillOrder(order.id).catch((err) => console.error('Order fulfillment failed:', err));
  }

  res.json({ received: true });
}

module.exports = stripeWebhookHandler;
