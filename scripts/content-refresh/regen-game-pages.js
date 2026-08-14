const fs = require('fs');
const path = require('path');
const SEED_CATALOG = require('../../server/seedCatalog.js');

const ROOT = path.join(__dirname, '..', '..');

const FILES = {
  apex: 'games/game-apex-legends.html',
  'call-of-duty': 'games/game-call-of-duty.html',
  fortnite: 'games/game-fortnite.html',
  'gta-v': 'games/game-gta-v.html',
  minecraft: 'games/game-minecraft.html',
  pubg: 'games/game-pubg.html',
  roblox: 'games/game-roblox.html',
  skyrim: 'games/game-skyrim.html',
  valorant: 'games/game-valorant.html'
};

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const gridRe = /<div class="container script-grid">[\s\S]*?<\/div>\s*(?=<div class="page-actions">)/;
const priceLineRe = /full pack price is <span data-usd-price="\d+">\$\d+<\/span>/;

let totalChanged = 0;
for (const [packId, file] of Object.entries(FILES)) {
  const pack = SEED_CATALOG.find((p) => p.packId === packId);
  if (!pack) { console.log('NO PACK', packId); continue; }

  const fullPath = path.join(ROOT, file);
  let content = fs.readFileSync(fullPath, 'utf8');

  const cardsHtml = pack.scripts.map((script, i) => {
    const n = i + 1;
    return `            <article class="script-card" data-script-id="${script.id}" data-script="${escapeHtml(script.title)}" data-price="${script.price}"><h3>${n}. ${escapeHtml(script.title)}</h3><p>${escapeHtml(script.description)}</p><div class="script-meta"><span>${escapeHtml(script.category)}</span><span class="script-price" data-usd-price="${script.price}">$${script.price}</span></div></article>`;
  }).join('\n');

  const gridHtml = `<div class="container script-grid">\n${cardsHtml}\n        </div>\n        `;

  if (!gridRe.test(content)) { console.log('GRID NOT MATCHED', file); continue; }
  content = content.replace(gridRe, gridHtml);

  const total = pack.scripts.reduce((sum, s) => sum + s.price, 0);
  if (priceLineRe.test(content)) {
    content = content.replace(priceLineRe, `full pack price is <span data-usd-price="${total}">$${total}</span>`);
  } else {
    console.log('PRICE LINE NOT MATCHED', file);
  }

  fs.writeFileSync(fullPath, content);
  totalChanged++;
}
console.log('Updated', totalChanged, 'game pages');
