import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";

// Radial rays behind the logo mark / hero CTA moment — staggered burst.
export const Spark: React.FC<{ size?: number; delay?: number; color?: string; rays?: number }> = ({
  size = 260,
  delay = 0,
  color = theme.colors.primary,
  rays = 12,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const container = spring({ frame: frame - delay, fps, config: theme.spring.bouncy });
  const rot = interpolate1(container, -120, 0);

  return (
    <div
      style={{
        // relative (not absolute): this needs to stay in normal flex/flow
        // layout so callers can position it via a parent flex container or
        // simple margins — it only needs to be a containing block for the
        // absolutely-positioned rays below.
        position: "relative",
        width: size,
        height: size,
        transform: `scale(${container}) rotate(${rot}deg)`,
        filter: `drop-shadow(0 0 ${size * 0.25}px ${color}77)`,
      }}
    >
      {Array.from({ length: rays }).map((_, i) => {
        const p = spring({ frame: frame - delay - i * 1.2, fps, config: theme.spring.snappy });
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: size * 0.07,
              height: size * 0.44 * p,
              background: color,
              borderRadius: size,
              transformOrigin: "50% 0%",
              transform: `translateX(-50%) rotate(${(360 / rays) * i}deg) translateY(${size * 0.07}px)`,
            }}
          />
        );
      })}
    </div>
  );
};

function interpolate1(p: number, from: number, to: number) {
  return from + (to - from) * p;
}
