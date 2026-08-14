(function () {
  function statusLabel(status) {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  function paymentLabel(provider) {
    return provider === 'crypto' ? 'Crypto' : 'Card';
  }

  function renderOrders(orders) {
    const container = document.getElementById('orderHistory');
    if (!orders.length) {
      container.innerHTML = '<p class="empty-state">You haven\'t bought anything yet.</p>';
      return;
    }

    const { escapeHtml } = window.ScriptForgeAuth;
    container.innerHTML = orders.map((order) => `
      <div class="checkout-pack-row">
        <div class="checkout-pack-header">
          <div>
            <h4>Order SF-${order.id}</h4>
            <small>${new Date(order.createdAt.replace(' ', 'T') + 'Z').toLocaleString()} · ${paymentLabel(order.paymentProvider)}</small>
          </div>
          <span class="status-badge status-${escapeHtml(order.status)}">${escapeHtml(statusLabel(order.status))}</span>
        </div>
        <div class="checkout-pack-items">
          ${order.items.map((item) => `
            <div class="checkout-item-row">
              <span>${escapeHtml(item.packName)} — ${escapeHtml(item.scriptTitle)}</span>
              <span>${order.currencySymbol}${item.priceAmount.toFixed(2)}</span>
            </div>
          `).join('')}
        </div>
        <div class="checkout-pack-total">Total: ${order.currencySymbol}${order.totalAmount.toFixed(2)}</div>
      </div>
    `).join('');
  }

  function toast(message, type) {
    if (window.ScriptForgeToast) window.ScriptForgeToast.show(message, type);
  }

  function money(usdAmount) {
    return window.ScriptForgeCurrency ? window.ScriptForgeCurrency.formatUsd(usdAmount) : `$${Number(usdAmount).toFixed(2)}`;
  }

  async function loadWishlist() {
    const section = document.getElementById('wishlistSection');
    const container = document.getElementById('wishlistContainer');

    try {
      const { packs } = await window.ScriptForgeAuth.apiFetch('/api/account/wishlist');
      section.hidden = false;

      if (!packs.length) {
        container.innerHTML = '<p class="empty-state">Nothing saved yet — tap the heart icon on any pack in the catalog to save it here.</p>';
        return;
      }

      const { escapeHtml } = window.ScriptForgeAuth;
      container.innerHTML = packs.map((pack) => {
        const total = pack.scripts.reduce((sum, s) => sum + s.price, 0);
        return `
          <div class="checkout-pack-row">
            <div class="checkout-pack-header">
              <div>
                <h4>${escapeHtml(pack.packName)}${pack.hidden ? ' <span class="status-badge status-failed">No longer available</span>' : ''}</h4>
                <small>${pack.scripts.length} script${pack.scripts.length === 1 ? '' : 's'} · ${money(total)}</small>
              </div>
              <button type="button" class="remove-btn" data-remove-wishlist="${escapeHtml(pack.packId)}">Remove</button>
            </div>
          </div>
        `;
      }).join('');

      container.querySelectorAll('[data-remove-wishlist]').forEach((button) => {
        button.addEventListener('click', async () => {
          try {
            await window.ScriptForgeAuth.apiFetch(`/api/account/wishlist/${encodeURIComponent(button.dataset.removeWishlist)}`, { method: 'DELETE' });
            toast('Removed from saved packs.', 'success');
            loadWishlist();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      // 404 here just means the wishlist feature is turned off — leave the
      // section hidden rather than showing an error for a disabled feature.
      section.hidden = true;
    }
  }

  function starsHtml(current) {
    return Array.from({ length: 5 }, (_, i) => {
      const value = i + 1;
      return `<button type="button" class="star-btn ${value <= current ? 'filled' : ''}" data-star="${value}" aria-label="${value} star${value === 1 ? '' : 's'}">★</button>`;
    }).join('');
  }

  async function loadReviews(paidOrders) {
    const section = document.getElementById('reviewsSection');
    const container = document.getElementById('reviewsContainer');

    const uniquePacks = new Map();
    paidOrders.forEach((order) => order.items.forEach((item) => {
      if (!uniquePacks.has(item.packId)) uniquePacks.set(item.packId, item.packName);
    }));

    if (!uniquePacks.size) { section.hidden = true; return; }
    section.hidden = false;

    const { escapeHtml, apiFetch } = window.ScriptForgeAuth;
    const entries = await Promise.all(
      Array.from(uniquePacks.entries()).map(async ([packId, packName]) => {
        const data = await apiFetch(`/api/account/reviews/${encodeURIComponent(packId)}`).catch(() => ({ review: null }));
        return { packId, packName, review: data.review };
      })
    );

    container.innerHTML = entries.map(({ packId, packName, review }) => `
      <div class="settings-row review-row" data-review-pack="${escapeHtml(packId)}">
        <div style="width:100%">
          <h3>${escapeHtml(packName)}</h3>
          <div class="star-picker" data-current="${review ? review.rating : 0}">${starsHtml(review ? review.rating : 0)}</div>
          <textarea class="review-comment" maxlength="1000" placeholder="Optional comment">${review ? escapeHtml(review.comment || '') : ''}</textarea>
          <button type="button" class="btn btn-secondary btn-small save-review-btn">Save review</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.star-picker').forEach((picker) => {
      picker.querySelectorAll('.star-btn').forEach((star) => {
        star.addEventListener('click', () => {
          const value = Number(star.dataset.star);
          picker.dataset.current = value;
          picker.querySelectorAll('.star-btn').forEach((s) => s.classList.toggle('filled', Number(s.dataset.star) <= value));
        });
      });
    });

    container.querySelectorAll('.review-row').forEach((row) => {
      row.querySelector('.save-review-btn').addEventListener('click', async () => {
        const packId = row.dataset.reviewPack;
        const rating = Number(row.querySelector('.star-picker').dataset.current);
        const comment = row.querySelector('.review-comment').value.trim();
        if (!rating) { toast('Pick a star rating first.', 'error'); return; }
        try {
          await window.ScriptForgeAuth.apiFetch(`/api/account/reviews/${encodeURIComponent(packId)}`, {
            method: 'POST',
            body: { rating, comment }
          });
          toast('Review saved — thanks!', 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  function setupEmailForm(user) {
    const toggleBtn = document.getElementById('toggleEmailForm');
    const form = document.getElementById('emailForm');
    const errorBox = document.getElementById('emailError');
    const statusText = document.getElementById('emailStatus');
    const input = document.getElementById('emailInput');

    function renderStatus(email) {
      statusText.textContent = email
        ? `${email} — used for password reset and order receipts.`
        : 'No email on file. Add one to enable password reset and order receipts.';
      toggleBtn.textContent = email ? 'Update email' : 'Add email';
      input.value = email || '';
    }
    renderStatus(user.email);

    toggleBtn.addEventListener('click', () => {
      form.hidden = !form.hidden;
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorBox.hidden = true;

      try {
        const data = await window.ScriptForgeAuth.apiFetch('/api/account/email', {
          method: 'POST',
          body: { email: input.value.trim() }
        });
        renderStatus(data.email);
        form.hidden = true;
        toast('Email updated.', 'success');
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
      }
    });
  }

  function setupPasswordForm() {
    const toggleBtn = document.getElementById('togglePasswordForm');
    const form = document.getElementById('passwordForm');
    const errorBox = document.getElementById('passwordError');

    toggleBtn.addEventListener('click', () => {
      form.hidden = !form.hidden;
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorBox.hidden = true;

      const currentPassword = document.getElementById('currentPassword').value;
      const newPassword = document.getElementById('newPassword').value;

      try {
        await window.ScriptForgeAuth.apiFetch('/api/account/password', {
          method: 'POST',
          body: { currentPassword, newPassword }
        });
        form.reset();
        form.hidden = true;
        toast('Password updated.', 'success');
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await window.ScriptForgeAuth.refreshCsrfToken();
      const user = await window.ScriptForgeAuth.loadCurrentUser();

      if (!user) {
        document.getElementById('accountGate').hidden = false;
        return;
      }

      document.getElementById('accountContent').hidden = false;
      document.getElementById('accountUsername').textContent = `Hi, ${user.username}`;

      setupEmailForm(user);
      setupPasswordForm();

      const { orders } = await window.ScriptForgeAuth.apiFetch('/api/account/orders');
      renderOrders(orders);
      loadReviews(orders.filter((o) => o.status === 'paid'));
      if (window.ScriptForgeFlags) {
        await window.ScriptForgeFlags.ready;
        if (window.ScriptForgeFlags.isEnabled('wishlist')) loadWishlist();
      }
    } catch (err) {
      document.getElementById('accountGate').hidden = false;
    }
  });
})();
