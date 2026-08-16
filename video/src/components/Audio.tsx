// The pipeline mixes VO + music + SFX into a single master track in the
// "voice/music" stage (pipeline/lib/mix.mjs), before Remotion ever runs.
// Compositions just play that one finished file — no audio sync logic lives
// in React, which keeps the render deterministic and avoids two systems
// (ffmpeg timing vs. Remotion <Sequence> timing) drifting apart.
import React from "react";
import { Audio, staticFile } from "remotion";

export const MasterAudio: React.FC<{ src?: string }> = ({ src }) => {
  if (!src) return null;
  return <Audio src={staticFile(src)} />;
};
