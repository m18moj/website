// theme.ts — single source of truth for every composition in this project.
// Never inline a hex color, easing curve, or spring config in a component —
// import it from here (or from packThemes.ts for a per-pack palette).
import { Easing } from "remotion";

export const theme = {
  colors: {
    bg: "#0f0f1e", // --bg-primary from the live site
    bgAlt: "#1a1a2e", // --bg-secondary
    bgTertiary: "#16213e",
    primary: "#00d9ff", // --accent-cyan — the site's hero color
    accent: "#a855f7", // --accent-purple
    text: "#ffffff",
    textDim: "#b0b0b0",
    success: "#10b981",
    glowCyan: "rgba(0, 217, 255, 0.45)",
    glowPurple: "rgba(168, 85, 247, 0.4)",
  },
  fonts: {
    display: "Sora", // loaded via @remotion/google-fonts, see fonts.ts
    body: "Inter",
    mono: "JetBrains Mono",
  },
  ease: {
    out: Easing.bezier(0.16, 1, 0.3, 1), // easeOutExpo — entrances
    inOut: Easing.bezier(0.83, 0, 0.17, 1), // easeInOutQuint — moves, Ken Burns
    in: Easing.bezier(0.7, 0, 0.84, 0), // exits only
  },
  spring: {
    snappy: { damping: 14, stiffness: 160, mass: 0.6 },
    smooth: { damping: 20, stiffness: 90, mass: 1 },
    bouncy: { damping: 11, stiffness: 170, mass: 0.7 },
  },
} as const;

export type Theme = typeof theme;
