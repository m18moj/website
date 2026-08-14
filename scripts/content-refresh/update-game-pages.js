// Appends the 10 batch-2 scripts (ids 11-20) onto each games/game-*.html page's
// script-grid, and recomputes the pack total price shown in the page header
// and meta description. Idempotent: skips a game page if its grid already
// contains 20 script-card articles.
const fs = require('fs');
const path = require('path');

const manifest = require('./batch2-manifest.json');

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
  if (!scripts || scripts.length !== 10) {
    console.log(`SKIP ${packId}: manifest missing or not 10 entries`);
    skipped++;
    continue;
  }

  const filePath = path.join(__dirname, '..', '..', 'games', pageFile);
  let html = fs.readFileSync(filePath, 'utf8');

  const existingCount = (html.match(/class="script-card"/g) || []).length;
  if (existingCount >= 20) {
    console.log(`SKIP ${packId}: already has ${existingCount} script cards`);
    skipped++;
    continue;
  }
  if (existingCount !== 10) {
    console.log(`WARN ${packId}: expected 10 existing cards, found ${existingCount} — skipping to be safe`);
    skipped++;
    continue;
  }

  const newCards = scripts.map((s, i) => buildCard(existingCount + i + 1, s)).join('\n');

  const gridCloseMarker = /(\n)(        <\/div>\n        <div class="page-actions">)/;
  if (!gridCloseMarker.test(html)) {
    console.log(`WARN ${packId}: could not find script-grid close marker — skipping`);
    skipped++;
    continue;
  }
  html = html.replace(gridCloseMarker, `$1${newCards}\n$2`);

  // Recompute total pack price from every data-usd-price on a .script-price span.
  const priceMatches = [...html.matchAll(/class="script-price" data-usd-price="(\d+)"/g)];
  const total = priceMatches.reduce((sum, m) => sum + Number(m[1]), 0);

  html = html.replace(
    /(<p>\d+ scripts for .*?full pack price is <span data-usd-price=")\d+("\>\$)\d+(<\/span>\.<\/p>)/,
    (full, pre, mid, post) => `${pre}${total}${mid}${total}${post}`
  );
  // Fallback simpler pattern in case the sentence wording differs slightly.
  html = html.replace(
    /(page-header">[\s\S]*?full pack price is <span data-usd-price=")\d+("\>\$)\d+(<\/span>)/,
    (full, pre, mid, post) => `${pre}${total}${mid}${total}${post}`
  );
  // Bump the "10 scripts for" lead-in to "20 scripts for".
  html = html.replace(/(<p>)10( scripts for)/, `$1${scripts.length + 10}$2`);
  // Update meta description script count too.
  html = html.replace(/(content="[^"]*?)10( ready-to-use scripts)/, `$1${scripts.length + 10}$2`);

  fs.writeFileSync(filePath, html);
  console.log(`Updated ${packId}: 20 cards, total price $${total}`);
  updated++;
}

console.log(`\nDone. ${updated} pages updated, ${skipped} skipped.`);
