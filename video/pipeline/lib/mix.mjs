// Builds the single mastered audio track a composition plays via
// <MasterAudio> (see src/components/Audio.tsx) — voiceover, procedural
// music bed, and SFX hits combined with real audio-engineering techniques
// (sidechain ducking, loudness normalization), not just layered and hoped
// for the best. Doing the mix here in ffmpeg (rather than as separate
// <Sequence><Audio> layers inside Remotion) means the pipeline's "voice/music"
// stage produces one finished asset before "edit/animation/render" ever
// starts — the two stages the user asked for stay genuinely separate.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { windowsHide: true });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`${cmd} exited ${code}\n${stderr.slice(-4000)}`));
      else resolve(stderr);
    });
  });
}

// cues: [{ sfx: "whoosh.wav" | "bass-hit.wav" | "riser.wav" | "shimmer.wav", atMs, gain }]
// voPath/musicPath are each independently optional (TTS-off / music-off
// render options — see pipeline/orchestrate.mjs) but at least one must be
// present; a silent, musicless video isn't a supported mix.
export async function mixAudio({ voPath, leadInMs, totalDurationMs, musicPath, sfxDir, cues, outPath }) {
  mkdirSync(dirname(outPath), { recursive: true });

  const inputs = [];
  const addInput = (p) => {
    const idx = inputs.length / 2;
    inputs.push("-i", p);
    return idx;
  };

  const voIdx = voPath ? addInput(voPath) : null;
  const musicIdx = musicPath ? addInput(musicPath) : null;
  const sfxInputIndex = cues.map((cue) => addInput(join(sfxDir, cue.sfx)));

  const filters = [];
  const mixLabels = [];

  if (voIdx !== null) {
    filters.push(`[${voIdx}:a]adelay=${Math.max(0, Math.round(leadInMs))}:all=1[vo]`);
    mixLabels.push("[vo]");
  }

  if (musicIdx !== null) {
    filters.push(`[${musicIdx}:a]volume=0.55[music_v]`);
    if (voIdx !== null) {
      // Real sidechain ducking: music level drops whenever the VO is actually
      // speaking, recovers in the gaps — not a blunt fixed-window mute.
      filters.push(
        `[music_v][vo]sidechaincompress=threshold=0.02:ratio=12:attack=15:release=350:makeup=1[music_duck]`
      );
      mixLabels.push("[music_duck]");
    } else {
      mixLabels.push("[music_v]");
    }
  }

  if (mixLabels.length === 0) {
    throw new Error("mixAudio: at least one of voPath/musicPath must be provided.");
  }

  cues.forEach((cue, i) => {
    const idx = sfxInputIndex[i];
    const label = `sfx${i}`;
    filters.push(
      `[${idx}:a]volume=${cue.gain ?? 0.6}[sfx${i}v]`
    );
    filters.push(`[sfx${i}v]adelay=${Math.max(0, Math.round(cue.atMs))}:all=1[${label}]`);
    mixLabels.push(`[${label}]`);
  });

  filters.push(
    `${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=longest:normalize=0[premix]`
  );
  // -16 LUFS / -1.5dB true peak — a safe, broadly-used target for social
  // video (platforms re-normalize anyway; this avoids arriving too quiet
  // or clipped either way).
  filters.push(`[premix]loudnorm=I=-16:TP=-1.5:LRA=11[normed]`);
  filters.push(`[normed]apad[final]`);

  const args = [
    "-y",
    ...inputs,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[final]",
    "-t",
    (totalDurationMs / 1000).toFixed(3),
    "-ar",
    "44100",
    "-ac",
    "2",
    outPath,
  ];

  await run("ffmpeg", args);
  return outPath;
}

// Builds the SFX cue list for a social (pack) video from the same cut
// points the composition itself renders on (pipeline/lib/timeline.mjs).
export function socialSfxCues(cutFramesMs, hasStat) {
  const cues = [];
  // cutFramesMs: [hook->beat1, beat1->beat2(...), ..., last->cta]
  cutFramesMs.forEach((ms, i) => {
    const isLast = i === cutFramesMs.length - 1;
    cues.push({ sfx: "whoosh.wav", atMs: Math.max(0, ms - 60), gain: 0.5 });
    if (isLast) {
      cues.push({ sfx: "bass-hit.wav", atMs: ms, gain: 0.7 });
      cues.push({ sfx: "shimmer.wav", atMs: ms + 40, gain: 0.4 });
    }
  });
  if (hasStat && cutFramesMs.length >= 2) {
    const payoffCutMs = cutFramesMs[cutFramesMs.length - 2];
    cues.push({ sfx: "riser.wav", atMs: Math.max(0, payoffCutMs - 700), gain: 0.35 });
  }
  return cues;
}

export function websiteSfxCues(cutFramesMs) {
  const cues = [];
  cutFramesMs.forEach((ms, i) => {
    const isLast = i === cutFramesMs.length - 1;
    cues.push({ sfx: "whoosh.wav", atMs: Math.max(0, ms - 60), gain: 0.5 });
    if (isLast) {
      cues.push({ sfx: "bass-hit.wav", atMs: ms, gain: 0.7 });
      cues.push({ sfx: "shimmer.wav", atMs: ms + 40, gain: 0.4 });
    }
  });
  if (cutFramesMs.length >= 1) {
    cues.push({ sfx: "riser.wav", atMs: Math.max(0, cutFramesMs[0] - 900), gain: 0.3 });
  }
  return cues;
}
