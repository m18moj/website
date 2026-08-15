const db = require('../db');

const statements = {
  insert: db.prepare(`
    INSERT INTO support_tickets (guild_id, thread_id, opener_discord_id, opener_tag, order_id, category)
    VALUES (@guildId, @threadId, @openerDiscordId, @openerTag, @orderId, @category)
  `),
  findByThreadId: db.prepare('SELECT * FROM support_tickets WHERE thread_id = ?'),
  findById: db.prepare('SELECT * FROM support_tickets WHERE id = ?'),
  claim: db.prepare(`
    UPDATE support_tickets SET status = 'claimed', claimed_by_discord_id = @claimedByDiscordId, claimed_by_tag = @claimedByTag
    WHERE thread_id = @threadId AND status != 'closed'
  `),
  close: db.prepare(`
    UPDATE support_tickets SET status = 'closed', closed_at = datetime('now'), transcript_path = @transcriptPath
    WHERE thread_id = @threadId
  `),
  reopen: db.prepare(`
    UPDATE support_tickets SET status = 'open', closed_at = NULL, reopened_at = datetime('now')
    WHERE thread_id = ?
  `),
  setNotes: db.prepare(`UPDATE support_tickets SET notes = ? WHERE thread_id = ?`),
  openForUser: db.prepare(`
    SELECT * FROM support_tickets WHERE guild_id = ? AND opener_discord_id = ? AND status != 'closed'
  `),
  listByGuild: db.prepare(`SELECT * FROM support_tickets WHERE guild_id = ? ORDER BY opened_at DESC LIMIT ?`),
  countByStatus: db.prepare(`SELECT status, COUNT(*) AS count FROM support_tickets WHERE guild_id = ? GROUP BY status`),
  countByCategory: db.prepare(`SELECT category, COUNT(*) AS count FROM support_tickets WHERE guild_id = ? GROUP BY category`),
  avgResolutionSeconds: db.prepare(`
    SELECT AVG((julianday(closed_at) - julianday(opened_at)) * 86400) AS avgSeconds
    FROM support_tickets WHERE guild_id = ? AND closed_at IS NOT NULL
  `)
};

function create({ guildId, threadId, openerDiscordId, openerTag, orderId = null, category = 'general' }) {
  statements.insert.run({ guildId, threadId, openerDiscordId, openerTag, orderId, category });
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

function reopen(threadId) {
  statements.reopen.run(threadId);
  return statements.findByThreadId.get(threadId);
}

function parseNotes(row) {
  try {
    return JSON.parse(row.notes || '[]');
  } catch (err) {
    return [];
  }
}

function addNote(threadId, { authorTag, text }) {
  const ticket = statements.findByThreadId.get(threadId);
  if (!ticket) return null;
  const notes = parseNotes(ticket);
  notes.push({ authorTag, text, at: new Date().toISOString() });
  statements.setNotes.run(JSON.stringify(notes), threadId);
  return statements.findByThreadId.get(threadId);
}

// One open ticket per user at a time — the support flow checks this before
// creating a new thread so someone spamming it doesn't end up with a dozen
// duplicate threads.
function openTicketForUser(guildId, discordId) {
  return statements.openForUser.get(guildId, discordId);
}

// listByGuild + client-side filtering keeps this simple (ticket volume for a
// single Discord server is small enough that filtering ~500 rows in JS is
// instant) rather than building a dynamic SQL WHERE clause for every
// combination of status/category/claimed-by the dashboard might filter on.
function listForDashboard(guildId, { status, category, claimedBy, limit = 500 } = {}) {
  let rows = statements.listByGuild.all(guildId, limit).map((row) => ({ ...row, notes: parseNotes(row) }));
  if (status) rows = rows.filter((r) => r.status === status);
  if (category) rows = rows.filter((r) => r.category === category);
  if (claimedBy) rows = rows.filter((r) => r.claimed_by_discord_id === claimedBy);
  return rows;
}

function stats(guildId) {
  const byStatus = statements.countByStatus.all(guildId);
  const byCategory = statements.countByCategory.all(guildId);
  const avgRow = statements.avgResolutionSeconds.get(guildId);
  return {
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.count])),
    byCategory: Object.fromEntries(byCategory.map((r) => [r.category, r.count])),
    avgResolutionSeconds: avgRow && avgRow.avgSeconds ? Math.round(avgRow.avgSeconds) : null
  };
}

module.exports = { create, findByThreadId, claim, close, reopen, addNote, openTicketForUser, listForDashboard, stats };
