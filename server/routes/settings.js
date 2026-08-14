const express = require('express');
const settingsModel = require('../models/settings');

const router = express.Router();

// Public, read-only, and deliberately small (server/models/settings.js
// filters this down from the full flag set) — the client uses it to decide
// whether to show the maintenance overlay, announcement banner, wishlist
// buttons, and "new" badges.
router.get('/public', (req, res) => {
  res.json(settingsModel.getPublic());
});

module.exports = router;
