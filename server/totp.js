// Hand-rolled TOTP (RFC 6238) + HOTP (RFC 4226) + base32 (RFC 4648), using
// only Node's built-in crypto module. A well-maintained third-party TOTP
// library would normally be preferable, but the current major version of
// the obvious choice (otplib v13) ships a plugin architecture whose crypto
// plugin doesn't actually satisfy its own interface out of the box — the
// same kind of fragile-dependency problem that made better-sqlite3
// unusable earlier in this project. TOTP is a short, stable, fully-specified
// algorithm, so implementing it directly against Node's crypto module is
// more reliable than fighting a broken dependency.
const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1; // accept 1 step of clock drift each direction (~30s)

function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');

  let output = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  const remainder = bits.length % 5;
  if (remainder) {
    const chunk = bits.slice(bits.length - remainder).padEnd(5, '0');
    output += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return output;
}

function base32Decode(input) {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) continue;
    bits += value.toString(2).padStart(5, '0');
  }

  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateSecret(byteLength = 20) {
  return base32Encode(crypto.randomBytes(byteLength));
}

function hotp(secretBuffer, counter) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', secretBuffer).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

function totpAt(secretBase32, timeMs) {
  const counter = Math.floor(timeMs / 1000 / STEP_SECONDS);
  return hotp(base32Decode(secretBase32), counter);
}

function generateTotp(secretBase32, timeMs = Date.now()) {
  return totpAt(secretBase32, timeMs);
}

function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Accepts a code from the current step or WINDOW steps before/after, so a
// slightly-off device clock still works.
function verifyTotp(token, secretBase32, timeMs = Date.now()) {
  if (!/^\d{6}$/.test(String(token || ''))) return false;

  for (let step = -WINDOW; step <= WINDOW; step += 1) {
    const candidate = totpAt(secretBase32, timeMs + step * STEP_SECONDS * 1000);
    if (safeCompare(token, candidate)) return true;
  }
  return false;
}

function generateOtpAuthUri({ secret, label, issuer }) {
  const encodedLabel = encodeURIComponent(`${issuer}:${label}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS)
  });
  return `otpauth://totp/${encodedLabel}?${params.toString()}`;
}

module.exports = { generateSecret, generateTotp, verifyTotp, generateOtpAuthUri, base32Encode, base32Decode };
