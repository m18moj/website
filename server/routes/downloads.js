const fs = require('fs');
const path = require('path');
const express = require('express');
const archiver = require('archiver');

const { requireAuth, requireAdmin } = require('../middleware/auth');
const { downloadLimiter, zipDownloadLimiter } = require('../middleware/rateLimit');
const licensesModel = require('../models/licenses');
const catalogModel = require('../models/catalog');
const auditLog = require('../models/auditLog');
const ordersModel = require('../models/orders');
const { isServicePack } = require('../servicePacks');
const discordConfig = require('../../discord-bot/config');

const router = express.Router();
const ROOT = path.join(__dirname, '..', '..');

// Zip entries become real file/folder names once extracted, so strip
// anything that's illegal (or awkward) in a Windows/macOS/Linux path.
function safeFilename(str) {
  return String(str).replace(/[\\/:*?"<>|]/g, '-').trim() || 'file';
}

// Every catalog script, flattened out of packs/scripts, for the admin
// full-catalog-access view below — shaped like a license-list item so the
// existing frontend rendering (js/downloads.js) doesn't need to branch on role.
function allCatalogItems() {
  const items = [];
  for (const pack of catalogModel.listAll({ includeHidden: true })) {
    for (const script of pack.scripts) {
      items.push({
        licenseKey: null,
        packId: pack.packId,
        packName: pack.packName,
        scriptId: script.id,
        scriptTitle: script.title,
        version: script.version,
        hasFile: script.hasFile,
        isService: isServicePack(pack.packId),
        serviceTicketUrl: null,
        activated: false,
        downloadCount: 0,
        downloadCap: null,
        adminAccess: true
      });
    }
  }
  return items;
}

// Every purchased script the signed-in user has a license for, with its
// live catalog data (title, version, changelog) joined in. Admins instead see
// every script in the catalog — purchases don't gate their access.
router.get('/', requireAuth, (req, res) => {
  if (req.currentUser.role === 'admin') {
    return res.json({ items: allCatalogItems() });
  }

  const licenses = licensesModel.listForUser(req.session.userId);
  const orderCache = new Map();
  const items = licenses.map((license) => {
    const script = catalogModel.getScript(license.pack_id, license.script_id, { includeHidden: true });
    const pack = catalogModel.getPack(license.pack_id, { includeHidden: true });
    const isService = isServicePack(license.pack_id);

    let serviceTicketUrl = null;
    if (isService) {
      if (!orderCache.has(license.order_id)) orderCache.set(license.order_id, ordersModel.findById(license.order_id));
      const order = orderCache.get(license.order_id);
      if (order && order.service_ticket_channel_id && discordConfig.GUILD_ID) {
        serviceTicketUrl = `https://discord.com/channels/${discordConfig.GUILD_ID}/${order.service_ticket_channel_id}`;
      }
    }

    return {
      licenseKey: license.license_key,
      packId: license.pack_id,
      packName: pack ? pack.packName : license.pack_id,
      scriptId: license.script_id,
      scriptTitle: script ? script.title : license.script_id,
      version: script ? script.version : null,
      hasFile: script ? script.hasFile : false,
      isService,
      serviceTicketUrl,
      activated: Boolean(license.device_fingerprint),
      downloadCount: license.download_count,
      downloadCap: licensesModel.DOWNLOAD_CAP
    };
  });
  res.json({ items });
});

// Wraps a per-download watermark in whatever comment syntax the file's
// language actually uses, so it reads as a natural part of the file (and
// survives being opened in any editor) rather than a bolted-on suffix.
function watermarkFor(fileExt, { username, licenseKey, orderId, downloadedAt }) {
  const lines = [
    'ScripForge — Licensed copy',
    `Licensed to: ${username}`,
    `License key: ${licenseKey}`,
    `Order: SF-${orderId}`,
    `Downloaded: ${downloadedAt}`,
    'This file is licensed for your personal use only. Redistributing or',
    'reselling it is a violation of the license this was purchased under.'
  ];

  if (fileExt === 'lua') {
    return `--[[\n  ${lines.join('\n  ')}\n]]\n\n`;
  }
  if (fileExt === 'psc') {
    return lines.map((l) => `; ${l}`).join('\n') + '\n\n';
  }
  // .cs, .java, and anything else C-style-comment-friendly
  return `/*\n * ${lines.join('\n * ')}\n */\n\n`;
}

// Same idea as watermarkFor above, but for admins pulling a script they don't
// hold a purchased license for — there's no license key or order to stamp,
// so the watermark says so plainly instead of printing blank/fake fields.
function adminWatermarkFor(fileExt, { username, downloadedAt }) {
  const lines = [
    'ScripForge — Admin copy (full catalog access, no purchase license)',
    `Accessed by: ${username}`,
    `Downloaded: ${downloadedAt}`
  ];

  if (fileExt === 'lua') return `--[[\n  ${lines.join('\n  ')}\n]]\n\n`;
  if (fileExt === 'psc') return lines.map((l) => `; ${l}`).join('\n') + '\n\n';
  return `/*\n * ${lines.join('\n * ')}\n */\n\n`;
}

// Admin single-script download — no license required, since admins have
// standing access to the whole catalog. Kept as its own path (rather than
// folded into the licenseKey route above) so a license lookup is never on
// the code path for a request that isn't presenting one.
router.get('/admin/:packId/:scriptId/file', downloadLimiter, requireAdmin, (req, res) => {
  const record = catalogModel.getScriptFileRecord(req.params.packId, req.params.scriptId);
  if (!record || !record.file_path) {
    return res.status(404).json({ error: "This script's file isn't available yet." });
  }

  const fullPath = path.join(ROOT, record.file_path);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: "This script's file is missing on the server." });
  }

  const original = fs.readFileSync(fullPath, 'utf8');
  const downloadedAt = new Date().toISOString();
  const watermark = adminWatermarkFor(record.file_ext, { username: req.currentUser.username, downloadedAt });

  auditLog.record({
    actor: req.currentUser,
    action: 'downloads.admin_file',
    target: `${req.params.packId}/${req.params.scriptId}`
  });

  const filename = path.basename(record.file_path);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(watermark + original);
});

// A GET (not a POST) so a plain link/window.location works for the actual
// file save — the tradeoff is that binding a license to a device happens as
// a side effect of this GET rather than a separate confirmed action. License
// keys are self-verifying (see server/models/licenses.js) and this route is
// rate-limited, so a brute-force scan gets rejected fast without reaching
// the database.
router.get('/:licenseKey/file', downloadLimiter, requireAuth, (req, res) => {
  const deviceFingerprint = String(req.query.fp || '');
  const logBase = { licenseKey: req.params.licenseKey, ip: req.ip, deviceFingerprint, userAgent: req.headers['user-agent'] };

  const license = licensesModel.findByKey(req.params.licenseKey);
  if (!license || license.user_id !== req.session.userId) {
    licensesModel.logAttempt({ ...logBase, success: false, reason: 'not_found_or_not_owner' });
    return res.status(404).json({ error: 'License not found.' });
  }

  if (!deviceFingerprint) {
    licensesModel.logAttempt({ ...logBase, success: false, reason: 'missing_device_fingerprint' });
    return res.status(400).json({ error: 'Missing device identifier.' });
  }

  const block = licensesModel.checkDeviceAccess(license, deviceFingerprint);
  if (block) {
    licensesModel.logAttempt({ ...logBase, success: false, reason: 'device_blocked' });
    return res.status(403).json({ error: block.reason });
  }

  if (!license.device_fingerprint) {
    licensesModel.bindDevice(license.id, deviceFingerprint);
  }

  const record = catalogModel.getScriptFileRecord(license.pack_id, license.script_id);
  if (!record || !record.file_path) {
    licensesModel.logAttempt({ ...logBase, success: false, reason: 'file_missing' });
    return res.status(404).json({ error: 'This script\'s file isn\'t available yet — contact support on Discord.' });
  }

  const fullPath = path.join(ROOT, record.file_path);
  if (!fs.existsSync(fullPath)) {
    licensesModel.logAttempt({ ...logBase, success: false, reason: 'file_missing_on_disk' });
    return res.status(404).json({ error: 'This script\'s file is missing on the server — contact support on Discord.' });
  }

  const original = fs.readFileSync(fullPath, 'utf8');
  const watermark = watermarkFor(record.file_ext, {
    username: req.currentUser.username,
    licenseKey: license.license_key,
    orderId: license.order_id,
    downloadedAt: new Date().toISOString()
  });

  licensesModel.recordDownload(license.id);
  licensesModel.logAttempt({ ...logBase, success: true, reason: null });

  const filename = path.basename(record.file_path);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(watermark + original);
});

// Admins aren't gated by licenses at all — this bundles every script in the
// catalog that currently has a file, regardless of who (if anyone) has
// purchased it. No device binding applies since there's no license to bind.
function sendAdminCatalogZip(req, res) {
  const toInclude = [];
  for (const pack of catalogModel.listAll({ includeHidden: true })) {
    for (const script of pack.scripts) {
      const record = catalogModel.getScriptFileRecord(pack.packId, script.id);
      const fullPath = record && record.file_path ? path.join(ROOT, record.file_path) : null;
      if (record && record.file_path && fs.existsSync(fullPath)) {
        toInclude.push({ pack, script, record, fullPath });
      }
    }
  }

  if (toInclude.length === 0) {
    return res.status(404).json({ error: 'No scripts in the catalog have a downloadable file yet.' });
  }

  const filename = `ScripForge-${safeFilename(req.currentUser.username)}-admin-full-catalog.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    console.error('Admin catalog zip download failed:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Could not build the catalog bundle. Please try again.' });
  });
  archive.on('end', () => {
    auditLog.record({ actor: req.currentUser, action: 'downloads.admin_full_catalog_zip', target: `${toInclude.length} scripts` });
  });

  archive.pipe(res);

  const downloadedAt = new Date().toISOString();
  const manifestLines = [
    'ScripForge — Full Catalog (Admin Access)',
    `Accessed by: ${req.currentUser.username}`,
    `Bundled: ${downloadedAt}`,
    '',
    'This archive was generated via admin catalog access, not a purchased',
    'license. Every file carries its own header noting that.',
    '',
    'Contents:'
  ];
  for (const { pack, script } of toInclude) {
    manifestLines.push(`  - ${pack.packName} / ${script.title}`);
  }
  archive.append(manifestLines.join('\n') + '\n', { name: 'README.txt' });

  for (const { pack, script, record, fullPath } of toInclude) {
    const original = fs.readFileSync(fullPath, 'utf8');
    const watermark = adminWatermarkFor(record.file_ext, { username: req.currentUser.username, downloadedAt });
    const entryName = `${safeFilename(pack.packName)}/${safeFilename(script.title)}.${record.file_ext}`;
    archive.append(watermark + original, { name: entryName });
  }

  archive.finalize();
}

// The download manager's one and only customer-facing button: every script
// the signed-in user has ever been issued a license for, watermarked
// individually and bundled into a single zip, plus a README.txt manifest
// listing what's inside (and what's still pending a file). Delivery itself
// is already fully automatic — orderFulfillment.js issues the underlying
// license the moment an order's payment webhook confirms it, with no admin
// step involved; this route just changes how the customer receives it.
router.get('/zip', zipDownloadLimiter, requireAuth, (req, res) => {
  if (req.currentUser.role === 'admin') {
    return sendAdminCatalogZip(req, res);
  }

  const deviceFingerprint = String(req.query.fp || '');
  const logBase = { ip: req.ip, deviceFingerprint, userAgent: req.headers['user-agent'] };

  if (!deviceFingerprint) {
    return res.status(400).json({ error: 'Missing device identifier.' });
  }

  const licenses = licensesModel.listForUser(req.session.userId);
  if (licenses.length === 0) {
    return res.status(404).json({ error: "You don't own any scripts yet." });
  }

  // Resolve every license's status up front so a device conflict fails the
  // whole request cleanly with a clear error, instead of aborting partway
  // through an already-started zip stream.
  const toInclude = [];
  const skippedNoFile = [];
  for (const license of licenses) {
    const block = licensesModel.checkDeviceAccess(license, deviceFingerprint);
    if (block) {
      licensesModel.logAttempt({ ...logBase, licenseKey: license.license_key, success: false, reason: 'device_blocked' });
      return res.status(403).json({ error: block.reason });
    }

    const record = catalogModel.getScriptFileRecord(license.pack_id, license.script_id);
    const fullPath = record && record.file_path ? path.join(ROOT, record.file_path) : null;
    if (!record || !record.file_path || !fs.existsSync(fullPath)) {
      skippedNoFile.push(license);
      continue;
    }
    toInclude.push({ license, record, fullPath });
  }

  if (toInclude.length === 0) {
    return res.status(404).json({ error: "None of your scripts have a downloadable file yet — contact support on Discord." });
  }

  for (const { license } of toInclude) {
    if (!license.device_fingerprint) {
      licensesModel.bindDevice(license.id, deviceFingerprint);
    }
  }

  const filename = `ScripForge-${safeFilename(req.currentUser.username)}-downloads.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.on('error', (err) => {
    console.error('Zip bundle download failed:', err.message);
    for (const { license } of toInclude) {
      licensesModel.logAttempt({ ...logBase, licenseKey: license.license_key, success: false, reason: 'zip_stream_error' });
    }
    if (!res.headersSent) res.status(500).json({ error: 'Could not build your download bundle. Please try again.' });
  });

  // Counted and logged once the archive has finished writing every entry
  // into the response stream — the same "the GET itself is the confirmed
  // action" tradeoff the single-file route below takes, documented there.
  archive.on('end', () => {
    for (const { license } of toInclude) {
      licensesModel.recordDownload(license.id);
      licensesModel.logAttempt({ ...logBase, licenseKey: license.license_key, success: true, reason: 'bundled_zip' });
    }
  });

  archive.pipe(res);

  const downloadedAt = new Date().toISOString();
  const packNameFor = (packId) => {
    const pack = catalogModel.getPack(packId, { includeHidden: true });
    return pack ? pack.packName : packId;
  };
  const titleFor = (packId, scriptId) => {
    const script = catalogModel.getScript(packId, scriptId, { includeHidden: true });
    return script ? script.title : scriptId;
  };

  const manifestLines = [
    'ScripForge — Your Scripts',
    `Licensed to: ${req.currentUser.username}`,
    `Bundled: ${downloadedAt}`,
    '',
    'This archive is licensed for your personal use only. Redistributing or',
    'reselling any file inside it is a violation of the license it was',
    'purchased under. Every file also carries its own individual license',
    'watermark in its header comment, so it stays traceable even if it\'s',
    'copied out of this archive.',
    '',
    'Contents:'
  ];
  for (const { license } of toInclude) {
    manifestLines.push(`  - ${packNameFor(license.pack_id)} / ${titleFor(license.pack_id, license.script_id)}  (license ${license.license_key})`);
  }
  if (skippedNoFile.length) {
    manifestLines.push('', 'Not included yet (file coming soon — check back later):');
    for (const license of skippedNoFile) {
      manifestLines.push(`  - ${packNameFor(license.pack_id)} / ${titleFor(license.pack_id, license.script_id)}`);
    }
  }
  archive.append(manifestLines.join('\n') + '\n', { name: 'README.txt' });

  for (const { license, record, fullPath } of toInclude) {
    const original = fs.readFileSync(fullPath, 'utf8');
    const watermark = watermarkFor(record.file_ext, {
      username: req.currentUser.username,
      licenseKey: license.license_key,
      orderId: license.order_id,
      downloadedAt
    });
    const entryName = `${safeFilename(packNameFor(license.pack_id))}/${safeFilename(titleFor(license.pack_id, license.script_id))}.${record.file_ext}`;
    archive.append(watermark + original, { name: entryName });
  }

  archive.finalize();
});

module.exports = router;
