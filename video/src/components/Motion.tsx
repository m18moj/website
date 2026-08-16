import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";

type SpringPreset = keyof typeof theme.spring;

// Premium entrance: fade + rise + scale together. A lone opacity fade is
// forbidden — always animate 2-3 properties.
export const Entrance: React.FC<{
  delay?: number;
  preset?: SpringPreset;
  rise?: number;
  scaleFrom?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ delay = 0, preset = "smooth", rise = 40, scaleFrom = 0.94, style, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: theme.spring[preset] });
  return (
    <div
      style={{
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [rise, 0])}px) scale(${interpolate(
          p,
          [0, 1],
          [scaleFrom, 1]
        )})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// Faster exit than entrance, applied to a wrapper near the end of a scene.
// lengthFrames ~10-12 vs a ~20-frame entrance, per the exits-are-faster rule.
export const useExit = (durationInFrames: number, lengthFrames = 10) => {
  const frame = useCurrentFrame();
  const start = durationInFrames - lengthFrames - 2;
  const end = durationInFrames - 2;
  const y = interpolate(frame, [start, end], [0, -42], {
    easing: theme.ease.in,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const o = interpolate(frame, [start, end], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return { transform: `translateY(${y}px)`, opacity: o };
};

// Idle micro-motion for anything that sits on screen for more than ~2s.
export const useBreathe = (phase = 0) => {
  const frame = useCurrentFrame();
  const scale = 1 + Math.sin(frame / 22 + phase) * 0.015;
  const float = Math.sin(frame / 30 + phase) * 3;
  return { scale, float };
};

export const Stagger: React.FC<{
  items: React.ReactNode[];
  start?: number;
  gap?: number;
  preset?: SpringPreset;
  containerStyle?: React.CSSProperties;
}> = ({ items, start = 0, gap = 5, preset = "snappy", containerStyle }) => (
  <div style={containerStyle}>
    {items.map((item, i) => (
      <Entrance key={i} delay={start + i * gap} preset={preset}>
        {item}
      </Entrance>
    ))}
  </div>
);
