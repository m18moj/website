const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'scriptforge.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
// WAL's default NORMAL sync still fsyncs on checkpoint but not on every
// commit; FULL fsyncs each commit too, trading a little write speed (this is
// a small local store, not a high-throughput one) for not losing the last
// few orders/signups if the process is killed abruptly rather than stopped
// cleanly with Ctrl+C.
db.exec('PRAGMA synchronous = FULL');

// Printed on every boot so it's obvious this is the same on-disk file every
// time (data persists across restarts) rather than something recreated fresh.
console.log(`[db] Using SQLite database at ${DB_PATH}`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_session_id TEXT UNIQUE,
    stripe_payment_intent TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'canceled', 'refunded')),
    total_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    paid_at TEXT
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    pack_id TEXT NOT NULL,
    pack_name TEXT NOT NULL,
    script_id TEXT NOT NULL,
    script_title TEXT NOT NULL,
    price_cents INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT NOT NULL PRIMARY KEY,
    sess TEXT NOT NULL,
    expire TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_username TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- What's actually for sale. Admin-editable at runtime (server/models/catalog.js)
  -- rather than the old hardcoded server/catalog.js file, which now only
  -- supplies one-time seed data (server/seedCatalog.js) for a first boot.
  CREATE TABLE IF NOT EXISTS packs (
    id TEXT PRIMARY KEY,
    pack_name TEXT NOT NULL,
    game_title TEXT NOT NULL,
    genre TEXT NOT NULL DEFAULT 'other',
    description TEXT NOT NULL DEFAULT '',
    splash TEXT NOT NULL DEFAULT 'custom',
    data_game TEXT NOT NULL DEFAULT '',
    detail_url TEXT,
    hidden INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- (pack_id, id) together are what a cart/order line item references — kept
  -- as stable, immutable slugs once created (renaming only ever changes
  -- pack_name/game_title/title, never the id) so existing carts, past orders,
  -- and the hand-authored game-*.html pages never break underneath an edit.
  CREATE TABLE IF NOT EXISTS scripts (
    pack_id TEXT NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    price_cents INTEGER NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (pack_id, id)
  );

  -- One row per successful sign-in (password or TOTP-completed), so the admin
  -- dashboard can show a real history instead of just the single most-recent
  -- login already on the users table.
  CREATE TABLE IF NOT EXISTS login_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip TEXT,
    user_agent TEXT,
    browser TEXT,
    os TEXT,
    device_type TEXT,
    accept_language TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Site-wide feature flags/settings, admin-editable at runtime (Admin ->
  -- Settings). One row per named setting, value stored as JSON so it can be
  -- a plain boolean or a small object (e.g. the announcement banner's text).
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Pack-level "save for later" list, per user. Deliberately pack-level (not
  -- per-script) to keep the feature simple; server-side and DB-backed so it
  -- follows the account across devices instead of living in localStorage.
  CREATE TABLE IF NOT EXISTS wishlist_items (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pack_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, pack_id)
  );

  -- One row per script actually purchased (created once an order is marked
  -- paid). The license key is what unlocks the download; device binding is a
  -- best-effort "one payment, one device" limit — see server/models/licenses.js
  -- for exactly what "device" means in a browser context and its limits.
  CREATE TABLE IF NOT EXISTS license_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT NOT NULL UNIQUE,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pack_id TEXT NOT NULL,
    script_id TEXT NOT NULL,
    device_fingerprint TEXT,
    activated_at TEXT,
    download_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS promo_codes (
    code TEXT PRIMARY KEY,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
    discount_value INTEGER NOT NULL,
    max_uses INTEGER,
    uses_count INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS promo_code_redemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL REFERENCES promo_codes(code) ON DELETE CASCADE,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- One review per user per pack (enforced by the primary key), and only
  -- accepted from someone who has actually paid for that pack — see
  -- server/models/reviews.js.
  CREATE TABLE IF NOT EXISTS reviews (
    pack_id TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (pack_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS bundles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    pack_ids TEXT NOT NULL,
    discount_percent INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Every download attempt against a license key, successful or not — the
  -- forensic trail behind the Admin -> Users -> license "Activity" view.
  CREATE TABLE IF NOT EXISTS license_download_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT NOT NULL,
    ip TEXT,
    device_fingerprint TEXT,
    user_agent TEXT,
    success INTEGER NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS error_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL CHECK (source IN ('server', 'client')),
    message TEXT NOT NULL,
    stack TEXT,
    url TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);
  CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_scripts_pack_id ON scripts(pack_id);
  CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON login_history(user_id);
  CREATE INDEX IF NOT EXISTS idx_wishlist_items_user_id ON wishlist_items(user_id);
  CREATE INDEX IF NOT EXISTS idx_license_keys_user_id ON license_keys(user_id);
  CREATE INDEX IF NOT EXISTS idx_license_keys_order_id ON license_keys(order_id);
  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_reviews_pack_id ON reviews(pack_id);
  CREATE INDEX IF NOT EXISTS idx_error_log_created_at ON error_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_license_download_log_key ON license_download_log(license_key);
`);

// Adds a column to an existing table only if it isn't already there, so
// restarting the server after a schema change never touches — let alone
// loses — data already on disk. CREATE TABLE IF NOT EXISTS above only
// covers brand-new tables; existing ones need this to gain new columns.
function ensureColumn(table, column, definition) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all();
  if (existing.some((col) => col.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

ensureColumn('users', 'totp_secret', 'TEXT');
ensureColumn('users', 'totp_enabled', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'last_login_at', 'TEXT');
ensureColumn('users', 'last_login_ip', 'TEXT');
ensureColumn('orders', 'payment_provider', "TEXT NOT NULL DEFAULT 'stripe'");
ensureColumn('orders', 'coinbase_charge_id', 'TEXT');
ensureColumn('orders', 'coinbase_charge_code', 'TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_coinbase_charge_id ON orders(coinbase_charge_id)');

// 2FA is admin-only policy (customers get a CAPTCHA instead). This is a
// no-op after the first boot post-change; it only matters if a customer
// account had 2FA on from before that policy existed.
db.exec(`UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE role != 'admin' AND totp_enabled = 1`);

// Manual moderation: `disabled` is a single-click, no-paper-trail toggle for
// quick use; the ban_* columns are the more formal action (a reason, a
// duration, who did it), used together but tracked separately so the
// dashboard can show them as two distinct controls.
ensureColumn('scripts', 'description', "TEXT NOT NULL DEFAULT ''");
ensureColumn('scripts', 'category', "TEXT NOT NULL DEFAULT ''");
ensureColumn('users', 'disabled', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'ban_type', 'TEXT');
ensureColumn('users', 'ban_reason', 'TEXT');
ensureColumn('users', 'ban_expires_at', 'TEXT');
ensureColumn('users', 'banned_at', 'TEXT');
ensureColumn('users', 'banned_by', 'TEXT');

// Optional — accounts still don't require one to register or sign in (that
// design choice hasn't changed). Setting one just unlocks email-dependent
// features: password reset and order-receipt emails.
ensureColumn('users', 'email', 'TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL');

// What actually gets delivered after a purchase, and its version history —
// see server/models/catalog.js and the generated-scripts/ folder.
ensureColumn('scripts', 'version', "TEXT NOT NULL DEFAULT '1.0.0'");
ensureColumn('scripts', 'changelog', "TEXT NOT NULL DEFAULT '[]'");
ensureColumn('scripts', 'file_path', 'TEXT');
ensureColumn('scripts', 'file_ext', 'TEXT');
ensureColumn('scripts', 'preview_snippet', 'TEXT');

ensureColumn('orders', 'promo_code', 'TEXT');
ensureColumn('orders', 'discount_cents', 'INTEGER NOT NULL DEFAULT 0');

// First-boot only: if the catalog tables are empty, load the original
// hand-authored packs/scripts (server/seedCatalog.js) so existing installs
// don't lose their storefront when this database-backed catalog replaces the
// old static server/catalog.js file. Any boot after that reads/writes only
// the database — this block never runs again once packs exist.
const packCountRow = db.prepare('SELECT COUNT(*) AS count FROM packs').get();
if (packCountRow.count === 0) {
  const SEED_CATALOG = require('./seedCatalog');
  const insertPack = db.prepare(`
    INSERT INTO packs (id, pack_name, game_title, genre, description, splash, data_game, detail_url, sort_order)
    VALUES (@id, @packName, @gameTitle, @genre, @description, @splash, @dataGame, @detailUrl, @sortOrder)
  `);
  const insertScript = db.prepare(`
    INSERT INTO scripts (pack_id, id, title, description, category, price_cents, sort_order)
    VALUES (@packId, @id, @title, @description, @category, @priceCents, @sortOrder)
  `);
  SEED_CATALOG.forEach((pack, packIndex) => {
    insertPack.run({
      id: pack.packId,
      packName: pack.packName,
      gameTitle: pack.gameTitle,
      genre: pack.genre,
      description: pack.description,
      splash: pack.splash,
      dataGame: pack.dataGame,
      detailUrl: pack.detailUrl || null,
      sortOrder: packIndex
    });
    pack.scripts.forEach((script, scriptIndex) => {
      insertScript.run({
        packId: pack.packId,
        id: script.id,
        title: script.title,
        description: script.description || '',
        category: script.category || '',
        priceCents: Math.round(script.price * 100),
        sortOrder: scriptIndex
      });
    });
  });
  console.log(`[db] Seeded catalog with ${SEED_CATALOG.length} packs from server/seedCatalog.js`);
}

// node:sqlite's DatabaseSync has no built-in transaction helper (unlike
// better-sqlite3), so this mirrors better-sqlite3's db.transaction(fn) API:
// it returns a new function that, when called, runs fn inside BEGIN/COMMIT
// and rolls back on any error.
function transaction(fn) {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
}

module.exports = db;
module.exports.transaction = transaction;
