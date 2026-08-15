const fs = require('fs');
const path = require('path');

const TRANSCRIPT_DIR = path.join(__dirname, 'transcripts');
if (!fs.existsSync(TRANSCRIPT_DIR)) fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true });

// Plain-text transcript, newest-last, saved locally under discord-bot/transcripts/
// (gitignored — these can contain customer support conversations). Returns the
// path saved to, or null if the thread had nothing fetchable.
async function saveTranscript(thread) {
  const messages = await thread.messages.fetch({ limit: 100 });
  if (messages.size === 0) return null;

  const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const lines = sorted.map((m) => {
    const time = new Date(m.createdTimestamp).toISOString();
    const author = `${m.author.tag} (${m.author.id})`;
    const content = m.content || '(no text content)';
    return `[${time}] ${author}: ${content}`;
  });

  const fileName = `${thread.id}-${Date.now()}.txt`;
  const filePath = path.join(TRANSCRIPT_DIR, fileName);
  fs.writeFileSync(filePath, `Ticket transcript for #${thread.name} (${thread.id})\n\n${lines.join('\n')}\n`, 'utf8');
  return filePath;
}

module.exports = { saveTranscript, TRANSCRIPT_DIR };
