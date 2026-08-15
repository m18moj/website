const db = require('../db');

const statements = {
  upsert: db.prepare(`
    INSERT INTO discord_links (discord_id, discord_tag, user_id)
    VALUES (@discordId, @discordTag, @userId)
    ON CONFLICT(discord_id) DO UPDATE SET discord_tag = @discordTag, user_id = @userId, linked_at = datetime('now')
  `),
  findByDiscordId: db.prepare('SELECT * FROM discord_links WHERE discord_id = ?'),
  findByUserId: db.prepare('SELECT * FROM discord_links WHERE user_id = ?'),
  remove: db.prepare('DELETE FROM discord_links WHERE discord_id = ?'),
  removeByUserId: db.prepare('DELETE FROM discord_links WHERE user_id = ?')
};

// Idempotent by design — re-running /verify with the same (or a different)
// matching account just updates the mapping rather than erroring, since a
// customer legitimately re-verifying isn't an exceptional case.
function link({ discordId, discordTag, userId }) {
  statements.upsert.run({ discordId, discordTag, userId });
  return statements.findByDiscordId.get(discordId);
}

function findByDiscordId(discordId) {
  return statements.findByDiscordId.get(discordId);
}

function findByUserId(userId) {
  return statements.findByUserId.get(userId);
}

function unlink(discordId) {
  statements.remove.run(discordId);
}

// discord_id is the table's primary key (one Discord account can only ever
// point at one ScripForge user), but nothing stops one ScripForge user from
// having linked more than one Discord account over time via repeated
// /verify or re-linking on the website. Called before creating a new link
// for a user so re-linking swaps cleanly instead of accumulating stale rows.
function unlinkByUserId(userId) {
  statements.removeByUserId.run(userId);
}

module.exports = { link, findByDiscordId, findByUserId, unlink, unlinkByUserId };
