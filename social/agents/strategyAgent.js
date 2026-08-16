// Turns a trigger (new pack, evergreen slot, or trend) into a campaign
// strategy: the angle, audience, goal, and hook concept everything
// downstream (script, creative, publishing) builds on. Reads back
// social_insights (what's worked before) and social_trends (what's hot
// right now) so the loop actually optimizes over time instead of repeating
// the same angle forever.
const { structured } = require('./llm');

const SCHEMA = {
  type: 'object',
  properties: {
    angle: { type: 'string', description: 'The specific creative angle for this video, one sentence.' },
    goal: { type: 'string', enum: ['awareness', 'conversion', 'engagement'] },
    targetAudience: { type: 'string', description: 'Who this is for, e.g. "Roblox scripters looking for a starting point".' },
    contentPillar: {
      type: 'string',
      enum: ['product_showcase', 'tutorial_snippet', 'before_after', 'trend_jack', 'social_proof', 'behind_the_scenes']
    },
    hook: { type: 'string', description: 'The literal first line/visual of the video — must earn attention in under 2 seconds.' },
    rationale: { type: 'string', description: 'One or two sentences on why this angle, referencing any insight/trend used.' }
  },
  required: ['angle', 'goal', 'targetAudience', 'contentPillar', 'hook', 'rationale']
};

const SYSTEM = `You are the Strategy agent for ScripForge's short-form video marketing system. ScripForge sells game-script "packs" (developer/customization scripts and tools for games like Minecraft, Roblox, GTA V, Fortnite, etc.) and related services (Discord bots, SMM, websites) — always frame these as developer tools / customization scripts, never as "cheats" or "hacks" (that framing risks platform strikes and misrepresents the product). Output only via the submit_result tool.`;

function buildPrompt({ pack, platform, triggerType, insights, trends }) {
  const packSummary = pack
    ? `Featured pack: "${pack.packName}" for ${pack.gameTitle} (${pack.genre}). ${pack.description || ''}\nScripts: ${pack.scripts.slice(0, 8).map((s) => `${s.title} ($${s.price.toFixed(2)})`).join(', ')}`
    : 'No specific pack — this is a trend-driven or brand-awareness campaign for ScripForge generally.';

  const insightLines = insights.length
    ? insights.map((i) => `- (${i.scope}, confidence ${i.confidence}) ${i.insight}`).join('\n')
    : '(no prior performance data yet — use general short-form best practices)';

  const trendLines = trends.length
    ? trends.map((t) => `- [${t.source}] ${t.topic} (score ${t.score})`).join('\n')
    : '(no fresh trend data)';

  return `Platform: ${platform}
Trigger: ${triggerType}

${packSummary}

## Learned insights from past campaigns
${insightLines}

## Current trends
${trendLines}

Plan the strategy for one short-form video (15-60s) promoting this. Prefer an angle that hasn't been overused per the insights above.`;
}

async function run({ pack, platform, triggerType, insights = [], trends = [] }) {
  return structured({ system: SYSTEM, prompt: buildPrompt({ pack, platform, triggerType, insights, trends }), schema: SCHEMA });
}

module.exports = { run };
