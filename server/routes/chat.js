const express = require('express');
const { body, validationResult } = require('express-validator');
const { chatLimiter } = require('../middleware/rateLimit');
const usersModel = require('../models/users');
// discord-bot/assistant.js is the same "brain" the Discord bot uses — one
// module, reused here so catalog/FAQ knowledge and the never-leak-other-
// users'-data rule only ever live in one place.
const assistant = require('../../discord-bot/assistant');

const router = express.Router();

router.post(
  '/',
  chatLimiter,
  [
    body('messages').isArray({ min: 1, max: 20 }),
    body('messages.*.role').isIn(['user', 'assistant']),
    body('messages.*.content').isString().trim().isLength({ min: 1, max: 2000 })
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid chat request.' });

    const messages = req.body.messages;
    if (messages[messages.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'The last message must be from the user.' });
    }

    // Only ever built from the requester's own authenticated session — never
    // accepts a user id from the request body, so there's no way to ask for
    // someone else's order history through this endpoint.
    let userContext = null;
    if (req.session && req.session.userId) {
      const user = usersModel.findById(req.session.userId);
      if (user) userContext = { userId: user.id, username: user.username };
    }

    assistant
      .getReply({ history: messages.map((m) => ({ role: m.role, content: m.content })), userContext })
      .then((result) => {
        if (result.error) return res.status(503).json({ error: result.error });
        res.json({ reply: result.reply });
      })
      .catch((err) => {
        console.error('[chat] Unexpected error:', err);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
      });
  }
);

module.exports = router;
