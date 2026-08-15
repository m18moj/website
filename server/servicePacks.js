// Which packs are services (Discord bots, websites, SMM) rather than
// downloadable scripts — they never get a file, and a paid order for one
// automatically opens a Discord ticket instead (see
// discord-bot/serviceOrderTicket.js). Shared between the downloads route
// (to change what the "your files" page shows for these) and the ticket
// opener (to decide when to fire at all).
const SERVICE_PACK_IDS = new Set(['discord-bots', 'websites', 'smm-services']);

function isServicePack(packId) {
  return SERVICE_PACK_IDS.has(packId);
}

module.exports = { SERVICE_PACK_IDS, isServicePack };
