// Deliberately just the same connection the web server uses (SQLite WAL mode
// handles concurrent access from two processes) — no separate data store, no
// separate migrations. See server/db.js for the schema itself.
module.exports = require('../server/db');
