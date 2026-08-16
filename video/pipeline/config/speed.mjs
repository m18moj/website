// Speech rate for the TTS voiceover — a separate concept from `pacing`
// (pacing.mjs), which only controls cut/transition speed, never how fast the
// narrator talks. Expressed on the same -10..10 scale SAPI/edge-tts already
// use (see pipeline/lib/tts-sapi.mjs, tts-edge.mjs's sapiRateToPercent), so
// switching TTS engines doesn't change what a given preset sounds like.
export const SPEED_PRESETS = {
  glacial: { id: "glacial", label: "Glacial", description: "Extremely slow — maximum clarity, accessibility-focused.", rate: -9 },
  slow: { id: "slow", label: "Slow", description: "Deliberate, easy-to-follow narration pace.", rate: -6 },
  relaxed: { id: "relaxed", label: "Relaxed", description: "Slightly slower than natural — calm and clear.", rate: -3 },
  normal: { id: "normal", label: "Normal", description: "Natural conversational speaking pace.", rate: 0 },
  brisk: { id: "brisk", label: "Brisk", description: "Slightly quicker than natural — engaged and lively.", rate: 2 },
  fast: { id: "fast", label: "Fast", description: "Energetic, quick-talking narration.", rate: 4 },
  quick: { id: "quick", label: "Quick", description: "Snappy delivery — high-energy short-form pace.", rate: 6 },
  rapid: { id: "rapid", label: "Rapid", description: "Very fast — hype/meme-style delivery.", rate: 8 },
  hyper: { id: "hyper", label: "Hyper", description: "Extremely fast — auctioneer-style intensity.", rate: 9 },
  turbo: { id: "turbo", label: "Turbo", description: "Maximum speed — fastest possible narration.", rate: 10 },
};

export const SPEED_ORDER = ["glacial", "slow", "relaxed", "normal", "brisk", "fast", "quick", "rapid", "hyper", "turbo"];

// Accepts a preset id, a raw number on the -10..10 scale typed directly into
// the admin's speed field, or nothing (falls back to normal).
export function speedFor(idOrRaw) {
  if (idOrRaw === undefined || idOrRaw === null || idOrRaw === "") return SPEED_PRESETS.normal;
  const id = String(idOrRaw).trim();
  if (SPEED_PRESETS[id]) return SPEED_PRESETS[id];
  const numeric = parseFloat(id);
  if (Number.isFinite(numeric)) {
    const rate = Math.min(Math.max(Math.round(numeric), -10), 10);
    return {
      id: "custom",
      label: `Custom (${rate > 0 ? "+" : ""}${rate})`,
      description: `Custom TTS rate: ${rate} on the -10..10 scale.`,
      rate,
    };
  }
  return SPEED_PRESETS.normal;
}

// ElevenLabs' `voice_settings.speed` field is bounded 0.7-1.2 (per their API
// docs) rather than the -10..10 SAPI/edge scale everything else here uses —
// this maps one onto the other so a given speed preset sounds consistently
// faster/slower no matter which TTS engine ends up handling the job.
export function speedToElevenLabsMultiplier(rate) {
  const clamped = Math.min(Math.max(rate, -10), 10);
  return Number((1 + (clamped / 10) * 0.2).toFixed(3));
}
