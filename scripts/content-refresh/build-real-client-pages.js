// Generates the three "real client" info pages (pages/client-<pack>.html) for
// GTA V, Skyrim, and Minecraft — the three games with a genuine, sanctioned
// modding/scripting path. Unlike the six cosmetic ForgeClient previews (built
// by build-client-pages.js), these describe real, working code that ships in
// generated-clients/<packId>/ in this repo: a GTA V NativeUI-style in-game
// menu (Script Hook V .NET), a Skyrim SkyUI MCM menu, and a standalone Java
// Swing Minecraft plugin manager.
//
// Reuses the same .client-shell CSS as the cosmetic pages for a consistent
// look, but swaps the "Scripts" tab for a "Components" tab (real file list)
// and adds an "Install" tab (condensed from each client's own README.md).
//
// Same safety note as build-client-pages.js: strings are assembled with
// array.join()/template literals and written directly, never passed through
// String.prototype.replace() with a $-containing replacement string.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CLIENTS = [
  {
    packId: 'gta-v',
    slug: 'gta-v',
    sourcePage: 'game-gta-v.html',
    displayName: 'GTA V',
    gradientClass: 'gta',
    clientName: 'ForgeClient — GTA V NativeUI Menu',
    techLine: 'Script Hook V .NET (single-player only)',
    intro: 'A real, working in-game settings menu for the GTA V pack. Press F9 to open it, then toggle any of the pack’s features live — no file editing required. Built entirely on Script Hook V .NET, the same sanctioned single-player modding path thousands of GTA V mods use.',
    components: [
      { file: 'ForgeClientMenu.cs', desc: 'The in-game menu itself — navigation, submenus for Weather/Parachute/Wanted Level, and the toggle logic for 12 pack features.' },
      { file: 'ForgeClientConfig.cs', desc: 'Shared static config class the menu reads and writes, and the documented hook point for wiring a pack script into the menu.' },
      { file: 'README.md', desc: 'Full install and usage instructions, included with the download.' }
    ],
    install: [
      'Install Script Hook V and Script Hook V .NET (SHVDN) into your GTA V folder — both are third-party community tools, not made by ScripForge.',
      'Copy ForgeClientMenu.cs and ForgeClientConfig.cs into your GTA V install’s Scripts folder.',
      'Copy every .cs file from your purchased GTA V pack into that same Scripts folder.',
      'Launch GTA V into single-player story mode — SHVDN compiles and loads everything automatically, no separate build step.',
      'Press F9 in-game to open the menu.'
    ],
    disclaimer: 'For single-player use only. Do not use in GTA Online — modifying GTA Online can get your account banned and violates Rockstar’s terms of service.'
  },
  {
    packId: 'skyrim',
    slug: 'skyrim',
    sourcePage: 'game-skyrim.html',
    displayName: 'Skyrim',
    gradientClass: 'skyrim',
    clientName: 'ForgeClient — SkyUI MCM Menu',
    techLine: 'SkyUI Mod Configuration Menu (MCM)',
    intro: 'A real Mod Configuration Menu for the Skyrim pack, built the standard way thousands of Skyrim mods expose settings: on Bethesda’s own Creation Kit / Papyrus scripting language and SkyUI’s documented SKI_ConfigBase API. Four in-game pages of toggles, sliders, and dropdowns tied to real scripts in the pack.',
    components: [
      { file: 'ForgeClientMCM.psc', desc: 'The MCM menu’s Papyrus source — four pages covering 10 of the pack’s scripts (follower caps, bounty values, legendary skill thresholds, merchant restock timing, and more).' },
      { file: 'ForgeClientMCM_MCM.ini', desc: 'Metadata SkyUI’s MCM system reads to list the mod and its pages in the in-game menu.' },
      { file: 'README.md', desc: 'Full install and compile instructions, included with the download.' }
    ],
    install: [
      'Install SKSE and SkyUI first — both are required by any MCM menu, not just this one.',
      'Compile ForgeClientMCM.psc to ForgeClientMCM.pex using the Creation Kit’s Papyrus Compiler (a .psc alone will not run in-game — see the README for the exact command).',
      'Place the compiled .pex in Data\\Scripts\\, the .ini in Data\\MCM\\Config\\ForgeClientMCM\\, and attach the script to an always-running quest via the Creation Kit.',
      'Launch Skyrim through SKSE, not the vanilla launcher.',
      'Open the pause menu (Esc) and select the Mod Configuration tab to find "ScripForge Client".'
    ],
    disclaimer: 'Requires compiling the included .psc source with the Creation Kit before it will run — this is normal for all Papyrus mods, not specific to ScripForge. Full steps are in the README.'
  },
  {
    packId: 'minecraft',
    slug: 'minecraft',
    sourcePage: 'game-minecraft.html',
    displayName: 'Minecraft',
    gradientClass: 'arcane',
    clientName: 'ForgeClient Plugin Manager',
    techLine: 'Standalone Java Swing desktop app',
    intro: 'A real, compilable desktop application for managing the Bukkit/Spigot/Paper plugin JARs you build from the Minecraft pack’s source files. It lists plugins in your server’s plugins folder, reads their plugin.yml metadata, and lets you enable/disable them with one click. It never connects to or modifies a running server — it only manages files on disk.',
    components: [
      { file: 'PluginManagerApp.java', desc: 'Entry point — launches the Swing UI on the event dispatch thread.' },
      { file: 'MainWindow.java', desc: 'The main window: toolbar, plugin table, and status bar, with every button wired to real logic.' },
      { file: 'PluginScanner.java / PluginActions.java / PluginInfo.java', desc: 'Real plugin.yml parsing (via java.util.zip, no extra dependencies), and the enable/disable/open-folder actions.' },
      { file: 'README.md', desc: 'Full compile and run instructions, included with the download.' }
    ],
    install: [
      'Install a JDK, version 11 or newer (built and tested against JDK 17).',
      'From the generated-clients/minecraft/ folder, compile: javac -d out src/com/scripforge/pluginmanager/*.java',
      'Run it: java -cp out com.scripforge.pluginmanager.PluginManagerApp',
      'Click "Open Plugins Folder..." and point it at your server’s plugins/ directory.',
      'Compile the pack’s .java scripts into JARs yourself (e.g. with Maven/Gradle against the Spigot/Paper API) and drop them into that folder to manage them here.'
    ],
    disclaimer: 'This tool manages plugin JAR files on disk. It does not connect to, start, stop, or inject code into a running Minecraft server.'
  }
];

function buildComponentRow(c) {
  return [
    `                        <div class="client-script-row">`,
    `                            <span class="client-script-index">&#8226;</span>`,
    `                            <div class="client-script-info"><strong>${escapeHtml(c.file)}</strong><p>${escapeHtml(c.desc)}</p></div>`,
    `                            <span class="client-script-category">Real file</span>`,
    `                            <span></span>`,
    `                        </div>`
  ].join('\n');
}

function buildInstallList(steps) {
  return steps.map((s) => `                                <li>${escapeHtml(s)}</li>`).join('\n');
}

function buildPage(client) {
  const componentRows = client.components.map(buildComponentRow).join('\n');
  const installSteps = buildInstallList(client.install);
  const gamePageHref = `../games/${client.sourcePage.replace(/\.html$/, '')}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${escapeHtml(client.clientName)}: a real, working client for the ${escapeHtml(client.displayName)} pack, built on ${escapeHtml(client.techLine)}.">
    <title>${escapeHtml(client.displayName)} Client | ScripForge</title>
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
            <a href="/">Home</a> / <a href="games">Games</a> / <a href="${gamePageHref}">${escapeHtml(client.displayName)}</a> / <span>Client</span>
        </div>

        <div class="page-header">
            <p class="eyebrow">${escapeHtml(client.displayName)} Client</p>
            <h1>${escapeHtml(client.clientName)}</h1>
            <p class="tech-stack"><strong>Built on:</strong> ${escapeHtml(client.techLine)}</p>
            <p>${escapeHtml(client.intro)}</p>
        </div>

        <div class="container">
            <div class="client-shell">
                <div class="client-titlebar game-cover-art ${client.gradientClass}">
                    <div class="client-titlebar-dots"><span></span><span></span><span></span></div>
                    <div class="client-titlebar-name">${escapeHtml(client.clientName)}</div>
                </div>
                <div class="client-body">
                    <nav class="client-sidebar" aria-label="Client panels">
                        <p class="client-sidebar-heading">Panels</p>
                        <button type="button" class="client-tab active" data-tab-target="clientPanelScripts">Components</button>
                        <button type="button" class="client-tab" data-tab-target="clientPanelAbout">Install</button>
                    </nav>
                    <div>
                        <section id="clientPanelScripts" class="client-panel">
                            <div class="client-panel-heading">
                                <h2>What's in the download</h2>
                                <span>Real, working files</span>
                            </div>
                            <div class="client-script-list">
${componentRows}
                            </div>
                        </section>
                        <section id="clientPanelAbout" class="client-panel" hidden>
                            <div class="client-panel-heading">
                                <h2>Install steps</h2>
                            </div>
                            <div class="client-about-text">
                                <ol style="padding-left: 1.2rem; display: flex; flex-direction: column; gap: 0.6rem;">
${installSteps}
                                </ol>
                                <p style="margin-top: 1rem;">Full step-by-step instructions, troubleshooting, and requirements ship in this client's own README.md alongside the code.</p>
                            </div>
                        </section>
                    </div>
                </div>
                <div class="client-statusbar">
                    <span>ForgeClient v1.0.0</span>
                    <span>${client.components.length} files &middot; real, working code</span>
                </div>
            </div>
            <p class="client-notice">${escapeHtml(client.disclaimer)}</p>
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
for (const client of CLIENTS) {
  const html = buildPage(client);
  const outPath = path.join(ROOT, 'pages', `client-${client.slug}.html`);
  fs.writeFileSync(outPath, html);
  console.log(`Built pages/client-${client.slug}.html`);
  built++;
}
console.log(`\nDone. ${built}/${CLIENTS.length} real client pages built.`);
