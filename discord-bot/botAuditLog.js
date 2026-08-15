// Append-only log for everything the bot (or the bot admin dashboard) does —
// separate from the website's own audit_log (server/models/auditLog.js),
// whose actor is always a ScripForge user account. Backs the bot dashboard's
// Audit Log / Logs panel.
const db = require('./db');

const statements = {
  insert: db.prepare(`
    INSERT INTO bot_audit_log (guild_id, actor_type, actor_id, actor_label, action, target, details)
    VALUES (@guildId, @actorType, @actorId, @actorLabel, @action, @target, @details)
  `),
  recent: db.prepare(`SELECT * FROM bot_audit_log WHERE (@guildId IS NULL OR guild_id = @guildId) ORDER BY created_at DESC LIMIT @limit`),
  countSince: db.prepare(`SELECT COUNT(*) AS count FROM bot_audit_log WHERE created_at >= @since`)
};

// actorType: 'system' | 'discord_user' | 'site_admin'
function logBotAction({ guildId = null, actorType = 'system', actorId = null, actorLabel, action, target = null, details = null }) {
  statements.insert.run({
    guildId,
    actorType,
    actorId,
    actorLabel: actorLabel || 'system',
    action,
    target,
    details: details ? JSON.stringify(details) : null
  });
}

function recentBotActions({ guildId = null, limit = 100 } = {}) {
  return statements.recent.all({ guildId, limit }).map((row) => ({ ...row, details: row.details ? JSON.parse(row.details) : null }));
}

function countBotActionsSince(sinceIso) {
  return statements.countSince.get({ since: sinceIso }).count;
}

module.exports = { logBotAction, recentBotActions, countBotActionsSince };
