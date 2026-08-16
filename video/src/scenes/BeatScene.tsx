import React from "react";
import { AbsoluteFill } from "remotion";
import { SceneStack } from "../components/Layers";
import { WordReveal, BodyText } from "../components/Text";
import { CodeCard } from "../components/CodeCard";
import { useExit, useBreathe } from "../components/Motion";
import { PackSplash } from "../components/PackSplash";

// Beats alternate between a "code proof" layout (even index) and a plain
// statement layout (odd index) so a >90-frame stretch never repeats the same
// visual shape — satisfies the "new visual element" pacing rule for free.
export const BeatScene: React.FC<{
  heading: string;
  body: string;
  index: number;
  background: string;
  accent: string;
  accent2: string;
  durationInFrames: number;
  codeSnippets?: { title: string; lines: string[] }[];
}> = ({ heading, body, index, background, accent, accent2, durationInFrames, codeSnippets }) => {
  const exit = useExit(durationInFrames);
  const { float } = useBreathe();
  const showCode = index % 2 === 0 && !!codeSnippets?.length;
  const codeSnippet = showCode ? codeSnippets![Math.floor(index / 2) % codeSnippets!.length] : undefined;

  return (
    <AbsoluteFill style={exit}>
      <SceneStack accent={accent} accent2={accent2} gradeStrength={0.16}>
        {!showCode && <PackSplash background={background} zoomTo={1.08} />}
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: showCode ? "row" : "column",
            alignItems: "center",
            justifyContent: showCode ? "space-between" : "center",
            gap: 40,
            // paddingBottom keeps content clear of the caption safe zone
            // (CaptionTrack reserves the bottom ~16% of the frame).
            padding: showCode ? "0 60px 220px" : "0 70px 260px",
            transform: `translateY(${float}px)`,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: showCode ? 460 : 900 }}>
            <WordReveal text={heading} accent={accent} fontSize={showCode ? 56 : 72} delay={0} per={3} />
            <BodyText text={body} fontSize={showCode ? 26 : 32} delay={10} />
          </div>
          {showCode && codeSnippet && (
            <CodeCard title={codeSnippet.title} lines={codeSnippet.lines} accent={accent} width={560} delay={14} />
          )}
        </AbsoluteFill>
      </SceneStack>
    </AbsoluteFill>
  );
};
