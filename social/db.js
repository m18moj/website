// Deliberately just the same connection the web server uses (SQLite WAL mode
// handles concurrent access from multiple processes) — no separate data
// store, no separate migrations. See server/db.js for the schema itself,
// same pattern discord-bot/db.js already uses for the same reason.
module.exports = require('../server/db');
