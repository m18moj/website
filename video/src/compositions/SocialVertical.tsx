// Used for TikTok, YouTube Shorts, and the vertical pack-promo cut. Same
// scene skeleton (Hook -> Beats -> Payoff -> CTA); only the generated copy,
// pack theme, and total duration (driven by the real VO length) differ.
import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { themeForPack } from "../packThemes";
import { HookScene } from "../scenes/HookScene";
import { BeatScene } from "../scenes/BeatScene";
import { PayoffScene } from "../scenes/PayoffScene";
import { CTAScene } from "../scenes/CTAScene";
import { CaptionTrack } from "../components/Captions";
import { MasterAudio } from "../components/Audio";
import type { PackVideoProps } from "../types";

const TRANSITION_FRAMES = 8;

const GENRE_LABEL: Record<string, string> = {
  shooter: "Shooter",
  "battle-royale": "Battle Royale",
  "open-world": "Open World",
  sandbox: "Sandbox",
  creator: "Creator Platform",
  rpg: "RPG",
  bots: "Discord Bots",
  web: "Web Dev",
  marketing: "Social Growth",
};

function splitDuration(total: number, weights: number[], transitionFrames: number) {
  const s = weights.length;
  const inflated = total + (s - 1) * transitionFrames;
  const sumW = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => Math.max(Math.round((w / sumW) * inflated), transitionFrames * 3));
  const drift = inflated - raw.reduce((a, b) => a + b, 0);
  raw[raw.length - 1] += drift;
  return raw;
}

export const SocialVertical: React.FC<PackVideoProps> = (props) => {
  const { packId, gameTitle, genre, priceLabel, copy, captions, audioSrc, durationInFrames, platform } = props;
  const pack = themeForPack(packId);
  const accent = pack.accent;
  const accent2 = pack.accent2;
  const background = pack.background;

  const beats = copy.beats.length > 0 ? copy.beats : [{ heading: copy.hook, body: "" }];
  const hasStat = !!copy.stat;

  const weights = [
    1.1, // hook
    ...beats.map(() => 3.2 / beats.length),
    ...(hasStat ? [1.4] : []),
    1.7, // cta
  ];
  const durations = splitDuration(durationInFrames, weights, TRANSITION_FRAMES);
  let d = 0;
  const hookD = durations[d++];
  const beatDs = beats.map(() => durations[d++]);
  const payoffD = hasStat ? durations[d++] : 0;
  const ctaD = durations[d++];

  const contextLine = `${gameTitle} · ${GENRE_LABEL[genre] ?? genre}`;
  const fontScale = platform === "tiktok" ? 0.92 : 1;

  return (
    <AbsoluteFill style={{ background: "#0f0f1e" }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={hookD}>
          <HookScene
            hook={copy.hook}
            heroWord={copy.heroWord}
            context={contextLine}
            background={background}
            accent={accent}
            durationInFrames={hookD}
            fontSize={Math.round(92 * fontScale)}
          />
        </TransitionSeries.Sequence>

        {beats.map((beat, i) => (
          <React.Fragment key={i}>
            <TransitionSeries.Transition
              presentation={i % 2 === 0 ? fade() : slide({ direction: "from-right" })}
              timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
            />
            <TransitionSeries.Sequence durationInFrames={beatDs[i]}>
              <BeatScene
                heading={beat.heading}
                body={beat.body}
                index={i}
                background={background}
                accent={accent}
                accent2={accent2}
                durationInFrames={beatDs[i]}
                codeSnippets={copy.codeSnippets}
              />
            </TransitionSeries.Sequence>
          </React.Fragment>
        ))}

        {hasStat && copy.stat && (
          <>
            <TransitionSeries.Transition
              presentation={fade()}
              timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
            />
            <TransitionSeries.Sequence durationInFrames={payoffD}>
              <PayoffScene
                label={copy.stat.label}
                value={copy.stat.value}
                prefix={copy.stat.prefix}
                suffix={copy.stat.suffix}
                decimals={copy.stat.decimals}
                accent={accent}
                durationInFrames={payoffD}
              />
            </TransitionSeries.Sequence>
          </>
        )}

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
        />
        <TransitionSeries.Sequence durationInFrames={ctaD}>
          <CTAScene headline={copy.cta} sub={copy.ctaSub} priceLabel={priceLabel} accent={accent} />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      <CaptionTrack cues={captions} accent={accent} />
      <MasterAudio src={audioSrc} />
    </AbsoluteFill>
  );
};
