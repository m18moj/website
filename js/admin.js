(function () {
  let cachedUserId = null;
  let cachedTotpEnabled = false;

  function formatDate(isoString) {
    if (!isoString) return '—';
    return new Date(isoString.replace(' ', 'T') + 'Z').toLocaleString();
  }

  function toast(message, type) {
    if (window.ScripForgeToast) window.ScripForgeToast.show(message, type);
  }

  function paymentLabel(provider) {
    return provider === 'crypto' ? 'Crypto' : 'Card';
  }

  const CURRENCY_SYMBOLS = { GBP: '£', USD: '$', EUR: '€' };

  function formatRevenue(revenueByCurrency) {
    if (!revenueByCurrency.length) return '—';
    return revenueByCurrency
      .map((row) => `${CURRENCY_SYMBOLS[row.currency] || ''}${row.amount.toFixed(2)} ${row.currency}`)
      .join(' + ');
  }

  function showAdminTab(tab) {
    document.querySelectorAll('.admin-tab').forEach((el) => el.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach((el) => el.classList.remove('active'));
    document.getElementById(tab).classList.add('active');
    document.querySelector(`[data-admin-tab="${tab}"]`).classList.add('active');
  }

  // Filters already-rendered table rows client-side (no extra round trip) —
  // both tables are small enough for a small store that this stays instant.
  function setupSearchFilters() {
    const userSearch = document.getElementById('userSearchInput');
    if (userSearch) {
      userSearch.addEventListener('input', () => {
        const q = userSearch.value.trim().toLowerCase();
        document.querySelectorAll('#usersContainer .users-table tbody > tr:not(.user-detail-row)').forEach((row) => {
          const match = row.textContent.toLowerCase().includes(q);
          row.style.display = match ? '' : 'none';
          const detailRow = row.nextElementSibling;
          if (detailRow && detailRow.classList.contains('user-detail-row') && !match) detailRow.hidden = true;
        });
      });
    }

    const orderSearch = document.getElementById('orderSearchInput');
    if (orderSearch) {
      orderSearch.addEventListener('input', () => {
        const q = orderSearch.value.trim().toLowerCase();
        document.querySelectorAll('#ordersContainer .orders-table tbody > tr:not(.order-detail-row)').forEach((row) => {
          const match = row.textContent.toLowerCase().includes(q);
          row.style.display = match ? '' : 'none';
          const detailRow = row.nextElementSibling;
          if (detailRow && detailRow.classList.contains('order-detail-row') && !match) detailRow.hidden = true;
        });
      });
    }
  }

  function setupTabs() {
    document.querySelectorAll('[data-admin-tab]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        showAdminTab(link.dataset.adminTab);
      });
    });
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  async function loadSystemStatus() {
    const { apiFetch } = window.ScripForgeAuth;
    const status = await apiFetch('/api/admin/system-status');
    const container = document.getElementById('systemStatusContainer');

    const dot = (ok) => `<span class="status-dot ${ok ? 'ok' : 'off'}"></span>`;

    container.innerHTML = `
      <div class="system-status-grid">
        <div class="system-status-item"><span>${dot(status.stripeConfigured)}Card payments (Stripe)</span><strong>${status.stripeConfigured ? 'Configured' : 'Not configured'}</strong></div>
        <div class="system-status-item"><span>${dot(status.cryptoConfigured)}Crypto payments (NOWPayments)</span><strong>${status.cryptoConfigured ? 'Configured' : 'Not configured'}</strong></div>
        <div class="system-status-item"><span>App version</span><strong>v${status.appVersion}</strong></div>
        <div class="system-status-item"><span>Node.js</span><strong>${status.nodeVersion}</strong></div>
        <div class="system-status-item"><span>Environment</span><strong>${status.environment}</strong></div>
        <div class="system-status-item"><span>Platform</span><strong>${status.platform}</strong></div>
        <div class="system-status-item"><span>CPU cores</span><strong>${status.cpuCount}</strong></div>
        <div class="system-status-item"><span>Server uptime</span><strong>${status.uptimeText}</strong></div>
        <div class="system-status-item"><span>Memory in use</span><strong>${status.memoryUsedMb} / ${status.memoryTotalMb} MB (heap)</strong></div>
        <div class="system-status-item"><span>Process RSS</span><strong>${status.rssMb} MB</strong></div>
        <div class="system-status-item"><span>Database size</span><strong>${formatBytes(status.databaseSizeBytes)}</strong></div>
        <div class="system-status-item"><span>Active sessions</span><strong>${status.activeSessions}</strong></div>
        <div class="system-status-item"><span>Users / Admins</span><strong>${status.userCount} / ${status.adminCount}</strong></div>
        <div class="system-status-item"><span>Catalog</span><strong>${status.packCount} packs / ${status.scriptCount} scripts</strong></div>
      </div>
    `;
  }

  const GENRE_LABELS = {
    sandbox: 'Sandbox', 'battle-royale': 'Battle Royale', rpg: 'RPG', shooter: 'Shooter',
    creator: 'Creator', 'open-world': 'Open World', other: 'Other'
  };

  function packEditFormHtml(pack) {
    const p = pack || { packName: '', gameTitle: '', genre: 'other', description: '', detailUrl: '' };
    const { escapeHtml } = window.ScripForgeAuth;
    return `
      <div class="form-grid">
        <div class="form-group">
          <label>Pack name</label>
          <input class="pf-name" value="${escapeHtml(p.packName)}" maxlength="80" required>
        </div>
        <div class="form-group">
          <label>Game title</label>
          <input class="pf-title" value="${escapeHtml(p.gameTitle)}" maxlength="80">
        </div>
        <div class="form-group">
          <label>Genre</label>
          <select class="pf-genre">
            ${Object.entries(GENRE_LABELS).map(([value, label]) => `<option value="${value}" ${p.genre === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Detail page URL</label>
          <input class="pf-detail-url" value="${escapeHtml(p.detailUrl || '')}" maxlength="200" placeholder="games/game-example">
        </div>
      </div>
      <div class="form-group">
        <label>Description</label>
        <textarea class="pf-description" maxlength="400" rows="2">${escapeHtml(p.description || '')}</textarea>
      </div>
      <p class="form-error catalog-form-error" role="alert" hidden></p>
    `;
  }

  function readPackForm(scope) {
    return {
      packName: scope.querySelector('.pf-name').value.trim(),
      gameTitle: scope.querySelector('.pf-title').value.trim(),
      genre: scope.querySelector('.pf-genre').value,
      description: scope.querySelector('.pf-description').value.trim(),
      detailUrl: scope.querySelector('.pf-detail-url').value.trim()
    };
  }

  function scriptRowHtml(packId, script) {
    const { escapeHtml } = window.ScripForgeAuth;
    return `
      <div class="catalog-pack-script ${script.hidden ? 'script-hidden' : ''}" data-script-row="${packId}::${escapeHtml(script.id)}">
        <div class="script-view">
          <span>${escapeHtml(script.title)}${script.hidden ? ' <span class="status-badge status-failed">Hidden</span>' : ''}</span>
          <span>${money(script.price)}</span>
        </div>
        <div class="catalog-script-actions">
          <button type="button" class="btn-tiny" data-toggle-script-edit="${packId}::${escapeHtml(script.id)}">Edit</button>
          <button type="button" class="btn-tiny" data-toggle-script-hidden="${packId}::${escapeHtml(script.id)}" data-hidden="${script.hidden}">${script.hidden ? 'Show' : 'Hide'}</button>
          <button type="button" class="btn-tiny btn-delete" data-delete-script="${packId}::${escapeHtml(script.id)}">Delete</button>
        </div>
        <form class="script-edit-form" data-script-edit-form="${packId}::${escapeHtml(script.id)}" hidden>
          <input type="text" class="sf-title" value="${escapeHtml(script.title)}" maxlength="80" required>
          <input type="number" class="sf-price" value="${script.price}" step="0.01" min="0" max="1000" required>
          <button type="submit" class="btn-tiny btn-primary">Save</button>
          <p class="form-error script-form-error" role="alert" hidden></p>
        </form>
      </div>
    `;
  }

  function money(usdAmount) {
    return window.ScripForgeCurrency ? window.ScripForgeCurrency.formatUsd(usdAmount) : `$${Number(usdAmount).toFixed(2)}`;
  }

  function packCardHtml(pack) {
    const { escapeHtml } = window.ScripForgeAuth;
    const total = pack.scripts.filter((s) => !s.hidden).reduce((sum, s) => sum + s.price, 0);
    return `
      <div class="catalog-pack ${pack.hidden ? 'catalog-pack-hidden' : ''}" data-pack-card="${escapeHtml(pack.packId)}">
        <div class="catalog-pack-header">
          <div>
            <h3>${escapeHtml(pack.packName)}${pack.hidden ? ' <span class="status-badge status-failed">Hidden</span>' : ''}</h3>
            <p class="catalog-pack-meta">${escapeHtml(pack.gameTitle)} · ${GENRE_LABELS[pack.genre] || pack.genre} · ${pack.scripts.length} script${pack.scripts.length === 1 ? '' : 's'}</p>
          </div>
          <div class="catalog-pack-actions">
            <button type="button" class="btn-small" data-toggle-pack-edit="${escapeHtml(pack.packId)}">Edit</button>
            <button type="button" class="btn-small" data-toggle-pack-hidden="${escapeHtml(pack.packId)}" data-hidden="${pack.hidden}">${pack.hidden ? 'Show' : 'Hide'}</button>
            <button type="button" class="btn-small btn-delete" data-delete-pack="${escapeHtml(pack.packId)}">Delete</button>
          </div>
        </div>

        <form class="catalog-edit-form" data-pack-edit-form="${escapeHtml(pack.packId)}" hidden>
          ${packEditFormHtml(pack)}
          <div class="catalog-form-actions">
            <button type="submit" class="btn btn-primary">Save changes</button>
          </div>
        </form>

        <div class="catalog-pack-scripts">
          ${pack.scripts.map((script) => scriptRowHtml(pack.packId, script)).join('') || '<p class="empty-state">No scripts in this pack yet.</p>'}
        </div>

        <form class="add-script-form" data-add-script-form="${escapeHtml(pack.packId)}">
          <input type="text" class="as-title" placeholder="New script title" maxlength="80" required>
          <input type="number" class="as-price" placeholder="Price" step="0.01" min="0" max="1000" required>
          <button type="submit" class="btn-small btn-primary">+ Add script</button>
          <p class="form-error add-script-error" role="alert" hidden></p>
        </form>

        <div class="catalog-pack-total">Full pack (visible scripts): ${money(total)}</div>
      </div>
    `;
  }

  async function loadCatalog() {
    const { apiFetch } = window.ScripForgeAuth;
    const { catalog } = await apiFetch('/api/admin/catalog');
    const container = document.getElementById('catalogContainer');

    if (!catalog.length) {
      container.innerHTML = '<p class="empty-state">No packs yet — create one above.</p>';
      return;
    }

    container.innerHTML = catalog.map(packCardHtml).join('');
    wireCatalogContainer(container);
  }

  function wireCatalogContainer(container) {
    container.querySelectorAll('[data-toggle-pack-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const form = container.querySelector(`[data-pack-edit-form="${CSS.escape(btn.dataset.togglePackEdit)}"]`);
        form.hidden = !form.hidden;
      });
    });

    container.querySelectorAll('[data-pack-edit-form]').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const packId = form.dataset.packEditForm;
        const errorBox = form.querySelector('.catalog-form-error');
        errorBox.hidden = true;
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/catalog/packs/${encodeURIComponent(packId)}`, {
            method: 'PATCH',
            body: readPackForm(form)
          });
          toast('Pack updated.', 'success');
          await loadCatalog();
        } catch (err) {
          errorBox.textContent = err.message;
          errorBox.hidden = false;
        }
      });
    });

    container.querySelectorAll('[data-toggle-pack-hidden]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const hidden = btn.dataset.hidden === 'true';
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/catalog/packs/${encodeURIComponent(btn.dataset.togglePackHidden)}/hidden`, {
            method: 'PATCH',
            body: { hidden: !hidden }
          });
          toast(hidden ? 'Pack is visible again.' : 'Pack hidden — no longer browsable or purchasable.', 'success');
          await loadCatalog();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('[data-delete-pack]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!window.confirm('Delete this pack and every script in it? This cannot be undone (past orders that included it are unaffected).')) return;
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/catalog/packs/${encodeURIComponent(btn.dataset.deletePack)}`, { method: 'DELETE' });
          toast('Pack deleted.', 'success');
          await loadCatalog();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('[data-toggle-script-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const form = container.querySelector(`[data-script-edit-form="${CSS.escape(btn.dataset.toggleScriptEdit)}"]`);
        form.hidden = !form.hidden;
      });
    });

    container.querySelectorAll('[data-script-edit-form]').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const [packId, scriptId] = form.dataset.scriptEditForm.split('::');
        const errorBox = form.querySelector('.script-form-error');
        errorBox.hidden = true;
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/catalog/packs/${encodeURIComponent(packId)}/scripts/${encodeURIComponent(scriptId)}`, {
            method: 'PATCH',
            body: { title: form.querySelector('.sf-title').value.trim(), price: Number(form.querySelector('.sf-price').value) }
          });
          toast('Script updated.', 'success');
          await loadCatalog();
        } catch (err) {
          errorBox.textContent = err.message;
          errorBox.hidden = false;
        }
      });
    });

    container.querySelectorAll('[data-toggle-script-hidden]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const hidden = btn.dataset.hidden === 'true';
        const [packId, scriptId] = btn.dataset.toggleScriptHidden.split('::');
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/catalog/packs/${encodeURIComponent(packId)}/scripts/${encodeURIComponent(scriptId)}/hidden`, {
            method: 'PATCH',
            body: { hidden: !hidden }
          });
          toast(hidden ? 'Script is visible again.' : 'Script hidden — no longer purchasable.', 'success');
          await loadCatalog();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('[data-delete-script]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!window.confirm('Delete this script? This cannot be undone (past orders that included it are unaffected).')) return;
        const [packId, scriptId] = btn.dataset.deleteScript.split('::');
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/catalog/packs/${encodeURIComponent(packId)}/scripts/${encodeURIComponent(scriptId)}`, { method: 'DELETE' });
          toast('Script deleted.', 'success');
          await loadCatalog();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('[data-add-script-form]').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const packId = form.dataset.addScriptForm;
        const errorBox = form.querySelector('.add-script-error');
        errorBox.hidden = true;
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/catalog/packs/${encodeURIComponent(packId)}/scripts`, {
            method: 'POST',
            body: { title: form.querySelector('.as-title').value.trim(), price: Number(form.querySelector('.as-price').value) }
          });
          toast('Script added.', 'success');
          await loadCatalog();
        } catch (err) {
          errorBox.textContent = err.message;
          errorBox.hidden = false;
        }
      });
    });
  }

  function setupAddPackForm() {
    const showBtn = document.getElementById('showAddPackForm');
    const form = document.getElementById('addPackForm');
    const cancelBtn = document.getElementById('cancelAddPackForm');
    const errorBox = document.getElementById('addPackError');

    showBtn.addEventListener('click', () => { form.hidden = false; showBtn.hidden = true; });
    cancelBtn.addEventListener('click', () => { form.hidden = true; showBtn.hidden = false; form.reset(); errorBox.hidden = true; });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorBox.hidden = true;
      try {
        await window.ScripForgeAuth.apiFetch('/api/admin/catalog/packs', {
          method: 'POST',
          body: {
            packName: document.getElementById('newPackName').value.trim(),
            gameTitle: document.getElementById('newPackGameTitle').value.trim(),
            genre: document.getElementById('newPackGenre').value,
            description: document.getElementById('newPackDescription').value.trim(),
            detailUrl: document.getElementById('newPackDetailUrl').value.trim()
          }
        });
        toast('Pack created.', 'success');
        form.reset();
        form.hidden = true;
        showBtn.hidden = false;
        await loadCatalog();
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
      }
    });
  }

  // --- Promo codes ---------------------------------------------------------

  function promoRowHtml(promo) {
    const { escapeHtml } = window.ScripForgeAuth;
    const valueText = promo.discount_type === 'percent' ? `${promo.discount_value}%` : `$${(promo.discount_value / 100).toFixed(2)}`;
    const usesText = promo.max_uses ? `${promo.uses_count} / ${promo.max_uses}` : `${promo.uses_count} (unlimited)`;
    return `
      <div class="settings-row">
        <div>
          <h3>${escapeHtml(promo.code)} ${!promo.active ? '<span class="status-badge status-failed">Off</span>' : ''}</h3>
          <p>${valueText} off · used ${usesText}${promo.expires_at ? ` · expires ${formatDate(promo.expires_at)}` : ''}</p>
        </div>
        <div class="admin-row-actions">
          <button type="button" class="btn-small" data-toggle-promo="${escapeHtml(promo.code)}" data-active="${promo.active}">${promo.active ? 'Disable' : 'Enable'}</button>
          <button type="button" class="btn-small btn-delete" data-delete-promo="${escapeHtml(promo.code)}">Delete</button>
        </div>
      </div>
    `;
  }

  async function loadPromoCodes() {
    const { apiFetch } = window.ScripForgeAuth;
    const { promoCodes } = await apiFetch('/api/admin/promo-codes');
    const container = document.getElementById('promoCodesContainer');

    container.innerHTML = promoCodes.length
      ? promoCodes.map(promoRowHtml).join('')
      : '<p class="empty-state">No promo codes yet.</p>';

    container.querySelectorAll('[data-toggle-promo]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const active = btn.dataset.active === 'true';
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/promo-codes/${encodeURIComponent(btn.dataset.togglePromo)}/active`, { method: 'PATCH', body: { active: !active } });
          toast('Promo code updated.', 'success');
          loadPromoCodes();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('[data-delete-promo]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!window.confirm('Delete this promo code? This cannot be undone.')) return;
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/promo-codes/${encodeURIComponent(btn.dataset.deletePromo)}`, { method: 'DELETE' });
          toast('Promo code deleted.', 'success');
          loadPromoCodes();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  function setupAddPromoForm() {
    const showBtn = document.getElementById('showAddPromoForm');
    const form = document.getElementById('addPromoForm');
    const cancelBtn = document.getElementById('cancelAddPromoForm');
    const errorBox = document.getElementById('addPromoError');

    showBtn.addEventListener('click', () => { form.hidden = false; showBtn.hidden = true; });
    cancelBtn.addEventListener('click', () => { form.hidden = true; showBtn.hidden = false; form.reset(); errorBox.hidden = true; });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorBox.hidden = true;
      try {
        const expiresAt = document.getElementById('newPromoExpires').value;
        await window.ScripForgeAuth.apiFetch('/api/admin/promo-codes', {
          method: 'POST',
          body: {
            code: document.getElementById('newPromoCode').value.trim().toUpperCase(),
            discountType: document.getElementById('newPromoType').value,
            discountValue: Number(document.getElementById('newPromoValue').value),
            maxUses: Number(document.getElementById('newPromoMaxUses').value) || undefined,
            expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined
          }
        });
        toast('Promo code created.', 'success');
        form.reset();
        form.hidden = true;
        showBtn.hidden = false;
        loadPromoCodes();
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
      }
    });
  }

  // --- Create user (test / temporary accounts) -------------------------

  function setupAddUserForm() {
    const showBtn = document.getElementById('showAddUserForm');
    const form = document.getElementById('addUserForm');
    const cancelBtn = document.getElementById('cancelAddUserForm');
    const errorBox = document.getElementById('addUserError');
    const resultBox = document.getElementById('newUserResult');
    const { escapeHtml } = window.ScripForgeAuth;

    showBtn.addEventListener('click', () => {
      resultBox.hidden = true;
      form.hidden = false;
      showBtn.hidden = true;
    });
    cancelBtn.addEventListener('click', () => {
      form.hidden = true;
      showBtn.hidden = false;
      form.reset();
      errorBox.hidden = true;
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorBox.hidden = true;
      try {
        const { user, generatedUsername, generatedPassword } = await window.ScripForgeAuth.apiFetch('/api/admin/users', {
          method: 'POST',
          body: {
            username: document.getElementById('newUserUsername').value.trim() || undefined,
            password: document.getElementById('newUserPassword').value || undefined,
            isTest: document.getElementById('newUserIsTest').checked,
            expiresIn: document.getElementById('newUserExpiresIn').value || undefined
          }
        });

        form.reset();
        form.hidden = true;
        showBtn.hidden = false;

        // The generated password only ever exists in this one response — it's
        // never stored anywhere but its bcrypt hash, so this is the admin's
        // only chance to see and copy it. Shown inline (not a toast) since
        // toasts auto-dismiss in a few seconds, too fast to copy from.
        resultBox.innerHTML = `
          <p><strong>Account created:</strong> ${escapeHtml(user.username)}${user.expires_at ? ` (temporary — expires ${new Date(user.expires_at).toLocaleString()})` : ''}${user.is_test ? ' <span class="status-badge status-test">Test</span>' : ''}</p>
          ${generatedUsername ? `<p>Generated username: <code>${escapeHtml(generatedUsername)}</code></p>` : ''}
          ${generatedPassword ? `<p>Generated password: <code>${escapeHtml(generatedPassword)}</code> — copy it now, it won't be shown again.</p>` : ''}
          <button type="button" class="btn-small" id="dismissNewUserResult">Done</button>
        `;
        resultBox.hidden = false;
        document.getElementById('dismissNewUserResult').addEventListener('click', () => { resultBox.hidden = true; });

        toast('User account created.', 'success');
        await Promise.all([loadUsers(), loadAuditLog()]);
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
      }
    });
  }

  // --- Bundles ---------------------------------------------------------

  function bundleRowHtml(bundle) {
    const { escapeHtml } = window.ScripForgeAuth;
    return `
      <div class="settings-row">
        <div>
          <h3>${escapeHtml(bundle.name)} ${!bundle.active ? '<span class="status-badge status-failed">Off</span>' : ''}</h3>
          <p>${bundle.packIds.map(escapeHtml).join(' + ')} · ${bundle.discountPercent}% off · ${money(bundle.subtotal)} → ${money(bundle.total)}</p>
        </div>
        <div class="admin-row-actions">
          <button type="button" class="btn-small" data-toggle-bundle="${bundle.id}" data-active="${bundle.active}">${bundle.active ? 'Disable' : 'Enable'}</button>
          <button type="button" class="btn-small btn-delete" data-delete-bundle="${bundle.id}">Delete</button>
        </div>
      </div>
    `;
  }

  async function loadBundles() {
    const { apiFetch } = window.ScripForgeAuth;
    const { bundles } = await apiFetch('/api/admin/bundles');
    const container = document.getElementById('bundlesContainer');

    container.innerHTML = bundles.length
      ? bundles.map(bundleRowHtml).join('')
      : '<p class="empty-state">No bundles yet.</p>';

    container.querySelectorAll('[data-toggle-bundle]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const active = btn.dataset.active === 'true';
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/bundles/${btn.dataset.toggleBundle}/active`, { method: 'PATCH', body: { active: !active } });
          toast('Bundle updated.', 'success');
          loadBundles();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('[data-delete-bundle]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!window.confirm('Delete this bundle?')) return;
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/bundles/${btn.dataset.deleteBundle}`, { method: 'DELETE' });
          toast('Bundle deleted.', 'success');
          loadBundles();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  async function populateBundlePackOptions() {
    const select = document.getElementById('newBundlePacks');
    if (!select || select.dataset.loaded) return;
    const { catalog } = await window.ScripForgeAuth.apiFetch('/api/admin/catalog');
    const { escapeHtml } = window.ScripForgeAuth;
    select.innerHTML = catalog.map((pack) => `<option value="${escapeHtml(pack.packId)}">${escapeHtml(pack.packName)}</option>`).join('');
    select.dataset.loaded = 'true';
  }

  function setupAddBundleForm() {
    const showBtn = document.getElementById('showAddBundleForm');
    const form = document.getElementById('addBundleForm');
    const cancelBtn = document.getElementById('cancelAddBundleForm');
    const errorBox = document.getElementById('addBundleError');

    showBtn.addEventListener('click', () => { form.hidden = false; showBtn.hidden = true; populateBundlePackOptions(); });
    cancelBtn.addEventListener('click', () => { form.hidden = true; showBtn.hidden = false; form.reset(); errorBox.hidden = true; });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorBox.hidden = true;
      const packIds = Array.from(document.getElementById('newBundlePacks').selectedOptions).map((o) => o.value);
      if (packIds.length < 2) {
        errorBox.textContent = 'Select at least 2 packs.';
        errorBox.hidden = false;
        return;
      }
      try {
        await window.ScripForgeAuth.apiFetch('/api/admin/bundles', {
          method: 'POST',
          body: {
            name: document.getElementById('newBundleName').value.trim(),
            description: document.getElementById('newBundleDescription').value.trim(),
            packIds,
            discountPercent: Number(document.getElementById('newBundleDiscount').value)
          }
        });
        toast('Bundle created.', 'success');
        form.reset();
        form.hidden = true;
        showBtn.hidden = false;
        loadBundles();
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
      }
    });
  }

  // --- Reviews (moderation) -------------------------------------------------

  async function populateReviewsPackSelect() {
    const select = document.getElementById('reviewsPackSelect');
    if (!select || select.dataset.loaded) return;
    const { catalog } = await window.ScripForgeAuth.apiFetch('/api/admin/catalog');
    const { escapeHtml } = window.ScripForgeAuth;
    select.innerHTML = catalog.map((pack) => `<option value="${escapeHtml(pack.packId)}">${escapeHtml(pack.packName)}</option>`).join('');
    select.dataset.loaded = 'true';
    select.addEventListener('change', () => loadReviewsForPack(select.value));
    if (catalog.length) loadReviewsForPack(catalog[0].packId);
  }

  async function loadReviewsForPack(packId) {
    const container = document.getElementById('reviewsContainer');
    container.innerHTML = '<p class="empty-state">Loading…</p>';

    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    const { reviews, summary } = await apiFetch(`/api/admin/reviews/${encodeURIComponent(packId)}`);

    if (!reviews.length) {
      container.innerHTML = '<p class="empty-state">No reviews for this pack yet.</p>';
      return;
    }

    container.innerHTML = `
      <p class="empty-state">${summary.average} ★ average across ${summary.count} review${summary.count === 1 ? '' : 's'}</p>
      <div class="mod-history-list" style="margin-top: 1rem;">
        ${reviews.map((r) => `
          <div class="settings-row">
            <div>
              <h3>${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} — ${escapeHtml(r.username)}</h3>
              <p>${escapeHtml(r.comment || '(no comment)')}</p>
            </div>
            <button type="button" class="btn-small btn-delete" data-delete-review="${escapeHtml(packId)}::${r.user_id}">Delete</button>
          </div>
        `).join('')}
      </div>
    `;

    container.querySelectorAll('[data-delete-review]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const [pId, userId] = btn.dataset.deleteReview.split('::');
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/reviews/${encodeURIComponent(pId)}/${userId}`, { method: 'DELETE' });
          toast('Review deleted.', 'success');
          loadReviewsForPack(pId);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  // --- Error log -------------------------------------------------------

  async function loadErrorLog() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    const { entries, last24h } = await apiFetch('/api/admin/error-log');
    const container = document.getElementById('errorLogContainer');

    if (!entries.length) {
      container.innerHTML = '<p class="empty-state">No errors recorded. Good sign.</p>';
      return;
    }

    container.innerHTML = `
      <p class="empty-state">${last24h} error${last24h === 1 ? '' : 's'} in the last 24 hours.</p>
      <table class="orders-table">
        <thead><tr><th>When</th><th>Source</th><th>Message</th><th>URL</th></tr></thead>
        <tbody>
          ${entries.map((e) => `
            <tr>
              <td>${formatDate(e.created_at)}</td>
              <td><span class="status-badge ${e.source === 'server' ? 'status-failed' : 'status-pending'}">${escapeHtml(e.source)}</span></td>
              <td>${escapeHtml(e.message)}</td>
              <td>${e.url ? escapeHtml(e.url) : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function setupErrorLogControls() {
    document.getElementById('clearErrorLogBtn').addEventListener('click', async () => {
      if (!window.confirm('Clear the entire error log?')) return;
      try {
        await window.ScripForgeAuth.apiFetch('/api/admin/error-log', { method: 'DELETE' });
        toast('Error log cleared.', 'success');
        loadErrorLog();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  const SETTINGS_META = {
    maintenanceMode: {
      label: 'Maintenance mode',
      description: 'Blocks browsing, checkout, and account actions for everyone except signed-in admins, who see a normal site.'
    },
    wishlist: {
      label: 'Wishlist',
      description: 'Lets signed-in customers save packs for later from a heart icon on the catalog page.'
    },
    newBadges: {
      label: '"New" badges',
      description: 'Shows a New chip on the catalog page for packs created in the last 14 days.'
    }
  };

  async function loadSettings() {
    const { apiFetch } = window.ScripForgeAuth;
    const { settings } = await apiFetch('/api/admin/settings');
    const container = document.getElementById('settingsContainer');

    async function saveSetting(key, value) {
      try {
        await apiFetch(`/api/admin/settings/${encodeURIComponent(key)}`, { method: 'PATCH', body: { value } });
        toast('Setting saved.', 'success');
      } catch (err) {
        toast(err.message, 'error');
        loadSettings();
      }
    }

    const toggleRows = Object.entries(SETTINGS_META).map(([key, meta]) => `
      <div class="settings-row">
        <div>
          <h3>${meta.label}</h3>
          <p>${meta.description}</p>
        </div>
        <button type="button" class="settings-toggle ${settings[key] ? 'on' : ''}" data-toggle-setting="${key}" role="switch" aria-checked="${Boolean(settings[key])}"></button>
      </div>
    `).join('');

    const banner = settings.announcementBanner || { enabled: false, text: '' };
    const { escapeHtml } = window.ScripForgeAuth;

    container.innerHTML = `
      ${toggleRows}
      <div class="settings-row">
        <div style="width: 100%">
          <h3>Announcement banner</h3>
          <p>A dismissible bar shown below the navbar on every page.</p>
          <div class="settings-banner-text">
            <input type="text" id="bannerTextInput" maxlength="200" placeholder="e.g. 20% off all packs this weekend!" value="${escapeHtml(banner.text)}">
          </div>
        </div>
        <button type="button" class="settings-toggle ${banner.enabled ? 'on' : ''}" id="bannerToggle" role="switch" aria-checked="${banner.enabled}"></button>
      </div>
    `;

    container.querySelectorAll('[data-toggle-setting]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const next = !btn.classList.contains('on');
        btn.classList.toggle('on', next);
        btn.setAttribute('aria-checked', String(next));
        await saveSetting(btn.dataset.toggleSetting, next);
      });
    });

    const bannerToggle = document.getElementById('bannerToggle');
    const bannerTextInput = document.getElementById('bannerTextInput');

    async function saveBanner() {
      await saveSetting('announcementBanner', {
        enabled: bannerToggle.classList.contains('on'),
        text: bannerTextInput.value.trim()
      });
    }

    bannerToggle.addEventListener('click', () => {
      const next = !bannerToggle.classList.contains('on');
      bannerToggle.classList.toggle('on', next);
      bannerToggle.setAttribute('aria-checked', String(next));
      saveBanner();
    });

    bannerTextInput.addEventListener('change', saveBanner);
  }

  async function loadAnalytics() {
    const { apiFetch } = window.ScripForgeAuth;
    const { topPacks } = await apiFetch('/api/admin/analytics');

    const topContainer = document.getElementById('analyticsTopPacksContainer');
    if (!topPacks.length) {
      topContainer.innerHTML = '<p class="empty-state">No paid orders yet.</p>';
    } else {
      const maxSold = Math.max(...topPacks.map((p) => p.itemsSold), 1);
      const { escapeHtml } = window.ScripForgeAuth;
      topContainer.innerHTML = `
        <div class="top-packs-list">
          ${topPacks.map((p) => `
            <div class="top-packs-row">
              <span class="top-packs-name">${escapeHtml(p.packName)}</span>
              <div class="top-packs-bar-track"><div class="top-packs-bar-fill" style="width: ${(p.itemsSold / maxSold) * 100}%"></div></div>
              <span class="top-packs-count">${p.itemsSold} sold</span>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  async function loadDashboard() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    const [stats, ordersData] = await Promise.all([
      apiFetch('/api/admin/stats'),
      apiFetch('/api/admin/orders')
    ]);

    document.getElementById('totalUsers').textContent = stats.userCount;
    document.getElementById('totalAdmins').textContent = stats.adminCount;
    document.getElementById('totalOrders').textContent = stats.paidOrders;
    document.getElementById('totalRevenue').textContent = formatRevenue(stats.revenueByCurrency);

    const recent = ordersData.orders.slice(0, 5);
    const container = document.getElementById('recentOrdersContainer');

    if (!recent.length) {
      container.innerHTML = '<p class="empty-state">No orders yet.</p>';
      return;
    }

    container.innerHTML = `
      <table class="orders-table">
        <thead>
          <tr><th>Order</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th><th>Date</th></tr>
        </thead>
        <tbody>
          ${recent.map((order) => `
            <tr>
              <td>SF-${order.id}</td>
              <td>${escapeHtml(order.customerUsername)}</td>
              <td>${order.currencySymbol}${order.totalAmount.toFixed(2)} ${escapeHtml(order.currency)}</td>
              <td>${paymentLabel(order.paymentProvider)}</td>
              <td><span class="status-badge status-${escapeHtml(order.status)}">${escapeHtml(order.status)}</span></td>
              <td>${formatDate(order.createdAt)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  const BAN_LABELS = { '24h': '24 hours', '7d': '7 days', '30d': '30 days', permanent: 'Permanently' };

  function userStatusBadge(user) {
    if (user.disabled) return '<span class="status-badge status-failed">Disabled</span>';
    if (user.expires_at && new Date(user.expires_at).getTime() <= Date.now()) {
      return '<span class="status-badge status-failed">Expired</span>';
    }
    if (user.ban_type) return `<span class="status-badge status-failed">Banned${user.ban_expires_at ? '' : ' (permanent)'}</span>`;
    const locked = user.locked_until && new Date(user.locked_until).getTime() > Date.now();
    if (locked) return '<span class="status-badge status-pending">Locked</span>';
    return '<span class="status-badge status-paid">Active</span>';
  }

  // Separate from userStatusBadge (which reflects sign-in eligibility) since
  // an account can be both perfectly active AND flagged test/temporary at
  // the same time — these are informational tags, not a status.
  function userTagBadges(user) {
    const tags = [];
    if (user.is_test) tags.push('<span class="status-badge status-test" title="Excluded from revenue/buyer counts">Test</span>');
    if (user.expires_at && new Date(user.expires_at).getTime() > Date.now()) {
      tags.push(`<span class="status-badge status-temp" title="Expires ${formatDate(user.expires_at)}">Temp</span>`);
    }
    return tags.join(' ');
  }

  function loginHistoryRowsHtml(history) {
    const { escapeHtml } = window.ScripForgeAuth;
    if (!history.length) return '<p class="empty-state">No recorded logins yet.</p>';
    return `
      <table class="orders-table user-history-table">
        <thead><tr><th>When</th><th>IP</th><th>Browser</th><th>OS</th><th>Device</th><th>Language</th></tr></thead>
        <tbody>
          ${history.map((h) => `
            <tr>
              <td>${formatDate(h.created_at)}</td>
              <td>${h.ip ? escapeHtml(h.ip) : '—'}</td>
              <td>${h.browser ? escapeHtml(h.browser) : '—'}</td>
              <td>${h.os ? escapeHtml(h.os) : '—'}</td>
              <td>${h.device_type ? escapeHtml(h.device_type) : '—'}</td>
              <td>${h.accept_language ? escapeHtml(h.accept_language) : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function moderationHistoryHtml(entries) {
    const { escapeHtml } = window.ScripForgeAuth;
    if (!entries.length) return '<p class="empty-state">No moderation actions recorded for this account.</p>';
    return `
      <ul class="mod-history-list">
        ${entries.map((entry) => `
          <li>
            <span class="mod-history-action">${escapeHtml(entry.action)}</span>
            <span class="mod-history-meta">by ${escapeHtml(entry.actor_username)} · ${formatDate(entry.created_at)}</span>
            ${entry.details ? `<span class="mod-history-details">${escapeHtml(JSON.stringify(entry.details))}</span>` : ''}
          </li>
        `).join('')}
      </ul>
    `;
  }

  function purchaseHistoryHtml(orders) {
    const { escapeHtml } = window.ScripForgeAuth;
    if (!orders.length) return '<p class="empty-state">No orders placed yet.</p>';
    return `
      <ul class="mod-history-list">
        ${orders.map((order) => `
          <li>
            <span class="mod-history-action">SF-${order.id} · <span class="status-badge status-${escapeHtml(order.status)}">${escapeHtml(order.status)}</span>${order.isTest ? ' <span class="status-badge status-test">Test</span>' : ''}</span>
            <span class="mod-history-meta">${formatDate(order.createdAt)} · ${order.currencySymbol}${order.totalAmount.toFixed(2)} ${order.currency} · ${paymentLabel(order.paymentProvider)}</span>
            <span class="mod-history-details">${order.items.map((i) => escapeHtml(`${i.packName} — ${i.scriptTitle}`)).join(', ')}</span>
            ${order.customerNotes ? `<span class="mod-history-details">Notes: ${escapeHtml(order.customerNotes)}</span>` : ''}
          </li>
        `).join('')}
      </ul>
    `;
  }

  function licensesHtml(licenses) {
    const { escapeHtml } = window.ScripForgeAuth;
    if (!licenses.length) return '<p class="empty-state">No licenses issued yet.</p>';
    return `
      <ul class="mod-history-list">
        ${licenses.map((license) => `
          <li>
            <span class="mod-history-action">${escapeHtml(license.pack_id)}/${escapeHtml(license.script_id)}</span>
            <span class="mod-history-meta">${license.device_fingerprint ? 'Activated' : 'Not activated'} · ${license.download_count} download${license.download_count === 1 ? '' : 's'}</span>
            <button type="button" class="btn-tiny" data-license-activity="${escapeHtml(license.license_key)}">Activity</button>
            ${license.device_fingerprint ? `<button type="button" class="btn-tiny" data-reset-device="${escapeHtml(license.license_key)}">Reset device</button>` : ''}
            <div class="license-activity-log" data-activity-log="${escapeHtml(license.license_key)}" hidden></div>
          </li>
        `).join('')}
      </ul>
    `;
  }

  function discordLinkHtml(discordLink) {
    const { escapeHtml } = window.ScripForgeAuth;
    if (!discordLink) return '<p class="empty-state">No Discord account linked.</p>';
    return `
      <div class="mod-box">
        <p>Linked to <strong>${escapeHtml(discordLink.discordTag)}</strong> since ${formatDate(discordLink.linkedAt)}.</p>
        <button type="button" class="btn-small btn-delete" data-discord-unlink="${escapeHtml(discordLink.discordId)}">Unlink Discord</button>
      </div>
    `;
  }

  function userDetailHtml(detail) {
    const { escapeHtml } = window.ScripForgeAuth;
    const { user, loginHistory, purchases, orders, licenses, moderationHistory, discordLink } = detail;
    const revenueText = purchases.revenueByCurrency.length
      ? purchases.revenueByCurrency.map((r) => `${CURRENCY_SYMBOLS[r.currency] || ''}${r.amount.toFixed(2)} ${r.currency}`).join(' + ')
      : '£0.00';

    const banBox = user.ban_type
      ? `
        <div class="mod-box">
          <p><strong>Currently banned</strong> (${BAN_LABELS[user.ban_type] || user.ban_type})${user.ban_expires_at ? ` until ${formatDate(user.ban_expires_at)}` : ''} by ${escapeHtml(user.banned_by || 'unknown')}.</p>
          ${user.ban_reason ? `<p>Reason: ${escapeHtml(user.ban_reason)}</p>` : ''}
          <button type="button" class="btn-small" data-unban-user="${user.id}">Lift ban</button>
        </div>
      `
      : `
        <form class="mod-box ban-form" data-ban-form="${user.id}">
          <div class="mod-row">
            <label>Ban type
              <select class="ban-type-select">
                <option value="24h">24 hours</option>
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
                <option value="permanent">Permanent</option>
              </select>
            </label>
            <label>Reason (optional)
              <input type="text" class="ban-reason-input" maxlength="500" placeholder="Why is this account being banned?">
            </label>
            <button type="submit" class="btn-small btn-delete">Ban user</button>
          </div>
        </form>
      `;

    return `
      <div class="user-detail-grid">
        <div>
          <h4>Purchases</h4>
          <p>${purchases.hasPurchased ? '🛒 <strong>Buyer</strong> — ' : 'No completed purchases yet. '}${purchases.paidOrders} paid / ${purchases.totalOrders} total order${purchases.totalOrders === 1 ? '' : 's'}.</p>
          <p>Total spent: ${revenueText}</p>
        </div>
        <div>
          <h4>Account status</h4>
          <div class="mod-box">
            <p>${user.disabled ? 'This account is disabled.' : 'This account is enabled.'}</p>
            <button type="button" class="btn-small" data-toggle-disable="${user.id}" data-disabled="${user.disabled}">
              ${user.disabled ? 'Re-enable account' : 'Disable account'}
            </button>
          </div>
          ${banBox}
        </div>
      </div>
      <h4>Purchase history</h4>
      ${purchaseHistoryHtml(orders)}
      <h4>Licenses</h4>
      ${licensesHtml(licenses)}
      <h4>Login history</h4>
      ${loginHistoryRowsHtml(loginHistory)}
      <h4>Discord</h4>
      ${discordLinkHtml(discordLink)}
      <h4>Moderation history</h4>
      ${moderationHistoryHtml(moderationHistory)}
    `;
  }

  async function loadUsers() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    const { users } = await apiFetch('/api/admin/users');
    const container = document.getElementById('usersContainer');

    container.innerHTML = `
      <table class="users-table">
        <thead>
          <tr><th>Username</th><th>Role</th><th>Status</th><th>2FA</th><th>Last login</th><th>Registered</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${users.map((user) => {
            const isSelf = user.id === cachedUserId;
            return `
              <tr>
                <td>
                  ${escapeHtml(user.username)}
                  ${user.paid_order_count > 0 ? ' <span class="status-badge status-paid" title="Has at least one paid order">🛒 Buyer</span>' : ''}
                  ${userTagBadges(user)}
                </td>
                <td>${user.role === 'admin' ? '<span class="admin-badge">Admin</span>' : 'Customer'}</td>
                <td>${userStatusBadge(user)}</td>
                <td>${user.role === 'admin' ? (user.totp_enabled ? 'On' : 'Off') : '—'}</td>
                <td>${formatDate(user.last_login_at)}${user.last_login_ip ? `<br><small>${escapeHtml(user.last_login_ip)}</small>` : ''}</td>
                <td>${formatDate(user.created_at)}</td>
                <td class="admin-row-actions">
                  <button type="button" class="btn-small" data-toggle-user-detail="${user.id}">Details</button>
                  ${isSelf
                    ? '<span class="empty-state">(you)</span>'
                    : `
                      ${user.role === 'admin'
                        ? `<button type="button" class="btn-small" data-toggle-role="${user.id}" data-current-role="${user.role}" title="Admin access can only be granted via the create-admin CLI on the server itself — this only removes it.">Remove admin</button>`
                        : ''}
                      <button type="button" class="btn-small" data-toggle-test="${user.id}" data-is-test="${user.is_test ? 'true' : 'false'}">
                        ${user.is_test ? 'Unmark test' : 'Mark test'}
                      </button>
                      ${user.role !== 'admin' ? `<button type="button" class="btn-small" data-impersonate-user="${user.id}" title="Sign in as this account to see exactly what it can access">View as</button>` : ''}
                      <button type="button" class="btn-small" data-unlock-user="${user.id}">Unlock</button>
                      <button type="button" class="btn-small btn-delete" data-delete-user="${user.id}">Delete</button>
                    `}
                </td>
              </tr>
              <tr class="user-detail-row" id="user-detail-${user.id}" hidden>
                <td colspan="7"><div class="user-detail-loading">Loading…</div></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    container.querySelectorAll('[data-toggle-user-detail]').forEach((button) => {
      button.addEventListener('click', async () => {
        const userId = button.dataset.toggleUserDetail;
        const row = document.getElementById(`user-detail-${userId}`);
        if (!row.hidden) {
          row.hidden = true;
          button.textContent = 'Details';
          return;
        }
        await openUserDetail(userId);
      });
    });

    // Demote-only — granting admin access from the dashboard was removed
    // entirely (server-side, not just here) so it can never be a single
    // click away from a compromised admin session. New admins are created
    // exclusively via `npm run create-admin` on the machine itself.
    container.querySelectorAll('[data-toggle-role]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!confirm('Remove admin access from this account? They will become a regular customer.')) return;
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/users/${button.dataset.toggleRole}/role`, {
            method: 'PATCH',
            body: { role: 'customer' }
          });
          toast('Admin access removed.', 'success');
          await Promise.all([loadUsers(), loadDashboard(), loadAuditLog()]);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('[data-unlock-user]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/users/${button.dataset.unlockUser}/unlock`, { method: 'POST' });
          toast('Account unlocked.', 'success');
          await Promise.all([loadUsers(), loadAuditLog()]);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('[data-toggle-test]').forEach((button) => {
      button.addEventListener('click', async () => {
        const isTest = button.dataset.isTest === 'true';
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/users/${button.dataset.toggleTest}/test`, {
            method: 'PATCH',
            body: { isTest: !isTest }
          });
          toast(isTest ? 'No longer marked as a test account.' : 'Marked as a test account.', 'success');
          await Promise.all([loadUsers(), loadAuditLog()]);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('[data-impersonate-user]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!window.confirm('View the site as this account? You will be signed in as them until you exit "view as" mode from the nav bar.')) return;
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/users/${button.dataset.impersonateUser}/impersonate`, { method: 'POST' });
          window.location.href = '/';
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('[data-delete-user]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!window.confirm('Delete this user and all of their orders? This cannot be undone.')) return;
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/users/${button.dataset.deleteUser}`, { method: 'DELETE' });
          toast('User deleted.', 'success');
          await Promise.all([loadUsers(), loadDashboard(), loadOrders(), loadAuditLog()]);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  // Fetches and renders one user's detail panel, expanding it if collapsed.
  // Used both by the row's "Details" toggle and by moderation actions below,
  // which call this again afterward so the panel reflects the new state
  // immediately instead of requiring a second click to see the result.
  async function openUserDetail(userId) {
    const row = document.getElementById(`user-detail-${userId}`);
    const button = document.querySelector(`[data-toggle-user-detail="${userId}"]`);
    if (!row) return;

    row.hidden = false;
    if (button) button.textContent = 'Hide';

    try {
      const detail = await window.ScripForgeAuth.apiFetch(`/api/admin/users/${userId}`);
      row.querySelector('td').innerHTML = userDetailHtml(detail);
      wireUserDetailRow(row, userId);
    } catch (err) {
      row.querySelector('td').innerHTML = `<p class="form-error">${err.message}</p>`;
    }
  }

  function wireUserDetailRow(row, userId) {
    const toggleDisableBtn = row.querySelector('[data-toggle-disable]');
    if (toggleDisableBtn) {
      toggleDisableBtn.addEventListener('click', async () => {
        const disabled = toggleDisableBtn.dataset.disabled === 'true';
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/users/${userId}/${disabled ? 'enable' : 'disable'}`, { method: 'POST' });
          toast(disabled ? 'Account re-enabled.' : 'Account disabled.', 'success');
          await Promise.all([loadUsers(), loadAuditLog()]);
          await openUserDetail(userId);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    }

    const banForm = row.querySelector('[data-ban-form]');
    if (banForm) {
      banForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/users/${userId}/ban`, {
            method: 'POST',
            body: {
              banType: banForm.querySelector('.ban-type-select').value,
              reason: banForm.querySelector('.ban-reason-input').value.trim() || undefined
            }
          });
          toast('User banned.', 'success');
          await Promise.all([loadUsers(), loadAuditLog()]);
          await openUserDetail(userId);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    }

    const unbanBtn = row.querySelector('[data-unban-user]');
    if (unbanBtn) {
      unbanBtn.addEventListener('click', async () => {
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/users/${userId}/unban`, { method: 'POST' });
          toast('Ban lifted.', 'success');
          await Promise.all([loadUsers(), loadAuditLog()]);
          await openUserDetail(userId);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    }

    const discordUnlinkBtn = row.querySelector('[data-discord-unlink]');
    if (discordUnlinkBtn) {
      discordUnlinkBtn.addEventListener('click', async () => {
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/users/${userId}/discord-unlink`, { method: 'POST' });
          toast('Discord account unlinked.', 'success');
          await Promise.all([loadUsers(), loadAuditLog()]);
          await openUserDetail(userId);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    }

    row.querySelectorAll('[data-reset-device]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/licenses/${encodeURIComponent(button.dataset.resetDevice)}/reset-device`, { method: 'POST' });
          toast('Device binding cleared — the customer can activate on a new device next download.', 'success');
          await openUserDetail(userId);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    row.querySelectorAll('[data-license-activity]').forEach((button) => {
      button.addEventListener('click', async () => {
        const key = button.dataset.licenseActivity;
        const log = row.querySelector(`[data-activity-log="${CSS.escape(key)}"]`);
        if (!log.hidden) { log.hidden = true; return; }

        try {
          const { entries } = await window.ScripForgeAuth.apiFetch(`/api/admin/licenses/${encodeURIComponent(key)}/activity`);
          const { escapeHtml } = window.ScripForgeAuth;
          log.innerHTML = entries.length
            ? entries.map((e) => `<div>${formatDate(e.created_at)} · ${e.success ? '<span class="status-badge status-paid">OK</span>' : `<span class="status-badge status-failed">${escapeHtml(e.reason || 'blocked')}</span>`} · ${escapeHtml(e.ip || '—')} · fp: ${e.device_fingerprint ? escapeHtml(e.device_fingerprint.slice(0, 12)) + '…' : '—'}</div>`).join('')
            : '<p class="empty-state">No download attempts recorded yet.</p>';
          log.hidden = false;
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  async function loadOrders() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    const { orders } = await apiFetch('/api/admin/orders');
    const container = document.getElementById('ordersContainer');

    if (!orders.length) {
      container.innerHTML = '<p class="empty-state">No orders yet.</p>';
      return;
    }

    const statuses = ['pending', 'paid', 'failed', 'canceled', 'refunded'];

    container.innerHTML = `
      <table class="orders-table">
        <thead>
          <tr><th></th><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Test</th><th>Date</th></tr>
        </thead>
        <tbody>
          ${orders.map((order) => `
            <tr>
              <td><button type="button" class="order-detail-toggle" data-toggle-order="${order.id}">Details</button></td>
              <td>SF-${order.id}</td>
              <td>${escapeHtml(order.customerUsername)}</td>
              <td>${order.items.length}</td>
              <td>${order.currencySymbol}${order.totalAmount.toFixed(2)} ${escapeHtml(order.currency)}</td>
              <td>${paymentLabel(order.paymentProvider)}</td>
              <td>
                <select class="status-select" data-order-status="${order.id}">
                  ${statuses.map((status) => `<option value="${status}" ${status === order.status ? 'selected' : ''}>${status}</option>`).join('')}
                </select>
              </td>
              <td>
                ${order.isTest ? '<span class="status-badge status-test">Test</span>' : ''}
                <button type="button" class="btn-tiny" data-toggle-order-test="${order.id}" data-is-test="${order.isTest ? 'true' : 'false'}" title="Exclude/include this order from the dashboard's revenue totals">
                  ${order.isTest ? 'Unmark' : 'Mark test'}
                </button>
              </td>
              <td>${formatDate(order.createdAt)}</td>
            </tr>
            <tr class="order-detail-row" id="order-detail-${order.id}" hidden>
              <td colspan="9">
                ${order.items.map((item) => `
                  <div class="catalog-pack-script">
                    <span>${escapeHtml(item.packName)} — ${escapeHtml(item.scriptTitle)}</span>
                    <span>${order.currencySymbol}${item.priceAmount.toFixed(2)}</span>
                  </div>
                `).join('')}
                ${order.customerNotes ? `<div class="catalog-pack-script"><span>Customer notes</span><span>${escapeHtml(order.customerNotes)}</span></div>` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    container.querySelectorAll('[data-toggle-order]').forEach((button) => {
      button.addEventListener('click', () => {
        const row = document.getElementById(`order-detail-${button.dataset.toggleOrder}`);
        row.hidden = !row.hidden;
        button.textContent = row.hidden ? 'Details' : 'Hide';
      });
    });

    container.querySelectorAll('[data-order-status]').forEach((select) => {
      select.addEventListener('change', async () => {
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/orders/${select.dataset.orderStatus}/status`, {
            method: 'PATCH',
            body: { status: select.value }
          });
          toast('Order status updated.', 'success');
          await Promise.all([loadDashboard(), loadAuditLog()]);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('[data-toggle-order-test]').forEach((button) => {
      button.addEventListener('click', async () => {
        const isTest = button.dataset.isTest === 'true';
        try {
          await window.ScripForgeAuth.apiFetch(`/api/admin/orders/${button.dataset.toggleOrderTest}/test`, {
            method: 'PATCH',
            body: { isTest: !isTest }
          });
          toast(isTest ? 'No longer marked as a test purchase.' : 'Marked as a test purchase.', 'success');
          await Promise.all([loadOrders(), loadDashboard(), loadAuditLog()]);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  async function loadAuditLog() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    const { entries } = await apiFetch('/api/admin/audit-log');
    const container = document.getElementById('auditLogContainer');

    if (!entries.length) {
      container.innerHTML = '<p class="empty-state">No admin actions recorded yet.</p>';
      return;
    }

    container.innerHTML = `
      <table class="orders-table">
        <thead>
          <tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th><th>Details</th></tr>
        </thead>
        <tbody>
          ${entries.map((entry) => `
            <tr>
              <td>${formatDate(entry.created_at)}</td>
              <td>${escapeHtml(entry.actor_username)}</td>
              <td>${escapeHtml(entry.action)}</td>
              <td>${entry.target ? escapeHtml(entry.target) : '—'}</td>
              <td>${entry.details ? escapeHtml(JSON.stringify(entry.details)) : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
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

  function renderTotpStatus(enabled) {
    cachedTotpEnabled = enabled;
    const statusText = document.getElementById('totpStatus');
    const toggleBtn = document.getElementById('totpToggleBtn');
    const setupBox = document.getElementById('totpSetupBox');
    const disableBox = document.getElementById('totpDisableBox');

    setupBox.hidden = true;
    disableBox.hidden = true;

    if (enabled) {
      statusText.textContent = 'Enabled — a code from your authenticator app is required to sign in.';
      toggleBtn.textContent = 'Disable 2FA';
      toggleBtn.hidden = false;
      toggleBtn.onclick = () => { disableBox.hidden = false; };
    } else {
      statusText.textContent = 'Off. Turn it on for an extra step at sign-in — recommended for admin accounts.';
      toggleBtn.textContent = 'Enable 2FA';
      toggleBtn.hidden = false;
      toggleBtn.onclick = async () => {
        try {
          const { secret } = await window.ScripForgeAuth.apiFetch('/api/admin/2fa/setup');
          document.getElementById('totpSecretText').textContent = secret;
          setupBox.hidden = false;
        } catch (err) {
          toast(err.message, 'error');
        }
      };
    }
  }

  function setupTotpControls() {
    const confirmBtn = document.getElementById('totpConfirmBtn');
    const setupError = document.getElementById('totpSetupError');

    confirmBtn.addEventListener('click', async () => {
      setupError.hidden = true;
      const code = document.getElementById('totpEnableCode').value.trim();

      try {
        await window.ScripForgeAuth.apiFetch('/api/admin/2fa/enable', { method: 'POST', body: { code } });
        toast('Two-factor authentication enabled.', 'success');
        renderTotpStatus(true);
      } catch (err) {
        setupError.textContent = err.message;
        setupError.hidden = false;
      }
    });

    const disableBtn = document.getElementById('totpDisableBtn');
    const disableError = document.getElementById('totpDisableError');

    disableBtn.addEventListener('click', async () => {
      disableError.hidden = true;
      const password = document.getElementById('totpDisablePassword').value;

      try {
        await window.ScripForgeAuth.apiFetch('/api/admin/2fa/disable', { method: 'POST', body: { password } });
        toast('Two-factor authentication disabled.', 'success');
        document.getElementById('totpDisablePassword').value = '';
        renderTotpStatus(false);
      } catch (err) {
        disableError.textContent = err.message;
        disableError.hidden = false;
      }
    });
  }

  async function init() {
    const { refreshCsrfToken, loadCurrentUser, logout, getImpersonating, stopImpersonating, escapeHtml } = window.ScripForgeAuth;

    await refreshCsrfToken();
    const user = await loadCurrentUser().catch(() => null);

    if (!user || user.role !== 'admin') {
      const gate = document.getElementById('adminGate');
      const impersonating = getImpersonating();
      // An admin who's currently "viewing as" a customer (see the
      // Impersonate button in Users) has a non-admin role for the duration —
      // landing here would otherwise be a dead end, so offer a way back to
      // their own identity instead of the normal sign-in prompt.
      gate.innerHTML = impersonating
        ? `
          <p>You're currently viewing the site as <strong>${escapeHtml(impersonating.asUsername)}</strong>, so the admin dashboard is hidden.</p>
          <button type="button" class="btn btn-primary" id="gateExitImpersonateBtn">Exit and return to Admin</button>
        `
        : `
          <p>Admin access required.</p>
          <a href="../pages/login?redirect=../admin/admin" class="btn btn-primary">Sign in</a>
        `;
      gate.hidden = false;
      document.getElementById('adminLayout').hidden = true;

      const exitBtn = document.getElementById('gateExitImpersonateBtn');
      if (exitBtn) {
        exitBtn.addEventListener('click', async () => {
          try {
            await stopImpersonating();
            window.location.reload();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      }
      return;
    }

    cachedUserId = user.id;
    document.getElementById('adminGate').hidden = true;
    document.getElementById('adminLayout').hidden = false;
    document.getElementById('adminEmail').textContent = user.username;

    document.getElementById('adminLogoutBtn').addEventListener('click', async () => {
      await logout();
      window.location.href = '/';
    });

    setupTabs();
    setupPasswordForm();
    setupTotpControls();
    setupAddPackForm();
    setupAddPromoForm();
    setupAddBundleForm();
    setupAddUserForm();
    setupErrorLogControls();
    setupSearchFilters();
    renderTotpStatus(user.totpEnabled);

    try {
      await Promise.all([
        loadDashboard(), loadUsers(), loadOrders(), loadAuditLog(), loadCatalog(),
        loadSystemStatus(), loadAnalytics(), loadSettings(), loadPromoCodes(),
        loadBundles(), populateReviewsPackSelect(), loadErrorLog()
      ]);
    } catch (err) {
      console.error('Failed to load admin data:', err);
      toast('Could not load some admin data. See console for details.', 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
