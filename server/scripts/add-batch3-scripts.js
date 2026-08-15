// Adds the third batch of new scripts per game (a random 3-8 per pack, see
// scripts/content-refresh/batch3-script-content.js) to the live catalog, and
// writes out a manifest of the exact ids the database assigned (createScript
// slugifies titles itself) so the file-generation step downstream can target
// the right filenames without guessing. Mirrors add-batch2-scripts.js.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const catalogModel = require('../models/catalog');
const BATCH3 = require('../../scripts/content-refresh/batch3-script-content');

function main() {
  const manifest = {};

  for (const [packId, scripts] of Object.entries(BATCH3)) {
    manifest[packId] = [];
    for (const script of scripts) {
      const pack = catalogModel.createScript(packId, script);
      if (!pack) {
        console.log(`SKIP (no such pack): ${packId}`);
        continue;
      }
      const created = pack.scripts.find((s) => s.title === script.title);
      manifest[packId].push({
        id: created.id,
        title: created.title,
        category: created.category,
        description: created.description,
        price: created.price
      });
      console.log(`Created ${packId}/${created.id} — "${created.title}"`);
    }
  }

  const manifestPath = path.join(__dirname, '..', '..', 'scripts', 'content-refresh', 'batch3-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nWrote manifest to ${manifestPath}`);
}

main();
