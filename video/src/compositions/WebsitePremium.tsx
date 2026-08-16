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
import type { WebsitePromoProps } from "../types";

const TRANSITION_FRAMES = 10;

function splitDuration(total: number, weights: number[], transitionFrames: number) {
  const s = weights.length;
  const inflated = total + (s - 1) * transitionFrames;
  const sumW = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => Math.max(Math.round((w / sumW) * inflated), transitionFrames * 3));
  const drift = inflated - raw.reduce((a, b) => a + b, 0);
  raw[raw.length - 1] += drift;
  return raw;
}

export const WebsitePremium: React.FC<WebsitePromoProps> = ({ copy, captions, audioSrc, durationInFrames }) => {
  const weights = [1.0, 1.6, 1.1, 1.3]; // open, showcase, stats, cta
  const [openD, showcaseD, statsD, ctaD] = splitDuration(durationInFrames, weights, TRANSITION_FRAMES);

  return (
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
  );
};
