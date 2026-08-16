(function () {
  const KIND_LABELS = { tiktok: 'TikTok', shorts: 'YT Shorts', promo: 'Pack Promo', website: 'Website Promo' };
  let jobsPollTimer = null;
  let currentModalJobId = null;

  function toast(message, type) {
    if (window.ScripForgeToast) window.ScripForgeToast.show(message, type);
  }

  function formatDate(isoString) {
    if (!isoString) return '—';
    return new Date(isoString.replace(' ', 'T') + 'Z').toLocaleString();
  }

  function formatDuration(sec) {
    if (sec === null || sec === undefined) return '—';
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
  }

  function formatBytes(bytes) {
    if (!bytes) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0, val = bytes;
    while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
    return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
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

  // --- Overview / readiness --------------------------------------------

  async function loadStatus() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    const data = await apiFetch('/api/video-admin/status');

    const pill = document.getElementById('videoReadinessPill');
    if (data.renderReady && data.tools.ffmpeg && data.dependenciesInstalled) {
      pill.textContent = 'Render-ready';
      pill.className = 'video-status-pill ready';
    } else if (data.tools.ffmpeg) {
      pill.textContent = 'Pipeline warming up';
      pill.className = 'video-status-pill partial';
    } else {
      pill.textContent = 'Not ready';
      pill.className = 'video-status-pill offline';
    }

    document.getElementById('readinessGrid').innerHTML = `
      <div class="stat-card"><div class="stat-label">ffmpeg</div><div class="stat-value" style="font-size:1.1rem;color:${data.tools.ffmpeg ? '#10b981' : '#ef4444'}">${data.tools.ffmpeg ? 'Available' : 'Missing'}</div></div>
      <div class="stat-card"><div class="stat-label">GPU (NVENC)</div><div class="stat-value" style="font-size:1.1rem;color:${data.tools.gpu ? '#10b981' : '#b0b0b0'}">${data.tools.gpu ? escapeHtml(data.tools.gpu.name) : 'CPU only'}</div></div>
      <div class="stat-card"><div class="stat-label">Dependencies</div><div class="stat-value" style="font-size:1.1rem;color:${data.dependenciesInstalled ? '#10b981' : '#ef4444'}">${data.dependenciesInstalled ? 'Installed' : 'Missing'}</div></div>
      <div class="stat-card"><div class="stat-label">Render pipeline</div><div class="stat-value" style="font-size:1.1rem;color:${data.renderReady ? '#10b981' : '#f59e0b'}">${data.renderReady ? 'Ready' : 'Building'}</div></div>
    `;

    document.getElementById('toolsStatusContainer').innerHTML = `
      <div class="video-status-row"><span><span class="video-dot ${data.tools.ffmpeg ? 'on' : 'off'}"></span>ffmpeg</span><span>${data.tools.ffmpeg ? 'OK' : 'Not found on PATH'}</span></div>
      <div class="video-status-row"><span><span class="video-dot ${data.tools.ffprobe ? 'on' : 'off'}"></span>ffprobe</span><span>${data.tools.ffprobe ? 'OK' : 'Not found on PATH'}</span></div>
      <div class="video-status-row"><span><span class="video-dot ${data.tools.gpu ? 'on' : 'off'}"></span>NVIDIA GPU</span><span>${data.tools.gpu ? `${escapeHtml(data.tools.gpu.name)} (driver ${escapeHtml(data.tools.gpu.driver)})` : 'Not detected'}</span></div>
      <div class="video-status-row"><span><span class="video-dot ${data.anthropic ? 'on' : 'off'}"></span>Anthropic (copywriting)</span><span>${data.anthropic ? 'Configured' : 'Missing key'}</span></div>
    `;

    document.getElementById('ttsStatusContainer').innerHTML = `
      <div class="video-status-row"><span><span class="video-dot ${data.tts.sapi ? 'on' : 'off'}"></span>Windows SAPI (free)</span><span>${data.tts.sapi ? 'Available' : 'Not available'}</span></div>
      <div class="video-status-row"><span><span class="video-dot ${data.tts.elevenlabs ? 'on' : 'off'}"></span>ElevenLabs (premium)</span><span>${data.tts.elevenlabs ? 'Configured' : 'No API key set'}</span></div>
    `;

    const scriptEntries = Object.entries(data.scripts).concat(Object.entries(data.lib).map(([k, v]) => [`lib:${k}`, v]));
    document.getElementById('scriptsStatusContainer').innerHTML = scriptEntries.map(([key, ok]) => `
      <div class="video-status-row"><span><span class="video-dot ${ok ? 'on' : 'off'}"></span>${escapeHtml(key)}</span><span>${ok ? 'Present' : 'Pending'}</span></div>
    `).join('');

    document.getElementById('smokeTestsContainer').innerHTML = `
      <div class="video-status-row"><span><span class="video-dot ${data.smokeTests.social ? 'on' : 'off'}"></span>Social smoke test</span><span>${data.smokeTests.social ? 'Rendered' : 'Not run yet'}</span></div>
      <div class="video-status-row"><span><span class="video-dot ${data.smokeTests.website ? 'on' : 'off'}"></span>Website smoke test</span><span>${data.smokeTests.website ? 'Rendered' : 'Not run yet'}</span></div>
    `;

    return data;
  }

  // --- Pack renders --------------------------------------------------------

  async function triggerRender(kind, packId, button) {
    const { apiFetch } = window.ScripForgeAuth;
    if (button) { button.disabled = true; button.textContent = 'Queuing…'; }
    try {
      await apiFetch('/api/video-admin/jobs', { method: 'POST', body: { kind, packId: packId || undefined } });
      toast(`${KIND_LABELS[kind] || kind} render queued.`, 'success');
      showTab('queue');
      document.querySelector('[data-admin-tab="queue"]').classList.add('active');
      document.querySelectorAll('.menu-item').forEach((el) => el.classList.remove('active'));
      document.querySelector('[data-admin-tab="queue"]').classList.add('active');
      await loadJobs();
      startJobsPolling();
      await loadPacks();
    } catch (err) {
      toast(err.message, 'error');
      if (button) { button.disabled = false; button.textContent = `Render ${KIND_LABELS[kind] || kind}`; }
    }
  }

  async function loadPacks() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    const { packs } = await apiFetch('/api/video-admin/packs');
    const container = document.getElementById('packsGridContainer');

    if (!packs.length) {
      container.innerHTML = '<p class="empty-state">No packs in the catalog yet.</p>';
      return;
    }

    container.innerHTML = `<div class="video-pack-grid">${packs.map((p) => `
      <div class="video-pack-card">
        <div class="video-pack-card-header">
          <strong>${escapeHtml(p.packName)}</strong>
          <span>${escapeHtml(p.gameTitle)}${p.hidden ? ' · hidden' : ''}</span>
        </div>
        <div class="empty-state">${p.scriptCount} script${p.scriptCount === 1 ? '' : 's'}</div>
        <div class="video-platform-row">
          ${['tiktok', 'shorts', 'promo'].map((kind) => `
            <button type="button" class="video-platform-btn ${p.renders[kind] ? 'has-render' : ''}" data-kind="${kind}" data-pack="${escapeHtml(p.packId)}">
              ${p.renders[kind] ? '✓ ' : ''}${KIND_LABELS[kind]}
            </button>
          `).join('')}
        </div>
      </div>
    `).join('')}</div>`;

    container.querySelectorAll('.video-platform-btn').forEach((btn) => {
      btn.addEventListener('click', () => triggerRender(btn.dataset.kind, btn.dataset.pack, btn));
    });
  }

  function setupPackActions() {
    document.getElementById('renderWebsiteBtn').addEventListener('click', (e) => triggerRender('website', null, e.currentTarget));
  }

  // --- Render queue ----------------------------------------------------------

  function jobHasMotion(job) {
    return job.status === 'queued' || job.status === 'running';
  }

  async function loadJobs() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    const { jobs, counts } = await apiFetch('/api/video-admin/jobs');

    document.getElementById('queueCountsSummary').textContent =
      `Queued ${counts.queued || 0} · Running ${counts.running || 0} · Completed ${counts.completed || 0} · Failed ${counts.failed || 0}`;

    const container = document.getElementById('jobsListContainer');
    if (!jobs.length) {
      container.innerHTML = '<p class="empty-state">No render jobs yet — trigger one from Pack Renders.</p>';
    } else {
      container.innerHTML = jobs.map((j) => `
        <div class="video-job-row status-${j.status}" data-job="${j.id}">
          <div class="video-job-row-header">
            <div><span class="video-kind-badge">${escapeHtml(j.kind)}</span><strong>${escapeHtml(j.packId || 'Website')}</strong></div>
            <span class="video-job-status-tag status-${j.status}">${escapeHtml(j.status)}</span>
          </div>
          <div class="video-job-meta">
            <span>Triggered by ${escapeHtml(j.triggeredBy)}</span>
            <span>${formatDate(j.createdAt)}</span>
            ${j.error ? `<span style="color:#ef4444">${escapeHtml(j.error)}</span>` : ''}
          </div>
        </div>
      `).join('');
    }

    container.querySelectorAll('.video-job-row').forEach((row) => {
      row.addEventListener('click', () => openJobModal(Number(row.dataset.job)));
    });

    const anyActive = jobs.some(jobHasMotion);
    if (anyActive) startJobsPolling(); else stopJobsPolling();

    if (currentModalJobId) {
      const active = jobs.find((j) => j.id === currentModalJobId);
      if (active) renderJobModal(active);
    }

    return { jobs, counts };
  }

  function startJobsPolling() {
    if (jobsPollTimer) return;
    jobsPollTimer = setInterval(() => { loadJobs().catch(() => {}); }, 3500);
  }

  function stopJobsPolling() {
    if (!jobsPollTimer) return;
    clearInterval(jobsPollTimer);
    jobsPollTimer = null;
  }

  function qaBadges(qa, escapeHtml) {
    if (!qa) return '<p class="empty-state">No QA report yet.</p>';
    if (qa.error) return `<p class="empty-state">QA could not run: ${escapeHtml(qa.error)}</p>`;
    if (!qa.checks) return '<p class="empty-state">QA pending.</p>';
    return `<div class="video-qa-checks">${qa.checks.map((c) => `
      <span class="video-qa-badge ${c.pass === true ? 'pass' : c.pass === false ? 'fail' : 'unknown'}">${c.pass === true ? '✓' : c.pass === false ? '✗' : '?'} ${escapeHtml(c.name || c.label || '')}</span>
    `).join('')}</div>`;
  }

  function renderJobModal(job) {
    const { escapeHtml } = window.ScripForgeAuth;
    document.getElementById('jobLogModalTitle').textContent = `${KIND_LABELS[job.kind] || job.kind} — ${job.packId || 'Website'}`;
    document.getElementById('jobLogModalMeta').innerHTML = `
      <span class="video-job-status-tag status-${job.status}">${escapeHtml(job.status)}</span>
      <span>Triggered by ${escapeHtml(job.triggeredBy)}</span>
      <span>${formatDate(job.createdAt)}</span>
    `;
    const logEl = document.getElementById('jobLogModalLog');
    const wasScrolledToBottom = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 20;
    logEl.textContent = job.log || '(no output yet)';
    if (wasScrolledToBottom) logEl.scrollTop = logEl.scrollHeight;

    document.getElementById('jobLogModalQa').innerHTML = qaBadges(job.qa, escapeHtml);

    const playerContainer = document.getElementById('jobLogModalPlayer');
    if (job.status === 'completed' && job.outputPath) {
      playerContainer.innerHTML = `<video controls class="video-preview-player" src="/api/video-admin/jobs/${job.id}/media"></video>`;
    } else if (jobHasMotion(job)) {
      const actionsHtml = `<button type="button" class="btn btn-secondary" id="jobCancelBtn">Cancel job</button>`;
      playerContainer.innerHTML = actionsHtml;
      const cancelBtn = document.getElementById('jobCancelBtn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', async () => {
          try {
            await window.ScripForgeAuth.apiFetch(`/api/video-admin/jobs/${job.id}/cancel`, { method: 'POST' });
            toast('Job cancelled.', 'success');
            await loadJobs();
          } catch (err) { toast(err.message, 'error'); }
        });
      }
    } else {
      playerContainer.innerHTML = '';
    }
  }

  async function openJobModal(id) {
    const { apiFetch } = window.ScripForgeAuth;
    currentModalJobId = id;
    const modal = document.getElementById('jobLogModal');
    modal.hidden = false;
    try {
      const { job } = await apiFetch(`/api/video-admin/jobs/${id}`);
      renderJobModal(job);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function closeJobModal() {
    document.getElementById('jobLogModal').hidden = true;
    currentModalJobId = null;
  }

  function setupJobModal() {
    document.getElementById('jobLogModalClose').addEventListener('click', closeJobModal);
    document.getElementById('jobLogModalBackdrop').addEventListener('click', closeJobModal);
  }

  // --- Output gallery -------------------------------------------------------

  let galleryCache = [];

  function renderGallery() {
    const { escapeHtml } = window.ScripForgeAuth;
    const filter = document.getElementById('galleryKindFilter').value;
    const items = filter ? galleryCache.filter((o) => o.kind === filter) : galleryCache;
    const container = document.getElementById('galleryGridContainer');

    if (!items.length) {
      container.innerHTML = '<p class="empty-state">No rendered outputs yet.</p>';
      return;
    }

    container.innerHTML = items.map((o) => {
      const vertical = o.height && o.width && o.height > o.width;
      return `
        <div class="video-gallery-card" data-path="${escapeHtml(o.relPath)}" data-name="${escapeHtml(o.name)}">
          <div class="video-gallery-thumb-wrap ${vertical ? 'vertical' : ''}">
            <img loading="lazy" src="/api/video-admin/outputs/thumbnail?path=${encodeURIComponent(o.relPath)}" alt="">
            <div class="video-gallery-play">▶</div>
            ${o.durationSec ? `<div class="video-gallery-duration">${formatDuration(o.durationSec)}</div>` : ''}
          </div>
          <div class="video-gallery-card-body">
            <div class="name">${escapeHtml(o.name)}</div>
            <div class="sub">${o.kind ? escapeHtml(KIND_LABELS[o.kind] || o.kind) + ' · ' : ''}${o.width || '?'}×${o.height || '?'} · ${formatBytes(o.sizeBytes)}</div>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.video-gallery-card').forEach((card) => {
      card.addEventListener('click', () => openPreview(card.dataset.path, card.dataset.name));
    });
  }

  async function loadGallery() {
    const { apiFetch } = window.ScripForgeAuth;
    const { outputs } = await apiFetch('/api/video-admin/outputs');
    galleryCache = outputs;
    renderGallery();
  }

  function openPreview(relPath, name) {
    document.getElementById('previewModalTitle').textContent = name;
    const video = document.getElementById('previewModalVideo');
    video.src = `/api/video-admin/outputs/media?path=${encodeURIComponent(relPath)}`;
    document.getElementById('previewModalMeta').innerHTML = '';
    document.getElementById('previewModal').hidden = false;
  }

  function closePreview() {
    const modal = document.getElementById('previewModal');
    modal.hidden = true;
    const video = document.getElementById('previewModalVideo');
    video.pause();
    video.removeAttribute('src');
    video.load();
  }

  function setupGallery() {
    document.getElementById('galleryKindFilter').addEventListener('change', renderGallery);
    document.getElementById('previewModalClose').addEventListener('click', closePreview);
    document.getElementById('previewModalBackdrop').addEventListener('click', closePreview);
  }

  // --- Social hand-off queue --------------------------------------------

  async function loadSocialQueue() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    const { jobs, counts } = await apiFetch('/api/video-admin/social-queue');

    document.getElementById('socialQueueCountsGrid').innerHTML = Object.entries(counts).map(([status, count]) => `
      <div class="stat-card"><div class="stat-label">${escapeHtml(status)}</div><div class="stat-value">${count}</div></div>
    `).join('');

    const container = document.getElementById('socialQueueContainer');
    if (!jobs.length) {
      container.innerHTML = '<p class="empty-state">No social-triggered video jobs yet.</p>';
      return;
    }

    container.innerHTML = jobs.map((j) => `
      <div class="bot-list-row">
        <div class="bot-list-row-header">
          <strong>Campaign #${escapeHtml(String(j.campaignId))}</strong>
          <span class="video-job-status-tag status-${j.status === 'completed' ? 'completed' : j.status === 'failed' ? 'failed' : j.status === 'rendering' ? 'running' : 'queued'}">${escapeHtml(j.status)}</span>
        </div>
        <div class="empty-state">${formatDate(j.createdAt)}${j.attempts ? ` · ${j.attempts} attempt${j.attempts === 1 ? '' : 's'}` : ''}${j.error ? ` · ${escapeHtml(j.error)}` : ''}</div>
      </div>
    `).join('');
  }

  // --- Settings ------------------------------------------------------------

  async function loadSettings() {
    const { apiFetch } = window.ScripForgeAuth;
    const { settings } = await apiFetch('/api/video-admin/settings');
    document.getElementById('setTtsVoice').value = settings.ttsVoice || '';
    document.getElementById('setTtsRate').value = settings.ttsRate || 0;
    document.getElementById('setPreferGpu').checked = settings.preferGpu !== false;
  }

  function setupSettingsForm() {
    document.getElementById('videoSettingsForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorBox = document.getElementById('videoSettingsError');
      errorBox.hidden = true;
      const { apiFetch } = window.ScripForgeAuth;
      try {
        await apiFetch('/api/video-admin/settings', {
          method: 'PUT',
          body: {
            ttsVoice: document.getElementById('setTtsVoice').value.trim(),
            ttsRate: Number(document.getElementById('setTtsRate').value),
            preferGpu: document.getElementById('setPreferGpu').checked
          }
        });
        toast('Settings saved.', 'success');
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
      }
    });
  }

  // --- Bootstrap -----------------------------------------------------------

  async function init() {
    const { refreshCsrfToken, loadCurrentUser, logout } = window.ScripForgeAuth;

    await refreshCsrfToken();
    const user = await loadCurrentUser().catch(() => null);

    if (!user || user.role !== 'admin') {
      const gate = document.getElementById('adminGate');
      gate.innerHTML = `<p>Admin access required.</p><a href="../pages/login?redirect=../video-admin" class="btn btn-primary">Sign in</a>`;
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
    setupPackActions();
    setupJobModal();
    setupGallery();
    setupSettingsForm();

    try {
      await Promise.all([loadStatus(), loadPacks(), loadJobs(), loadGallery(), loadSocialQueue(), loadSettings()]);
    } catch (err) {
      console.error('Failed to load video admin data:', err);
      toast('Could not load some Video Studio data. See console for details.', 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
