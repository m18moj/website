const crypto = require('crypto');

// Synchronizer-token CSRF protection. The token lives in the server-side
// session (not readable cross-origin) and must be echoed back in a custom
// header on every state-changing request. A cross-site form post can't read
// the token to replay it, and simple <form> submissions can't set custom
// headers, so this blocks classic CSRF without needing SameSite alone to
// carry the whole defense.
function ensureCsrfToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  next();
}

function rotateCsrfToken(req) {
  req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  return req.session.csrfToken;
}

function verifyCsrfToken(req, res, next) {
  const headerToken = req.get('X-CSRF-Token');
  if (!headerToken || !req.session.csrfToken || headerToken !== req.session.csrfToken) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token. Refresh the page and try again.' });
  }
  next();
}

module.exports = { ensureCsrfToken, verifyCsrfToken, rotateCsrfToken };
