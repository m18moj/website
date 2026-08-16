// Procedural mood-matched music bed generator — no royalty-free-library
// hunting, no third-party API, no licensing risk. Pattern lifted from
// claude-remotion-skill's examples/scripts/gen-track.mjs (sine/noise
// synthesis assembled on a beat grid) and generalized to take a mood
// profile (pipeline/config/moods.mjs) and an arbitrary target duration, so
// every pack genre gets a genuinely different-sounding score: tight tense
// ticking for Valorant, driving synthwave for GTA, warm epic swells for
// Skyrim, etc.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SR, encodeWav, makeRng, seedFromString, normalize } from "./wav.mjs";

function synthesize(mood, durationSeconds, seed) {
  const N = Math.max(1, Math.floor(SR * durationSeconds));
  const out = new Float32Array(N);
  const rnd = makeRng(seed);

  const add = (startSec, durSec, fn) => {
    const s0 = Math.max(0, Math.floor(startSec * SR));
    const n = Math.floor(durSec * SR);
    for (let i = 0; i < n && s0 + i < N; i++) out[s0 + i] += fn(i / SR, n === 0 ? 0 : i / n);
  };

  const FPB = 60 / mood.bpm; // seconds per beat

  const kick = (t, amp = 1) =>
    add(t, 0.26, (ts, p) => {
      const f = 145 - 100 * Math.min(1, ts * 9);
      return Math.sin(2 * Math.PI * f * ts) * Math.exp(-p * 7) * 0.85 * amp;
    });

  const snareHit = (t) => {
    add(t, 0.16, (ts, p) => (rnd() * 2 - 1) * Math.exp(-p * 9) * 0.5);
    add(t, 0.1, (ts, p) => Math.sin(2 * Math.PI * 190 * ts) * Math.exp(-p * 12) * 0.35);
  };

  const hat = (t, brightness = 0.5) =>
    add(t, 0.04 + brightness * 0.02, (ts, p) => (rnd() * 2 - 1) * Math.exp(-p * 11) * (0.06 + brightness * 0.08));

  const bass = (t, freq, dur = 0.22, amp = 1) =>
    add(t, dur, (ts, p) => {
      const env = Math.min(1, ts * 90) * Math.exp(-p * 4);
      return (
        (Math.sin(2 * Math.PI * freq * ts) + Math.sin(2 * Math.PI * freq * 3 * ts) / 3.5) * env * 0.3 * amp
      );
    });

  const pluck = (t, freq, style, dur = 0.16) =>
    add(t, dur, (ts, p) => {
      const env = Math.min(1, ts * 200) * Math.exp(-p * (style === "synthwave" ? 5 : 7));
      const wave =
        style === "tech"
          ? Math.sign(Math.sin(2 * Math.PI * freq * ts)) * 0.35 +
            Math.sin(2 * Math.PI * freq * ts) * 0.4
          : Math.sin(2 * Math.PI * freq * ts) + Math.sin(2 * Math.PI * freq * 2.01 * ts) * 0.3;
      return wave * env * 0.22;
    });

  const impact = (t) => {
    add(t, 0.9, (ts, p) => {
      const f = 60 - 25 * Math.min(1, ts * 3);
      return Math.sin(2 * Math.PI * f * ts) * Math.exp(-p * 4.5) * 0.85;
    });
    add(t, 0.35, (ts, p) => (rnd() * 2 - 1) * Math.exp(-p * 6) * 0.3);
  };

  // Pad: sustained detuned chord across the whole duration, attack/release
  // shaped so it breathes under intro and outro.
  const attack = Math.min(2.2, durationSeconds * 0.22);
  const release = Math.min(2.6, durationSeconds * 0.22);
  add(0, durationSeconds, (ts) => {
    const a = Math.min(1, ts / attack);
    const r = Math.min(1, (durationSeconds - ts) / release);
    const trem = 1 - 0.12 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.15 * ts));
    let v = 0;
    for (const f of mood.chord) v += Math.sin(2 * Math.PI * f * ts) + Math.sin(2 * Math.PI * f * 1.0015 * ts);
    return v * (0.05 / mood.chord.length) * a * r * trem * (0.6 + mood.brightness * 0.4);
  });

  // Section boundaries: intro (pad only) -> main (full groove) -> outro (drums drop, pad tail).
  const introEnd = Math.min(2.2, durationSeconds * 0.14);
  const outroStart = Math.max(introEnd + 0.5, durationSeconds - Math.min(2.4, durationSeconds * 0.16));

  const beats = Math.floor((outroStart - introEnd) / FPB);
  for (let b = 0; b < beats; b++) {
    const t = introEnd + b * FPB;
    const beatInBar = b % 4;

    if (mood.kick === "four-on-floor") kick(t, 1);
    else if (mood.kick === "four-on-floor-light") kick(t, 0.6);
    else if (mood.kick === "half-time" && beatInBar % 2 === 0) kick(t, 0.9);
    else if (mood.kick === "sparse" && beatInBar === 0) kick(t, 0.8);

    if (mood.snare && beatInBar === 2) snareHit(t);

    if (mood.hats === true) hat(t + FPB / 2, mood.brightness);
    if (mood.hats === "16ths") {
      hat(t, mood.brightness);
      hat(t + FPB / 4, mood.brightness * 0.7);
      hat(t + FPB / 2, mood.brightness);
      hat(t + (FPB * 3) / 4, mood.brightness * 0.7);
    }
    if (mood.hats === "tick" && beatInBar % 2 === 0) hat(t, mood.brightness * 0.6);

    if (beatInBar % 2 === 0) bass(t, mood.root, FPB * 0.85, 0.85 + mood.energy * 0.3);

    if (mood.arp) {
      const step = b % mood.chord.length;
      pluck(t + FPB / 2, mood.chord[step] * 2, mood.arp === true ? "pluck" : mood.arp, FPB * 0.4);
    }
  }

  if (mood.riser) {
    const riserStart = Math.max(0, introEnd - 1.2);
    add(riserStart, introEnd - riserStart + 0.2, (ts, p) => (rnd() * 2 - 1) * p * p * 0.35);
  }
  if (mood.impact) {
    impact(introEnd);
    if (outroStart - introEnd > 4) impact(outroStart - 0.3);
  }
  if (mood.swell) {
    add(introEnd, Math.min(3, outroStart - introEnd), (ts, p) =>
      Math.sin(2 * Math.PI * mood.root * 2 * ts) * Math.sin(Math.PI * p) * 0.06
    );
  }

  normalize(out, 0.85);
  return out;
}

export function generateMusicBed({ moodId, mood, durationSeconds, outPath }) {
  mkdirSync(dirname(outPath), { recursive: true });
  const seed = seedFromString(`${moodId}:${Math.round(durationSeconds * 10)}`);
  const samples = synthesize(mood, durationSeconds, seed);
  writeFileSync(outPath, encodeWav(samples));
  return outPath;
}
