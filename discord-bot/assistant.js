// The shared "brain" behind both the Discord chat/DM handler and the
// website's /api/chat widget (see server/routes/chat.js). Deliberately one
// module so catalog knowledge, FAQ content, and the personalization rule
// (never leak one user's order data to another) only exist in one place.
const config = require('./config');
const catalogModel = require('../server/models/catalog');
const ordersModel = require('../server/models/orders');

let Anthropic = null;
let client = null;
if (config.ANTHROPIC_API_KEY) {
  Anthropic = require('@anthropic-ai/sdk');
  client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
}

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

const FAQ = `
- Every purchase is licensed for one device (browser profile). Moving to a new device requires a
  support request to reset it — staff can do this from Discord or the admin panel.
- License keys look like SF-XXXXXXXX-XXXXXXXX-XXXXXXXX and are found on the account's Downloads page.
- Refunds, license resets, and account issues are handled by staff, not the assistant — direct the
  user to open a support ticket (the "Get Support" button in #support) for anything account-specific
  the assistant can't resolve just by explaining how things work.
- Payment methods: card via Stripe, or crypto via NOWPayments.
- To link a Discord account to a ScripForge account: use /verify in the server, or click "Connect Discord" on the website's Account page (Account -> Connected accounts) — the website button links automatically with no email typing required.
`.trim();

function buildCatalogSummary() {
  const packs = catalogModel.listAll({ includeHidden: false });
  if (packs.length === 0) return '(catalog is currently empty)';
  return packs
    .map((pack) => {
      const scripts = pack.scripts
        .filter((s) => !s.hidden)
        .map((s) => `${s.title} ($${s.price.toFixed(2)})`)
        .join(', ');
      return `- ${pack.gameTitle} — ${pack.packName}: ${scripts || '(no scripts listed)'}`;
    })
    .join('\n');
}

// userContext is only ever populated by the caller for a request it has
// already authenticated as that specific user (session for the widget,
// verified discord_links mapping for Discord) — this function trusts
// whatever it's handed, so callers must never pass someone else's data.
function buildUserSummary(userContext) {
  if (!userContext) return '(this visitor is not signed in / not verified — do not claim to know their order history)';
  const orders = ordersModel.ordersForUser(userContext.userId).filter((o) => o.status === 'paid');
  if (orders.length === 0) return `Signed in as ${userContext.username}. No completed orders yet.`;
  const lines = orders.slice(0, 10).map((o) => `- Order #${o.id}, ${o.currency.toUpperCase()} ${(o.total_cents / 100).toFixed(2)}, ${o.paid_at || o.created_at}`);
  return `Signed in as ${userContext.username}. Their own paid orders (never mention other users' data):\n${lines.join('\n')}`;
}

function buildSystemPrompt(userContext) {
  return `You are the ScripForge support assistant for scripforge.net, a game-script marketplace. Be concise, friendly, and accurate.

Only answer using the catalog, FAQ, and (if present) the signed-in user's own order data below. Never invent scripts, prices, or policies that aren't listed. If you don't know something, say so and suggest opening a support ticket.

Never reveal, guess at, or discuss any user's account/order/license data other than the one described below (if any) — if asked about "another user" or given a username/email that isn't the current signed-in user, refuse and suggest they open a support ticket instead.

## Catalog
${buildCatalogSummary()}

## FAQ
${FAQ}

## Current user
${buildUserSummary(userContext)}`;
}

// history: [{ role: 'user'|'assistant', content: string }, ...] already
// capped by the caller. userContext: { userId, username } | null.
async function getReply({ history, userContext = null }) {
  if (!client) {
    return { error: 'The assistant is not configured (missing ANTHROPIC_API_KEY).' };
  }

  const trimmedHistory = history.slice(-config.ASSISTANT.MAX_HISTORY_MESSAGES);

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: buildSystemPrompt(userContext),
      messages: trimmedHistory
    });
    const reply = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();
    return { reply: reply || "I don't have an answer for that — try opening a support ticket." };
  } catch (err) {
    console.error('[assistant] Claude API error:', err.message);
    return { error: 'The assistant is temporarily unavailable. Please try again shortly.' };
  }
}

module.exports = { getReply, buildCatalogSummary };
