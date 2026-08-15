const crypto = require('crypto');
const db = require('../db');

const statements = {
  insert: db.prepare(`
    INSERT INTO promo_codes (code, discount_type, discount_value, max_uses, expires_at, owner_user_id, source)
    VALUES (@code, @discountType, @discountValue, @maxUses, @expiresAt, @ownerUserId, @source)
  `),
  findByCode: db.prepare('SELECT * FROM promo_codes WHERE code = ?'),
  listAll: db.prepare('SELECT * FROM promo_codes ORDER BY created_at DESC'),
  setActive: db.prepare('UPDATE promo_codes SET active = ? WHERE code = ?'),
  deleteCode: db.prepare('DELETE FROM promo_codes WHERE code = ?'),
  incrementUses: db.prepare('UPDATE promo_codes SET uses_count = uses_count + 1 WHERE code = ?'),
  insertRedemption: db.prepare(`
    INSERT INTO promo_code_redemptions (code, order_id, user_id) VALUES (?, ?, ?)
  `),
  findByOwner: db.prepare(`SELECT * FROM promo_codes WHERE owner_user_id = ? AND source = ?`)
};

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function createCode({ code, discountType, discountValue, maxUses, expiresAt, ownerUserId = null, source = 'manual' }) {
  const normalized = normalizeCode(code);
  statements.insert.run({
    code: normalized,
    discountType,
    discountValue: Math.round(discountValue),
    maxUses: maxUses || null,
    expiresAt: expiresAt || null,
    ownerUserId: ownerUserId || null,
    source
  });
  return statements.findByCode.get(normalized);
}

function findByCode(code) {
  return statements.findByCode.get(normalizeCode(code));
}

function listAll() {
  return statements.listAll.all();
}

function setActive(code, active) {
  statements.setActive.run(active ? 1 : 0, normalizeCode(code));
  return statements.findByCode.get(normalizeCode(code));
}

function deleteCode(code) {
  statements.deleteCode.run(normalizeCode(code));
}

// Returns { valid: true, promo } or { valid: false, reason } — never throws,
// since an invalid/expired code at checkout is a normal user-facing case,
// not a server error. `userId` is required to redeem an account-owned code
// (e.g. the one-time Discord-verify discount) — a code with owner_user_id
// set is rejected for anyone else, including a signed-out request (userId
// null), without leaking whose code it is.
function validate(code, userId = null) {
  const promo = findByCode(code);
  if (!promo) return { valid: false, reason: 'That promo code doesn\'t exist.' };
  if (!promo.active) return { valid: false, reason: 'That promo code is no longer active.' };
  if (promo.expires_at && new Date(promo.expires_at).getTime() < Date.now()) {
    return { valid: false, reason: 'That promo code has expired.' };
  }
  if (promo.max_uses && promo.uses_count >= promo.max_uses) {
    return { valid: false, reason: 'That promo code has reached its usage limit.' };
  }
  if (promo.owner_user_id && promo.owner_user_id !== userId) {
    return { valid: false, reason: 'That promo code doesn\'t exist.' };
  }
  return { valid: true, promo };
}

// Computes the discount in cents for a given subtotal — percent codes are
// capped so they can never discount below zero; fixed codes are capped at
// the subtotal itself for the same reason.
function computeDiscountCents(promo, subtotalCents) {
  if (promo.discount_type === 'percent') {
    return Math.round(subtotalCents * (Math.min(promo.discount_value, 100) / 100));
  }
  return Math.min(promo.discount_value, subtotalCents);
}

function redeem(code, orderId, userId) {
  const normalized = normalizeCode(code);
  statements.incrementUses.run(normalized);
  statements.insertRedemption.run(normalized, orderId, userId);
}

// Issues the one-time 15%-off, 7-day, single-use code promised on Discord
// verification. Idempotent per user+source: if this exact user already has
// an active (or even used-up) code from this source, that same code is
// returned instead of minting a second one — re-running /verify or
// re-linking on the website must never grant repeated discounts.
function issueDiscordVerifyDiscount(userId, username) {
  const existing = statements.findByOwner.get(userId, 'discord_verify');
  if (existing) return existing;

  const code = `DISCORD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return createCode({
    code,
    discountType: 'percent',
    discountValue: 15,
    maxUses: 1,
    expiresAt,
    ownerUserId: userId,
    source: 'discord_verify'
  });
}

module.exports = {
  createCode,
  findByCode,
  listAll,
  setActive,
  deleteCode,
  validate,
  computeDiscountCents,
  redeem,
  issueDiscordVerifyDiscount
};
