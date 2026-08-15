(function () {
  function toast(message, type) {
    if (window.ScripForgeToast) window.ScripForgeToast.show(message, type);
  }

  function formatDate(isoString) {
    if (!isoString) return '—';
    return new Date(isoString.replace(' ', 'T') + 'Z').toLocaleString();
  }

  function showTab(tab) {
    document.querySelectorAll('.admin-tab').forEach((el) => el.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach((el) => el.classList.remove('active'));
    document.getElementById(tab).classList.add('active');
    document.querySelector(`[data-admin-tab="${tab}"]`).classList.add('active');
  }

  function setupTabs() {
    document.querySelectorAll('[data-admin-tab]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        showTab(link.dataset.adminTab);
      });
    });
  }

  // --- Overview --------------------------------------------------------

  async function loadOverview() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    const data = await apiFetch('/api/bot-admin/status');

    const pill = document.getElementById('botGatewayPill');
    const online = data.gateway.online && !data.gateway.stale;
    pill.textContent = online ? `Online — ${data.gateway.latencyMs}ms` : (data.gateway.online ? 'Stale heartbeat' : 'Offline');
    pill.className = `bot-status-pill ${online ? 'online' : 'offline'}`;

    const configGrid = document.getElementById('overviewConfigGrid');
    const configEntries = Object.entries(data.configured);
    configGrid.innerHTML = configEntries.map(([key, ok]) => `
      <div class="stat-card">
        <div class="stat-label">${escapeHtml(key)}</div>
        <div class="stat-value" style="font-size:1.1rem;color:${ok ? '#3ba55c' : '#ed4245'}">${ok ? 'Configured' : 'Missing'}</div>
      </div>
    `).join('');

    const gatewayContainer = document.getElementById('gatewayStatusContainer');
    if (data.gateway.online) {
      gatewayContainer.innerHTML = `
        <div class="system-status-grid">
          <div class="system-status-item"><span>Bot tag</span><strong>${escapeHtml(data.gateway.tag)}</strong></div>
          <div class="system-status-item"><span>Latency</span><strong>${data.gateway.latencyMs}ms</strong></div>
          <div class="system-status-item"><span>Guild member count</span><strong>${data.gateway.memberCount ?? '—'}</strong></div>
          <div class="system-status-item"><span>Channels</span><strong>${data.gateway.channelCount ?? '—'}</strong></div>
          <div class="system-status-item"><span>Process uptime</span><strong>${Math.round(data.gateway.processUptimeSeconds / 60)} min</strong></div>
          <div class="system-status-item"><span>Last heartbeat</span><strong>${formatDate(data.gateway.updatedAt)}${data.gateway.stale ? ' (stale)' : ''}</strong></div>
        </div>
      `;
    } else {
      gatewayContainer.innerHTML = `<p class="empty-state">${escapeHtml(data.gateway.reason || 'Bot process not running.')} Start it with <code>npm run bot</code>.</p>`;
    }

    const raidContainer = document.getElementById('raidStatusContainer');
    if (data.raid) {
      raidContainer.innerHTML = `
        <div class="system-status-grid">
          <div class="system-status-item"><span>Status</span><strong>${data.raid.inLockdown ? '🚨 Lockdown active' : 'Normal'}</strong></div>
          <div class="system-status-item"><span>Enabled</span><strong>${data.raid.enabled ? 'Yes' : 'No'}</strong></div>
          <div class="system-status-item"><span>Recent joins (window)</span><strong>${data.raid.recentJoinCount}</strong></div>
          <div class="system-status-item"><span>Threshold</span><strong>${data.raid.threshold} joins / ${data.raid.windowMs}ms</strong></div>
        </div>
      `;
    } else {
      raidContainer.innerHTML = '<p class="empty-state">Not configured — set DISCORD_GUILD_ID.</p>';
    }
  }

  // --- Moderation --------------------------------------------------------

  function setupModActionForm() {
    const showBtn = document.getElementById('showModActionForm');
    const form = document.getElementById('modActionForm');
    const typeSelect = document.getElementById('modActionType');
    const durationGroup = document.getElementById('modDurationGroup');

    showBtn.addEventListener('click', () => { form.hidden = !form.hidden; });
    typeSelect.addEventListener('change', () => {
      durationGroup.style.display = typeSelect.value === 'timeout' ? '' : 'none';
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorBox = document.getElementById('modActionError');
      errorBox.hidden = true;
      const { apiFetch } = window.ScripForgeAuth;

      try {
        await apiFetch('/api/bot-admin/mod-actions', {
          method: 'POST',
          body: {
            discordId: document.getElementById('modDiscordId').value.trim(),
            actionType: typeSelect.value,
            reason: document.getElementById('modReason').value.trim(),
            durationMs: typeSelect.value === 'timeout' ? Number(document.getElementById('modDuration').value) * 60000 : undefined
          }
        });
        toast('Action applied.', 'success');
        form.reset();
        form.hidden = true;
        await loadModActions();
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
      }
    });
  }

  async function loadModActions() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    const { actions } = await apiFetch('/api/bot-admin/mod-actions');
    const container = document.getElementById('modActionsContainer');

    if (!actions.length) {
      container.innerHTML = '<p class="empty-state">No moderation actions recorded yet.</p>';
      return;
    }

    container.innerHTML = actions.map((a) => `
      <div class="bot-list-row">
        <div class="bot-list-row-header">
          <strong>${escapeHtml(a.action_type.toUpperCase())}</strong> — ${escapeHtml(a.target_tag)}
          <span class="empty-state">${formatDate(a.created_at)}</span>
        </div>
        <div>By ${escapeHtml(a.moderator_tag)}${a.reason ? ` — ${escapeHtml(a.reason)}` : ''}</div>
      </div>
    `).join('');
  }

  // --- Automod -----------------------------------------------------------

  async function loadAutomodConfig() {
    const { apiFetch } = window.ScripForgeAuth;
    const { config } = await apiFetch('/api/bot-admin/automod/config');

    document.getElementById('amEnabled').checked = config.enabled;
    document.getElementById('amBlockInvites').checked = config.blockInviteLinks;
    document.getElementById('amBlockAllLinks').checked = config.blockAllLinks;
    document.getElementById('amMaxMentions').value = config.maxMentions;
    document.getElementById('amSpamCount').value = config.spamMessageCount;
    document.getElementById('amSpamWindow').value = config.spamWindowMs;
    document.getElementById('amBannedWords').value = (config.bannedWords || []).join(', ');
    document.getElementById('amExemptRoles').value = (config.exemptRoleIds || []).join(', ');
    document.getElementById('amExemptChannels').value = (config.exemptChannelIds || []).join(', ');
  }

  function splitList(value) {
    return value.split(',').map((v) => v.trim()).filter(Boolean);
  }

  function setupAutomodForm() {
    document.getElementById('automodConfigForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const { apiFetch } = window.ScripForgeAuth;
      try {
        await apiFetch('/api/bot-admin/automod/config', {
          method: 'PUT',
          body: {
            enabled: document.getElementById('amEnabled').checked,
            blockInviteLinks: document.getElementById('amBlockInvites').checked,
            blockAllLinks: document.getElementById('amBlockAllLinks').checked,
            maxMentions: Number(document.getElementById('amMaxMentions').value),
            spamMessageCount: Number(document.getElementById('amSpamCount').value),
            spamWindowMs: Number(document.getElementById('amSpamWindow').value),
            bannedWords: splitList(document.getElementById('amBannedWords').value),
            exemptRoleIds: splitList(document.getElementById('amExemptRoles').value),
            exemptChannelIds: splitList(document.getElementById('amExemptChannels').value)
          }
        });
        toast('Automod configuration saved.', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  async function loadAutomodInfractions() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    const { infractions } = await apiFetch('/api/bot-admin/automod/infractions');
    const container = document.getElementById('automodInfractionsContainer');

    if (!infractions.length) {
      container.innerHTML = '<p class="empty-state">No infractions recorded yet.</p>';
      return;
    }

    container.innerHTML = infractions.map((i) => `
      <div class="bot-list-row">
        <div class="bot-list-row-header">
          <strong>${escapeHtml(i.rule)}</strong> — ${escapeHtml(i.discord_tag)}
          <span class="empty-state">${formatDate(i.created_at)}</span>
        </div>
        <div>Action: ${escapeHtml(i.action_taken)}${i.message_excerpt ? ` — "${escapeHtml(i.message_excerpt)}"` : ''}</div>
      </div>
    `).join('');
  }

  // --- Tickets -------------------------------------------------------

  async function loadTickets() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    const status = document.getElementById('ticketStatusFilter').value;
    const category = document.getElementById('ticketCategoryFilter').value;
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (category) params.set('category', category);

    const { tickets, categories } = await apiFetch(`/api/bot-admin/tickets?${params.toString()}`);

    const categorySelect = document.getElementById('ticketCategoryFilter');
    if (categorySelect.options.length <= 1) {
      categories.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.value;
        opt.textContent = `${c.emoji} ${c.label}`;
        categorySelect.appendChild(opt);
      });
    }

    const { stats } = await apiFetch('/api/bot-admin/tickets/stats');
    document.getElementById('ticketStatsGrid').innerHTML = `
      <div class="stat-card"><div class="stat-label">Open</div><div class="stat-value">${stats.byStatus.open || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Claimed</div><div class="stat-value">${stats.byStatus.claimed || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Closed</div><div class="stat-value">${stats.byStatus.closed || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Avg resolution</div><div class="stat-value" style="font-size:1.2rem">${stats.avgResolutionSeconds ? Math.round(stats.avgResolutionSeconds / 60) + ' min' : '—'}</div></div>
    `;

    const container = document.getElementById('ticketsContainer');
    if (!tickets.length) {
      container.innerHTML = '<p class="empty-state">No tickets match this filter.</p>';
      return;
    }

    container.innerHTML = tickets.map((t) => `
      <div class="bot-list-row" data-ticket="${escapeHtml(t.thread_id)}">
        <div class="bot-list-row-header">
          <div>
            <span class="category-badge">${escapeHtml(t.category)}</span>
            <strong>${escapeHtml(t.opener_tag)}</strong>
            <span class="status-badge status-${t.status === 'open' ? 'pending' : t.status === 'claimed' ? 'paid' : 'canceled'}">${escapeHtml(t.status)}</span>
          </div>
          <span class="empty-state">Opened ${formatDate(t.opened_at)}</span>
        </div>
        <div class="empty-state">${t.claimed_by_tag ? `Claimed by ${escapeHtml(t.claimed_by_tag)}` : 'Unclaimed'}${t.order_id ? ` · Order #${t.order_id}` : ''}</div>
        ${t.notes && t.notes.length ? `<div style="margin-top:0.5rem"><strong>Notes:</strong> ${t.notes.map((n) => `<div class="empty-state">${escapeHtml(n.authorTag)}: ${escapeHtml(n.text)}</div>`).join('')}</div>` : ''}
        <div class="bot-list-row-actions">
          ${t.status !== 'closed' ? `<button type="button" class="btn-small ticket-close-btn">Close</button>` : `<button type="button" class="btn-small ticket-reopen-btn">Reopen</button>`}
          <button type="button" class="btn-small ticket-note-btn">Add note</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.ticket-close-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const threadId = e.target.closest('[data-ticket]').dataset.ticket;
        try {
          await window.ScripForgeAuth.apiFetch(`/api/bot-admin/tickets/${threadId}/close`, { method: 'POST' });
          toast('Ticket closed.', 'success');
          loadTickets();
        } catch (err) { toast(err.message, 'error'); }
      });
    });
    container.querySelectorAll('.ticket-reopen-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const threadId = e.target.closest('[data-ticket]').dataset.ticket;
        try {
          await window.ScripForgeAuth.apiFetch(`/api/bot-admin/tickets/${threadId}/reopen`, { method: 'POST' });
          toast('Ticket reopened.', 'success');
          loadTickets();
        } catch (err) { toast(err.message, 'error'); }
      });
    });
    container.querySelectorAll('.ticket-note-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const threadId = e.target.closest('[data-ticket]').dataset.ticket;
        const text = window.prompt('Internal note (not visible to the customer):');
        if (!text) return;
        try {
          await window.ScripForgeAuth.apiFetch(`/api/bot-admin/tickets/${threadId}/note`, { method: 'POST', body: { text } });
          toast('Note added.', 'success');
          loadTickets();
        } catch (err) { toast(err.message, 'error'); }
      });
    });
  }

  // --- Server --------------------------------------------------------

  async function loadServer() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;

    try {
      const { guild } = await apiFetch('/api/bot-admin/server-info');
      document.getElementById('serverInfoContainer').innerHTML = guild
        ? `
          <div class="system-status-grid">
            <div class="system-status-item"><span>Name</span><strong>${escapeHtml(guild.name)}</strong></div>
            <div class="system-status-item"><span>Members</span><strong>${guild.approximate_member_count ?? '—'}</strong></div>
            <div class="system-status-item"><span>Presences online</span><strong>${guild.approximate_presence_count ?? '—'}</strong></div>
            <div class="system-status-item"><span>Verification level</span><strong>${guild.verification_level}</strong></div>
          </div>
        `
        : '<p class="empty-state">Not available — bot not configured or not in the guild.</p>';
    } catch (err) {
      document.getElementById('serverInfoContainer').innerHTML = '<p class="empty-state">Not available.</p>';
    }

    try {
      const { roles } = await apiFetch('/api/bot-admin/roles');
      document.getElementById('rolesContainer').innerHTML = roles.length
        ? `<table class="users-table"><thead><tr><th>Name</th><th>ID</th><th>Color</th></tr></thead><tbody>${roles.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td><code>${r.id}</code></td><td>#${(r.color || 0).toString(16).padStart(6, '0')}</td></tr>`).join('')}</tbody></table>`
        : '<p class="empty-state">No roles found.</p>';
    } catch (err) {
      document.getElementById('rolesContainer').innerHTML = '<p class="empty-state">Not available.</p>';
    }

    try {
      const { channels } = await apiFetch('/api/bot-admin/channels');
      document.getElementById('channelsContainer').innerHTML = channels.length
        ? `<table class="users-table"><thead><tr><th>Name</th><th>ID</th><th>Type</th></tr></thead><tbody>${channels.map((c) => `<tr><td>${escapeHtml(c.name)}</td><td><code>${c.id}</code></td><td>${c.type}</td></tr>`).join('')}</tbody></table>`
        : '<p class="empty-state">No channels found.</p>';
    } catch (err) {
      document.getElementById('channelsContainer').innerHTML = '<p class="empty-state">Not available.</p>';
    }
  }

  // --- Config -------------------------------------------------------

  async function loadConfig() {
    const { apiFetch } = window.ScripForgeAuth;
    const { config } = await apiFetch('/api/bot-admin/config');

    document.getElementById('cfgStaffRoleId').value = config.staffRoleId || '';
    document.getElementById('cfgVerifiedRoleId').value = config.verifiedRoleId || '';
    document.getElementById('cfgModLogChannelId').value = config.modLogChannelId || '';
    document.getElementById('cfgTicketArchiveChannelId').value = config.ticketArchiveChannelId || '';
    document.getElementById('cfgSupportChannelId').value = config.supportChannelId || '';
    document.getElementById('cfgRaidEnabled').checked = config.raidProtectionEnabled !== false;
    document.getElementById('cfgRaidWindow').value = config.raidWindowMs || 10000;
    document.getElementById('cfgRaidThreshold').value = config.raidThreshold || 8;
  }

  function setupConfigForm() {
    document.getElementById('botConfigForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const { apiFetch } = window.ScripForgeAuth;
      try {
        await apiFetch('/api/bot-admin/config', {
          method: 'PUT',
          body: {
            staffRoleId: document.getElementById('cfgStaffRoleId').value.trim() || null,
            verifiedRoleId: document.getElementById('cfgVerifiedRoleId').value.trim() || null,
            modLogChannelId: document.getElementById('cfgModLogChannelId').value.trim() || null,
            ticketArchiveChannelId: document.getElementById('cfgTicketArchiveChannelId').value.trim() || null,
            supportChannelId: document.getElementById('cfgSupportChannelId').value.trim() || null,
            raidProtectionEnabled: document.getElementById('cfgRaidEnabled').checked,
            raidWindowMs: Number(document.getElementById('cfgRaidWindow').value),
            raidThreshold: Number(document.getElementById('cfgRaidThreshold').value)
          }
        });
        toast('Configuration saved.', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // --- Store ----------------------------------------------------------

  async function loadStore() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    const data = await apiFetch('/api/bot-admin/store');

    document.getElementById('storeStatsGrid').innerHTML = `
      <div class="stat-card"><div class="stat-label">Linked Discord accounts</div><div class="stat-value">${data.linkedAccounts}</div></div>
      <div class="stat-card"><div class="stat-label">Membership-verified</div><div class="stat-value">${data.verifiedAccounts}</div></div>
      <div class="stat-card"><div class="stat-label">Welcome discounts issued</div><div class="stat-value">${data.discountCodesIssued}</div></div>
      <div class="stat-card"><div class="stat-label">Welcome discounts redeemed</div><div class="stat-value">${data.discountCodesRedeemed}</div></div>
      <div class="stat-card"><div class="stat-label">Catalogue size</div><div class="stat-value">${data.catalogueSize}</div></div>
    `;

    document.getElementById('storeBestSellersContainer').innerHTML = data.bestSellers.length
      ? `<ol>${data.bestSellers.map((p) => `<li>${escapeHtml(p.packName)} — ${p.itemsSold} sold</li>`).join('')}</ol>`
      : '<p class="empty-state">No sales yet.</p>';
  }

  function setupStoreButtons() {
    document.getElementById('syncCatalogueBtn').addEventListener('click', async () => {
      try {
        const result = await window.ScripForgeAuth.apiFetch('/api/bot-admin/store/sync-catalogue', { method: 'POST' });
        toast(result.ok ? 'Catalogue synced.' : (result.skipped ? 'Not configured.' : `Failed: ${result.error}`), result.ok ? 'success' : 'error');
      } catch (err) { toast(err.message, 'error'); }
    });
    document.getElementById('syncBestSellersBtn').addEventListener('click', async () => {
      try {
        const result = await window.ScripForgeAuth.apiFetch('/api/bot-admin/store/sync-best-sellers', { method: 'POST' });
        toast(result.ok ? 'Best sellers refreshed.' : (result.skipped ? 'Not configured.' : `Failed: ${result.error}`), result.ok ? 'success' : 'error');
        loadStore();
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // --- Analytics -------------------------------------------------------

  async function loadAnalytics() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    const data = await apiFetch('/api/bot-admin/analytics');

    document.getElementById('analyticsStatsGrid').innerHTML = `
      <div class="stat-card"><div class="stat-label">Bot actions (24h)</div><div class="stat-value">${data.botActions24h}</div></div>
      <div class="stat-card"><div class="stat-label">Bot actions (7d)</div><div class="stat-value">${data.botActions7d}</div></div>
      <div class="stat-card"><div class="stat-label">Open tickets</div><div class="stat-value">${data.ticketStats.byStatus.open || 0}</div></div>
    `;

    document.getElementById('analyticsModBreakdown').innerHTML = Object.keys(data.modActionsRecent).length
      ? Object.entries(data.modActionsRecent).map(([type, count]) => `<div class="bot-list-row">${escapeHtml(type)}: <strong>${count}</strong></div>`).join('')
      : '<p class="empty-state">No moderation actions yet.</p>';

    document.getElementById('analyticsTicketBreakdown').innerHTML = Object.keys(data.ticketStats.byCategory).length
      ? Object.entries(data.ticketStats.byCategory).map(([cat, count]) => `<div class="bot-list-row">${escapeHtml(cat)}: <strong>${count}</strong></div>`).join('')
      : '<p class="empty-state">No tickets yet.</p>';
  }

  // --- Logs -------------------------------------------------------

  async function loadLogs() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    const { entries } = await apiFetch('/api/bot-admin/audit-log');
    const container = document.getElementById('botAuditLogContainer');

    if (!entries.length) {
      container.innerHTML = '<p class="empty-state">No bot audit log entries yet.</p>';
      return;
    }

    container.innerHTML = entries.map((e) => `
      <div class="bot-list-row">
        <div class="bot-list-row-header">
          <strong>${escapeHtml(e.action)}</strong>
          <span class="empty-state">${formatDate(e.created_at)}</span>
        </div>
        <div class="empty-state">${escapeHtml(e.actor_label)} (${escapeHtml(e.actor_type)})${e.target ? ` → ${escapeHtml(e.target)}` : ''}</div>
      </div>
    `).join('');
  }

  // --- Feature list (static, honest inventory) --------------------------

  function renderFeatureList() {
    const groups = [
      { title: 'Moderation', items: ['/ban', '/kick', '/timeout', '/warn', '/unban', '/modhistory', 'Manual moderation from dashboard', 'Mod-log embeds', 'Full moderation history (DB-backed)'] },
      { title: 'Automod', items: ['Spam detection', 'Invite-link blocking', 'All-link blocking (optional)', 'Custom word filter', 'Excessive mention detection', 'Escalating punishment (delete → timeout → timeout → kick)', 'Role/channel exemptions', 'Raid protection (auto verification-level lockdown)', 'Infraction history + dashboard'] },
      { title: 'Tickets', items: ['Category-required ticket creation (9 categories)', 'Claim / Close / Reopen', 'Internal staff notes', 'Transcript generation', 'Order context auto-attached', 'Ticket stats (by status/category, avg resolution)', 'Dashboard filtering'] },
      { title: 'Verification & Discord Integration', items: ['/verify slash command', 'Website OAuth2 linking', 'Server-side membership verification (bot REST, not trusted client claims)', 'Automatic Verified role grant', 'One-time 15%-off, 7-day, single-use discount on verify', 'Discord-style Verify button (in onboarding DM + pinned #general)'] },
      { title: 'Product / Store Sync', items: ['New-product announcement embeds (duplicate-safe)', 'Full-catalogue synced message (auto-edited, not reposted)', 'Best-sellers auto-refresh on sales (rate-limited)', 'Manual "sync now" from dashboard'] },
      { title: 'Server Management', items: ['/setup-server scaffolds roles/channels/categories', 'Role listing', 'Channel listing', 'Guild info (member count, verification level)'] },
      { title: 'Bot Health & Ops', items: ['Live gateway heartbeat (status, latency, uptime)', 'Configuration status panel', 'Bot audit log (every action, filterable)', 'Analytics (mod actions, ticket breakdown, sync activity)'] },
      { title: 'Assistant', items: ['/ask — Claude-powered Q&A', 'DM chat with shared assistant', 'Shared with the website chat widget'] }
    ];

    document.getElementById('featureListContainer').innerHTML = `
      <div class="feature-list-grid">
        ${groups.map((g) => `
          <div class="feature-list-group">
            <h3>${g.title}</h3>
            <ul>${g.items.map((i) => `<li>${i}</li>`).join('')}</ul>
          </div>
        `).join('')}
      </div>
    `;
  }

  async function init() {
    const { refreshCsrfToken, loadCurrentUser, logout, escapeHtml } = window.ScripForgeAuth;

    await refreshCsrfToken();
    const user = await loadCurrentUser().catch(() => null);

    if (!user || user.role !== 'admin') {
      const gate = document.getElementById('adminGate');
      gate.innerHTML = `<p>Admin access required.</p><a href="../pages/login?redirect=../bot-admin" class="btn btn-primary">Sign in</a>`;
      gate.hidden = false;
      document.getElementById('adminLayout').hidden = true;
      return;
    }

    document.getElementById('adminGate').hidden = true;
    document.getElementById('adminLayout').hidden = false;
    document.getElementById('adminEmail').textContent = user.username;

    document.getElementById('adminLogoutBtn').addEventListener('click', async () => {
      await logout();
      window.location.href = '/';
    });

    setupTabs();
    setupModActionForm();
    setupAutomodForm();
    setupConfigForm();
    setupStoreButtons();
    renderFeatureList();

    document.getElementById('ticketStatusFilter').addEventListener('change', loadTickets);
    document.getElementById('ticketCategoryFilter').addEventListener('change', loadTickets);

    try {
      await Promise.all([
        loadOverview(), loadModActions(), loadAutomodConfig(), loadAutomodInfractions(),
        loadTickets(), loadServer(), loadConfig(), loadStore(), loadAnalytics(), loadLogs()
      ]);
    } catch (err) {
      console.error('Failed to load bot admin data:', err);
      toast('Could not load some bot dashboard data. See console for details.', 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
