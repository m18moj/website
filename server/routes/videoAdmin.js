// Backend for the Video Studio admin tab (video-admin/index.html) — a
// separate dashboard from the store's own admin panel, same pattern as
// bot-admin (server/routes/botAdmin.js): its own page, gated by the same
// requireAdmin, mounted under its own /api prefix.
//
// This route file is the *integration layer* between the admin UI and the
// video-generation pipeline (video/pipeline/), which is being built out by a
// separate, independent process — see the note in video/pipeline/lib/env.mjs
// about the project's zero-coupling design. This file therefore NEVER writes
// into video/pipeline/ or video/src/; it only (a) shells out to the npm
// scripts that pipeline exposes, and (b) read-only `import()`s a couple of
// its already-finished, dependency-light library modules (qa.mjs,
// config/platforms.mjs) when they exist, so QA and platform specs are always
// the pipeline's real, current logic rather than a stale copy kept here.
// Every capability degrades gracefully when the underlying script/module
// doesn't exist yet — see GET /status, which is exactly the readiness map
// the front-end uses to grey out what isn't wired up yet.
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { pathToFileURL } = require('url');
const { body, query, param, validationResult } = require('express-validator');

const { requireAdmin } = require('../middleware/auth');
const { verifyCsrfToken } = require('../middleware/csrf');
const { videoRenderLimiter, securityActionLimiter } = require('../middleware/rateLimit');

const catalogModel = require('../models/catalog');
const settingsModel = require('../models/settings');
const jobsModel = require('../models/videoAdminJobs');
const db = require('../db');

const router = express.Router();
router.use(requireAdmin);

const ROOT = path.join(__dirname, '..', '..');
const VIDEO_ROOT = path.join(ROOT, 'video');
// The pipeline's orchestrate.mjs (see PIPELINE_SCRIPTS.orchestrate) writes
// finished renders to video/output/<platform>/<packId>.mp4 (or
// video/output/website-premium.mp4) — NOT video/out/, which only holds a
// couple of one-off smoke-test files from before the pipeline existed.
const OUT_DIR = path.join(VIDEO_ROOT, 'output');
// Timestamped once at process start — the "last update" anchor the dashboard
// shows for the live Node backend (server start/restart = latest code state).
const SERVER_STARTED_AT = new Date().toISOString();
// Owned entirely by this admin layer (not video/pipeline/), so it can never
// collide with that project's own on-disk state.
const THUMB_DIR = path.join(ROOT, 'data', 'video-thumbs');
fs.mkdirSync(THUMB_DIR, { recursive: true });

const PIPELINE_SCRIPTS = {
  listPacks: 'pipeline/scripts/list-packs.mjs',
  genCopy: 'pipeline/scripts/gen-copy.mjs',
  genAudio: 'pipeline/scripts/gen-audio.mjs',
  genSfx: 'pipeline/scripts/gen-sfx.mjs',
  renderOne: 'pipeline/scripts/render-one.mjs',
  qaOne: 'pipeline/scripts/qa-one.mjs',
  orchestrate: 'pipeline/orchestrate.mjs',
  worker: 'pipeline/worker.mjs'
};

const PIPELINE_LIB = {
  render: 'pipeline/lib/render.mjs',
  tts: 'pipeline/lib/tts.mjs',
  ttsSapi: 'pipeline/lib/tts-sapi.mjs',
  ttsEdge: 'pipeline/lib/tts-edge.mjs',
  ttsElevenLabs: 'pipeline/lib/tts-elevenlabs.mjs',
  mix: 'pipeline/lib/mix.mjs',
  qa: 'pipeline/lib/qa.mjs',
  copywriter: 'pipeline/lib/copywriter.mjs',
  music: 'pipeline/lib/music.mjs',
  sfx: 'pipeline/lib/sfx.mjs',
  timeline: 'pipeline/lib/timeline.mjs',
  wav: 'pipeline/lib/wav.mjs',
  platforms: 'pipeline/config/platforms.mjs',
  moods: 'pipeline/config/moods.mjs',
  quality: 'pipeline/config/quality.mjs',
  pacing: 'pipeline/config/pacing.mjs',
  length: 'pipeline/config/length.mjs',
  angles: 'pipeline/config/angles.mjs',
  speed: 'pipeline/config/speed.mjs',
  animation: 'pipeline/config/animation.mjs'
};

// Mirrors each pipeline config module's own preset ids — kept as plain
// literals (not imported) since this route file never touches pipeline/
// internals directly (see the note above); the GET /*-presets routes below
// serve the pipeline modules' real labels/descriptions when they exist,
// these arrays are only the express-validator allowlists.
const QUALITY_TIERS = ['draft', 'standard', 'high', 'ultra'];
const PACING_TIERS = ['contemplative', 'relaxed', 'gentle', 'normal', 'brisk', 'fast', 'rapid', 'hyper', 'flash', 'strobe'];
const LENGTH_TIERS = ['auto', 'micro', 'blink', 'short', 'compact', 'medium', 'standard', 'long', 'extended', 'deep', 'marathon'];
const ANGLE_TIERS = ['auto', 'product_showcase', 'tutorial_snippet', 'before_after', 'social_proof', 'behind_the_scenes', 'competitive_comparison', 'meme_style', 'feature_spotlight', 'problem_solution'];
const SPEED_TIERS = ['slow', 'normal', 'fast', 'rapid'];
const ANIMATION_TIERS = ['subtle', 'moderate', 'flashy', 'maximal'];

const KINDS = ['tiktok', 'shorts', 'promo', 'website'];

function exists(rel) {
  return fs.existsSync(path.join(VIDEO_ROOT, rel));
}

// Mirrors video/pipeline/lib/env.mjs's own fallback chain, read-only, so the
// status panel can report "configured" without needing that module loaded.
function envKeyPresent(name) {
  const files = [path.join(VIDEO_ROOT, '.env'), path.join(ROOT, '.env'), path.join(ROOT, 'discord-bot', '.env')];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const match = fs.readFileSync(file, 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'));
    if (match && match[1].trim()) return true;
  }
  return false;
}

function toolAvailable(cmd) {
  return new Promise((resolve) => execFile(cmd, ['-version'], (err) => resolve(!err)));
}

function gpuInfo() {
  return new Promise((resolve) => {
    execFile('nvidia-smi', ['--query-gpu=name,driver_version', '--format=csv,noheader'], (err, stdout) => {
      if (err) return resolve(null);
      const [name, driver] = stdout.trim().split(',').map((s) => s.trim());
      resolve(name ? { name, driver } : null);
    });
  });
}

// Cache-busts on the source file's own mtime, so edits from the pipeline
// session are picked up without an admin-server restart, while repeated
// requests between edits reuse Node's normal ESM module cache.
async function importPipelineModule(rel) {
  const abs = path.join(VIDEO_ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  const mtimeMs = fs.statSync(abs).mtimeMs;
  try {
    return await import(`${pathToFileURL(abs).href}?v=${mtimeMs}`);
  } catch (err) {
    console.error(`[video-admin] Failed to import ${rel}: ${err.message}`);
    return null;
  }
}

function walkMp4s(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMp4s(abs, out);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.mp4')) {
      const stat = fs.statSync(abs);
      out.push({ absPath: abs, relPath: path.relative(OUT_DIR, abs).replace(/\\/g, '/'), name: entry.name, mtimeMs: stat.mtimeMs, sizeBytes: stat.size });
    }
  }
  return out;
}

function listOutputFiles() {
  return walkMp4s(OUT_DIR).sort((a, b) => b.mtimeMs - a.mtimeMs);
}

// orchestrate.mjs nests pack renders under output/<platformId>/<packId>.mp4,
// so the platform lives in the directory, not the filename — check that
// first, then fall back to filename sniffing for stragglers (e.g. the old
// out/smoke-*.mp4 files, or website-premium.mp4).
function guessKindFromRelPath(relPath) {
  const lower = relPath.toLowerCase().replace(/\\/g, '/');
  const dir = lower.split('/')[0];
  if (KINDS.includes(dir)) return dir;
  if (lower.includes('website')) return 'website';
  for (const kind of KINDS) if (lower.includes(kind)) return kind;
  if (lower.includes('social')) return 'promo';
  return null;
}

// Which social platforms an output of a given render kind may be posted to.
// 'promo' is the flexible one (any platform); website promos aren't
// short-form social content and can't be scheduled at all.
const SCHEDULABLE_KINDS = ['tiktok', 'shorts', 'promo'];
function allowedPlatformsForKind(kind) {
  if (kind === 'tiktok') return ['tiktok'];
  if (kind === 'shorts') return ['youtube_shorts'];
  if (kind === 'promo') return ['tiktok', 'youtube_shorts'];
  return [];
}

function packIdFromAbsPath(absPath) {
  return path.basename(absPath).replace(/\.mp4$/i, '');
}

// Strips characters that are unsafe in Windows/macOS filenames while keeping
// the result human-readable. Collapses whitespace to underscores and trims
// leading/trailing dashes, dots, underscores and spaces (Windows doesn't
// like trailing dots; underscores look ugly as leading/trailing filler).
// No length limit — callers truncate after appending the extension.
function sanitizeFilename(str) {
  return (str || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/[\s]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[-._\s]+|[-._\s]+$/g, '');
}

// Builds the organised download path + filename for a rendered video.
//
// Structure:  <platform>/<game>/<datetime>_<game>_<quality>_<pacing>_<length>_<angle>_subtitles-music-speech.<ext>
// Example:    tiktok/Minecraft/2026-08-16_19-42-31_Minecraft_high_fast_22s_feature-spotlight_subtitles-music-speech.mp4
//
// Falls back gracefully when no matching video_admin_jobs row is found (e.g.
// website renders or legacy outputs): uses packId from the filename and
// "unknown" for missing option values.
function buildDownloadFilename(absPath) {
  const ext = path.extname(absPath) || '.mp4';

  // Look up the most recent completed job for this output to get full
  // generation metadata (quality, pacing, length, angle, timestamp).
  const job = jobsModel.findByOutputPath(absPath);

  // Prefer the job's stored packId — packIdFromAbsPath() extracts the
  // basename which only works for the old flat layout; an organised path
  // like tiktok/Minecraft/2026-08-16_...mp4 has the full datetime stem as
  // the basename, not the pack id.
  const packId = (job && job.packId) || packIdFromAbsPath(absPath);

  const kind = job ? job.kind : guessKindFromRelPath(path.relative(OUT_DIR, absPath).replace(/\\/g, '/'));
  const platformDir = kind || 'promo';

  // Resolve game title from the catalog; fall back to the raw pack id.
  const pack = packId ? catalogModel.getPack(packId, { includeHidden: true }) : null;
  const gameTitle = pack ? pack.gameTitle : packId;

  // Generation timestamp from the job's created_at (UTC).
  let dateStr = 'unknown-date';
  let timeStr = '';
  if (job && job.createdAt) {
    const d = new Date(job.createdAt.replace(' ', 'T') + 'Z');
    if (!Number.isNaN(d.getTime())) {
      const pad = (n) => String(n).padStart(2, '0');
      dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      timeStr = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    }
  }

  const quality = job && job.quality ? job.quality : 'standard';
  const pacing = job && job.pacing ? job.pacing : 'normal';
  const length = job && job.length ? job.length : 'auto';
  const angle = job && job.angle ? job.angle : 'auto';

  const datetimePart = timeStr ? `${dateStr}_${timeStr}` : dateStr;
  // Truncate the base name (without extension) so the extension is never
  // chopped off by the 80-char safety limit.
  const rawBase = `${datetimePart}_${gameTitle}_${quality}_${pacing}_${length}_${angle}_subtitles-music-speech`;
  const safeBase = sanitizeFilename(rawBase).substring(0, 80 - ext.length);
  const filename = `${safeBase}${ext}`;

  const downloadDir = sanitizeFilename(platformDir);
  const gameDir = sanitizeFilename(gameTitle);

  return { organizedPath: `${downloadDir}/${gameDir}`, filename };
}

// Moves a freshly-rendered video from the pipeline's flat output location
// (video/output/<platform>/<packId>.mp4) into the organised directory
// structure (video/output/<platform>/<game>/<datetime>_<game>_<options>.mp4).
//
// Returns the new absolute path.  On any failure the original path is
// returned unchanged so the job still completes — the organise step is
// best-effort and never blocks a successful render from being stored.
function organiseOutput(absPath, job) {
  try {
    const ext = path.extname(absPath) || '.mp4';
    const packId = packIdFromAbsPath(absPath);

    // Platform directory — already correct for pack renders; guess from
    // the relative path for any edge-case stragglers.
    const rel = path.relative(OUT_DIR, absPath).replace(/\\/g, '/');
    const kind = (job && job.kind) || guessKindFromRelPath(rel) || 'promo';
    const platformDir = sanitizeFilename(kind);

    // Resolve game title from the catalog; fall back to the raw pack id.
    const pack = packId ? catalogModel.getPack(packId, { includeHidden: true }) : null;
    const gameTitle = pack ? pack.gameTitle : packId;
    const gameDir = sanitizeFilename(gameTitle);

    // Generation timestamp from the job's created_at (UTC).
    let dateStr = 'unknown-date';
    let timeStr = '';
    if (job && job.createdAt) {
      const d = new Date(job.createdAt.replace(' ', 'T') + 'Z');
      if (!Number.isNaN(d.getTime())) {
        const pad = (n) => String(n).padStart(2, '0');
        dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        timeStr = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
      }
    }

    const quality = (job && job.quality) || 'standard';
    const pacing = (job && job.pacing) || 'normal';
    const length = (job && job.length) || 'auto';
    const angle = (job && job.angle) || 'auto';

    const datetimePart = timeStr ? `${dateStr}_${timeStr}` : dateStr;
    const rawBase = `${datetimePart}_${gameTitle}_${quality}_${pacing}_${length}_${angle}_subtitles-music-speech`;
    const safeBase = sanitizeFilename(rawBase).substring(0, 80 - ext.length);
    const filename = `${safeBase}${ext}`;

    // Build the target directory and move the file.
    const targetDir = path.join(OUT_DIR, platformDir, gameDir);
    fs.mkdirSync(targetDir, { recursive: true });
    let targetPath = path.join(targetDir, filename);

    // Prevent overwrites — append a short random suffix when a file
    // already exists at the target path (extremely unlikely but safe).
    if (fs.existsSync(targetPath)) {
      const suffix = crypto.randomBytes(3).toString('hex');
      const base = filename.slice(0, -ext.length);
      targetPath = path.join(targetDir, `${base}_${suffix}${ext}`);
    }

    fs.renameSync(absPath, targetPath);
    return targetPath;
  } catch (err) {
    console.error(`[video-admin] organiseOutput failed for ${absPath}: ${err.message}`);
    return absPath;
  }
}

function sendRangeFile(req, res, absPath, contentType) {
  if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'File not found on disk.' });
  const stat = fs.statSync(absPath);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  const range = req.headers.range;
  if (!range) {
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(absPath).pipe(res);
    return;
  }
  const match = /bytes=(\d+)-(\d*)/.exec(range);
  const start = match ? parseInt(match[1], 10) : 0;
  const end = match && match[2] ? parseInt(match[2], 10) : stat.size - 1;
  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
  res.setHeader('Content-Length', end - start + 1);
  fs.createReadStream(absPath, { start, end }).pipe(res);
}

// Edge neural TTS is a Python package + internet check (see tts-edge.mjs) —
// reports readiness without hard-failing when the module is still building.
async function edgeTtsAvailable() {
  const mod = await importPipelineModule(PIPELINE_LIB.ttsEdge);
  if (!mod || typeof mod.isEdgeTtsAvailable !== 'function') return false;
  try { return Boolean(mod.isEdgeTtsAvailable()); } catch (err) { return false; }
}

// --- Status / readiness ----------------------------------------------------

router.get('/status', async (req, res) => {
  const [ffmpeg, ffprobe, gpu, edge] = await Promise.all([toolAvailable('ffmpeg'), toolAvailable('ffprobe'), gpuInfo(), edgeTtsAvailable()]);
  const scripts = Object.fromEntries(Object.entries(PIPELINE_SCRIPTS).map(([k, p]) => [k, exists(p)]));
  const lib = Object.fromEntries(Object.entries(PIPELINE_LIB).map(([k, p]) => [k, exists(p)]));
  const outputs = listOutputFiles();
  res.json({
    server: {
      startedAt: SERVER_STARTED_AT,
      uptimeSec: Math.round(process.uptime()),
      pid: process.pid,
      node: process.version,
      platform: process.platform
    },
    tools: { ffmpeg, ffprobe, gpu },
    tts: { elevenlabs: envKeyPresent('ELEVENLABS_API_KEY'), edge, sapi: process.platform === 'win32' && exists('pipeline/lib/tts-sapi.ps1') },
    anthropic: envKeyPresent('ANTHROPIC_API_KEY'),
    dependenciesInstalled: exists('node_modules/.package-lock.json'),
    scripts,
    lib,
    renderReady: scripts.orchestrate,
    smokeTests: { social: exists('out/smoke-social.mp4'), website: exists('out/smoke-website.mp4') },
    latestFiles: outputs.slice(0, 5).map((f) => ({ name: f.name, relPath: f.relPath, sizeBytes: f.sizeBytes, mtimeMs: f.mtimeMs, modified: new Date(f.mtimeMs).toISOString() })),
    lastRenderAt: outputs.length ? new Date(outputs[0].mtimeMs).toISOString() : null
  });
});

// --- Render-control presets (quality/pacing/length/video-type) -------------
//
// One shared shape for every render-control dropdown in Video Studio
// (quality slider, pacing, length, video type/angle) — each backed by its
// own pipeline/config/*.mjs module so labels/descriptions always match the
// pipeline's real presets, never a stale copy kept here. Degrades
// gracefully (falls back to bare ids) when the pipeline module isn't built
// yet, same as every other readiness-gated panel on this dashboard.
async function presetsFor(libKey, presetsExport, orderExport, fallbackIds) {
  const mod = await importPipelineModule(PIPELINE_LIB[libKey]);
  if (mod && mod[presetsExport] && mod[orderExport]) {
    return mod[orderExport].map((id) => mod[presetsExport][id]);
  }
  return fallbackIds.map((id) => ({ id, label: id, description: '' }));
}

router.get('/quality-presets', async (req, res) => {
  res.json({ presets: await presetsFor('quality', 'QUALITY_PRESETS', 'QUALITY_ORDER', QUALITY_TIERS) });
});

router.get('/pacing-presets', async (req, res) => {
  res.json({ presets: await presetsFor('pacing', 'PACING_PRESETS', 'PACING_ORDER', PACING_TIERS) });
});

router.get('/length-presets', async (req, res) => {
  res.json({ presets: await presetsFor('length', 'LENGTH_PRESETS', 'LENGTH_ORDER', LENGTH_TIERS) });
});

router.get('/angle-presets', async (req, res) => {
  res.json({ presets: await presetsFor('angles', 'ANGLE_PRESETS', 'ANGLE_ORDER', ANGLE_TIERS) });
});

router.get('/speed-presets', async (req, res) => {
  res.json({ presets: await presetsFor('speed', 'SPEED_PRESETS', 'SPEED_ORDER', SPEED_TIERS) });
});

router.get('/animation-presets', async (req, res) => {
  res.json({ presets: await presetsFor('animation', 'ANIMATION_PRESETS', 'ANIMATION_ORDER', ANIMATION_TIERS) });
});

// Combined fetch for the dashboard's render-controls panel — one round
// trip instead of six on every page load.
router.get('/render-presets', async (req, res) => {
  const [quality, pacing, length, angle, speed, animation] = await Promise.all([
    presetsFor('quality', 'QUALITY_PRESETS', 'QUALITY_ORDER', QUALITY_TIERS),
    presetsFor('pacing', 'PACING_PRESETS', 'PACING_ORDER', PACING_TIERS),
    presetsFor('length', 'LENGTH_PRESETS', 'LENGTH_ORDER', LENGTH_TIERS),
    presetsFor('angles', 'ANGLE_PRESETS', 'ANGLE_ORDER', ANGLE_TIERS),
    presetsFor('speed', 'SPEED_PRESETS', 'SPEED_ORDER', SPEED_TIERS),
    presetsFor('animation', 'ANIMATION_PRESETS', 'ANIMATION_ORDER', ANIMATION_TIERS)
  ]);
  res.json({ quality, pacing, length, angle, speed, animation });
});

// --- Packs (real catalog data, never invented) ------------------------------

router.get('/packs', (req, res) => {
  const packs = catalogModel.listAll({ includeHidden: true });
  const outputs = listOutputFiles();
  const packs2 = packs.map((p) => {
    const forThisPack = outputs.filter((f) => f.name.toLowerCase().includes(p.packId.toLowerCase()));
    const renders = {};
    for (const kind of KINDS) renders[kind] = forThisPack.some((f) => guessKindFromRelPath(f.relPath) === kind);
    return {
      packId: p.packId,
      packName: p.packName,
      gameTitle: p.gameTitle,
      genre: p.genre,
      hidden: p.hidden,
      scriptCount: p.scriptCount,
      renders
    };
  });
  res.json({ packs: packs2 });
});

// --- Output gallery ----------------------------------------------------------

const probeCache = new Map();

function ffprobeJson(absPath) {
  return new Promise((resolve) => {
    execFile('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', absPath], { maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve(null);
      try { resolve(JSON.parse(stdout)); } catch { resolve(null); }
    });
  });
}

router.get('/outputs', async (req, res) => {
  const publicationsModel = require('../../social/models/publications');
  const files = listOutputFiles();
  const results = await Promise.all(files.map(async (f) => {
    const cached = probeCache.get(f.absPath);
    if (cached && cached.mtimeMs === f.mtimeMs) return { ...f, ...cached.data };
    const probe = await ffprobeJson(f.absPath);
    const vStream = probe?.streams?.find((s) => s.codec_type === 'video');
    const aStream = probe?.streams?.find((s) => s.codec_type === 'audio');
    const data = {
      durationSec: probe ? Number(probe.format?.duration ?? 0) : null,
      width: vStream?.width ?? null,
      height: vStream?.height ?? null,
      hasAudio: Boolean(aStream),
      codec: vStream?.codec_name ?? null,
      kind: guessKindFromRelPath(f.relPath)
    };
    probeCache.set(f.absPath, { mtimeMs: f.mtimeMs, data });
    return { ...f, ...data };
  }));
  const withApproval = results.map((f) => {
    const pub = publicationsModel.findByOutputPath(f.absPath);
    // Popularity prediction (see scoreAndMaybeRedoJob) is looked up by
    // matching output path rather than stored on the gallery item directly,
    // same live-join approach as GET /intelligence — the gallery always
    // reflects video_admin_jobs' current data instead of a stale copy.
    const job = jobsModel.findByOutputPath(f.absPath);
    return {
      ...f,
      approval: pub && ['scheduled', 'publishing', 'published'].includes(pub.status)
        ? { scheduled: true, publicationId: pub.id, status: pub.status, platform: pub.platform, scheduledAt: pub.scheduledAt, title: pub.title }
        : null,
      predictedScore: job ? job.predictedScore : null,
      isRedo: Boolean(job && job.redoOf),
      hasRedo: Boolean(job && jobsModel.findRedoChild(job.id))
    };
  });
  res.json({ outputs: withApproval });
});

// Resolves a render's absolute path from its gallery relPath (the same
// guard /outputs/media uses), or null when the file isn't under OUT_DIR.
function resolveOutput(rel) {
  if (typeof rel !== 'string' || !rel) return null;
  const abs = path.resolve(OUT_DIR, rel);
  if (!abs.startsWith(path.resolve(OUT_DIR)) || !fs.existsSync(abs)) return null;
  return abs;
}

// Default title/description/hashtags + suggested slot for a render the admin
// is about to approve — deterministic (no LLM), so it always works, and the
// admin can edit every field before confirming.
router.get('/outputs/approval-draft', [
  query('path').isString(),
  query('platform').isIn(['tiktok', 'youtube_shorts'])
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const abs = resolveOutput(req.query.path);
  if (!abs) return res.status(404).json({ error: 'Output not found.' });
  const rel = path.relative(OUT_DIR, abs).replace(/\\/g, '/');
  const kind = guessKindFromRelPath(rel);
  if (!allowedPlatformsForKind(kind).includes(req.query.platform)) {
    return res.status(400).json({ error: `"${req.query.platform}" isn't an option for a ${kind} render.` });
  }

  const packId = packIdFromAbsPath(abs);
  const pack = catalogModel.getPack(packId, { includeHidden: true });
  if (!pack) return res.status(404).json({ error: `Can't identify a pack for this output ("${packId}").` });

  const socialConfig = require('../../social/config');
  const publishingAgent = require('../../social/agents/publishingAgent');
  const draft = publishingAgent.adminDraft({
    platform: req.query.platform,
    pack,
    ctaUrl: `${socialConfig.SITE_URL}/pages/catalog?pack=${packId}`
  });
  const scheduledAt = publishingAgent.pickScheduledAt({ platform: req.query.platform, packId, campaignId: 0 });
  res.json({ draft: { ...draft, description: `${draft.description}\n\n${draft.hashtags.join(' ')}`, scheduledAt } });
});

// Admin approves a rendered video → schedules it for upload via the social
// system (a 'manual' campaign + a social_publications row with the video path
// on it; publish_due_posts picks it up at the scheduled time). Enforces the
// kind→platform mapping so a TikTok render can't be sent to YouTube Shorts
// (or vice versa) and re-scheduling an already-approved video is a no-op.
router.post(
  '/outputs/approve',
  verifyCsrfToken,
  securityActionLimiter,
  [
    body('path').isString(),
    body('platform').isIn(['tiktok', 'youtube_shorts']),
    body('title').isString().isLength({ min: 1, max: 200 }),
    body('description').optional({ nullable: true }).isString().isLength({ max: 2000 }),
    body('scheduledAt').optional({ nullable: true }).isString()
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const abs = resolveOutput(req.body.path);
    if (!abs) return res.status(404).json({ error: 'Output not found.' });
    const rel = path.relative(OUT_DIR, abs).replace(/\\/g, '/');
    const kind = guessKindFromRelPath(rel);
    if (!allowedPlatformsForKind(kind).includes(req.body.platform)) {
      return res.status(400).json({ error: `"${req.body.platform}" isn't an option for a ${kind} render.` });
    }

    const packId = packIdFromAbsPath(abs);
    const pack = catalogModel.getPack(packId, { includeHidden: true });
    if (!pack) return res.status(404).json({ error: `Can't identify a pack for this output ("${packId}").` });

    const orchestrator = require('../../social/orchestrator');
    let scheduledAt = req.body.scheduledAt || null;
    if (scheduledAt) {
      const parsed = new Date(scheduledAt);
      if (Number.isNaN(parsed.getTime())) return res.status(400).json({ error: 'scheduledAt must be a valid date.' });
      scheduledAt = parsed.toISOString().slice(0, 19).replace('T', ' ');
    }

    try {
      const result = orchestrator.scheduleAdminApproved({
        platform: req.body.platform,
        packId,
        videoPath: abs,
        title: req.body.title.trim(),
        description: (req.body.description || '').trim(),
        scheduledAt
      });
      if (result.alreadyScheduled) {
        return res.json({ ...result, alreadyScheduled: true, message: 'This video is already scheduled — no duplicate created.' });
      }
      return res.status(201).json(result);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
);

// Admin-scheduled posts (Video Studio approvals) — the "Scheduled for upload"
// list on the Social tab. Distinct from the video_jobs read-only queue above.
router.get('/approvals', (req, res) => {
  const publicationsModel = require('../../social/models/publications');
  const campaignsModel = require('../../social/models/campaigns');
  const pubs = publicationsModel.listAdminScheduled();
  const items = pubs.map((pub) => {
    const campaign = campaignsModel.findById(pub.campaignId);
    const rel = pub.outputPath ? path.relative(OUT_DIR, pub.outputPath).replace(/\\/g, '/') : null;
    return {
      id: pub.id,
      campaignId: pub.campaignId,
      packId: campaign && campaign.packId,
      platform: pub.platform,
      title: pub.title,
      status: pub.status,
      scheduledAt: pub.scheduledAt,
      publishedAt: pub.publishedAt,
      error: pub.error,
      platformUrl: pub.platformUrl,
      videoPath: rel
    };
  });
  res.json({ publications: items });
});

router.get('/outputs/media', (req, res) => {
  const rel = req.query.path;
  if (typeof rel !== 'string' || !rel) return res.status(400).json({ error: 'Missing path.' });
  const abs = path.resolve(OUT_DIR, rel);
  if (!abs.startsWith(path.resolve(OUT_DIR))) return res.status(400).json({ error: 'Invalid path.' });
  sendRangeFile(req, res, abs, 'video/mp4');
});

// Download a rendered video with an organised filename:
//   <platform>/<game>/<datetime>_<game>_<quality>_<pacing>_<length>_<angle>_subtitles-music-speech.<ext>
// The source file is never moved or renamed — this only affects the
// Content-Disposition filename the browser saves as.
router.get('/outputs/download', (req, res) => {
  const rel = req.query.path;
  if (typeof rel !== 'string' || !rel) return res.status(400).json({ error: 'Missing path.' });
  const abs = path.resolve(OUT_DIR, rel);
  if (!abs.startsWith(path.resolve(OUT_DIR)) || !fs.existsSync(abs)) {
    return res.status(404).json({ error: 'Output not found.' });
  }

  const { organizedPath, filename } = buildDownloadFilename(abs);
  const downloadName = `${organizedPath}/${filename}`;

  // If the build directory doesn't exist, create it so the browser hint
  // is accurate (it only affects the suggested save location, not the
  // actual server path, but it's still nice to get right).
  const buildDir = path.join(OUT_DIR, organizedPath);
  if (!fs.existsSync(buildDir)) {
    try { fs.mkdirSync(buildDir, { recursive: true }); } catch { /* best-effort */ }
  }

  // Check for filename collision and append a short random suffix when
  // needed. The collision check is against the build directory on disk —
  // even though the file isn't actually moved there, this prevents the
  // browser from silently overwriting a previous download with the same
  // suggested name.
  let finalName = downloadName;
  const candidateAbs = path.join(OUT_DIR, downloadName);
  if (fs.existsSync(candidateAbs)) {
    const suffix = crypto.randomBytes(3).toString('hex');
    const ext = path.extname(filename);
    const base = filename.slice(0, -ext.length);
    finalName = `${organizedPath}/${base}_${suffix}${ext}`;
  }

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${finalName}"; filename*=UTF-8''${encodeURIComponent(finalName)}`);
  const stat = fs.statSync(abs);
  res.setHeader('Content-Length', stat.size);
  fs.createReadStream(abs).pipe(res);
});

// One real JPEG frame (1s in) per video, cached by content mtime so a
// re-render invalidates the thumbnail automatically.
router.get('/outputs/thumbnail', async (req, res) => {
  const rel = req.query.path;
  if (typeof rel !== 'string' || !rel) return res.status(400).json({ error: 'Missing path.' });
  const abs = path.resolve(OUT_DIR, rel);
  if (!abs.startsWith(path.resolve(OUT_DIR)) || !fs.existsSync(abs)) return res.status(404).end();

  const mtimeMs = fs.statSync(abs).mtimeMs;
  const hash = crypto.createHash('sha1').update(`${abs}:${mtimeMs}`).digest('hex');
  const thumbPath = path.join(THUMB_DIR, `${hash}.jpg`);

  if (!fs.existsSync(thumbPath)) {
    await new Promise((resolve) => {
      execFile('ffmpeg', ['-y', '-ss', '1', '-i', abs, '-frames:v', '1', '-vf', 'scale=480:-1', thumbPath], { windowsHide: true }, () => resolve());
    });
  }
  if (!fs.existsSync(thumbPath)) return res.status(404).end();
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  fs.createReadStream(thumbPath).pipe(res);
});

// --- Render jobs (admin-triggered) ------------------------------------------

const activeProcesses = new Map();

function snapshotOutDir() {
  const map = new Map();
  for (const f of listOutputFiles()) map.set(f.absPath, f.mtimeMs);
  return map;
}

function findNewestNewFile(before) {
  let newest = null;
  for (const f of listOutputFiles()) {
    const prevMtime = before.get(f.absPath);
    if ((prevMtime === undefined || f.mtimeMs > prevMtime) && (!newest || f.mtimeMs > newest.mtimeMs)) newest = f;
  }
  return newest;
}

// Predicted popularity, 0-100 (social/agents/predictionAgent.js), a render
// must clear before it's treated as "done" rather than a candidate for one
// automatic redo. Independently defined from orchestrator.js's own copy —
// video/ (via this admin layer) and social/ are separate subsystems by
// design (see pipeline/lib/env.mjs), so this mirrors the constant rather
// than importing it.
const MIN_POPULARITY_SCORE = 60;

// Picks a concrete angle other than the one this job used, for the one
// automatic redo a low-scoring render gets — a genuinely different creative
// direction, not just an identical re-roll of the same prompt. Avoids
// 'auto' so the redo is a deliberate choice, not another coin flip.
function pickDifferentAngle(currentAngle) {
  const candidates = ANGLE_TIERS.filter((id) => id !== 'auto' && id !== currentAngle);
  if (!candidates.length) return currentAngle;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Scores a just-completed render's real generated copy (read back from the
// pipeline's own build/<job>/props.json — the same file the renderer itself
// used, not a guess) against accumulated trend/insight/performance data, and
// — for a pack render that hasn't already been redone once — automatically
// queues a single redo with a different angle when it scores too low.
// Best-effort throughout: any failure here (missing props.json, no API key,
// a transient error) is caught by the caller and never fails the render
// itself, which already succeeded.
async function scoreAndMaybeRedoJob(jobId) {
  const job = jobsModel.findById(jobId);
  if (!job || job.status !== 'completed' || !job.outputPath) return;

  const buildJobId = job.kind === 'website' ? 'website-premium' : `${job.packId}-${job.kind}`;
  const propsPath = path.join(VIDEO_ROOT, 'build', buildJobId, 'props.json');
  if (!fs.existsSync(propsPath)) return;

  let props;
  try {
    props = JSON.parse(fs.readFileSync(propsPath, 'utf8'));
  } catch {
    return;
  }
  const copy = props && props.copy;
  if (!copy) return;

  const predictionAgent = require('../../social/agents/predictionAgent');
  const trendsModel = require('../../social/models/trends');
  const insightsModel = require('../../social/models/insights');
  const analyticsModel = require('../../social/models/analytics');
  const pack = job.packId ? catalogModel.getPack(job.packId, { includeHidden: true }) : null;
  const platformScope = job.kind === 'shorts' ? 'youtube_shorts' : job.kind === 'website' ? null : 'tiktok';

  const prediction = await predictionAgent.run({
    pack: pack ? { packId: pack.packId, packName: pack.packName, gameTitle: pack.gameTitle } : null,
    platform: job.kind,
    angleLabel: job.angle || 'auto',
    hook: copy.hook,
    beats: (copy.beats || []).map((b) => `${b.heading}: ${b.body}`),
    cta: [copy.cta, copy.ctaSub].filter(Boolean).join(' '),
    trends: trendsModel.recent(10),
    insights: platformScope ? insightsModel.relevantTo({ platform: platformScope, packId: job.packId }) : [],
    performanceRows: analyticsModel.sinceWithCampaignDetail('-90 days')
  });

  jobsModel.setPrediction(jobId, prediction);

  const passed = prediction.score >= MIN_POPULARITY_SCORE;
  if (passed || job.kind === 'website' || !job.packId) return;

  // Cap the auto-redo at one level: skip if this job is itself already a
  // redo, or if it already has a redo child (e.g. a previous scoring pass
  // already triggered one) — a genuinely hard-to-sell pack shouldn't loop
  // forever burning render/Claude cost.
  if (job.redoOf != null || jobsModel.findRedoChild(jobId)) return;

  spawnRenderJob({
    kind: job.kind,
    packId: job.packId,
    quality: job.quality || 'standard',
    pacing: job.pacing || 'normal',
    length: job.length || 'auto',
    angle: pickDifferentAngle(job.angle),
    speed: job.speed || 'normal',
    animation: job.animationIntensity || 'moderate',
    captionsEnabled: job.captionsEnabled !== false,
    ttsEnabled: job.ttsEnabled !== false,
    musicEnabled: job.musicEnabled !== false,
    beatMatch: !!job.beatMatch,
    triggeredBy: 'auto-redo (low predicted score)',
    redoOf: jobId
  });
}

// Kicks off one render job — a pipeline CLI invocation, tracked as a
// video_admin_jobs row from queue to completion. Shared by the admin-facing
// POST /jobs route and the automatic low-score redo above so there is
// exactly one place that knows how to actually start a render.
function spawnRenderJob({ kind, packId, quality, pacing, length, angle, speed, animation, captionsEnabled, ttsEnabled, musicEnabled, beatMatch, triggeredBy, redoOf = null }) {
  const cfg = settingsModel.get('videoAdminConfig') || {};

  // orchestrate.mjs (npm run generate) is the full pipeline entry point —
  // copy, voice, music, render, and QA in one pass. render:one is a
  // separate re-render-only tool that requires an existing build/<job>/
  // props.json, so it can't be used to kick off a brand-new render.
  const renderFlags = [
    '--quality', quality, '--pacing', pacing, '--length', length, '--angle', angle,
    '--speed', speed, '--animation', animation,
    '--captions', String(captionsEnabled), '--tts', String(ttsEnabled), '--music', String(musicEnabled), '--beatmatch', String(beatMatch)
  ];
  const args = kind === 'website'
    ? ['run', 'generate', '--', '--website', ...renderFlags]
    : ['run', 'generate', '--', '--pack', packId, '--platform', kind, ...renderFlags];

  const jobRow = jobsModel.create({
    kind, packId, command: `npm ${args.join(' ')}`, triggeredBy, quality, pacing, length, angle,
    speed, animationIntensity: animation, captionsEnabled, ttsEnabled, musicEnabled, beatMatch, redoOf
  });

  const env = {
    ...process.env,
    VIDEO_TTS_VOICE: cfg.ttsVoice || '',
    EDGE_TTS_VOICE: cfg.edgeTtsVoice || '',
    VIDEO_PREFER_GPU: cfg.preferGpu === false ? '0' : '1',
    VIDEO_QUALITY: quality,
    VIDEO_PACING: pacing,
    VIDEO_LENGTH: length,
    VIDEO_ANGLE: angle,
    VIDEO_SPEECH_SPEED: speed,
    VIDEO_ANIMATION: animation,
    VIDEO_CAPTIONS: String(captionsEnabled),
    VIDEO_TTS_ENABLED: String(ttsEnabled),
    VIDEO_MUSIC: String(musicEnabled),
    VIDEO_BEATMATCH: String(beatMatch)
  };

  const before = snapshotOutDir();
  // npm on Windows is npm.cmd, a batch file — CreateProcess can't exec it
  // directly (throws EINVAL), so it needs shell:true there, same as
  // pipeline/lib/render.mjs's own npx spawn.
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(npmCmd, args, { cwd: VIDEO_ROOT, env, windowsHide: true, shell: process.platform === 'win32' });
  activeProcesses.set(jobRow.id, child);
  jobsModel.setPid(jobRow.id, child.pid || null);

  const onData = (chunk) => jobsModel.appendLog(jobRow.id, chunk.toString());
  child.stdout?.on('data', onData);
  child.stderr?.on('data', onData);

  child.on('error', (err) => {
    activeProcesses.delete(jobRow.id);
    jobsModel.fail(jobRow.id, err);
  });

  child.on('close', async (code) => {
    activeProcesses.delete(jobRow.id);
    const current = jobsModel.findById(jobRow.id);
    if (!current || current.status === 'cancelled') return;
    if (code !== 0) {
      jobsModel.fail(jobRow.id, new Error(`render:one exited with code ${code}. See log for details.`));
      return;
    }
    const produced = findNewestNewFile(before);
    if (!produced) {
      jobsModel.fail(jobRow.id, new Error('Process exited cleanly but no new file appeared under video/out/.'));
      return;
    }

    // Move the freshly-rendered file from the pipeline's flat output
    // location into the organised directory structure so every future
    // reference (gallery, download, social upload) uses the canonical
    // organised path stored in the database.
    const organisedPath = organiseOutput(produced.absPath, jobRow);

    let qa = null;
    try {
      const platformsMod = await importPipelineModule(PIPELINE_LIB.platforms);
      const qaMod = await importPipelineModule(PIPELINE_LIB.qa);
      if (platformsMod && qaMod) {
        const spec = platformsMod.platformFor(kind);
        qa = await qaMod.qaVideo({
          videoPath: organisedPath,
          expected: {
            width: spec.width,
            height: spec.height,
            fps: spec.fps,
            minDurationSec: spec.narrationTargetSec[0],
            maxDurationSec: spec.narrationTargetSec[1] + 6
          }
        });
      }
    } catch (err) {
      qa = { pass: null, error: err.message };
    }
    jobsModel.complete(jobRow.id, { outputPath: organisedPath, qa });

    scoreAndMaybeRedoJob(jobRow.id).catch((err) => {
      console.error(`[video-admin] Popularity scoring failed for job ${jobRow.id}: ${err.message}`);
    });
  });

  return jobRow;
}

router.get('/jobs', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  res.json({ jobs: jobsModel.list(limit), counts: jobsModel.statusCounts() });
});

router.get('/jobs/:id', (req, res) => {
  const job = jobsModel.findById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  res.json({ job });
});

router.get('/jobs/:id/media', (req, res) => {
  const job = jobsModel.findById(req.params.id);
  if (!job || !job.outputPath) return res.status(404).json({ error: 'No output for this job.' });
  sendRangeFile(req, res, job.outputPath, 'video/mp4');
});

router.post(
  '/jobs',
  verifyCsrfToken,
  videoRenderLimiter,
  [
    body('kind').isIn(KINDS),
    body('packId').optional({ nullable: true }).isString().trim().isLength({ min: 1, max: 80 }),
    body('quality').optional({ nullable: true }).isIn(QUALITY_TIERS),
    // Pacing/length/angle accept a known preset id OR a free-typed custom
    // value (a numeric multiplier/seconds, or — for angle — arbitrary
    // creative-direction text) — see the matching xFor() resolvers in
    // pipeline/config/*.mjs, which fall back to the hardcoded default for
    // anything they can't parse. Length-capped, not enum-restricted.
    body('pacing').optional({ nullable: true }).isString().trim().isLength({ max: 40 }),
    body('length').optional({ nullable: true }).isString().trim().isLength({ max: 40 }),
    body('angle').optional({ nullable: true }).isString().trim().isLength({ max: 400 }),
    body('speed').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
    body('animation').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
    body('captionsEnabled').optional({ nullable: true }).isBoolean(),
    body('ttsEnabled').optional({ nullable: true }).isBoolean(),
    body('musicEnabled').optional({ nullable: true }).isBoolean(),
    body('beatMatch').optional({ nullable: true }).isBoolean()
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { kind } = req.body;
    const packId = req.body.packId || null;

    if (kind !== 'website') {
      if (!packId) return res.status(400).json({ error: 'packId is required for this render kind.' });
      const pack = catalogModel.getPack(packId, { includeHidden: true });
      if (!pack) return res.status(404).json({ error: `Unknown pack "${packId}".` });
    }

    if (!exists(PIPELINE_SCRIPTS.orchestrate)) {
      return res.status(409).json({
        error: 'The video pipeline\'s orchestrate.mjs script isn\'t built yet. Check the Pipeline Status panel — this button will start working the moment that script lands, no admin-side change needed.'
      });
    }

    const cfg = settingsModel.get('videoAdminConfig') || {};
    // Per-job value wins over the saved default (settings) wins over the
    // hardcoded default — same precedence orchestrate.mjs itself falls back
    // through for a bare CLI invocation (--quality flag > VIDEO_QUALITY env
    // > default), mirrored here for every render control.
    const quality = req.body.quality || cfg.quality || 'standard';
    const pacing = req.body.pacing || cfg.pacing || 'normal';
    const length = req.body.length || cfg.length || 'auto';
    const angle = req.body.angle || cfg.angle || 'auto';
    const speed = req.body.speed || cfg.speed || 'normal';
    const animation = req.body.animation || cfg.animation || 'moderate';
    const captionsEnabled = req.body.captionsEnabled !== undefined ? !!req.body.captionsEnabled : cfg.captionsEnabled !== false;
    const ttsEnabled = req.body.ttsEnabled !== undefined ? !!req.body.ttsEnabled : cfg.ttsEnabled !== false;
    const musicEnabled = req.body.musicEnabled !== undefined ? !!req.body.musicEnabled : cfg.musicEnabled !== false;
    const beatMatch = req.body.beatMatch !== undefined ? !!req.body.beatMatch : !!cfg.beatMatch;

    if (!ttsEnabled && !musicEnabled) {
      return res.status(400).json({ error: 'At least one of voiceover or music must stay enabled — a silent, musicless video isn\'t supported.' });
    }

    const jobRow = spawnRenderJob({
      kind, packId, quality, pacing, length, angle, speed, animation,
      captionsEnabled, ttsEnabled, musicEnabled, beatMatch,
      triggeredBy: req.currentUser.username
    });
    res.status(202).json({ job: jobRow });
  }
);

router.post('/jobs/:id/cancel', verifyCsrfToken, (req, res) => {
  const job = jobsModel.findById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  if (job.status !== 'queued' && job.status !== 'running') return res.status(400).json({ error: 'Job is not in flight.' });

  const child = activeProcesses.get(job.id);
  jobsModel.cancel(job.id);
  if (child) {
    activeProcesses.delete(job.id);
    if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    else child.kill('SIGTERM');
  }
  res.json({ job: jobsModel.findById(job.id) });
});

// --- Social hand-off queue (read-only view of the video_jobs contract) -----

router.get('/social-queue', (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, campaign_id AS campaignId, status, output_path AS outputPath, error,
              attempts, created_at AS createdAt, updated_at AS updatedAt
       FROM video_jobs ORDER BY id DESC LIMIT 25`
    )
    .all();
  const countsRows = db.prepare(`SELECT status, COUNT(*) AS count FROM video_jobs GROUP BY status`).all();
  const counts = { pending: 0, claimed: 0, rendering: 0, completed: 0, failed: 0 };
  for (const row of countsRows) counts[row.status] = row.count;
  res.json({ jobs: rows, counts });
});

// --- Settings ----------------------------------------------------------------

router.get('/settings', (req, res) => {
  res.json({ settings: settingsModel.get('videoAdminConfig') });
});

router.put(
  '/settings',
  verifyCsrfToken,
  [
    body('ttsVoice').optional().isString().isLength({ max: 100 }),
    body('edgeTtsVoice').optional().isString().isLength({ max: 100 }),
    body('preferGpu').optional().isBoolean(),
    body('quality').optional().isIn(QUALITY_TIERS),
    body('pacing').optional().isString().trim().isLength({ max: 40 }),
    body('length').optional().isString().trim().isLength({ max: 40 }),
    body('angle').optional().isString().trim().isLength({ max: 400 }),
    body('speed').optional().isString().trim().isLength({ max: 20 }),
    body('animation').optional().isString().trim().isLength({ max: 20 }),
    body('captionsEnabled').optional().isBoolean(),
    body('ttsEnabled').optional().isBoolean(),
    body('musicEnabled').optional().isBoolean(),
    body('beatMatch').optional().isBoolean()
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    const current = settingsModel.get('videoAdminConfig') || {};
    const ttsEnabled = req.body.ttsEnabled !== undefined ? req.body.ttsEnabled : current.ttsEnabled !== false;
    const musicEnabled = req.body.musicEnabled !== undefined ? req.body.musicEnabled : current.musicEnabled !== false;
    if (!ttsEnabled && !musicEnabled) {
      return res.status(400).json({ error: 'At least one of voiceover or music must stay enabled as the default — a silent, musicless video isn\'t supported.' });
    }
    const next = {
      ttsVoice: req.body.ttsVoice !== undefined ? req.body.ttsVoice : current.ttsVoice,
      edgeTtsVoice: req.body.edgeTtsVoice !== undefined ? req.body.edgeTtsVoice : current.edgeTtsVoice,
      preferGpu: req.body.preferGpu !== undefined ? req.body.preferGpu : current.preferGpu,
      quality: req.body.quality !== undefined ? req.body.quality : (current.quality || 'standard'),
      pacing: req.body.pacing !== undefined ? req.body.pacing : (current.pacing || 'normal'),
      length: req.body.length !== undefined ? req.body.length : (current.length || 'auto'),
      angle: req.body.angle !== undefined ? req.body.angle : (current.angle || 'auto'),
      speed: req.body.speed !== undefined ? req.body.speed : (current.speed || 'normal'),
      animation: req.body.animation !== undefined ? req.body.animation : (current.animation || 'moderate'),
      captionsEnabled: req.body.captionsEnabled !== undefined ? req.body.captionsEnabled : current.captionsEnabled !== false,
      ttsEnabled,
      musicEnabled,
      beatMatch: req.body.beatMatch !== undefined ? req.body.beatMatch : !!current.beatMatch
    };
    res.json({ settings: settingsModel.set('videoAdminConfig', next) });
  }
);

// --- Social accounts (multi-account posting) --------------------------------
//
// Connected TikTok/YouTube accounts the automation can post to (see
// social/models/accounts.js). Credentials come from the platforms' own
// one-time OAuth CLI scripts (npm run social:tiktok-auth /
// social:youtube-auth) run once per account in a browser logged into that
// account — this panel is where the resulting label + refresh token get
// stored so more than one account can be connected at a time. Zero accounts
// connected is a fully supported state: social/orchestrator.js falls back
// to the single legacy account configured via social/.env.

const CRED_FIELDS = {
  tiktok: ['clientKey', 'clientSecret', 'refreshToken'],
  youtube_shorts: ['clientId', 'clientSecret', 'refreshToken']
};

function sanitizeCredentials(platform, input) {
  const allowed = CRED_FIELDS[platform] || [];
  const out = {};
  for (const key of allowed) {
    if (typeof input?.[key] === 'string' && input[key].trim()) out[key] = input[key].trim();
  }
  return out;
}

router.get('/accounts', (req, res) => {
  const accountsModel = require('../../social/models/accounts');
  res.json({ accounts: accountsModel.listPublic() });
});

router.post(
  '/accounts',
  verifyCsrfToken,
  securityActionLimiter,
  [
    body('platform').isIn(['tiktok', 'youtube_shorts']),
    body('label').isString().trim().isLength({ min: 1, max: 100 }),
    body('credentials').isObject(),
    body('nichePackIds').optional({ nullable: true }).isArray()
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const accountsModel = require('../../social/models/accounts');
    const credentials = sanitizeCredentials(req.body.platform, req.body.credentials);
    const required = CRED_FIELDS[req.body.platform];
    const missing = required.filter((f) => !credentials[f]);
    if (missing.length) return res.status(400).json({ error: `Missing credential field(s): ${missing.join(', ')}.` });

    const account = accountsModel.create({
      platform: req.body.platform,
      label: req.body.label.trim(),
      credentials,
      nichePackIds: req.body.nichePackIds || null
    });
    res.status(201).json({ account: accountsModel.toPublic(account) });
  }
);

router.put(
  '/accounts/:id',
  verifyCsrfToken,
  securityActionLimiter,
  [
    param('id').isInt().toInt(),
    body('label').optional().isString().trim().isLength({ min: 1, max: 100 }),
    body('enabled').optional().isBoolean(),
    body('credentials').optional({ nullable: true }).isObject(),
    body('nichePackIds').optional({ nullable: true }).isArray()
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const accountsModel = require('../../social/models/accounts');
    const existing = accountsModel.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Account not found.' });

    const credentials = req.body.credentials ? sanitizeCredentials(existing.platform, req.body.credentials) : undefined;
    const updated = accountsModel.update(req.params.id, {
      label: req.body.label,
      enabled: req.body.enabled,
      credentials,
      nichePackIds: req.body.nichePackIds
    });
    res.json({ account: accountsModel.toPublic(updated) });
  }
);

router.post('/accounts/:id/toggle', verifyCsrfToken, securityActionLimiter, [param('id').isInt().toInt()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const accountsModel = require('../../social/models/accounts');
  const existing = accountsModel.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Account not found.' });
  const updated = accountsModel.setEnabled(req.params.id, !existing.enabled);
  res.json({ account: accountsModel.toPublic(updated) });
});

router.delete('/accounts/:id', verifyCsrfToken, securityActionLimiter, [param('id').isInt().toInt()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const accountsModel = require('../../social/models/accounts');
  if (!accountsModel.findById(req.params.id)) return res.status(404).json({ error: 'Account not found.' });
  accountsModel.remove(req.params.id);
  res.status(204).end();
});

// --- Trend intelligence (read-only view of an already-running system) ------
//
// social/agents/trendsAgent.js and social/agents/analyticsLearningAgent.js
// already run on a cron (social/scheduler.js: trends refresh twice daily,
// analytics collection every 6h, insight synthesis nightly) and feed
// social_trends / social_insights back into strategyAgent for every future
// campaign — this panel just makes that already-automated intelligence
// visible, plus a manual "run now" for when the admin wants a fresh read
// immediately rather than waiting for the next cron tick.

// Groups performance rows by an attribute (video type/pacing/length/quality/
// platform/pack) and averages views/engagement per group — the literal
// answer to "what's going viral and what do they have in common". Skips
// rows with no value for that attribute (e.g. AI-authored posts have no
// admin-render quality) rather than lumping them under a fake "unknown"
// bucket, and sorts best-performing group first.
function groupPerformance(rows, attr) {
  const buckets = new Map();
  for (const row of rows) {
    const key = row[attr];
    if (!key) continue;
    if (!buckets.has(key)) buckets.set(key, { key, count: 0, totalViews: 0, totalEngagementRate: 0 });
    const bucket = buckets.get(key);
    bucket.count += 1;
    bucket.totalViews += row.views;
    bucket.totalEngagementRate += row.engagementRate;
  }
  return Array.from(buckets.values())
    .map((b) => ({
      key: b.key,
      posts: b.count,
      avgViews: Math.round(b.totalViews / b.count),
      avgEngagementRate: Number((b.totalEngagementRate / b.count).toFixed(4))
    }))
    .sort((a, b) => b.avgViews - a.avgViews);
}

router.get('/intelligence', [query('days').optional().isInt({ min: 1, max: 180 }).toInt()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const trendsModel = require('../../social/models/trends');
  const insightsModel = require('../../social/models/insights');
  const forecastsModel = require('../../social/models/forecasts');
  const scorecardModel = require('../../social/models/scorecard');
  const days = req.query.days || 30;
  const since = `-${days} days`;

  const trends = trendsModel.recent(30, '-7 days');
  const insights = insightsModel.activeRecent(30);
  // Rising/falling per trend source over the selected window (see
  // social/models/trends.js momentum()) — only meaningful because trends
  // now get captured hourly and kept a full year instead of two weeks;
  // reliability grows with the window since a longer history gives each
  // half of the comparison more data points.
  const trendMomentum = trendsModel.momentum(since);
  const trendDaily = trendsModel.dailyRollup(since);

  // Latest stat snapshot per published post in the window, joined back to
  // its campaign (for pack/trigger-type/AI-chosen content pillar) and, when
  // it was an admin-triggered render, the video_admin_jobs row that produced
  // it (for the real quality/pacing/length/video-type used) — a live join
  // rather than a stored copy, so it always reflects the current data
  // without this admin layer owning a duplicate of either table.
  const rows = db
    .prepare(
      `SELECT s.views, s.likes, s.comments, s.shares,
              p.id AS publicationId, p.title, p.platform, p.output_path AS outputPath,
              p.published_at AS publishedAt, p.platform_url AS platformUrl,
              c.pack_id AS packId, c.strategy_json AS strategyJson,
              j.quality AS jobQuality, j.pacing AS jobPacing, j.length AS jobLength, j.angle AS jobAngle
       FROM social_analytics_snapshots s
       JOIN (
         SELECT publication_id, MAX(captured_at) AS maxCapturedAt
         FROM social_analytics_snapshots
         GROUP BY publication_id
       ) latest ON latest.publication_id = s.publication_id AND latest.maxCapturedAt = s.captured_at
       JOIN social_publications p ON p.id = s.publication_id
       JOIN social_campaigns c ON c.id = p.campaign_id
       LEFT JOIN video_admin_jobs j ON j.output_path = p.output_path
       WHERE p.published_at >= datetime('now', @since)
       ORDER BY s.views DESC`
    )
    .all({ since });

  const posts = rows.map((r) => {
    let contentPillar = null;
    if (r.strategyJson) {
      try { contentPillar = JSON.parse(r.strategyJson).contentPillar || null; } catch { /* malformed/legacy row — treat as no pillar */ }
    }
    const engagement = (r.likes || 0) + (r.comments || 0) + (r.shares || 0);
    return {
      publicationId: r.publicationId,
      title: r.title,
      platform: r.platform,
      packId: r.packId,
      source: r.jobQuality != null || r.jobPacing != null || r.jobLength != null || r.jobAngle != null ? 'admin' : 'ai',
      angle: r.jobAngle || contentPillar,
      pacing: r.jobPacing,
      length: r.jobLength,
      quality: r.jobQuality,
      views: r.views || 0,
      likes: r.likes || 0,
      comments: r.comments || 0,
      shares: r.shares || 0,
      engagementRate: r.views > 0 ? Number((engagement / r.views).toFixed(4)) : 0,
      publishedAt: r.publishedAt,
      platformUrl: r.platformUrl
    };
  });

  const totals = posts.reduce(
    (acc, r) => {
      acc.views += r.views;
      acc.likes += r.likes;
      acc.comments += r.comments;
      acc.shares += r.shares;
      return acc;
    },
    { views: 0, likes: 0, comments: 0, shares: 0 }
  );

  // Every admin-triggered render from this window that's been scored — the
  // "rank them" view: ranked by predicted popularity rather than recency, so
  // the best candidates (and any still-low-scoring one a redo didn't fix)
  // are immediately visible instead of buried in the plain render queue.
  const rankedRenders = db
    .prepare(
      `SELECT id, kind, pack_id AS packId, angle, pacing, length, quality,
              predicted_score AS predictedScore, redo_of AS redoOf, output_path AS outputPath, created_at AS createdAt
       FROM video_admin_jobs
       WHERE status = 'completed' AND predicted_score IS NOT NULL AND created_at >= datetime('now', @since)
       ORDER BY predicted_score DESC
       LIMIT 20`
    )
    .all({ since });

  res.json({
    trends: trends.map((t) => ({ id: t.id, source: t.source, topic: t.topic, score: t.score, capturedAt: t.captured_at })),
    trendMomentum,
    trendDaily,
    insights: insights.map((i) => ({ id: i.id, scope: i.scope, insight: i.insight, confidence: i.confidence, createdAt: i.created_at })),
    rankedRenders: rankedRenders.map((r) => ({ ...r, hasRedo: Boolean(jobsModel.findRedoChild(r.id)) })),
    // Forward-looking predictions (social/agents/trendForecastAgent.js) plus
    // the reward/punish track record for both prediction-making agents —
    // the "constantly improves" half of trend intelligence made visible.
    forecasts: {
      active: forecastsModel.active(20),
      recentResolved: forecastsModel.recentResolved(15)
    },
    scorecard: {
      trendForecast: scorecardModel.accuracyStats('trend_forecast', since),
      popularityPrediction: scorecardModel.accuracyStats('popularity_prediction', since)
    },
    // Higher-order enrichment: cross-platform correlations, arbitrage,
    // evergreen topics, source trust weights — computed by trendEnrichment.js,
    // stored in trendEnrichmentStore. Only populated after the enrichment
    // pass has run at least once.
    enrichment: (() => {
      try {
        const store = require('../../social/models/trendEnrichmentStore');
        return {
          correlations: store.byKind('correlation').slice(0, 10).map((r) => r.payload),
          arbitrage: store.byKind('arbitrage').slice(0, 10).map((r) => r.payload),
          evergreen: store.byKind('evergreen').slice(0, 10).map((r) => r.payload),
          trustWeights: store.byKind('trust_weight').filter((r) => r.key !== '__global__').slice(0, 10).map((r) => r.payload)
        };
      } catch { return null; }
    })(),
    // Content-DNA patterns: what production elements correlate with
    // top-performing campaigns (see replicationAgent.js).
    contentPatterns: (() => {
      try {
        const cpModel = require('../../social/models/contentPatterns');
        return cpModel.activeRecent(20);
      } catch { return []; }
    })(),
    performance: {
      sinceDays: days,
      postsTracked: posts.length,
      totals,
      topPosts: posts.slice(0, 15),
      byAngle: groupPerformance(posts, 'angle'),
      byPacing: groupPerformance(posts, 'pacing'),
      byLength: groupPerformance(posts, 'length'),
      byQuality: groupPerformance(posts, 'quality'),
      byPlatform: groupPerformance(posts, 'platform'),
      byPack: groupPerformance(posts, 'packId')
    }
  });
});

router.post('/intelligence/refresh', verifyCsrfToken, securityActionLimiter, (req, res) => {
  const jobQueue = require('../../social/jobQueue');
  // Same dedup keys the scheduler's own cron ticks use, so this is always a
  // safe no-op if a scheduled run is already in flight rather than an
  // overlapping duplicate.
  const queued = ['refresh_trends', 'collect_analytics', 'run_learning'].map((jobType) => ({
    jobType,
    ...jobQueue.enqueue({ jobType, dedupKey: jobType, payload: {} })
  }));
  res.json({ queued });
});

module.exports = router;
