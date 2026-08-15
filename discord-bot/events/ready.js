const { Events, ActivityType } = require('discord.js');
const guildConfig = require('../models/guildConfig');
const config = require('../config');

// The bot admin dashboard lives in the website's own HTTP process, which has
// no live gateway connection of its own — it only sees the SQLite database.
// This periodic heartbeat is how it gets real (if slightly delayed) status,
// latency, and guild stats instead of faking them: whoever is looking at the
// dashboard sees the age of the last heartbeat too, so a stopped bot process
// shows as stale/offline rather than silently showing old numbers forever.
function writeHeartbeat(client) {
  if (!config.GUILD_ID) return;
  const guild = client.guilds.cache.get(config.GUILD_ID);
  guildConfig.set(config.GUILD_ID, 'botStatus', {
    online: true,
    tag: client.user.tag,
    latencyMs: client.ws.ping,
    guildCount: client.guilds.cache.size,
    memberCount: guild ? guild.memberCount : null,
    channelCount: guild ? guild.channels.cache.size : null,
    updatedAt: new Date().toISOString(),
    processUptimeSeconds: Math.round(process.uptime())
  });
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`[discord-bot] Logged in as ${client.user.tag}`);
    client.user.setActivity('scripforge.net', { type: ActivityType.Watching });
    writeHeartbeat(client);
    setInterval(() => writeHeartbeat(client), 30_000);
  }
};
