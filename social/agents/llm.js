// Shared Anthropic client for every agent in social/agents/. Lazy-init on
// missing key (same pattern as discord-bot/assistant.js) so the worker still
// boots and the job queue still runs — every LLM-backed stage just fails
// that one job (which the queue then retries/surfaces) rather than crashing
// the process.
const config = require('../config');

let client = null;
if (config.ANTHROPIC_API_KEY) {
  const Anthropic = require('@anthropic-ai/sdk');
  client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
}

function isConfigured() {
  return Boolean(client);
}

// Forces Claude to respond with exactly one call to a synthetic
// "submit_result" tool matching `schema` (a plain JSON Schema object), so
// every agent gets back an already-shaped JS object instead of parsing
// prose out of a text response. tool_choice pinned to that one tool is what
// makes it a "structured output" call rather than a normal chat turn.
async function structured({ system, prompt, schema, maxTokens = 1500 }) {
  if (!client) {
    throw Object.assign(new Error('ANTHROPIC_API_KEY is not configured — social/.env needs it for any agent to run.'), { code: 'not_configured' });
  }

  const response = await client.messages.create({
    model: config.ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    // Every agent's SYSTEM string is a fixed constant reused across every
    // job it runs — marking it cacheable means repeat calls to the same
    // agent (e.g. one per campaign) read from cache instead of paying full
    // price for the same instructions each time. No-ops harmlessly below
    // the model's minimum cacheable prefix length.
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: prompt }],
    tools: [{ name: 'submit_result', description: 'Submit the final structured result for this step.', input_schema: schema }],
    tool_choice: { type: 'tool', name: 'submit_result' }
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use' && block.name === 'submit_result');
  if (!toolUse) throw new Error('Model response did not include the expected structured result.');
  return toolUse.input;
}

module.exports = { isConfigured, structured };
