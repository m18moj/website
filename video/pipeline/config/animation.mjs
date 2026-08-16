// Animation "flashiness" — an amplitude/energy multiplier applied to every
// entrance, idle-motion, and burst primitive in src/components/Motion.tsx,
// Layers.tsx, and Spark.tsx (see src/animationContext.ts), independent of
// `pacing` (pacing.mjs only controls cut speed, not how much things move
// once they're on screen).
export const ANIMATION_PRESETS = {
  subtle: { id: "subtle", label: "Subtle", description: "Minimal movement — clean, professional, low distraction.", multiplier: 0.5 },
  moderate: { id: "moderate", label: "Moderate", description: "Balanced default motion — the standard look.", multiplier: 1 },
  flashy: { id: "flashy", label: "Flashy", description: "Bigger entrances, more bounce and drift — attention-grabbing.", multiplier: 1.6 },
  maximal: { id: "maximal", label: "Maximal", description: "Maximum energy — big, bold, hyperactive motion throughout.", multiplier: 2.2 },
};

export const ANIMATION_ORDER = ["subtle", "moderate", "flashy", "maximal"];

// Accepts a preset id, a raw numeric multiplier typed directly into the
// admin's animation field (e.g. "1.3" or "1.3x"), or nothing (falls back to
// moderate). Clamped so a stray typo can't produce a zero/negative or
// absurdly extreme multiplier.
export function animationFor(idOrRaw) {
  if (!idOrRaw) return ANIMATION_PRESETS.moderate;
  const id = String(idOrRaw).trim();
  if (ANIMATION_PRESETS[id]) return ANIMATION_PRESETS[id];
  const numeric = parseFloat(id.replace(/x$/i, ""));
  if (Number.isFinite(numeric) && numeric > 0) {
    const multiplier = Math.min(Math.max(numeric, 0.2), 3);
    return {
      id: "custom",
      label: `Custom (×${multiplier})`,
      description: `Custom animation intensity multiplier — ${multiplier}×.`,
      multiplier,
    };
  }
  return ANIMATION_PRESETS.moderate;
}
