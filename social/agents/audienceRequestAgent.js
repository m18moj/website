// Comment-mining: pulls viewer comment text on recently published videos and
// asks Claude to surface recurring questions/content requests, stored as
// pattern_type:'audience_request' rows in social/models/contentPatterns.js —
// these are content IDEAS mined from the audience, distinct from the
// production-mechanics patterns replicationAgent writes.
//
// social/platforms/tiktok.js and youtube.js currently only expose aggregate
// stats (fetchVideoStats/fetchStats — view/like/comment COUNTS), not comment
// TEXT, so this feature-detects a fetchComments() export on either client and
// no-ops cleanly until one exists. See INTEGRATION NOTES at the bottom of
// social/agents/replicationAgent.js for exactly what would need to be added
// to those platform files.
const tiktok = require('../platforms/tiktok');
const youtube = require('../platforms/youtube');
const publicationsModel = require('../models/publications');
const contentPatternsModel = require('../models/contentPatterns');
const { structured, isConfigured } = require('./llm');

function commentFetchersAvailable() {
  return typeof tiktok.fetchComments === 'function' || typeof youtube.fetchComments === 'function';
}

const SCHEMA = {
  type: 'object',
  properties: {
    requests: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          request: { type: 'string', description: 'A recurring question or content request viewers are asking for, phrased as an actionable content idea.' },
          confidence: { type: 'number', minimum: 0, maximum: 1, description: 'Higher when multiple distinct comments point at the same request.' },
          exampleComments: { type: 'array', items: { type: 'string' }, maxItems: 5 }
        },
        required: ['request', 'confidence']
      }
    }
  },
  required: ['requests']
};

const SYSTEM = `You read viewer comments on ScripForge's short-form marketing videos and surface recurring questions or content requests worth turning into a new video. Only report a request when multiple comments plausibly point at the same underlying ask — never invent a pattern from a single comment. Output only via the submit_result tool.`;

async function run({ sinceModifier = '-14 days', maxComments = 300 } = {}) {
  if (!commentFetchersAvailable()) {
    return { written: 0, reason: 'no comment-fetching capability yet — social/platforms/tiktok.js and youtube.js only expose aggregate stats, not comment text; add a fetchComments() export to either before this agent can produce data' };
  }
  if (!isConfigured()) return { written: 0, reason: 'not_configured' };

  const recent = publicationsModel.listPublishedSince(sinceModifier);
  const comments = [];
  for (const pub of recent) {
    if (!pub.platformPostId) continue;
    if (pub.platform === 'tiktok' && typeof tiktok.fetchComments === 'function') {
      const res = await tiktok.fetchComments(pub.platformPostId);
      if (res.ok) comments.push(...res.comments.map((c) => (typeof c === 'string' ? c : c.text)).filter(Boolean));
    } else if (pub.platform === 'youtube_shorts' && typeof youtube.fetchComments === 'function') {
      const res = await youtube.fetchComments(pub.platformPostId);
      if (res.ok) comments.push(...res.comments.map((c) => (typeof c === 'string' ? c : c.text)).filter(Boolean));
    }
    if (comments.length >= maxComments) break;
  }

  if (!comments.length) return { written: 0, reason: 'no comments collected in this window' };

  const prompt = `Recent viewer comments across published videos:\n${comments.slice(0, maxComments).map((c) => `- ${c}`).join('\n')}\n\nSurface recurring questions/content requests.`;
  const result = await structured({ system: SYSTEM, prompt, schema: SCHEMA, maxTokens: 1200 });

  let written = 0;
  for (const r of result.requests) {
    contentPatternsModel.record({
      patternType: 'audience_request',
      platform: null,
      contentPillar: null,
      description: r.request,
      confidence: r.confidence,
      supportingCampaignIds: [],
      avgPerformanceLift: null
    });
    written += 1;
  }
  return { written };
}

module.exports = { run };

// INTEGRATION NOTES: see the bottom of social/agents/replicationAgent.js —
// this file is a sibling mining pass and shares that file's cron/hookup notes.
