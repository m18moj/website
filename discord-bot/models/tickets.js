const db = require('../db');

const statements = {
  insert: db.prepare(`
    INSERT INTO support_tickets (guild_id, thread_id, opener_discord_id, opener_tag, order_id)
    VALUES (@guildId, @threadId, @openerDiscordId, @openerTag, @orderId)
  `),
  findByThreadId: db.prepare('SELECT * FROM support_tickets WHERE thread_id = ?'),
  claim: db.prepare(`
    UPDATE support_tickets SET status = 'claimed', claimed_by_discord_id = @claimedByDiscordId, claimed_by_tag = @claimedByTag
    WHERE thread_id = @threadId AND status != 'closed'
  `),
  close: db.prepare(`
    UPDATE support_tickets SET status = 'closed', closed_at = datetime('now'), transcript_path = @transcriptPath
    WHERE thread_id = @threadId
  `),
  openForUser: db.prepare(`
    SELECT * FROM support_tickets WHERE guild_id = ? AND opener_discord_id = ? AND status != 'closed'
  `)
};

function create({ guildId, threadId, openerDiscordId, openerTag, orderId = null }) {
  statements.insert.run({ guildId, threadId, openerDiscordId, openerTag, orderId });
  return statements.findByThreadId.get(threadId);
}

function findByThreadId(threadId) {
  return statements.findByThreadId.get(threadId);
}

function claim(threadId, { claimedByDiscordId, claimedByTag }) {
  statements.claim.run({ threadId, claimedByDiscordId, claimedByTag });
  return statements.findByThreadId.get(threadId);
}

function close(threadId, { transcriptPath = null } = {}) {
  statements.close.run({ threadId, transcriptPath });
  return statements.findByThreadId.get(threadId);
}

// One open ticket per user at a time — the support button checks this
// before creating a new thread so someone spamming it doesn't end up with a
// dozen duplicate threads.
function openTicketForUser(guildId, discordId) {
  return statements.openForUser.get(guildId, discordId);
}

module.exports = { create, findByThreadId, claim, close, openTicketForUser };
