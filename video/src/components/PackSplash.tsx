// Recreates the pack's real catalog-card splash art (see packThemes.ts,
// ported from css/styles.css .game-splash.*) as a living background: slow
// Ken-Burns drift + a subtle scanline sweep. This IS the pack's actual brand
// art, not a stand-in — no stock photos, nothing to license.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";

export const PackSplash: React.FC<{ background: string; zoomTo?: number }> = ({
  background,
  zoomTo = 1.14,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [1, zoomTo], {
    easing: theme.ease.inOut,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pan = interpolate(frame, [0, durationInFrames], [0, -30], {
    easing: theme.ease.inOut,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: -40,
          background,
          backgroundSize: "cover",
          transform: `scale(${scale}) translateX(${pan}px)`,
        }}
      />
      {/* diagonal sheen sweep, like a product-shot studio light pass */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.09) 50%, transparent 60%)",
          transform: `translateX(${interpolate(frame, [0, durationInFrames], [-140, 140])}%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: "linear-gradient(180deg, rgba(15,15,30,0.1), rgba(15,15,30,0.78))",
        }}
      />
    </AbsoluteFill>
  );
};

export const StatChip: React.FC<{ label: string; accent?: string; delay?: number }> = ({
  label,
  accent = theme.colors.primary,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame - delay, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [16, 0])}px)`,
        padding: "10px 22px",
        borderRadius: 999,
        border: `1px solid ${accent}55`,
        background: "rgba(255,255,255,0.06)",
        backdropFilter: "blur(6px)",
        color: theme.colors.text,
        fontFamily: theme.fonts.body,
        fontWeight: 600,
        fontSize: 24,
        letterSpacing: "0.01em",
      }}
    >
      {label}
    </div>
  );
};
