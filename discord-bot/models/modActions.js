const db = require('../db');

const statements = {
  insert: db.prepare(`
    INSERT INTO mod_actions
      (guild_id, target_discord_id, target_tag, moderator_discord_id, moderator_tag, action_type, reason, duration_ms)
    VALUES (@guildId, @targetDiscordId, @targetTag, @moderatorDiscordId, @moderatorTag, @actionType, @reason, @durationMs)
  `),
  forTarget: db.prepare(`
    SELECT * FROM mod_actions WHERE guild_id = ? AND target_discord_id = ? ORDER BY created_at DESC LIMIT ?
  `),
  recent: db.prepare(`SELECT * FROM mod_actions WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?`)
};

function record({ guildId, targetDiscordId, targetTag, moderatorDiscordId, moderatorTag, actionType, reason = null, durationMs = null }) {
  statements.insert.run({ guildId, targetDiscordId, targetTag, moderatorDiscordId, moderatorTag, actionType, reason, durationMs });
}

function forTarget(guildId, targetDiscordId, limit = 25) {
  return statements.forTarget.all(guildId, targetDiscordId, limit);
}

function recent(guildId, limit = 25) {
  return statements.recent.all(guildId, limit);
}

module.exports = { record, forTarget, recent };
