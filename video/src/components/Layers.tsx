// The five-layer stack every scene is built on: background mesh -> assets ->
// graphics/type -> color grade -> grain + vignette. Never a flat background.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { theme } from "../theme";

export const BgMesh: React.FC<{ accent?: string; accent2?: string }> = ({
  accent = theme.colors.primary,
  accent2 = theme.colors.accent,
}) => {
  const frame = useCurrentFrame();
  const d1 = Math.sin(frame / 55) * 60;
  const d2 = Math.cos(frame / 70) * 50;
  return (
    <AbsoluteFill style={{ background: theme.colors.bg }}>
      <div
        style={{
          position: "absolute",
          width: 1400,
          height: 1400,
          borderRadius: "50%",
          top: -500,
          left: -350 + d1,
          filter: "blur(90px)",
          background: `radial-gradient(circle, ${accent}33, transparent 62%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 1100,
          height: 1100,
          borderRadius: "50%",
          bottom: -450,
          right: -300 - d2,
          filter: "blur(100px)",
          background: `radial-gradient(circle, ${accent2}2b, transparent 65%)`,
        }}
      />
    </AbsoluteFill>
  );
};

export const Grade: React.FC<{ tint?: string; strength?: number }> = ({
  tint = theme.colors.primary,
  strength = 0.2,
}) => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    <AbsoluteFill
      style={{ backgroundColor: tint, mixBlendMode: "soft-light", opacity: strength }}
    />
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(180deg, rgba(0,0,0,0.14), transparent 26%, transparent 74%, rgba(0,0,0,0.28))",
      }}
    />
  </AbsoluteFill>
);

const GRAIN_SVG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";

export const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        backgroundImage: GRAIN_SVG,
        backgroundSize: "220px",
        backgroundPosition: `${(frame * 7) % 220}px ${(frame * 13) % 220}px`,
        opacity: 0.05,
        mixBlendMode: "overlay",
      }}
    />
  );
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.24 }) => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background: `radial-gradient(ellipse at center, transparent 54%, rgba(0,0,0,${strength}) 100%)`,
    }}
  />
);

// Convenience wrapper: BgMesh + children (assets/graphics) + Grade + Grain + Vignette,
// in the correct stacking order. Use this in every scene unless a scene needs
// custom layer ordering.
export const SceneStack: React.FC<{
  accent?: string;
  accent2?: string;
  gradeStrength?: number;
  vignetteStrength?: number;
  children: React.ReactNode;
}> = ({ accent, accent2, gradeStrength, vignetteStrength, children }) => (
  <AbsoluteFill>
    <BgMesh accent={accent} accent2={accent2} />
    <AbsoluteFill>{children}</AbsoluteFill>
    <Grade tint={accent} strength={gradeStrength} />
    <Grain />
    <Vignette strength={vignetteStrength} />
  </AbsoluteFill>
);
