// Turns a strategy into an actual short-form video script: a beat-by-beat
// breakdown with voiceover and on-screen text, ready to hand to the creative
// brief and then the video pipeline. This is the last stage that's pure
// writing — creativeDirectionAgent turns it into a visual spec next.
const { structured } = require('./llm');

const SCHEMA = {
  type: 'object',
  properties: {
    hookLine: { type: 'string', description: 'Spoken/on-screen line for the first 1-2 seconds.' },
    beats: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          startSeconds: { type: 'number' },
          visual: { type: 'string', description: 'What should be on screen — code/script preview, gameplay-style footage, UI callout, etc.' },
          voiceover: { type: 'string' },
          onScreenText: { type: 'string' }
        },
        required: ['startSeconds', 'visual', 'voiceover', 'onScreenText']
      },
      minItems: 3,
      maxItems: 8
    },
    ctaLine: { type: 'string', description: 'Final spoken/on-screen call to action.' },
    targetDurationSeconds: { type: 'number', minimum: 15, maximum: 60 }
  },
  required: ['hookLine', 'beats', 'ctaLine', 'targetDurationSeconds']
};

const SYSTEM = `You are the Script agent for ScripForge's short-form video system. Write tight, punchy scripts for TikTok/YouTube Shorts (15-60s) that open with a strong hook, stay concrete (reference real script/product names, never vague hype), and end with a clear call to action. Never use "cheat"/"hack" framing — these are developer/customization scripts. Output only via the submit_result tool.`;

function buildPrompt({ strategy, pack, platform }) {
  const packSummary = pack
    ? `Pack: "${pack.packName}" (${pack.gameTitle}). Scripts available: ${pack.scripts.slice(0, 8).map((s) => s.title).join(', ')}.`
    : 'General ScripForge brand awareness — no single pack to feature.';

  return `Platform: ${platform}
Strategy angle: ${strategy.angle}
Goal: ${strategy.goal}
Audience: ${strategy.targetAudience}
Content pillar: ${strategy.contentPillar}
Hook concept: ${strategy.hook}

${packSummary}

Write the full script now.`;
}

async function run({ strategy, pack, platform }) {
  return structured({ system: SYSTEM, prompt: buildPrompt({ strategy, pack, platform }), schema: SCHEMA });
}

module.exports = { run };
