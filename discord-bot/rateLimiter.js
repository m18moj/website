const config = require('./config');

// In-memory per-key cooldown + rolling-window cap, generalized so every
// sensitive command can get its own budget without duplicating this logic.
// In-memory is fine here — a bot restart resetting everyone's cooldown is a
// non-issue, and none of these need to survive across processes or be
// shared with the website widget (that side uses express-rate-limit
// independently, per IP/session).
function createLimiter({ cooldownMs = 0, windowMs, max, cooldownMessage, limitMessage }) {
  const lastAt = new Map();
  const windowHits = new Map();

  return function check(key) {
    const now = Date.now();

    if (cooldownMs) {
      const last = lastAt.get(key) || 0;
      if (now - last < cooldownMs) {
        return { allowed: false, reason: cooldownMessage || 'Please wait a moment before trying again.' };
      }
    }

    const hits = (windowHits.get(key) || []).filter((t) => now - t < windowMs);
    if (hits.length >= max) {
      return { allowed: false, reason: limitMessage || 'You have hit the usage limit for now — please try again later.' };
    }

    hits.push(now);
    windowHits.set(key, hits);
    lastAt.set(key, now);
    return { allowed: true };
  };
}

const assistantLimiter = createLimiter({
  cooldownMs: config.ASSISTANT.COOLDOWN_MS,
  windowMs: config.ASSISTANT.WINDOW_MS,
  max: config.ASSISTANT.MAX_MESSAGES_PER_WINDOW,
  limitMessage: 'You have hit the assistant usage limit for now — please try again later.'
});

// /verify does an email lookup against the user database — without a cap,
// it's an oracle an attacker could use to enumerate which emails have a
// ScripForge account by trying many in a row from one Discord account.
// 5/hour is generous for a legitimate customer (who needs at most one or
// two attempts) and useless for enumeration at any real scale.
const verifyLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  limitMessage: 'Too many verification attempts. Please wait a while and try again, or use the "Connect Discord" button on the website (Account page) instead.'
});

module.exports = {
  // Preserves the existing call shape (`rateLimiter.checkAndRecord(id)`)
  // used by ask.js and events/messageCreate.js.
  checkAndRecord: assistantLimiter,
  checkVerifyLimit: verifyLimiter,
  createLimiter
};
