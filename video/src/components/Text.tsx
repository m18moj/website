import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { fontFamilies } from "../fonts";

// Word-by-word reveal. `heroWord` (case-insensitive match) gets the accent
// color + glow — never more than one hero-colored element per frame.
export const WordReveal: React.FC<{
  text: string;
  delay?: number;
  per?: number;
  fontSize?: number;
  color?: string;
  heroWord?: string;
  accent?: string;
  weight?: number;
  style?: React.CSSProperties;
}> = ({
  text,
  delay = 0,
  per = 3,
  fontSize = 64,
  color = theme.colors.text,
  heroWord,
  accent = theme.colors.primary,
  weight = 800,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: Math.round(fontSize * 0.16),
        fontFamily: fontFamilies.display,
        fontWeight: weight,
        fontSize,
        lineHeight: 1.06,
        letterSpacing: "-0.02em",
        ...style,
      }}
    >
      {words.map((word, i) => {
        const p = spring({ frame: frame - delay - i * per, fps, config: theme.spring.snappy });
        const isHero = heroWord && word.toLowerCase().replace(/[^a-z0-9]/g, "") === heroWord.toLowerCase();
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: p,
              transform: `translateY(${interpolate(p, [0, 1], [30, 0])}px)`,
              color: isHero ? accent : color,
              textShadow: isHero ? `0 0 40px ${accent}88, 0 0 90px ${accent}44` : "none",
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

export const BodyText: React.FC<{
  text: string;
  delay?: number;
  fontSize?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ text, delay = 0, fontSize = 30, color = theme.colors.textDim, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: theme.spring.smooth });
  return (
    <p
      style={{
        fontFamily: fontFamilies.body,
        fontWeight: 500,
        fontSize,
        color,
        lineHeight: 1.4,
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [22, 0])}px)`,
        margin: 0,
        ...style,
      }}
    >
      {text}
    </p>
  );
};

// Animated numeric counter, tabular-nums so digits don't jitter the layout.
export const Counter: React.FC<{
  target: number;
  delay?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  fontSize?: number;
  color?: string;
}> = ({ target, delay = 0, prefix = "", suffix = "", decimals = 0, fontSize = 90, color = theme.colors.primary }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 30, stiffness: 60 } });
  const value = interpolate(p, [0, 1], [0, target]);
  return (
    <span
      style={{
        fontFamily: fontFamilies.display,
        fontWeight: 800,
        fontSize,
        color,
        fontVariantNumeric: "tabular-nums",
        textShadow: `0 0 50px ${color}66`,
      }}
    >
      {prefix}
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
};
