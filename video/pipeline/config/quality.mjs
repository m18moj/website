// Effort/quality tiers for the whole pipeline — one knob that trades render
// time and Claude spend for output polish. Lower tiers exist for burning
// through many test/evergreen renders cheaply; higher tiers are for the
// handful of hero renders (new-pack launches, website promo) worth the extra
// wait and tokens. crf is x264's quality scale (lower = better/bigger, per
// pipeline/lib/render.mjs's ffmpeg invocation); claudeModel only changes ad
// copy generation (pipeline/lib/copywriter.mjs) — TTS/music are already free
// and roughly constant-cost regardless of tier.
export const QUALITY_PRESETS = {
  draft: {
    id: "draft",
    label: "Draft",
    description: "Cheapest & fastest — Haiku copy, higher-compression render. Good for bulk/test runs.",
    claudeModel: "claude-haiku-4-5",
    crf: 30,
  },
  standard: {
    id: "standard",
    label: "Standard",
    description: "Balanced default — Sonnet copy, solid render quality.",
    claudeModel: "claude-sonnet-5",
    crf: 23,
  },
  high: {
    id: "high",
    label: "High",
    description: "Sonnet copy, near-visually-lossless render. Good default for real posts.",
    claudeModel: "claude-sonnet-5",
    crf: 17,
  },
  ultra: {
    id: "ultra",
    label: "Ultra",
    description: "Slowest & most expensive — Opus copy, highest-quality render. For hero content.",
    claudeModel: "claude-opus-5",
    crf: 12,
  },
};

export const QUALITY_ORDER = ["draft", "standard", "high", "ultra"];

export function qualityFor(id) {
  return QUALITY_PRESETS[id] || QUALITY_PRESETS.standard;
}
