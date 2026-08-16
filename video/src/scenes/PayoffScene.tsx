import React from "react";
import { AbsoluteFill } from "remotion";
import { SceneStack } from "../components/Layers";
import { Counter, BodyText } from "../components/Text";
import { Spark } from "../components/Spark";
import { useExit } from "../components/Motion";

// The "result" beat — biggest single animation in the piece, per the
// scene-architecture rule (payoff = biggest moment before the CTA).
export const PayoffScene: React.FC<{
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  accent: string;
  durationInFrames: number;
}> = ({ label, value, prefix, suffix, decimals, accent, durationInFrames }) => {
  const exit = useExit(durationInFrames);
  return (
    <AbsoluteFill style={exit}>
      <SceneStack accent={accent} gradeStrength={0.2}>
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
            display: "flex",
            flexDirection: "column",
            padding: "0 64px",
          }}
        >
          {/* Spark sits ABOVE the number in normal flow, dimmed, as a
              flourish — never stacked on top of it (that made the counter
              unreadable in earlier renders). */}
          <div style={{ opacity: 0.55, marginBottom: -36 }}>
            <Spark size={340} delay={0} color={accent} rays={10} />
          </div>
          <Counter
            target={value}
            prefix={prefix}
            suffix={suffix}
            decimals={decimals}
            fontSize={150}
            color={accent}
            delay={8}
          />
          <BodyText text={label} fontSize={34} delay={22} style={{ textAlign: "center", maxWidth: 760 }} />
        </AbsoluteFill>
      </SceneStack>
    </AbsoluteFill>
  );
};
