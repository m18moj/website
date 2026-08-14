// One-time (but safely re-runnable) script: walks generated-scripts/ and
// links each file to its matching catalog row — file_path, file_ext, a
// preview snippet for the pack page, and an initial 1.0.0 changelog entry.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const catalogModel = require('../models/catalog');

const ROOT = path.join(__dirname, '..', '..');
const GENERATED_DIR = path.join(ROOT, 'generated-scripts');
const PREVIEW_LINES = 25;

function main() {
  if (!fs.existsSync(GENERATED_DIR)) {
    console.log('No generated-scripts/ directory found — nothing to link.');
    return;
  }

  let linked = 0;
  let skipped = 0;

  for (const packId of fs.readdirSync(GENERATED_DIR)) {
    const packDir = path.join(GENERATED_DIR, packId);
    if (!fs.statSync(packDir).isDirectory()) continue;

    for (const filename of fs.readdirSync(packDir)) {
      const fullPath = path.join(packDir, filename);
      const ext = path.extname(filename).slice(1);
      const scriptId = path.basename(filename, path.extname(filename));

      const existing = catalogModel.getScriptFileRecord(packId, scriptId);
      if (!existing) {
        console.log(`SKIP (no matching catalog row): ${packId}/${scriptId}`);
        skipped += 1;
        continue;
      }

      const content = fs.readFileSync(fullPath, 'utf8');
      const previewSnippet = content.split('\n').slice(0, PREVIEW_LINES).join('\n');
      const relativePath = path.relative(ROOT, fullPath).split(path.sep).join('/');

      catalogModel.setScriptFile(packId, scriptId, { filePath: relativePath, fileExt: ext, previewSnippet });

      // Only add the initial changelog entry once — re-running this script
      // (e.g. after linking a newly generated file) shouldn't duplicate it.
      if (!existing.changelog || existing.changelog === '[]') {
        catalogModel.addChangelogEntry(packId, scriptId, { version: '1.0.0', notes: 'Initial release.' });
      }

      linked += 1;
    }
  }

  console.log(`Linked ${linked} script files. Skipped ${skipped} with no matching catalog row.`);
}

main();
