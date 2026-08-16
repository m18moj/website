// The flagship 16:9 commercial for the storefront itself — not any one
// pack. Longer, more scenes, bigger camera moves than the social cuts.
import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { OpenScene, ShowcaseGridScene, StatsRowScene } from "../scenes/WebsiteScenes";
import { CTAScene } from "../scenes/CTAScene";
import { CaptionTrack } from "../components/Captions";
import { MasterAudio } from "../components/Audio";
import { theme } from "../theme";
import { AnimationIntensityContext } from "../animationContext";
import type { WebsitePromoProps } from "../types";

const DEFAULT_TRANSITION_FRAMES = 10;

function splitDuration(total: number, weights: number[], transitionFrames: number) {
  const s = weights.length;
  const inflated = total + (s - 1) * transitionFrames;
  const sumW = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => Math.max(Math.round((w / sumW) * inflated), transitionFrames * 3));
  const drift = inflated - raw.reduce((a, b) => a + b, 0);
  raw[raw.length - 1] += drift;
  return raw;
}

// See SocialVertical.tsx for the matching implementation + explanation —
// duplicated here to mirror pipeline/lib/timeline.mjs's snapToBeatGrid()
// exactly, per this file's existing splitDuration duplication convention.
function cutFramesFromDurations(durations: number[], transitionFrames: number) {
  const cuts: number[] = [];
  let cursor = 0;
  for (let i = 0; i < durations.length; i++) {
    if (i > 0) {
      cursor -= transitionFrames;
      cuts.push(cursor);
    }
    cursor += durations[i];
  }
  return cuts;
}

function beatMatchDurations(totalFrames: number, durations: number[], transitionFrames: number, fps: number, bpm?: number) {
  if (!bpm || !fps) return durations;
  const stepFrames = (60 / bpm) * fps;
  if (!Number.isFinite(stepFrames) || stepFrames <= 0) return durations;
  const offsetFrames = Math.min(2.2, (totalFrames / fps) * 0.14) * fps;
  const minScene = transitionFrames * 3;
  const cutFrames = cutFramesFromDurations(durations, transitionFrames);
  const boundaries = cutFrames.map((c) => c + transitionFrames);
  const snapped = boundaries.map((b) => {
    const beatIndex = Math.round((b - offsetFrames) / stepFrames);
    const candidate = Math.round(offsetFrames + beatIndex * stepFrames);
    return Math.abs(candidate - b) <= stepFrames * 0.6 ? candidate : b;
  });
  const next = [...durations];
  for (let i = 0; i < snapped.length; i++) {
    const delta = snapped[i] - boundaries[i];
    if (!delta) continue;
    if (next[i] + delta >= minScene && next[i + 1] - delta >= minScene) {
      next[i] += delta;
      next[i + 1] -= delta;
    }
  }
  return next;
}

export const WebsitePremium: React.FC<WebsitePromoProps> = ({ copy, captions, audioSrc, durationInFrames, transitionFrames, animationIntensity, beatMatch, musicBpm, fps }) => {
  const TRANSITION_FRAMES = transitionFrames ?? DEFAULT_TRANSITION_FRAMES;
  const weights = [1.0, 1.6, 1.1, 1.3]; // open, showcase, stats, cta
  const rawDurations = splitDuration(durationInFrames, weights, TRANSITION_FRAMES);
  const [openD, showcaseD, statsD, ctaD] = beatMatch ? beatMatchDurations(durationInFrames, rawDurations, TRANSITION_FRAMES, fps, musicBpm) : rawDurations;

  return (
    <AnimationIntensityContext.Provider value={animationIntensity ?? 1}>
    <AbsoluteFill style={{ background: "#0f0f1e" }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={openD}>
          <OpenScene tagline={copy.hook} heroWord={copy.heroWord} durationInFrames={openD} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })} />
        <TransitionSeries.Sequence durationInFrames={showcaseD}>
          <ShowcaseGridScene
            tiles={copy.beats.map((b) => ({ packName: b.packName, visual: b.visual, tag: b.tag }))}
            durationInFrames={showcaseD}
          />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slide({ direction: "from-left" })}
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
        />
        <TransitionSeries.Sequence durationInFrames={statsD}>
          <StatsRowScene stats={copy.stats} durationInFrames={statsD} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })} />
        <TransitionSeries.Sequence durationInFrames={ctaD}>
          <CTAScene headline={copy.cta} sub={copy.ctaSub ?? copy.subhead} accent={theme.colors.primary} />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      <CaptionTrack cues={captions} accent={theme.colors.primary} bottomSafe={0.12} fontSize={38} />
      <MasterAudio src={audioSrc} />
    </AbsoluteFill>
    </AnimationIntensityContext.Provider>
  );
};
