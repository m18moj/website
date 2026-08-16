// Trending-audio-to-script pairing: cross-references TikTok trending sounds
// against the musicVibe choices that historically performed well (per
// replicationAgent's top-performer split), so a new script can be steered
// toward audio that is both currently trending AND has a track record.
//
// The trending-sounds source (Tab 2's tiktokSignals work) is feature-detected
// via try/catch require on social/models/tiktokSignals.js and its
// recentSounds() export — it no-ops cleanly (returns { written: 0, reason })
// until that model is populated, then starts producing pattern_type:'audio'
// rows with no changes needed here. See INTEGRATION NOTES at the bottom of
// social/agents/replicationAgent.js.
const contentPatternsModel = require('../models/contentPatterns');
const replicationAgent = require('./replicationAgent');

function loadTiktokSignals() {
  try {
    return require('../models/tiktokSignals');
  } catch {
    return null;
  }
}

// Cheap keyword overlap between a trending sound's own title/genre/mood tags
// and a top performer's musicVibe description — deliberately not an LLM call
// or an invented similarity score, just a real word-overlap check the caller
// can sanity-check by reading the two strings themselves.
function overlaps(soundTagsLower, musicVibeLower) {
  return soundTagsLower.split(/\s+/).some((word) => word.length > 3 && musicVibeLower.includes(word));
}

async function run({ sqliteModifier = '-180 days', groupSize = 5, maxSounds = 10 } = {}) {
  const tiktokSignalsModel = loadTiktokSignals();
  if (!tiktokSignalsModel || typeof tiktokSignalsModel.recentSounds !== 'function') {
    return { written: 0, reason: 'social/models/tiktokSignals.js (exporting recentSounds()) is not available yet' };
  }

  const trending = tiktokSignalsModel.recentSounds();
  if (!trending || !trending.length) return { written: 0, reason: 'no trending sounds captured yet' };

  const selection = replicationAgent.selectTopAndBottom(sqliteModifier, groupSize);
  if (!selection) return { written: 0, reason: `need at least ${replicationAgent.MIN_SAMPLE} published campaigns with analytics data` };

  const topWithVibe = selection.top.map(replicationAgent.detailFor).filter((d) => d && d.musicVibe);
  if (!topWithVibe.length) return { written: 0, reason: 'no musicVibe data on top-performing campaigns yet' };

  let written = 0;
  for (const sound of trending.slice(0, maxSounds)) {
    const soundTags = `${sound.title || ''} ${sound.genre || ''} ${sound.mood || ''}`.toLowerCase();
    const matches = topWithVibe.filter((d) => overlaps(soundTags, d.musicVibe.toLowerCase()));
    if (!matches.length) continue;

    contentPatternsModel.record({
      patternType: 'audio',
      platform: 'tiktok',
      contentPillar: null,
      description: `Trending sound "${sound.title || sound.id}" shares mood/genre with historically well-performing musicVibe choices (${matches.map((m) => `"${m.musicVibe}"`).join(', ')}) — worth pairing with a new script in that style while it's still trending.`,
      confidence: 0.4,
      supportingCampaignIds: matches.map((m) => m.campaignId),
      avgPerformanceLift: null
    });
    written += 1;
  }
  return { written };
}

module.exports = { run };

// INTEGRATION NOTES: see the bottom of social/agents/replicationAgent.js —
// this file is a sibling mining pass and shares that file's cron/hookup notes.
