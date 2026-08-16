// Generates just the audio side (voiceover + music + SFX + final mix) for a
// pack/platform without rendering video — fast way to audition VO pacing,
// music mood, and mix balance while iterating on pipeline/lib/mix.mjs,
// music.mjs, or tts.mjs.
//   node pipeline/scripts/gen-audio.mjs --pack minecraft --platform tiktok
import "../lib/env.mjs";
import { mkdirSync } from "node:fs";
import { join as pjoin } from "node:path";
import { fileURLToPath } from "node:url";
import * as db from "../lib/db.mjs";
import { platformFor } from "../config/platforms.mjs";
import { moodFor } from "../config/moods.mjs";
import { generatePackCopy } from "../lib/copywriter.mjs";
import { synthesizeVoiceover } from "../lib/tts.mjs";
import { generateMusicBed } from "../lib/music.mjs";
import { ensureSfxKit } from "../lib/sfx.mjs";
import { mixAudio, socialSfxCues } from "../lib/mix.mjs";
import { socialTimeline } from "../lib/timeline.mjs";

const VIDEO_ROOT = pjoin(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const BUILD_DIR = pjoin(VIDEO_ROOT, "build");
const SFX_DIR = pjoin(VIDEO_ROOT, "public", "sfx");
ensureSfxKit(SFX_DIR);

const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const packId = get("--pack");
  const platformId = get("--platform") || "tiktok";
  if (!packId) {
    console.error("Usage: node pipeline/scripts/gen-audio.mjs --pack <id> --platform <tiktok|shorts|promo>");
    process.exit(1);
  }

  const platform = platformFor(platformId);
  const jobId = `${packId}-${platformId}-audio`;
  const buildDir = pjoin(BUILD_DIR, jobId);
  mkdirSync(buildDir, { recursive: true });

  const pack = db.getPack(packId);
  pack.priceLabel = db.priceLabel(pack.minPriceCents);
  const scripts = db.listScripts(packId, 6);
  const generated = await generatePackCopy({ platform: platformId, pack, scripts });

  const narrationText = [
    generated.hook.narration,
    ...generated.beats.map((b) => b.narration),
    generated.statNarration,
    generated.cta.narration,
  ].filter(Boolean).join(" ");
  console.log(`narration (${narrationText.split(/\s+/).length} words): ${narrationText}`);

  const vo = await synthesizeVoiceover({ text: narrationText, outDir: buildDir, jobId, rate: platform.ttsRate ?? 0 });
  console.log(`voiceover via ${vo.provider} -> ${vo.audioPath}`);

  const voDurationMs = vo.cues.length ? vo.cues[vo.cues.length - 1].endMs : 4000;
  const leadInMs = platform.leadInMs;
  const totalDurationMs = leadInMs + voDurationMs + platform.tailMs;
  const totalFrames = Math.round((totalDurationMs / 1000) * platform.fps);

  const moodId = get("--mood") || "clean-tech";
  const musicPath = pjoin(buildDir, "music.wav");
  generateMusicBed({ moodId, mood: moodFor(moodId), durationSeconds: totalDurationMs / 1000, outPath: musicPath });
  console.log(`music (${moodId}) -> ${musicPath}`);

  const beatCount = generated.beats.length;
  const hasStat = !!generated.statNarration && pack.scriptCount > 0;
  const { cutFrames } = socialTimeline({ totalFrames, beatCount, hasStat });
  const cutMs = cutFrames.map((f) => (f / platform.fps) * 1000);
  const cues = socialSfxCues(cutMs, hasStat);

  const mixedPath = pjoin(buildDir, "mix.wav");
  await mixAudio({ voPath: vo.audioPath, leadInMs, totalDurationMs, musicPath, sfxDir: SFX_DIR, cues, outPath: mixedPath });
  console.log(`mixed -> ${mixedPath}`);
}

main().catch((err) => {
  console.error("[gen-audio] FAILED:", err.message);
  process.exitCode = 1;
});
