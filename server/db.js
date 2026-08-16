const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'scripforge.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
// WAL's default NORMAL sync still fsyncs on checkpoint but not on every
// commit; FULL fsyncs each commit too, trading a little write speed (this is
// a small local store, not a high-throughput one) for not losing the last
// few orders/signups if the process is killed abruptly rather than stopped
// cleanly with Ctrl+C.
db.exec('PRAGMA synchronous = FULL');

// Printed on every boot so it's obvious this is the same on-disk file every
// time (data persists across restarts) rather than something recreated fresh.
console.log(`[db] Using SQLite database at ${DB_PATH}`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_session_id TEXT UNIQUE,
    stripe_payment_intent TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'canceled', 'refunded')),
    total_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    paid_at TEXT
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    pack_id TEXT NOT NULL,
    pack_name TEXT NOT NULL,
    script_id TEXT NOT NULL,
    script_title TEXT NOT NULL,
    price_cents INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT NOT NULL PRIMARY KEY,
    sess TEXT NOT NULL,
    expire TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_username TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- What's actually for sale. Admin-editable at runtime (server/models/catalog.js)
  -- rather than the old hardcoded server/catalog.js file, which now only
  -- supplies one-time seed data (server/seedCatalog.js) for a first boot.
  CREATE TABLE IF NOT EXISTS packs (
    id TEXT PRIMARY KEY,
    pack_name TEXT NOT NULL,
    game_title TEXT NOT NULL,
    genre TEXT NOT NULL DEFAULT 'other',
    description TEXT NOT NULL DEFAULT '',
    splash TEXT NOT NULL DEFAULT 'custom',
    data_game TEXT NOT NULL DEFAULT '',
    detail_url TEXT,
    hidden INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- (pack_id, id) together are what a cart/order line item references — kept
  -- as stable, immutable slugs once created (renaming only ever changes
  -- pack_name/game_title/title, never the id) so existing carts, past orders,
  -- and the hand-authored game-*.html pages never break underneath an edit.
  CREATE TABLE IF NOT EXISTS scripts (
    pack_id TEXT NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    price_cents INTEGER NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (pack_id, id)
  );

  -- One row per successful sign-in (password or TOTP-completed), so the admin
  -- dashboard can show a real history instead of just the single most-recent
  -- login already on the users table.
  CREATE TABLE IF NOT EXISTS login_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip TEXT,
    user_agent TEXT,
    browser TEXT,
    os TEXT,
    device_type TEXT,
    accept_language TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Site-wide feature flags/settings, admin-editable at runtime (Admin ->
  -- Settings). One row per named setting, value stored as JSON so it can be
  -- a plain boolean or a small object (e.g. the announcement banner's text).
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Pack-level "save for later" list, per user. Deliberately pack-level (not
  -- per-script) to keep the feature simple; server-side and DB-backed so it
  -- follows the account across devices instead of living in localStorage.
  CREATE TABLE IF NOT EXISTS wishlist_items (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pack_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, pack_id)
  );

  -- One row per script actually purchased (created once an order is marked
  -- paid). The license key is what unlocks the download; device binding is a
  -- best-effort "one payment, one device" limit — see server/models/licenses.js
  -- for exactly what "device" means in a browser context and its limits.
  CREATE TABLE IF NOT EXISTS license_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT NOT NULL UNIQUE,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pack_id TEXT NOT NULL,
    script_id TEXT NOT NULL,
    device_fingerprint TEXT,
    activated_at TEXT,
    download_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS promo_codes (
    code TEXT PRIMARY KEY,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
    discount_value INTEGER NOT NULL,
    max_uses INTEGER,
    uses_count INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS promo_code_redemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL REFERENCES promo_codes(code) ON DELETE CASCADE,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- One review per user per pack (enforced by the primary key), and only
  -- accepted from someone who has actually paid for that pack — see
  -- server/models/reviews.js.
  CREATE TABLE IF NOT EXISTS reviews (
    pack_id TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (pack_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS bundles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    pack_ids TEXT NOT NULL,
    discount_percent INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Every download attempt against a license key, successful or not — the
  -- forensic trail behind the Admin -> Users -> license "Activity" view.
  CREATE TABLE IF NOT EXISTS license_download_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT NOT NULL,
    ip TEXT,
    device_fingerprint TEXT,
    user_agent TEXT,
    success INTEGER NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS error_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL CHECK (source IN ('server', 'client')),
    message TEXT NOT NULL,
    stack TEXT,
    url TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Discord account <-> ScripForge account mapping, created by the /verify
  -- flow in discord-bot/. One Discord account can only ever link to one
  -- ScripForge account (PK on discord_id); the reverse isn't enforced since
  -- someone could reasonably re-verify on a new Discord account.
  CREATE TABLE IF NOT EXISTS discord_links (
    discord_id TEXT PRIMARY KEY,
    discord_tag TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    linked_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Every moderation action taken by the Discord bot (warn/timeout/kick/ban),
  -- independent of Discord's own audit log so staff have a permanent,
  -- queryable history even if a member leaves and rejoins.
  CREATE TABLE IF NOT EXISTS mod_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    target_discord_id TEXT NOT NULL,
    target_tag TEXT NOT NULL,
    moderator_discord_id TEXT NOT NULL,
    moderator_tag TEXT NOT NULL,
    action_type TEXT NOT NULL CHECK (action_type IN ('warn', 'timeout', 'kick', 'ban', 'unban')),
    reason TEXT,
    duration_ms INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- One row per support ticket thread. order_id is optional context a user
  -- can attach when opening a ticket so staff see purchase details up front.
  CREATE TABLE IF NOT EXISTS support_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    thread_id TEXT NOT NULL UNIQUE,
    opener_discord_id TEXT NOT NULL,
    opener_tag TEXT NOT NULL,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'closed')),
    claimed_by_discord_id TEXT,
    claimed_by_tag TEXT,
    transcript_path TEXT,
    opened_at TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);
  CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_scripts_pack_id ON scripts(pack_id);
  CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON login_history(user_id);
  CREATE INDEX IF NOT EXISTS idx_wishlist_items_user_id ON wishlist_items(user_id);
  CREATE INDEX IF NOT EXISTS idx_license_keys_user_id ON license_keys(user_id);
  CREATE INDEX IF NOT EXISTS idx_license_keys_order_id ON license_keys(order_id);
  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_reviews_pack_id ON reviews(pack_id);
  CREATE INDEX IF NOT EXISTS idx_error_log_created_at ON error_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_license_download_log_key ON license_download_log(license_key);
  CREATE INDEX IF NOT EXISTS idx_mod_actions_target ON mod_actions(target_discord_id);
  CREATE INDEX IF NOT EXISTS idx_mod_actions_guild ON mod_actions(guild_id);
  CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
  CREATE INDEX IF NOT EXISTS idx_discord_links_user_id ON discord_links(user_id);
`);

// Adds a column to an existing table only if it isn't already there, so
// restarting the server after a schema change never touches — let alone
// loses — data already on disk. CREATE TABLE IF NOT EXISTS above only
// covers brand-new tables; existing ones need this to gain new columns.
function ensureColumn(table, column, definition) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all();
  if (existing.some((col) => col.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

ensureColumn('users', 'totp_secret', 'TEXT');
ensureColumn('users', 'totp_enabled', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'last_login_at', 'TEXT');
ensureColumn('users', 'last_login_ip', 'TEXT');
// Recovery codes for TOTP: JSON array of bcrypt hashes, each single-use.
// Never store the raw codes — only shown once, at generation time.
ensureColumn('users', 'totp_recovery_codes', 'TEXT');
// Mandatory, max 8 characters, shown everywhere in place of the (potentially
// long) username — see server/routes/account.js POST /nickname. Nullable at
// the schema level only so this additive migration never breaks existing
// rows; every account created after this shipped is required to set one
// during registration, and pre-existing accounts are prompted on next login.
ensureColumn('users', 'nickname', 'TEXT');
ensureColumn('orders', 'payment_provider', "TEXT NOT NULL DEFAULT 'stripe'");

// One-time cleanup for rows seeded back when pack detail pages were linked
// with a literal .html extension — the site now serves clean, extensionless
// URLs (see server/index.js), so any leftover suffix here would produce a
// dead link. Idempotent: a no-op once every row has already been migrated.
db.exec(`UPDATE packs SET detail_url = substr(detail_url, 1, length(detail_url) - 5) WHERE detail_url LIKE '%.html'`);
ensureColumn('orders', 'coinbase_charge_id', 'TEXT');
ensureColumn('orders', 'coinbase_charge_code', 'TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_coinbase_charge_id ON orders(coinbase_charge_id)');

// 2FA (TOTP) is available to every account, customer and admin alike — see
// server/routes/account.js. (Previously admin-only; that restriction has
// been lifted, so this file no longer wipes non-admin TOTP on boot.)

// Manual moderation: `disabled` is a single-click, no-paper-trail toggle for
// quick use; the ban_* columns are the more formal action (a reason, a
// duration, who did it), used together but tracked separately so the
// dashboard can show them as two distinct controls.
ensureColumn('scripts', 'description', "TEXT NOT NULL DEFAULT ''");
ensureColumn('scripts', 'category', "TEXT NOT NULL DEFAULT ''");
ensureColumn('users', 'disabled', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'ban_type', 'TEXT');
ensureColumn('users', 'ban_reason', 'TEXT');
ensureColumn('users', 'ban_expires_at', 'TEXT');
ensureColumn('users', 'banned_at', 'TEXT');
ensureColumn('users', 'banned_by', 'TEXT');

// Optional — accounts still don't require one to register or sign in (that
// design choice hasn't changed). Setting one just unlocks email-dependent
// features: password reset and order-receipt emails.
ensureColumn('users', 'email', 'TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL');

// What actually gets delivered after a purchase, and its version history —
// see server/models/catalog.js and the generated-scripts/ folder.
ensureColumn('scripts', 'version', "TEXT NOT NULL DEFAULT '1.0.0'");
ensureColumn('scripts', 'changelog', "TEXT NOT NULL DEFAULT '[]'");
ensureColumn('scripts', 'file_path', 'TEXT');
ensureColumn('scripts', 'file_ext', 'TEXT');
ensureColumn('scripts', 'preview_snippet', 'TEXT');

ensureColumn('orders', 'promo_code', 'TEXT');
ensureColumn('orders', 'discount_cents', 'INTEGER NOT NULL DEFAULT 0');

// is_test marks data an admin generated on purpose (QA, demos, staging
// checkout runs) so it can be excluded from real revenue/customer totals
// without deleting it. expires_at turns an admin-created account into a
// temporary one — checked alongside disabled/ban_* in getAccountBlock()
// rather than being swept by a background job, since simply refusing
// sign-in at expiry is enough and needs no cron/cleanup process.
ensureColumn('users', 'is_test', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'expires_at', 'TEXT');
ensureColumn('users', 'created_by', 'TEXT');
ensureColumn('orders', 'is_test', 'INTEGER NOT NULL DEFAULT 0');

// Optional per-code owner: when set, only that account may redeem the code —
// used for the one-time 15%-off code issued automatically when a customer
// verifies their Discord account (see server/models/promoCodes.js issueDiscordVerifyDiscount).
// `source` distinguishes admin-created codes from system-issued ones in the
// admin dashboard's Promo Codes list.
ensureColumn('promo_codes', 'owner_user_id', 'INTEGER');
ensureColumn('promo_codes', 'source', "TEXT NOT NULL DEFAULT 'manual'");

// Discord product-announcement dedupe: set the moment a pack is posted to the
// announcements channel so a restart/re-save never double-posts it. message_id
// lets the catalogue-channel sync edit the existing message instead of
// reposting when a pack's price/description changes.
ensureColumn('packs', 'discord_announced_at', 'TEXT');
ensureColumn('packs', 'discord_message_id', 'TEXT');

// member_verified_at is set once server-side guild-membership + role-grant
// succeeds (distinct from linked_at, which only means the OAuth identity
// match happened) — see discord-bot/discordRest.js isGuildMember() and
// server/routes/discordLink.js. discount_code records the one-time 15%-off
// code issued for this link so re-verifying never issues a second one.
ensureColumn('discord_links', 'member_verified_at', 'TEXT');
ensureColumn('discord_links', 'discount_code', 'TEXT');

// Ticket categories (one of the fixed set the "Get Support" flow now makes
// the opener choose — see discord-bot/ticketActions.js), staff notes (JSON
// array of {authorTag, text, at}), and reopen tracking.
ensureColumn('support_tickets', 'category', "TEXT NOT NULL DEFAULT 'general'");
ensureColumn('support_tickets', 'notes', "TEXT NOT NULL DEFAULT '[]'");
ensureColumn('support_tickets', 'reopened_at', 'TEXT');

// Free-text the customer can leave at checkout (desired domain name, custom
// feature requests, anything else) — surfaced to staff in the auto-opened
// Discord ticket for service orders (see discord-bot/serviceOrderTicket.js).
// service_ticket_channel_id records that ticket's channel once created, so a
// retried/duplicate fulfillment run never opens a second one for the same order.
ensureColumn('orders', 'customer_notes', 'TEXT');
ensureColumn('orders', 'service_ticket_channel_id', 'TEXT');

// Per-guild automod infractions — one row per rule violation, independent of
// mod_actions (which only logs formal warn/timeout/kick/ban) so escalating
// punishment thresholds can be computed from a clean count and the bot
// dashboard can show/filter automod activity on its own.
db.exec(`
  CREATE TABLE IF NOT EXISTS automod_infractions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    discord_id TEXT NOT NULL,
    discord_tag TEXT NOT NULL,
    rule TEXT NOT NULL,
    action_taken TEXT NOT NULL,
    message_excerpt TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_automod_infractions_guild_user ON automod_infractions(guild_id, discord_id);
  CREATE INDEX IF NOT EXISTS idx_automod_infractions_created_at ON automod_infractions(created_at);

  -- Every action taken from (or by) the dedicated bot admin dashboard, plus
  -- automod/announcement actions the bot takes on its own — kept separate
  -- from the website's audit_log (whose actor is always a ScripForge user
  -- account) since a bot action's "actor" is a Discord identity, a site
  -- admin working from the bot dashboard, or the system itself.
  CREATE TABLE IF NOT EXISTS bot_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT,
    actor_type TEXT NOT NULL DEFAULT 'system' CHECK (actor_type IN ('system', 'discord_user', 'site_admin')),
    actor_id TEXT,
    actor_label TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_bot_audit_log_created_at ON bot_audit_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_bot_audit_log_guild ON bot_audit_log(guild_id);
`);

// AI/Social automation (social/) — a separate long-running process, same DB
// file over SQLite WAL as everything else (same pattern discord-bot/ already
// uses), that turns catalog activity into TikTok/YouTube Shorts posts. See
// social/README.md for the full pipeline; these tables are the persistence
// layer only.
db.exec(`
  -- Generic persistent job queue: every recurring trigger and every pipeline
  -- stage is a row here, not an in-memory timer, so a process restart never
  -- loses or silently re-runs work. dedup_key plus the partial unique index
  -- below is the duplicate-protection mechanism — enqueuing the same
  -- dedup_key while a prior job with that key is still pending/running is a
  -- no-op (see social/jobQueue.js).
  CREATE TABLE IF NOT EXISTS social_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_type TEXT NOT NULL,
    dedup_key TEXT,
    payload_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed', 'cancelled')),
    run_at TEXT NOT NULL DEFAULT (datetime('now')),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    last_error TEXT,
    locked_by TEXT,
    locked_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_social_jobs_dedup_active ON social_jobs(dedup_key) WHERE dedup_key IS NOT NULL AND status IN ('pending', 'running');
  CREATE INDEX IF NOT EXISTS idx_social_jobs_status_run_at ON social_jobs(status, run_at);

  -- One row per piece of content moving through the strategy -> script ->
  -- creative -> video -> QA -> schedule -> publish pipeline (see
  -- social/orchestrator.js). pack_id is nullable because a campaign can be
  -- trend-driven rather than tied to one specific product.
  CREATE TABLE IF NOT EXISTS social_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('new_pack', 'trend', 'evergreen', 'manual')),
    pack_id TEXT REFERENCES packs(id) ON DELETE SET NULL,
    platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'youtube_shorts')),
    status TEXT NOT NULL DEFAULT 'strategy' CHECK (status IN (
      'strategy', 'scripting', 'creative', 'video_queued', 'video_rendering',
      'qa', 'qa_failed', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'
    )),
    strategy_json TEXT,
    script_json TEXT,
    creative_json TEXT,
    metadata_json TEXT,
    qa_json TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_social_campaigns_status ON social_campaigns(status);
  CREATE INDEX IF NOT EXISTS idx_social_campaigns_pack_id ON social_campaigns(pack_id);

  -- The hand-off contract with the separate video-generation pipeline (a
  -- different process/session entirely — see social/VIDEO_JOB_CONTRACT.md):
  -- this system writes a row with the full creative spec in input_json and
  -- status 'pending'; the video pipeline claims it, renders, and writes
  -- output_path + status='completed' (or 'failed' + error). Nothing in this
  -- codebase's video-generation code is touched — this table is the entire
  -- interface between the two systems.
  CREATE TABLE IF NOT EXISTS video_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES social_campaigns(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'rendering', 'completed', 'failed')),
    input_json TEXT NOT NULL,
    output_path TEXT,
    output_meta_json TEXT,
    claimed_by TEXT,
    claimed_at TEXT,
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    priority INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_video_jobs_status ON video_jobs(status);
  CREATE INDEX IF NOT EXISTS idx_video_jobs_campaign_id ON video_jobs(campaign_id);

  -- One row per actual post made to a platform. UNIQUE(campaign_id, platform)
  -- is the duplicate-publish guard — a retried/duplicate schedule_publish run
  -- can never create a second live post for the same campaign.
  CREATE TABLE IF NOT EXISTS social_publications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES social_campaigns(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'youtube_shorts')),
    platform_post_id TEXT,
    platform_url TEXT,
    title TEXT,
    description TEXT,
    -- For admin-approved posts (Video Studio → "Approve & schedule"), the
    -- rendered video lives directly on the publication row instead of a
    -- video_jobs contract row; publish_due_posts falls back to this path
    -- when no video_jobs.output_path exists for the campaign.
    output_path TEXT,
    scheduled_at TEXT,
    published_at TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'publishing', 'published', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (campaign_id, platform)
  );
  CREATE INDEX IF NOT EXISTS idx_social_publications_status_scheduled_at ON social_publications(status, scheduled_at);

  -- Periodic stat pulls per publication (views/likes/etc) — the raw material
  -- social/agents/analyticsLearningAgent.js turns into social_insights below.
  CREATE TABLE IF NOT EXISTS social_analytics_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    publication_id INTEGER NOT NULL REFERENCES social_publications(id) ON DELETE CASCADE,
    views INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0,
    comments INTEGER NOT NULL DEFAULT 0,
    shares INTEGER NOT NULL DEFAULT 0,
    saves INTEGER NOT NULL DEFAULT 0,
    watch_time_seconds INTEGER,
    raw_json TEXT,
    captured_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_social_analytics_snapshots_publication_id ON social_analytics_snapshots(publication_id);

  -- Distilled, reusable findings the learning half of analyticsLearningAgent
  -- writes (e.g. "hook style X outperforms Y for TikTok") and strategyAgent
  -- reads back before planning the next campaign — the optimization feedback
  -- loop the whole system is built around.
  CREATE TABLE IF NOT EXISTS social_insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    insight TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.5,
    supporting_data_json TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_social_insights_scope ON social_insights(scope);

  -- trendsAgent's findings, refreshed on a cron (see social/scheduler.js) and
  -- read by strategyAgent when planning trend-driven campaigns.
  CREATE TABLE IF NOT EXISTS social_trends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    topic TEXT NOT NULL,
    score REAL NOT NULL DEFAULT 0,
    raw_json TEXT,
    captured_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_social_trends_captured_at ON social_trends(captured_at);

  -- social/agents/trendForecastAgent.js's predictions of what a given trend
  -- source/topic will do over the next horizon_days days — the "what's going
  -- to happen next" half of trend intelligence, as opposed to social_trends
  -- (what IS happening) and momentum() (what's happening lately). Starts
  -- 'pending' and is resolved once its horizon passes by comparing the
  -- prediction against real momentum recomputed at resolution time; every
  -- resolution also writes an ai_scorecard row so the outcome feeds back into
  -- the next forecast prompt.
  CREATE TABLE IF NOT EXISTS trend_forecasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    topic TEXT NOT NULL,
    predicted_direction TEXT NOT NULL CHECK (predicted_direction IN ('rising', 'falling', 'flat')),
    confidence REAL NOT NULL,
    reasoning TEXT,
    based_on TEXT,
    horizon_days INTEGER NOT NULL DEFAULT 7,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'correct', 'incorrect', 'inconclusive')),
    actual_direction TEXT,
    resolution_notes TEXT,
    resolved_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_trend_forecasts_status ON trend_forecasts(status);

  -- The reward/punish ledger: one row per resolved prediction (trend forecast
  -- or video popularity prediction), regardless of which agent made it.
  -- social/models/scorecard.js reads this back into both agents' prompts as
  -- an explicit track record ("you were right X% of the time recently"),
  -- which is what actually closes the "reward if correct, punish if not"
  -- loop for an LLM-scored system — there's no gradient to update, so the
  -- reinforcement has to happen in-context via what the agent is shown next.
  CREATE TABLE IF NOT EXISTS ai_scorecard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent TEXT NOT NULL CHECK (agent IN ('trend_forecast', 'popularity_prediction')),
    subject_type TEXT NOT NULL,
    subject_id INTEGER NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('correct', 'incorrect', 'inconclusive')),
    predicted_value REAL,
    actual_value REAL,
    reward REAL NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_ai_scorecard_agent ON ai_scorecard(agent, created_at);

  -- Admin-triggered video renders (Video Studio tab, /video-admin) — separate
  -- from video_jobs above, which is the AI/social hand-off queue. This table
  -- belongs entirely to the admin-panel integration layer: it just shells out
  -- to the video pipeline's own npm scripts and records what happened, never
  -- touching that pipeline's internals.
  -- One row per connected social account (a TikTok or YouTube channel the
  -- automation is allowed to post to). Lets social/orchestrator.js fan a
  -- single piece of promo content out across many accounts instead of the
  -- one-account-per-platform env-var setup social/config.js still supports
  -- as the zero-accounts-configured fallback. credentials_json holds
  -- whatever platforms/tiktok.js or platforms/youtube.js needs to mint an
  -- access token for this specific account (client id/secret, refresh
  -- token, channel/open id) — same trust boundary as .env secrets already
  -- had, just DB-backed so more than one set can coexist. last_used_at
  -- drives round-robin/cadence selection across accounts of the same
  -- platform (see social/models/accounts.js).
  CREATE TABLE IF NOT EXISTS social_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'youtube_shorts')),
    label TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    -- Optional JSON array of pack ids this account should promote; NULL/empty
    -- means "any pack" (the account participates in every trigger).
    niche_pack_ids TEXT,
    credentials_json TEXT NOT NULL DEFAULT '{}',
    last_used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_social_accounts_platform_enabled ON social_accounts(platform, enabled);

  CREATE TABLE IF NOT EXISTS video_admin_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('tiktok', 'shorts', 'promo', 'website')),
    pack_id TEXT,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    command TEXT NOT NULL,
    log TEXT NOT NULL DEFAULT '',
    output_path TEXT,
    qa_json TEXT,
    error TEXT,
    pid INTEGER,
    triggered_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_video_admin_jobs_status ON video_admin_jobs(status);
  CREATE INDEX IF NOT EXISTS idx_video_admin_jobs_created_at ON video_admin_jobs(created_at);
`);

// Existing databases (created before output_path existed) gain the column on
// boot without a destructive migration — see ensureColumn above.
ensureColumn('social_publications', 'output_path', 'TEXT');
// The creative-config an admin-triggered render actually used — nullable
// (older rows predate these columns), and joined against
// social_publications.output_path at read time (server/routes/videoAdmin.js
// GET /intelligence) to correlate real post performance with the pacing/
// length/video-type/quality choices that produced it, without adding any
// coupling to the social/ subsystem's own tables.
ensureColumn('video_admin_jobs', 'quality', 'TEXT');
ensureColumn('video_admin_jobs', 'pacing', 'TEXT');
ensureColumn('video_admin_jobs', 'length', 'TEXT');
ensureColumn('video_admin_jobs', 'angle', 'TEXT');

// Extra render customization — speech speed/animation "flashiness" tiers
// (video/pipeline/config/speed.mjs, animation.mjs) plus the
// captions/TTS/music on-off toggles and beat-matched-editing flag (see
// video/pipeline/orchestrate.mjs). Nullable/boolean-as-INTEGER so older rows
// (rendered before these options existed) just read back as "unknown" —
// server/routes/videoAdmin.js treats a null the same as the tier/toggle's
// default when displaying history.
ensureColumn('video_admin_jobs', 'speed', 'TEXT');
ensureColumn('video_admin_jobs', 'animation_intensity', 'TEXT');
ensureColumn('video_admin_jobs', 'captions_enabled', 'INTEGER');
ensureColumn('video_admin_jobs', 'tts_enabled', 'INTEGER');
ensureColumn('video_admin_jobs', 'music_enabled', 'INTEGER');
ensureColumn('video_admin_jobs', 'beat_match', 'INTEGER');

// Popularity-prediction gate (social/agents/predictionAgent.js, called from
// both social/orchestrator.js for AI-authored campaigns and
// server/routes/videoAdmin.js for admin-triggered renders) — a predicted
// 0-100 score plus the full structured reasoning, computed once a video is
// ready but before it's scheduled/kept, so low scorers can be ranked and
// automatically redone. redo_of chains a redo render back to the original
// job it replaced (server/routes/videoAdmin.js only; AI-authored redoes are
// tracked via social_campaigns.retry_count instead, since they reuse the
// same campaign row rather than creating a new one).
ensureColumn('social_campaigns', 'predicted_score', 'REAL');
ensureColumn('social_campaigns', 'prediction_json', 'TEXT');
ensureColumn('video_admin_jobs', 'predicted_score', 'REAL');
ensureColumn('video_admin_jobs', 'prediction_json', 'TEXT');
ensureColumn('video_admin_jobs', 'redo_of', 'INTEGER REFERENCES video_admin_jobs(id) ON DELETE SET NULL');
// Which connected social_accounts row (if any) this campaign posts as —
// NULL means the legacy single-account-via-env-vars path (social/config.js).
ensureColumn('social_campaigns', 'account_id', 'INTEGER REFERENCES social_accounts(id) ON DELETE SET NULL');

// The trend/momentum snapshot strategyAgent actually saw when it planned this
// campaign (social/orchestrator.js runStrategy) — captured at decision time
// rather than reconstructed later, since momentum() only ever answers "as of
// now". This is what lets analyticsLearningAgent later ask "did campaigns
// planned while a trend was rising actually outperform the ones planned
// while it was flat/falling?" with real, verifiable data instead of a guess.
ensureColumn('social_campaigns', 'trend_context_json', 'TEXT');
// Set once a published campaign's real analytics have had time to settle
// (see analyticsLearningAgent.resolvePredictions) — whether the popularity
// prediction made before publishing turned out right, wrong, or
// inconclusive (too little comparable history to judge). NULL means not yet
// resolved (either unpublished, or published too recently).
ensureColumn('social_campaigns', 'prediction_outcome', 'TEXT');

// First-boot only: if the catalog tables are empty, load the original
// hand-authored packs/scripts (server/seedCatalog.js) so existing installs
// don't lose their storefront when this database-backed catalog replaces the
// old static server/catalog.js file. Any boot after that reads/writes only
// the database — this block never runs again once packs exist.
const packCountRow = db.prepare('SELECT COUNT(*) AS count FROM packs').get();
if (packCountRow.count === 0) {
  const SEED_CATALOG = require('./seedCatalog');
  const insertPack = db.prepare(`
    INSERT INTO packs (id, pack_name, game_title, genre, description, splash, data_game, detail_url, sort_order)
    VALUES (@id, @packName, @gameTitle, @genre, @description, @splash, @dataGame, @detailUrl, @sortOrder)
  `);
  const insertScript = db.prepare(`
    INSERT INTO scripts (pack_id, id, title, description, category, price_cents, sort_order)
    VALUES (@packId, @id, @title, @description, @category, @priceCents, @sortOrder)
  `);
  SEED_CATALOG.forEach((pack, packIndex) => {
    insertPack.run({
      id: pack.packId,
      packName: pack.packName,
      gameTitle: pack.gameTitle,
      genre: pack.genre,
      description: pack.description,
      splash: pack.splash,
      dataGame: pack.dataGame,
      detailUrl: pack.detailUrl || null,
      sortOrder: packIndex
    });
    pack.scripts.forEach((script, scriptIndex) => {
      insertScript.run({
        packId: pack.packId,
        id: script.id,
        title: script.title,
        description: script.description || '',
        category: script.category || '',
        priceCents: Math.round(script.price * 100),
        sortOrder: scriptIndex
      });
    });
  });
  console.log(`[db] Seeded catalog with ${SEED_CATALOG.length} packs from server/seedCatalog.js`);
}

// node:sqlite's DatabaseSync has no built-in transaction helper (unlike
// better-sqlite3), so this mirrors better-sqlite3's db.transaction(fn) API:
// it returns a new function that, when called, runs fn inside BEGIN/COMMIT
// and rolls back on any error.
function transaction(fn) {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
}

// Migration: ai_scorecard agent CHECK constraint needs 'ensemble_forecast'
// added to support the ensemble forecast agent (social/agents/ensembleForecastAgent.js).
// SQLite doesn't support ALTER TABLE to modify CHECK constraints, so this
// recreates the table with the updated constraint and copies all existing data.
// Idempotent: only runs if the current constraint doesn't include 'ensemble_forecast'.
(function migrateScorecardConstraint() {
  try {
    // Test if the current constraint accepts 'ensemble_forecast' — if it does,
    // no migration needed. We INSERT then immediately DELETE inside a transaction
    // that gets rolled back, so no data is ever actually written.
    db.exec("BEGIN");
    try {
      db.prepare("INSERT INTO ai_scorecard (agent, subject_type, subject_id, outcome, reward) VALUES ('ensemble_forecast', 'test', 0, 'inconclusive', 0)").run();
      db.prepare("DELETE FROM ai_scorecard WHERE subject_type = 'test' AND subject_id = 0").run();
      db.exec("ROLLBACK");
      // Constraint already includes 'ensemble_forecast' — nothing to do
    } catch (e) {
      db.exec("ROLLBACK");
      // Constraint doesn't include 'ensemble_forecast' — migrate the table
      console.log('[db] Migrating ai_scorecard to add ensemble_forecast to agent CHECK constraint…');
      db.exec(`
        CREATE TABLE ai_scorecard_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent TEXT NOT NULL CHECK (agent IN ('trend_forecast', 'popularity_prediction', 'ensemble_forecast')),
          subject_type TEXT NOT NULL,
          subject_id INTEGER NOT NULL,
          outcome TEXT NOT NULL CHECK (outcome IN ('correct', 'incorrect', 'inconclusive')),
          predicted_value REAL,
          actual_value REAL,
          reward REAL NOT NULL,
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO ai_scorecard_new (id, agent, subject_type, subject_id, outcome, predicted_value, actual_value, reward, notes, created_at)
          SELECT id, agent, subject_type, subject_id, outcome, predicted_value, actual_value, reward, notes, created_at FROM ai_scorecard;
        DROP TABLE ai_scorecard;
        ALTER TABLE ai_scorecard_new RENAME TO ai_scorecard;
        CREATE INDEX idx_ai_scorecard_agent ON ai_scorecard(agent, created_at);
      `);
      console.log('[db] ai_scorecard migration complete.');
    }
  } catch (err) {
    console.error('[db] ai_scorecard migration check failed (non-fatal):', err.message);
  }
})();

module.exports = db;
module.exports.transaction = transaction;
