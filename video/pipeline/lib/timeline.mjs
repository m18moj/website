// JS mirror of the scene-duration math in src/compositions/SocialVertical.tsx
// and src/compositions/WebsitePremium.tsx. Kept in exact lockstep (same
// TRANSITION_FRAMES, same weight formula) so the audio mix built here
// (pipeline/lib/mix.mjs — whoosh/bass-hit cues on scene cuts) lands on
// exactly the same frames the video actually cuts on, without plumbing a
// computed-in-JS timeline through Remotion's input props. If you change the
// weights or transition length in either composition, update the matching
// constant here too.

export const SOCIAL_TRANSITION_FRAMES = 8;
export const WEBSITE_TRANSITION_FRAMES = 10;

function splitDuration(totalFrames, weights, transitionFrames) {
  const s = weights.length;
  const inflated = totalFrames + (s - 1) * transitionFrames;
  const sumW = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => Math.max(Math.round((w / sumW) * inflated), transitionFrames * 3));
  const drift = inflated - raw.reduce((a, b) => a + b, 0);
  raw[raw.length - 1] += drift;
  return raw;
}

// Returns { durations: number[], cutFrames: number[] } — cutFrames are the
// frame numbers (in the final, overlap-adjusted timeline) where one scene's
// content hands off to the next, i.e. where a whoosh/bass-hit SFX belongs.
function buildTimeline(totalFrames, weights, transitionFrames) {
  const durations = splitDuration(totalFrames, weights, transitionFrames);
  const cutFrames = [];
  let cursor = 0;
  for (let i = 0; i < durations.length; i++) {
    if (i > 0) {
      cursor -= transitionFrames;
      cutFrames.push(cursor);
    }
    cursor += durations[i];
  }
  return { durations, cutFrames };
}

// "Beat-matched editing": nudges each scene-cut boundary onto the nearest
// beat of the music's beat grid (see pipeline/lib/music.mjs's `introEnd`/
// `FPB` math — the `Math.min(2.2, durationSeconds*0.14)` intro-offset here
// mirrors that exactly, and is duplicated again in src/compositions/
// SocialVertical.tsx + WebsitePremium.tsx per this file's existing
// lockstep-duplication convention, see header comment). Only snaps within a
// bounded tolerance window (0.6 of a beat) and never shrinks a scene below
// the existing minimum floor, so a bad snap silently no-ops instead of
// producing a broken timeline. Total frame count is always preserved exactly
// — frames are only transferred between adjacent scene durations.
function snapToBeatGrid(totalFrames, durations, cutFrames, transitionFrames, fps, bpm) {
  if (!bpm || !fps) return { durations, cutFrames };
  const stepFrames = (60 / bpm) * fps;
  if (!Number.isFinite(stepFrames) || stepFrames <= 0) return { durations, cutFrames };
  const offsetFrames = Math.min(2.2, (totalFrames / fps) * 0.14) * fps;
  const minScene = transitionFrames * 3;
  const boundaries = cutFrames.map((c) => c + transitionFrames);
  const snapped = boundaries.map((b) => {
    const beatIndex = Math.round((b - offsetFrames) / stepFrames);
    const candidate = Math.round(offsetFrames + beatIndex * stepFrames);
    return Math.abs(candidate - b) <= stepFrames * 0.6 ? candidate : b;
  });
  const newDurations = [...durations];
  for (let i = 0; i < snapped.length; i++) {
    const delta = snapped[i] - boundaries[i];
    if (!delta) continue;
    if (newDurations[i] + delta >= minScene && newDurations[i + 1] - delta >= minScene) {
      newDurations[i] += delta;
      newDurations[i + 1] -= delta;
    } else {
      snapped[i] = boundaries[i]; // revert if it would violate the minimum-scene floor
    }
  }
  return { durations: newDurations, cutFrames: snapped.map((b) => b - transitionFrames) };
}

// transitionFrames: optional override (see pipeline/config/pacing.mjs) —
// defaults to the original hardcoded constant so callers that don't pass a
// pacing preset get exactly the prior behavior. beatMatch/bpm/fps: optional
// — when beatMatch is true and a bpm+fps are given, cuts snap to the music's
// beat grid (see snapToBeatGrid above).
export function socialTimeline({ totalFrames, beatCount, hasStat, transitionFrames = SOCIAL_TRANSITION_FRAMES, beatMatch = false, bpm, fps }) {
  const weights = [
    1.1,
    ...Array.from({ length: beatCount }, () => 3.2 / beatCount),
    ...(hasStat ? [1.4] : []),
    1.7,
  ];
  const base = buildTimeline(totalFrames, weights, transitionFrames);
  return beatMatch ? snapToBeatGrid(totalFrames, base.durations, base.cutFrames, transitionFrames, fps, bpm) : base;
}

export function websiteTimeline({ totalFrames, transitionFrames = WEBSITE_TRANSITION_FRAMES, beatMatch = false, bpm, fps }) {
  const weights = [1.0, 1.6, 1.1, 1.3];
  const base = buildTimeline(totalFrames, weights, transitionFrames);
  return beatMatch ? snapToBeatGrid(totalFrames, base.durations, base.cutFrames, transitionFrames, fps, bpm) : base;
}
