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
        frameAncestors: ["'none'"]
      }
    },
    // Unsplash images are loaded cross-origin without CORP headers of their
    // own; a strict embedder policy would silently block them.
    crossOriginEmbedderPolicy: false
  })
);

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

app.use(ensureCsrfToken);
app.use('/api', apiLimiter);

// When maintenance mode is on (Admin -> Settings), everything under /api
// except auth/admin/settings itself is blocked — so customers can't browse,
// register, or check out, while an admin can still sign in and switch it
// back off. The pages themselves still load (see js/site-flags.js), which
// covers them with a maintenance overlay for anyone who isn't an admin.
app.use('/api', (req, res, next) => {
  if (!settingsModel.get('maintenanceMode')) return next();
  const allowedPrefixes = ['/auth', '/admin', '/settings'];
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

// Explicit allowlist of static directories/files — deliberately NOT a single
// express.static(ROOT), which would also serve server/, data/*.db, and .env.
app.use('/css', express.static(path.join(ROOT, 'css')));
app.use('/js', express.static(path.join(ROOT, 'js')));
app.use('/pages', express.static(path.join(ROOT, 'pages')));
app.use('/games', express.static(path.join(ROOT, 'games')));
app.use('/admin', express.static(path.join(ROOT, 'admin')));
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
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

const server = app.listen(PORT, () => {
  console.log(`ScripForge running at http://localhost:${PORT}`);
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
