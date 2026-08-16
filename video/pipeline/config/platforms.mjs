// Per-platform render specs. narrationTargetSec is a soft hint passed to
// the copywriter (short sentences read at a natural pace land close to it);
// actual video length always follows the real synthesized VO duration, it's
// never forced to a fixed number — see pipeline/orchestrate.mjs.
export const platforms = {
  tiktok: {
    composition: "SocialVertical",
    width: 1080,
    height: 1920,
    fps: 30,
    narrationTargetSec: [11, 19],
    leadInMs: 180,
    tailMs: 1250,
    ctaStyle: "Follow for more",
    ttsRate: 2,
  },
  shorts: {
    composition: "SocialVertical",
    width: 1080,
    height: 1920,
    fps: 30,
    narrationTargetSec: [22, 40],
    leadInMs: 220,
    tailMs: 1500,
    ctaStyle: "Subscribe for more",
    ttsRate: 1,
  },
  promo: {
    composition: "SocialVertical",
    width: 1080,
    height: 1920,
    fps: 30,
    narrationTargetSec: [16, 26],
    leadInMs: 200,
    tailMs: 1400,
    ctaStyle: "Shop now",
    ttsRate: 1,
  },
  website: {
    composition: "WebsitePremium",
    width: 1920,
    height: 1080,
    fps: 30,
    narrationTargetSec: [26, 42],
    leadInMs: 260,
    tailMs: 1800,
    ctaStyle: "Explore the catalog",
    ttsRate: 0,
  },
};

export function platformFor(id) {
  const p = platforms[id];
  if (!p) throw new Error(`Unknown platform "${id}". Known: ${Object.keys(platforms).join(", ")}`);
  return p;
}
