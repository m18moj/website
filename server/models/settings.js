const db = require('../db');

// Every flag the site knows about, and what it does if never explicitly set.
// Keeping the defaults here (not scattered across routes) means adding a new
// flag later is a one-line change plus whatever reads it.
const DEFAULTS = {
  maintenanceMode: false,
  announcementBanner: { enabled: false, text: '' },
  wishlist: true,
  newBadges: true
};

// Flags exposed to anyone, signed in or not — used to decide what to render
// on the public site. Deliberately a smaller set than DEFAULTS: nothing
// admin-only or sensitive belongs here.
const PUBLIC_KEYS = ['maintenanceMode', 'announcementBanner', 'wishlist', 'newBadges'];

const statements = {
  get: db.prepare('SELECT value FROM settings WHERE key = ?'),
  set: db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (@key, @value, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = datetime('now')
  `),
  all: db.prepare('SELECT key, value FROM settings')
};

function get(key) {
  const row = statements.get.get(key);
  if (!row) return DEFAULTS[key];
  try {
    return JSON.parse(row.value);
  } catch (err) {
    return DEFAULTS[key];
  }
}

function set(key, value) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
    throw Object.assign(new Error(`Unknown setting: ${key}`), { statusCode: 400 });
  }
  statements.set.run({ key, value: JSON.stringify(value) });
  return get(key);
}

function getAll() {
  const result = { ...DEFAULTS };
  for (const row of statements.all.all()) {
    try {
      result[row.key] = JSON.parse(row.value);
    } catch (err) {
      // Leave the default in place if a stored value is somehow corrupt.
    }
  }
  return result;
}

function getPublic() {
  const all = getAll();
  const result = {};
  for (const key of PUBLIC_KEYS) result[key] = all[key];
  return result;
}

module.exports = { get, set, getAll, getPublic, DEFAULTS };
