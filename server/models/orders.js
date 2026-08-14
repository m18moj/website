const db = require('../db');

const statements = {
  insertOrder: db.prepare(`
    INSERT INTO orders (user_id, stripe_session_id, payment_provider, status, total_cents, currency)
    VALUES (@userId, @stripeSessionId, @paymentProvider, 'pending', @totalCents, @currency)
  `),
  insertItem: db.prepare(`
    INSERT INTO order_items (order_id, pack_id, pack_name, script_id, script_title, price_cents)
    VALUES (@orderId, @packId, @packName, @scriptId, @scriptTitle, @priceCents)
  `),
  findBySessionId: db.prepare(`SELECT * FROM orders WHERE stripe_session_id = ?`),
  findById: db.prepare(`SELECT * FROM orders WHERE id = ?`),
  markPaid: db.prepare(`
    UPDATE orders SET status = 'paid', stripe_payment_intent = ?, paid_at = datetime('now')
    WHERE stripe_session_id = ? AND status != 'paid'
  `),
  markPaidById: db.prepare(`
    UPDATE orders SET status = 'paid', paid_at = datetime('now')
    WHERE id = ? AND status != 'paid'
  `),
  itemsForOrder: db.prepare(`SELECT * FROM order_items WHERE order_id = ?`),
  ordersForUser: db.prepare(`SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`),
  allOrders: db.prepare(`
    SELECT orders.*, users.username AS customer_username
    FROM orders
    JOIN users ON users.id = orders.user_id
    ORDER BY orders.created_at DESC
  `),
  // Grouped by currency, not summed across them — orders can now be placed
  // in GBP, USD, or EUR, and adding raw cents from different currencies
  // together would produce a meaningless number.
  revenueByCurrency: db.prepare(`
    SELECT currency, COALESCE(SUM(total_cents), 0) AS total_cents
    FROM orders WHERE status = 'paid'
    GROUP BY currency
  `),
  countPaid: db.prepare(`SELECT COUNT(*) AS count FROM orders WHERE status = 'paid'`),
  setStatus: db.prepare(`UPDATE orders SET status = ? WHERE id = ?`),
  revenueByCurrencyForUser: db.prepare(`
    SELECT currency, COALESCE(SUM(total_cents), 0) AS total_cents
    FROM orders WHERE user_id = ? AND status = 'paid'
    GROUP BY currency
  `),
  setPromoDiscount: db.prepare(`UPDATE orders SET promo_code = ?, discount_cents = ? WHERE id = ?`)
};

const createOrder = db.transaction(({ userId, stripeSessionId = null, paymentProvider = 'stripe', totalCents, currency, packs }) => {
  const order = statements.insertOrder.run({ userId, stripeSessionId, paymentProvider, totalCents, currency });
  const orderId = order.lastInsertRowid;

  for (const pack of packs) {
    for (const item of pack.items) {
      statements.insertItem.run({
        orderId,
        packId: pack.packId,
        packName: pack.packName,
        scriptId: item.id,
        scriptTitle: item.title,
        priceCents: item.priceCents
      });
    }
  }

  return statements.findById.get(orderId);
});

function findBySessionId(sessionId) {
  return statements.findBySessionId.get(sessionId);
}

function markPaid(sessionId, paymentIntentId) {
  return statements.markPaid.run(paymentIntentId, sessionId);
}

// NOWPayments hands our own order id straight back in its webhook, so
// crypto orders confirm by primary key — no separate charge-id column or
// lookup needed (unlike the old Coinbase Commerce integration).
function markPaidByOrderId(orderId) {
  const id = Number(orderId);
  if (!id) return { changes: 0 };
  return statements.markPaidById.run(id);
}

function itemsForOrder(orderId) {
  return statements.itemsForOrder.all(orderId);
}

function withItems(order) {
  if (!order) return null;
  return { ...order, items: itemsForOrder(order.id) };
}

function ordersForUser(userId) {
  return statements.ordersForUser.all(userId).map(withItems);
}

function allOrders() {
  return statements.allOrders.all().map(withItems);
}

function stats() {
  return {
    paidOrders: statements.countPaid.get().count,
    revenueByCurrency: statements.revenueByCurrency.all().map((row) => ({
      currency: row.currency.toUpperCase(),
      amount: row.total_cents / 100
    }))
  };
}

// Currency-safe purchase summary for one user's admin detail panel — grouped
// rather than summed across currencies, same reasoning as stats() above.
function statsForUser(userId) {
  const orders = statements.ordersForUser.all(userId);
  return {
    totalOrders: orders.length,
    paidOrders: orders.filter((o) => o.status === 'paid').length,
    hasPurchased: orders.some((o) => o.status === 'paid'),
    revenueByCurrency: statements.revenueByCurrencyForUser.all(userId).map((row) => ({
      currency: row.currency.toUpperCase(),
      amount: row.total_cents / 100
    }))
  };
}

// Order counts per day — deliberately counts, not revenue, so this never has
// to mix GBP/USD/EUR together into one misleading number. Real query, real
// dates, no simulated data points.
function ordersByDay(days = 14) {
  return db.prepare(`
    SELECT date(created_at) AS day, COUNT(*) AS total,
      SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid
    FROM orders
    WHERE created_at >= datetime('now', ?)
    GROUP BY date(created_at)
    ORDER BY day ASC
  `).all(`-${days} days`);
}

// Best-selling packs by items actually paid for — counts, again, not
// revenue, for the same cross-currency reason.
function topPacks(limit = 5) {
  return db.prepare(`
    SELECT order_items.pack_id AS packId, order_items.pack_name AS packName, COUNT(*) AS itemsSold
    FROM order_items
    JOIN orders ON orders.id = order_items.order_id
    WHERE orders.status = 'paid'
    GROUP BY order_items.pack_id, order_items.pack_name
    ORDER BY itemsSold DESC
    LIMIT ?
  `).all(limit);
}

const ORDER_STATUSES = ['pending', 'paid', 'failed', 'canceled', 'refunded'];

function setStatus(orderId, status) {
  statements.setStatus.run(status, orderId);
  return withItems(statements.findById.get(orderId));
}

function setPromoDiscount(orderId, promoCode, discountCents) {
  statements.setPromoDiscount.run(promoCode, discountCents, orderId);
}

module.exports = {
  createOrder,
  findBySessionId,
  findById: (id) => statements.findById.get(id),
  markPaid,
  markPaidByOrderId,
  ordersForUser,
  allOrders,
  withItems,
  stats,
  statsForUser,
  ordersByDay,
  topPacks,
  setStatus,
  setPromoDiscount,
  ORDER_STATUSES
};
