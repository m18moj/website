// Early-signal source: message/reaction activity velocity in configured
// Roblox dev Discord servers/channels, via the Discord bot REST API
// (https://discord.com/developers/docs/resources/message#get-channel-messages).
// A spike in messages/reactions in an active Roblox-dev Discord often
// precedes a topic showing up as measurable view/search volume elsewhere, so
// this is meant as a leading indicator alongside the lagging ones (YouTube
// view counts, Reddit scores). Same { ok:false, reason } / { ok:true, items }
// convention as platforms/reddit.js; never throws.
//
// The bot only needs to be a member of the target server(s) with "Read
// Messages/View Channel" + "Read Message History" permission on the
// monitored channels — no privileged Message Content intent is required
// here since only counts/reactions/authors are read, not message text.
//
// Env vars (read inline, not via social/config.js):
//   DISCORD_BOT_TOKEN         - bot token from the Discord Developer Portal.
//                               Required.
//   DISCORD_SIGNAL_CHANNEL_IDS - comma-separated channel IDs to monitor
//                               (e.g. announcement/general-chat channels in
//                               Roblox dev servers the bot has joined).
//                               Required.
const API_BASE = 'https://discord.com/api/v10';

function botToken() {
  return process.env.DISCORD_BOT_TOKEN || null;
}

function channelIds() {
  return (process.env.DISCORD_SIGNAL_CHANNEL_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function isConfigured() {
  return Boolean(botToken()) && channelIds().length > 0;
}

async function fetchChannelMessages(channelId, token, limit) {
  const url = `${API_BASE}/channels/${channelId}/messages?limit=${limit}`;
  let res;
  try {
    res = await fetch(url, { headers: { Authorization: `Bot ${token}` } });
  } catch (err) {
    return { ok: false, reason: err.message };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false, reason: `HTTP ${res.status} ${body}`.trim() };
  }
  let messages;
  try {
    messages = await res.json();
  } catch (err) {
    return { ok: false, reason: `invalid JSON response: ${err.message}` };
  }
  return { ok: true, messages };
}

// Velocity = messages seen within lookbackHours, divided by the window size,
// so channels of different overall traffic levels are still comparable.
// Reaction totals and unique-author counts are included as a rough proxy for
// how much genuine back-and-forth (vs. one person posting repeatedly) is
// behind the message count.
async function fetchChannelActivity({ lookbackHours = 6, maxMessages = 100 } = {}) {
  if (!isConfigured()) return { ok: false, reason: 'not_configured' };
  const token = botToken();
  const cutoff = Date.now() - lookbackHours * 60 * 60 * 1000;

  const channels = [];
  const errors = [];

  for (const channelId of channelIds()) {
    const result = await fetchChannelMessages(channelId, token, maxMessages);
    if (!result.ok) {
      errors.push(`${channelId}: ${result.reason}`);
      continue;
    }

    const recent = result.messages.filter((m) => new Date(m.timestamp).getTime() >= cutoff);
    const authors = new Set(recent.map((m) => m.author?.id).filter(Boolean));
    const totalReactions = recent.reduce((sum, m) => sum + (m.reactions || []).reduce((s, r) => s + Number(r.count || 0), 0), 0);

    channels.push({
      channelId,
      messageCount: recent.length,
      uniqueAuthors: authors.size,
      totalReactions,
      velocityPerHour: Number((recent.length / lookbackHours).toFixed(2)),
      windowHours: lookbackHours
    });
  }

  if (!channels.length) return { ok: false, reason: errors.join('; ') || 'no channels returned results' };
  return { ok: true, items: channels, errors: errors.length ? errors : undefined };
}

module.exports = { isConfigured, fetchChannelActivity };
