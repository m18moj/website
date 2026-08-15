const { Events, ActivityType } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`[discord-bot] Logged in as ${client.user.tag}`);
    client.user.setActivity('scripforge.net', { type: ActivityType.Watching });
  }
};
