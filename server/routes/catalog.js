const express = require('express');
const { param } = require('express-validator');
const catalogModel = require('../models/catalog');
const reviewsModel = require('../models/reviews');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ catalog: catalogModel.listAll({ includeHidden: false }) });
});

router.get('/:packId/reviews', [param('packId').isString().notEmpty()], (req, res) => {
  const reviews = reviewsModel.forPack(req.params.packId).map((r) => ({
    username: r.username,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at
  }));
  res.json({ reviews, summary: reviewsModel.summaryForPack(req.params.packId) });
});

module.exports = router;
