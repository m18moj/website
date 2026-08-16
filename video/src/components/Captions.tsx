// Word-synced captions, TikTok/Shorts style: 2-4 words per page, active word
// in the pack's accent color, positioned inside the 9:16 safe zone (platform
// UI covers the top and bottom ~12%). Cues come from pipeline/lib/captions.mjs,
// which derives them from real TTS word timestamps (never guessed).
import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import { theme } from "../theme";
import { fontFamilies } from "../fonts";

export interface CaptionCue {
  text: string;
  startMs: number;
  endMs: number;
}

const msToFrame = (ms: number, fps: number) => Math.round((ms / 1000) * fps);

export const CaptionTrack: React.FC<{
  cues: CaptionCue[];
  accent?: string;
  bottomSafe?: number; // fraction of height reserved as bottom safe zone
  fontSize?: number;
}> = ({ cues, accent = theme.colors.primary, bottomSafe = 0.16, fontSize = 46 }) => {
  const { fps, height, durationInFrames } = useVideoConfig();
  if (!cues || cues.length === 0) return null;

  const captions: Caption[] = cues.map((c) => ({
    text: c.text,
    startMs: c.startMs,
    endMs: c.endMs,
    timestampMs: (c.startMs + c.endMs) / 2,
    confidence: null,
  }));

  const { pages: rawPages } = createTikTokStyleCaptions({
    captions,
    combineTokensWithinMilliseconds: 350,
  });
  // Hard cap regardless of timing: real speech (SAPI in particular) often
  // keeps inter-word gaps small for many words in a row, so the timing
  // threshold above can still combine a whole sentence into one page — a
  // wall of static text was the actual symptom the first time this shipped.
  // Re-chunk anything longer than 4 tokens into consecutive sub-pages.
  const MAX_TOKENS_PER_PAGE = 4;
  const pages = rawPages.flatMap((page) => {
    if (page.tokens.length <= MAX_TOKENS_PER_PAGE) return [page];
    const chunks = [];
    for (let i = 0; i < page.tokens.length; i += MAX_TOKENS_PER_PAGE) {
      const tokens = page.tokens.slice(i, i + MAX_TOKENS_PER_PAGE);
      const startMs = tokens[0].fromMs;
      const endMs = tokens[tokens.length - 1].toMs;
      chunks.push({ text: tokens.map((t) => t.text).join(""), startMs, durationMs: endMs - startMs, tokens });
    }
    return chunks;
  });

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {pages.map((page, i) => {
        const from = msToFrame(page.startMs, fps);
        const durationMs = page.durationMs > 0 ? page.durationMs : 600;
        const duration = Math.max(1, Math.min(msToFrame(durationMs, fps), durationInFrames - from));
        if (from >= durationInFrames || duration <= 0) return null;
        return (
          <Sequence key={i} from={from} durationInFrames={duration} layout="none">
            <CaptionPage page={page} accent={accent} bottomSafe={bottomSafe} fontSize={fontSize} height={height} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const CaptionPage: React.FC<{
  page: ReturnType<typeof createTikTokStyleCaptions>["pages"][number];
  accent: string;
  bottomSafe: number;
  fontSize: number;
  height: number;
}> = ({ page, accent, bottomSafe, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = page.startMs + (frame / fps) * 1000;
  const pop = Math.min(1, (frame / fps) * 1000 < 90 ? (frame / fps) * 1000 / 90 : 1);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: `${bottomSafe * 100}%`,
        display: "flex",
        justifyContent: "center",
        padding: "0 64px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0.28em",
          fontFamily: fontFamilies.display,
          fontWeight: 800,
          fontSize,
          letterSpacing: "-0.01em",
          textAlign: "center",
          transform: `scale(${0.9 + pop * 0.1})`,
        }}
      >
        {page.tokens.map((token, i) => {
          const active = nowMs >= token.fromMs && nowMs <= token.toMs;
          return (
            <span
              key={i}
              style={{
                color: active ? accent : "#ffffff",
                WebkitTextStroke: "8px rgba(0,0,0,0.55)",
                paintOrder: "stroke fill",
                textShadow: active
                  ? `0 4px 24px rgba(0,0,0,0.65), 0 0 30px ${accent}aa`
                  : "0 4px 18px rgba(0,0,0,0.65)",
                transform: active ? "translateY(-4px) scale(1.06)" : "none",
                transition: "none",
                display: "inline-block",
              }}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};
