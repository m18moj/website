// Rough target length for the spoken narration — a soft word-count budget
// handed to the copywriter (pipeline/lib/copywriter.mjs). Actual video
// duration always follows the real synthesized voiceover, never a forced
// number (see pipeline/orchestrate.mjs) — this only steers how much Claude
// writes. "auto" (the default) passes no override at all, preserving each
// platform's own original hardcoded word budget exactly.
// wordsPerSecond approximates natural spoken pace at a platform's default
// TTS rate; orchestrate.mjs turns targetSeconds into a word-count budget.
export const LENGTH_PRESETS = {
  auto: { id: "auto", label: "Auto (platform default)", description: "Uses each platform's own proven length — no override.", targetSeconds: null },
  micro: { id: "micro", label: "Micro (~5s)", description: "Single-beat ultra-short — pure hook-to-punchline.", targetSeconds: 5 },
  blink: { id: "blink", label: "Blink (~8s)", description: "Quick hit — just enough for one beat.", targetSeconds: 8 },
  short: { id: "short", label: "Short (~12s)", description: "Fastest hook-to-CTA, lowest drop-off risk.", targetSeconds: 12 },
  compact: { id: "compact", label: "Compact (~15s)", description: "One hook plus one solid beat — punchy but complete.", targetSeconds: 15 },
  medium: { id: "medium", label: "Medium (~22s)", description: "Room for a hook plus 2-3 full beats.", targetSeconds: 22 },
  standard: { id: "standard", label: "Standard (~28s)", description: "Comfortable mid-length — the proven TikTok sweet spot.", targetSeconds: 28 },
  long: { id: "long", label: "Long (~35s)", description: "More detail per beat — best for Shorts/promo/website cuts.", targetSeconds: 35 },
  extended: { id: "extended", label: "Extended (~45s)", description: "Room for a full mini-explainer or feature deep-dive.", targetSeconds: 45 },
  deep: { id: "deep", label: "Deep (~60s)", description: "Comprehensive walkthrough — promo or landing-page video.", targetSeconds: 60 },
  marathon: { id: "marathon", label: "Marathon (~70s)", description: "Longest narration budget — maximum detail per script.", targetSeconds: 70 },
};

export const LENGTH_ORDER = ["auto", "micro", "blink", "short", "compact", "medium", "standard", "long", "extended", "deep", "marathon"];

export const WORDS_PER_SECOND = 2.3;

// Accepts a preset id, a raw number of seconds typed directly into the admin's
// length field (e.g. "18" or "18s"), or nothing (falls back to auto/no
// override). Clamped to a sane narration range.
export function lengthFor(idOrRaw) {
  if (!idOrRaw) return LENGTH_PRESETS.auto;
  const id = String(idOrRaw).trim();
  if (LENGTH_PRESETS[id]) return LENGTH_PRESETS[id];
  const numeric = parseFloat(id.replace(/s$/i, ""));
  if (Number.isFinite(numeric) && numeric > 0) {
    const targetSeconds = Math.round(Math.min(Math.max(numeric, 6), 90));
    return {
      id: "custom",
      label: `Custom (~${targetSeconds}s)`,
      description: `Custom target length: ~${targetSeconds}s of narration.`,
      targetSeconds,
    };
  }
  return LENGTH_PRESETS.auto;
}
