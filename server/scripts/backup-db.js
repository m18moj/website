// Creates a consistent point-in-time copy of the live SQLite database using
// `VACUUM INTO`, which is safe to run against a database that's open and in
// active use (including in WAL mode, which this app uses — see server/db.js)
// unlike a raw filesystem copy of the .db file, which can capture a
// half-written page or miss data still sitting in the -wal file.
//
// Usage:
//   node server/scripts/backup-db.js          # one-off backup + prune
// Also wired into server/index.js to run on a daily cron schedule.
//
// Env vars:
//   DB_PATH     — same var server/db.js reads; defaults to data/scripforge.db
//   BACKUP_DIR  — where backups are written; defaults to data/backups
//                 (point this at a different disk/mount for real off-box
//                 redundancy — copying elsewhere on the same disk protects
//                 against accidental deletion/corruption, not disk failure)
//   BACKUP_KEEP — how many most-recent backups to retain; defaults to 14

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'scripforge.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');
const KEEP = Number(process.env.BACKUP_KEEP) || 14;

function timestamp() {
  return new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
}

function pruneOldBackups() {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('scripforge-') && f.endsWith('.db'))
    .sort(); // ISO-ish timestamps in the filename sort chronologically as strings

  const excess = files.length - KEEP;
  if (excess <= 0) return [];

  const toDelete = files.slice(0, excess);
  toDelete.forEach((f) => fs.unlinkSync(path.join(BACKUP_DIR, f)));
  return toDelete;
}

function runBackup() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`No database found at ${DB_PATH} — nothing to back up.`);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const dest = path.join(BACKUP_DIR, `scripforge-${timestamp()}.db`);

  // Opens its own connection to the same file — WAL mode allows concurrent
  // readers alongside the server's live connection, so this doesn't need to
  // stop the server or block requests.
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  try {
    db.prepare('VACUUM INTO ?').run(dest);
  } finally {
    db.close();
  }

  const removed = pruneOldBackups();
  return { dest, removed };
}

if (require.main === module) {
  try {
    const { dest, removed } = runBackup();
    console.log(`[backup] Wrote ${dest}`);
    if (removed.length) console.log(`[backup] Pruned ${removed.length} old backup(s): ${removed.join(', ')}`);
  } catch (err) {
    console.error('[backup] Failed:', err.message);
    process.exitCode = 1;
  }
}

module.exports = { runBackup };
