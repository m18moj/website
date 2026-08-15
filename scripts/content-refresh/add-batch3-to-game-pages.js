// Appends the batch-3 scripts (a random 3-8 per pack, see batch3-manifest.json)
// onto each games/game-*.html page's script-grid, and recomputes the pack
// total price and script counts shown in the page header and meta
// description. Unlike update-game-pages.js (which assumed a fixed +10),
// this reads the per-pack count straight from the manifest since batch 3
// varies game to game. Idempotent: skips a game page whose grid already
// contains every batch-3 script id.
const fs = require('fs');
const path = require('path');

const manifest = require('./batch3-manifest.json');

const PAGE_FOR_PACK = {
  apex: 'game-apex-legends.html',
  'call-of-duty': 'game-call-of-duty.html',
  fortnite: 'game-fortnite.html',
  'gta-v': 'game-gta-v.html',
  minecraft: 'game-minecraft.html',
  pubg: 'game-pubg.html',
  roblox: 'game-roblox.html',
  skyrim: 'game-skyrim.html',
  valorant: 'game-valorant.html'
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildCard(index, script) {
  const title = escapeHtml(script.title);
  const desc = escapeHtml(script.description);
  const category = escapeHtml(script.category);
  const price = script.price;
  return `            <article class="script-card" data-script-id="${script.id}" data-script="${title}" data-price="${price}"><h3>${index}. ${title}</h3><p>${desc}</p><div class="script-meta"><span>${category}</span><span class="script-price" data-usd-price="${price}">$${price}</span></div></article>`;
}

let updated = 0;
let skipped = 0;

for (const [packId, pageFile] of Object.entries(PAGE_FOR_PACK)) {
  const scripts = manifest[packId];
  if (!scripts || scripts.length === 0) {
    console.log(`SKIP ${packId}: no batch-3 scripts in manifest`);
    skipped++;
    continue;
  }

  const filePath = path.join(__dirname, '..', '..', 'games', pageFile);
  let html = fs.readFileSync(filePath, 'utf8');

  const alreadyPresent = scripts.every((s) => html.includes(`data-script-id="${s.id}"`));
  if (alreadyPresent) {
    console.log(`SKIP ${packId}: batch-3 scripts already present`);
    skipped++;
    continue;
  }

  const existingCount = (html.match(/class="script-card"/g) || []).length;
  const newCards = scripts.map((s, i) => buildCard(existingCount + i + 1, s)).join('\n');

  const gridCloseMarker = /(\n)(        <\/div>\n        <div class="page-actions">)/;
  if (!gridCloseMarker.test(html)) {
    console.log(`WARN ${packId}: could not find script-grid close marker — skipping`);
    skipped++;
    continue;
  }
  html = html.replace(gridCloseMarker, `$1${newCards}\n$2`);

  const newTotalCount = existingCount + scripts.length;

  // Recompute total pack price from every data-usd-price on a .script-price span.
  const priceMatches = [...html.matchAll(/class="script-price" data-usd-price="(\d+)"/g)];
  const total = priceMatches.reduce((sum, m) => sum + Number(m[1]), 0);

  // The lead-in sentence's wording between the count and "full pack price is"
  // varies per game ("20 scripts for...", "20 scripts built for...", "20
  // production-ready scripts for...", "20 Roblox Studio scripts for..."), so
  // match generically on the leading number and the fixed price-line tail
  // rather than assuming a specific phrase in between.
  const leadInRe = /<p>(\d+)([\s\S]*?full pack price is <span data-usd-price=")\d+("\>\$)\d+(<\/span>\.<\/p>)/;
  if (leadInRe.test(html)) {
    html = html.replace(leadInRe, (full, count, mid, mid2, tail) => `<p>${newTotalCount}${mid}${total}${mid2}${total}${tail}`);
  } else {
    console.log(`WARN ${packId}: lead-in/price sentence not matched — price/count text not updated`);
  }

  // Meta description similarly varies ("N ready-to-use scripts", "N
  // ready-to-use Roblox Studio scripts") — just bump the digits before
  // "ready-to-use" wherever they land.
  html = html.replace(/(\d+)(\s+ready-to-use)/, `${newTotalCount}$2`);

  fs.writeFileSync(filePath, html);
  console.log(`Updated ${packId}: ${newTotalCount} cards, total price $${total}`);
  updated++;
}

console.log(`\nDone. ${updated} pages updated, ${skipped} skipped.`);
