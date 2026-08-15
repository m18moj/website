(function () {
  function cartToPackPayload() {
    const cart = window.ScripForgeCart.getCart();
    return cart.map((pack) => ({
      packId: pack.id,
      scriptIds: pack.items.map((item) => item.id)
    }));
  }

  function getPromoCode() {
    const input = document.getElementById('promoCodeInput');
    return input ? input.value.trim() : '';
  }

  function getOrderNotes() {
    const input = document.getElementById('orderNotesInput');
    return input ? input.value.trim() : '';
  }

  function money(usdAmount) {
    return window.ScripForgeCurrency ? window.ScripForgeCurrency.formatUsd(usdAmount) : `$${Number(usdAmount).toFixed(2)}`;
  }

  function wirePaymentButton(buttonId, apiPath, busyText, idleText) {
    const button = document.getElementById(buttonId);
    const errorBox = document.getElementById('checkoutError');
    if (!button) return;

    button.addEventListener('click', async () => {
      errorBox.hidden = true;
      const cart = window.ScripForgeCart.getCart();
      if (!cart.length) return;

      button.disabled = true;
      button.textContent = busyText;

      try {
        const me = await window.ScripForgeAuth.loadCurrentUser();
        if (!me) {
          window.location.href = 'login?redirect=checkout';
          return;
        }

        const data = await window.ScripForgeAuth.apiFetch(apiPath, {
          method: 'POST',
          body: {
            cart: cartToPackPayload(),
            // A hint for which currency to charge in — the server always
            // recomputes the actual amount itself from its own catalog and
            // rate table (see server/routes/checkout.js), so this can't be
            // used to change what gets billed, only which currency it's in.
            currency: window.ScripForgeCurrency ? window.ScripForgeCurrency.getCurrency() : 'GBP',
            promoCode: getPromoCode() || undefined,
            notes: getOrderNotes() || undefined
          }
        });

        window.location.href = data.url;
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
        button.disabled = false;
        button.textContent = idleText;
        if (window.ScripForgeToast) window.ScripForgeToast.show(err.message, 'error');
      }
    });
  }

  async function applyPromo() {
    const message = document.getElementById('promoMessage');
    const discountRow = document.getElementById('discountRow');
    message.hidden = true;

    const cart = window.ScripForgeCart.getCart();
    if (!cart.length) return;

    const promoCode = getPromoCode();
    if (!promoCode) {
      discountRow.hidden = true;
      if (window.ScripForgeCart) window.ScripForgeCart.renderCheckoutPage();
      return;
    }

    try {
      const me = await window.ScripForgeAuth.loadCurrentUser();
      if (!me) {
        window.location.href = 'login?redirect=checkout';
        return;
      }

      const data = await window.ScripForgeAuth.apiFetch('/api/checkout/preview-discount', {
        method: 'POST',
        body: { cart: cartToPackPayload(), currency: window.ScripForgeCurrency ? window.ScripForgeCurrency.getCurrency() : 'GBP', promoCode }
      });

      if (data.discount > 0) {
        discountRow.hidden = false;
        document.getElementById('discountAmount').textContent = `-${money(data.discount)}`;
        document.getElementById('checkoutTotal').textContent = money(data.total);
        if (window.ScripForgeToast) window.ScripForgeToast.show('Promo code applied.', 'success');
      } else {
        discountRow.hidden = true;
        message.textContent = 'That code doesn\'t apply any discount to this basket.';
        message.hidden = false;
      }
    } catch (err) {
      discountRow.hidden = true;
      message.textContent = err.message;
      message.hidden = false;
    }
  }

  async function renderAlsoLike() {
    const section = document.getElementById('alsoLikeSection');
    const grid = document.getElementById('alsoLikeGrid');
    if (!section || !grid) return;

    const cart = window.ScripForgeCart.getCart();
    if (!cart.length) { section.hidden = true; return; }

    try {
      const res = await fetch('/api/catalog');
      const data = await res.json();
      const cartPackIds = new Set(cart.map((p) => p.id));
      const candidates = (data.catalog || []).filter((p) => p.scripts.length > 0 && !cartPackIds.has(p.packId));

      if (!candidates.length) { section.hidden = true; return; }

      const picks = candidates.sort(() => Math.random() - 0.5).slice(0, 3);
      const { escapeHtml } = window.ScripForgeAuth;

      grid.innerHTML = picks.map((pack) => {
        const total = pack.scripts.reduce((sum, s) => sum + s.price, 0);
        const link = pack.detailUrl ? `../${pack.detailUrl}` : `catalog`;
        return `
          <article class="catalog-card game-card">
            <div class="game-splash ${escapeHtml(pack.splash || 'custom')}" data-game="${escapeHtml(pack.dataGame || pack.gameTitle)}"></div>
            <div class="game-card-body">
              <h3>${escapeHtml(pack.packName)}</h3>
              <div class="card-meta"><span>${pack.scripts.length} scripts</span><span data-usd-price="${total}">$${total}</span></div>
              <a href="${link}" class="btn btn-secondary">View pack</a>
            </div>
          </article>
        `;
      }).join('');

      section.hidden = false;
      if (window.ScripForgeCurrency) window.ScripForgeCurrency.applyCurrencyToDom();
    } catch (err) {
      section.hidden = true;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    wirePaymentButton('confirmPurchaseBtn', '/api/checkout/create-session', 'Redirecting to payment…', 'Pay with Card');
    wirePaymentButton('cryptoPurchaseBtn', '/api/checkout/create-crypto-charge', 'Redirecting to payment…', 'Pay with Crypto');

    const applyBtn = document.getElementById('applyPromoBtn');
    if (applyBtn) applyBtn.addEventListener('click', applyPromo);

    renderAlsoLike();
  });
})();
