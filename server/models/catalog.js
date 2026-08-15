const db = require('../db');

const packColumns = 'id, pack_name, game_title, genre, description, splash, data_game, detail_url, hidden, sort_order, created_at, updated_at';

const statements = {
  listPacks: db.prepare(`SELECT ${packColumns} FROM packs ORDER BY sort_order ASC, pack_name ASC`),
  findPack: db.prepare(`SELECT ${packColumns} FROM packs WHERE id = ?`),
  maxPackSort: db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS maxSort FROM packs'),
  insertPack: db.prepare(`
    INSERT INTO packs (id, pack_name, game_title, genre, description, splash, data_game, detail_url, sort_order)
    VALUES (@id, @packName, @gameTitle, @genre, @description, @splash, @dataGame, @detailUrl, @sortOrder)
  `),
  updatePack: db.prepare(`
    UPDATE packs SET pack_name = @packName, game_title = @gameTitle, genre = @genre,
      description = @description, detail_url = @detailUrl, updated_at = datetime('now')
    WHERE id = @id
  `),
  setPackHidden: db.prepare(`UPDATE packs SET hidden = ?, updated_at = datetime('now') WHERE id = ?`),
  deletePack: db.prepare('DELETE FROM packs WHERE id = ?'),

  listScripts: db.prepare('SELECT * FROM scripts WHERE pack_id = ? ORDER BY sort_order ASC, title ASC'),
  findScript: db.prepare('SELECT * FROM scripts WHERE pack_id = ? AND id = ?'),
  maxScriptSort: db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS maxSort FROM scripts WHERE pack_id = ?'),
  insertScript: db.prepare(`
    INSERT INTO scripts (pack_id, id, title, description, category, price_cents, sort_order)
    VALUES (@packId, @id, @title, @description, @category, @priceCents, @sortOrder)
  `),
  updateScript: db.prepare('UPDATE scripts SET title = ?, description = ?, category = ?, price_cents = ? WHERE pack_id = ? AND id = ?'),
  setScriptHidden: db.prepare('UPDATE scripts SET hidden = ? WHERE pack_id = ? AND id = ?'),
  deleteScript: db.prepare('DELETE FROM scripts WHERE pack_id = ? AND id = ?'),
  countScripts: db.prepare('SELECT COUNT(*) AS count FROM scripts'),
  setScriptFile: db.prepare(`
    UPDATE scripts SET file_path = @filePath, file_ext = @fileExt, preview_snippet = @previewSnippet
    WHERE pack_id = @packId AND id = @scriptId
  `),
  setScriptVersion: db.prepare(`
    UPDATE scripts SET version = @version, changelog = @changelog WHERE pack_id = @packId AND id = @scriptId
  `),
  markPackAnnounced: db.prepare(`UPDATE packs SET discord_announced_at = datetime('now'), discord_message_id = ? WHERE id = ?`),
  rawPack: db.prepare('SELECT * FROM packs WHERE id = ?')
};

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Auto-uniquifies rather than erroring, so "Apex Legends Pack" and a later
// "Apex Legends Pack (2026)" both just work without the admin having to pick
// a slug by hand.
function uniquePackId(name) {
  const base = slugify(name) || 'pack';
  if (!statements.findPack.get(base)) return base;
  let i = 2;
  while (statements.findPack.get(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

function uniqueScriptId(packId, title) {
  const base = slugify(title) || 'script';
  if (!statements.findScript.get(packId, base)) return base;
  let i = 2;
  while (statements.findScript.get(packId, `${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

function scriptOut(row) {
  let changelog = [];
  try { changelog = JSON.parse(row.changelog || '[]'); } catch (err) { changelog = []; }
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    category: row.category || '',
    price: row.price_cents / 100,
    priceCents: row.price_cents,
    hidden: Boolean(row.hidden),
    version: row.version || '1.0.0',
    changelog,
    hasFile: Boolean(row.file_path),
    fileExt: row.file_ext || null,
    previewSnippet: row.preview_snippet || null
  };
}

function packOut(row, { includeHidden }) {
  const scripts = statements.listScripts.all(row.id)
    .filter((s) => includeHidden || !s.hidden)
    .map(scriptOut);
  return {
    packId: row.id,
    packName: row.pack_name,
    gameTitle: row.game_title,
    genre: row.genre,
    description: row.description,
    splash: row.splash,
    dataGame: row.data_game,
    detailUrl: row.detail_url,
    hidden: Boolean(row.hidden),
    createdAt: row.created_at,
    scripts,
    scriptCount: scripts.length
  };
}

// includeHidden: true for the admin dashboard (sees everything, so it can
// manage it); false for anything customer-facing (public catalog, checkout
// pricing) so a hidden pack/script behaves as if it doesn't exist.
function listAll({ includeHidden = false } = {}) {
  return statements.listPacks.all()
    .filter((row) => includeHidden || !row.hidden)
    .map((row) => packOut(row, { includeHidden }));
}

function getPack(packId, { includeHidden = false } = {}) {
  const row = statements.findPack.get(packId);
  if (!row || (row.hidden && !includeHidden)) return null;
  return packOut(row, { includeHidden });
}

function getScript(packId, scriptId, { includeHidden = false } = {}) {
  const pack = getPack(packId, { includeHidden });
  if (!pack) return null;
  return pack.scripts.find((s) => s.id === scriptId) || null;
}

function createPack({ packName, gameTitle, genre, description, detailUrl }) {
  const id = uniquePackId(packName);
  const sortOrder = statements.maxPackSort.get().maxSort + 1;
  statements.insertPack.run({
    id,
    packName,
    gameTitle: gameTitle || packName,
    genre: genre || 'other',
    description: description || '',
    splash: 'custom',
    dataGame: (gameTitle || packName).toUpperCase().slice(0, 24),
    detailUrl: detailUrl || null,
    sortOrder
  });
  return getPack(id, { includeHidden: true });
}

function updatePack(packId, { packName, gameTitle, genre, description, detailUrl }) {
  const existing = statements.findPack.get(packId);
  if (!existing) return null;
  statements.updatePack.run({
    id: packId,
    packName: packName || existing.pack_name,
    gameTitle: gameTitle || existing.game_title,
    genre: genre || existing.genre,
    description: description !== undefined ? description : existing.description,
    detailUrl: detailUrl !== undefined ? (detailUrl || null) : existing.detail_url
  });
  return getPack(packId, { includeHidden: true });
}

function setPackHidden(packId, hidden) {
  statements.setPackHidden.run(hidden ? 1 : 0, packId);
  return getPack(packId, { includeHidden: true });
}

function deletePack(packId) {
  statements.deletePack.run(packId);
}

function createScript(packId, { title, description, category, price }) {
  const pack = statements.findPack.get(packId);
  if (!pack) return null;
  const id = uniqueScriptId(packId, title);
  const sortOrder = statements.maxScriptSort.get(packId).maxSort + 1;
  statements.insertScript.run({
    packId,
    id,
    title,
    description: description || '',
    category: category || '',
    priceCents: Math.round(Number(price) * 100),
    sortOrder
  });
  return getPack(packId, { includeHidden: true });
}

function updateScript(packId, scriptId, { title, description, category, price }) {
  const existing = statements.findScript.get(packId, scriptId);
  if (!existing) return null;
  statements.updateScript.run(
    title || existing.title,
    description !== undefined ? description : existing.description,
    category !== undefined ? category : existing.category,
    price !== undefined ? Math.round(Number(price) * 100) : existing.price_cents,
    packId,
    scriptId
  );
  return getPack(packId, { includeHidden: true });
}

function setScriptHidden(packId, scriptId, hidden) {
  statements.setScriptHidden.run(hidden ? 1 : 0, packId, scriptId);
  return getPack(packId, { includeHidden: true });
}

function deleteScript(packId, scriptId) {
  statements.deleteScript.run(packId, scriptId);
  return getPack(packId, { includeHidden: true });
}

function totalScriptCount() {
  return statements.countScripts.get().count;
}

// Server-only lookup (never exposed through scriptOut/the API) — used
// exclusively by the download route to find the real file on disk.
function getScriptFileRecord(packId, scriptId) {
  return statements.findScript.get(packId, scriptId);
}

function setScriptFile(packId, scriptId, { filePath, fileExt, previewSnippet }) {
  statements.setScriptFile.run({ packId, scriptId, filePath, fileExt, previewSnippet });
  return getPack(packId, { includeHidden: true });
}

// Appends one changelog entry and bumps the version — used both by the
// one-time file-linking script (initial 1.0.0 entry) and by admins updating
// a script's underlying file later.
function addChangelogEntry(packId, scriptId, { version, notes }) {
  const existing = statements.findScript.get(packId, scriptId);
  if (!existing) return null;
  let changelog = [];
  try { changelog = JSON.parse(existing.changelog || '[]'); } catch (err) { changelog = []; }
  changelog.unshift({ version, notes, date: new Date().toISOString().slice(0, 10) });
  statements.setScriptVersion.run({ packId, scriptId, version, changelog: JSON.stringify(changelog) });
  return getPack(packId, { includeHidden: true });
}

// Rebuilds a cart entirely from server-known data (visible packs/scripts
// only). Any packId/scriptId that doesn't exist — or has been hidden or
// deleted since it was added to a browser's cart — is silently dropped
// rather than trusted, exactly like the old static-catalog version did.
function priceCart(rawCart) {
  const packs = [];

  for (const entry of Array.isArray(rawCart) ? rawCart : []) {
    const pack = getPack(entry && entry.packId, { includeHidden: false });
    if (!pack) continue;

    const requestedIds = Array.isArray(entry.scriptIds) ? entry.scriptIds : [];
    const items = pack.scripts
      .filter((script) => requestedIds.includes(script.id))
      .map((script) => ({ id: script.id, title: script.title, priceCents: script.priceCents }));

    if (!items.length) continue;

    const totalCents = items.reduce((sum, item) => sum + item.priceCents, 0);
    packs.push({ packId: pack.packId, packName: pack.packName, items, totalCents });
  }

  const totalCents = packs.reduce((sum, pack) => sum + pack.totalCents, 0);
  return { packs, totalCents };
}

// Server-only, unfiltered by hidden/etc — used by the Discord announcement
// sync to check discord_announced_at/discord_message_id, which aren't part
// of the public packOut() shape.
function getRawPack(packId) {
  return statements.rawPack.get(packId);
}

function markPackAnnounced(packId, messageId) {
  statements.markPackAnnounced.run(messageId || null, packId);
}

module.exports = {
  listAll,
  getPack,
  getScript,
  createPack,
  updatePack,
  setPackHidden,
  deletePack,
  createScript,
  updateScript,
  setScriptHidden,
  deleteScript,
  totalScriptCount,
  getScriptFileRecord,
  setScriptFile,
  addChangelogEntry,
  priceCart,
  getRawPack,
  markPackAnnounced
};
