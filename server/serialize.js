const currency = require('./currency');

function serializeOrder(order) {
  if (!order) return null;
  return {
    id: order.id,
    status: order.status,
    paymentProvider: order.payment_provider || 'stripe',
    currency: (order.currency || 'usd').toUpperCase(),
    currencySymbol: currency.symbolFor((order.currency || 'usd').toUpperCase()),
    totalAmount: order.total_cents / 100,
    discountAmount: (order.discount_cents || 0) / 100,
    promoCode: order.promo_code || null,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    items: (order.items || []).map((item) => ({
      packId: item.pack_id,
      packName: item.pack_name,
      scriptTitle: item.script_title,
      priceAmount: item.price_cents / 100
    }))
  };
}

function serializeAdminOrder(order) {
  return {
    ...serializeOrder(order),
    customerUsername: order.customer_username
  };
}

module.exports = { serializeOrder, serializeAdminOrder };
