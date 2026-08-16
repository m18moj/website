import type { CaptionCue } from "./components/Captions";
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
  audioSrc?: string;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
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
  audioSrc?: string;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
}
