(function () {
  const CART_KEY = 'scripforge_cart';

  // Every price stored in the cart is in USD (the catalog's base currency);
  // this is the one place that turns a USD number into whatever the
  // shopper currently has selected (js/currency.js), so every display in
  // this file stays in sync when they switch currencies mid-visit.
  function money(usdAmount) {
    return window.ScripForgeCurrency ? window.ScripForgeCurrency.formatUsd(usdAmount) : `$${Number(usdAmount).toFixed(2)}`;
  }

  function getCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    } catch (error) {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartCount();
  }

  function makeId(value) {
    return String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  function updateCartCount() {
    const cart = getCart();
    const total = cart.reduce((sum, pack) => sum + (pack.items ? pack.items.length : 0), 0);
    document.querySelectorAll('.cart-count, [data-cart-count]').forEach((node) => {
      const changed = node.textContent !== String(total);
      node.textContent = total;
      if (changed) {
        node.classList.remove('cart-count-bump');
        // eslint-disable-next-line no-unused-expressions
        void node.offsetWidth; // restart the animation if it's still running
        node.classList.add('cart-count-bump');
      }
    });
  }

  function addPackToCart(packId, packName, items) {
    const cart = getCart();
    const cleanItems = (items || []).map((item) => ({
      id: item.id || makeId(item.title),
      title: item.title,
      price: Number(item.price || 0)
    }));

    const nextPack = {
      id: makeId(packId || packName),
      name: packName,
      items: cleanItems,
      total: cleanItems.reduce((sum, item) => sum + item.price, 0)
    };

    const existingIndex = cart.findIndex((entry) => makeId(entry.id) === makeId(nextPack.id));
    if (existingIndex >= 0) {
      cart.splice(existingIndex, 1, nextPack);
    } else {
      cart.push(nextPack);
    }

    cart.sort((a, b) => a.name.localeCompare(b.name));
    saveCart(cart);
    return nextPack;
  }

  function removePackFromCart(packId) {
    const cart = getCart().filter((entry) => makeId(entry.id) !== makeId(packId));
    saveCart(cart);
    renderCheckoutPage();
  }

  function removeItemFromCart(packId, itemId) {
    const cart = getCart();
    const packIndex = cart.findIndex((entry) => makeId(entry.id) === makeId(packId));
    if (packIndex < 0) return;

    const remainingItems = cart[packIndex].items.filter((item) => makeId(item.id) !== makeId(itemId));
    if (!remainingItems.length) {
      cart.splice(packIndex, 1);
    } else {
      cart[packIndex] = {
        ...cart[packIndex],
        items: remainingItems,
        total: remainingItems.reduce((sum, item) => sum + Number(item.price || 0), 0)
      };
    }

    saveCart(cart);
    renderCheckoutPage();
  }

  function clearCart() {
    saveCart([]);
    renderCheckoutPage();
  }

  function getSelectedPackItems() {
    const cards = Array.from(document.querySelectorAll('.script-card'));
    return cards
      .filter((card) => card.querySelector('.script-choice')?.checked)
      .map((card) => ({
        id: card.dataset.scriptId || makeId(card.dataset.script || card.querySelector('h3')?.textContent || 'script'),
        title: card.dataset.script || card.querySelector('h3')?.textContent.trim() || 'Script item',
        price: Number(card.dataset.price || card.querySelector('.script-price')?.textContent.replace(/[^0-9.]/g, '') || 0)
      }));
  }

  function updatePackTotalDisplay() {
    const display = document.getElementById('packSelectionTotal');
    if (!display) return;
    const selected = getSelectedPackItems();
    display.textContent = `${selected.length} of ${document.querySelectorAll('.script-card').length} scripts selected — ${money(selected.reduce((sum, item) => sum + item.price, 0))}`;
  }

  function setCardSelected(card, checked) {
    card.classList.toggle('selected', checked);
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  async function attachCodePreviews() {
    const packId = document.body.dataset.packId;
    if (!packId) return;

    try {
      const response = await fetch('/api/catalog');
      const data = await response.json();
      const pack = data.catalog.find((p) => p.packId === packId);
      if (!pack) return;

      const scriptsByTitle = {};
      pack.scripts.forEach((script) => {
        scriptsByTitle[script.title] = script;
      });

      document.querySelectorAll('.script-card').forEach((card) => {
        const scriptTitle = card.dataset.script || card.querySelector('h3')?.textContent.trim();
        const script = scriptsByTitle[scriptTitle];
        if (!script || !script.previewSnippet) return;

        const scriptMeta = card.querySelector('.script-meta');
        if (!scriptMeta) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'code-preview-toggle';
        button.setAttribute('data-code-preview-toggle', '');
        button.textContent = '</> Preview code';

        const pre = document.createElement('pre');
        pre.className = 'code-preview';
        pre.hidden = true;
        const code = document.createElement('code');
        code.textContent = script.previewSnippet;
        pre.appendChild(code);

        scriptMeta.parentNode.insertBefore(button, scriptMeta.nextSibling);
        button.parentNode.insertBefore(pre, button.nextSibling);

        button.addEventListener('click', () => {
          pre.hidden = !pre.hidden;
          button.textContent = pre.hidden ? '</> Preview code' : '</> Hide code';
        });
      });
    } catch (error) {
      // Silent fail — if preview loading fails, the buttons are there but won't work
    }
  }

  function attachPackSelection() {
    const cards = document.querySelectorAll('.script-card');
    cards.forEach((card) => {
      setCardSelected(card, true);
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-pressed', 'true');

      if (!card.querySelector('.script-choice')) {
        const row = document.createElement('label');
        row.className = 'script-choice-row';
        row.innerHTML = '<input type="checkbox" class="script-choice" checked> <span>Include this script</span>';
        card.appendChild(row);
      }

      const checkbox = card.querySelector('.script-choice');
      checkbox.addEventListener('change', (event) => {
        setCardSelected(card, event.target.checked);
        card.setAttribute('aria-pressed', String(event.target.checked));
        updatePackTotalDisplay();
      });

      // The whole card toggles selection now, not just the checkbox row —
      // but a click landing directly on the checkbox/label already toggles
      // it natively, so this only needs to handle clicks elsewhere on the
      // card (and avoid double-toggling when the native click bubbles up).
      card.addEventListener('click', (event) => {
        if (event.target.closest('.script-choice-row')) return;
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      });

      card.addEventListener('keydown', (event) => {
        if (event.target.closest('.script-choice-row')) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });

    if (cards.length) updatePackTotalDisplay();

    const selectAllBtn = document.getElementById('selectAllScripts');
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', () => {
        cards.forEach((card) => {
          card.querySelector('.script-choice').checked = true;
          setCardSelected(card, true);
        });
        updatePackTotalDisplay();
      });
    }

    const deselectAllBtn = document.getElementById('deselectAllScripts');
    if (deselectAllBtn) {
      deselectAllBtn.addEventListener('click', () => {
        cards.forEach((card) => {
          card.querySelector('.script-choice').checked = false;
          setCardSelected(card, false);
        });
        updatePackTotalDisplay();
      });
    }

    const button = document.getElementById('addSelectedToCart');
    if (!button) return;

    button.addEventListener('click', () => {
      const packName = document.body.dataset.packName || document.querySelector('.page-header h1')?.textContent || 'Game Pack';
      const packId = document.body.dataset.packId || makeId(packName);
      const selected = getSelectedPackItems();

      if (!selected.length) {
        if (window.ScripForgeToast) window.ScripForgeToast.show('Select at least one script before adding it to your basket.', 'error');
        return;
      }

      const nextPack = addPackToCart(packId, packName, selected);
      button.classList.remove('btn-pulse');
      // eslint-disable-next-line no-unused-expressions
      void button.offsetWidth;
      button.classList.add('btn-pulse');

      if (window.ScripForgeToast) {
        window.ScripForgeToast.show(`${packName} added — ${nextPack.items.length} script${nextPack.items.length === 1 ? '' : 's'} in your basket.`, 'success');
      }
    });
  }

  function renderCheckoutPage() {
    const container = document.getElementById('checkoutPackList');
    if (!container) return;

    const cart = getCart().sort((a, b) => a.name.localeCompare(b.name));
    if (!cart.length) {
      container.innerHTML = '<div class="checkout-empty">Your basket is empty. Add a game pack to get started.</div>';
      const total = document.getElementById('checkoutTotal');
      if (total) total.textContent = money(0);
      const confirmBtn = document.getElementById('confirmPurchaseBtn');
      if (confirmBtn) confirmBtn.disabled = true;
      const cryptoBtn = document.getElementById('cryptoPurchaseBtn');
      if (cryptoBtn) cryptoBtn.disabled = true;
      return;
    }

    const total = cart.reduce((sum, pack) => sum + Number(pack.total || 0), 0);
    container.innerHTML = cart.map((pack) => `
      <div class="checkout-pack-row">
        <div class="checkout-pack-header">
          <div>
            <h4>${pack.name}</h4>
            <small>${pack.items.length} script${pack.items.length === 1 ? '' : 's'}</small>
          </div>
          <button type="button" class="remove-btn" data-remove-pack="${pack.id}">Remove pack</button>
        </div>
        <div class="checkout-pack-items">
          ${pack.items.map((item) => `
            <div class="checkout-item-row">
              <span>${item.title}</span>
              <span class="checkout-item-actions">
                <span>${money(item.price)}</span>
                <button type="button" class="item-remove-btn" data-remove-item="${pack.id}::${item.id}" aria-label="Remove ${item.title} from basket">&times;</button>
              </span>
            </div>
          `).join('')}
        </div>
        <div class="checkout-pack-total">Pack total: ${money(pack.total)}</div>
      </div>
    `).join('');

    const totalNode = document.getElementById('checkoutTotal');
    if (totalNode) totalNode.textContent = money(total);

    const confirmBtn = document.getElementById('confirmPurchaseBtn');
    if (confirmBtn) confirmBtn.disabled = false;
    const cryptoBtn = document.getElementById('cryptoPurchaseBtn');
    if (cryptoBtn) cryptoBtn.disabled = false;

    document.querySelectorAll('[data-remove-pack]').forEach((button) => {
      button.addEventListener('click', () => removePackFromCart(button.dataset.removePack));
    });

    document.querySelectorAll('[data-remove-item]').forEach((button) => {
      button.addEventListener('click', () => {
        const [packId, itemId] = button.dataset.removeItem.split('::');
        removeItemFromCart(packId, itemId);
      });
    });
  }

  function bindCatalogFilters() {
    const form = document.getElementById('catalogFilters');
    if (!form) return;

    // Queried fresh on every run (not captured once) because the catalog
    // grid can be populated asynchronously after this binds — see
    // js/catalog-page.js, which fetches /api/catalog and calls
    // window.ScripForgeCatalogPage.applyFilters() once cards exist.
    const update = () => {
      const cards = Array.from(document.querySelectorAll('.catalog-card'));
      const genre = document.getElementById('catalogGenre')?.value || 'all';
      const maxPrice = Number(document.getElementById('catalogPrice')?.value || 0);
      const query = (document.getElementById('catalogSearch')?.value || '').trim().toLowerCase();

      cards.forEach((card) => {
        const matchesGenre = genre === 'all' || card.dataset.genre === genre;
        const matchesPrice = !maxPrice || Number(card.dataset.price) <= maxPrice;
        const haystack = (card.textContent || '').toLowerCase();
        const matchesQuery = !query || haystack.includes(query);
        card.style.display = matchesGenre && matchesPrice && matchesQuery ? 'block' : 'none';
      });
    };

    form.querySelectorAll('select, input').forEach((input) => {
      input.addEventListener('input', update);
      input.addEventListener('change', update);
    });

    window.ScripForgeCatalogFilters = { applyFilters: update };
  }

  // Sticky mobile CTA bars forward their click to the real button elsewhere on
  // the page, so there's exactly one place that owns the actual add-to-basket
  // or confirm-purchase logic (validation, toasts, disabled state, etc.).
  function setupStickyForwarding() {
    document.querySelectorAll('[data-sticky-forward]').forEach((button) => {
      button.addEventListener('click', () => {
        const target = document.getElementById(button.dataset.stickyForward);
        if (target && !target.disabled) target.click();
      });
    });
  }

  function setupMobileMenu() {
    const toggle = document.getElementById('mobileToggle');
    const menu = document.getElementById('navMenu');
    if (!toggle || !menu) return;

    function setOpen(open) {
      menu.classList.toggle('active', open);
      toggle.setAttribute('aria-expanded', String(open));
      // Locks background scroll while the dropdown covers the page — without
      // this, a long page scrolls underneath the open menu on touch devices,
      // which reads as broken rather than a deliberate overlay.
      document.body.classList.toggle('mobile-menu-open', open);
    }

    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => setOpen(!menu.classList.contains('active')));

    // Tapping a link inside the open menu should navigate AND close it —
    // without this the menu stays open underneath the next page until
    // manually dismissed, which is what actually looked "broken" on mobile.
    menu.addEventListener('click', (event) => {
      if (event.target.closest('a, button')) setOpen(false);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setOpen(false);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
    attachPackSelection();
    attachCodePreviews();
    renderCheckoutPage();
    bindCatalogFilters();
    setupMobileMenu();
    setupStickyForwarding();
    const yearEl = document.getElementById('footerYear');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  });

  // Re-render anything this file owns that shows a price whenever the
  // shopper switches currency (js/currency.js), instead of requiring a
  // page reload to see it reflected everywhere.
  window.addEventListener('scripforge:currencychange', () => {
    renderCheckoutPage();
    if (document.getElementById('packSelectionTotal')) updatePackTotalDisplay();
  });

  window.ScripForgeCart = {
    getCart,
    saveCart,
    addPackToCart,
    removePackFromCart,
    removeItemFromCart,
    clearCart,
    renderCheckoutPage,
    updateCartCount
  };

  window.addPackToCart = addPackToCart;
  window.removePackFromCart = removePackFromCart;
})();
