const db = require('../db');

const statements = {
  insert: db.prepare(`
    INSERT INTO promo_codes (code, discount_type, discount_value, max_uses, expires_at)
    VALUES (@code, @discountType, @discountValue, @maxUses, @expiresAt)
  `),
  findByCode: db.prepare('SELECT * FROM promo_codes WHERE code = ?'),
  listAll: db.prepare('SELECT * FROM promo_codes ORDER BY created_at DESC'),
  setActive: db.prepare('UPDATE promo_codes SET active = ? WHERE code = ?'),
  deleteCode: db.prepare('DELETE FROM promo_codes WHERE code = ?'),
  incrementUses: db.prepare('UPDATE promo_codes SET uses_count = uses_count + 1 WHERE code = ?'),
  insertRedemption: db.prepare(`
    INSERT INTO promo_code_redemptions (code, order_id, user_id) VALUES (?, ?, ?)
  `)
};

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function createCode({ code, discountType, discountValue, maxUses, expiresAt }) {
  const normalized = normalizeCode(code);
  statements.insert.run({
    code: normalized,
    discountType,
    discountValue: Math.round(discountValue),
    maxUses: maxUses || null,
    expiresAt: expiresAt || null
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
// not a server error.
function validate(code) {
  const promo = findByCode(code);
  if (!promo) return { valid: false, reason: 'That promo code doesn\'t exist.' };
  if (!promo.active) return { valid: false, reason: 'That promo code is no longer active.' };
  if (promo.expires_at && new Date(promo.expires_at).getTime() < Date.now()) {
    return { valid: false, reason: 'That promo code has expired.' };
  }
  if (promo.max_uses && promo.uses_count >= promo.max_uses) {
    return { valid: false, reason: 'That promo code has reached its usage limit.' };
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

module.exports = { createCode, findByCode, listAll, setActive, deleteCode, validate, computeDiscountCents, redeem };
