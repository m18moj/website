// Caption visual style — word-synced caption look, independent of `animation`
// (which controls scene/element motion, not caption typography). Passed
// through to src/components/Captions.tsx via the `captionStyle` prop. Same
// preset-object shape as pacing.mjs/animation.mjs/angles.mjs so the admin UI
// (video-admin) can render it with the same shared dropdown+description
// pattern.
export const CAPTION_STYLE_PRESETS = {
  boldPop: {
    id: "boldPop",
    label: "Bold Pop",
    description: "Punchy white text, thin outline, active word pops in the accent color. The default — clean, readable, not cartoonish.",
    strokeWidth: 3,
    strokeOpacity: 0.45,
    shadow: "soft",
    activeMode: "color",
    fontWeight: 800,
    letterSpacing: "-0.01em",
    uppercase: false,
  },
  cleanMinimal: {
    id: "cleanMinimal",
    label: "Clean Minimal",
    description: "No outline, just a soft drop shadow — the most premium/least \"meme caption\" look. Active word gets a subtle accent underline.",
    strokeWidth: 0,
    strokeOpacity: 0,
    shadow: "soft",
    activeMode: "underline",
    fontWeight: 700,
    letterSpacing: "0",
    uppercase: false,
  },
  creatorBubble: {
    id: "creatorBubble",
    label: "Creator Bubble",
    description: "Active word gets a rounded accent-color pill behind it — the AI-captions look (Opus Clip / CapCut style).",
    strokeWidth: 0,
    strokeOpacity: 0,
    shadow: "soft",
    activeMode: "pill",
    fontWeight: 800,
    letterSpacing: "-0.01em",
    uppercase: false,
  },
  neonGlow: {
    id: "neonGlow",
    label: "Neon Glow",
    description: "Active word gets a real colored glow instead of a flat highlight — high-energy, good for hype/gaming content.",
    strokeWidth: 2,
    strokeOpacity: 0.35,
    shadow: "glow",
    activeMode: "color",
    fontWeight: 800,
    letterSpacing: "-0.01em",
    uppercase: false,
  },
  editorialCaps: {
    id: "editorialCaps",
    label: "Editorial Caps",
    description: "Uppercase, tight tracking, no outline — a serious/documentary tone instead of a social-native one.",
    strokeWidth: 0,
    strokeOpacity: 0,
    shadow: "soft",
    activeMode: "underline",
    fontWeight: 700,
    letterSpacing: "0.01em",
    uppercase: true,
  },
};

export const CAPTION_STYLE_ORDER = ["boldPop", "cleanMinimal", "creatorBubble", "neonGlow", "editorialCaps"];

export function captionStyleFor(id) {
  if (!id) return CAPTION_STYLE_PRESETS.boldPop;
  return CAPTION_STYLE_PRESETS[String(id).trim()] || CAPTION_STYLE_PRESETS.boldPop;
}
