import type { CaptionCue, CaptionStyle } from "./components/Captions";
import type { PackVisualId } from "./packThemes";

export type Platform = "tiktok" | "shorts" | "promo";

export interface PackCopy {
  hook: string;
  heroWord?: string;
  beats: { heading: string; body: string }[];
  // One or more code cards, cycled across the beats that show code (every
  // even-indexed beat — see BeatScene) so a 3-beat video doesn't repeat the
  // same snippet twice.
  codeSnippets?: { title: string; lines: string[] }[];
  stat?: { label: string; value: number; suffix?: string; prefix?: string; decimals?: number };
  cta: string;
  ctaSub?: string;
}

export interface PackVideoProps {
  packId: string;
  packName: string;
  gameTitle: string;
  genre: string;
  priceLabel: string;
  scriptCount: number;
  platform: Platform;
  visual: PackVisualId;
  copy: PackCopy;
  captions: CaptionCue[];
  // See pipeline/config/captions.mjs for the preset this is resolved from.
  // Optional so old props.json files without it still render the original look.
  captionStyle?: Partial<CaptionStyle>;
  audioSrc?: string;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  // Frames per scene transition — lower is snappier. Optional so old
  // props.json files without it (or the storyboard/sampleProps) still
  // render with each composition's original default. See pipeline/config/pacing.mjs.
  transitionFrames?: number;
  // Motion amplitude/energy multiplier — see src/animationContext.ts and
  // pipeline/config/animation.mjs. Optional, defaults to 1 (moderate).
  animationIntensity?: number;
  // When true, scene-cut boundaries were snapped to musicBpm's beat grid by
  // pipeline/lib/timeline.mjs — the composition re-derives the same snap
  // locally (see splitDuration usage) so the visual cuts land exactly where
  // the audio mix's SFX cues do.
  beatMatch?: boolean;
  musicBpm?: number;
}

export interface WebsiteBeat {
  packName: string;
  visual: PackVisualId;
  tag: string;
}

export interface WebsiteCopy {
  hook: string;
  heroWord?: string;
  subhead: string;
  beats: WebsiteBeat[];
  stats: { label: string; value: number; suffix?: string; prefix?: string; decimals?: number }[];
  cta: string;
  ctaSub?: string;
}

export interface WebsitePromoProps {
  copy: WebsiteCopy;
  captions: CaptionCue[];
  captionStyle?: Partial<CaptionStyle>;
  audioSrc?: string;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  transitionFrames?: number;
  animationIntensity?: number;
  beatMatch?: boolean;
  musicBpm?: number;
}
