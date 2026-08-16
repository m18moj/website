// CRUD + selection logic for social_accounts — connected TikTok/YouTube
// accounts the automation can post to. When no accounts exist for a
// platform, callers fall back to the legacy single-account-via-env-vars
// setup (social/config.js / platforms/tiktok.js / platforms/youtube.js),
// so an install that hasn't added any accounts yet keeps working exactly as
// before — this table is a pure addition, not a replacement.
const db = require('../db');

const columns = `
  id, platform, label, enabled, niche_pack_ids AS nichePackIdsJson, credentials_json AS credentialsJson,
  last_used_at AS lastUsedAt, created_at AS createdAt, updated_at AS updatedAt
`;

const statements = {
  insert: db.prepare(`
    INSERT INTO social_accounts (platform, label, enabled, niche_pack_ids, credentials_json)
    VALUES (@platform, @label, @enabled, @nichePackIdsJson, @credentialsJson)
  `),
  findById: db.prepare(`SELECT ${columns} FROM social_accounts WHERE id = ?`),
  list: db.prepare(`SELECT ${columns} FROM social_accounts ORDER BY platform ASC, label ASC`),
  listEnabledByPlatform: db.prepare(`SELECT ${columns} FROM social_accounts WHERE platform = ? AND enabled = 1 ORDER BY last_used_at ASC NULLS FIRST, id ASC`),
  update: db.prepare(`
    UPDATE social_accounts SET label = @label, enabled = @enabled, niche_pack_ids = @nichePackIdsJson,
      credentials_json = @credentialsJson, updated_at = datetime('now')
    WHERE id = @id
  `),
  setEnabled: db.prepare(`UPDATE social_accounts SET enabled = @enabled, updated_at = datetime('now') WHERE id = @id`),
  touchLastUsed: db.prepare(`UPDATE social_accounts SET last_used_at = datetime('now') WHERE id = ?`),
  remove: db.prepare(`DELETE FROM social_accounts WHERE id = ?`)
};

// Never returned to the frontend as-is — used only server-side (platform
// clients need the real secrets to mint tokens).
function parseCredentials(row) {
  try { return JSON.parse(row.credentialsJson || '{}'); } catch { return {}; }
}

function parseNiche(row) {
  try { return JSON.parse(row.nichePackIdsJson || 'null'); } catch { return null; }
}

// Redacted view for the admin UI — secrets are write-only from the client's
// perspective (shown once at entry time, then just "configured").
function toPublic(row) {
  const creds = parseCredentials(row);
  return {
    id: row.id,
    platform: row.platform,
    label: row.label,
    enabled: Boolean(row.enabled),
    nichePackIds: parseNiche(row),
    credentialsConfigured: Object.values(creds).some((v) => Boolean(v)),
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function create({ platform, label, credentials, nichePackIds = null, enabled = true }) {
  const result = statements.insert.run({
    platform,
    label,
    enabled: enabled ? 1 : 0,
    nichePackIdsJson: nichePackIds && nichePackIds.length ? JSON.stringify(nichePackIds) : null,
    credentialsJson: JSON.stringify(credentials || {})
  });
  return statements.findById.get(result.lastInsertRowid);
}

function findById(id) {
  return statements.findById.get(id);
}

function findByIdPublic(id) {
  const row = findById(id);
  return row ? toPublic(row) : null;
}

function list() {
  return statements.list.all();
}

function listPublic() {
  return list().map(toPublic);
}

// Round-robin among enabled accounts for a platform (oldest last_used_at
// first), optionally scoped to accounts whose niche includes packId (or
// have no niche restriction). Returns null when nothing is configured, the
// signal callers use to fall back to the legacy single-account env setup.
function listEnabledForPlatform(platform, packId = null) {
  const rows = statements.listEnabledByPlatform.all(platform);
  if (!rows.length) return [];
  if (!packId) return rows;
  return rows.filter((row) => {
    const niche = parseNiche(row);
    return !niche || !niche.length || niche.includes(packId);
  });
}

function credentialsFor(id) {
  const row = findById(id);
  return row ? parseCredentials(row) : null;
}

function update(id, { label, enabled, credentials, nichePackIds }) {
  const current = statements.findById.get(id);
  if (!current) return null;
  const currentCreds = parseCredentials(current);
  statements.update.run({
    id,
    label: label !== undefined ? label : current.label,
    enabled: (enabled !== undefined ? enabled : Boolean(current.enabled)) ? 1 : 0,
    nichePackIdsJson: nichePackIds !== undefined
      ? (nichePackIds && nichePackIds.length ? JSON.stringify(nichePackIds) : null)
      : current.nichePackIdsJson,
    // Credential fields are merged, not replaced — the admin form can update
    // just the refresh token without re-pasting the client id/secret.
    credentialsJson: JSON.stringify(credentials ? { ...currentCreds, ...credentials } : currentCreds)
  });
  return statements.findById.get(id);
}

function setEnabled(id, enabled) {
  statements.setEnabled.run({ id, enabled: enabled ? 1 : 0 });
  return statements.findById.get(id);
}

function touchLastUsed(id) {
  statements.touchLastUsed.run(id);
}

function remove(id) {
  statements.remove.run(id);
}

module.exports = {
  create,
  findById,
  findByIdPublic,
  list,
  listPublic,
  listEnabledForPlatform,
  credentialsFor,
  update,
  setEnabled,
  touchLastUsed,
  remove,
  toPublic
};
