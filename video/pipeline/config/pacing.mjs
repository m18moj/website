// Editing pace — how quickly scenes cut, independent of voice/TTS rate
// (see pipeline/config/speed.mjs / VIDEO_SPEECH_SPEED elsewhere). Expressed
// as a multiplier applied to each composition's own base transition length
// (pipeline/lib/timeline.mjs's SOCIAL_TRANSITION_FRAMES /
// WEBSITE_TRANSITION_FRAMES) rather than an absolute frame count, since the
// two compositions have different baselines. A shorter transition also
// lowers the minimum-scene-duration floor in splitDuration(), so "fast"
// genuinely produces more frequent cuts, not just snappier fades.
export const PACING_PRESETS = {
  contemplative: { id: "contemplative", label: "Contemplative", description: "Very long holds — meditative, ambient, or luxury feel.", multiplier: 1.8 },
  relaxed: { id: "relaxed", label: "Relaxed", description: "Longer holds per scene — cinematic, unhurried feel.", multiplier: 1.4 },
  gentle: { id: "gentle", label: "Gentle", description: "Slightly slower than normal — calm, polished, no rush.", multiplier: 1.15 },
  normal: { id: "normal", label: "Normal", description: "Balanced default cut speed.", multiplier: 1 },
  brisk: { id: "brisk", label: "Brisk", description: "Slightly faster than normal — lively and engaging without feeling rushed.", multiplier: 0.8 },
  fast: { id: "fast", label: "Fast", description: "Snappier cuts for high-retention short-form — separate from voice speed.", multiplier: 0.65 },
  rapid: { id: "rapid", label: "Rapid", description: "Quick-fire cuts — energetic TikTok or Shorts style.", multiplier: 0.5 },
  hyper: { id: "hyper", label: "Hyper", description: "Very rapid cuts — maximum energy, meme-style editing.", multiplier: 0.4 },
  flash: { id: "flash", label: "Flash", description: "Extreme rapid cuts — chaotic, meme-edit energy.", multiplier: 0.3 },
  strobe: { id: "strobe", label: "Strobe", description: "Almost subliminal frame flashes — maximum visual intensity.", multiplier: 0.2 },
};

export const PACING_ORDER = ["contemplative", "relaxed", "gentle", "normal", "brisk", "fast", "rapid", "hyper", "flash", "strobe"];

// Accepts a preset id, a raw numeric multiplier typed directly into the
// admin's pacing field (e.g. "0.5" or "0.5x"), or nothing (falls back to
// normal). Clamped to a sane range so a stray typo (or "0") can't produce a
// zero/negative or absurdly long transition.
export function pacingFor(idOrRaw) {
  if (!idOrRaw) return PACING_PRESETS.normal;
  const id = String(idOrRaw).trim();
  if (PACING_PRESETS[id]) return PACING_PRESETS[id];
  const numeric = parseFloat(id.replace(/x$/i, ""));
  if (Number.isFinite(numeric) && numeric > 0) {
    const multiplier = Math.min(Math.max(numeric, 0.2), 3);
    return {
      id: "custom",
      label: `Custom (×${multiplier})`,
      description: `Custom cut-speed multiplier — ${multiplier}× the normal transition length.`,
      multiplier,
    };
  }
  return PACING_PRESETS.normal;
}
