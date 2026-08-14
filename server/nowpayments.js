const crypto = require('crypto');

const API_BASE = 'https://api.nowpayments.io/v1';

// Swapped in for Coinbase Commerce, which turned out to require "Coinbase
// Business" and isn't available in every region yet. NOWPayments has much
// broader country availability and no business-verification gate to create
// an API key, at the cost of being a less globally recognized brand name.
//
// IMPORTANT: verify this against NOWPayments' current API docs
// (https://documenter.getpostman.com/view/7907941/2s93JusNJt) before relying
// on it for a real payment — this was written from documented behavior,
// not tested against a live NOWPayments account, since that requires
// account-specific credentials this environment doesn't have. The webhook
// signature check below fails closed (rejects) on any mismatch or error, so
// the worst case of a subtle mismatch is a payment that doesn't
// auto-confirm — never one that gets falsely accepted. Every order can also
// be marked paid manually from the admin dashboard regardless.

function isConfigured() {
  const key = process.env.NOWPAYMENTS_API_KEY;
  return Boolean(key) && !key.includes('...');
}

function getApiKey() {
  const key = process.env.NOWPAYMENTS_API_KEY;
  if (!key || key.includes('...')) {
    throw Object.assign(new Error('Crypto payments are not configured on this server yet.'), { statusCode: 503 });
  }
  return key;
}

// Creates a hosted NOWPayments invoice — the customer pays on NOWPayments'
// own page, so this server never touches wallet keys, addresses, or
// blockchain code directly. Payment confirmation comes later via a
// signature-verified webhook (IPN), the same pattern used for Stripe.
async function createInvoice({ orderId, description, amount, currency = 'gbp', successUrl, cancelUrl, ipnUrl }) {
  const response = await fetch(`${API_BASE}/invoice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey()
    },
    body: JSON.stringify({
      price_amount: amount,
      price_currency: currency,
      order_id: String(orderId),
      order_description: description,
      success_url: successUrl,
      cancel_url: cancelUrl,
      ipn_callback_url: ipnUrl
    })
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body && (body.message || body.error)) || `NOWPayments error (${response.status}).`;
    throw new Error(message);
  }

  return body; // { id, invoice_url, ... }
}

// NOWPayments signs the IPN body by recursively sorting object keys, then
// HMAC-SHA512 over the JSON-stringified result, hex-encoded, sent in the
// x-nowpayments-sig header.
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeysDeep(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function verifyWebhookSignature(parsedBody, signatureHeader) {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret || !signatureHeader) return false;

  try {
    const sorted = JSON.stringify(sortKeysDeep(parsedBody));
    const expected = crypto.createHmac('sha512', secret).update(sorted).digest('hex');
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(String(signatureHeader));
    if (expectedBuf.length !== actualBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch (err) {
    return false;
  }
}

module.exports = { isConfigured, createInvoice, verifyWebhookSignature };
