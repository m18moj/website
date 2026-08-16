// Per-pack visual identity, ported 1:1 from the live site's CSS splash art
// (css/styles.css, .game-splash.<id>) so every promo video is instantly
// on-brand with its catalog page — same gradients, same accent logic, no
// stock photos or external assets, zero licensing risk.
//
// `mood` drives the procedural music generator (pipeline/lib/music.mjs) —
// keep the id list in sync with pipeline/config/moods.mjs.

export type PackVisualId =
  | "arcane"
  | "neon"
  | "ruin"
  | "gta"
  | "valorant"
  | "apex"
  | "pubg"
  | "cod"
  | "skyrim"
  | "bots"
  | "webdev"
  | "smm"
  | "custom";

export interface PackTheme {
  background: string;
  accent: string;
  accent2: string;
  mood:
    | "playful-adventurous"
    | "hype-energetic"
    | "playful-bright"
    | "retro-synthwave"
    | "tactical-tense"
    | "aggressive-hype"
    | "gritty-tense"
    | "aggressive-military"
    | "epic-cinematic"
    | "clean-tech"
    | "clean-corporate"
    | "vibrant-social";
}

export const packThemes: Record<PackVisualId, PackTheme> = {
  arcane: {
    background:
      "repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0 22px, transparent 22px 44px), " +
      "repeating-linear-gradient(90deg, rgba(0,0,0,0.12) 0 22px, transparent 22px 44px), " +
      "linear-gradient(160deg, #6fa83f 0%, #3f6b2b 45%, #6b4a2b 100%)",
    accent: "#8fd15c",
    accent2: "#e0653c",
    mood: "playful-adventurous",
  },
  neon: {
    background:
      "radial-gradient(circle at 28% 24%, rgba(0,217,255,0.4), transparent 55%), " +
      "radial-gradient(circle at 76% 72%, rgba(168,85,247,0.45), transparent 55%), " +
      "linear-gradient(135deg, #1b1035 0%, #2c1a4d 60%, #1a0f2e 100%)",
    accent: "#00d9ff",
    accent2: "#a855f7",
    mood: "hype-energetic",
  },
  ruin: {
    background:
      "linear-gradient(135deg, #e74c3c 0 25%, #3498db 25% 50%, #2ecc71 50% 75%, #f1c40f 75% 100%)",
    accent: "#f1c40f",
    accent2: "#2ecc71",
    mood: "playful-bright",
  },
  gta: {
    background: "linear-gradient(180deg, #2b1055 0%, #7c2f6e 40%, #e0653c 75%, #f7b733 100%)",
    accent: "#f7b733",
    accent2: "#e0653c",
    mood: "retro-synthwave",
  },
  valorant: {
    background:
      "linear-gradient(135deg, transparent 47%, rgba(255,70,85,0.55) 49%, rgba(255,70,85,0.55) 51%, transparent 53%), " +
      "linear-gradient(160deg, #1b1b24 0%, #2a0f14 60%, #150a0c 100%)",
    accent: "#ff4655",
    accent2: "#ffffff",
    mood: "tactical-tense",
  },
  apex: {
    background:
      "radial-gradient(circle at 72% 28%, rgba(255,140,66,0.5), transparent 50%), " +
      "linear-gradient(145deg, #3a1220 0%, #802d1d 55%, #d2691e 100%)",
    accent: "#ff8c42",
    accent2: "#d2691e",
    mood: "aggressive-hype",
  },
  pubg: {
    background:
      "repeating-linear-gradient(45deg, rgba(0,0,0,0.1) 0 10px, transparent 10px 20px), " +
      "linear-gradient(160deg, #4b5320 0%, #6b6b3a 50%, #8a8a4a 100%)",
    accent: "#c9c968",
    accent2: "#e8e2b0",
    mood: "gritty-tense",
  },
  cod: {
    background:
      "linear-gradient(100deg, transparent 59%, rgba(220,38,38,0.55) 61%, rgba(220,38,38,0.55) 63%, transparent 65%), " +
      "linear-gradient(160deg, #1a1a1d 0%, #2e2e33 55%, #101012 100%)",
    accent: "#dc2626",
    accent2: "#e5e5e5",
    mood: "aggressive-military",
  },
  skyrim: {
    background: "linear-gradient(180deg, #0f2942 0%, #23577e 45%, #6fa8c9 80%, #cfe7f2 100%)",
    accent: "#cfe7f2",
    accent2: "#6fa8c9",
    mood: "epic-cinematic",
  },
  bots: {
    background:
      "radial-gradient(circle at 30% 25%, rgba(88,101,242,0.55), transparent 55%), " +
      "linear-gradient(150deg, #1a1c2e 0%, #232752 55%, #12131f 100%)",
    accent: "#5865f2",
    accent2: "#00d9ff",
    mood: "clean-tech",
  },
  webdev: {
    background:
      "radial-gradient(circle at 72% 30%, rgba(0,217,255,0.4), transparent 55%), " +
      "linear-gradient(150deg, #0d2230 0%, #124054 55%, #0a1620 100%)",
    accent: "#00d9ff",
    accent2: "#a855f7",
    mood: "clean-corporate",
  },
  smm: {
    background:
      "radial-gradient(circle at 28% 28%, rgba(236,72,153,0.45), transparent 55%), " +
      "radial-gradient(circle at 78% 72%, rgba(251,146,60,0.4), transparent 55%), " +
      "linear-gradient(150deg, #2b1220 0%, #401a2e 55%, #1a0e17 100%)",
    accent: "#ec4899",
    accent2: "#fb923c",
    mood: "vibrant-social",
  },
  custom: {
    background:
      "radial-gradient(circle at 30% 30%, rgba(0,217,255,0.35), transparent 55%), " +
      "radial-gradient(circle at 75% 70%, rgba(168,85,247,0.4), transparent 55%), " +
      "linear-gradient(150deg, #171730 0%, #232345 55%, #14131f 100%)",
    accent: "#00d9ff",
    accent2: "#a855f7",
    mood: "clean-tech",
  },
};

// packId (server/models/catalog "id" column) -> splash id, mirrors the
// `splash` column seeded in server/seedCatalog.js. Kept as a static map
// (rather than importing server code) so this project has zero coupling to
// the store app's runtime.
export const packIdToVisual: Record<string, PackVisualId> = {
  apex: "apex",
  "call-of-duty": "cod",
  fortnite: "neon",
  "gta-v": "gta",
  minecraft: "arcane",
  pubg: "pubg",
  roblox: "ruin",
  skyrim: "skyrim",
  valorant: "valorant",
  "discord-bots": "bots",
  websites: "webdev",
  "smm-services": "smm",
};

export function themeForPack(packId: string): PackTheme {
  const visual = packIdToVisual[packId] ?? "custom";
  return packThemes[visual];
}
