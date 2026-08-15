const config = require('./config');

// In-memory conversation history per Discord DM/channel — the assistant API
// itself is stateless, so this is what makes follow-up questions coherent.
// Deliberately not persisted: losing chat history on a bot restart is fine,
// nothing here is a record of anything (unlike ticket transcripts, which are
// saved separately in models/tickets.js + transcript.js).
const conversations = new Map();

function append(key, role, content) {
  const history = conversations.get(key) || [];
  history.push({ role, content });
  const trimmed = history.slice(-config.ASSISTANT.MAX_HISTORY_MESSAGES);
  conversations.set(key, trimmed);
  return trimmed;
}

function get(key) {
  return conversations.get(key) || [];
}

function clear(key) {
  conversations.delete(key);
}

module.exports = { append, get, clear };
