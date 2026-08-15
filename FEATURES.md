# ScripForge — Feature Manual

Everything the site can do, organized by area. This is a living reference, not a changelog — if you add or change a feature, update the relevant section here too.

## 1. Storefront (customer-facing)

- **Home, Games, and Catalog pages** — browse all script packs. The Catalog page is fully dynamic (pulls live from the database via `/api/catalog`), so admin-created packs actually appear there; the original nine games also have hand-built landing pages under `games/`.
- **Popular Game Libraries (homepage)** — a curated top 6, laid out 2 rows × 3 columns (`.game-grid-popular`), with richer cards (best-seller badges, a secondary "View client" link where a real client exists) and a "View Full Catalogue" button below linking to the full Catalog page, where the rest of the games and every admin-added pack live.
- **Search** — lives only at the top of the Catalog page now (`#catalogSearch`, next to the genre/price filters), live-filtering the grid and pre-fillable via a `?q=` deep link. The old duplicate search box that used to float in every page's navbar has been removed to declutter it.
- **Navbar** — decluttered: no persistent sign-in/account controls or search box on the top bar across the site anymore. Signed-in users get a compact nickname + circular avatar chip (links to Account settings) at the top of the Catalog page specifically (physically relocated there by `js/catalog-page.js`, not duplicated); the mobile hamburger dropdown still carries a compact account section (nickname/Downloads/Admin/Log out) so mobile users can reach it from anywhere. Nicknames are capped at 8 characters specifically so this chip can never break the layout the way a long username could.
- **Mobile menu** — the hamburger dropdown now locks page scroll while open, closes automatically when a link inside it is tapped or Escape is pressed, and has a 44px-minimum tap target.
- **Custom scrollbar** — themed to the site's cyan/purple palette in both light and dark mode (Firefox via `scrollbar-color`, Chrome/Edge/Safari via `::-webkit-scrollbar`).
- **Per-script selection** — every pack's page lets you check/uncheck individual scripts rather than forcing an all-or-nothing purchase. The whole script card is clickable, not just the checkbox.
- **Code preview** — catalog cards have a "Preview code" toggle showing a real excerpt of that pack's script, so a buyer can see actual code quality before paying.
- **Basket** — kept in the browser (`localStorage`) while shopping, organized per pack, with per-item and per-pack removal. The cart-count badge in the nav always reflects the real item count.
- **Multi-currency** — GBP by default, switchable to USD/EUR from the nav. Display-only on the client; the server always recomputes and charges the real amount from its own catalog data, so the currency picker can never be used to change what gets billed.
- **Light / dark theme** — a toggle in the nav, remembered per browser. Dark is the default; every color in the site is a CSS variable, so the whole UI re-themes from one switch.
- **Promo codes** — an input on the checkout page; a valid code's discount is spread across every line item so the itemized receipt still sums exactly to the discounted total.
- **Bundles** — an admin-defined discount that applies automatically when a basket's packs exactly match a bundle's pack list. No code to type — it just applies.
- **"You may also like"** — the checkout page suggests a few packs not already in the basket.
- **Reviews** — signed-in customers who've actually paid for a pack can leave a 1-5 star rating and comment from their Account page; admins can view and moderate them per pack.
- **Checkout** — pay by card (Stripe Checkout) or crypto (NOWPayments hosted invoice). Both build the charge entirely from server-side catalog data — a tampered request can't change the price.
- **Thank-you page** — once payment is confirmed, shows a "Next steps" panel (Download your scripts, Check your order, Join the community) alongside the itemized order summary, plus a Discord join button and "Continue shopping" in the page actions.
- **Wishlist** *(toggleable, see §6)* — signed-in customers can save a pack from a heart icon on the catalog page; saved packs show on the Account page under "Saved packs." Server-side and per-account, not just a local browser list.
- **"New" badges** *(toggleable)* — packs created in the last 14 days get a green "New" chip on the catalog listing.
- **Announcement banner** *(toggleable)* — an admin-editable dismissible bar shown below the nav on every page.
- **Maintenance mode** *(toggleable)* — when on, every customer-facing page shows a full-page "down for maintenance" overlay and the API refuses browsing/checkout/account actions for anyone who isn't a signed-in admin.
- **Accounts** — username + password (no email required to register or sign in). Self-service registration and login, protected by a self-hosted CAPTCHA (arithmetic question, no third-party service). An email address is optional and only unlocks password reset + order-receipt emails.
- **Forgot password** — for accounts with an email on file: a time-limited reset link is emailed; accounts without one are told to reach out on Discord instead of being left stuck.
- **Downloads page** — every script from a paid order, with a Download button, version number, and activation status. This is the actual product handoff — see §4.
- **Account page** — order history (with itemized receipts), saved packs, reviews you can leave on what you've bought, email/password settings.
- **Discord-based support** — every "Support"/"Contact" link points at Discord rather than a ticket system.

## 2. Accounts & Security

- **Passwords** — bcrypt-hashed (12 rounds). Dummy-hash comparison on unknown usernames so response timing can't be used to enumerate accounts.
- **CAPTCHA** — required on every register/login attempt. Self-hosted arithmetic question, one-time use (deleted from the session the moment it's checked).
- **Mandatory nickname** — every account has a nickname, max 8 characters, required at registration (`server/models/users.js` `NICKNAME_PATTERN`). Shown across the site (navbar, account page) instead of the username, which can be much longer. Accounts created before this shipped are prompted to set one on their next Account page visit (`js/account-page.js` auto-opens the nickname form when it's still unset) — this is additive at the schema level (nullable column) so no existing data was touched, but the app layer treats it as required going forward.
- **Account lockout** — 5 wrong passwords *or* wrong 2FA codes locks the account for 15 minutes.
- **Two-factor authentication (TOTP)** — available to **every account**, not just admins. Account page → Security → Enable 2FA (`POST /api/account/2fa/setup|enable|disable`), or Admin Dashboard → My Security for admins specifically. RFC 6238-compliant, implemented against Node's `crypto` module directly (no third-party TOTP library). Setup shows a real scannable QR code (generated server-side with the `qrcode` npm package — no external service call, no data leaves the server) plus the manual secret as a fallback. Enabling generates 10 single-use recovery codes (bcrypt-hashed at rest, shown once, format `XXXX-XXXX`) accepted at the login TOTP prompt in place of a 6-digit code; regenerating invalidates the old set and requires the account password.
- **Password reset** — tokens are random (32 bytes), only their SHA-256 hash is ever stored, and they expire after 30 minutes and are single-use. Rate-limited separately from login (6/hour) since it triggers an email send.
- **Bans** — an admin can suspend an account for 24 hours, 7 days, 30 days, or permanently, with an optional reason. A ban kills any already-open session immediately, not just future logins. Temporary bans auto-expire.
- **Disable** — a quick, no-reason, single-click account toggle, separate from bans, for fast use (e.g., "pause this account while I look into something").
- **Sessions** — server-side (SQLite-backed), httpOnly, SameSite cookies, regenerated on every privilege change (register, login, 2FA-verified) to prevent session fixation.
- **CSRF protection** — every state-changing request requires a token issued to the session.
- **Admin re-verification** — admin status is re-checked against the database on every request, not cached in the session, so a demoted or banned admin loses access immediately.
- **No web-based admin promotion** — granting admin access is only ever possible via the `create-admin` CLI run locally on the server. The old dashboard "Make Admin" button and its underlying API capability have been removed entirely (not just hidden) — `PATCH /api/admin/users/:id/role` can now only demote an admin to customer, never the reverse.

## 3. Payments

- **Stripe** (card) — Stripe Checkout Sessions, webhook-confirmed (`checkout.session.completed`), signature-verified against the raw request body.
- **NOWPayments** (crypto) — hosted invoice page, webhook-confirmed (IPN), signature verified via HMAC-SHA512 over the sorted JSON body. Fails closed: an unverifiable webhook never marks an order paid.
- **Currency conversion** — server-authoritative (`server/currency.js`), fixed rate table (GBP/USD/EUR), applied per line item so the receipt always sums correctly.
- **Promo codes / bundle discounts** — computed and validated entirely server-side (`server/models/promoCodes.js`, `server/models/bundles.js`); the discount is spread proportionally across every line item so nothing has to be trusted from the client.
- **Order lifecycle** — pending → paid (or failed/canceled/refunded, settable by an admin). The thank-you page polls for confirmation since crypto payments confirm on-chain, not instantly.
- **Order fulfillment** (`server/orderFulfillment.js`) — the single place that runs the moment any order becomes 'paid', from either webhook or an admin's manual status change: issues one license key per purchased script, and emails a receipt if the buyer has an email on file.

## 4. Script Delivery & Licensing

This is the actual product handoff — a paid order results in real files a customer can download, not just a confirmed payment.

- **Real files**: every one of the 180 scripts across the 9 games (20 per game, up from the original 10) has an actual source file in `generated-scripts/<packId>/<scriptId>.<ext>` — Java (Minecraft, Bukkit/Spigot), Luau (Roblox), C# (GTA V, via ScriptHookVDotNet for single-player), Papyrus (Skyrim, via Creation Kit), and Unreal-style C# gameplay templates for single-player prototypes for the games with no legitimate third-party modding API (Apex, Call of Duty, Fortnite, PUBG, Valorant) — those are explicitly framed in their own header comments as original templates for building a similar system in your own game, not modifications of the commercial title.
- **License keys** — one per purchased script, generated the moment an order is marked paid (`server/models/licenses.js`), **fully automatically** — `server/orderFulfillment.js` fires the instant a Stripe or NOWPayments webhook confirms payment, with no admin step in that path at all (an admin manually changing an order's status also triggers it, purely as a fallback for edge cases like an offline/manual payment). Self-verifying: the format is `SF-XXXXXXXX-XXXXXXXX-CCCCCCCC`, where the last group is an HMAC-SHA256 checksum over the random part, so a tampered or guessed key is rejected instantly without a database lookup.
- **Download manager — one button, one zip** (`GET /api/downloads/zip`, `js/downloads.js`) — the Downloads page has exactly one "Download all" button. It streams every script the signed-in customer owns, watermarked individually, into a single zip (built with `archiver`, organized one folder per pack) with a `README.txt` manifest listing what's inside and, if anything's still pending a file, what's coming. Nothing is pre-generated or stored on disk — the zip is built fresh, in memory, per request.
- **"One payment, one device"** — the first zip download from a browser binds every license in it to a randomly generated id kept in that browser's `localStorage`. A later request from a different browser/id is refused entirely (with a clear message identifying it's a device conflict) rather than silently dropping just the conflicting file. This is a soft deterrent, not a hard guarantee — there's no real hardware identifier available to a plain web page, so clearing site data or using another browser gets a new id. An admin can reset a license's device binding from that customer's detail panel (Users → Details → Licenses) for legitimate cases like a new PC.
- **Per-download watermarking** — every file's content is prefixed at download time with a syntax-appropriate comment block identifying the licensee, license key, order, and download timestamp. Not baked into the file on disk — generated fresh on every zip request.
- **Anti-abuse on the download endpoints** — the zip endpoint has its own tighter rate limiter (10 requests/15 min, separate budget from other API traffic — it's a much heavier operation per request than a single file), a hard per-license download cap (50, incremented for every license included each time the zip is requested), and full attempt logging (IP, device fingerprint, user agent, success/refusal reason) to `license_download_log`, visible to admins from a license's "Activity" panel (Users → Details → Licenses → Activity).
- **Versioning & changelog** — every script has a version number and a changelog array, seeded with an initial 1.0.0 entry when its file was linked. Admins can add new changelog entries from the Catalog tab as scripts are updated.
- **Code preview** — the first ~25 lines of each script's file (its header plus a bit of real code) are stored as a `preview_snippet` and shown publicly on the catalog page — enough to demonstrate quality without giving away the whole file before purchase.

## 5. Clients

Every game pack now has a "Client" — a linked page (`pages/client-<pack>.html`) reachable from a button on that game's pack page, styled as a desktop-app window (`css/client.css`) for a consistent look across all nine.

**Six cosmetic previews** (Apex, Call of Duty, Fortnite, PUBG, Roblox, Valorant) — for these games there's no legitimate third-party modding/injection path, so their client is an organizer/browser: a "ForgeClient" desktop-app-styled page listing the pack's 12 standout scripts (of 20) with a Components/About tab layout. It's explicitly, visibly labeled as preview-only in its own on-page notice: it does not connect to, inject into, or modify the game it's themed after. Generated from the live script-card markup on each game page (`scripts/content-refresh/build-client-pages.js`), so it can never drift out of sync with the actual catalog.

**Three real, working clients** — for the three games with an actual sanctioned modding/scripting path, the client is genuine functioning code, not a preview:
- **GTA V — ForgeClient menu** (`generated-clients/gta-v/`): an in-game settings menu built on Script Hook V .NET, opened with F9, that lists and toggles every script in the pack live, with submenus for Weather/Parachute/Wanted Level settings. Single-player only — the code and its README both say so explicitly, since modifying GTA Online violates Rockstar's terms of service.
- **Skyrim — ForgeClient MCM** (`generated-clients/skyrim/`): a standard SkyUI Mod Configuration Menu (Papyrus, extends `SKI_ConfigBase`) with four in-game pages of toggles/sliders/dropdowns for the pack's scripts, plus the `.ini` SkyUI needs to list it. Ships as source (`.psc`) — the README is explicit that it must be compiled with the Creation Kit before it will run, same as any Papyrus mod.
- **Minecraft — ForgeClient Plugin Manager** (`generated-clients/minecraft/`): a standalone Java Swing desktop app (no dependencies beyond the JDK) that lists, enables/disables, and inspects the `plugin.yml` metadata of compiled plugin JARs in a server's `plugins/` folder. It manages files on disk only — it never connects to or modifies a running server. Compiles cleanly with `javac` (verified against JDK 17 while building it).

Each real client's own `README.md` (shipped alongside its code) has the full install/compile walkthrough; the site's client page for it shows a condensed version plus the file list.

## 6. Catalog Management (Admin → Catalog)

The catalog is fully database-backed (`packs`/`scripts` tables) — this is the actual data checkout prices every order from, so admin changes take effect immediately.

- **Packs**: create, rename, edit (game title, genre, description, optional detail-page URL), hide, or delete.
- **Scripts**: add, rename, re-describe, re-price, re-categorize, hide, or delete, within any pack. Add changelog entries as the underlying file changes.
- **Hide vs. delete**: hiding is reversible and keeps the data — a hidden pack/script simply can't be browsed or bought. Deleting is permanent (past orders that included it are unaffected, since order receipts store their own snapshot of what was bought).
- **New packs without a hand-built detail page** get a "quick add" button on the catalog listing instead of a "View pack" link, so they're still genuinely purchasable.
- Script ids are immutable once created (only the display title/description/price change on a rename) — this is what keeps existing baskets, past orders, and issued license keys from breaking underneath an edit.

## 7. Feature Flags (Admin → Settings)

Toggle these live, no restart required:

| Flag | Effect when on |
|---|---|
| Maintenance mode | Customer-facing pages show a full-page overlay; the API blocks browsing/checkout/account actions for non-admins. |
| Wishlist | Customers can save packs; hidden entirely (404 on the API, no UI) when off. |
| "New" badges | Packs created in the last 14 days get a "New" chip on the catalog page. |
| Announcement banner | A dismissible message bar shows below the nav on every page (text is admin-editable). |

Adding a new flag is a one-line change in `server/models/settings.js` (`DEFAULTS`), plus wiring it into whatever it should affect.

## 8. Admin Dashboard

- **Dashboard** — user/admin/order counts, revenue by currency, a 14-day sales-activity bar chart (order counts, not revenue — see note below), a best-selling-packs chart, system status, and the 5 most recent orders.
- **Users** — every account, with a live status badge (Active/Locked/Disabled/Banned) and a 🛒 Buyer badge for anyone with a completed order. Search box filters the table instantly. Click "Details" to expand:
  - Purchase history (every order, itemized, with date and amount)
  - Licenses (every script they've been issued a key for, activation status, and a "Reset device" button)
  - Login history (date, IP, browser, OS, device type — parsed server-side from the request headers a browser already sends; no fingerprinting script, no third-party IP lookups)
  - Moderation history (every role change, unlock, ban, unban, disable, enable ever applied to this account, pulled from the audit log)
  - Ban/unban and disable/enable controls
  - Role control (admin → customer only — see §2; there is no way to grant admin from here), unlock, delete
- **Orders** — every order, searchable, with an inline status changer and an expandable itemized view. "Export CSV" downloads the full order list.
- **Catalog** — see §6.
- **Promo Codes** — create percent or fixed-amount codes, with optional max-uses and expiry; enable/disable/delete.
- **Bundles** — group 2+ packs with a discount percent; the discount applies automatically at checkout, no code needed.
- **Reviews** — pick a pack, see every review on it, delete any that shouldn't be there.
- **Audit Log** — every admin action across the whole site, most recent first (role changes, unlocks, deletes, order status changes, bans, catalog edits, settings changes, promo/bundle changes, admin logins, 2FA changes).
- **Error Log** — both server-side errors and reported client-side JavaScript errors, most recent first, with a 24-hour count and a clear-log action.
- **Settings** — see §7.
- **My Security** — the signed-in admin's own password and 2FA, self-service.
- **System Status** — real, live values only, nothing simulated: app version, Node version, environment, platform/CPU, uptime, memory usage, database file size, active session count, user/admin counts, catalog size, and whether Stripe/NOWPayments are configured.

**Why order-count charts instead of revenue charts:** orders can be placed in GBP, USD, or EUR. Summing raw amounts across currencies produces a meaningless number, so anywhere the dashboard shows a trend over time or a "top" ranking, it counts orders/items rather than adding currencies together. The currency-safe revenue totals (grouped by currency, never summed) are still shown as plain stats on the Dashboard and in each user's purchase summary.

## 9. Discord Integration

Shares the website's SQLite database directly (`discord-bot/db.js` just re-exports `server/db.js`) — no separate data store, no separate migrations.

- **Account verification** — two paths to the same outcome: the `/verify` slash command (email lookup, rate-limited against enumeration) or the website's "Connect Discord" button (real Discord OAuth2, `server/routes/discordLink.js`). Both are membership-gated **server-side**: the Verified Customer role is only ever granted after `discord-bot/discordRest.js` `isGuildMember()` confirms, via the bot's own REST token, that the account is actually in the configured guild — never trusted from a client claim. A "Verify" button (Discord-style, `ButtonStyle.Link`) is included in the new-member onboarding DM and pinned in #general by `/setup-server`, pointing at the Account page.
- **Welcome discount on verify** — the moment membership is confirmed (via `/verify`, the OAuth callback, or joining the server after having already linked), a unique, 15%-off, 7-day, single-use promo code is issued (`server/models/promoCodes.js` `issueDiscordVerifyDiscount`), tied to that one account (`promo_codes.owner_user_id`) and rejected at checkout for anyone else. Idempotent — re-verifying never issues a second code.
- **New-product announcements** — creating a pack, or un-hiding one for the first time, posts a rich embed (name, game, script count, price range, image-free but store-linked) to the product-announcement channel. Duplicate-safe: `packs.discord_announced_at` is checked before every post, so a retry or a second admin editing the same pack can never double-announce.
- **Full-catalogue sync** — a single message in the catalogue channel is kept up to date by editing it in place (not reposting) whenever a pack or script is created, updated, hidden, or deleted, so it never drifts from the live store.
- **Best-sellers auto-refresh** — refreshed (rate-limited to once/hour) in the product channel whenever an order is fulfilled, or on demand from the bot dashboard.
- **Automod** — spam detection, invite-link blocking, an optional all-links block, a per-guild custom word filter, excessive-mention detection, and escalating punishment (1st infraction deletes the message, 3rd adds a 10-minute timeout, 5th a 1-hour timeout, 8th a kick — all in a rolling 24h window, fully configurable from the bot dashboard). Staff (Manage Messages) and configured roles/channels are exempt. Every infraction is logged (`automod_infractions`) and visible/filterable from the dashboard.
- **Raid protection** — tracks join rate per guild; crossing the configured threshold temporarily raises the server's actual Discord verification level (`Guild#setVerificationLevel`) for 10 minutes and alerts the mod-log channel — the real Discord-provided mechanism for this, not a bot-side approximation.
- **Moderation** — `/ban`, `/kick`, `/timeout`, `/warn`, `/unban`, `/modhistory`, all logged to `mod_actions` and (if configured) a mod-log embed. The bot dashboard adds a manual-action form calling the same Discord REST endpoints directly.
- **Support tickets** — opening one now requires picking a category first (Privacy, Purchase, Product, Technical Support, Account, Billing, General, Partnership, Other — `discord-bot/ticketCategories.js`), via a required select-menu step before the private thread is created. Claim (`/ticket-claim`), close (`/ticket-close`, generates a transcript), reopen (`/ticket-reopen`), and internal staff notes (`/ticket-note`, hidden from the customer) are all supported, plus dashboard-side filtering (status/category) and stats (counts by status/category, average resolution time).

## 10. Bot Admin Dashboard

A separate, dedicated page (`/bot-admin/index.html`) — **not** a tab inside the store's own Admin panel — reusing the same server-side `requireAdmin` auth as the rest of the site (a site admin account is still required; there's no second permission system to maintain). Every write lands in its own audit log (`bot_audit_log`, distinct from the site's `audit_log` since a bot action's actor is often a Discord identity, not a ScripForge user).

- **Overview** — live bot status (online/offline/stale, derived from a 30-second heartbeat the running bot process writes — never claims "online" from a stale heartbeat), latency, guild member/channel counts, per-integration configuration status (token, OAuth, channels, assistant), and raid-protection state.
- **Moderation** — recent action history plus a manual ban/kick/timeout/unban form that calls the real Discord REST API directly.
- **Automod** — full config editor (enabled, invite/link blocking, word filter, mention threshold, spam thresholds, exempt roles/channels) and a live infraction feed.
- **Tickets** — filterable list (status/category), stats, and close/reopen/add-note actions.
- **Server** — live guild info, role list, and channel list, pulled via the Discord REST API.
- **Configuration** — editable role/channel IDs (staff, verified, mod-log, ticket archive, support) and raid-protection thresholds, all guild-scoped and stored the same way `/setup-server` already stores them.
- **Store Integration** — linked/verified Discord account counts, welcome-discount issue/redeem counts, catalogue size, best sellers, and manual "sync now" triggers for the catalogue message and best-sellers refresh.
- **Analytics** — bot action volume (24h/7d), moderation-action breakdown, ticket-category breakdown.
- **Audit Log** — every bot/dashboard action, filterable, most recent first.
- **Feature List tab** — an in-app, honest inventory of exactly what's real (mirrors this document) so nothing is implied to work that doesn't.

**What Discord's API doesn't support is not faked.** Where no real bot-side equivalent exists (e.g. Discord's own built-in raid heuristics), the dashboard uses the closest real mechanism instead (verification-level lockdown) and this document says so explicitly rather than pretending otherwise.

## 11. Email

Optional — nothing on the site requires it. When `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` aren't set in `.env`, every send just logs what would have gone out instead of failing, so password reset and receipts still work end-to-end locally without a real mail server.

- **Password reset** — sent when a "forgot password" request matches an account that has an email on file.
- **Order receipts** — sent automatically the moment an order is fulfilled (see §3), if the buyer has an email on file.
- Configure via `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` in `.env` — any standard SMTP provider works (Gmail app password, SendGrid, Mailgun, etc).

## 12. Data & Reliability

- **Database**: SQLite via Node's built-in `node:sqlite` (no external database server to install). `data/scripforge.db`, gitignored, persists across restarts.
- **Durability**: `PRAGMA synchronous = FULL` plus a graceful-shutdown WAL checkpoint, so the most recent orders/signups survive even an abrupt process kill, not just a clean stop.
- **Migrations**: additive-only (`ensureColumn`), so restarting after a schema change never touches existing data.
- **Seeding**: the original catalog is seeded once, only if the `packs` table is empty — safe to keep this repo's `server/seedCatalog.js` around indefinitely; it's never read again after first boot.
- **Error logging**: every unhandled server error and reported client-side error is written to the `error_log` table, visible in Admin → Error Log.

## 13. Known Limitations

- The nine original games' hand-built detail pages (`games/game-*.html`) are static HTML. Renaming/repricing a script from the admin dashboard updates checkout and the catalog listing immediately, but that specific page's own marketing copy has to be edited separately if you want it to match.
- YouTube links across the site are still placeholders (`https://www.youtube.com`) — swap in your real link when you have one. Discord links now point at a real invite (`discord.gg/Hr69adj2My`).
- Crypto payments require a NOWPayments account (`NOWPAYMENTS_API_KEY`/`NOWPAYMENTS_IPN_SECRET` in `.env`); until configured, the "Pay with Crypto" button shows a clear "not configured" message instead of failing oddly.
- "One device per license" is a soft deterrent (a browser-generated id in localStorage), not a hard technical guarantee — see §4.
- The generated script files are demonstrative/template-quality code illustrating each described system, written to be genuinely useful and correct — not tested inside a live multiplayer runtime, but grounded in the engine and gameplay systems each game actually uses. Treat them as a strong starting point, the same way you would code bought from any script marketplace.
- The six cosmetic ForgeClient previews (Apex, Call of Duty, Fortnite, PUBG, Roblox, Valorant — see §5) are organizers/browsers only; they don't connect to those games. Only GTA V, Skyrim, and Minecraft have a real, functioning client, because those are the only three with a legitimate third-party modding/scripting path to build one on.
- The three real clients (§5) aren't wired into the paid license/download system — they're free bonus code shipped in this repo under `generated-clients/`, documented on their own site page and in each client's own README, not gated behind checkout.
- Public catalog cards don't yet show an average star rating (reviews exist and are moderatable, but the summary isn't surfaced on the card itself yet).
- **Raid protection** approximates Discord's own raid heuristics via a real but blunt mechanism (temporarily maxing the server's verification level) — Discord's API doesn't expose a finer-grained bot-side raid-detection primitive to build on.
- **Best-sellers/catalogue sync require `DISCORD_GUILD_ID` and the bot to actually be in the server** — without both, these silently no-op (by design, so a misconfigured bot never breaks catalog edits) rather than erroring.
- Deleting a script (as opposed to a pack, or hiding/updating either) doesn't yet trigger a catalogue-channel resync — a minor gap; the message catches up on the next pack-level change.
- The bot dashboard's manual moderation actions (ban/kick/timeout) work via Discord REST directly and don't require the bot's gateway process to be running, but ticket close/reopen's thread lock/archive step is best-effort and silently no-ops if the bot can't reach that channel.
- 2FA recovery codes and TOTP secrets are never logged or exposed in any API response after their one-time generation moment — losing both the authenticator and all 10 recovery codes means account recovery has to go through a password-authenticated 2FA disable, which isn't currently self-service without at least the password (by design — this is the same trade-off any TOTP implementation makes).
