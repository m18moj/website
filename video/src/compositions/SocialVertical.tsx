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
import { AnimationIntensityContext } from "../animationContext";
import type { PackVideoProps } from "../types";

const DEFAULT_TRANSITION_FRAMES = 8;

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

// Beat-matched editing: mirrors pipeline/lib/timeline.mjs's snapToBeatGrid()
// exactly (same intro-offset formula, same tolerance window, same
// preserve-total-frames-by-transferring-between-neighbors approach) so the
// visual cuts land on the same frames as the whoosh/bass-hit SFX baked into
// the audio mix (see that file's header comment on the lockstep-duplication
// convention this project uses instead of plumbing a computed timeline
// through Remotion's input props).
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

export const SocialVertical: React.FC<PackVideoProps> = (props) => {
  const { packId, gameTitle, genre, priceLabel, copy, captions, audioSrc, durationInFrames, platform, transitionFrames, animationIntensity, beatMatch, musicBpm, fps } = props;
  const pack = themeForPack(packId);
  const accent = pack.accent;
  const accent2 = pack.accent2;
  const background = pack.background;

  const TRANSITION_FRAMES = transitionFrames ?? DEFAULT_TRANSITION_FRAMES;

  const beats = copy.beats.length > 0 ? copy.beats : [{ heading: copy.hook, body: "" }];
  const hasStat = !!copy.stat;

  const weights = [
    1.1, // hook
    ...beats.map(() => 3.2 / beats.length),
    ...(hasStat ? [1.4] : []),
    1.7, // cta
  ];
  const rawDurations = splitDuration(durationInFrames, weights, TRANSITION_FRAMES);
  const durations = beatMatch ? beatMatchDurations(durationInFrames, rawDurations, TRANSITION_FRAMES, fps, musicBpm) : rawDurations;
  let d = 0;
  const hookD = durations[d++];
  const beatDs = beats.map(() => durations[d++]);
  const payoffD = hasStat ? durations[d++] : 0;
  const ctaD = durations[d++];

  const contextLine = `${gameTitle} · ${GENRE_LABEL[genre] ?? genre}`;
  const fontScale = platform === "tiktok" ? 0.92 : 1;

  return (
    <AnimationIntensityContext.Provider value={animationIntensity ?? 1}>
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
    </AnimationIntensityContext.Provider>
  );
};
