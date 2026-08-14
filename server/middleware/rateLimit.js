const rateLimit = require('express-rate-limit');

// General ceiling for everything under /api — a coarse backstop against
// scripted abuse, on top of the tighter limiters below on sensitive routes.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false
});

// Login is also protected per-account (see models/users lockout), but IP-based
// limiting stops a single source from hammering many different accounts.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts from this network. Please try again later.' }
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many accounts created from this network. Please try again later.' }
});

// Password changes, 2FA setup/enable/disable, and TOTP code verification —
// all sensitive account-security actions get the same tight ceiling,
// independent of the account-level lockout that already guards the codes
// and passwords themselves.
const securityActionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' }
});

// Deliberately tighter than login/register — this one triggers an email
// send (or would, if SMTP were configured), so it's a more attractive spam
// target than a plain failed login.
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests. Please try again later.' }
});

// Specifically guards against license-key enumeration — an attacker trying
// random SF-XXXXXXXX-XXXXXXXX-XXXXXXXX values against the download endpoint
// hoping to find one that both passes the checksum and belongs to someone
// else. The checksum already makes that astronomically unlikely on its own;
// this is defense in depth on top of it.
const downloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many download attempts from this network. Please wait a few minutes and try again.' }
});

// The bundle-zip download reads and compresses every file a customer owns
// in one request — much heavier per-request than a single-file download, so
// it gets its own tighter ceiling independent of downloadLimiter's budget.
const zipDownloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many bundle downloads from this network. Please wait a few minutes and try again.' }
});

module.exports = { apiLimiter, loginLimiter, registerLimiter, securityActionLimiter, passwordResetLimiter, downloadLimiter, zipDownloadLimiter };
