# ScripForge

A game script store: browse game packs, pick individual scripts, check out with Stripe or crypto, and manage the store from an admin dashboard. Runs entirely on your own machine — no domain or external hosting required.

## Requirements

- Node.js 22.5+ (uses Node's built-in `node:sqlite`, no separate database install needed)
- A free [Stripe](https://dashboard.stripe.com/register) account (test mode is enough for local development)
- Optional: a free [NOWPayments](https://nowpayments.io) account, if you want the "Pay with Crypto" option to work

## 1. Install

```bash
npm install
```

## 2. Configure

```bash
cp .env.example .env
```

Open `.env` and fill in at least `SESSION_SECRET` and the Stripe keys — see the comments in `.env.example` for where each value comes from. `.env` is gitignored — never commit it.

## 3. Run the server

```bash
npm run dev      # auto-restarts on file changes
# or
npm start
```

The site is now at **http://localhost:3000**.

**Your data persists across restarts.** Everything lives in `data/scripforge.db`, a single SQLite file on disk — stopping and restarting the server (or editing code, which restarts it automatically under `npm run dev`) never touches it. The server logs the exact file path on every boot so you can confirm it's the same file each time. The only way to lose data is deleting the `data/` folder yourself.

## 4. Receive Stripe webhooks locally

Stripe confirms successful payments by calling your server directly, so your local server needs to be reachable from Stripe. Install the [Stripe CLI](https://stripe.com/docs/stripe-cli), then in a separate terminal:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

The first time you run `stripe listen`, it prints a `whsec_...` value — copy that into `STRIPE_WEBHOOK_SECRET` in `.env` and restart the server. Leave `stripe listen` running while you test checkout; without it, payments will succeed on Stripe's side but your local order will stay "pending" instead of flipping to "paid".

Use [Stripe's test card numbers](https://stripe.com/docs/testing) (e.g. `4242 4242 4242 4242`, any future expiry, any CVC) to complete a test purchase.

## 5. Crypto payments (optional)

"Pay with Crypto" uses [NOWPayments](https://nowpayments.io) — customers pay on NOWPayments' own hosted page (BTC, ETH, USDC, and 300+ others), and this server never touches wallet keys or blockchain code directly. (An earlier version of this used Coinbase Commerce, but Coinbase now gates new signups behind a "Coinbase Business" waitlist in some regions, so this store uses NOWPayments instead — it has broader country availability and no business-verification gate.)

1. Create a free account at nowpayments.io.
2. Store Settings → API keys → create one → `NOWPAYMENTS_API_KEY` in `.env`.
3. Store Settings → "IPN Secret Key" → copy it into `NOWPAYMENTS_IPN_SECRET` in `.env`, and set your IPN callback URL there to `https://<your-domain>/api/webhooks/nowpayments`.
4. NOWPayments can't reach `localhost` directly, so to test the webhook locally you'll need a tunnel (e.g. `ngrok http 3000`) and point the IPN callback URL at the `https://*.ngrok.io` URL it gives you instead.

Leave both blank to skip crypto entirely — the button just shows a clear "not configured" message instead of failing oddly. Crypto payments confirm on-chain rather than instantly, so the thank-you page polls for a little while and tells the customer to check their account page later if it takes longer than that.

## Currencies

Prices default to **GBP**. Anyone browsing the site can switch to **USD** or **EUR** from the currency selector in the top navigation — the choice is remembered in the browser and just changes how prices are *displayed and quoted*. The server is always the one that decides what actually gets charged: it holds the real USD prices in `server/catalog.js`, converts them itself using the fixed rate table in `server/currency.js`, and stamps the resulting currency onto the order — the currency sent from the browser at checkout is only a hint for which rate to apply, never a trusted amount. To change the exchange rates (they're static, not pulled from a live feed), edit `RATES` in `server/currency.js`.

## 6. Create an admin account

Admin accounts can't be created through the website — only from the command line on this machine, so there's no way to grant admin access remotely.

```bash
npm run create-admin -- --username youradmin --password "Str0ngPassword!"
```

(Or set `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env` and just run `npm run create-admin`.)

**Multiple admins are fully supported** — there's no limit of one. Run `create-admin` again with a second username to create a second admin, or promote any existing account to admin from inside the dashboard (Users tab → "Make admin"). Every admin action (role changes, unlocks, deletions, order status changes, admin logins) is written to the Audit Log tab so it's clear who did what when more than one person has access.

> **If the server is already running** when you run `create-admin`, restart the server afterward before signing in as the new admin. Node's built-in SQLite driver (still an experimental feature) doesn't always pick up a write made by a separate short-lived process — like this CLI — while the main server process is holding the database open, so a sign-in attempt right after creating the account can fail with "Invalid username or password" until the server restarts and reopens the file. Promoting a user to admin from inside the dashboard itself doesn't have this issue, since that write happens from the same already-running process.

## 7. Log in as admin

1. Go to http://localhost:3000/pages/login.html
2. Sign in with the username/password you just created
3. Click **Admin** in the top navigation (only visible to admin accounts), or go directly to http://localhost:3000/admin/admin.html

The admin dashboard has full read/write access to the whole store: user management (promote/demote, unlock, delete), order management (including manually marking an order `refunded`), and the audit log described above.

## How it works

- **Frontend** is static HTML/CSS/vanilla JS (`index.html`, `css/`, `js/`, `pages/`, `games/`). No build step.
- **Backend** is Express (`server/`), serving both the API (`/api/*`) and the static frontend files, backed by a local SQLite database (`data/scripforge.db`, created automatically, gitignored).
- **Accounts**: username + password, no email required. Customers can register/sign in themselves; every order is tied to the signed-in account.
- **Checkout**: the browser only ever tells the server *which* packs/scripts were selected, never a price. The server looks up real prices from `server/catalog.js`, converts them to the selected currency itself, and builds the Stripe Checkout session or NOWPayments invoice itself, so a tampered request can't change what gets charged.
- **Cart**: kept in the browser (`localStorage`) while shopping. Login is only required at the moment of checkout, when the cart is turned into a real order tied to your account.

## Account security features

- **Change password** — every account: Account page → Security. Admins do this from the Admin Dashboard → My Security tab instead, so all admin-relevant info lives in one place. Requires your current password either way.
- **CAPTCHA** — a simple arithmetic question (self-hosted, no external service or API key) is required on every register and login attempt, to slow down automated credential-stuffing and account-creation bots.
- **Two-factor authentication (TOTP)** — **admin accounts only**. Admin Dashboard → My Security → Enable 2FA. Scan the shown secret into any standard authenticator app (Google Authenticator, Authy, 1Password, etc.) and confirm with a code. Once on, signing in to that admin account requires that code as a second step. Disabling it requires re-entering your password. Regular customer accounts don't get TOTP — CAPTCHA plus rate-limiting/lockout is the intended protection for them, since carrying real payment/checkout data makes admin accounts the higher-value target.

## Security notes

This app includes a working set of defenses appropriate for a small local store — worth knowing about if you extend it:

- Passwords are hashed with bcrypt (12 rounds; never stored or logged in plain text). Login attempts against a username that doesn't exist still run a dummy bcrypt comparison, so response timing can't be used to enumerate valid usernames.
- Login is rate-limited by IP and by account: 5 wrong passwords *or* wrong 2FA codes locks that account for 15 minutes, regardless of source.
- A self-hosted arithmetic CAPTCHA (no external service or API key) is required to register or log in, and is single-use — the answer is deleted from the session the moment it's checked, so a captured question/answer pair can't be replayed.
- Two-factor authentication (TOTP, RFC 6238) is available to admin accounts and is implemented directly against Node's built-in `crypto` module (validated against the official RFC 4226 test vectors) rather than a third-party library — the standard `otplib` package's current major version ships a plugin system that doesn't satisfy its own interface out of the box. A migration on boot clears out any `totp_enabled` flag left over on a non-admin account (e.g. from before this rule existed), so a demoted admin can't be left with a stale 2FA requirement.
- Sessions are server-side (SQLite-backed, httpOnly, SameSite cookies) and regenerated at every privilege change (register, password-verified, 2FA-verified) to prevent session fixation.
- All state-changing requests require a CSRF token issued to your session — a malicious site cannot forge a request on your behalf.
- All SQL uses parameterized queries — no string-built SQL anywhere.
- Prices are never trusted from the client for either payment provider or any currency — see "Checkout" and "Currencies" above.
- Stripe and NOWPayments webhook events are both signature-verified before touching the database; anything without a valid signature is rejected outright, and a payment that can't be auto-verified simply stays "pending" (an admin can still confirm it manually) rather than ever being auto-approved on a failed check.
- A strict Content-Security-Policy (no `unsafe-inline` for scripts), `X-Frame-Options`, and related headers are set via Helmet. Every page's interactive behavior lives in an external `.js` file for this reason — an inline `<script>` block would simply be silently blocked by the CSP.
- Only specific folders (`css/`, `js/`, `pages/`, `games/`, `admin/`) are served as static files — `server/`, `.env`, and the database file are never web-accessible, even by guessing the path.
- Admin access is re-checked against the database on every request (not just cached in the session), is completely separate from anything the client can influence, and every admin action (role changes, unlocks, deletions, order status changes, admin logins) is written to an append-only audit log visible in the dashboard.
- An admin can never change their own role or delete their own account through the dashboard — only another admin (or the `create-admin` CLI) can do that, so a compromised session can't strip everyone else's access or lock out the rest of the team.

**Before this ever goes on a real domain:** set `NODE_ENV=production` (this flips session cookies to HTTPS-only), put it behind HTTPS, use your Stripe **live** keys and NOWPayments production keys, point both webhook secrets at endpoints registered for your real domain, and generate a fresh `SESSION_SECRET`.
