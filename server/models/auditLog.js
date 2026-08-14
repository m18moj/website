const db = require('../db');

const statements = {
  insert: db.prepare(`
    INSERT INTO audit_log (actor_id, actor_username, action, target, details)
    VALUES (@actorId, @actorUsername, @action, @target, @details)
  `),
  recent: db.prepare(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?`),
  forTarget: db.prepare(`SELECT * FROM audit_log WHERE target = ? ORDER BY created_at DESC LIMIT ?`)
};

function record({ actor, action, target = null, details = null }) {
  statements.insert.run({
    actorId: actor ? actor.id : null,
    actorUsername: actor ? actor.username : 'system',
    action,
    target,
    details: details ? JSON.stringify(details) : null
  });
}

function recent(limit = 100) {
  return statements.recent.all(limit).map((row) => ({
    ...row,
    details: row.details ? JSON.parse(row.details) : null
  }));
}

// Every audit entry that named this exact string as its target — used for a
// per-user "moderation history" (role changes, unlocks, bans, disables) even
// though bans/disables themselves don't keep their own history table; the
// audit log already is one.
function forTarget(target, limit = 20) {
  return statements.forTarget.all(target, limit).map((row) => ({
    ...row,
    details: row.details ? JSON.parse(row.details) : null
  }));
}

module.exports = { record, recent, forTarget };
