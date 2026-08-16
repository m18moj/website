// Produces the final platform-ready title/description/hashtags, and picks
// when to post. The "when" is deliberately NOT asked of the LLM — models are
// unreliable at absolute date/time arithmetic — it's computed in plain code
// from social_insights (if analyticsLearningAgent has learned a best hour
// for this platform) or a sane per-platform default rotation otherwise.
const llm = require('./llm');
const insightsModel = require('../models/insights');

const VARIANT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Platform-appropriate title/caption, including the hook.' },
    description: { type: 'string', description: 'Fuller description for the platform (YouTube description box / TikTok caption body).' },
    hashtags: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 8 }
  },
  required: ['title', 'description', 'hashtags']
};

// Two independent hook/caption angles per post (caption A/B testing) — one
// is chosen at random to actually publish; both are kept in the campaign's
// metadata_json so analyticsLearningAgent can compare variant performance
// once enough posts have run.
const SCHEMA = {
  type: 'object',
  properties: {
    variants: { type: 'array', items: VARIANT_SCHEMA, minItems: 2, maxItems: 2, description: 'Two distinct caption/hook angles for the same content — different opening hooks or framing, not just reworded hashtags.' }
  },
  required: ['variants']
};

const SYSTEM = `You are the Publishing agent for ScripForge's short-form video system. Write TWO distinct platform-ready title/description/hashtags options from the given script/creative/promotion brief, each using a different hook or angle (e.g. curiosity vs. direct benefit) so they can be A/B tested — don't just reword the same hook twice. Include the CTA link if one is given. For YouTube Shorts, the title or description must include "#Shorts". Never use "cheat"/"hack" framing. Output only via the submit_result tool.`;

// Reasonable general-audience posting windows (UTC hours) when no learned
// insight exists yet — rotates through them by campaign id so an
// evergreen-heavy day doesn't stack every post at the exact same hour.
const DEFAULT_HOURS_UTC = { tiktok: [13, 17, 23], youtube_shorts: [16, 20, 0] };

// +/-25 min jitter around the target hour so posts don't land on the exact
// same :00:00 every day — an easy-to-spot bot pattern that also means every
// evergreen post in a given slot competes for the same fixed instant.
const JITTER_MINUTES = 25;

function nextSlotAt(hourUtc) {
  const now = new Date();
  const jitterMs = (Math.random() * 2 - 1) * JITTER_MINUTES * 60 * 1000;
  const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0) + jitterMs);
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

// Deterministic, brand-safe default metadata for admin-approved renders
// (Video Studio → "Approve & schedule") — no LLM call, so it always works
// even with no API key. Mirrors this agent's SYSTEM prompt: never
// "cheat"/"hack" framing, include the CTA link, and "#Shorts" for YouTube.
function adminDraft({ platform, pack, ctaUrl }) {
  const game = (pack && pack.gameTitle) || '';
  const packName = (pack && pack.packName) || 'ScripForge';

  const tags = [];
  if (game) tags.push(`#${game.replace(/[^A-Za-z0-9]/g, '')}`);
  tags.push('#gaming', '#scripts', '#ScripForge');
  tags.push(platform === 'youtube_shorts' ? '#Shorts' : '#fyp');
  const hashtags = [...new Set(tags)];

  const title = game ? `${packName} — ${game} Scripts` : `${packName} Scripts`;
  const description = [
    `Ready-to-use ${game ? `${game} ` : ''}scripts — instant delivery right after checkout.`,
    ctaUrl ? ctaUrl : null
  ].filter(Boolean).join('\n\n');
  return { title, description, hashtags };
}

async function run({ campaignId, packId, platform, strategy, script, creative, promotion }) {
  const { variants } = await llm.structured({
    system: SYSTEM,
    prompt: buildPrompt({ strategy, script, creative, promotion, platform, ctaUrl: promotion.ctaUrl }),
    schema: SCHEMA,
    maxTokens: 2000
  });
  const scheduledAt = pickScheduledAt({ platform, packId, campaignId });
  // 50/50 random split, not campaign-id parity — an even/odd split would
  // silently correlate the variant with whatever else campaign id happens
  // to determine (e.g. the default posting-hour rotation).
  const chosenIndex = Math.random() < 0.5 ? 0 : 1;
  const chosen = variants[chosenIndex] || variants[0];
  return { ...chosen, scheduledAt, abTest: { variantLabel: chosenIndex === 0 ? 'A' : 'B', variants } };
}

module.exports = { run, pickScheduledAt, adminDraft };
