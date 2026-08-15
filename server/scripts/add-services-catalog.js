// One-time seed script: adds the new Services line (Discord Bots, Websites,
// SMM) to the live catalog as three ordinary packs, using the exact same
// createPack/createScript path the admin dashboard uses — so pricing,
// checkout, and the /catalog page all pick them up with zero other backend
// changes. Writes a manifest of the exact ids the database assigned
// (createScript slugifies titles itself) so the hand-authored
// services/service-*.html pages can reference the right data-script-id.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const catalogModel = require('../models/catalog');
const db = require('../db');

const PACKS = [
  {
    packName: 'Discord Bots',
    gameTitle: 'Discord Bots',
    genre: 'bots',
    splash: 'bots',
    description: 'Custom Discord bots built and configured for your server — pick the modules you need.',
    detailUrl: 'services/service-discord-bots',
    scripts: [
      { title: 'Moderation & Auto-Mod Suite', price: 45, category: 'Moderation', description: 'Custom auto-mod filters, warn/mute/ban logging, spam and raid protection, and a full moderation case history.' },
      { title: 'Ticket & Support System', price: 40, category: 'Support', description: 'Category-based ticket panel, staff claiming, transcripts, and auto-close on inactivity.' },
      { title: 'Leveling & XP Economy', price: 35, category: 'Engagement', description: 'Message and voice XP curves, level-up role rewards, a server leaderboard, and a currency shop.' },
      { title: 'Welcome & Verification Flow', price: 30, category: 'Onboarding', description: 'Captcha or reaction verification, custom welcome cards, and automatic role assignment on join.' },
      { title: 'Music & Voice Utility Bot', price: 38, category: 'Voice', description: 'Queue management, playlists, and voice-channel utility commands for community listening sessions.' },
      { title: 'Custom Slash Command Pack', price: 32, category: 'Custom', description: 'A set of bespoke slash commands built to your spec, from utility tools to mini-games.' },
      { title: 'Reaction Roles & Self-Assign Panel', price: 22, category: 'Roles', description: 'Button or reaction based role menus so members can self-assign roles without staff involvement.' },
      { title: 'Logging & Analytics Dashboard', price: 34, category: 'Analytics', description: 'Message, join/leave, and edit/delete logging piped into a channel, plus a lightweight server analytics view.' }
    ]
  },
  {
    packName: 'Websites',
    gameTitle: 'Websites',
    genre: 'web',
    splash: 'webdev',
    description: 'Design and development for landing pages, business sites, storefronts, and web apps.',
    detailUrl: 'services/service-websites',
    scripts: [
      { title: 'Landing Page Build', price: 150, category: 'Marketing Site', description: "A single-page, responsive marketing site with a hero, feature sections, and a working contact form." },
      { title: 'Business Website (5-Page)', price: 350, category: 'Business', description: 'Home, about, services, portfolio, and contact pages, built responsive and easy for you to update.' },
      { title: 'E-Commerce Storefront', price: 600, category: 'E-Commerce', description: 'A full storefront with product catalog, cart, and checkout integration ready to take real orders.' },
      { title: 'Portfolio / Personal Site', price: 120, category: 'Portfolio', description: 'A clean project showcase with resume, case studies, and contact details for freelancers and creators.' },
      { title: 'Discord Bot Web Dashboard', price: 280, category: 'Web App', description: "A web control panel for configuring your Discord bot's settings without touching commands." },
      { title: 'Blog / CMS Setup', price: 200, category: 'Content', description: 'A content-managed blog with categories, tags, and an admin editor so you can publish without a developer.' },
      { title: 'Web App MVP Build', price: 750, category: 'Web App', description: 'A custom web application with authentication, a database, and the core logic your idea needs to launch.' },
      { title: 'SEO & Performance Optimization', price: 90, category: 'Optimization', description: 'A full audit and fix pass covering page speed, meta tags, structured data, and mobile performance.' }
    ]
  },
  {
    packName: 'SMM Services',
    gameTitle: 'SMM Services',
    genre: 'marketing',
    splash: 'smm',
    description: 'Social media management and growth packages for Instagram, TikTok, Twitter/X, and YouTube.',
    detailUrl: 'services/service-smm',
    scripts: [
      { title: 'Instagram Growth Package', price: 80, category: 'Instagram', description: 'A 30-day content calendar, growth strategy, and engagement push tailored to your niche.' },
      { title: 'TikTok Content & Growth Package', price: 85, category: 'TikTok', description: 'Short-form content strategy, posting schedule, and trend-driven growth tactics for 30 days.' },
      { title: 'Twitter/X Management', price: 70, category: 'Twitter/X', description: 'Daily post drafting, engagement replies, and thread strategy to grow an active following.' },
      { title: 'YouTube Channel Growth', price: 95, category: 'YouTube', description: 'SEO-optimized titles and descriptions, thumbnail design, and an upload schedule built for discovery.' },
      { title: 'Full Social Media Management', price: 220, category: 'Multi-Platform', description: 'Cross-platform strategy and posting across Instagram, TikTok, and Twitter/X under one coordinated plan.' },
      { title: 'Social Media Content Design Pack', price: 60, category: 'Design', description: 'Twenty branded, on-theme graphic templates ready to post across your social channels.' },
      { title: 'Paid Ad Campaign Setup', price: 130, category: 'Advertising', description: 'Ad creative, audience targeting, and conversion tracking set up for Meta or TikTok Ads.' },
      { title: 'Brand Strategy & Content Calendar', price: 75, category: 'Strategy', description: 'A one-time brand voice and positioning pass plus a ready-to-use 30-day content calendar.' }
    ]
  }
];

function main() {
  const manifest = {};
  const setSplash = db.prepare('UPDATE packs SET splash = ? WHERE id = ?');

  for (const packDef of PACKS) {
    const existing = catalogModel.listAll({ includeHidden: true }).find((p) => p.packName === packDef.packName);
    if (existing) {
      console.log(`SKIP (already exists): ${packDef.packName} -> ${existing.packId}`);
      manifest[existing.packId] = existing.scripts.map((s) => ({ id: s.id, title: s.title }));
      continue;
    }

    const pack = catalogModel.createPack({
      packName: packDef.packName,
      gameTitle: packDef.gameTitle,
      genre: packDef.genre,
      description: packDef.description,
      detailUrl: packDef.detailUrl
    });
    setSplash.run(packDef.splash, pack.packId);
    console.log(`Created pack ${pack.packId} — "${packDef.packName}"`);

    manifest[pack.packId] = [];
    for (const script of packDef.scripts) {
      const updated = catalogModel.createScript(pack.packId, script);
      const created = updated.scripts.find((s) => s.title === script.title);
      manifest[pack.packId].push({ id: created.id, title: created.title, price: created.price });
      console.log(`  + ${pack.packId}/${created.id} — "${created.title}" ($${created.price})`);
    }
  }

  const manifestPath = path.join(__dirname, '..', '..', 'scripts', 'content-refresh', 'services-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nWrote manifest to ${manifestPath}`);
}

main();
