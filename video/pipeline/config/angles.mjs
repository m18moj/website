// Creative angle / "type" a pack promo video can be framed as — steers the
// copywriter's prompt (pipeline/lib/copywriter.mjs) toward a specific style
// instead of leaving it fully open. Mirrors the contentPillar vocabulary
// social/agents/strategyAgent.js already uses for AI-planned campaigns, so
// admin-triggered renders and the automated social system describe video
// styles the same way — kept as its own small file rather than imported
// from social/ since video/pipeline/ and social/ are independent
// subsystems by design (see pipeline/lib/env.mjs).
export const ANGLE_PRESETS = {
  auto: { id: "auto", label: "Auto (let AI decide)", description: "No fixed angle — Claude picks whatever framing fits the pack best.", prompt: null },
  product_showcase: {
    id: "product_showcase",
    label: "Product showcase",
    description: "Straightforward feature walkthrough of what's in the pack.",
    prompt: "Frame this as a direct product showcase: what's in the pack, and why each script is useful.",
  },
  tutorial_snippet: {
    id: "tutorial_snippet",
    label: "Quick tutorial",
    description: "Feels like a fast how-to using one script from the pack.",
    prompt: "Frame this like a quick tutorial/how-to snippet: walk through using ONE specific script from the pack as if teaching the viewer in real time.",
  },
  before_after: {
    id: "before_after",
    label: "Before / after",
    description: "Contrasts the pain point without the pack against the result with it.",
    prompt: "Frame this as a before/after: open on the pain or limitation of not having this pack, then show the transformation once you have it.",
  },
  social_proof: {
    id: "social_proof",
    label: "Social proof",
    description: 'Leans on scale/credibility — "this is what devs are already using".',
    prompt: "Frame this around social proof and credibility — emphasize how many ready-made scripts/devs rely on packs like this, without inventing specific numbers you weren't given.",
  },
  behind_the_scenes: {
    id: "behind_the_scenes",
    label: "Behind the scenes",
    description: "A peek at the code/craftsmanship behind the pack.",
    prompt: "Frame this as a behind-the-scenes look at the actual code and craftsmanship in the pack — geek out on the implementation a little.",
  },
  competitive_comparison: {
    id: "competitive_comparison",
    label: "Competitive comparison",
    description: "Positions the pack against alternatives — why this one stands out.",
    prompt: "Frame this as a competitive comparison: what makes this pack stand out compared to alternatives or rolling your own. Highlight concrete differentiators without being negative about other options.",
  },
  meme_style: {
    id: "meme_style",
    label: "Meme / trend-jack",
    description: "Leverages a current meme format or trending sound for reach.",
    prompt: "Frame this as a meme-style or trend-jacking video: lean into a current meme format, trending sound, or viral template. Keep it casual, funny, and instantly relatable to a dev audience.",
  },
  feature_spotlight: {
    id: "feature_spotlight",
    label: "Feature spotlight",
    description: "Zooms in on one specific capability or script — the hero moment.",
    prompt: "Frame this as a spotlight on ONE specific feature, script, or capability from the pack. Build the entire video around that single hero moment — show it in action and make it the star.",
  },
  problem_solution: {
    id: "problem_solution",
    label: "Problem / solution",
    description: "Opens on the frustration, closes with the pack as the fix.",
    prompt: "Frame this as a problem/solution narrative: open on a specific frustration or bottleneck developers face, then show how this pack (or one script from it) solves it cleanly.",
  },
};

export const ANGLE_ORDER = ["auto", "product_showcase", "tutorial_snippet", "before_after", "social_proof", "behind_the_scenes", "competitive_comparison", "meme_style", "feature_spotlight", "problem_solution"];

// Accepts a preset id, or any other free-typed text — treated as a custom
// creative direction and injected into the copywriter prompt verbatim, so
// the admin isn't limited to the fixed list above.
export function angleFor(idOrRaw) {
  if (!idOrRaw) return ANGLE_PRESETS.auto;
  const id = String(idOrRaw).trim();
  if (ANGLE_PRESETS[id]) return ANGLE_PRESETS[id];
  return {
    id: "custom",
    label: "Custom",
    description: id,
    prompt: `Frame this video with the following creative direction: ${id}`,
  };
}
