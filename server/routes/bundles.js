const express = require('express');
const bundlesModel = require('../models/bundles');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ bundles: bundlesModel.listActive() });
});

module.exports = router;
