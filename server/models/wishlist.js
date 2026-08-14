const db = require('../db');

const statements = {
  add: db.prepare('INSERT OR IGNORE INTO wishlist_items (user_id, pack_id) VALUES (?, ?)'),
  remove: db.prepare('DELETE FROM wishlist_items WHERE user_id = ? AND pack_id = ?'),
  listForUser: db.prepare('SELECT pack_id, created_at FROM wishlist_items WHERE user_id = ? ORDER BY created_at DESC')
};

function add(userId, packId) {
  statements.add.run(userId, packId);
}

function remove(userId, packId) {
  statements.remove.run(userId, packId);
}

function listForUser(userId) {
  return statements.listForUser.all(userId);
}

module.exports = { add, remove, listForUser };
