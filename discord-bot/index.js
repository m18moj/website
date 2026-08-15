const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const config = require('./config');

if (!config.TOKEN) {
  console.error('DISCORD_BOT_TOKEN is not set. Copy discord-bot/.env.example to discord-bot/.env and fill it in before starting the bot.');
  process.exit(1);
}

// Bootstraps the shared DB connection (server/db.js runs its schema/migration
// setup on require) before anything else touches it.
require('./db');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // privileged — must be enabled in the Dev Portal
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // privileged — must be enabled in the Dev Portal
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message] // Channel partial is required to receive DMs
});

client.commands = new Collection();
const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsDir, file));
  if (command.data && command.execute) client.commands.set(command.data.name, command);
}

const eventsDir = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsDir).filter((f) => f.endsWith('.js'))) {
  const event = require(path.join(eventsDir, file));
  if (event.once) client.once(event.name, (...args) => event.execute(...args));
  else client.on(event.name, (...args) => event.execute(...args));
}

process.on('unhandledRejection', (err) => console.error('[discord-bot] Unhandled rejection:', err));

client.login(config.TOKEN);

function shutdown() {
  console.log('\n[discord-bot] Shutting down…');
  client.destroy();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
