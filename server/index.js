require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');

const db = require('./db');
const SqliteSessionStore = require('./sessionStore');
const stripeWebhookHandler = require('./webhook');
const nowpaymentsWebhookHandler = require('./webhookNowpayments');
const { ensureCsrfToken } = require('./middleware/csrf');
const { apiLimiter } = require('./middleware/rateLimit');

const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/account');
const catalogRoutes = require('./routes/catalog');
const checkoutRoutes = require('./routes/checkout');
const adminRoutes = require('./routes/admin');
const settingsRoutes = require('./routes/settings');
const downloadsRoutes = require('./routes/downloads');
const bundlesRoutes = require('./routes/bundles');
const errorsRoutes = require('./routes/errors');
const chatRoutes = require('./routes/chat');
const discordLinkRoutes = require('./routes/discordLink');
const botAdminRoutes = require('./routes/botAdmin');
const socialRoutes = require('./routes/social');
const videoAdminRoutes = require('./routes/videoAdmin');
const settingsModel = require('./models/settings');
const errorLogModel = require('./models/errorLog');

if (!process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET is not set. Copy .env.example to .env and set a long random value before starting the server.');
  process.exit(1);
}

if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
  console.warn('STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET are not set — the site will run, but card checkout will fail until they are configured in .env.');
}

if (!process.env.NOWPAYMENTS_API_KEY || !process.env.NOWPAYMENTS_IPN_SECRET) {
  console.warn('NOWPAYMENTS_API_KEY / NOWPAYMENTS_IPN_SECRET are not set — crypto checkout will fail until configured in .env.');
}

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        // No page loads images from Unsplash anymore (game art is CSS-only now) —
        // 'self' and data: cover everything actually on the page.
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: []
      }
    },
    // Unsplash images are loaded cross-origin without CORP headers of their
    // own; a strict embedder policy would silently block them.
    crossOriginEmbedderPolicy: false,
    // Long-lived HSTS with preload — the site is only ever served over HTTPS
    // (Cloudflare terminates TLS in front of it), so there's no local-dev
    // reason to keep this short. Submittable to the browser preload list.
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
    // Locks down powerful browser features this site has no use for, on top
    // of what CSP already covers.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  })
);

// Not covered by helmet: disables camera/mic/geolocation/payment-handler
// APIs entirely, so an XSS that got past CSP still can't invoke them.
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  next();
});

// Stripe verifies its webhook signature against the raw request body, so
// it's mounted before express.json() parses (and consumes) the body below.
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookHandler);

app.use(express.json({ limit: '15kb' }));

// NOWPayments, unlike Stripe, signs a re-sorted re-serialization of the
// *parsed* body (see server/nowpayments.js) — so this one runs after
// express.json() rather than needing the raw bytes.
app.post('/api/webhooks/nowpayments', nowpaymentsWebhookHandler);

app.use(
  session({
    store: new SqliteSessionStore(),
    name: 'sf.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // Requires HTTPS once this is deployed behind a real domain — leave
      // false for local http:// development or the cookie will never be set.
      secure: IS_PRODUCTION,
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  })
);

// Canonicalizes every page URL to its extensionless form (e.g. /pages/login
// instead of /pages/login.html) — old bookmarks/links with the .html suffix
// still work, they just 301 to the clean URL first. Runs before the static
// handlers below, which serve the clean URLs directly via each mount's
// `extensions: ['html']` option.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const queryIndex = req.originalUrl.indexOf('?');
  const pathname = queryIndex === -1 ? req.originalUrl : req.originalUrl.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : req.originalUrl.slice(queryIndex);
  if (!pathname.endsWith('.html')) return next();
  const clean = pathname === '/index.html' ? '/' : pathname.slice(0, -'.html'.length);
  res.redirect(301, clean + query);
});

app.use(ensureCsrfToken);
app.use('/api', apiLimiter);

// When maintenance mode is on (Admin -> Settings), everything under /api
// except auth/admin/settings itself is blocked — so customers can't browse,
// register, or check out, while an admin can still sign in and switch it
// back off. The pages themselves still load (see js/site-flags.js), which
// covers them with a maintenance overlay for anyone who isn't an admin.
app.use('/api', (req, res, next) => {
  if (!settingsModel.get('maintenanceMode')) return next();
  const allowedPrefixes = ['/auth', '/admin', '/settings', '/bot-admin', '/social', '/video-admin'];
  if (allowedPrefixes.some((prefix) => req.path.startsWith(prefix))) return next();
  res.status(503).json({ error: 'The site is temporarily down for maintenance. Please check back soon.', maintenanceMode: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/downloads', downloadsRoutes);
app.use('/api/bundles', bundlesRoutes);
app.use('/api/errors', errorsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/discord', discordLinkRoutes);
app.use('/api/bot-admin', botAdminRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/video-admin', videoAdminRoutes);

// Explicit allowlist of static directories/files — deliberately NOT a single
// express.static(ROOT), which would also serve server/, data/*.db, and .env.
// `extensions: ['html']` lets a request for the clean URL (e.g. /pages/login)
// resolve straight to the file on disk (pages/login.html) without a redirect
// — the redirect above only fires for requests that still name the .html
// file directly.
const HTML_EXT = { extensions: ['html'] };
app.use('/css', express.static(path.join(ROOT, 'css')));
app.use('/js', express.static(path.join(ROOT, 'js')));
app.use('/pages', express.static(path.join(ROOT, 'pages'), HTML_EXT));
app.use('/games', express.static(path.join(ROOT, 'games'), HTML_EXT));
app.use('/services', express.static(path.join(ROOT, 'services'), HTML_EXT));
app.use('/admin', express.static(path.join(ROOT, 'admin'), HTML_EXT));
// The dedicated bot admin dashboard — a separate page/app from the website's
// own admin panel (/admin), not a tab inside it. Same static-allowlist
// pattern as everywhere else; its API is entirely under /api/bot-admin,
// gated by the same requireAdmin as the rest of the site.
app.use('/bot-admin', express.static(path.join(ROOT, 'bot-admin'), HTML_EXT));
// The Video Studio dashboard — same standalone-page pattern as bot-admin
// above. Its API (/api/video-admin) never touches video/pipeline/'s files;
// it only shells out to that project's own npm scripts and reads its output
// directory, so the two systems stay isolated from each other on disk.
app.use('/video-admin', express.static(path.join(ROOT, 'video-admin'), HTML_EXT));
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.get('/robots.txt', (req, res) => res.sendFile(path.join(ROOT, 'robots.txt')));
app.get('/sitemap.xml', (req, res) => res.sendFile(path.join(ROOT, 'sitemap.xml')));
app.get('/favicon.svg', (req, res) => res.sendFile(path.join(ROOT, 'favicon.svg')));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((req, res) => res.status(404).sendFile(path.join(ROOT, '404.html')));

app.use((err, req, res, next) => {
  console.error(err);
  errorLogModel.record({
    source: 'server',
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    userId: req.session ? req.session.userId : null
  });
  if (req.path.startsWith('/api')) {
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
  res.status(500).send('Something went wrong.');
});

// Bound to loopback only, never 0.0.0.0 — this server is meant to be reached
// exclusively through the Cloudflare Tunnel (cloudflared connects to it via
// http://localhost), which terminates TLS and provides WAF/DDoS protection
// at the edge. Listening on all interfaces would let anyone who can reach
// this machine on the network hit the app directly, bypassing that
// protection entirely (and letting them spoof X-Forwarded-* headers that
// the IP-based rate limiters and `trust proxy` otherwise trust from
// cloudflared). A firewall rule can be misconfigured or reset; a loopback
// bind can't be bypassed at all short of code on this machine.
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`ScripForge running at http://localhost:${PORT} (loopback-only — reached publicly via the Cloudflare Tunnel)`);
});

// Stop with Ctrl+C (or a normal `nodemon` restart) rather than force-killing
// the process where possible — this checkpoints the WAL into the main
// database file and closes it cleanly, so the most recent orders/signups are
// flushed to disk rather than left to whatever the next open recovers.
function shutdown() {
  console.log('\nShutting down — checkpointing database…');
  server.close(() => {
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      db.close();
    } catch (err) {
      console.error('Error while closing the database:', err);
    }
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
