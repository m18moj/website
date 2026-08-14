const express = require('express');
const { body, validationResult } = require('express-validator');
const errorLogModel = require('../models/errorLog');

const router = express.Router();

// Client-side JS errors (window.onerror / unhandledrejection — see
// js/error-reporter.js), logged for admin visibility. No auth required
// since errors can happen before/without a session, but it's covered by the
// general API rate limiter already applied ahead of this router, so it
// can't be used to flood the database.
router.post(
  '/',
  [
    body('message').isString().trim().notEmpty(),
    body('stack').optional({ nullable: true }).isString(),
    body('url').optional({ nullable: true }).isString()
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid error report.' });

    errorLogModel.record({
      source: 'client',
      message: req.body.message,
      stack: req.body.stack,
      url: req.body.url,
      userId: req.session ? req.session.userId : null
    });
    res.json({ ok: true });
  }
);

module.exports = router;
