const session = require('express-session');
const db = require('./db');

const ONE_DAY_MS = 86400000;

const statements = {
  set: db.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expire) VALUES (@sid, @sess, @expire)'),
  get: db.prepare(`SELECT sess FROM sessions WHERE sid = @sid AND datetime('now') < datetime(expire)`),
  destroy: db.prepare('DELETE FROM sessions WHERE sid = ?'),
  touch: db.prepare(`UPDATE sessions SET expire = @expire WHERE sid = @sid AND datetime('now') < datetime(expire)`),
  clearExpired: db.prepare(`DELETE FROM sessions WHERE datetime('now') > datetime(expire)`)
};

// A small SQLite-backed express-session store built on node:sqlite, so
// signed-in sessions survive a server restart instead of living only in
// memory. express-session's Store API is callback-shaped even though every
// operation here is actually synchronous.
class SqliteSessionStore extends session.Store {
  constructor(options = {}) {
    super(options);
    this.clearExpiredIntervalMs = options.clearExpiredIntervalMs || 15 * 60 * 1000;
    setInterval(() => {
      try {
        statements.clearExpired.run();
      } catch (err) {
        console.error('Failed to clear expired sessions:', err);
      }
    }, this.clearExpiredIntervalMs).unref();
  }

  set(sid, sess, cb = () => {}) {
    try {
      const age = (sess.cookie && sess.cookie.maxAge) || ONE_DAY_MS;
      const expire = new Date(Date.now() + age).toISOString();
      statements.set.run({ sid, sess: JSON.stringify(sess), expire });
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  get(sid, cb = () => {}) {
    try {
      const row = statements.get.get({ sid });
      cb(null, row ? JSON.parse(row.sess) : null);
    } catch (err) {
      cb(err);
    }
  }

  destroy(sid, cb = () => {}) {
    try {
      statements.destroy.run(sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  touch(sid, sess, cb = () => {}) {
    try {
      const expires = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires) : new Date(Date.now() + ONE_DAY_MS);
      statements.touch.run({ sid, expire: expires.toISOString() });
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
}

module.exports = SqliteSessionStore;
