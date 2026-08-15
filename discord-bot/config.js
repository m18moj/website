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

  // Fixed names for the two roles /setup-server creates if missing (roles
  // aren't part of the server's pre-existing structure the way channels are,
  // so find-or-create-by-name is still correct here). Every other command
  // looks these up by ID via guildConfig (see models/guildConfig.js) once
  // /setup-server has stored them.
  VERIFIED_ROLE_NAME: 'Verified Customer',
  STAFF_ROLE_NAME: 'Staff',

  // Real channel IDs from this server's own channel list
  // (discord-bot/server-tree.txt). /setup-server wires the bot up to use
  // these EXISTING channels — it never creates new ones. Overridable via env
  // in case a channel is later recreated/renamed; these are public channel
  // identifiers, not secrets.
  PRODUCT_ANNOUNCE_CHANNEL_ID: process.env.DISCORD_PRODUCT_CHANNEL_ID || '1537738559518285845', // --STORE-- products
  CATALOGUE_CHANNEL_ID: process.env.DISCORD_CATALOGUE_CHANNEL_ID || '1537738562181791765', // --STORE-- pricing
  ANNOUNCEMENTS_CHANNEL_ID: process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID || '1537738542988664892', // --INFORMATION-- announcements
  GENERAL_CHANNEL_ID: process.env.DISCORD_GENERAL_CHANNEL_ID || '1537738574894600202', // --COMMUNITY-- general
  SUPPORT_CHANNEL_ID: process.env.DISCORD_SUPPORT_CHANNEL_ID || '1537738611150032896', // --SUPPORT-- open-ticket
  VIP_CHANNEL_ID: process.env.DISCORD_VIP_CHANNEL_ID || '1537738570410893354', // --STORE-- vip-lounge (verified-only)
  MOD_LOG_CHANNEL_ID: process.env.DISCORD_MOD_LOG_CHANNEL_ID || '1537738621291864084', // --STAFF-- mod-log
  TICKET_LOG_CHANNEL_ID: process.env.DISCORD_TICKET_LOG_CHANNEL_ID || '1537738622856593489', // --STAFF-- sales-log
  STAFF_CHAT_CHANNEL_ID: process.env.DISCORD_STAFF_CHAT_CHANNEL_ID || '1537738619404427284', // --STAFF-- staff-chat

  // Category channel a new text channel is created under whenever a paid
  // order includes a Discord bot, website, or SMM plan — see
  // discord-bot/serviceOrderTicket.js. Unlike the channel ids above this
  // isn't a channel that already existed on the server-tree.txt map; it was
  // given directly for this feature, so it has no server-tree.txt comment.
  CUSTOM_BUILDS_CATEGORY_ID: process.env.DISCORD_CUSTOM_BUILDS_CATEGORY_ID || '1538274290112405599',

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
