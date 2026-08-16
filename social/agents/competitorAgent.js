// Ties competitor data collection (social/platforms/competitorScraper.js) to
// storage (social/models/competitors.js), then reasons over the result with
// an LLM synthesis step — same two-part shape as social/agents/trendsAgent.js
// (real signal capture + LLM synthesis living in one agent file). Content-gap
// detection and per-topic saturation genuinely need judgment, not just
// arithmetic: "has a competitor already covered trend X" is a fuzzy
// title-matching problem an LLM handles far better than a keyword match, and
// "how many competitors are already saturating this topic" is exactly the
// kind of soft count that benefits from reading actual titles rather than
// exact-string grouping.
const { structured, isConfigured } = require('./llm');
const competitorsModel = require('../models/competitors');
const scraper = require('../platforms/competitorScraper');
const trendsModel = require('../models/trends');
const campaignsModel = require('../models/campaigns');

const SCHEMA = {
  type: 'object',
  properties: {
    contentGaps: {
      type: 'array',
      description: 'Topics that are trending for us but that none/almost none of the tracked competitors have covered recently.',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          rationale: { type: 'string', description: 'Why this is a gap — cite the trend signal and the absence (or scarcity) of competitor coverage.' },
          suggestedAngle: { type: 'string', description: 'A concrete short-form angle ScripForge could take that competitors have not.' }
        },
        required: ['topic', 'rationale', 'suggestedAngle']
      },
      maxItems: 8
    },
    saturation: {
      type: 'array',
      description: 'How crowded each current trend topic already is among tracked competitors.',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          competitorsCovering: { type: 'integer', minimum: 0, description: 'Rough count of distinct tracked competitors who have posted about this topic recently.' },
          saturationScore: { type: 'number', minimum: 0, maximum: 1, description: '0 = wide open, 1 = every competitor has already posted this.' },
          notes: { type: 'string' }
        },
        required: ['topic', 'competitorsCovering', 'saturationScore', 'notes']
      },
      maxItems: 10
    },
    firstMoverAlerts: {
      type: 'array',
      description: 'Trends with near-zero competitor coverage right now where posting first is likely to matter.',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          whyNow: { type: 'string', description: 'Why this window matters — rising trend signal plus near-zero competitor coverage.' },
          urgency: { type: 'string', enum: ['low', 'medium', 'high'] }
        },
        required: ['topic', 'whyNow', 'urgency']
      },
      maxItems: 5
    }
  },
  required: ['contentGaps', 'saturation', 'firstMoverAlerts']
};

const SYSTEM = `You are the Competitor Intelligence agent for ScripForge, a game-script/developer-tools marketplace (Minecraft, Roblox, GTA V, Fortnite, etc. — always frame products as developer tools/customization scripts, never "cheats" or "hacks"). You are given (1) topics currently trending for ScripForge's own short-form strategy, (2) a summary of ScripForge's own recent campaign angles, and (3) recent video titles/performance from tracked competitor channels on TikTok/YouTube. Identify content gaps (trending topics competitors haven't covered), score how saturated each trend topic already is among competitors, and flag near-zero-coverage trends where posting first is likely to matter. Judge topic overlap by meaning, not exact string match — a competitor video titled differently can still cover the same underlying topic. Output only via the submit_result tool.`;

// Fetches this channel's current video list and writes one new snapshot row
// per video into competitor_videos — always an insert, never an update, so
// social/models/competitors.js's time-series queries (performanceOverTime,
// postingCadence) keep accumulating real history across repeated refreshes.
async function refreshChannel(channel) {
  let result;
  if (channel.platform === 'youtube') {
    result = await scraper.fetchYouTubeChannelVideos({ channelId: channel.handle, maxResults: 20 });
  } else if (channel.platform === 'tiktok') {
    result = await scraper.fetchTikTokUserVideos({ handle: channel.handle, maxResults: 20 });
  } else {
    return { ok: false, reason: `unsupported platform "${channel.platform}"`, channelId: channel.id };
  }

  if (!result.ok) return { ok: false, reason: result.reason, channelId: channel.id };

  for (const video of result.videos) {
    competitorsModel.recordVideoSnapshot({
      channelId: channel.id,
      platformVideoId: video.id,
      title: video.title,
      publishedAt: video.publishedAt,
      views: video.views,
      likes: video.likes,
      comments: video.comments
    });
  }
  return { ok: true, channelId: channel.id, captured: result.videos.length };
}

async function refreshAll() {
  const channels = competitorsModel.listChannels();
  const results = [];
  for (const channel of channels) {
    results.push(await refreshChannel(channel));
  }
  return results;
}

function buildPrompt({ trends, campaigns, competitorVideos }) {
  const trendLines = trends.length
    ? trends.map((t) => `- [${t.source}] ${t.topic} (score ${t.score})`).join('\n')
    : '(no fresh trend data captured yet)';

  const campaignLines = campaigns.length
    ? campaigns
        .map((c) => {
          let angle = 'unknown angle';
          try {
            const strategy = JSON.parse(c.strategyJson || '{}');
            if (strategy.angle) angle = `${strategy.angle} (${strategy.contentPillar || 'unknown pillar'})`;
          } catch { /* not strategized yet, or malformed row */ }
          return `- [${c.platform}] ${angle}`;
        })
        .join('\n')
    : '(no campaign history yet)';

  const byChannel = new Map();
  for (const v of competitorVideos) {
    const key = `${v.platform}:${v.handle}`;
    if (!byChannel.has(key)) byChannel.set(key, { label: v.label || v.handle, platform: v.platform, videos: [] });
    byChannel.get(key).videos.push(v);
  }
  const competitorLines = byChannel.size
    ? [...byChannel.values()]
        .map(({ label, platform, videos }) => {
          const rows = videos.slice(0, 10).map((v) => `  - "${v.title}" (${v.views.toLocaleString()} views, posted ${v.publishedAt || 'unknown date'})`).join('\n');
          return `${label} [${platform}] — ${videos.length} recent posts:\n${rows}`;
        })
        .join('\n\n')
    : '(no competitor channels tracked, or no recent captures yet — add channels via social/models/competitors.js#addChannel and run refreshAll())';

  return `## ScripForge's current trend signals
${trendLines}

## ScripForge's own recent campaign angles
${campaignLines}

## Tracked competitors' recent posts
${competitorLines}

Identify content gaps, per-topic saturation, and first-mover alerts as specified.`;
}

async function analyze() {
  if (!isConfigured()) return { ok: false, reason: 'not_configured' };

  const trends = trendsModel.recent(20, '-7 days');
  const campaigns = campaignsModel.list({ limit: 20 });
  const competitorVideos = competitorsModel.recentAcrossChannels('-14 days', 80);

  const result = await structured({
    system: SYSTEM,
    prompt: buildPrompt({ trends, campaigns, competitorVideos }),
    schema: SCHEMA,
    maxTokens: 1800
  });

  return { ok: true, ...result };
}

module.exports = { refreshChannel, refreshAll, analyze };

// INTEGRATION NOTES:
// - Cron: add a scheduler tick (social/scheduler.js, not edited here) that
//   calls competitorAgent.refreshAll() every few hours to keep
//   competitor_videos snapshots current, similar to how trendsAgent.refresh()
//   is already scheduled. A separate, less frequent tick could call
//   competitorAgent.analyze() (e.g. once/day) and persist its result if a
//   table for it is added later — analyze() itself is stateless and returns
//   the synthesis object directly rather than writing anywhere, since no
//   storage table was specced for it.
// - Job handler: if competitor refresh should run inside the existing job
//   queue (social/jobQueue.js) rather than a bare cron tick, add a new job
//   kind (e.g. "competitor_refresh") whose handler just calls
//   competitorAgent.refreshAll(), following the same pattern as whatever
//   handles trend refresh today.
// - Admin UI: social/models/competitors.js#listChannels /
//   #latestSnapshotsForChannel / #postingCadence are read-only and safe to
//   expose via a new videoAdmin route + panel for adding/removing tracked
//   competitor channels and viewing their recent posts — mirrors how
//   social_accounts is managed today, but that wiring is out of scope here
//   per the "don't edit video-admin/js/videoAdmin routes" rule.
// - strategyAgent.js: to actually act on this, strategyAgent's buildPrompt()
//   would take an additional `competitorContext` argument (analyze()'s
//   return value) and fold it in alongside the existing insights/trends/
//   momentum sections — e.g. "avoid angle-jacking a topic with a
//   saturationScore above ~0.7; prefer contentGaps entries when one is
//   available for the current trigger; treat a high-urgency
//   firstMoverAlerts entry as a reason to prefer trend_jack as the
//   contentPillar this run." That wiring is intentionally left for whoever
//   next touches strategyAgent.js, per this feature's "don't edit existing
//   agents" constraint.
// - Config: no new env vars are strictly required (YouTube reuses
//   YOUTUBE_API_KEY from social/config.js; the TikTok fetch is unauthenticated
//   public scraping). If TikTok starts rate-limiting/blocking the scrape UA,
//   a future pass could add a configurable user-agent/proxy via config.js.
