const db = require('../db');

// Reuses the site's existing `settings` table as a plain key-value store for
// IDs /setup-server creates (roles, channels, the ticket category) — not
// going through server/models/settings.js since that module enforces an
// allowlist of *site*-facing flags and this is purely bot-internal state.
// Keys are namespaced under "discord." so they never collide with site keys.
const statements = {
  get: db.prepare('SELECT value FROM settings WHERE key = ?'),
  set: db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (@key, @value, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = datetime('now')
  `)
};

function keyFor(guildId, name) {
  return `discord.${guildId}.${name}`;
}

function get(guildId, name) {
  const row = statements.get.get(keyFor(guildId, name));
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch (err) {
    return null;
  }
}

function set(guildId, name, value) {
  statements.set.run({ key: keyFor(guildId, name), value: JSON.stringify(value) });
}

module.exports = { get, set };
