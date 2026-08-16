import React from "react";
import { AbsoluteFill } from "remotion";
import { SceneStack } from "../components/Layers";
import { PackSplash, StatChip } from "../components/PackSplash";
import { WordReveal } from "../components/Text";
import { useExit, useBreathe } from "../components/Motion";

export const HookScene: React.FC<{
  hook: string;
  heroWord?: string;
  context: string;
  background: string;
  accent: string;
  durationInFrames: number;
  fontSize?: number;
}> = ({ hook, heroWord, context, background, accent, durationInFrames, fontSize = 92 }) => {
  const exit = useExit(durationInFrames);
  const { float } = useBreathe();
  return (
    <AbsoluteFill style={exit}>
      <SceneStack accent={accent} gradeStrength={0.22}>
        <PackSplash background={background} />
        {/* Content sits well above the caption safe zone (bottom ~20% is
            reserved for CaptionTrack — see Captions.tsx bottomSafe) so the
            headline and the word-synced captions never collide. A slow
            breathe keeps the headline from going perfectly static once its
            entrance spring settles — see components/Motion.tsx useBreathe. */}
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            padding: "0 64px 480px",
            display: "flex",
            flexDirection: "column",
            gap: 22,
            transform: `translateY(${float}px)`,
          }}
        >
          <div style={{ display: "flex", gap: 12 }}>
            <StatChip label={context} accent={accent} delay={0} />
          </div>
          <WordReveal
            text={hook}
            heroWord={heroWord}
            accent={accent}
            fontSize={fontSize}
            delay={4}
            per={3}
          />
        </AbsoluteFill>
      </SceneStack>
    </AbsoluteFill>
  );
};
