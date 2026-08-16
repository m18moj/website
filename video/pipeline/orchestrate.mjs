// Full pipeline for one job: inputs -> assets -> voice/music -> edit/animation
// -> render -> QA -> export. Run directly:
//   node pipeline/orchestrate.mjs --pack minecraft --platform tiktok
//   node pipeline/orchestrate.mjs --website
//   node pipeline/orchestrate.mjs --all                 (every pack x every social platform)
//   node pipeline/orchestrate.mjs --all --website        (+ the website promo)
import "./lib/env.mjs";
import { mkdirSync, copyFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import * as db from "./lib/db.mjs";
import { platformFor } from "./config/platforms.mjs";
import { moodFor } from "./config/moods.mjs";
import { qualityFor } from "./config/quality.mjs";
import { pacingFor } from "./config/pacing.mjs";
import { lengthFor, WORDS_PER_SECOND } from "./config/length.mjs";
import { angleFor } from "./config/angles.mjs";
import { speedFor } from "./config/speed.mjs";
import { animationFor } from "./config/animation.mjs";
import { generatePackCopy, generateWebsiteCopy } from "./lib/copywriter.mjs";
import { synthesizeVoiceover } from "./lib/tts.mjs";
import { generateMusicBed } from "./lib/music.mjs";
import { ensureSfxKit } from "./lib/sfx.mjs";
import { mixAudio, socialSfxCues, websiteSfxCues } from "./lib/mix.mjs";
import { socialTimeline, websiteTimeline, SOCIAL_TRANSITION_FRAMES, WEBSITE_TRANSITION_FRAMES } from "./lib/timeline.mjs";
import { renderComposition } from "./lib/render.mjs";
import { qaVideo } from "./lib/qa.mjs";
import { fileURLToPath } from "node:url";

const VIDEO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const PUBLIC_DIR = join(VIDEO_ROOT, "public");
const BUILD_DIR = join(VIDEO_ROOT, "build");
const OUTPUT_DIR = join(VIDEO_ROOT, "output");

const SFX_DIR = join(PUBLIC_DIR, "sfx");
ensureSfxKit(SFX_DIR);

// packId -> mood id, mirrors src/packThemes.ts's packIdToVisual -> mood
// mapping (kept here in plain JSON since this script is pure JS/Node, no
// TS build step for the pipeline).
const PACK_MOOD = {
  apex: "aggressive-hype",
  "call-of-duty": "aggressive-military",
  fortnite: "hype-energetic",
  "gta-v": "retro-synthwave",
  minecraft: "playful-adventurous",
  pubg: "gritty-tense",
  roblox: "playful-bright",
  skyrim: "epic-cinematic",
  valorant: "tactical-tense",
  "discord-bots": "clean-tech",
  websites: "clean-corporate",
  "smm-services": "vibrant-social",
};

function log(...args) {
  console.log("[video]", ...args);
}

// Nudges edge-tts pitch a few Hz based on the pack's music mood energy, so
// hype/aggressive packs read slightly brighter and tense/cinematic packs
// read slightly lower instead of every pack sounding identically flat.
function moodPitchHint(mood) {
  const energy = typeof mood?.energy === "number" ? mood.energy : 0.55;
  const hz = Math.max(-4, Math.min(5, Math.round((energy - 0.55) * 12)));
  return `${hz >= 0 ? "+" : ""}${hz}Hz`;
}

async function buildPackJob(
  packId,
  platformId,
  quality = qualityFor("standard"),
  pacing = pacingFor("normal"),
  length = lengthFor("auto"),
  angle = angleFor("auto"),
  options = {}
) {
  const {
    captionsEnabled = true,
    ttsEnabled = true,
    musicEnabled = true,
    beatMatch = false,
    speed = speedFor("normal"),
    animation = animationFor("moderate"),
  } = options;
  if (!ttsEnabled && !musicEnabled) {
    throw new Error("Cannot render with both voiceover and music disabled — a silent, musicless video isn't supported.");
  }

  const jobId = `${packId}-${platformId}`;
  log(`=== ${jobId} === (quality: ${quality.id}, pacing: ${pacing.id}, length: ${length.id}, angle: ${angle.id}, speed: ${speed.id}, animation: ${animation.id}, captions: ${captionsEnabled}, tts: ${ttsEnabled}, music: ${musicEnabled}, beatMatch: ${beatMatch})`);
  const platform = platformFor(platformId);
  const buildDir = join(BUILD_DIR, jobId);
  mkdirSync(buildDir, { recursive: true });

  // 1) inputs
  const pack = db.getPack(packId);
  pack.priceLabel = db.priceLabel(pack.minPriceCents);
  const scripts = db.listScripts(packId, 6);

  // 2) script/copy (Claude, grounded in real catalog data)
  const targetWords = length.targetSeconds ? Math.round(length.targetSeconds * WORDS_PER_SECOND) : undefined;
  const generated = await generatePackCopy({ platform: platformId, pack, scripts, model: quality.claudeModel, targetWords, angle });
  log("copy generated");

  const narrationParts = [
    generated.hook.narration,
    ...generated.beats.map((b) => b.narration),
    generated.statNarration,
    generated.cta.narration,
  ].filter(Boolean);
  const narrationText = narrationParts.join(" ");

  // 3) voice
  const moodId = PACK_MOOD[packId] ?? "clean-tech";
  const mood = moodFor(moodId);
  let vo = null;
  let voDurationMs;
  if (ttsEnabled) {
    vo = await synthesizeVoiceover({
      text: narrationText,
      outDir: buildDir,
      jobId,
      rate: speed.rate,
      pitch: moodPitchHint(mood),
    });
    log(`voiceover via ${vo.provider}, ${vo.cues.length} words`);
    voDurationMs = vo.cues.length ? vo.cues[vo.cues.length - 1].endMs : 4000;
  } else {
    // No TTS: fall back to a script-length duration estimate (see
    // pipeline/config/length.mjs's WORDS_PER_SECOND) instead of real audio.
    const wordCount = narrationText.split(/\s+/).filter(Boolean).length;
    voDurationMs = Math.max(4000, Math.round((wordCount / WORDS_PER_SECOND) * 1000));
    log(`voiceover disabled — estimated duration ${voDurationMs}ms from ${wordCount} words`);
  }

  const leadInMs = platform.leadInMs;
  const tailMs = platform.tailMs;
  const totalDurationMs = leadInMs + voDurationMs + tailMs;
  const totalFrames = Math.round((totalDurationMs / 1000) * platform.fps);

  // captions must land on the SAME timeline as the final mixed audio, which
  // starts VO at leadInMs (not 0). Captions need real word-level cues from
  // TTS, so they're forced off whenever TTS is off, regardless of the
  // captionsEnabled toggle.
  const captions = (captionsEnabled && vo)
    ? vo.cues.map((c) => ({ text: c.text, startMs: c.startMs + leadInMs, endMs: c.endMs + leadInMs }))
    : [];

  // 4) music + sfx + mix
  // variantSeed randomizes the beat pattern's RNG draw per render so
  // repeated evergreen posts of the same pack don't all carry the literal
  // same music bed — same mood/genre character, different take.
  const musicPath = musicEnabled ? join(buildDir, "music.wav") : null;
  if (musicEnabled) {
    generateMusicBed({ moodId, mood, durationSeconds: totalDurationMs / 1000, outPath: musicPath, variantSeed: randomBytes(4).toString("hex") });
  }

  const beatCount = generated.beats.length;
  const hasStat = !!generated.statNarration && pack.scriptCount > 0;
  const transitionFrames = Math.max(2, Math.round(SOCIAL_TRANSITION_FRAMES * pacing.multiplier));
  const useBeatMatch = beatMatch && musicEnabled;
  const { cutFrames } = socialTimeline({ totalFrames, beatCount, hasStat, transitionFrames, beatMatch: useBeatMatch, bpm: mood.bpm, fps: platform.fps });
  const cutMs = cutFrames.map((f) => (f / platform.fps) * 1000);
  const cues = socialSfxCues(cutMs, hasStat);

  const mixedPath = join(buildDir, "mix.wav");
  await mixAudio({ voPath: vo ? vo.audioPath : null, leadInMs, totalDurationMs, musicPath, sfxDir: SFX_DIR, cues, outPath: mixedPath });

  // Remotion loads audio via staticFile() from public/ — copy the finished
  // mix there under a stable, job-scoped name.
  mkdirSync(join(PUBLIC_DIR, "audio"), { recursive: true });
  const publicAudioRel = join("audio", `${jobId}.wav`);
  copyFileSync(mixedPath, join(PUBLIC_DIR, publicAudioRel));

  // Code card(s): pull real source for the scripts the copy referenced.
  const featured = generated.beats
    .map((b) => scripts.find((s) => s.id === b.featureScriptId))
    .filter(Boolean);
  const codeSource = (featured.length ? featured : scripts.slice(0, 2)).slice(0, 2);
  const codeSnippets = codeSource.map((s) => ({
    title: `${s.title.replace(/[^a-zA-Z0-9 ]/g, "")}.${s.file_ext}`,
    lines: db.extractCodeLines(db.readScriptSource(s)),
  })).filter((c) => c.lines.length > 0);

  // 5) edit/animation input props
  const props = {
    packId,
    packName: pack.packName,
    gameTitle: pack.gameTitle,
    genre: pack.genre,
    priceLabel: pack.priceLabel,
    scriptCount: pack.scriptCount,
    platform: platformId,
    copy: {
      hook: generated.hook.onScreen,
      heroWord: generated.hook.heroWord,
      beats: generated.beats.map((b) => ({ heading: b.onScreen, body: b.narration })),
      codeSnippets,
      stat: hasStat ? { label: "scripts in this pack", value: pack.scriptCount, decimals: 0 } : undefined,
      cta: generated.cta.onScreen,
      ctaSub: generated.cta.sub,
    },
    captions,
    audioSrc: publicAudioRel.replace(/\\/g, "/"),
    fps: platform.fps,
    width: platform.width,
    height: platform.height,
    durationInFrames: totalFrames,
    transitionFrames,
    animationIntensity: animation.multiplier,
    beatMatch: useBeatMatch,
    musicBpm: musicEnabled ? mood.bpm : undefined,
  };
  writeFileSync(join(buildDir, "props.json"), JSON.stringify(props, null, 2));

  // 6) render
  mkdirSync(join(OUTPUT_DIR, platformId), { recursive: true });
  const outPath = join(OUTPUT_DIR, platformId, `${packId}.mp4`);
  log("rendering...");
  await renderComposition({ compositionId: platform.composition, props, outPath, propsFileName: `${jobId}.json`, crf: quality.crf });
  log("rendered ->", outPath);

  // 7) QA
  const report = await qaVideo({
    videoPath: outPath,
    expected: {
      width: platform.width,
      height: platform.height,
      fps: platform.fps,
      minDurationSec: (totalDurationMs / 1000) * 0.85,
      maxDurationSec: (totalDurationMs / 1000) * 1.15,
    },
    reportPath: join(buildDir, "qa-report.json"),
  });
  log(`QA ${report.pass ? "PASS" : "FAIL"}`, report.checks.filter((c) => !c.pass).map((c) => c.name));

  return { jobId, outPath, report };
}

async function buildWebsiteJob(quality = qualityFor("standard"), pacing = pacingFor("normal"), length = lengthFor("auto"), options = {}) {
  const {
    captionsEnabled = true,
    ttsEnabled = true,
    musicEnabled = true,
    beatMatch = false,
    speed = speedFor("normal"),
    animation = animationFor("moderate"),
  } = options;
  if (!ttsEnabled && !musicEnabled) {
    throw new Error("Cannot render with both voiceover and music disabled — a silent, musicless video isn't supported.");
  }

  const jobId = "website-premium";
  log(`=== ${jobId} === (quality: ${quality.id}, pacing: ${pacing.id}, length: ${length.id}, speed: ${speed.id}, animation: ${animation.id}, captions: ${captionsEnabled}, tts: ${ttsEnabled}, music: ${musicEnabled}, beatMatch: ${beatMatch})`);
  const platform = platformFor("website");
  const buildDir = join(BUILD_DIR, jobId);
  mkdirSync(buildDir, { recursive: true });

  const packs = db.listPacks();
  const totalScripts = db.totalScriptCount();

  const targetWords = length.targetSeconds ? Math.round(length.targetSeconds * WORDS_PER_SECOND) : undefined;
  const generated = await generateWebsiteCopy({ packs, totalScripts, model: quality.claudeModel, targetWords });
  log("copy generated");

  const narrationText = [
    generated.hook.narration,
    generated.showcaseNarration,
    generated.statsNarration,
    generated.cta.narration,
  ].filter(Boolean).join(" ");

  const mood = moodFor("website");
  let vo = null;
  let voDurationMs;
  if (ttsEnabled) {
    vo = await synthesizeVoiceover({
      text: narrationText,
      outDir: buildDir,
      jobId,
      rate: speed.rate,
      pitch: moodPitchHint(mood),
    });
    log(`voiceover via ${vo.provider}, ${vo.cues.length} words`);
    voDurationMs = vo.cues.length ? vo.cues[vo.cues.length - 1].endMs : 6000;
  } else {
    const wordCount = narrationText.split(/\s+/).filter(Boolean).length;
    voDurationMs = Math.max(6000, Math.round((wordCount / WORDS_PER_SECOND) * 1000));
    log(`voiceover disabled — estimated duration ${voDurationMs}ms from ${wordCount} words`);
  }

  const leadInMs = platform.leadInMs;
  const tailMs = platform.tailMs;
  const totalDurationMs = leadInMs + voDurationMs + tailMs;
  const totalFrames = Math.round((totalDurationMs / 1000) * platform.fps);
  const captions = (captionsEnabled && vo)
    ? vo.cues.map((c) => ({ text: c.text, startMs: c.startMs + leadInMs, endMs: c.endMs + leadInMs }))
    : [];

  const musicPath = musicEnabled ? join(buildDir, "music.wav") : null;
  if (musicEnabled) {
    generateMusicBed({ moodId: "website", mood, durationSeconds: totalDurationMs / 1000, outPath: musicPath, variantSeed: randomBytes(4).toString("hex") });
  }

  const transitionFrames = Math.max(2, Math.round(WEBSITE_TRANSITION_FRAMES * pacing.multiplier));
  const useBeatMatch = beatMatch && musicEnabled;
  const { cutFrames } = websiteTimeline({ totalFrames, transitionFrames, beatMatch: useBeatMatch, bpm: mood.bpm, fps: platform.fps });
  const cutMs = cutFrames.map((f) => (f / platform.fps) * 1000);
  const cues = websiteSfxCues(cutMs);

  const mixedPath = join(buildDir, "mix.wav");
  await mixAudio({ voPath: vo ? vo.audioPath : null, leadInMs, totalDurationMs, musicPath, sfxDir: SFX_DIR, cues, outPath: mixedPath });

  mkdirSync(join(PUBLIC_DIR, "audio"), { recursive: true });
  const publicAudioRel = join("audio", `${jobId}.wav`);
  copyFileSync(mixedPath, join(PUBLIC_DIR, publicAudioRel));

  const props = {
    copy: {
      hook: generated.hook.onScreen,
      heroWord: generated.hook.heroWord,
      subhead: generated.subhead,
      beats: packs.slice(0, 6).map((p) => ({ packName: p.packName, visual: PACK_VISUAL[p.id] ?? "custom", tag: p.genre })),
      stats: [
        { label: "script packs", value: packs.length, decimals: 0 },
        { label: "ready-made scripts", value: totalScripts, suffix: "+", decimals: 0 },
        { label: "instant delivery", value: 100, suffix: "%", decimals: 0 },
      ],
      cta: generated.cta.onScreen,
      ctaSub: "scripforge.net",
    },
    captions,
    audioSrc: publicAudioRel.replace(/\\/g, "/"),
    fps: platform.fps,
    width: platform.width,
    height: platform.height,
    durationInFrames: totalFrames,
    transitionFrames,
    animationIntensity: animation.multiplier,
    beatMatch: useBeatMatch,
    musicBpm: musicEnabled ? mood.bpm : undefined,
  };
  writeFileSync(join(buildDir, "props.json"), JSON.stringify(props, null, 2));

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outPath = join(OUTPUT_DIR, "website-premium.mp4");
  log("rendering...");
  await renderComposition({ compositionId: platform.composition, props, outPath, propsFileName: `${jobId}.json`, crf: quality.crf });
  log("rendered ->", outPath);

  const report = await qaVideo({
    videoPath: outPath,
    expected: {
      width: platform.width,
      height: platform.height,
      fps: platform.fps,
      minDurationSec: (totalDurationMs / 1000) * 0.85,
      maxDurationSec: (totalDurationMs / 1000) * 1.15,
    },
    reportPath: join(buildDir, "qa-report.json"),
  });
  log(`QA ${report.pass ? "PASS" : "FAIL"}`, report.checks.filter((c) => !c.pass).map((c) => c.name));

  return { jobId, outPath, report };
}

const PACK_VISUAL = {
  apex: "apex", "call-of-duty": "cod", fortnite: "neon", "gta-v": "gta", minecraft: "arcane",
  pubg: "pubg", roblox: "ruin", skyrim: "skyrim", valorant: "valorant",
  "discord-bots": "bots", websites: "webdev", "smm-services": "smm",
};

async function main() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const has = (flag) => args.includes(flag);

  // Effort/quality tier — trades Claude spend + render time for polish.
  // --quality flag wins; otherwise VIDEO_QUALITY env (set by the admin
  // dashboard's quality slider, server/routes/videoAdmin.js); default
  // "standard". Same flag > env > default precedence for pacing/length/angle.
  const quality = qualityFor(get("--quality") || process.env.VIDEO_QUALITY || "standard");
  const pacing = pacingFor(get("--pacing") || process.env.VIDEO_PACING || "normal");
  const length = lengthFor(get("--length") || process.env.VIDEO_LENGTH || "auto");
  const angle = angleFor(get("--angle") || process.env.VIDEO_ANGLE || "auto");
  const speed = speedFor(get("--speed") || process.env.VIDEO_SPEECH_SPEED);
  const animation = animationFor(get("--animation") || process.env.VIDEO_ANIMATION);

  // Boolean toggles (captions/TTS/music/beat-match) — same flag > env >
  // default precedence as the tiers above, coerced from "true"/"false"/"1"/"0".
  const boolFlag = (flagVal, envVal, def) => {
    const raw = flagVal !== undefined ? flagVal : envVal;
    if (raw === undefined || raw === null || raw === "") return def;
    return raw === "true" || raw === "1";
  };
  const captionsEnabled = boolFlag(get("--captions"), process.env.VIDEO_CAPTIONS, true);
  const ttsEnabled = boolFlag(get("--tts"), process.env.VIDEO_TTS_ENABLED, true);
  const musicEnabled = boolFlag(get("--music"), process.env.VIDEO_MUSIC, true);
  const beatMatch = boolFlag(get("--beatmatch"), process.env.VIDEO_BEATMATCH, false);
  const options = { captionsEnabled, ttsEnabled, musicEnabled, beatMatch, speed, animation };

  const results = [];

  if (has("--all")) {
    const packs = db.listPacks().filter((p) => PACK_MOOD[p.id]);
    for (const p of packs) {
      for (const platformId of ["tiktok", "shorts", "promo"]) {
        results.push(await buildPackJob(p.id, platformId, quality, pacing, length, angle, options));
      }
    }
    if (has("--website")) results.push(await buildWebsiteJob(quality, pacing, length, options));
  } else if (has("--website")) {
    results.push(await buildWebsiteJob(quality, pacing, length, options));
  } else {
    const packId = get("--pack");
    const platformId = get("--platform") || "tiktok";
    if (!packId) {
      console.error(
        "Usage: node pipeline/orchestrate.mjs --pack <id> --platform <tiktok|shorts|promo> | --website | --all [--website] " +
          "[--quality draft|standard|high|ultra] [--pacing contemplative|relaxed|gentle|normal|brisk|fast|rapid|hyper|flash|strobe] [--length auto|micro|blink|short|compact|medium|standard|long|extended|deep|marathon] [--angle auto|product_showcase|tutorial_snippet|before_after|social_proof|behind_the_scenes|competitive_comparison|meme_style|feature_spotlight|problem_solution] " +
          "[--speed slow|normal|fast|rapid] [--animation subtle|moderate|flashy|maximal] [--captions true|false] [--tts true|false] [--music true|false] [--beatmatch true|false]"
      );
      process.exit(1);
    }
    results.push(await buildPackJob(packId, platformId, quality, pacing, length, angle, options));
  }

  log("=== summary ===");
  for (const r of results) log(r.jobId, r.report.pass ? "PASS" : "FAIL", "->", r.outPath);
  if (results.some((r) => !r.report.pass)) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[video] FAILED:", err.message);
  process.exitCode = 1;
});
