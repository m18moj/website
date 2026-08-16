// Read-only view of the store's real catalog data (packs + scripts), so
// generated ad copy is always grounded in the actual product rather than
// invented numbers. Opens the DB with { readOnly: true } and never writes —
// this project has zero coupling to server/db.js or any store-app code, by
// design (the two sessions working on this repo must not step on each
// other), it just reads the same on-disk SQLite file directly.
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");
const DB_PATH = process.env.DB_PATH || join(ROOT, "data", "scripforge.db");

function open() {
  if (!existsSync(DB_PATH)) {
    throw new Error(
      `Store database not found at ${DB_PATH}. Start the main app once (npm start in the project root) so it can create/seed it.`
    );
  }
  return new DatabaseSync(DB_PATH, { readOnly: true });
}

export function listPacks() {
  const db = open();
  try {
    const packs = db
      .prepare(
        `SELECT id, pack_name, game_title, genre, description, splash, detail_url
         FROM packs WHERE hidden = 0 ORDER BY sort_order ASC, pack_name ASC`
      )
      .all();
    const priceStats = db
      .prepare(
        `SELECT pack_id, COUNT(*) AS count, MIN(price_cents) AS minCents, MAX(price_cents) AS maxCents
         FROM scripts WHERE hidden = 0 GROUP BY pack_id`
      )
      .all();
    const statsByPack = Object.fromEntries(priceStats.map((s) => [s.pack_id, s]));
    return packs.map((p) => ({
      id: p.id,
      packName: p.pack_name,
      gameTitle: p.game_title,
      genre: p.genre,
      description: p.description,
      splash: p.splash,
      detailUrl: p.detail_url,
      scriptCount: statsByPack[p.id]?.count ?? 0,
      minPriceCents: statsByPack[p.id]?.minCents ?? 0,
      maxPriceCents: statsByPack[p.id]?.maxCents ?? 0,
    }));
  } finally {
    db.close();
  }
}

export function getPack(packId) {
  const packs = listPacks();
  const pack = packs.find((p) => p.id === packId);
  if (!pack) throw new Error(`Unknown packId "${packId}". Known packs: ${packs.map((p) => p.id).join(", ")}`);
  return pack;
}

export function listScripts(packId, limit = 6) {
  const db = open();
  try {
    return db
      .prepare(
        `SELECT id, title, description, category, price_cents, preview_snippet, file_path, file_ext
         FROM scripts WHERE pack_id = ? AND hidden = 0 ORDER BY sort_order ASC LIMIT ?`
      )
      .all(packId, limit);
  } finally {
    db.close();
  }
}

// The DB's own preview_snippet is deliberately truncated to ~25 lines for
// the catalog page (header comment + imports, see README §4) — not enough
// to show real logic. The full source file always exists on disk
// (generated-scripts/<pack>/<script>.<ext>), so read that instead for the
// video's code card.
export function readScriptSource(script) {
  if (!script?.file_path) return script?.preview_snippet ?? "";
  const abs = join(ROOT, script.file_path);
  if (!existsSync(abs)) return script.preview_snippet ?? "";
  return readFileSync(abs, "utf8");
}

export function totalScriptCount() {
  const db = open();
  try {
    return db.prepare(`SELECT COUNT(*) AS c FROM scripts WHERE hidden = 0`).get().c;
  } finally {
    db.close();
  }
}

// Trims a stored preview_snippet (a big header-comment block followed by
// real code) down to a handful of representative lines for the on-screen
// CodeCard — strip the comment header and import/package noise, keep the
// first real statements, hard-wrap long lines so they fit the card.
export function extractCodeLines(previewSnippet, maxLines = 4, maxWidth = 42) {
  if (!previewSnippet) return [];
  const rawLines = previewSnippet.split("\n");
  let inBlockComment = false;
  const kept = [];
  for (const raw of rawLines) {
    const line = raw.trimEnd();
    if (line.trim().startsWith("/*")) inBlockComment = true;
    if (inBlockComment) {
      if (line.includes("*/")) inBlockComment = false;
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^(import|package|using|require\(|local\s+\w+\s*=\s*require)/.test(trimmed)) continue;
    if (trimmed.startsWith("//") || trimmed.startsWith("--") || trimmed.startsWith("#")) continue;
    if (/^[{}]$/.test(trimmed)) continue;
    kept.push(line.length > maxWidth ? `${line.slice(0, maxWidth - 1)}…` : line);
    if (kept.length >= maxLines) break;
  }
  return kept;
}

export function priceLabel(cents, currency = "GBP") {
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "£";
  return `${symbol}${(cents / 100).toFixed(2)}`;
}
