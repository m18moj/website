// Scenes unique to the 16:9 premium website promo — a different aspect
// ratio and a different job (sell the whole storefront, not one pack), so
// these stay separate from the 9:16 pack scenes rather than forcing one
// component to branch on format.
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { SceneStack } from "../components/Layers";
import { WordReveal, BodyText, Counter } from "../components/Text";
import { BrandLockup } from "../components/Logo";
import { Spark } from "../components/Spark";
import { useExit } from "../components/Motion";
import { packThemes, type PackVisualId } from "../packThemes";

export const OpenScene: React.FC<{ tagline: string; heroWord?: string; durationInFrames: number }> = ({
  tagline,
  heroWord,
  durationInFrames,
}) => {
  const exit = useExit(durationInFrames, 14);
  return (
    <AbsoluteFill style={exit}>
      <SceneStack gradeStrength={0.22} vignetteStrength={0.3}>
        {/* Small burst tucked behind the logo mark only — sized and offset
            so its rays never reach the tagline text below it (a full-frame
            spark crossed straight through the headline in an earlier pass). */}
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", display: "flex" }}>
          <div style={{ transform: "translateY(-150px)", opacity: 0.75 }}>
            <Spark size={260} delay={0} color={theme.colors.primary} />
          </div>
        </AbsoluteFill>
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
            display: "flex",
            flexDirection: "column",
            gap: 30,
          }}
        >
          <BrandLockup scale={1.3} delay={2} />
          <div style={{ maxWidth: 1200, textAlign: "center" }}>
            <WordReveal
              text={tagline}
              heroWord={heroWord}
              fontSize={78}
              delay={18}
              per={3}
              style={{ justifyContent: "center", textAlign: "center" }}
            />
          </div>
        </AbsoluteFill>
      </SceneStack>
    </AbsoluteFill>
  );
};

export interface ShowcaseTile {
  packName: string;
  visual: PackVisualId;
  tag: string;
}

export const ShowcaseGridScene: React.FC<{
  tiles: ShowcaseTile[];
  durationInFrames: number;
}> = ({ tiles, durationInFrames }) => {
  const exit = useExit(durationInFrames, 12);
  const shown = tiles.slice(0, 6);
  return (
    <AbsoluteFill style={exit}>
      <SceneStack gradeStrength={0.18}>
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
            display: "flex",
            flexDirection: "column",
            gap: 34,
          }}
        >
          <BodyText text="One catalog. Every game." fontSize={30} delay={0} style={{ textAlign: "center" }} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 26,
              width: 1500,
            }}
          >
            {shown.map((tile, i) => (
              <Tile key={tile.packName} tile={tile} delay={6 + i * 4} />
            ))}
          </div>
        </AbsoluteFill>
      </SceneStack>
    </AbsoluteFill>
  );
};

const Tile: React.FC<{ tile: ShowcaseTile; delay: number }> = ({ tile, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: theme.spring.smooth });
  const breathe = 1 + Math.sin((frame - delay) / 26) * 0.012;
  const t = packThemes[tile.visual];
  return (
    <div
      style={{
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [34, 0])}px) scale(${interpolate(p, [0, 1], [0.92, 1]) * breathe})`,
        height: 220,
        borderRadius: 20,
        overflow: "hidden",
        position: "relative",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 30px 60px -20px rgba(0,0,0,0.6)",
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: t.background }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(15,15,30,0.05), rgba(15,15,30,0.82))",
        }}
      />
      <div style={{ position: "absolute", left: 20, bottom: 18, right: 20 }}>
        <div
          style={{
            fontFamily: theme.fonts.display,
            fontWeight: 800,
            fontSize: 26,
            color: "#fff",
            letterSpacing: "-0.01em",
          }}
        >
          {tile.packName}
        </div>
        <div style={{ fontFamily: theme.fonts.body, fontSize: 16, color: t.accent, fontWeight: 600 }}>
          {tile.tag}
        </div>
      </div>
    </div>
  );
};

export const StatsRowScene: React.FC<{
  stats: { label: string; value: number; suffix?: string; prefix?: string; decimals?: number }[];
  durationInFrames: number;
}> = ({ stats, durationInFrames }) => {
  const exit = useExit(durationInFrames, 12);
  return (
    <AbsoluteFill style={exit}>
      <SceneStack gradeStrength={0.2}>
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
            display: "flex",
            gap: 90,
          }}
        >
          {stats.map((s, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <Counter
                target={s.value}
                prefix={s.prefix}
                suffix={s.suffix}
                decimals={s.decimals}
                fontSize={104}
                color={i === 1 ? theme.colors.accent : theme.colors.primary}
                delay={6 + i * 6}
              />
              <BodyText text={s.label} fontSize={26} delay={20 + i * 6} style={{ textAlign: "center" }} />
            </div>
          ))}
        </AbsoluteFill>
      </SceneStack>
    </AbsoluteFill>
  );
};
