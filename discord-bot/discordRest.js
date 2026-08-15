// Thin wrapper around discord.js's REST client for actions that need to
// happen from a plain HTTP request context (the website's /api/discord
// routes, order fulfillment) where there is no live gateway connection to
// piggyback on — just the bot token. Deliberately separate from index.js's
// gateway Client so requiring this module never opens a socket.
const { REST, Routes } = require('discord.js');
const config = require('./config');
const guildConfig = require('./models/guildConfig');

let rest = null;
function client() {
  if (!config.TOKEN) return null;
  if (!rest) rest = new REST({ version: '10' }).setToken(config.TOKEN);
  return rest;
}

// Adds or removes the "Verified Customer" role for a Discord user in the
// configured home guild. Best-effort and silent on failure (bot not in the
// guild, member left, role deleted, missing permission, GUILD_ID/role not
// configured yet) — this is a nice-to-have sync, not something that should
// ever surface as an error to a customer linking/unlinking their account.
async function syncVerifiedRole(discordId, { add }) {
  const restClient = client();
  if (!restClient || !config.GUILD_ID) return { skipped: true };

  const roleId = guildConfig.get(config.GUILD_ID, 'verifiedRoleId');
  if (!roleId) return { skipped: true };

  try {
    if (add) {
      await restClient.put(Routes.guildMemberRole(config.GUILD_ID, discordId, roleId));
    } else {
      await restClient.delete(Routes.guildMemberRole(config.GUILD_ID, discordId, roleId));
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { syncVerifiedRole };
