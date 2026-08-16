// Produces the final platform-ready title/description/hashtags, and picks
// when to post. The "when" is deliberately NOT asked of the LLM — models are
// unreliable at absolute date/time arithmetic — it's computed in plain code
// from social_insights (if analyticsLearningAgent has learned a best hour
// for this platform) or a sane per-platform default rotation otherwise.
const llm = require('./llm');
const insightsModel = require('../models/insights');

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Platform-appropriate title/caption, including the hook.' },
    description: { type: 'string', description: 'Fuller description for the platform (YouTube description box / TikTok caption body).' },
    hashtags: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 8 }
  },
  required: ['title', 'description', 'hashtags']
};

const SYSTEM = `You are the Publishing agent for ScripForge's short-form video system. Write the final platform-ready title, description, and hashtags from the given script/creative/promotion brief. Include the CTA link if one is given. For YouTube Shorts, the title or description must include "#Shorts". Never use "cheat"/"hack" framing. Output only via the submit_result tool.`;

// Reasonable general-audience posting windows (UTC hours) when no learned
// insight exists yet — rotates through them by campaign id so an
// evergreen-heavy day doesn't stack every post at the exact same hour.
const DEFAULT_HOURS_UTC = { tiktok: [13, 17, 23], youtube_shorts: [16, 20, 0] };

function nextSlotAt(hourUtc) {
  const now = new Date();
  const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0));
  if (candidate.getTime() <= Date.now()) candidate.setUTCDate(candidate.getUTCDate() + 1);
  return candidate;
}

function pickScheduledAt({ platform, packId, campaignId }) {
  const learned = insightsModel
    .relevantTo({ platform, packId })
    .map((i) => { try { return JSON.parse(i.supporting_data_json || '{}'); } catch (err) { return {}; } })
    .find((data) => typeof data.bestHourUtc === 'number');

  if (learned) return nextSlotAt(learned.bestHourUtc).toISOString().slice(0, 19).replace('T', ' ');

  const hours = DEFAULT_HOURS_UTC[platform] || DEFAULT_HOURS_UTC.tiktok;
  const hour = hours[campaignId % hours.length];
  return nextSlotAt(hour).toISOString().slice(0, 19).replace('T', ' ');
}

function buildPrompt({ strategy, script, creative, promotion, platform, ctaUrl }) {
  return `Platform: ${platform}
Strategy angle: ${strategy.angle}
Hook: ${script.hookLine}
CTA: ${script.ctaLine}
Featured scripts: ${promotion.featuredScriptTitles.join(', ') || '(none — general brand awareness)'}
Price callout: ${promotion.priceCallout}
Promo line: ${promotion.promoLine || '(none)'}
Link: ${ctaUrl}
Visual style: ${creative.visualStyle}`;
}

async function run({ campaignId, packId, platform, strategy, script, creative, promotion }) {
  const metadata = await llm.structured({
    system: SYSTEM,
    prompt: buildPrompt({ strategy, script, creative, promotion, platform, ctaUrl: promotion.ctaUrl }),
    schema: SCHEMA
  });
  const scheduledAt = pickScheduledAt({ platform, packId, campaignId });
  return { ...metadata, scheduledAt };
}

module.exports = { run };
