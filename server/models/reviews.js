const db = require('../db');

const statements = {
  upsert: db.prepare(`
    INSERT INTO reviews (pack_id, user_id, rating, comment) VALUES (@packId, @userId, @rating, @comment)
    ON CONFLICT(pack_id, user_id) DO UPDATE SET rating = @rating, comment = @comment, updated_at = datetime('now')
  `),
  forPack: db.prepare(`
    SELECT reviews.*, users.username FROM reviews
    JOIN users ON users.id = reviews.user_id
    WHERE pack_id = ? ORDER BY reviews.created_at DESC
  `),
  summaryForPack: db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(AVG(rating), 0) AS average FROM reviews WHERE pack_id = ?
  `),
  hasPurchased: db.prepare(`
    SELECT COUNT(*) AS count FROM order_items
    JOIN orders ON orders.id = order_items.order_id
    WHERE orders.user_id = ? AND orders.status = 'paid' AND order_items.pack_id = ?
  `),
  own: db.prepare('SELECT * FROM reviews WHERE pack_id = ? AND user_id = ?'),
  delete: db.prepare('DELETE FROM reviews WHERE pack_id = ? AND user_id = ?')
};

function hasPurchasedPack(userId, packId) {
  return statements.hasPurchased.get(userId, packId).count > 0;
}

function upsertReview({ packId, userId, rating, comment }) {
  statements.upsert.run({ packId, userId, rating, comment: comment || '' });
  return statements.own.get(packId, userId);
}

function forPack(packId) {
  return statements.forPack.all(packId);
}

function summaryForPack(packId) {
  const row = statements.summaryForPack.get(packId);
  return { count: row.count, average: row.count ? Math.round(row.average * 10) / 10 : 0 };
}

function ownReview(packId, userId) {
  return statements.own.get(packId, userId);
}

function deleteReview(packId, userId) {
  statements.delete.run(packId, userId);
}

module.exports = { hasPurchasedPack, upsertReview, forPack, summaryForPack, ownReview, deleteReview };
