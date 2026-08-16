import React from "react";
import { AbsoluteFill } from "remotion";
import { SceneStack } from "../components/Layers";
import { WordReveal, BodyText } from "../components/Text";
import { BrandLockup } from "../components/Logo";
import { StatChip } from "../components/PackSplash";
import { useBreathe } from "../components/Motion";

export const CTAScene: React.FC<{
  headline: string;
  sub?: string;
  priceLabel?: string;
  accent: string;
}> = ({ headline, sub, priceLabel, accent }) => {
  const { float } = useBreathe();
  return (
    <AbsoluteFill>
      <SceneStack accent={accent} gradeStrength={0.24} vignetteStrength={0.3}>
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
            display: "flex",
            flexDirection: "column",
            gap: 28,
            transform: `translateY(${float}px)`,
          }}
        >
          <BrandLockup scale={1.1} delay={0} />
          <div style={{ textAlign: "center" }}>
            <WordReveal
              text={headline}
              accent={accent}
              fontSize={68}
              delay={10}
              per={3}
              style={{ justifyContent: "center", textAlign: "center" }}
            />
          </div>
          {sub && <BodyText text={sub} fontSize={28} delay={26} style={{ textAlign: "center" }} />}
          {priceLabel && (
            <div style={{ marginTop: 6 }}>
              <StatChip label={priceLabel} accent={accent} delay={34} />
            </div>
          )}
        </AbsoluteFill>
      </SceneStack>
    </AbsoluteFill>
  );
};
