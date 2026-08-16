// Ad-copy generation via the same Claude API/key already used elsewhere in
// this project (discord-bot/assistant.js). Forces a structured tool call so
// the pipeline gets typed JSON back, not prose to parse. Every claim is
// grounded in real catalog data (pack name, real script titles/descriptions,
// real script count, real price) handed in as context — the model writes
// the hook/beats/CTA copy, it doesn't invent numbers.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

function client() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "No ANTHROPIC_API_KEY found (checked video/.env, root .env, discord-bot/.env). " +
        "Set one of those to enable AI-generated ad copy — see video/.env.example."
    );
  }
  return new Anthropic({ apiKey });
}

const PACK_COPY_TOOL = {
  name: "submit_pack_video_copy",
  description: "Submit the finished ad copy for a short pack-promo video.",
  input_schema: {
    type: "object",
    required: ["hook", "beats", "cta"],
    properties: {
      hook: {
        type: "object",
        required: ["onScreen", "narration"],
        properties: {
          onScreen: { type: "string", description: "Punchy on-screen headline, 5-9 words, ends with a period." },
          narration: { type: "string", description: "The full sentence spoken aloud for the hook — natural spoken English, can be longer/softer than onScreen." },
          heroWord: { type: "string", description: "One word from onScreen (lowercase, no punctuation) to highlight in the pack's accent color." },
        },
      },
      beats: {
        type: "array",
        minItems: 2,
        maxItems: 3,
        items: {
          type: "object",
          required: ["onScreen", "narration"],
          properties: {
            onScreen: { type: "string", description: "Short punchy heading, 2-6 words." },
            narration: { type: "string", description: "Full natural sentence spoken for this beat." },
            featureScriptId: { type: "string", description: "Optional: the id of one script from the provided list whose title/description this beat is about." },
          },
        },
      },
      statNarration: {
        type: "string",
        description: "One short natural sentence spoken during the number/stat reveal beat (e.g. mentioning the script count). Omit if not needed.",
      },
      cta: {
        type: "object",
        required: ["onScreen", "narration"],
        properties: {
          onScreen: { type: "string", description: "Short CTA headline, e.g. 'Get the <Pack> Pack.'" },
          narration: { type: "string", description: "Full sentence spoken for the CTA." },
          sub: { type: "string", description: "Small supporting line under the CTA, e.g. 'Instant download after checkout.'" },
        },
      },
    },
  },
};

const WEBSITE_COPY_TOOL = {
  name: "submit_website_video_copy",
  description: "Submit the finished ad copy for the storefront's flagship premium promo video.",
  input_schema: {
    type: "object",
    required: ["hook", "showcaseNarration", "statsNarration", "cta"],
    properties: {
      hook: {
        type: "object",
        required: ["onScreen", "narration"],
        properties: {
          onScreen: { type: "string", description: "Punchy tagline, 6-10 words." },
          narration: { type: "string", description: "Full sentence spoken for the open." },
          heroWord: { type: "string", description: "One lowercase word from onScreen to highlight." },
        },
      },
      subhead: { type: "string", description: "Short supporting line shown near the CTA." },
      showcaseNarration: { type: "string", description: "1-2 sentences spoken while the catalog grid is shown." },
      statsNarration: { type: "string", description: "1 sentence spoken while the stat counters animate." },
      cta: {
        type: "object",
        required: ["onScreen", "narration"],
        properties: {
          onScreen: { type: "string", description: "Short closing CTA, e.g. 'Explore the full catalog.'" },
          narration: { type: "string", description: "Full sentence spoken for the close." },
        },
      },
    },
  },
};

// Occasionally the model, under forced tool_choice against this nested
// schema, stuffs the whole answer as a JSON *string* into one property
// (e.g. {beats: "{\"hook\":...,\"beats\":[...],\"cta\":...}"}) instead of
// filling the schema's top-level fields directly. Detect and unwrap that
// rather than crashing downstream on missing `.hook`/`.cta`.
function normalizeToolInput(input, requiredKeys) {
  if (requiredKeys.every((k) => input[k] !== undefined)) return input;
  for (const value of Object.values(input)) {
    if (typeof value !== "string") continue;
    try {
      const parsed = JSON.parse(value);
      if (parsed && requiredKeys.every((k) => parsed[k] !== undefined)) return parsed;
    } catch {
      // not JSON, ignore
    }
  }
  return input;
}

async function callTool(system, userText, tool) {
  const anthropic = client();
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content: userText }],
  });
  const toolUse = msg.content.find((b) => b.type === "tool_use");
  if (!toolUse) throw new Error("Claude did not return a tool call for ad copy.");
  const normalized = normalizeToolInput(toolUse.input, tool.input_schema.required);
  if (tool.input_schema.required.some((k) => normalized[k] === undefined)) {
    throw new Error(`Claude's ad copy tool call is missing required field(s): ${tool.input_schema.required.filter((k) => normalized[k] === undefined).join(", ")}`);
  }
  return normalized;
}

const SYSTEM_PROMPT = `You write short-form video ad copy for ScripForge, a store that sells
ready-made game scripts and dev/marketing service packs. Tone: confident,
direct, a little irreverent — speaking to developers and server owners, not
consumers. Never invent statistics, prices, or features that weren't given
to you. Keep onScreen text punchy (no filler words). Narration should sound
natural when read aloud by a text-to-speech voice — short sentences, no
semicolons or parentheticals, avoid abbreviations that are hard to pronounce.`;

export async function generatePackCopy({ platform, pack, scripts }) {
  const scriptList = scripts
    .map((s) => `- id="${s.id}" title="${s.title}" category="${s.category}" desc="${s.description}"`)
    .join("\n");
  const wordBudget =
    platform === "tiktok" ? 45 : platform === "shorts" ? 95 : 65;
  const platformNote =
    platform === "tiktok"
      ? `This is a TikTok cut: fast, hook-heavy. Total spoken narration across hook+beats+stat+cta MUST be under ${wordBudget} words total — count them. Every sentence short and punchy.`
      : platform === "shorts"
      ? `This is a YouTube Shorts cut: a bit more descriptive, but total spoken narration across hook+beats+stat+cta MUST stay under ${wordBudget} words total — count them.`
      : `This is a general pack-promo cut for the catalog page and social. Total spoken narration across hook+beats+stat+cta MUST stay under ${wordBudget} words total — count them.`;

  const userText = `${platformNote}

Pack: ${pack.packName} (${pack.gameTitle}, genre: ${pack.genre})
Pack description: ${pack.description}
Real script count in this pack: ${pack.scriptCount}
Price range: from ${pack.priceLabel}

Real scripts in this pack (use 2 of these as the basis for the two/three beats — reference one by featureScriptId where natural):
${scriptList}

Write the hook, 2-3 beats, an optional statNarration for a "script count" number reveal, and the CTA.`;

  return callTool(SYSTEM_PROMPT, userText, PACK_COPY_TOOL);
}

export async function generateWebsiteCopy({ packs, totalScripts }) {
  const packList = packs.map((p) => `- ${p.packName} (${p.genre})`).join("\n");
  const userText = `Write copy for the flagship 16:9 premium promo video for the whole ScripForge storefront (not one pack).

It sells ${packs.length} packs covering:
${packList}

Total real ready-made scripts across the catalog: ${totalScripts}+

The video shows a grid of pack tiles, then three stat counters (pack count, script count, "100% instant delivery"), then a closing CTA to explore the catalog.

Total spoken narration across hook+showcaseNarration+statsNarration+cta MUST stay under 85 words total — count them. Short, confident sentences.`;

  return callTool(SYSTEM_PROMPT, userText, WEBSITE_COPY_TOOL);
}
