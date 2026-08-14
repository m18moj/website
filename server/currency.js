// Fixed, approximate exchange rates relative to 1 USD (the currency the
// catalog's prices are authored in). This is a small store without a live
// FX feed — these should be updated periodically by hand, or replaced with
// a live rate API later if precision starts to matter. The client has its
// own copy of this same table (js/currency.js) purely for *display*; the
// currency a customer picks is only ever a hint for which of these rates to
// apply — the actual amount charged is always computed here, from the
// server's own catalog prices, never trusted from the client.
const RATES = {
  GBP: { symbol: '£', rate: 0.79 },
  USD: { symbol: '$', rate: 1 },
  EUR: { symbol: '€', rate: 0.92 }
};

const DEFAULT_CURRENCY = 'GBP';

function isSupported(code) {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(RATES, code.toUpperCase());
}

function normalize(code) {
  return isSupported(code) ? code.toUpperCase() : DEFAULT_CURRENCY;
}

function convertCentsFromUsd(usdCents, code) {
  const currency = normalize(code);
  return Math.round(usdCents * RATES[currency].rate);
}

function symbolFor(code) {
  return RATES[normalize(code)].symbol;
}

// Converts every line item in a priceCart() result (see catalog.js) to the
// target currency and re-derives pack/order totals from those converted
// items, rather than converting the USD total separately — so the
// per-script breakdown a customer sees always sums exactly to the order
// total, in whatever currency they were charged in.
function convertPricedCart(priced, code) {
  const targetCurrency = normalize(code);

  const packs = priced.packs.map((pack) => {
    const items = pack.items.map((item) => ({
      ...item,
      priceCents: convertCentsFromUsd(item.priceCents, targetCurrency)
    }));
    return {
      ...pack,
      items,
      totalCents: items.reduce((sum, item) => sum + item.priceCents, 0)
    };
  });

  return {
    packs,
    totalCents: packs.reduce((sum, pack) => sum + pack.totalCents, 0)
  };
}

module.exports = { RATES, DEFAULT_CURRENCY, isSupported, normalize, convertCentsFromUsd, symbolFor, convertPricedCart };
