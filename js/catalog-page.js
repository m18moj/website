(function () {
  const GENRE_CHIPS = {
    sandbox: 'Sandbox', 'battle-royale': 'Battle Royale', rpg: 'RPG', shooter: 'Shooter',
    creator: 'Creator', 'open-world': 'Open World', other: 'Other'
  };
  const NEW_BADGE_DAYS = 14;

  function escapeHtml(value) {
    return window.ScripForgeAuth ? window.ScripForgeAuth.escapeHtml(value) : String(value);
  }

  function isRecent(createdAt) {
    if (!createdAt) return false;
    const created = new Date(createdAt.replace(' ', 'T') + 'Z').getTime();
    return Date.now() - created < NEW_BADGE_DAYS * 24 * 60 * 60 * 1000;
  }

  function cardHtml(pack, { showNewBadge, showWishlist, wishlisted }) {
    const totalUsd = pack.scripts.reduce((sum, s) => sum + s.price, 0);
    const chip = GENRE_CHIPS[pack.genre] || 'Game Pack';

    // Packs authored on the site (the original nine) get a hand-built
    // landing page to link to. Anything created from the admin dashboard
    // without one gets a straightforward "add the whole pack" button here
    // instead, so it's still actually buyable without a bespoke page.
    const action = pack.detailUrl
      ? `<a href="../${pack.detailUrl}" class="btn btn-secondary">View pack</a>`
      : `<button type="button" class="btn btn-secondary" data-quick-add-pack="${escapeHtml(pack.packId)}">Add full pack to cart</button>`;

    const newBadge = showNewBadge && isRecent(pack.createdAt) ? '<span class="chip chip-new">New</span>' : '';
    const wishlistBtn = showWishlist
      ? `<button type="button" class="wishlist-btn ${wishlisted ? 'active' : ''}" data-wishlist-toggle="${escapeHtml(pack.packId)}" aria-label="${wishlisted ? 'Remove from saved packs' : 'Save this pack'}" aria-pressed="${wishlisted}">
           <svg viewBox="0 0 24 24" fill="${wishlisted ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 21s-7.5-4.6-10-9.2C0.4 8.4 2 5 5.5 5c2 0 3.5 1.1 4.5 2.6C11 6.1 12.5 5 14.5 5 18 5 19.6 8.4 22 11.8 19.5 16.4 12 21 12 21z"/></svg>
         </button>`
      : '';

    const previewScript = pack.scripts.find((s) => s.previewSnippet);
    const codePreview = previewScript
      ? `
        <button type="button" class="code-preview-toggle" data-code-preview-toggle>&lt;/&gt; Preview code</button>
        <pre class="code-preview" hidden><code>${escapeHtml(previewScript.previewSnippet)}</code></pre>
      `
      : '';

    return `
      <article class="catalog-card game-card" data-genre="${escapeHtml(pack.genre)}" data-price="${totalUsd}" id="${escapeHtml(pack.packId)}">
        <div class="game-splash ${escapeHtml(pack.splash || 'custom')}" data-game="${escapeHtml(pack.dataGame || pack.gameTitle || pack.packName)}">
          ${wishlistBtn}
        </div>
        <div class="game-card-body">
          <span class="chip">${escapeHtml(chip)}</span>${newBadge}
          <h3>${escapeHtml(pack.packName)}</h3>
          <p>${escapeHtml(pack.description || '')}</p>
          <div class="card-meta"><span>${pack.scripts.length} script${pack.scripts.length === 1 ? '' : 's'}</span><span data-usd-price="${totalUsd}">$${totalUsd}</span></div>
          ${codePreview}
          ${action}
        </div>
      </article>
    `;
  }

  async function getWishlistedPackIds() {
    if (!window.ScripForgeAuth) return new Set();
    try {
      const me = await window.ScripForgeAuth.loadCurrentUser();
      if (!me) return new Set();
      const data = await window.ScripForgeAuth.apiFetch('/api/account/wishlist');
      return new Set(data.packs.map((p) => p.packId));
    } catch (err) {
      return new Set();
    }
  }

  async function toggleWishlist(packId, isSaved) {
    await window.ScripForgeAuth.refreshCsrfToken();
    if (isSaved) {
      await window.ScripForgeAuth.apiFetch(`/api/account/wishlist/${encodeURIComponent(packId)}`, { method: 'DELETE' });
    } else {
      await window.ScripForgeAuth.apiFetch(`/api/account/wishlist/${encodeURIComponent(packId)}`, { method: 'POST' });
    }
  }

  async function render() {
    const grid = document.getElementById('catalogGrid');
    if (!grid) return;

    try {
      const [catalogRes, flags] = await Promise.all([
        fetch('/api/catalog').then((r) => r.json()),
        window.ScripForgeFlags ? window.ScripForgeFlags.ready : Promise.resolve({})
      ]);
      const packs = (catalogRes.catalog || []).filter((p) => p.scripts.length > 0);
      const showNewBadge = Boolean(flags && flags.newBadges);
      const showWishlist = Boolean(flags && flags.wishlist);
      const wishlisted = showWishlist ? await getWishlistedPackIds() : new Set();

      grid.innerHTML = packs.length
        ? packs.map((pack) => cardHtml(pack, { showNewBadge, showWishlist, wishlisted: wishlisted.has(pack.packId) })).join('')
        : '<p class="empty-state">No packs are available right now — check back soon.</p>';

      grid.querySelectorAll('[data-code-preview-toggle]').forEach((button) => {
        button.addEventListener('click', () => {
          const pre = button.nextElementSibling;
          pre.hidden = !pre.hidden;
          button.textContent = pre.hidden ? '</> Preview code' : '</> Hide code';
        });
      });

      grid.querySelectorAll('[data-quick-add-pack]').forEach((button) => {
        button.addEventListener('click', () => {
          const pack = packs.find((p) => p.packId === button.dataset.quickAddPack);
          if (!pack || !window.ScripForgeCart) return;
          const added = window.ScripForgeCart.addPackToCart(pack.packId, pack.packName, pack.scripts);
          if (window.ScripForgeToast) {
            window.ScripForgeToast.show(`${pack.packName} added — ${added.items.length} script${added.items.length === 1 ? '' : 's'} in your basket.`, 'success');
          }
        });
      });

      grid.querySelectorAll('[data-wishlist-toggle]').forEach((button) => {
        button.addEventListener('click', async (event) => {
          event.preventDefault();
          const packId = button.dataset.wishlistToggle;
          const me = await window.ScripForgeAuth.loadCurrentUser();
          if (!me) {
            window.location.href = 'login.html?redirect=catalog.html';
            return;
          }
          const isSaved = button.classList.contains('active');
          try {
            await toggleWishlist(packId, isSaved);
            button.classList.toggle('active', !isSaved);
            button.setAttribute('aria-pressed', String(!isSaved));
            button.querySelector('svg').setAttribute('fill', !isSaved ? 'currentColor' : 'none');
            if (window.ScripForgeToast) {
              window.ScripForgeToast.show(isSaved ? 'Removed from saved packs.' : 'Saved — find it on your account page.', 'success');
            }
          } catch (err) {
            if (window.ScripForgeToast) window.ScripForgeToast.show(err.message, 'error');
          }
        });
      });

      if (window.ScripForgeCurrency) window.ScripForgeCurrency.applyCurrencyToDom();

      // A search from the nav bar (js/search.js) lands here with ?q=... —
      // carry it into the existing search filter box and run it once.
      const queryParam = new URLSearchParams(window.location.search).get('q');
      const searchInput = document.getElementById('catalogSearch');
      if (queryParam && searchInput) searchInput.value = queryParam;

      if (window.ScripForgeCatalogFilters) window.ScripForgeCatalogFilters.applyFilters();
    } catch (err) {
      grid.innerHTML = '<p class="empty-state">Could not load the catalog right now. Try refreshing the page.</p>';
    }
  }

  document.addEventListener('DOMContentLoaded', render);
})();
