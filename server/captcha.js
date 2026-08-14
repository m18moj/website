const crypto = require('crypto');

const WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

// A small self-hosted arithmetic CAPTCHA — no external service, no API key,
// no image generation. It's not meant to stop a determined attacker (nothing
// simple is); it's meant to stop the scripted mass-registration/credential-
// stuffing bots that don't bother solving even trivial per-site challenges,
// which is the actual threat model for a small store like this one.
function generate(req) {
  const a = crypto.randomInt(1, 10);
  const b = crypto.randomInt(1, 10);
  const useWords = crypto.randomInt(0, 2) === 0;

  const question = useWords ? `${WORDS[a - 1]} + ${WORDS[b - 1]}` : `${a} + ${b}`;

  req.session.captchaAnswer = String(a + b);
  return { question: `What is ${question}?` };
}

// One-time use: the stored answer is cleared whether the attempt succeeds or
// fails, so a captured question/answer pair can't be replayed.
function verify(req, submittedAnswer) {
  const expected = req.session.captchaAnswer;
  delete req.session.captchaAnswer;

  if (!expected || !submittedAnswer) return false;
  return String(submittedAnswer).trim() === expected;
}

module.exports = { generate, verify };
