// Generates the six "client" showcase pages (pages/client-<pack>.html) for
// the games with no legitimate live-game modding path (Apex, Call of Duty,
// Fortnite, PUBG, Roblox, Valorant). Each page is a desktop-app-styled
// browser of that pack's best scripts — purely cosmetic/organizational, it
// never connects to or modifies a running game.
//
// Script data is scraped straight out of the already-authoritative
// games/game-*.html pages (the same script-card markup update-game-pages.js
// writes) rather than duplicated into a second data file, so the two can
// never drift out of sync.
//
// NOTE: every string built here is assembled with array.join()/template
// literals and passed to fs.writeFileSync directly — never through
// String.prototype.replace() with a literal-but-$-containing replacement
// string, which is what corrupted the game pages earlier in this project
// (see fix-price-corruption.js for the postmortem).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

const GAMES = [
  {
    packId: 'apex',
    slug: 'apex',
    sourcePage: 'game-apex-legends.html',
    clientName: 'ForgeClient — Apex Legends Edition',
    displayName: 'Apex Legends',
    gradientClass: 'apex',
    techLine: 'Single-Player Unreal Engine 4/5 Prototypes (C#)'
  },
  {
    packId: 'call-of-duty',
    slug: 'call-of-duty',
    sourcePage: 'game-call-of-duty.html',
    clientName: 'ForgeClient — Call of Duty Edition',
    displayName: 'Call of Duty',
    gradientClass: 'cod',
    techLine: 'Single-Player Unreal Engine 4/5 Prototypes (C#)'
  },
  {
    packId: 'fortnite',
    slug: 'fortnite',
    sourcePage: 'game-fortnite.html',
    clientName: 'ForgeClient — Fortnite Edition',
    displayName: 'Fortnite',
    gradientClass: 'neon',
    techLine: 'Single-Player Unreal Engine 4/5 Prototypes (C#)'
  },
  {
    packId: 'pubg',
    slug: 'pubg',
    sourcePage: 'game-pubg.html',
    clientName: 'ForgeClient — PUBG Edition',
    displayName: 'PUBG',
    gradientClass: 'pubg',
    techLine: 'Single-Player Unreal Engine 4/5 Prototypes (C#)'
  },
  {
    packId: 'roblox',
    slug: 'roblox',
    sourcePage: 'game-roblox.html',
    clientName: 'ForgeClient — Roblox Edition',
    displayName: 'Roblox',
    gradientClass: 'ruin',
    techLine: 'Roblox Studio (Luau Scripts)'
  },
  {
    packId: 'valorant',
    slug: 'valorant',
    sourcePage: 'game-valorant.html',
    clientName: 'ForgeClient — Valorant Edition',
    displayName: 'Valorant',
    gradientClass: 'valorant',
    techLine: 'Single-Player Unreal Engine 4/5 Prototypes (C#)'
  }
];

const FEATURED_COUNT = 12;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractScripts(gamePageHtml) {
  const cardRe = /<article class="script-card" data-script-id="([^"]+)" data-script="([^"]+)" data-price="(\d+)"><h3>\d+\.\s*([^<]+)<\/h3><p>([^<]*)<\/p><div class="script-meta"><span>([^<]+)<\/span>/g;
  const scripts = [];
  let match;
  while ((match = cardRe.exec(gamePageHtml)) !== null) {
    scripts.push({
      id: match[1],
      title: match[4],
      description: match[5],
      category: match[6],
      price: Number(match[3])
    });
  }
  return scripts;
}

function pickFeatured(scripts) {
  const withIndex = scripts.map((s, i) => ({ ...s, originalIndex: i }));
  withIndex.sort((a, b) => b.price - a.price || a.originalIndex - b.originalIndex);
  return withIndex.slice(0, FEATURED_COUNT).sort((a, b) => a.originalIndex - b.originalIndex);
}

function buildScriptRow(script, index) {
  // title/description/category were scraped straight out of already-rendered
  // HTML (see extractScripts), so they're already HTML-escaped — running
  // them through escapeHtml() again here would double-escape entities like
  // "&amp;" into "&amp;amp;". Only fields authored fresh in this file (the
  // GAMES config) go through escapeHtml().
  const lines = [
    `                        <div class="client-script-row">`,
    `                            <span class="client-script-index">${String(index).padStart(2, '0')}</span>`,
    `                            <div class="client-script-info"><strong>${script.title}</strong><p>${script.description}</p></div>`,
    `                            <span class="client-script-category">${script.category}</span>`,
    `                            <span class="client-script-price">$${script.price}</span>`,
    `                        </div>`
  ];
  return lines.join('\n');
}

function buildPage(game, featured, totalCount) {
  const scriptRows = featured.map((s, i) => buildScriptRow(s, i + 1)).join('\n');
  const gamePageHref = `../games/${game.sourcePage.replace(/\.html$/, '')}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Browse the ${escapeHtml(game.displayName)} pack in ForgeClient, a desktop-app-styled preview of the ${featured.length} best scripts in the pack.">
    <title>${escapeHtml(game.displayName)} Client Preview | ScripForge</title>
    <link rel="icon" type="image/svg+xml" href="../favicon.svg">
    <link rel="stylesheet" href="../css/styles.css">
    <link rel="stylesheet" href="../css/client.css">
    <script src="../js/theme.js"></script>
    <script src="../js/error-reporter.js"></script>
</head>
<body data-root-prefix="../">
    <nav class="navbar" id="navbar">
        <div class="nav-container">
            <a href="/" class="nav-logo">
                <svg class="logo-icon" viewBox="0 0 40 40">
                    <rect x="5" y="5" width="12" height="12" fill="#00d9ff"/>
                    <rect x="23" y="5" width="12" height="12" fill="#a855f7"/>
                    <rect x="5" y="23" width="12" height="12" fill="#a855f7"/>
                    <rect x="23" y="23" width="12" height="12" fill="#00d9ff"/>
                </svg>
                ScripForge
            </a>
            <div class="nav-menu" id="navMenu">
                <a href="/" class="nav-link">Home</a>
                <a href="games" class="nav-link">Games</a>
                <a href="catalog" class="nav-link">Catalog</a>
                <a href="https://discord.gg/Hr69adj2My" target="_blank" rel="noreferrer" class="nav-link">Discord</a>
            </div>
            <div class="nav-actions">
                <span id="authControl" class="auth-control"></span>
                <a href="checkout" class="cart-btn" aria-label="View basket">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="9" cy="21" r="1"></circle>
                        <circle cx="20" cy="21" r="1"></circle>
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                    </svg>
                    <span class="cart-count">0</span>
                </a>
                <button class="mobile-toggle" id="mobileToggle" aria-label="Toggle menu">
                    <span></span>
                    <span></span>
                    <span></span>
                </button>
            </div>
        </div>
    </nav>

    <main class="page-shell">
        <div class="container breadcrumbs" aria-label="Breadcrumb">
            <a href="/">Home</a> / <a href="games">Games</a> / <a href="${gamePageHref}">${escapeHtml(game.displayName)}</a> / <span>Client Preview</span>
        </div>

        <div class="page-header">
            <p class="eyebrow">${escapeHtml(game.displayName)} Client Preview</p>
            <h1>ForgeClient</h1>
            <p class="tech-stack"><strong>Built for:</strong> ${escapeHtml(game.techLine)}</p>
            <p>A desktop-app-styled way to browse the ${featured.length} standout scripts in the ${escapeHtml(game.displayName)} pack before you buy. It's a preview and organizer for the source files — it doesn't connect to or run alongside ${escapeHtml(game.displayName)} itself.</p>
        </div>

        <div class="container">
            <div class="client-shell">
                <div class="client-titlebar game-cover-art ${game.gradientClass}">
                    <div class="client-titlebar-dots"><span></span><span></span><span></span></div>
                    <div class="client-titlebar-name">${escapeHtml(game.clientName)}</div>
                </div>
                <div class="client-body">
                    <nav class="client-sidebar" aria-label="Client panels">
                        <p class="client-sidebar-heading">Panels</p>
                        <button type="button" class="client-tab active" data-tab-target="clientPanelScripts">Scripts (${featured.length})</button>
                        <button type="button" class="client-tab" data-tab-target="clientPanelAbout">About</button>
                    </nav>
                    <div>
                        <section id="clientPanelScripts" class="client-panel">
                            <div class="client-panel-heading">
                                <h2>Featured scripts</h2>
                                <span>Showing ${featured.length} of ${totalCount} in the full pack</span>
                            </div>
                            <div class="client-script-list">
${scriptRows}
                            </div>
                        </section>
                        <section id="clientPanelAbout" class="client-panel" hidden>
                            <div class="client-panel-heading">
                                <h2>About this pack</h2>
                            </div>
                            <div class="client-about-text">
                                <p><strong>${escapeHtml(game.displayName)} Pack</strong> is a collection of ${totalCount} standalone source scripts covering movement, combat, progression, and UI systems inspired by the genre. Every script is real, working source code with a version number and changelog — not pseudocode.</p>
                                <p>This client is a preview and organizer, not a mod loader or injector. It lists what's in the pack and links out to the full catalog page and checkout — it never reads from, writes to, or connects to a running game process.</p>
                                <p>Full pack details, pricing, and the complete script list are on the <a href="${gamePageHref}">${escapeHtml(game.displayName)} pack page</a>.</p>
                            </div>
                        </section>
                    </div>
                </div>
                <div class="client-statusbar">
                    <span>ForgeClient v1.0.0</span>
                    <span>${totalCount} scripts in pack &middot; preview shows top ${featured.length}</span>
                </div>
            </div>
            <p class="client-notice">Preview only — ForgeClient organizes and previews the source files in this pack. It does not connect to, inject into, or modify ${escapeHtml(game.displayName)} or any other running game.</p>
        </div>

        <div class="page-actions container">
            <a href="${gamePageHref}" class="btn btn-primary">View full pack &amp; buy</a>
            <a href="catalog" class="btn btn-secondary">Browse catalog</a>
        </div>
    </main>

    <footer class="site-footer">
        <div class="container footer-grid">
            <div class="footer-brand">
                <a href="/" class="footer-logo">
                    <svg class="logo-icon" viewBox="0 0 40 40">
                        <rect x="5" y="5" width="12" height="12" fill="#00d9ff"/>
                        <rect x="23" y="5" width="12" height="12" fill="#a855f7"/>
                        <rect x="5" y="23" width="12" height="12" fill="#a855f7"/>
                        <rect x="23" y="23" width="12" height="12" fill="#00d9ff"/>
                    </svg>
                    ScripForge
                </a>
                <p>Premium, production-ready game systems for developers, indies, and studios.</p>
                <div class="footer-socials">
                    <a href="https://discord.gg/Hr69adj2My" target="_blank" rel="noreferrer" aria-label="Discord">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.061 0a.073.073 0 0 1 .078.01c.12.099.246.197.373.291a.077.077 0 0 1-.006.128c-.598.35-1.22.645-1.873.892a.076.076 0 0 0-.04.106c.36.698.772 1.362 1.225 1.994a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.057c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028z"/></svg>
                    </a>
                    <a href="https://www.youtube.com" target="_blank" rel="noreferrer" aria-label="YouTube">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3.02 3.02 0 0 0-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.56A3.02 3.02 0 0 0 .5 6.2 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.8 3.02 3.02 0 0 0 2.12 2.14c1.88.56 9.38.56 9.38.56s7.5 0 9.38-.56a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.8zM9.6 15.6V8.4l6.4 3.6-6.4 3.6z"/></svg>
                    </a>
                </div>
            </div>
            <div class="footer-col">
                <h4>Shop</h4>
                <a href="../pages/games">Games</a>
                <a href="../pages/catalog">Catalog</a>
                <a href="../pages/checkout">Basket</a>
            </div>
            <div class="footer-col">
                <h4>Account</h4>
                <a href="../pages/login">Sign in</a>
                <a href="../pages/register">Create account</a>
                <a href="../pages/account">My orders</a>
            </div>
            <div class="footer-col">
                <h4>Support</h4>
                <a href="https://discord.gg/Hr69adj2My" target="_blank" rel="noreferrer">Discord community</a>
                <a href="../pages/privacy">Privacy policy</a>
            </div>
        </div>
        <div class="container footer-bottom">
            <p>&copy; <span id="footerYear"></span> ScripForge. All rights reserved.</p>
            <p>Built for developers, by developers.</p>
        </div>
    </footer>

    <script src="../js/site.js"></script>
    <script src="../js/auth.js"></script>
    <script src="../js/currency.js"></script>
    <script src="../js/site-flags.js"></script>
    <script src="../js/search.js"></script>
    <script src="../js/client.js"></script>
</body>
</html>
`;
}

let built = 0;
for (const game of GAMES) {
  const sourcePath = path.join(ROOT, 'games', game.sourcePage);
  const sourceHtml = fs.readFileSync(sourcePath, 'utf8');
  const scripts = extractScripts(sourceHtml);
  if (scripts.length === 0) {
    console.log(`SKIP ${game.packId}: no scripts extracted from ${game.sourcePage}`);
    continue;
  }
  const featured = pickFeatured(scripts);
  const html = buildPage(game, featured, scripts.length);
  const outPath = path.join(ROOT, 'pages', `client-${game.slug}.html`);
  fs.writeFileSync(outPath, html);
  console.log(`Built pages/client-${game.slug}.html — ${featured.length}/${scripts.length} scripts featured`);
  built++;
}

console.log(`\nDone. ${built}/${GAMES.length} client pages built.`);
