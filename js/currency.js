(function () {
  const STORAGE_KEY = 'scriptforge_currency';
  const DEFAULT_CURRENCY = 'GBP';

  // Mirrors server/currency.js — the server is always the one that decides
  // what actually gets charged (see server/routes/checkout.js), but the
  // client needs its own copy of the same rates to *display* prices
  // consistently before checkout even starts. Keep these two files in sync.
  const RATES = {
    GBP: { symbol: '£', rate: 0.79 },
    USD: { symbol: '$', rate: 1 },
    EUR: { symbol: '€', rate: 0.92 }
  };

  function getCurrency() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return Object.prototype.hasOwnProperty.call(RATES, stored) ? stored : DEFAULT_CURRENCY;
  }

  function setCurrency(code) {
    if (!Object.prototype.hasOwnProperty.call(RATES, code)) return;
    localStorage.setItem(STORAGE_KEY, code);
    applyCurrencyToDom();
    window.dispatchEvent(new CustomEvent('scriptforge:currencychange', { detail: { currency: code } }));
  }

  // usdAmount may be a whole-dollar number (e.g. 29) or already-decimal
  // (e.g. 3.5) — every price in the DOM/catalog is authored in USD.
  function formatUsd(usdAmount) {
    const code = getCurrency();
    const { symbol, rate } = RATES[code];
    const converted = Number(usdAmount) * rate;
    return `${symbol}${converted.toFixed(2)}`;
  }

  function applyCurrencyToDom() {
    document.querySelectorAll('[data-usd-price]').forEach((el) => {
      const amount = Number(el.dataset.usdPrice);
      if (Number.isNaN(amount)) return;
      const suffix = el.dataset.priceSuffix || '';
      el.textContent = `${formatUsd(amount)}${suffix}`;
    });
  }

  function renderSwitcher() {
    let container = document.getElementById('currencySwitcher');
    if (!container) {
      const navActions = document.querySelector('.nav-actions');
      if (!navActions) return;
      container = document.createElement('div');
      container.id = 'currencySwitcher';
      container.className = 'currency-switcher';
      navActions.insertBefore(container, navActions.firstChild);
    }

    const current = getCurrency();
    container.innerHTML = `
      <svg class="currency-switcher-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M9.5 8.5a2.5 2.5 0 0 1 2.5-1.5h.5a2 2 0 0 1 0 4h-1a2 2 0 0 0 0 4h.5a2.5 2.5 0 0 0 2.5-1.5"></path>
        <path d="M12 6v1.2M12 16.8V18"></path>
      </svg>
      <select id="currencySelect" aria-label="Currency">
        ${Object.entries(RATES).map(([code, { symbol }]) => `<option value="${code}" ${code === current ? 'selected' : ''}>${symbol} ${code}</option>`).join('')}
      </select>
    `;

    document.getElementById('currencySelect').addEventListener('change', (event) => {
      setCurrency(event.target.value);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderSwitcher();
    applyCurrencyToDom();
  });

  window.ScriptForgeCurrency = {
    getCurrency,
    setCurrency,
    formatUsd,
    applyCurrencyToDom,
    RATES
  };
})();
