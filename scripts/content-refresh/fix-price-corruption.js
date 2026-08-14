// Repairs corruption introduced by update-game-pages.js: that script's first
// html.replace() call passed a STRING replacement built from a template
// literal that happened to contain literal "$2" substrings (from "$2</span>"
// price displays). String.prototype.replace treats "$2" in a *string*
// replacement as a backreference to capture group 2 when the regex has that
// many groups, so every "$2" inside an inserted card's price span got
// swapped for the literal text of capture group 2 (the real grid-closing
// "</div>\n<div class=\"page-actions\">" markup), corrupting the DOM.
//
// Fix: find every corrupted occurrence and put the literal "$2" back.
const fs = require('fs');
const path = require('path');

const files = [
  'game-apex-legends.html',
  'game-call-of-duty.html',
  'game-fortnite.html',
  'game-gta-v.html',
  'game-minecraft.html',
  'game-pubg.html',
  'game-roblox.html',
  'game-skyrim.html',
  'game-valorant.html'
].map((f) => path.join(__dirname, '..', '..', 'games', f));

const corruption = /data-usd-price="2">        <\/div>\n        <div class="page-actions">(<\/span>)/g;

for (const filePath of files) {
  let html = fs.readFileSync(filePath, 'utf8');
  const count = (html.match(corruption) || []).length;
  if (count === 0) {
    console.log(`${path.basename(filePath)}: no corruption found`);
    continue;
  }
  html = html.replace(corruption, (full, closingSpan) => `data-usd-price="2">$2${closingSpan}`);
  fs.writeFileSync(filePath, html);
  console.log(`${path.basename(filePath)}: fixed ${count} corrupted price span(s)`);
}
