require('dotenv').config({ path: require('path').join(__dirname, '.env') });

// Deliberately no validation/process.exit here, even though DISCORD_BOT_TOKEN
// is required for the bot itself to run — this module is also pulled in by
// the *website's* /api/chat route (via assistant.js), and a missing Discord
// token must never be able to crash the storefront. Anything that actually
// needs TOKEN (index.js, deploy-commands.js) checks for it itself.
module.exports = {
  TOKEN: process.env.DISCORD_BOT_TOKEN || null,
  CLIENT_ID: process.env.DISCORD_CLIENT_ID || null,
  // Also doubles as "the home guild" for website-triggered actions (Verified
  // role sync on /api/discord link/unlink and on order fulfillment) — those
  // features silently no-op if this isn't set, since there's no other way to
  // know which guild's role to touch from a plain HTTP request.
  GUILD_ID: process.env.DISCORD_GUILD_ID || null,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || null,

  // Powers the website's "Connect Discord" account-linking flow
  // (server/routes/discordLink.js). From the Discord Developer Portal:
  // Applications -> your app -> OAuth2 -> Client Secret. OAUTH_REDIRECT_URI
  // must be added there too, under OAuth2 -> Redirects, byte-for-byte
  // identical (including http/https and trailing slash) or Discord rejects
  // the exchange. Linking is disabled (button greyed out, not broken) if
  // either is unset.
  OAUTH_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET || null,
  OAUTH_REDIRECT_URI: process.env.DISCORD_OAUTH_REDIRECT_URI || null,

  // Fixed names — /setup-server creates these if missing and every other
  // command looks them up by name via guildConfig (see models/guildConfig.js)
  // rather than hardcoding IDs, so the bot survives someone renaming/deleting
  // and re-running setup.
  VERIFIED_ROLE_NAME: 'Verified Customer',
  STAFF_ROLE_NAME: 'Staff',
  MOD_LOG_CHANNEL_NAME: 'mod-log',
  TICKET_ARCHIVE_CHANNEL_NAME: 'ticket-archive',
  SUPPORT_CHANNEL_NAME: 'support',

  // Auto-moderation thresholds. All configurable via env so an admin can
  // tune them without a code change; sensible defaults otherwise.
  AUTOMOD: {
    ENABLED: process.env.AUTOMOD_ENABLED !== 'false',
    MAX_MENTIONS: Number(process.env.AUTOMOD_MAX_MENTIONS) || 6,
    SPAM_MESSAGE_COUNT: Number(process.env.AUTOMOD_SPAM_COUNT) || 5,
    SPAM_WINDOW_MS: Number(process.env.AUTOMOD_SPAM_WINDOW_MS) || 7000,
    BLOCK_INVITE_LINKS: process.env.AUTOMOD_BLOCK_INVITES !== 'false'
  },

  // Caps how much a single Discord user or chat-widget session can spend on
  // the Claude API in one window — this is metered, so an unbounded loop is
  // a real cost risk, not just an abuse annoyance.
  ASSISTANT: {
    MAX_HISTORY_MESSAGES: 12,
    COOLDOWN_MS: 3000,
    MAX_MESSAGES_PER_WINDOW: 20,
    WINDOW_MS: 10 * 60 * 1000
  }
};
