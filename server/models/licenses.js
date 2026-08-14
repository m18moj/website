const crypto = require('crypto');
const db = require('../db');

// "One payment, one device" as implemented here means one browser profile —
// there's no real hardware identifier available to a web app without
// installing something, so "device" is a random id the browser generates
// once and keeps in localStorage (see js/downloads.js). This stops casual
// sharing (someone else's browser has a different id and gets refused) but
// a determined person can still clear localStorage or use a different
// browser to get a fresh id. It's a soft deterrent, like most indie DRM, not
// a hard technical guarantee — documented here and in FEATURES.md so nobody
// mistakes it for more than it is.
//
// The key format itself is self-verifying: SF-<16 hex>-<8 hex checksum>,
// where the checksum is an HMAC of the random part keyed on SESSION_SECRET.
// This means a malformed or randomly-guessed key can be rejected instantly,
// without a database lookup, by anyone who doesn't know the secret — a
// brute-force scan of the download endpoint gets rejected before it ever
// touches the database or the rate limiter's budget is spent on real work.
// It does NOT make the key decodable (no order/script id is embedded), only
// forge-resistant.
const DOWNLOAD_CAP = 50;

function getSecret() {
  return process.env.SESSION_SECRET || 'insecure-dev-secret';
}

function checksumFor(randomPart) {
  return crypto.createHmac('sha256', getSecret()).update(`license:${randomPart}`).digest('hex').slice(0, 8).toUpperCase();
}

function generateLicenseKey() {
  const randomPart = crypto.randomBytes(8).toString('hex').toUpperCase();
  const checksum = checksumFor(randomPart);
  return `SF-${randomPart.slice(0, 8)}-${randomPart.slice(8, 16)}-${checksum}`;
}

// Fast, offline, no-DB-lookup check — the first line of defense against
// enumeration. Doesn't prove the key is assigned to anyone; only that it
// wasn't tampered with or blindly guessed.
function isWellFormed(licenseKey) {
  const match = /^SF-([0-9A-F]{8})-([0-9A-F]{8})-([0-9A-F]{8})$/.exec(String(licenseKey || ''));
  if (!match) return false;
  const randomPart = match[1] + match[2];
  return checksumFor(randomPart) === match[3];
}

const statements = {
  insert: db.prepare(`
    INSERT INTO license_keys (license_key, order_id, user_id, pack_id, script_id)
    VALUES (@licenseKey, @orderId, @userId, @packId, @scriptId)
  `),
  findByKey: db.prepare('SELECT * FROM license_keys WHERE license_key = ?'),
  findForOrder: db.prepare('SELECT * FROM license_keys WHERE order_id = ?'),
  listForUser: db.prepare('SELECT * FROM license_keys WHERE user_id = ? ORDER BY created_at DESC'),
  bindDevice: db.prepare(`
    UPDATE license_keys SET device_fingerprint = ?, activated_at = datetime('now') WHERE id = ?
  `),
  incrementDownload: db.prepare('UPDATE license_keys SET download_count = download_count + 1 WHERE id = ?'),
  resetDevice: db.prepare(`UPDATE license_keys SET device_fingerprint = NULL, activated_at = NULL WHERE license_key = ?`),
  insertLog: db.prepare(`
    INSERT INTO license_download_log (license_key, ip, device_fingerprint, user_agent, success, reason)
    VALUES (@licenseKey, @ip, @deviceFingerprint, @userAgent, @success, @reason)
  `),
  logForKey: db.prepare('SELECT * FROM license_download_log WHERE license_key = ? ORDER BY created_at DESC LIMIT ?')
};

// Idempotent — an order that already has license keys (e.g. a webhook firing
// twice) is left alone rather than issued a second set.
function createForOrder(order) {
  if (statements.findForOrder.all(order.id).length > 0) return statements.findForOrder.all(order.id);

  const created = [];
  for (const item of order.items) {
    const licenseKey = generateLicenseKey();
    statements.insert.run({
      licenseKey,
      orderId: order.id,
      userId: order.user_id,
      packId: item.pack_id,
      scriptId: item.script_id
    });
    created.push(statements.findByKey.get(licenseKey));
  }
  return created;
}

function findByKey(licenseKey) {
  if (!isWellFormed(licenseKey)) return null;
  return statements.findByKey.get(licenseKey);
}

function listForUser(userId) {
  return statements.listForUser.all(userId);
}

function listForOrder(orderId) {
  return statements.findForOrder.all(orderId);
}

// null = ok to proceed. Otherwise a { reason } explaining the refusal.
function checkDeviceAccess(license, deviceFingerprint) {
  if (license.download_count >= DOWNLOAD_CAP) {
    return { reason: 'This license has reached its download limit. Contact support on Discord if you need it reset.' };
  }
  if (!license.device_fingerprint) return null;
  if (license.device_fingerprint === deviceFingerprint) return null;
  return {
    reason: 'This license is already activated on a different device. Each purchase is licensed for one device — contact support on Discord if you need it moved to a new one.'
  };
}

function bindDevice(licenseId, deviceFingerprint) {
  statements.bindDevice.run(deviceFingerprint, licenseId);
}

function recordDownload(licenseId) {
  statements.incrementDownload.run(licenseId);
}

function logAttempt({ licenseKey, ip, deviceFingerprint, userAgent, success, reason }) {
  statements.insertLog.run({
    licenseKey,
    ip: ip || null,
    deviceFingerprint: deviceFingerprint || null,
    userAgent: userAgent || null,
    success: success ? 1 : 0,
    reason: reason || null
  });
}

function logForKey(licenseKey, limit = 20) {
  return statements.logForKey.all(licenseKey, limit);
}

// Admin-only escape hatch — e.g. the customer got a new PC. Also clears the
// download count back to zero so a reset genuinely gives them a fresh start,
// not a device change that immediately hits the cap again.
function resetDevice(licenseKey) {
  statements.resetDevice.run(licenseKey);
  db.prepare('UPDATE license_keys SET download_count = 0 WHERE license_key = ?').run(licenseKey);
  return statements.findByKey.get(licenseKey);
}

module.exports = {
  createForOrder,
  findByKey,
  listForUser,
  listForOrder,
  checkDeviceAccess,
  bindDevice,
  recordDownload,
  resetDevice,
  isWellFormed,
  logAttempt,
  logForKey,
  DOWNLOAD_CAP
};
