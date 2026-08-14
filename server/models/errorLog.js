const db = require('../db');

const statements = {
  insert: db.prepare(`
    INSERT INTO error_log (source, message, stack, url, user_id) VALUES (@source, @message, @stack, @url, @userId)
  `),
  recent: db.prepare('SELECT * FROM error_log ORDER BY created_at DESC LIMIT ?'),
  countSince: db.prepare(`SELECT COUNT(*) AS count FROM error_log WHERE created_at >= datetime('now', ?)`),
  clearAll: db.prepare('DELETE FROM error_log')
};

function record({ source, message, stack, url, userId }) {
  try {
    statements.insert.run({
      source,
      message: String(message || '').slice(0, 2000),
      stack: stack ? String(stack).slice(0, 4000) : null,
      url: url || null,
      userId: userId || null
    });
  } catch (err) {
    // Logging must never itself crash the request that triggered it.
    console.error('Failed to record error log entry:', err.message);
  }
}

function recent(limit = 100) {
  return statements.recent.all(limit);
}

function countLast24h() {
  return statements.countSince.get('-24 hours').count;
}

function clearAll() {
  statements.clearAll.run();
}

module.exports = { record, recent, countLast24h, clearAll };
