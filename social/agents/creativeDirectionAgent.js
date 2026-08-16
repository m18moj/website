// Turns a script into the visual/creative brief the video pipeline needs —
// style, pacing, music, on-screen text treatment, asset suggestions. This is
// the last stage owned entirely by this system; its output becomes part of
// the video_jobs.input_json payload handed to the separate video-generation
// pipeline (see social/VIDEO_JOB_CONTRACT.md) — nothing here renders
// anything itself.
const { structured } = require('./llm');

// Static reference, not a live read of css/styles.css — this system never
// touches UI files, and the brand palette changes rarely enough that a
// constant here is simpler than parsing CSS at runtime.
const BRAND = {
  background: '#0f0f1e',
  accentCyan: '#00d9ff',
  accentPurple: '#a855f7',
  text: '#ffffff'
};

const SCHEMA = {
  type: 'object',
  properties: {
    visualStyle: { type: 'string', description: 'Overall look: e.g. dark UI-tech aesthetic, fast-cut gameplay-adjacent b-roll, code-editor overlays.' },
    moodKeywords: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 6 },
    musicVibe: { type: 'string', description: 'Genre/energy for the background track, e.g. "high-energy synthwave, 120+ bpm".' },
    pacing: { type: 'string', enum: ['fast_cut', 'medium', 'steady'] },
    onScreenTextStyle: { type: 'string', description: 'Font weight/animation feel for captions and callouts.' },
    thumbnailConcept: { type: 'string' },
    assetSuggestions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Concrete b-roll/asset ideas the video pipeline can source or generate (e.g. "animated code-diff of the script being applied", "in-editor preview of the pack\'s scripts list").'
    }
  },
  required: ['visualStyle', 'moodKeywords', 'musicVibe', 'pacing', 'onScreenTextStyle', 'thumbnailConcept', 'assetSuggestions']
};

const SYSTEM = `You are the Creative Direction agent for ScripForge's short-form video system. Translate a script into a concrete visual brief a video pipeline can execute mechanically — be specific, not abstract. Stay consistent with the brand: dark, tech/coding aesthetic, cyan (${BRAND.accentCyan}) and purple (${BRAND.accentPurple}) accents on a near-black background (${BRAND.background}). Output only via the submit_result tool.`;

function buildPrompt({ script, strategy, pack }) {
  return `Strategy angle: ${strategy.angle} (pillar: ${strategy.contentPillar})
${pack ? `Featured pack: ${pack.packName} (${pack.gameTitle})` : 'No specific pack featured.'}

Script hook: ${script.hookLine}
Beats:
${script.beats.map((b) => `- [${b.startSeconds}s] ${b.visual} — VO: "${b.voiceover}" / on-screen: "${b.onScreenText}"`).join('\n')}
CTA: ${script.ctaLine}

Produce the creative brief now.`;
}

async function run({ script, strategy, pack }) {
  return structured({ system: SYSTEM, prompt: buildPrompt({ script, strategy, pack }), schema: SCHEMA });
}

module.exports = { run, BRAND };
