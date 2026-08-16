// Thumbnail/visual-style analysis for replicationAgent's "content DNA" work:
// looks at an actual rendered frame from each top-performing published
// video (read-only, via social_publications.output_path) and asks a
// vision-capable Claude call for the dominant colors and on-screen text/
// caption style, then writes a pattern_type:'visual_style' row to
// social/models/contentPatterns.js when the same look recurs across multiple
// winners. social/agents/llm.js's structured() is text-only, so this file
// makes its own Anthropic client call (same construction as llm.js) with an
// image content block added — llm.js itself is left untouched per the
// "don't edit existing social/agents/ files" instruction.
const fs = require('fs');
const { spawn } = require('child_process');
const config = require('../config');
const publicationsModel = require('../models/publications');
const contentPatternsModel = require('../models/contentPatterns');
const replicationAgent = require('./replicationAgent');

let client = null;
if (config.ANTHROPIC_API_KEY) {
  const Anthropic = require('@anthropic-ai/sdk');
  client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
}

function isConfigured() {
  return Boolean(client);
}

// Pulls one JPEG frame ~1s into the clip straight to stdout via ffmpeg — the
// same binary video/pipeline/lib/render.mjs already shells out to for
// rendering, so no new dependency is introduced. Resolves to null (never
// throws) on any failure — missing ffmpeg, corrupt/missing file, etc. — so
// one bad video can't take down the whole analysis pass.
function extractFrame(videoPath) {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn('ffmpeg', ['-y', '-ss', '00:00:01', '-i', videoPath, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1']);
    } catch {
      resolve(null);
      return;
    }
    const chunks = [];
    proc.stdout.on('data', (chunk) => chunks.push(chunk));
    proc.on('error', () => resolve(null));
    proc.on('close', (code) => {
      if (code !== 0 || !chunks.length) resolve(null);
      else resolve(Buffer.concat(chunks));
    });
  });
}

const SCHEMA = {
  type: 'object',
  properties: {
    dominantColors: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5, description: 'Dominant colors as short plain descriptions, e.g. "near-black background", "cyan accent text".' },
    textOverlayStyle: { type: 'string', description: 'How on-screen text/captions are styled in this frame: weight, size, placement, animation feel.' },
    notes: { type: 'string' }
  },
  required: ['dominantColors', 'textOverlayStyle', 'notes']
};

const SYSTEM = `You are analyzing a single frame from a short-form marketing video for ScripForge. Describe only the concrete visual production choices visible in this frame — dominant colors and how any on-screen text/captions are styled. Output only via the submit_result tool.`;

async function analyzeFrame(buffer) {
  const response = await client.messages.create({
    model: config.ANTHROPIC_MODEL,
    max_tokens: 500,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: buffer.toString('base64') } },
        { type: 'text', text: 'Analyze this video frame.' }
      ]
    }],
    tools: [{ name: 'submit_result', description: 'Submit the structured analysis.', input_schema: SCHEMA }],
    tool_choice: { type: 'tool', name: 'submit_result' }
  });
  const toolUse = response.content.find((block) => block.type === 'tool_use' && block.name === 'submit_result');
  if (!toolUse) throw new Error('Model response did not include the expected structured result.');
  return toolUse.input;
}

async function run({ sqliteModifier = '-180 days', groupSize = 5 } = {}) {
  if (!isConfigured()) return { written: 0, reason: 'not_configured' };

  const selection = replicationAgent.selectTopAndBottom(sqliteModifier, groupSize);
  if (!selection) return { written: 0, reason: `need at least ${replicationAgent.MIN_SAMPLE} published campaigns with analytics data` };

  const analyzed = [];
  for (const row of selection.top) {
    const pub = publicationsModel.findByCampaignId(row.campaignId);
    if (!pub || !pub.outputPath || !fs.existsSync(pub.outputPath)) continue;
    const frame = await extractFrame(pub.outputPath);
    if (!frame) continue;
    try {
      const analysis = await analyzeFrame(frame);
      analyzed.push({ campaignId: row.campaignId, ...analysis });
    } catch { /* one bad frame/analysis call shouldn't kill the whole run */ }
  }

  if (!analyzed.length) return { written: 0, reason: 'no analyzable frames found (ffmpeg unavailable, or no locally readable output files for top performers)' };

  // No second LLM call needed to judge "is this a real pattern" — recurring
  // color words across multiple independently-analyzed top performers is
  // itself the co-occurrence signal, same spirit as replicationAgent asking
  // for a pattern only when it plausibly explains more than one example.
  const colorCounts = new Map();
  for (const a of analyzed) {
    for (const c of a.dominantColors) {
      const key = c.toLowerCase().trim();
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    }
  }
  const recurringThreshold = Math.max(2, Math.ceil(analyzed.length * 0.4));
  const recurring = [...colorCounts.entries()].filter(([, count]) => count >= recurringThreshold);

  if (!recurring.length) return { written: 0, analyzedCount: analyzed.length, reason: 'no recurring color/style pattern across the analyzed frames' };

  contentPatternsModel.record({
    patternType: 'visual_style',
    platform: null,
    contentPillar: null,
    description: `Top-performing videos recurrently use: ${recurring.map(([color]) => color).join(', ')}. On-screen text/caption styles seen: ${[...new Set(analyzed.map((a) => a.textOverlayStyle))].join(' | ')}.`,
    confidence: Math.min(0.9, 0.4 + recurring.length * 0.1),
    supportingCampaignIds: analyzed.map((a) => a.campaignId),
    avgPerformanceLift: null
  });

  return { written: 1, analyzedCount: analyzed.length };
}

module.exports = { run, isConfigured };

// INTEGRATION NOTES: see the bottom of social/agents/replicationAgent.js —
// this file is a sibling mining pass and shares that file's cron/hookup notes.
