// The site's real navbar mark (index.html .nav-logo svg: four squares,
// cyan/purple/purple/cyan) plus animated wordmark, for outro/CTA branding.
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { fontFamilies } from "../fonts";

export const LogoMark: React.FC<{ size?: number; delay?: number }> = ({ size = 64, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: theme.spring.bouncy });
  const rot = interpolate(p, [0, 1], [-70, 0]);
  const scale = interpolate(p, [0, 1], [0.5, 1]);
  const cells = [
    { x: 0, y: 0, c: theme.colors.primary },
    { x: 1, y: 0, c: theme.colors.accent },
    { x: 0, y: 1, c: theme.colors.accent },
    { x: 1, y: 1, c: theme.colors.primary },
  ];
  const gap = size * 0.14;
  const cell = size * 0.43;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{
        opacity: p,
        transform: `rotate(${rot}deg) scale(${scale})`,
        filter: `drop-shadow(0 0 ${size * 0.3}px ${theme.colors.glowCyan})`,
      }}
    >
      {cells.map((c, i) => (
        <rect
          key={i}
          x={c.x * (cell + gap)}
          y={c.y * (cell + gap)}
          width={cell}
          height={cell}
          rx={size * 0.06}
          fill={c.c}
        />
      ))}
    </svg>
  );
};

export const Wordmark: React.FC<{ fontSize?: number; delay?: number; color?: string }> = ({
  fontSize = 56,
  delay = 0,
  color = theme.colors.text,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: theme.spring.smooth });
  return (
    <span
      style={{
        opacity: p,
        transform: `translateX(${interpolate(p, [0, 1], [-16, 0])}px)`,
        fontFamily: fontFamilies.display,
        fontWeight: 800,
        fontSize,
        letterSpacing: "-0.02em",
        color,
      }}
    >
      ScripForge
    </span>
  );
};

export const BrandLockup: React.FC<{ scale?: number; delay?: number; align?: "center" | "left" }> = ({
  scale = 1,
  delay = 0,
  align = "center",
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 18 * scale,
      justifyContent: align === "center" ? "center" : "flex-start",
    }}
  >
    <LogoMark size={56 * scale} delay={delay} />
    <Wordmark fontSize={44 * scale} delay={delay + 4} />
  </div>
);
