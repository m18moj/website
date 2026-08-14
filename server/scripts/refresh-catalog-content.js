// One-time content refresh: applies new script titles/descriptions/categories/
// prices (scripts/content-refresh/new-script-content.js) to the existing
// database by packId + scriptId, without touching ids, hidden state, or any
// pack/script the admin added themselves. Safe to re-run — it's idempotent.
require('dotenv').config();
const catalogModel = require('../models/catalog');
const NEW_CONTENT = require('../../scripts/content-refresh/new-script-content');

function main() {
  const catalog = catalogModel.listAll({ includeHidden: true });
  let updated = 0;
  let skipped = 0;

  for (const pack of catalog) {
    const packContent = NEW_CONTENT[pack.packId];
    if (!packContent) continue;

    for (const script of pack.scripts) {
      const fresh = packContent[script.id];
      if (!fresh) continue;
      catalogModel.updateScript(pack.packId, script.id, fresh);
      updated += 1;
    }
  }

  console.log(`Refreshed ${updated} scripts.`);
}

main();
