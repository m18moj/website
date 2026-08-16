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

export function socialTimeline({ totalFrames, beatCount, hasStat }) {
  const weights = [
    1.1,
    ...Array.from({ length: beatCount }, () => 3.2 / beatCount),
    ...(hasStat ? [1.4] : []),
    1.7,
  ];
  return buildTimeline(totalFrames, weights, SOCIAL_TRANSITION_FRAMES);
}

export function websiteTimeline({ totalFrames }) {
  const weights = [1.0, 1.6, 1.1, 1.3];
  return buildTimeline(totalFrames, weights, WEBSITE_TRANSITION_FRAMES);
}
