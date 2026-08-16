// One entry per PackTheme.mood (src/packThemes.ts) plus a "website" mood for
// the flagship promo. Drives pipeline/lib/music.mjs's procedural composer —
// no royalty-free-library hunting, no licensing risk, and every pack gets a
// score that actually matches its genre instead of one generic bed reused
// everywhere.
export const moods = {
  "playful-adventurous": {
    bpm: 100,
    root: 130.81, // C3
    chord: [130.81, 164.81, 196.0], // C major
    kick: "four-on-floor-light",
    hats: true,
    arp: true,
    energy: 0.55,
    brightness: 0.7,
  },
  "hype-energetic": {
    bpm: 128,
    root: 110, // A2
    chord: [110, 130.81, 164.81],
    kick: "four-on-floor",
    hats: "16ths",
    arp: true,
    riser: true,
    impact: true,
    energy: 0.85,
    brightness: 0.65,
  },
  "playful-bright": {
    bpm: 112,
    root: 130.81,
    chord: [130.81, 164.81, 196.0, 246.94],
    kick: "four-on-floor-light",
    hats: true,
    arp: true,
    energy: 0.6,
    brightness: 0.8,
  },
  "retro-synthwave": {
    bpm: 100,
    root: 110,
    chord: [110, 130.81, 164.81],
    kick: "half-time",
    hats: true,
    arp: "synthwave",
    energy: 0.65,
    brightness: 0.55,
  },
  "tactical-tense": {
    bpm: 90,
    root: 82.41, // E2
    chord: [82.41, 98.0, 123.47],
    kick: "sparse",
    hats: "tick",
    arp: false,
    energy: 0.42,
    brightness: 0.3,
  },
  "aggressive-hype": {
    bpm: 140,
    root: 73.42, // D2
    chord: [73.42, 87.31, 110],
    kick: "four-on-floor",
    hats: "16ths",
    arp: false,
    riser: true,
    impact: true,
    energy: 0.9,
    brightness: 0.5,
  },
  "gritty-tense": {
    bpm: 95,
    root: 98.0, // G2
    chord: [98.0, 116.54, 146.83],
    kick: "half-time",
    hats: "tick",
    arp: false,
    energy: 0.48,
    brightness: 0.35,
  },
  "aggressive-military": {
    bpm: 132,
    root: 82.41,
    chord: [82.41, 98.0, 123.47],
    kick: "four-on-floor",
    hats: "16ths",
    snare: true,
    arp: false,
    riser: true,
    impact: true,
    energy: 0.88,
    brightness: 0.45,
  },
  "epic-cinematic": {
    bpm: 76,
    root: 73.42,
    chord: [73.42, 87.31, 110, 146.83],
    kick: "sparse",
    hats: false,
    arp: false,
    swell: true,
    energy: 0.6,
    brightness: 0.5,
  },
  "clean-tech": {
    bpm: 104,
    root: 110,
    chord: [110, 130.81, 164.81],
    kick: "four-on-floor-light",
    hats: true,
    arp: "tech",
    energy: 0.5,
    brightness: 0.6,
  },
  "clean-corporate": {
    bpm: 100,
    root: 130.81,
    chord: [130.81, 164.81, 196.0],
    kick: "four-on-floor-light",
    hats: true,
    arp: "tech",
    energy: 0.42,
    brightness: 0.65,
  },
  "vibrant-social": {
    bpm: 118,
    root: 174.61, // F3
    chord: [174.61, 220.0, 261.63],
    kick: "four-on-floor",
    hats: "16ths",
    arp: true,
    energy: 0.7,
    brightness: 0.85,
  },
  website: {
    bpm: 108,
    root: 110,
    chord: [110, 130.81, 164.81, 220],
    kick: "four-on-floor-light",
    hats: true,
    arp: "tech",
    riser: true,
    impact: true,
    energy: 0.62,
    brightness: 0.6,
  },
};

export function moodFor(id) {
  return moods[id] ?? moods["clean-tech"];
}
