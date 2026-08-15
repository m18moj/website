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

    const { escapeHtml } = window.ScripForgeAuth;
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
    if (window.ScripForgeToast) window.ScripForgeToast.show(message, type);
  }

  function money(usdAmount) {
    return window.ScripForgeCurrency ? window.ScripForgeCurrency.formatUsd(usdAmount) : `$${Number(usdAmount).toFixed(2)}`;
  }

  async function loadWishlist() {
    const section = document.getElementById('wishlistSection');
    const container = document.getElementById('wishlistContainer');

    try {
      const { packs } = await window.ScripForgeAuth.apiFetch('/api/account/wishlist');
      section.hidden = false;

      if (!packs.length) {
        container.innerHTML = '<p class="empty-state">Nothing saved yet — tap the heart icon on any pack in the catalog to save it here.</p>';
        return;
      }

      const { escapeHtml } = window.ScripForgeAuth;
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
            await window.ScripForgeAuth.apiFetch(`/api/account/wishlist/${encodeURIComponent(button.dataset.removeWishlist)}`, { method: 'DELETE' });
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

    const { escapeHtml, apiFetch } = window.ScripForgeAuth;
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
          await window.ScripForgeAuth.apiFetch(`/api/account/reviews/${encodeURIComponent(packId)}`, {
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
        const data = await window.ScripForgeAuth.apiFetch('/api/account/email', {
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

  const DISCORD_ERROR_MESSAGES = {
    denied: 'Discord linking was cancelled.',
    already_linked: 'That Discord account is already linked to a different ScripForge account. Disconnect it there first, or contact support.',
    invalid_state: 'That link attempt expired or was invalid — please try again.',
    not_configured: 'Discord linking is not available right now.',
    exchange_failed: "Couldn't complete Discord linking — please try again.",
    unknown: 'Something went wrong linking Discord — please try again.'
  };

  function consumeDiscordRedirectParams() {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('discord');
    if (!result) return null;

    params.delete('discord');
    const reason = params.get('reason');
    params.delete('reason');
    const cleanQuery = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (cleanQuery ? `?${cleanQuery}` : ''));

    if (result === 'linked') return { type: 'success', message: 'Discord account connected!' };
    return { type: 'error', message: DISCORD_ERROR_MESSAGES[reason] || DISCORD_ERROR_MESSAGES.unknown };
  }

  async function setupDiscordLink() {
    const statusText = document.getElementById('discordLinkStatus');
    const linkBtn = document.getElementById('discordLinkBtn');
    const unlinkBtn = document.getElementById('discordUnlinkBtn');
    const { escapeHtml, apiFetch } = window.ScripForgeAuth;

    async function refresh() {
      try {
        const data = await apiFetch('/api/discord/status');
        if (!data.configured) {
          statusText.textContent = 'Not available right now.';
          linkBtn.hidden = true;
          unlinkBtn.hidden = true;
          return;
        }
        if (data.linked) {
          statusText.textContent = `Connected as ${escapeHtml(data.discordTag)}.`;
          linkBtn.hidden = true;
          unlinkBtn.hidden = false;
        } else {
          statusText.textContent = 'Not connected. Link your account to get the Verified Customer role automatically.';
          linkBtn.hidden = false;
          unlinkBtn.hidden = true;
        }
      } catch (err) {
        statusText.textContent = 'Not available right now.';
        linkBtn.hidden = true;
        unlinkBtn.hidden = true;
      }
    }

    linkBtn.addEventListener('click', () => {
      // Full-page navigation, not a fetch — this has to leave the site to
      // reach Discord's consent screen.
      window.location.href = '/api/discord/start';
    });

    unlinkBtn.addEventListener('click', async () => {
      try {
        await apiFetch('/api/discord/unlink', { method: 'POST' });
        toast('Discord account disconnected.', 'success');
        await refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    const redirectResult = consumeDiscordRedirectParams();
    if (redirectResult) toast(redirectResult.message, redirectResult.type);

    await refresh();
  }

  function setupNicknameForm(user) {
    const toggleBtn = document.getElementById('toggleNicknameForm');
    const form = document.getElementById('nicknameForm');
    const errorBox = document.getElementById('nicknameError');
    const statusText = document.getElementById('nicknameStatus');
    const input = document.getElementById('nicknameInput');

    function renderStatus(nickname) {
      statusText.textContent = nickname ? `Currently "${nickname}".` : 'Not set yet — pick one to show across the site.';
      input.value = nickname || '';
    }
    renderStatus(user.nickname);
    if (!user.nickname) form.hidden = false; // mandatory — prompt immediately if never set

    toggleBtn.addEventListener('click', () => {
      form.hidden = !form.hidden;
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorBox.hidden = true;
      try {
        const data = await window.ScripForgeAuth.apiFetch('/api/account/nickname', {
          method: 'POST',
          body: { nickname: input.value.trim() }
        });
        renderStatus(data.user.nickname);
        form.hidden = true;
        toast('Nickname saved.', 'success');
        document.getElementById('accountUsername').textContent = `Hi, ${data.user.nickname}`;
        if (window.ScripForgeAuth.loadCurrentUser) {
          await window.ScripForgeAuth.loadCurrentUser();
          const navRefresh = document.getElementById('authControl');
          if (navRefresh) window.location.reload();
        }
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
      }
    });
  }

  function setupTotp(user) {
    const { apiFetch } = window.ScripForgeAuth;
    const statusText = document.getElementById('totpStatus');
    const toggleBtn = document.getElementById('totpToggleBtn');
    const setupPanel = document.getElementById('totpSetupPanel');
    const recoveryPanel = document.getElementById('totpRecoveryPanel');
    const recoveryList = document.getElementById('totpRecoveryCodesList');
    const disableForm = document.getElementById('totpDisableForm');
    const regenerateRow = document.getElementById('totpRegenerateRow');
    const regenerateRemaining = document.getElementById('totpRecoveryRemaining');

    let enabled = user.totpEnabled;

    function renderStatus() {
      statusText.textContent = enabled ? 'Enabled — required at sign-in.' : 'Not enabled. Add an extra layer of security to your account.';
      toggleBtn.textContent = enabled ? 'Disable 2FA' : 'Enable 2FA';
      regenerateRow.hidden = !enabled;
      if (enabled) regenerateRemaining.textContent = `${user.recoveryCodesRemaining ?? 0} unused recovery code(s).`;
    }
    renderStatus();

    function showRecoveryCodes(codes) {
      recoveryList.innerHTML = codes.map((c) => `<li><code>${window.ScripForgeAuth.escapeHtml(c)}</code></li>`).join('');
      recoveryPanel.hidden = false;
      setupPanel.hidden = true;
    }

    toggleBtn.addEventListener('click', async () => {
      if (enabled) {
        disableForm.hidden = !disableForm.hidden;
        setupPanel.hidden = true;
        return;
      }
      disableForm.hidden = true;
      try {
        const data = await apiFetch('/api/account/2fa/setup');
        document.getElementById('totpQrImage').src = data.qrCodeDataUrl;
        document.getElementById('totpSecretText').textContent = data.secret;
        setupPanel.hidden = false;
        recoveryPanel.hidden = true;
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    document.getElementById('totpConfirmEnableBtn').addEventListener('click', async () => {
      const errorBox = document.getElementById('totpSetupError');
      errorBox.hidden = true;
      const code = document.getElementById('totpEnableCode').value.trim();
      try {
        const data = await apiFetch('/api/account/2fa/enable', { method: 'POST', body: { code } });
        enabled = true;
        user.recoveryCodesRemaining = data.recoveryCodes.length;
        renderStatus();
        showRecoveryCodes(data.recoveryCodes);
        toast('2FA enabled.', 'success');
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
      }
    });

    document.getElementById('totpRecoveryDoneBtn').addEventListener('click', () => {
      recoveryPanel.hidden = true;
    });

    disableForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorBox = document.getElementById('totpDisableError');
      errorBox.hidden = true;
      try {
        await apiFetch('/api/account/2fa/disable', { method: 'POST', body: { password: document.getElementById('totpDisablePassword').value } });
        enabled = false;
        disableForm.reset();
        disableForm.hidden = true;
        renderStatus();
        toast('2FA disabled.', 'success');
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
      }
    });

    document.getElementById('totpRegenerateBtn').addEventListener('click', async () => {
      const password = window.prompt('Confirm your password to regenerate recovery codes:');
      if (!password) return;
      try {
        const data = await apiFetch('/api/account/2fa/recovery-codes/regenerate', { method: 'POST', body: { password } });
        user.recoveryCodesRemaining = data.recoveryCodes.length;
        showRecoveryCodes(data.recoveryCodes);
        recoveryPanel.hidden = false;
        renderStatus();
        toast('New recovery codes generated — old ones no longer work.', 'success');
      } catch (err) {
        toast(err.message, 'error');
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
        await window.ScripForgeAuth.apiFetch('/api/account/password', {
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
      await window.ScripForgeAuth.refreshCsrfToken();
      const user = await window.ScripForgeAuth.loadCurrentUser();

      if (!user) {
        document.getElementById('accountGate').hidden = false;
        return;
      }

      document.getElementById('accountContent').hidden = false;
      document.getElementById('accountUsername').textContent = `Hi, ${user.nickname || user.username}`;

      setupNicknameForm(user);
      setupEmailForm(user);
      setupPasswordForm();
      setupTotp(user);
      setupDiscordLink();

      document.getElementById('accountLogoutBtn').addEventListener('click', async () => {
        try {
          await window.ScripForgeAuth.logout();
          window.location.href = 'login';
        } catch (err) {
          toast(err.message, 'error');
        }
      });

      const { orders } = await window.ScripForgeAuth.apiFetch('/api/account/orders');
      renderOrders(orders);
      loadReviews(orders.filter((o) => o.status === 'paid'));
      if (window.ScripForgeFlags) {
        await window.ScripForgeFlags.ready;
        if (window.ScripForgeFlags.isEnabled('wishlist')) loadWishlist();
      }
    } catch (err) {
      document.getElementById('accountGate').hidden = false;
    }
  });
})();
