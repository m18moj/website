// Run manually after adding/changing a command: node discord-bot/deploy-commands.js
// Registers to a single guild (instant) if DISCORD_GUILD_ID is set, otherwise
// globally (can take up to an hour to show up everywhere).
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const config = require('./config');

const commandsDir = path.join(__dirname, 'commands');
const commands = fs
  .readdirSync(commandsDir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => require(path.join(commandsDir, f)).data.toJSON());

if (!config.TOKEN) {
  console.error('DISCORD_BOT_TOKEN is not set. Copy discord-bot/.env.example to discord-bot/.env and fill it in before starting the bot.');
  process.exit(1);
}

if (!config.CLIENT_ID) {
  console.error('DISCORD_CLIENT_ID is not set in discord-bot/.env — get it from the Discord Developer Portal (Application ID).');
  process.exit(1);
}

const rest = new REST().setToken(config.TOKEN);

(async () => {
  try {
    const route = config.GUILD_ID
      ? Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID)
      : Routes.applicationCommands(config.CLIENT_ID);

    const result = await rest.put(route, { body: commands });
    console.log(`[deploy-commands] Registered ${result.length} command(s)${config.GUILD_ID ? ' to guild ' + config.GUILD_ID : ' globally'}.`);
  } catch (err) {
    console.error('[deploy-commands] Failed:', err);
    process.exit(1);
  }
})();
