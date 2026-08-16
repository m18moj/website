require('dotenv').config({ path: require('path').join(__dirname, '.env') });

// Deliberately no validation/process.exit here for any of these, mirroring
// discord-bot/config.js — every agent and platform client checks what it
// needs itself and no-ops cleanly when unset, so a half-configured install
// still boots and runs the parts it can.
module.exports = {
  // Master kill switch — false (the default) still runs the scheduler and
  // lets campaigns move through strategy/script/creative/QA so the pipeline
  // can be exercised end-to-end, but blocks the two steps with real-world
  // consequences: nothing is ever actually posted to a platform, and
  // schedule_publish refuses to run. Flip to true only once you're ready to
  // go live.
  ENABLED: process.env.SOCIAL_ENABLED === 'true',
  // When true, publish_due_posts logs what it would have posted (title,
  // platform, video path) instead of calling the platform API — lets you
  // validate the full pipeline including real strategy/script/creative LLM
  // calls without ever putting a post on a live account.
  DRY_RUN: process.env.SOCIAL_DRY_RUN !== 'false',

  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || null,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',

  SITE_URL: process.env.SITE_URL || 'https://scripforge.net',

  // How often the job runner polls social_jobs for due work.
  POLL_INTERVAL_MS: Number(process.env.SOCIAL_POLL_INTERVAL_MS) || 10_000,
  // Max jobs claimed per poll tick.
  BATCH_SIZE: Number(process.env.SOCIAL_BATCH_SIZE) || 5,

  // How many evergreen (non-triggered) campaigns to start per day, split
  // evenly across the enabled platforms.
  EVERGREEN_PER_DAY: Number(process.env.SOCIAL_EVERGREEN_PER_DAY) || 2,

  YOUTUBE: {
    // Server-side API key, read-only — used for trend/discovery search only.
    API_KEY: process.env.YOUTUBE_API_KEY || null,
    CLIENT_ID: process.env.YOUTUBE_CLIENT_ID || null,
    CLIENT_SECRET: process.env.YOUTUBE_CLIENT_SECRET || null,
    // Minted once via `npm run social:youtube-auth` (social/scripts/youtube-oauth-setup.js).
    REFRESH_TOKEN: process.env.YOUTUBE_REFRESH_TOKEN || null,
    CHANNEL_ID: process.env.YOUTUBE_CHANNEL_ID || null
  },

  REDDIT: {
    // Public JSON endpoints need no auth — just a descriptive User-Agent
    // (Reddit API rules) and a subreddit list scoped to the niche
    // trendsAgent cares about. Both overridable per-deployment.
    USER_AGENT: process.env.REDDIT_USER_AGENT || 'scripforge-trend-scanner/1.0 (by /u/scripforge)',
    SUBREDDITS: (process.env.REDDIT_SUBREDDITS || 'roblox,RobloxDev,robloxgamedev').split(',').map((s) => s.trim()).filter(Boolean)
  },

  TIKTOK: {
    CLIENT_KEY: process.env.TIKTOK_CLIENT_KEY || null,
    CLIENT_SECRET: process.env.TIKTOK_CLIENT_SECRET || null,
    // Minted once via `npm run social:tiktok-auth` (social/scripts/tiktok-oauth-setup.js);
    // refreshed automatically thereafter (see platforms/tiktok.js).
    REFRESH_TOKEN: process.env.TIKTOK_REFRESH_TOKEN || null
  }
};
