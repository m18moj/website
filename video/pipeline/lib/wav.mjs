// Minimal mono 16-bit PCM WAV encoder — no dependency needed for the
// procedural music/SFX synths (pattern from claude-remotion-skill's
// examples/scripts/gen-*.mjs).
import { readFileSync } from "node:fs";

export const SR = 44100;

export function encodeWav(samples, sampleRate = SR) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

// Deterministic PRNG (mulberry32) so a given mood/seed always renders the
// same track/kit — reproducible automated output, not random each run.
export function makeRng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Reads a WAV file's exact duration straight from its own header (walking
// chunks to find "data", since some encoders insert "fact"/"LIST" chunks
// before it) — used both for QA and to correct SAPI's SpeakProgress word
// timestamps, which on this engine run at a consistent ratio ahead of the
// audio actually written to disk (verified empirically across multiple runs
// at different rates — always the same ratio, not a fluke). Rather than
// hardcode that one engine's quirk, every TTS provider's raw word
// timestamps get rescaled to match the real, measured file duration — see
// rescaleCues below.
export function readWavDurationMs(filePath) {
  const buf = readFileSync(filePath);
  const sampleRate = buf.readUInt32LE(24);
  const blockAlign = buf.readUInt16LE(32);
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      const frames = chunkSize / blockAlign;
      return Math.round((frames / sampleRate) * 1000);
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  throw new Error(`No "data" chunk found in WAV file: ${filePath}`);
}

// Rescales raw word cues (startMs/endMs may be on a different clock than
// the actual rendered audio — see readWavDurationMs) to match the file's
// real, measured duration, and clamps the final cue's end to that duration.
export function rescaleCues(rawCues, actualDurationMs, minLastWordMs = 220) {
  if (rawCues.length === 0) return [];
  const rawLastStart = rawCues[rawCues.length - 1].startMs || 1;
  const scale = rawLastStart > 0 ? actualDurationMs / rawLastStart : 1;
  const scaled = rawCues.map((c) => ({
    text: c.text,
    startMs: Math.round(c.startMs * scale),
    endMs: Math.round(c.endMs * scale),
  }));
  const last = scaled[scaled.length - 1];
  // Anchoring the scale on the last word's own (raw) start time means the
  // naive scaled result gives it zero visible duration — push its start
  // back far enough to actually be readable, without crossing the previous
  // word's start.
  const prevStart = scaled.length > 1 ? scaled[scaled.length - 2].startMs : 0;
  last.startMs = Math.max(prevStart, Math.min(last.startMs, actualDurationMs - minLastWordMs));
  last.endMs = actualDurationMs;
  return scaled;
}

export function normalize(out, peakTarget = 0.9) {
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak === 0) return out;
  const g = peakTarget / peak;
  for (let i = 0; i < out.length; i++) out[i] *= g;
  return out;
}
