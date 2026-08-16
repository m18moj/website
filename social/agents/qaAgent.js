// Gate before a campaign is allowed to schedule/publish. Two layers:
// (1) deterministic checks — did the video pipeline actually produce a file,
// is its duration in Shorts/TikTok range — which run first and never cost
// an LLM call if they fail; (2) an LLM content review focused on the one
// policy risk specific to this business: ScripForge sells developer/
// customization *scripts*, and copy that reads as promoting "cheating" or
// "hacking" risks a platform strike, so QA explicitly screens for that
// framing (matching how the site already describes these products — see
// FEATURES.md).
const fs = require('fs');
const llm = require('./llm');

const SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    policyRisk: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
    issues: {
      type: 'array',
      items: { type: 'object', properties: { severity: { type: 'string', enum: ['minor', 'major'] }, note: { type: 'string' } }, required: ['severity', 'note'] }
    },
    notes: { type: 'string' }
  },
  required: ['pass', 'policyRisk', 'issues', 'notes']
};

const SYSTEM = `You are the QA agent for ScripForge's short-form video system, the last check before a video is scheduled to post publicly on TikTok/YouTube Shorts. Reject (pass=false, policyRisk >= medium) any copy that frames the product as "cheats", "hacks", "undetectable", or otherwise promotes cheating in games or violating a game's terms of service — ScripForge sells developer/customization scripts and tools, and that framing risks a real platform strike. Also flag (major issue) any invented price, discount, or claim not clearly grounded in the provided script/metadata. Otherwise check for brand consistency and general clarity. Output only via the submit_result tool.`;

const MIN_DURATION_SECONDS = 10;
const MAX_DURATION_SECONDS = 180; // YouTube Shorts ceiling; TikTok allows longer but this system targets short-form either way.

function checkVideoOutput(videoJob) {
  const issues = [];
  if (!videoJob || videoJob.status !== 'completed' || !videoJob.outputPath) {
    return { ok: false, issues: [{ severity: 'major', note: 'No completed video output on file for this campaign.' }] };
  }
  if (!fs.existsSync(videoJob.outputPath)) {
    return { ok: false, issues: [{ severity: 'major', note: `Video output path does not exist on disk: ${videoJob.outputPath}` }] };
  }
  let meta = {};
  try { meta = JSON.parse(videoJob.outputMetaJson || '{}'); } catch (err) { meta = {}; }
  if (meta.durationSeconds && (meta.durationSeconds < MIN_DURATION_SECONDS || meta.durationSeconds > MAX_DURATION_SECONDS)) {
    issues.push({ severity: 'major', note: `Duration ${meta.durationSeconds}s is outside the expected ${MIN_DURATION_SECONDS}-${MAX_DURATION_SECONDS}s range.` });
  }
  return { ok: issues.length === 0, issues, meta };
}

function buildPrompt({ script, creative, promotion }) {
  return `Script hook: ${script.hookLine}
Script beats: ${script.beats.map((b) => `"${b.voiceover}" / on-screen: "${b.onScreenText}"`).join(' | ')}
CTA: ${script.ctaLine}

Creative brief: ${creative.visualStyle}. Thumbnail concept: ${creative.thumbnailConcept}.

Promotion framing: ${promotion.priceCallout} | Urgency: ${promotion.urgencyAngle} | Featured: ${promotion.featuredScriptTitles.join(', ') || '(none)'} | Promo line: ${promotion.promoLine || '(none)'}

Review this for platform-policy risk and brand/factual consistency.`;
}

async function run({ script, creative, promotion, videoJob }) {
  const videoCheck = checkVideoOutput(videoJob);
  if (!videoCheck.ok) {
    return { pass: false, policyRisk: 'none', issues: videoCheck.issues, notes: 'Failed deterministic video-output check before any content review.' };
  }

  if (!llm.isConfigured()) {
    return { pass: true, policyRisk: 'none', issues: [], notes: 'ANTHROPIC_API_KEY not configured — skipped LLM content review, deterministic checks passed.' };
  }

  const review = await llm.structured({ system: SYSTEM, prompt: buildPrompt({ script, creative, promotion }), schema: SCHEMA });
  const majorIssues = review.issues.filter((i) => i.severity === 'major');
  return { ...review, pass: review.pass && majorIssues.length === 0 && review.policyRisk !== 'high' };
}

module.exports = { run };
