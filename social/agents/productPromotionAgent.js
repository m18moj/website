// Grounds the campaign in real store data — actual script titles/prices and
// (if one exists) a real, currently-valid promo code — so the LLM is only
// ever asked to frame facts it's been handed, never to invent a price,
// discount, or scarcity claim. Deliberately separate from strategyAgent:
// strategy decides the creative angle, this decides exactly what product
// facts back it up.
const { structured } = require('./llm');
const promoCodesModel = require('../../server/models/promoCodes');
const config = require('../config');

const SCHEMA = {
  type: 'object',
  properties: {
    featuredScriptTitles: {
      type: 'array',
      items: { type: 'string' },
      description: 'Up to 3 specific script titles (verbatim from the data given) to call out by name. Empty if no pack is featured.'
    },
    priceCallout: { type: 'string', description: 'How to state pricing/value in the video, using only the real prices given.' },
    urgencyAngle: { type: 'string', description: 'A truthful urgency/CTA framing — no fake scarcity or countdown claims.' },
    promoLine: { type: 'string', description: 'Line to include if a promo code was given; empty string if none was given.' }
  },
  required: ['featuredScriptTitles', 'priceCallout', 'urgencyAngle', 'promoLine']
};

const SYSTEM = `You are the Product Promotion agent for ScripForge. You are given REAL script titles/prices and, optionally, a REAL currently-valid promo code. Decide what to feature and how to frame pricing/urgency truthfully — never invent a discount, price, script, or scarcity claim beyond what's given. Output only via the submit_result tool.`;

// Only a code that's active, has no per-account owner (owner-bound codes
// like the Discord-verify one are personal, not for public promotion), and
// isn't expired/exhausted is safe to feature publicly.
function activePublicPromoCode() {
  const now = Date.now();
  return (
    promoCodesModel
      .listAll()
      .find(
        (c) =>
          c.active &&
          !c.owner_user_id &&
          (!c.expires_at || new Date(c.expires_at).getTime() > now) &&
          (!c.max_uses || c.uses_count < c.max_uses)
      ) || null
  );
}

function catalogUrl(pack) {
  return pack ? `${config.SITE_URL}/pages/catalog?pack=${pack.packId}` : `${config.SITE_URL}/pages/catalog`;
}

function formatPromoLine(promoCode) {
  if (!promoCode) return 'No active promo code right now — do not mention one.';
  const amount = promoCode.discount_type === 'percent' ? `${promoCode.discount_value}% off` : `$${(promoCode.discount_value / 100).toFixed(2)} off`;
  return `Active promo code: ${promoCode.code} (${amount})`;
}

function buildPrompt({ pack, promoCode }) {
  if (!pack) {
    return `No specific pack is featured in this campaign — this is general ScripForge brand awareness. Produce generic (non-pack-specific) promotion framing, empty featuredScriptTitles, a priceCallout describing the catalog broadly (packs of scripts starting at low prices), and an honest CTA to browse ${catalogUrl(null)}.\n\n${formatPromoLine(promoCode)}`;
  }
  const scripts = pack.scripts
    .filter((s) => !s.hidden)
    .map((s) => `${s.title} — $${s.price.toFixed(2)}`)
    .join('\n');
  return `Pack: ${pack.packName} (${pack.gameTitle})
${pack.description || ''}
Scripts:
${scripts}

${formatPromoLine(promoCode)}
Catalog link: ${catalogUrl(pack)}`;
}

async function run({ pack }) {
  const promoCode = activePublicPromoCode();
  const result = await structured({ system: SYSTEM, prompt: buildPrompt({ pack, promoCode }), schema: SCHEMA });
  return { ...result, promoCode: promoCode ? promoCode.code : null, ctaUrl: catalogUrl(pack) };
}

module.exports = { run };
