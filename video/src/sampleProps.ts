// Fallback props so `npm run studio` renders something sensible before the
// pipeline has generated any real job. Real jobs pass their own props via
// --props (see pipeline/lib/render.mjs).
import type { PackVideoProps, WebsitePromoProps } from "./types";

const FPS = 30;

export const sampleSocialProps: PackVideoProps = {
  packId: "minecraft",
  packName: "Minecraft Pack",
  gameTitle: "Minecraft",
  genre: "sandbox",
  priceLabel: "From £2.00",
  scriptCount: 26,
  platform: "tiktok",
  visual: "arcane",
  copy: {
    hook: "Stop building your world logic from scratch.",
    heroWord: "scratch.",
    beats: [
      {
        heading: "26 ready-made scripts.",
        body: "Mining, crafting, survival loops, and resource systems — drop in and go.",
      },
      {
        heading: "Real code. Real preview.",
        body: "Every script ships with a live code preview before you buy a single one.",
      },
    ],
    codeSnippets: [
      {
        title: "OreVeinGenerator.java",
        lines: [
          "public void generateVein(Location origin) {",
          "  int size = random.nextInt(6) + 3;",
          "  spreadOre(origin, size, Material.DIAMOND_ORE);",
          "}",
        ],
      },
    ],
    stat: { label: "scripts in this pack", value: 26, suffix: "", decimals: 0 },
    cta: "Get the Minecraft Pack.",
    ctaSub: "Instant download after checkout.",
  },
  captions: [
    { text: "Stop", startMs: 0, endMs: 220 },
    { text: "building", startMs: 220, endMs: 520 },
    { text: "your", startMs: 520, endMs: 680 },
    { text: "world", startMs: 680, endMs: 940 },
    { text: "logic", startMs: 940, endMs: 1200 },
    { text: "from", startMs: 1200, endMs: 1380 },
    { text: "scratch.", startMs: 1380, endMs: 1800 },
  ],
  audioSrc: undefined,
  fps: FPS,
  width: 1080,
  height: 1920,
  durationInFrames: FPS * 24,
};

export const sampleWebsiteProps: WebsitePromoProps = {
  copy: {
    hook: "Nine games. Three services. One catalog built for builders.",
    heroWord: "builders.",
    subhead: "Real code, instant delivery, secure checkout.",
    beats: [
      { packName: "Minecraft Pack", visual: "arcane", tag: "Sandbox" },
      { packName: "Fortnite Pack", visual: "neon", tag: "Battle Royale" },
      { packName: "GTA V Pack", visual: "gta", tag: "Open World" },
      { packName: "Valorant Pack", visual: "valorant", tag: "Shooter" },
      { packName: "Skyrim Pack", visual: "skyrim", tag: "RPG" },
      { packName: "Discord Bots", visual: "bots", tag: "Custom Bots" },
    ],
    stats: [
      { label: "script packs", value: 12, decimals: 0 },
      { label: "ready-made scripts", value: 250, suffix: "+", decimals: 0 },
      { label: "instant delivery", value: 100, suffix: "%", decimals: 0 },
    ],
    cta: "Explore the full catalog.",
    ctaSub: "scripforge.net",
  },
  captions: [],
  audioSrc: undefined,
  fps: FPS,
  width: 1920,
  height: 1080,
  durationInFrames: FPS * 40,
};
