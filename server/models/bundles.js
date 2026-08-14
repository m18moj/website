const db = require('../db');
const catalogModel = require('./catalog');

const statements = {
  insert: db.prepare(`
    INSERT INTO bundles (name, description, pack_ids, discount_percent) VALUES (@name, @description, @packIds, @discountPercent)
  `),
  update: db.prepare(`
    UPDATE bundles SET name = @name, description = @description, pack_ids = @packIds,
      discount_percent = @discountPercent, updated_at = datetime('now')
    WHERE id = @id
  `),
  findById: db.prepare('SELECT * FROM bundles WHERE id = ?'),
  listAll: db.prepare('SELECT * FROM bundles ORDER BY created_at DESC'),
  listActive: db.prepare('SELECT * FROM bundles WHERE active = 1 ORDER BY created_at DESC'),
  setActive: db.prepare('UPDATE bundles SET active = ? WHERE id = ?'),
  deleteBundle: db.prepare('DELETE FROM bundles WHERE id = ?')
};

function bundleOut(row) {
  const packIds = JSON.parse(row.pack_ids);
  const packs = packIds.map((id) => catalogModel.getPack(id, { includeHidden: true })).filter(Boolean);
  const subtotalCents = packs.reduce((sum, p) => sum + p.scripts.filter((s) => !s.hidden).reduce((s2, sc) => s2 + sc.priceCents, 0), 0);
  const discountCents = Math.round(subtotalCents * (row.discount_percent / 100));
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    packIds,
    packs,
    discountPercent: row.discount_percent,
    active: Boolean(row.active),
    subtotal: subtotalCents / 100,
    total: (subtotalCents - discountCents) / 100,
    createdAt: row.created_at
  };
}

function createBundle({ name, description, packIds, discountPercent }) {
  const result = statements.insert.run({
    name,
    description: description || '',
    packIds: JSON.stringify(packIds),
    discountPercent: Math.min(Math.max(Math.round(discountPercent), 0), 90)
  });
  return bundleOut(statements.findById.get(result.lastInsertRowid));
}

function updateBundle(id, { name, description, packIds, discountPercent }) {
  const existing = statements.findById.get(id);
  if (!existing) return null;
  statements.update.run({
    id,
    name: name || existing.name,
    description: description !== undefined ? description : existing.description,
    packIds: JSON.stringify(packIds || JSON.parse(existing.pack_ids)),
    discountPercent: discountPercent !== undefined ? Math.min(Math.max(Math.round(discountPercent), 0), 90) : existing.discount_percent
  });
  return bundleOut(statements.findById.get(id));
}

function setActive(id, active) {
  statements.setActive.run(active ? 1 : 0, id);
  return bundleOut(statements.findById.get(id));
}

function deleteBundle(id) {
  statements.deleteBundle.run(id);
}

function listAll() {
  return statements.listAll.all().map(bundleOut);
}

function listActive() {
  return statements.listActive.all().map(bundleOut);
}

function findById(id) {
  const row = statements.findById.get(id);
  return row ? bundleOut(row) : null;
}

// Detects whether a priced cart's pack set exactly matches an active
// bundle's pack list (order-independent) — used by checkout to apply the
// bundle discount automatically, without needing a separate promo code.
function matchBundleForCart(priced) {
  const cartPackIds = new Set(priced.packs.map((p) => p.packId));
  return listActive().find((bundle) => {
    const bundlePackIds = new Set(bundle.packIds);
    return bundlePackIds.size === cartPackIds.size && [...bundlePackIds].every((id) => cartPackIds.has(id));
  }) || null;
}

module.exports = { createBundle, updateBundle, setActive, deleteBundle, listAll, listActive, findById, matchBundleForCart };
