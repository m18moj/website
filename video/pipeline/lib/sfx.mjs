// Synthesizes a small SFX kit as 16-bit WAVs — zero downloads, fully
// deterministic (claude-remotion-skill's "no SFX assets is not a reason to
// ship silent" pattern). Generated once into video/public/sfx/ and reused
// by every job's audio mix.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SR, encodeWav, makeRng } from "./wav.mjs";

const rnd = makeRng(1337);

function synthWhoosh() {
  const N = Math.round(0.4 * SR);
  const out = new Float32Array(N);
  let lp = 0;
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const env = Math.sin(Math.PI * Math.pow(t, 0.7)) ** 2;
    const cutoff = 0.05 + 0.25 * Math.sin(Math.PI * t);
    lp += cutoff * (rnd() * 2 - 1 - lp);
    out[i] = lp * env * 0.9;
  }
  return out;
}

function synthReverseWhoosh() {
  const w = synthWhoosh();
  return w.reverse();
}

function synthPop() {
  const N = Math.round(0.14 * SR);
  const out = new Float32Array(N);
  let phase = 0;
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const f = 700 - 380 * t;
    phase += (2 * Math.PI * f) / SR;
    out[i] = Math.sin(phase) * Math.exp(-t * 9) * 0.8;
  }
  return out;
}

function synthClick(freq = 1900) {
  const N = Math.round(0.05 * SR);
  const out = new Float32Array(N);
  let phase = 0;
  for (let i = 0; i < N; i++) {
    const t = i / N;
    phase += (2 * Math.PI * freq) / SR;
    out[i] = Math.sin(phase) * Math.exp(-t * 14) * 0.5;
  }
  return out;
}

function synthBassHit() {
  const N = Math.round(0.45 * SR);
  const out = new Float32Array(N);
  let phase = 0;
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const f = 85 - 25 * t;
    phase += (2 * Math.PI * f) / SR;
    out[i] = Math.sin(phase) * Math.exp(-t * 6) * 0.95;
  }
  return out;
}

function synthRiser() {
  const N = Math.round(0.8 * SR);
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const p = i / N;
    out[i] = (rnd() * 2 - 1) * p * p * 0.5;
  }
  return out;
}

function synthShimmer() {
  const N = Math.round(0.9 * SR);
  const out = new Float32Array(N);
  const freqs = [1760, 2217, 2637, 3520];
  for (const f of freqs) {
    let phase = rnd() * Math.PI * 2;
    for (let i = 0; i < N; i++) {
      const t = i / N;
      phase += (2 * Math.PI * f) / SR;
      out[i] += Math.sin(phase) * Math.exp(-t * 3.2) * 0.06;
    }
  }
  return out;
}

const KIT = {
  "whoosh.wav": synthWhoosh,
  "whoosh-reverse.wav": synthReverseWhoosh,
  "pop.wav": synthPop,
  "click.wav": () => synthClick(1900),
  "click-low.wav": () => synthClick(1200),
  "bass-hit.wav": synthBassHit,
  "riser.wav": synthRiser,
  "shimmer.wav": synthShimmer,
};

export function ensureSfxKit(outDir) {
  mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const [name, gen] of Object.entries(KIT)) {
    const path = join(outDir, name);
    if (!existsSync(path)) {
      writeFileSync(path, encodeWav(gen()));
    }
    written.push(path);
  }
  return written;
}
