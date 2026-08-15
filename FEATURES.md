# ScripForge — Feature Manual

Everything the site can do, organized by area. This is a living reference, not a changelog — if you add or change a feature, update the relevant section here too.

## 1. Storefront (customer-facing)

- **Home, Games, and Catalog pages** — browse all script packs. The Catalog page is fully dynamic (pulls live from the database via `/api/catalog`), so admin-created packs actually appear there; the original nine games also have hand-built landing pages under `games/`.
- **Search** — a search box in the nav on every page jumps to the Catalog page and runs the search there.
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
- **Account lockout** — 5 wrong passwords *or* wrong 2FA codes locks the account for 15 minutes.
- **Two-factor authentication (TOTP)** — admin accounts only (customers get CAPTCHA instead). Manage it from Admin → My Security. RFC 6238-compliant, implemented against Node's `crypto` module directly (no third-party TOTP library).
- **Password reset** — tokens are random (32 bytes), only their SHA-256 hash is ever stored, and they expire after 30 minutes and are single-use. Rate-limited separately from login (6/hour) since it triggers an email send.
- **Bans** — an admin can suspend an account for 24 hours, 7 days, 30 days, or permanently, with an optional reason. A ban kills any already-open session immediately, not just future logins. Temporary bans auto-expire.
- **Disable** — a quick, no-reason, single-click account toggle, separate from bans, for fast use (e.g., "pause this account while I look into something").
- **Sessions** — server-side (SQLite-backed), httpOnly, SameSite cookies, regenerated on every privilege change (register, login, 2FA-verified) to prevent session fixation.
- **CSRF protection** — every state-changing request requires a token issued to the session.
- **Admin re-verification** — admin status is re-checked against the database on every request, not cached in the session, so a demoted or banned admin loses access immediately.

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
  - Role toggle (customer ↔ admin), unlock, delete
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

## 9. Email

Optional — nothing on the site requires it. When `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` aren't set in `.env`, every send just logs what would have gone out instead of failing, so password reset and receipts still work end-to-end locally without a real mail server.

- **Password reset** — sent when a "forgot password" request matches an account that has an email on file.
- **Order receipts** — sent automatically the moment an order is fulfilled (see §3), if the buyer has an email on file.
- Configure via `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` in `.env` — any standard SMTP provider works (Gmail app password, SendGrid, Mailgun, etc).

## 10. Data & Reliability

- **Database**: SQLite via Node's built-in `node:sqlite` (no external database server to install). `data/scripforge.db`, gitignored, persists across restarts.
- **Durability**: `PRAGMA synchronous = FULL` plus a graceful-shutdown WAL checkpoint, so the most recent orders/signups survive even an abrupt process kill, not just a clean stop.
- **Migrations**: additive-only (`ensureColumn`), so restarting after a schema change never touches existing data.
- **Seeding**: the original catalog is seeded once, only if the `packs` table is empty — safe to keep this repo's `server/seedCatalog.js` around indefinitely; it's never read again after first boot.
- **Error logging**: every unhandled server error and reported client-side error is written to the `error_log` table, visible in Admin → Error Log.

## 11. Known Limitations

- The nine original games' hand-built detail pages (`games/game-*.html`) are static HTML. Renaming/repricing a script from the admin dashboard updates checkout and the catalog listing immediately, but that specific page's own marketing copy has to be edited separately if you want it to match.
- Discord/YouTube links across the site are still placeholders (`https://discord.com`, `https://www.youtube.com`) — swap in your real links when you have them.
- Crypto payments require a NOWPayments account (`NOWPAYMENTS_API_KEY`/`NOWPAYMENTS_IPN_SECRET` in `.env`); until configured, the "Pay with Crypto" button shows a clear "not configured" message instead of failing oddly.
- "One device per license" is a soft deterrent (a browser-generated id in localStorage), not a hard technical guarantee — see §4.
- The generated script files are demonstrative/template-quality code illustrating each described system, written to be genuinely useful and correct — not tested inside a live multiplayer runtime, but grounded in the engine and gameplay systems each game actually uses. Treat them as a strong starting point, the same way you would code bought from any script marketplace.
- The six cosmetic ForgeClient previews (Apex, Call of Duty, Fortnite, PUBG, Roblox, Valorant — see §5) are organizers/browsers only; they don't connect to those games. Only GTA V, Skyrim, and Minecraft have a real, functioning client, because those are the only three with a legitimate third-party modding/scripting path to build one on.
- The three real clients (§5) aren't wired into the paid license/download system — they're free bonus code shipped in this repo under `generated-clients/`, documented on their own site page and in each client's own README, not gated behind checkout.
- Public catalog cards don't yet show an average star rating (reviews exist and are moderatable, but the summary isn't surfaced on the card itself yet).
