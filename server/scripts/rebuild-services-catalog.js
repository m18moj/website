// Replaces the flat a-la-carte Services catalog (add-services-catalog.js)
// with a tiered plan + add-on structure: one plan tier is the base purchase
// (more expensive tiers unlock more included features), and any number of
// add-ons can be ticked alongside it. Reuses the same createScript path
// everything else in the catalog uses — only the shape of what's being sold
// changes, not the underlying commerce code.
//
// Safe to re-run: deletes every existing script under the three service
// packs first, then recreates them from PACKS below, so this always leaves
// the live catalog matching this file exactly.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const catalogModel = require('../models/catalog');
const db = require('../db');

const PACKS = {
  'discord-bots': {
    description: 'Custom Discord bots built and configured for your server — pick a plan, then add anything extra you need.',
    scripts: [
      { title: 'Starter Bot', price: 25, category: 'Plan', description: 'Verification & welcome flow, basic moderation (spam and word filters, warnings), and 1 custom slash command.' },
      { title: 'Growth Bot', price: 65, category: 'Plan', description: 'Everything in Starter, plus a full ticket support system, a reaction-role panel, and leveling & XP economy. Up to 10 custom slash commands.' },
      { title: 'Elite Bot', price: 130, category: 'Plan', description: 'Everything in Growth, plus the full auto-mod suite, music & voice utilities, and a logging/analytics dashboard. Unlimited custom slash commands.' },
      { title: 'Multi-Server License', price: 25, category: 'Add-on', description: 'Deploy the same bot configuration to a second Discord server.' },
      { title: 'Custom API / Webhook Integration', price: 40, category: 'Add-on', description: 'Connect the bot to an external API, database, or webhook — a game server, CRM, spreadsheet, anything with an endpoint.' },
      { title: 'Rush Delivery (48 Hours)', price: 30, category: 'Add-on', description: 'Move your build to the front of the queue.' },
      { title: '3 Months of Edits & Tweaks', price: 20, category: 'Add-on', description: 'Follow-up tweaks and small feature changes for 3 months after delivery.' }
    ]
  },
  websites: {
    description: 'Design and development for landing pages, business sites, and storefronts — pick a plan, then add hosting and extras.',
    scripts: [
      { title: 'Starter Site', price: 150, category: 'Plan', description: '1–3 page responsive site, a working contact form, mobile-optimized, and basic on-page SEO.' },
      { title: 'Business Site', price: 400, category: 'Plan', description: 'Everything in Starter, up to 8 pages, CMS-editable content, a blog setup, analytics integration, and advanced SEO.' },
      { title: 'Pro / E-Commerce Site', price: 800, category: 'Plan', description: 'Everything in Business, unlimited pages, full e-commerce (cart, checkout, payments), a custom admin dashboard, and priority support.' },
      { title: 'Hosting (Annual)', price: 60, category: 'Hosting', description: 'Keeps your site live year-round on our infrastructure. Starting price shown — final cost depends on your desired domain name and TLD, confirmed in your ticket. Tell us the domain you want in your order notes at checkout.' },
      { title: 'Extra Page Pack (+5 Pages)', price: 75, category: 'Add-on', description: 'Five additional pages beyond what your plan includes.' },
      { title: 'Logo & Brand Kit', price: 90, category: 'Add-on', description: 'A logo, color palette, and brand style sheet to match your new site.' },
      { title: 'Professional Copywriting', price: 60, category: 'Add-on', description: "We write your site's on-page content for you instead of you supplying it." },
      { title: 'Speed & SEO Performance Pass', price: 90, category: 'Add-on', description: 'A full audit and fix pass covering page speed, meta tags, structured data, and mobile performance.' },
      { title: '3 Months of Post-Launch Edits', price: 50, category: 'Add-on', description: 'Follow-up content and layout edits for 3 months after your site goes live.' }
    ]
  },
  'smm-services': {
    description: 'Social media management and growth packages for Instagram, TikTok, Twitter/X, and YouTube — pick a plan, then add extras.',
    scripts: [
      { title: 'Starter Growth', price: 70, category: 'Plan', description: 'One platform, 3 posts per week, and basic engagement replies. Billed monthly.' },
      { title: 'Growth Package', price: 150, category: 'Plan', description: 'Everything in Starter, up to 2 platforms, daily posting, a monthly content design pack, and a performance report. Billed monthly.' },
      { title: 'Full Management', price: 280, category: 'Plan', description: 'Everything in Growth, up to 4 platforms, daily posting, paid ad campaign management, brand strategy, and a weekly report. Billed monthly.' },
      { title: 'Extra Platform', price: 50, category: 'Add-on', description: 'Add one more platform beyond what your plan covers.' },
      { title: 'Paid Ad Campaign Setup', price: 130, category: 'Add-on', description: 'Ad creative, audience targeting, and conversion tracking set up for Meta or TikTok Ads.' },
      { title: 'Brand Strategy & Content Calendar', price: 75, category: 'Add-on', description: 'A one-time brand voice and positioning pass plus a ready-to-use 30-day content calendar.' },
      { title: 'Content Design Pack (20 Graphics)', price: 60, category: 'Add-on', description: 'Twenty branded, on-theme graphic templates ready to post across your social channels.' },
      { title: 'Rush Content Turnaround', price: 30, category: 'Add-on', description: 'Move your content requests to the front of the queue for faster turnaround.' }
    ]
  }
};

function main() {
  const manifest = {};
  const deleteScripts = db.prepare('DELETE FROM scripts WHERE pack_id = ?');
  const updateDescription = db.prepare("UPDATE packs SET description = ?, updated_at = datetime('now') WHERE id = ?");

  for (const [packId, def] of Object.entries(PACKS)) {
    const pack = catalogModel.getPack(packId, { includeHidden: true });
    if (!pack) {
      console.log(`SKIP (pack not found — run add-services-catalog.js first): ${packId}`);
      continue;
    }

    deleteScripts.run(packId);
    updateDescription.run(def.description, packId);
    console.log(`Rebuilding ${packId} ("${pack.packName}")`);

    manifest[packId] = [];
    for (const script of def.scripts) {
      const updated = catalogModel.createScript(packId, script);
      const created = updated.scripts.find((s) => s.title === script.title);
      manifest[packId].push({ id: created.id, title: created.title, price: created.price, category: created.category });
      console.log(`  + ${packId}/${created.id} — "${created.title}" ($${created.price}) [${created.category}]`);
    }
  }

  const manifestPath = path.join(__dirname, '..', '..', 'scripts', 'content-refresh', 'services-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nWrote manifest to ${manifestPath}`);
}

main();
