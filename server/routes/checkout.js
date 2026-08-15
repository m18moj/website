const express = require('express');
const Stripe = require('stripe');

const { requireAuth } = require('../middleware/auth');
const { verifyCsrfToken } = require('../middleware/csrf');
const { priceCart } = require('../models/catalog');
const currency = require('../currency');
const ordersModel = require('../models/orders');
const usersModel = require('../models/users');
const nowpayments = require('../nowpayments');
const promoCodesModel = require('../models/promoCodes');
const bundlesModel = require('../models/bundles');
const { serializeOrder } = require('../serialize');

const router = express.Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.includes('...')) {
    throw Object.assign(new Error('Card checkout is not configured on this server yet.'), { statusCode: 503 });
  }
  return new Stripe(key);
}

// Recomputes the cart from the server-side catalog (USD), then converts
// every line item into the requested currency in one place — see
// currency.convertPricedCart — so the per-script breakdown always sums
// exactly to the total, in whatever currency actually gets charged. The
// client's cart contents (which packs/scripts) and currency choice are
// both just hints; the amounts themselves always come from here.
function priceCartInCurrency(rawCart, requestedCurrency) {
  const priced = priceCart(rawCart);
  const selectedCurrency = currency.normalize(requestedCurrency);
  const converted = currency.convertPricedCart(priced, selectedCurrency);
  return { ...converted, currency: selectedCurrency };
}

// Spreads a discount across every line item proportionally (the last item
// absorbs any rounding remainder) so the itemized receipt always sums
// exactly to the discounted total, in whatever currency was charged.
function applyDiscountToPriced(priced, discountCents) {
  if (!discountCents) return priced;

  const originalTotal = priced.totalCents;
  if (originalTotal <= 0) return priced;

  const allItems = priced.packs.flatMap((pack) => pack.items);
  let remaining = Math.min(discountCents, originalTotal);

  allItems.forEach((item, idx) => {
    const isLast = idx === allItems.length - 1;
    const share = isLast ? remaining : Math.round(discountCents * (item.priceCents / originalTotal));
    const applied = Math.min(share, item.priceCents, remaining);
    item.priceCents -= applied;
    remaining -= applied;
  });

  const packs = priced.packs.map((pack) => ({
    ...pack,
    totalCents: pack.items.reduce((sum, item) => sum + item.priceCents, 0)
  }));
  const totalCents = packs.reduce((sum, pack) => sum + pack.totalCents, 0);
  return { ...priced, packs, totalCents };
}

// Applies a promo code if one was given and valid; otherwise checks whether
// the cart's exact pack set matches an active bundle and applies that
// discount automatically. The two never stack — whichever applies first
// wins, and a promo code always takes priority since the customer typed it
// on purpose.
function applyBestDiscount(priced, promoCodeInput) {
  if (promoCodeInput) {
    const { valid, promo, reason } = promoCodesModel.validate(promoCodeInput);
    if (!valid) return { priced, error: reason };
    const discountCents = promoCodesModel.computeDiscountCents(promo, priced.totalCents);
    return { priced: applyDiscountToPriced(priced, discountCents), appliedPromoCode: promo.code, discountCents };
  }

  const bundle = bundlesModel.matchBundleForCart(priced);
  if (bundle) {
    const discountCents = Math.round(priced.totalCents * (bundle.discountPercent / 100));
    return { priced: applyDiscountToPriced(priced, discountCents), appliedBundleId: bundle.id, discountCents };
  }

  return { priced, discountCents: 0 };
}

router.post('/create-session', requireAuth, verifyCsrfToken, async (req, res) => {
  try {
    const stripe = getStripe();
    let priced = priceCartInCurrency(req.body.cart, req.body.currency);

    if (!priced.packs.length) {
      return res.status(400).json({ error: 'Your basket is empty or contains items that no longer exist.' });
    }

    const discountResult = applyBestDiscount(priced, req.body.promoCode);
    if (discountResult.error) return res.status(400).json({ error: discountResult.error });
    priced = discountResult.priced;

    if (!priced.totalCents) {
      return res.status(400).json({ error: 'Your basket total must be greater than zero to check out.' });
    }

    const user = usersModel.findById(req.session.userId);
    const origin = `${req.protocol}://${req.get('host')}`;

    const line_items = priced.packs.flatMap((pack) =>
      pack.items.map((item) => ({
        quantity: 1,
        price_data: {
          currency: priced.currency.toLowerCase(),
          unit_amount: item.priceCents,
          product_data: { name: `${pack.packName} — ${item.title}` }
        }
      }))
    );

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      // Accounts here are username-based with no email on file, so Stripe's
      // own hosted Checkout page collects the buyer's email for the receipt.
      client_reference_id: String(user.id),
      line_items,
      success_url: `${origin}/pages/thank-you.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pages/checkout.html`
    });

    const order = ordersModel.createOrder({
      userId: user.id,
      stripeSessionId: session.id,
      paymentProvider: 'stripe',
      totalCents: priced.totalCents,
      currency: priced.currency.toLowerCase(),
      packs: priced.packs
    });

    if (discountResult.appliedPromoCode) {
      ordersModel.setPromoDiscount(order.id, discountResult.appliedPromoCode, discountResult.discountCents);
      promoCodesModel.redeem(discountResult.appliedPromoCode, order.id, user.id);
    }

    res.json({ url: session.url });
  } catch (err) {
    // Our own "not configured" guard is safe to show verbatim. Anything else
    // (a raw Stripe API error, a bug) is logged server-side only — surfacing
    // Stripe's internal error text to customers isn't useful and can leak
    // implementation details.
    if (err.statusCode === 503) return res.status(503).json({ error: err.message });
    console.error('Stripe checkout session creation failed:', err);
    res.status(502).json({ error: 'Could not start checkout right now. Please try again in a moment.' });
  }
});

// Lets the checkout page preview a promo code's discount before committing
// to a payment provider — same validation/pricing logic as the real
// checkout, just without creating an order or a payment session.
router.post('/preview-discount', requireAuth, verifyCsrfToken, (req, res) => {
  let priced = priceCartInCurrency(req.body.cart, req.body.currency);
  if (!priced.packs.length) {
    return res.status(400).json({ error: 'Your basket is empty or contains items that no longer exist.' });
  }

  const before = priced.totalCents;
  const discountResult = applyBestDiscount(priced, req.body.promoCode);
  if (discountResult.error) return res.status(400).json({ error: discountResult.error });

  res.json({
    currency: priced.currency,
    subtotal: before / 100,
    discount: discountResult.discountCents / 100,
    total: discountResult.priced.totalCents / 100,
    appliedPromoCode: discountResult.appliedPromoCode || null,
    appliedBundleId: discountResult.appliedBundleId || null
  });
});

// Used by thank-you.html to show order details after a successful redirect.
// Scoped to the signed-in user's own orders — no one can read another
// customer's order by guessing a session id.
router.get('/session-status', requireAuth, (req, res) => {
  const sessionId = req.query.session_id;
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'Missing session_id.' });
  }

  const order = ordersModel.findBySessionId(sessionId);
  if (!order || order.user_id !== req.session.userId) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  res.json({ order: serializeOrder(ordersModel.withItems(order)) });
});

// Crypto checkout via NOWPayments' hosted invoice page — this server never
// handles wallet keys or addresses. The local order row is created first (in
// a 'pending' state) so its own id can be passed to NOWPayments as our
// order_id, which it hands straight back in the confirmation webhook —
// no separate charge-id lookup needed.
router.post('/create-crypto-charge', requireAuth, verifyCsrfToken, async (req, res) => {
  try {
    if (!nowpayments.isConfigured()) {
      return res.status(503).json({ error: 'Crypto payments are not configured on this server yet.' });
    }

    let priced = priceCartInCurrency(req.body.cart, req.body.currency);

    if (!priced.packs.length) {
      return res.status(400).json({ error: 'Your basket is empty or contains items that no longer exist.' });
    }

    const discountResult = applyBestDiscount(priced, req.body.promoCode);
    if (discountResult.error) return res.status(400).json({ error: discountResult.error });
    priced = discountResult.priced;

    if (!priced.totalCents) {
      return res.status(400).json({ error: 'Your basket total must be greater than zero to check out.' });
    }

    const user = usersModel.findById(req.session.userId);
    const origin = `${req.protocol}://${req.get('host')}`;

    const order = ordersModel.createOrder({
      userId: user.id,
      paymentProvider: 'crypto',
      totalCents: priced.totalCents,
      currency: priced.currency.toLowerCase(),
      packs: priced.packs
    });

    if (discountResult.appliedPromoCode) {
      ordersModel.setPromoDiscount(order.id, discountResult.appliedPromoCode, discountResult.discountCents);
      promoCodesModel.redeem(discountResult.appliedPromoCode, order.id, user.id);
    }

    const packNames = priced.packs.map((p) => p.packName).join(', ');
    const invoice = await nowpayments.createInvoice({
      orderId: order.id,
      description: `ScripForge order — ${packNames}`,
      amount: priced.totalCents / 100,
      currency: priced.currency.toLowerCase(),
      successUrl: `${origin}/pages/thank-you.html?crypto_ref=${order.id}`,
      cancelUrl: `${origin}/pages/checkout.html`,
      ipnUrl: `${origin}/api/webhooks/nowpayments`
    });

    res.json({ url: invoice.invoice_url });
  } catch (err) {
    if (err.statusCode === 503) return res.status(503).json({ error: err.message });
    console.error('NOWPayments invoice creation failed:', err);
    res.status(502).json({ error: 'Could not start crypto checkout right now. Please try again in a moment.' });
  }
});

// Crypto payments confirm on-chain, which can take from seconds to tens of
// minutes — this just reports whatever the order's current status is so the
// thank-you page can poll it, rather than promising an instant result.
router.get('/crypto-status', requireAuth, (req, res) => {
  const orderId = Number(req.query.order_id);
  if (!orderId) return res.status(400).json({ error: 'Missing order_id.' });

  const order = ordersModel.findById(orderId);
  if (!order || order.user_id !== req.session.userId) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  res.json({ order: serializeOrder(ordersModel.withItems(order)) });
});

module.exports = router;
