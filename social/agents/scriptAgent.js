// Turns a strategy into an actual short-form video script: a beat-by-beat
// breakdown with voiceover and on-screen text, ready to hand to the creative
// brief and then the video pipeline. This is the last stage that's pure
// writing — creativeDirectionAgent turns it into a visual spec next.
const { structured } = require('./llm');
const contentPatternsModel = require('../models/contentPatterns');

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

function buildPrompt({ strategy, pack, platform, feedback }) {
  const packSummary = pack
    ? `Pack: "${pack.packName}" (${pack.gameTitle}). Scripts available: ${pack.scripts.slice(0, 8).map((s) => s.title).join(', ')}.`
    : 'General ScripForge brand awareness — no single pack to feature.';

  // Set when this is a redo triggered by predictionAgent scoring the
  // previous attempt below the popularity bar (see orchestrator.js runQa) —
  // naming the actual weaknesses makes this a targeted rewrite rather than a
  // blind re-roll that might just as easily score low again.
  const feedbackBlock = feedback && feedback.length
    ? `\n\nA previous attempt at this video scored too low on predicted popularity. Specific reasons — address these directly this time:\n${feedback.map((w) => `- ${w}`).join('\n')}`
    : '';

  // Content-DNA patterns: hook_style and structure patterns mined from
  // historically top-performing campaigns (see replicationAgent.js). Safe
  // when no patterns exist yet — the section is simply omitted.
  const hookPatterns = contentPatternsModel.patternsFor({ platform, contentPillar: strategy.contentPillar, patternType: 'hook_style', limit: 5 });
  const structurePatterns = contentPatternsModel.patternsFor({ platform, contentPillar: strategy.contentPillar, patternType: 'structure', limit: 5 });
  const allPatterns = [...hookPatterns, ...structurePatterns];
  const patternsBlock = allPatterns.length
    ? `\n\nKnown winning patterns from past campaigns (replicate what works):\n${allPatterns.map((p) => `- [${p.patternType}, confidence ${Math.round(p.confidence * 100)}%] ${p.patternDescription}`).join('\n')}`
    : '';

  return `Platform: ${platform}
Strategy angle: ${strategy.angle}
Goal: ${strategy.goal}
Audience: ${strategy.targetAudience}
Content pillar: ${strategy.contentPillar}
Hook concept: ${strategy.hook}

${packSummary}
${patternsBlock}

Write the full script now.${feedbackBlock}`;
}

async function run({ strategy, pack, platform, feedback = [] }) {
  return structured({ system: SYSTEM, prompt: buildPrompt({ strategy, pack, platform, feedback }), schema: SCHEMA });
}

module.exports = { run };
