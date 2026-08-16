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
const { body, validationResult } = require('express-validator');

const { requireAdmin } = require('../middleware/auth');
const { verifyCsrfToken } = require('../middleware/csrf');
const { videoRenderLimiter } = require('../middleware/rateLimit');

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
  ttsElevenLabs: 'pipeline/lib/tts-elevenlabs.mjs',
  mix: 'pipeline/lib/mix.mjs',
  qa: 'pipeline/lib/qa.mjs',
  copywriter: 'pipeline/lib/copywriter.mjs',
  music: 'pipeline/lib/music.mjs',
  sfx: 'pipeline/lib/sfx.mjs',
  timeline: 'pipeline/lib/timeline.mjs',
  wav: 'pipeline/lib/wav.mjs',
  platforms: 'pipeline/config/platforms.mjs',
  moods: 'pipeline/config/moods.mjs'
};

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

// --- Status / readiness ----------------------------------------------------

router.get('/status', async (req, res) => {
  const [ffmpeg, ffprobe, gpu] = await Promise.all([toolAvailable('ffmpeg'), toolAvailable('ffprobe'), gpuInfo()]);
  const scripts = Object.fromEntries(Object.entries(PIPELINE_SCRIPTS).map(([k, p]) => [k, exists(p)]));
  const lib = Object.fromEntries(Object.entries(PIPELINE_LIB).map(([k, p]) => [k, exists(p)]));
  res.json({
    tools: { ffmpeg, ffprobe, gpu },
    tts: { elevenlabs: envKeyPresent('ELEVENLABS_API_KEY'), sapi: process.platform === 'win32' && exists('pipeline/lib/tts-sapi.ps1') },
    anthropic: envKeyPresent('ANTHROPIC_API_KEY'),
    dependenciesInstalled: exists('node_modules/.package-lock.json'),
    scripts,
    lib,
    renderReady: scripts.orchestrate,
    smokeTests: { social: exists('out/smoke-social.mp4'), website: exists('out/smoke-website.mp4') }
  });
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
  res.json({ outputs: results });
});

router.get('/outputs/media', (req, res) => {
  const rel = req.query.path;
  if (typeof rel !== 'string' || !rel) return res.status(400).json({ error: 'Missing path.' });
  const abs = path.resolve(OUT_DIR, rel);
  if (!abs.startsWith(path.resolve(OUT_DIR))) return res.status(400).json({ error: 'Invalid path.' });
  sendRangeFile(req, res, abs, 'video/mp4');
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
  [body('kind').isIn(KINDS), body('packId').optional({ nullable: true }).isString().trim().isLength({ min: 1, max: 80 })],
  async (req, res) => {
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

    // orchestrate.mjs (npm run generate) is the full pipeline entry point —
    // copy, voice, music, render, and QA in one pass. render:one is a
    // separate re-render-only tool that requires an existing build/<job>/
    // props.json, so it can't be used to kick off a brand-new render.
    const args = kind === 'website'
      ? ['run', 'generate', '--', '--website']
      : ['run', 'generate', '--', '--pack', packId, '--platform', kind];

    const jobRow = jobsModel.create({ kind, packId, command: `npm ${args.join(' ')}`, triggeredBy: req.currentUser.username });

    const cfg = settingsModel.get('videoAdminConfig') || {};
    const env = {
      ...process.env,
      VIDEO_TTS_VOICE: cfg.ttsVoice || '',
      VIDEO_TTS_RATE: String(cfg.ttsRate || 0),
      VIDEO_PREFER_GPU: cfg.preferGpu === false ? '0' : '1'
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
      let qa = null;
      try {
        const platformsMod = await importPipelineModule(PIPELINE_LIB.platforms);
        const qaMod = await importPipelineModule(PIPELINE_LIB.qa);
        if (platformsMod && qaMod) {
          const spec = platformsMod.platformFor(kind);
          qa = await qaMod.qaVideo({
            videoPath: produced.absPath,
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
      jobsModel.complete(jobRow.id, { outputPath: produced.absPath, qa });
    });

    res.status(202).json({ job: jobsModel.findById(jobRow.id) });
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
    body('ttsRate').optional().isInt({ min: -10, max: 10 }),
    body('preferGpu').optional().isBoolean()
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    const current = settingsModel.get('videoAdminConfig') || {};
    const next = {
      ttsVoice: req.body.ttsVoice !== undefined ? req.body.ttsVoice : current.ttsVoice,
      ttsRate: req.body.ttsRate !== undefined ? req.body.ttsRate : current.ttsRate,
      preferGpu: req.body.preferGpu !== undefined ? req.body.preferGpu : current.preferGpu
    };
    res.json({ settings: settingsModel.set('videoAdminConfig', next) });
  }
);

module.exports = router;
