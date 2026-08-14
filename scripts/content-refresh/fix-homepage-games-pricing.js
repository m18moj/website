// Fixes two pages that were missed by update-game-pages.js: index.html's
// "Popular Game Libraries" teaser grid and pages/games.html's game library
// grid. Both still showed "10 scripts" and the old (pre-batch-2) pack total
// price for every game. This script updates both the script count and the
// price for each game card to match the real, current 20-script pack totals.
//
// Uses replacer FUNCTIONS (not string replacements) throughout — a plain
// string replacement containing "$<digit>" text got misread as a regex
// backreference earlier in this project and corrupted several pages; see
// fix-price-corruption.js for the postmortem. Functions sidestep that class
// of bug entirely.
const fs = require('fs');
const path = require('path');

const NEW_TOTALS = {
  APEX: 52,
  'CALL OF DUTY': 61,
  COD: 61,
  FORTNITE: 51,
  'GTA V': 62,
  MINECRAFT: 57,
  PUBG: 56,
  ROBLOX: 60,
  SKYRIM: 53,
  VALORANT: 49
};

const files = [
  path.join(__dirname, '..', '..', 'index.html'),
  path.join(__dirname, '..', '..', 'pages', 'games.html')
];

// Matches one game-card block and captures its data-game value plus the
// "10 scripts" / price span so each card can be fixed independently of
// card order (index.html and pages/games.html don't list games in the same
// order as the manifest, so a purely positional fix would be fragile).
const cardRe = /(data-game="([^"]+)"[\s\S]{0,400}?<span>)10( scripts<\/span>\s*<span data-usd-price=")(\d+)("\s*data-price-suffix="[^"]*">\$)(\d+)( pack<\/span>)/g;

for (const filePath of files) {
  let html = fs.readFileSync(filePath, 'utf8');
  let fixed = 0;
  let missing = [];

  html = html.replace(cardRe, (full, pre, gameKey, mid1, oldPrice, mid2, oldPriceText, suffix) => {
    const total = NEW_TOTALS[gameKey];
    if (total === undefined) {
      missing.push(gameKey);
      return full;
    }
    fixed++;
    return `${pre}20${mid1}${total}${mid2}${total}${suffix}`;
  });

  if (missing.length) {
    console.log(`${path.basename(filePath)}: no price mapping for: ${missing.join(', ')}`);
  }

  fs.writeFileSync(filePath, html);
  console.log(`${path.basename(filePath)}: fixed ${fixed} game card(s)`);
}
