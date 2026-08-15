const crypto = require('crypto');
const db = require('../db');

const PUBLIC_COLUMNS = 'id, username, nickname, email, role, created_at, totp_enabled, totp_recovery_codes, last_login_at';
const ADMIN_COLUMNS = `
  id, username, nickname, email, role, created_at, totp_enabled, totp_recovery_codes, last_login_at, last_login_ip,
  failed_login_attempts, locked_until, disabled, ban_type, ban_reason, ban_expires_at,
  banned_at, banned_by, is_test, expires_at, created_by
`;

const statements = {
  insert: db.prepare(`INSERT INTO users (username, password_hash, role, email, nickname) VALUES (@username, @passwordHash, @role, @email, @nickname)`),
  insertAdminCreated: db.prepare(`
    INSERT INTO users (username, password_hash, role, is_test, expires_at, created_by)
    VALUES (@username, @passwordHash, @role, @isTest, @expiresAt, @createdBy)
  `),
  setTestFlag: db.prepare(`UPDATE users SET is_test = ? WHERE id = ?`),
  findByUsername: db.prepare(`SELECT * FROM users WHERE username = ? COLLATE NOCASE`),
  findByEmail: db.prepare(`SELECT * FROM users WHERE email = ? COLLATE NOCASE`),
  findById: db.prepare(`SELECT * FROM users WHERE id = ?`),
  findPublicById: db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`),
  findAdminById: db.prepare(`SELECT ${ADMIN_COLUMNS} FROM users WHERE id = ?`),
  listAll: db.prepare(`
    SELECT ${ADMIN_COLUMNS},
      (SELECT COUNT(*) FROM orders WHERE orders.user_id = users.id AND orders.status = 'paid' AND orders.is_test = 0) AS paid_order_count,
      (SELECT COUNT(*) FROM orders WHERE orders.user_id = users.id) AS total_order_count
    FROM users ORDER BY created_at DESC
  `),
  countAll: db.prepare(`SELECT COUNT(*) AS count FROM users`),
  countAdmins: db.prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin'`),
  recordFailedLogin: db.prepare(
    `UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = ?`
  ),
  setLock: db.prepare(`UPDATE users SET locked_until = ? WHERE id = ?`),
  resetFailedLogins: db.prepare(
    `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?`
  ),
  promoteToAdmin: db.prepare(
    `UPDATE users SET role = 'admin', password_hash = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?`
  ),
  setRole: db.prepare(`UPDATE users SET role = ? WHERE id = ?`),
  deleteUser: db.prepare(`DELETE FROM users WHERE id = ?`),
  setPassword: db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`),
  setEmail: db.prepare(`UPDATE users SET email = ? WHERE id = ?`),
  setTotpSecret: db.prepare(`UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?`),
  enableTotp: db.prepare(`UPDATE users SET totp_enabled = 1 WHERE id = ?`),
  disableTotp: db.prepare(`UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_recovery_codes = NULL WHERE id = ?`),
  setRecoveryCodes: db.prepare(`UPDATE users SET totp_recovery_codes = ? WHERE id = ?`),
  setNickname: db.prepare(`UPDATE users SET nickname = ? WHERE id = ?`),
  setLastLogin: db.prepare(`UPDATE users SET last_login_at = datetime('now'), last_login_ip = ? WHERE id = ?`),

  setDisabled: db.prepare(`UPDATE users SET disabled = ? WHERE id = ?`),
  setBan: db.prepare(`
    UPDATE users SET ban_type = @banType, ban_reason = @reason, ban_expires_at = @expiresAt,
      banned_at = datetime('now'), banned_by = @bannedBy
    WHERE id = @userId
  `),
  clearBan: db.prepare(`
    UPDATE users SET ban_type = NULL, ban_reason = NULL, ban_expires_at = NULL, banned_at = NULL, banned_by = NULL
    WHERE id = ?
  `),
  clearExpiredBans: db.prepare(`
    UPDATE users SET ban_type = NULL, ban_reason = NULL, ban_expires_at = NULL, banned_at = NULL, banned_by = NULL
    WHERE ban_type IS NOT NULL AND ban_expires_at IS NOT NULL AND datetime(ban_expires_at) <= datetime('now')
  `),

  insertLoginHistory: db.prepare(`
    INSERT INTO login_history (user_id, ip, user_agent, browser, os, device_type, accept_language)
    VALUES (@userId, @ip, @userAgent, @browser, @os, @deviceType, @acceptLanguage)
  `),
  loginHistoryForUser: db.prepare(`
    SELECT * FROM login_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
  `),

  insertResetToken: db.prepare(`
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)
  `),
  findResetTokenByHash: db.prepare(`
    SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND datetime(expires_at) > datetime('now')
  `),
  markResetTokenUsed: db.prepare(`UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?`),
  invalidateResetTokensForUser: db.prepare(`
    UPDATE password_reset_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL
  `)
};

// Nickname is mandatory for every account (max 8 characters — see
// NICKNAME_PATTERN and server/routes/auth.js registration validation). It's
// what's shown across the site in place of the username, which can be much
// longer and would otherwise break the navbar.
const NICKNAME_PATTERN = /^[a-zA-Z0-9 _-]{1,8}$/;

function createUser({ username, passwordHash, role = 'customer', email = null, nickname }) {
  const result = statements.insert.run({
    username: username.trim(),
    passwordHash,
    role,
    email: email || null,
    nickname: nickname.trim()
  });
  return statements.findPublicById.get(result.lastInsertRowid);
}

// The one HTTP-reachable account-creation path other than self-registration
// (server/routes/admin.js POST /users) — always creates a 'customer', never
// an admin, for the same reason promoteToAdmin() above is CLI-only: granting
// admin access should never be a single API call away. isTest/expiresAt let
// the created account double as disposable QA/demo data (see is_test on both
// users and orders) or a genuinely temporary login that stops working on its
// own once expiresAt passes (enforced in getAccountBlock, not by deleting
// the row — an admin can still see and extend it after expiry).
function createAdminUser({ username, passwordHash, isTest = false, expiresAt = null, createdBy = null }) {
  const result = statements.insertAdminCreated.run({
    username: username.trim(),
    passwordHash,
    role: 'customer',
    isTest: isTest ? 1 : 0,
    expiresAt: expiresAt || null,
    createdBy: createdBy || null
  });
  // Nickname is mandatory account-wide; this path (admin dashboard "New User")
  // has no nickname field of its own, so derive one from the username rather
  // than leaving it unset — the account owner can change it later.
  statements.setNickname.run(username.trim().slice(0, 8), result.lastInsertRowid);
  return statements.findAdminById.get(result.lastInsertRowid);
}

function setTestFlag(userId, isTest) {
  statements.setTestFlag.run(isTest ? 1 : 0, userId);
  return statements.findAdminById.get(userId);
}

function findByUsername(username) {
  return statements.findByUsername.get(username.trim());
}

function findByEmail(email) {
  return statements.findByEmail.get(email.trim());
}

function setEmail(userId, email) {
  statements.setEmail.run(email || null, userId);
}

// Raw token goes in the emailed reset link; only its SHA-256 hash is ever
// stored, so a database leak alone can't be used to reset anyone's password.
function createPasswordResetToken(userId) {
  statements.invalidateResetTokensForUser.run(userId);
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  statements.insertResetToken.run(userId, tokenHash, expiresAt);
  return rawToken;
}

function consumePasswordResetToken(rawToken) {
  const tokenHash = crypto.createHash('sha256').update(String(rawToken || '')).digest('hex');
  const row = statements.findResetTokenByHash.get(tokenHash);
  if (!row) return null;
  statements.markResetTokenUsed.run(row.id);
  return statements.findById.get(row.user_id);
}

function findById(id) {
  return statements.findById.get(id);
}

function findPublicById(id) {
  return statements.findPublicById.get(id);
}

// Clears any temporary ban whose expiry has already passed, so a user isn't
// shown as (or treated as) still banned once the suspension is over. Cheap
// single UPDATE, safe to call before any read that cares about ban status.
function clearExpiredBans() {
  statements.clearExpiredBans.run();
}

function listAll() {
  clearExpiredBans();
  return statements.listAll.all();
}

function countAll() {
  return statements.countAll.get().count;
}

function countAdmins() {
  return statements.countAdmins.get().count;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function isLocked(user) {
  return Boolean(user.locked_until && new Date(user.locked_until).getTime() > Date.now());
}

// Also used for wrong TOTP codes, not just wrong passwords — both count
// against the same lockout so a 6-digit code can't be brute-forced either.
function registerFailedLogin(user) {
  statements.recordFailedLogin.run(user.id);
  const attempts = user.failed_login_attempts + 1;
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCK_DURATION_MS).toISOString();
    statements.setLock.run(lockedUntil, user.id);
  }
}

function clearFailedLogins(userId) {
  statements.resetFailedLogins.run(userId);
}

function unlockAccount(userId) {
  statements.resetFailedLogins.run(userId);
  return statements.findPublicById.get(userId);
}

// Only ever called from the trusted local create-admin CLI, never from an
// HTTP route — there is no API endpoint that can grant admin access this way.
function promoteToAdmin(userId, passwordHash) {
  statements.promoteToAdmin.run(passwordHash, userId);
  return statements.findPublicById.get(userId);
}

// Used by the admin dashboard's role toggle. Callers must independently stop
// an admin from changing their own role — this function does not check that.
function setRole(userId, role) {
  statements.setRole.run(role, userId);
  return statements.findPublicById.get(userId);
}

function deleteUser(userId) {
  statements.deleteUser.run(userId);
}

function setPassword(userId, passwordHash) {
  statements.setPassword.run(passwordHash, userId);
}

function setTotpSecret(userId, secret) {
  statements.setTotpSecret.run(secret, userId);
}

function enableTotp(userId) {
  statements.enableTotp.run(userId);
}

function disableTotp(userId) {
  statements.disableTotp.run(userId);
}

function recordLogin(userId, ip) {
  statements.setLastLogin.run(ip || null, userId);
}

function setNickname(userId, nickname) {
  statements.setNickname.run(nickname.trim(), userId);
  return statements.findPublicById.get(userId);
}

// Stores the bcrypt hashes of a freshly generated set of recovery codes
// (overwrites any previous set — regenerating invalidates the old ones).
// Hashing/generation of the raw codes themselves happens in the route layer
// (server/routes/account.js), which already has bcrypt in scope.
function setRecoveryCodes(userId, hashedCodes) {
  statements.setRecoveryCodes.run(JSON.stringify(hashedCodes), userId);
}

function getRecoveryCodeHashes(user) {
  if (!user || !user.totp_recovery_codes) return [];
  try {
    return JSON.parse(user.totp_recovery_codes);
  } catch (err) {
    return [];
  }
}

// Removes exactly one hash from the stored set (the one that matched) —
// called after the route layer has already bcrypt-compared the submitted
// code against each stored hash, so a recovery code can only ever be used once.
function removeRecoveryCodeHash(userId, hashToRemove) {
  const user = statements.findById.get(userId);
  const remaining = getRecoveryCodeHashes(user).filter((h) => h !== hashToRemove);
  statements.setRecoveryCodes.run(JSON.stringify(remaining), userId);
}

// A single-click, no-paper-trail toggle — distinct from banUser() below,
// which is the more formal action with a reason, a duration, and an actor
// recorded. Callers must independently stop an admin from disabling
// themselves or another admin.
function setDisabled(userId, disabled) {
  statements.setDisabled.run(disabled ? 1 : 0, userId);
  return statements.findAdminById.get(userId);
}

const BAN_DURATIONS_MS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  permanent: null
};

const BAN_TYPES = Object.keys(BAN_DURATIONS_MS);

function banUser(userId, { banType, reason, bannedBy }) {
  const durationMs = BAN_DURATIONS_MS[banType];
  const expiresAt = durationMs ? new Date(Date.now() + durationMs).toISOString() : null;
  statements.setBan.run({ banType, reason: reason || null, expiresAt, bannedBy, userId });
  return statements.findAdminById.get(userId);
}

function unbanUser(userId) {
  statements.clearBan.run(userId);
  return statements.findAdminById.get(userId);
}

// null = account is fully usable. Otherwise describes why sign-in (and any
// already-open session — see middleware/auth.js) should be refused.
function getAccountBlock(user) {
  if (user.disabled) {
    return { type: 'disabled', message: 'This account has been disabled by an administrator.' };
  }
  if (user.expires_at && new Date(user.expires_at).getTime() <= Date.now()) {
    return { type: 'expired', message: 'This temporary account has expired.' };
  }
  if (user.ban_type) {
    if (!user.ban_expires_at) {
      return {
        type: 'banned',
        banType: 'permanent',
        message: `This account has been permanently banned.${user.ban_reason ? ` Reason: ${user.ban_reason}` : ''}`
      };
    }
    return {
      type: 'banned',
      banType: user.ban_type,
      expiresAt: user.ban_expires_at,
      // ban_expires_at is written as a JS toISOString() value (already has a
      // 'T' and trailing 'Z'), unlike the SQL-generated datetime('now')
      // columns elsewhere in this table — parse it directly, no reformatting.
      message: `This account is suspended until ${new Date(user.ban_expires_at).toLocaleString()}.${user.ban_reason ? ` Reason: ${user.ban_reason}` : ''}`
    };
  }
  return null;
}

function recordLoginHistory(userId, { ip, userAgent, browser, os, deviceType, acceptLanguage }) {
  statements.insertLoginHistory.run({
    userId,
    ip: ip || null,
    userAgent: userAgent || null,
    browser: browser || null,
    os: os || null,
    deviceType: deviceType || null,
    acceptLanguage: acceptLanguage || null
  });
}

function loginHistoryForUser(userId, limit = 20) {
  return statements.loginHistoryForUser.all(userId, limit);
}

function toPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname || null,
    email: user.email || null,
    role: user.role,
    createdAt: user.created_at,
    totpEnabled: Boolean(user.totp_enabled),
    recoveryCodesRemaining: getRecoveryCodeHashes(user).length,
    lastLoginAt: user.last_login_at || null
  };
}

module.exports = {
  createUser,
  createAdminUser,
  findByUsername,
  findByEmail,
  findById,
  findPublicById,
  setEmail,
  listAll,
  countAll,
  countAdmins,
  isLocked,
  registerFailedLogin,
  clearFailedLogins,
  unlockAccount,
  promoteToAdmin,
  setRole,
  setTestFlag,
  deleteUser,
  setPassword,
  setTotpSecret,
  enableTotp,
  disableTotp,
  setRecoveryCodes,
  getRecoveryCodeHashes,
  removeRecoveryCodeHash,
  setNickname,
  recordLogin,
  setDisabled,
  banUser,
  unbanUser,
  clearExpiredBans,
  getAccountBlock,
  recordLoginHistory,
  loginHistoryForUser,
  createPasswordResetToken,
  consumePasswordResetToken,
  toPublicUser,
  BAN_TYPES,
  NICKNAME_PATTERN,
  MAX_FAILED_ATTEMPTS,
  LOCK_DURATION_MS
};
