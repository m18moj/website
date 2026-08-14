const usersModel = require('../models/users');

// A disabled/banned account's session is killed the moment it's next used,
// not just blocked from future logins — otherwise a session opened before
// the ban would keep working until it naturally expired.
function killBlockedSession(req, res, block) {
  req.session.destroy(() => {
    res.clearCookie('sf.sid');
    res.status(401).json({ error: block.message, accountBlocked: block.type });
  });
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Sign in required.' });
  }

  const user = usersModel.findById(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: 'Sign in required.' });
  }

  const block = usersModel.getAccountBlock(user);
  if (block) return killBlockedSession(req, res, block);

  req.currentUser = user;
  next();
}

// Re-checks the role against the database on every request rather than trusting
// the session's cached role, so a demoted/deleted account loses admin access
// immediately instead of waiting for the session to expire.
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Sign in required.' });
  }

  const user = usersModel.findById(req.session.userId);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  const block = usersModel.getAccountBlock(user);
  if (block) return killBlockedSession(req, res, block);

  req.currentUser = user;
  next();
}

module.exports = { requireAuth, requireAdmin };
