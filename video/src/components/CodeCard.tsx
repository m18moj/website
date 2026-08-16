// Stylized terminal/code-preview card — mirrors the site's real "Preview
// code" feature on the catalog page, so the promo shows the actual product
// (real script snippets) rather than a generic stock screenshot.
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { fontFamilies } from "../fonts";

const KEYWORDS = new Set([
  "function", "const", "let", "var", "if", "else", "return", "public", "private",
  "class", "void", "new", "for", "while", "import", "export", "async", "await",
  "true", "false", "null", "this", "def", "local", "end", "then", "static",
]);

const tokenColor = (token: string): string => {
  if (KEYWORDS.has(token.trim())) return "#a855f7";
  if (/^["'`]/.test(token.trim())) return "#8fd15c";
  if (/^\/\//.test(token.trim()) || /^#/.test(token.trim())) return "#6b7280";
  if (/^\d+$/.test(token.trim())) return "#00d9ff";
  return "#e5e7eb";
};

export const CodeCard: React.FC<{
  title: string;
  lines: string[];
  delay?: number;
  width?: number;
  accent?: string;
}> = ({ title, lines, delay = 0, width = 620, accent = theme.colors.primary }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: theme.spring.smooth });

  return (
    <div
      style={{
        width,
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [50, 0])}px) scale(${interpolate(
          p,
          [0, 1],
          [0.95, 1]
        )})`,
        borderRadius: 20,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: `0 40px 90px -20px rgba(0,0,0,0.65), 0 0 60px -20px ${accent}55`,
        background: "rgba(15,15,26,0.92)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 18px",
          background: "rgba(255,255,255,0.04)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <Dot color="#ef4444" />
        <Dot color="#f59e0b" />
        <Dot color="#10b981" />
        <span
          style={{
            marginLeft: 10,
            fontFamily: fontFamilies.mono,
            fontSize: 16,
            color: theme.colors.textDim,
          }}
        >
          {title}
        </span>
      </div>
      <div style={{ padding: "20px 22px", fontFamily: fontFamilies.mono, fontSize: 19, lineHeight: 1.65 }}>
        {lines.map((line, i) => {
          const lineP = spring({ frame: frame - delay - 10 - i * 4, fps, config: theme.spring.snappy });
          return (
            <div
              key={i}
              style={{
                opacity: lineP,
                transform: `translateX(${interpolate(lineP, [0, 1], [-14, 0])}px)`,
                whiteSpace: "pre",
                display: "flex",
              }}
            >
              <span style={{ color: "#4b5563", width: 28, flexShrink: 0, userSelect: "none" }}>
                {i + 1}
              </span>
              <span>
                {line.split(/(\s+|[(){};,.])/).map((tok, j) => (
                  <span key={j} style={{ color: tokenColor(tok) }}>
                    {tok}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <span style={{ width: 12, height: 12, borderRadius: "50%", background: color, display: "inline-block" }} />
);
