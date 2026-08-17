// Background daemon for the AI/Social hand-off queue — see
// social/VIDEO_JOB_CONTRACT.md for the full contract this implements. That
// doc describes a `video_jobs` table (server/db.js, shared SQLite file) as
// "the entire interface" between social/ and this pipeline: social/ inserts
// a row with a creative brief and status='pending'; this worker claims it,
// renders something, and writes status='completed'/'failed' back. Run it
// with `npm run worker` (from video/) or `node pipeline/worker.mjs` directly.
//
// This talks to the database the same zero-coupling way pipeline/lib/db.mjs
// already does for reads — opening the shared on-disk SQLite file directly,
// no dependency on server/db.js's code. Unlike that read-only connection,
// writing job status back is exactly what the contract asks this side to do.
//
// Scope note: the contract's input_json carries a full pre-written creative
// brief (script beats, brand colors, mood keywords — see
// social/VIDEO_JOB_CONTRACT.md). The actual Remotion compositions
// (src/compositions/SocialVertical.tsx, via PackVideoProps in src/types.ts)
// only support pack-themed rendering keyed by a real catalog packId — there
// is no generic brand-color/custom-copy render path yet. So this worker
// renders claimed jobs through the same pack pipeline orchestrate.mjs's CLI
// uses (buildPackJob: real catalog data, this pipeline's own copywriter),
// keyed off input_json.pack.packId, and only uses the brief's
// targetDurationSeconds as a length hint. Brand-only campaigns (no pack,
// e.g. general brand-awareness) have nothing to key a theme off and are
// failed with a clear error rather than silently mis-rendered.
import "./lib/env.mjs";
import { DatabaseSync } from "node:sqlite";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { buildPackJob } from "./orchestrate.mjs";
import { platformFor } from "./config/platforms.mjs";
import { qualityFor } from "./config/quality.mjs";
import { pacingFor } from "./config/pacing.mjs";
import { lengthFor } from "./config/length.mjs";
import { angleFor } from "./config/angles.mjs";
import { speedFor } from "./config/speed.mjs";
import { animationFor } from "./config/animation.mjs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const DB_PATH = process.env.DB_PATH || join(ROOT, "data", "scripforge.db");
const POLL_INTERVAL_MS = Number(process.env.VIDEO_WORKER_POLL_MS) || 15000;
const WORKER_ID = `video-worker-${process.pid}`;

// social/VIDEO_JOB_CONTRACT.md's platform values -> this pipeline's platform
// preset ids (pipeline/config/platforms.mjs). "promo" has no equivalent on
// the contract side, so it's never selected here.
const PLATFORM_MAP = { tiktok: "tiktok", youtube_shorts: "shorts" };

function log(...args) {
  console.log("[video-worker]", ...args);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Atomic claim: the UPDATE's WHERE status='pending' is checked-and-set by
// SQLite as one statement, so this is race-safe even if multiple worker
// processes poll concurrently — only one can flip a given row's status.
function claimNextJob(db) {
  const candidates = db
    .prepare(`SELECT id FROM video_jobs WHERE status = 'pending' ORDER BY priority DESC, created_at ASC LIMIT 5`)
    .all();
  for (const { id } of candidates) {
    const result = db
      .prepare(
        `UPDATE video_jobs SET status = 'rendering', claimed_by = ?, claimed_at = datetime('now'),
           attempts = attempts + 1, updated_at = datetime('now') WHERE id = ? AND status = 'pending'`
      )
      .run(WORKER_ID, id);
    if (result.changes === 1) {
      return db.prepare(`SELECT * FROM video_jobs WHERE id = ?`).get(id);
    }
  }
  return null;
}

function markCompleted(db, id, outPath, meta) {
  db.prepare(
    `UPDATE video_jobs SET status = 'completed', output_path = ?, output_meta_json = ?, error = NULL,
       updated_at = datetime('now') WHERE id = ?`
  ).run(outPath, JSON.stringify(meta), id);
}

function markFailed(db, id, error) {
  db.prepare(`UPDATE video_jobs SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?`).run(
    String(error).slice(0, 2000),
    id
  );
}

async function renderJob(spec) {
  const platformId = PLATFORM_MAP[spec.platform];
  if (!platformId) {
    throw new Error(`Unsupported platform "${spec.platform}" — this worker only renders ${Object.keys(PLATFORM_MAP).join(", ")}.`);
  }
  const packId = spec.pack?.packId;
  if (!packId) {
    throw new Error(
      "Brand-only campaigns (input_json.pack is null) aren't supported yet — the pack-themed compositions have no generic brand-color rendering path."
    );
  }

  const quality = qualityFor("standard");
  const pacing = pacingFor("normal");
  const length = lengthFor(spec.targetDurationSeconds);
  const angle = angleFor("auto");
  const speed = speedFor("normal");
  const animation = animationFor("moderate");
  const options = { captionsEnabled: true, ttsEnabled: true, musicEnabled: true, beatMatch: false, speed, animation };

  const { outPath, report } = await buildPackJob(packId, platformId, quality, pacing, length, angle, options);
  const platform = platformFor(platformId);
  const meta = {
    durationSeconds: report.durationSec,
    width: platform.width,
    height: platform.height,
    fileSizeBytes: statSync(outPath).size,
  };
  return { pass: report.pass, outPath, meta, checks: report.checks };
}

async function tick(db) {
  const job = claimNextJob(db);
  if (!job) return false;
  log(`claimed job ${job.id} (campaign ${job.campaign_id})`);
  try {
    const spec = JSON.parse(job.input_json);
    const result = await renderJob(spec);
    if (result.pass) {
      markCompleted(db, job.id, result.outPath, result.meta);
      log(`job ${job.id} completed -> ${result.outPath}`);
    } else {
      const failing = result.checks.filter((c) => !c.pass).map((c) => c.name).join(", ") || "unknown";
      markFailed(db, job.id, `QA failed: ${failing}`);
      log(`job ${job.id} failed QA: ${failing}`);
    }
  } catch (err) {
    markFailed(db, job.id, err.message || err);
    log(`job ${job.id} failed:`, err.message || err);
  }
  return true;
}

let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

async function main() {
  if (!existsSync(DB_PATH)) {
    throw new Error(`Store database not found at ${DB_PATH}. Start the main app once (npm start in the project root) so it can create/seed it.`);
  }
  const db = new DatabaseSync(DB_PATH);
  log(`started (${WORKER_ID}), polling video_jobs every ${POLL_INTERVAL_MS}ms`);
  while (!stopping) {
    const worked = await tick(db);
    if (!worked) await sleep(POLL_INTERVAL_MS);
  }
  db.close();
  log("stopped");
}

main().catch((err) => {
  console.error("[video-worker] FATAL:", err);
  process.exitCode = 1;
});
