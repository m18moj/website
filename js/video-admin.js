(function () {
  const KIND_LABELS = { tiktok: 'TikTok', shorts: 'YT Shorts', promo: 'Pack Promo', website: 'Website Promo' };
  const PLATFORM_LABELS = { tiktok: 'TikTok', youtube_shorts: 'YT Shorts' };
  const SCHEDULABLE_KINDS = ['tiktok', 'shorts', 'promo'];
  const QUALITY_TIERS = ['draft', 'standard', 'high', 'ultra'];
  const QUALITY_LABELS = { draft: 'Draft', standard: 'Standard', high: 'High', ultra: 'Ultra' };
  let jobsPollTimer = null;
  let currentModalJobId = null;
  let currentApprovePath = null;
  let currentQuality = 'standard';
  let currentPacing = 'normal';
  let currentLength = 'auto';
  let currentAngle = 'auto';
  let currentSpeed = 'normal';
  let currentAnimation = 'moderate';
  let currentCaptionsEnabled = true;
  let currentTtsEnabled = true;
  let currentMusicEnabled = true;
  let currentBeatMatch = false;
  let packNameCache = {};
  let intelligenceDays = 30;

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

  function formatUptime(sec) {
    if (sec === null || sec === undefined) return '—';
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  }

  function showTab(tab) {
    document.querySelectorAll('.admin-tab').forEach((el) => el.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach((el) => el.classList.remove('active'));
    document.getElementById(tab).classList.add('active');
    document.querySelector(`[data-admin-tab="${tab}"]`).classList.add('active');
  }

  function closeAllModals() {
    ['jobLogModal', 'previewModal', 'approveModal', 'accountModal'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    const video = document.getElementById('approveModalVideo');
    if (video) { video.pause(); video.removeAttribute('src'); }
    const previewVideo = document.getElementById('previewModalVideo');
    if (previewVideo) { previewVideo.pause(); previewVideo.removeAttribute('src'); }
    currentModalJobId = null;
    currentApprovePath = null;
  }

  function setupModalKeyboard() {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAllModals();
    });
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
    try {
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
        <div class="video-status-row"><span><span class="video-dot ${data.tts.edge ? 'on' : 'off'}"></span>Edge neural (free)</span><span>${data.tts.edge ? 'Available' : 'Missing edge-tts'}</span></div>
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
    } catch (err) {
      toast('Failed to load status: ' + err.message, 'error');
      return null;
    }
  }

  // --- Deployment & server status ----------------------------------------

  async function loadDeployment() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    let ver = null;
    try {
      const resp = await fetch('/video-admin/version.json', { cache: 'no-store' });
      if (resp.ok) ver = await resp.json();
    } catch { /* static version file unavailable */ }

    let status = null;
    let statusError = null;
    try {
      status = await apiFetch('/api/video-admin/status');
    } catch (err) {
      statusError = err.message;
    }

    const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '—');
    const serverOnline = !!status;
    const versionText = ver ? `v${ver.version}` : 'no version';

    const navBadge = document.getElementById('videoVersionBadge');
    if (navBadge) {
      navBadge.textContent = versionText;
      navBadge.className = 'video-version-badge ' + (ver ? 'ready' : 'offline');
    }
    const badge = document.getElementById('deployVersionBadge');
    if (badge) {
      badge.textContent = versionText;
      badge.className = 'video-status-pill ' + (ver ? 'ready' : 'offline');
    }

    const container = document.getElementById('deployStatusContainer');
    if (!container) return;

    const latestRows = status && status.latestFiles && status.latestFiles.length
      ? status.latestFiles.map((f) => `
          <div class="video-status-row"><span>${escapeHtml(f.name)}</span><span>${fmt(f.modified)}</span></div>
        `).join('')
      : '<div class="video-status-row"><span>No rendered outputs yet</span><span>—</span></div>';

    container.innerHTML = `
      <div class="video-status-row"><span><span class="video-dot ${serverOnline ? 'on' : 'off'}"></span>API server</span><span>${serverOnline ? `online · pid ${status.server.pid}` : statusError ? escapeHtml(statusError) : 'offline'}</span></div>
      <div class="video-status-row"><span>Server started (last restart)</span><span>${serverOnline ? fmt(status.server.startedAt) : '—'}</span></div>
      <div class="video-status-row"><span>Server uptime</span><span>${serverOnline ? formatUptime(status.server.uptimeSec) : '—'}</span></div>
      <div class="video-status-row"><span>Node runtime</span><span>${serverOnline ? `${escapeHtml(status.server.node)} · ${escapeHtml(status.server.platform)}` : '—'}</span></div>
      <div class="video-status-row"><span>Last render added</span><span>${status && status.lastRenderAt ? fmt(status.lastRenderAt) : '—'}</span></div>
      <div class="video-status-row"><span>Last deployed</span><span>${ver ? fmt(ver.builtAt) + (ver.commit ? ` · ${escapeHtml(ver.commit)}` : '') : '—'}</span></div>
      <h3 class="video-subheading">Latest files added</h3>
      ${latestRows}
    `;
  }

  // --- Render controls (quality / pacing / length / video type) -------------
  //
  // One shared set of controls (Pack Renders tab) driving every render
  // trigger in the app — per-pack buttons, the Website Promo button, and the
  // Overview test render — instead of duplicating pickers per surface.
  // Persisted defaults live in the Settings tab and are mirrored here.

  let renderPresetsCache = { quality: [], pacing: [], length: [], angle: [], speed: [], animation: [] };

  function applyQualityToUI(id) {
    currentQuality = id;
    const slider = document.getElementById('qualitySlider');
    const valueEl = document.getElementById('qualitySliderValue');
    const descEl = document.getElementById('qualitySliderDesc');
    const select = document.getElementById('setQuality');
    const index = Math.max(0, QUALITY_TIERS.indexOf(id));
    if (slider) slider.value = index;
    if (select) select.value = id;
    const preset = renderPresetsCache.quality.find((p) => p.id === id);
    if (valueEl) valueEl.textContent = (preset && preset.label) || QUALITY_LABELS[id] || id;
    if (descEl) descEl.textContent = (preset && preset.description) || '';
  }

  // Shared by pacing/length/angle — each is a <select> dropdown populated
  // with preset options plus an "Other" entry. When "Other" is selected a
  // companion text/textarea input appears for a custom value (numeric
  // multiplier/second count, or free-form creative direction for video type).
  // Both the Pack Renders and Settings panels use the same presets.
  function populatePresetOptions(selectEl, presets) {
    if (!selectEl) return;
    selectEl.innerHTML = presets.map((p) => `<option value="${p.id}">${p.label}</option>`).join('') + '<option value="__other__">Other</option>';
  }

  const CUSTOM_SELECT_ID = '__other__';

  // Mirrors the backend xFor() resolvers (video/pipeline/config/*.mjs) just
  // well enough to preview what a typed value will resolve to, before the
  // render actually runs.
  function describePresetValue(kind, raw) {
    const value = (raw || '').trim();
    if (!value) return '';
    const preset = renderPresetsCache[kind].find((p) => p.id.toLowerCase() === value.toLowerCase());
    if (preset) return preset.description || '';
    if (kind === 'angle') return `Custom creative direction — sent to the copywriter as-is.`;
    const numeric = parseFloat(value.replace(/[a-z]/gi, ''));
    if (Number.isFinite(numeric) && numeric > 0) {
      if (kind === 'pacing') return `Custom cut-speed multiplier: ${numeric}× the normal transition length.`;
      if (kind === 'length') return `Custom target length: ~${numeric}s of narration.`;
      if (kind === 'animation') return `Custom animation intensity multiplier: ${numeric}×.`;
    }
    if (kind === 'speed' && Number.isFinite(parseFloat(value))) {
      return `Custom TTS rate: ${parseFloat(value)} on the -10..10 scale.`;
    }
    return '';
  }

  function currentValueFor(kind) {
    return { pacing: currentPacing, length: currentLength, angle: currentAngle, speed: currentSpeed, animation: currentAnimation }[kind];
  }

  function setCurrentValueFor(kind, value) {
    if (kind === 'pacing') currentPacing = value;
    if (kind === 'length') currentLength = value;
    if (kind === 'angle') currentAngle = value;
    if (kind === 'speed') currentSpeed = value;
    if (kind === 'animation') currentAnimation = value;
  }

  function applyPresetToUI(kind, value) {
    const selectId = { pacing: 'pacingSelect', length: 'lengthSelect', angle: 'angleSelect', speed: 'speedSelect', animation: 'animationSelect' }[kind];
    const customInputId = { pacing: 'pacingSelectCustom', length: 'lengthSelectCustom', angle: 'angleSelectCustom', speed: 'speedSelectCustom', animation: 'animationSelectCustom' }[kind];
    const settingsSelectId = { pacing: 'setPacing', length: 'setLength', angle: 'setAngle', speed: 'setSpeed', animation: 'setAnimation' }[kind];
    const settingsCustomInputId = { pacing: 'setPacingCustom', length: 'setLengthCustom', angle: 'setAngleCustom', speed: 'setSpeedCustom', animation: 'setAnimationCustom' }[kind];
    const descId = { pacing: 'pacingSelectDesc', length: 'lengthSelectDesc', angle: 'angleSelectDesc', speed: 'speedSelectDesc', animation: 'animationSelectDesc' }[kind];

    const select = document.getElementById(selectId);
    const customInput = document.getElementById(customInputId);
    const settingsSelect = document.getElementById(settingsSelectId);
    const settingsCustomInput = document.getElementById(settingsCustomInputId);
    const descEl = document.getElementById(descId);

    const trimmed = (value || '').trim();
    const isPreset = trimmed && renderPresetsCache[kind].some((p) => p.id === trimmed);
    const selectVal = isPreset ? trimmed : trimmed ? CUSTOM_SELECT_ID : '';
    const customVal = isPreset ? '' : trimmed;

    if (select && document.activeElement !== select) select.value = selectVal;
    if (customInput && document.activeElement !== customInput) {
      customInput.value = customVal;
      customInput.hidden = selectVal !== CUSTOM_SELECT_ID;
    }
    if (settingsSelect && document.activeElement !== settingsSelect) settingsSelect.value = selectVal;
    if (settingsCustomInput && document.activeElement !== settingsCustomInput) {
      settingsCustomInput.value = customVal;
      settingsCustomInput.hidden = selectVal !== CUSTOM_SELECT_ID;
    }

    if (descEl) {
      if (isPreset) {
        descEl.textContent = describePresetValue(kind, trimmed);
      } else if (trimmed) {
        descEl.textContent = describePresetValue(kind, trimmed);
      } else {
        descEl.textContent = '';
      }
    }
  }

  async function setupRenderControls() {
    const { apiFetch } = window.ScripForgeAuth;
    try {
      renderPresetsCache = await apiFetch('/api/video-admin/render-presets');
    } catch {
      renderPresetsCache = { quality: [], pacing: [], length: [], angle: [], speed: [], animation: [] };
    }

    const slider = document.getElementById('qualitySlider');
    if (slider) {
      slider.addEventListener('input', () => applyQualityToUI(QUALITY_TIERS[Number(slider.value)] || 'standard'));
    }
    applyQualityToUI(currentQuality);

    const selectMapping = {
      pacing: { select: 'pacingSelect', custom: 'pacingSelectCustom', settingsSelect: 'setPacing', settingsCustom: 'setPacingCustom' },
      length: { select: 'lengthSelect', custom: 'lengthSelectCustom', settingsSelect: 'setLength', settingsCustom: 'setLengthCustom' },
      angle: { select: 'angleSelect', custom: 'angleSelectCustom', settingsSelect: 'setAngle', settingsCustom: 'setAngleCustom' },
      speed: { select: 'speedSelect', custom: 'speedSelectCustom', settingsSelect: 'setSpeed', settingsCustom: 'setSpeedCustom' },
      animation: { select: 'animationSelect', custom: 'animationSelectCustom', settingsSelect: 'setAnimation', settingsCustom: 'setAnimationCustom' }
    };

    ['pacing', 'length', 'angle', 'speed', 'animation'].forEach((kind) => {
      const ids = selectMapping[kind];
      const presets = renderPresetsCache[kind];
      populatePresetOptions(document.getElementById(ids.select), presets);
      populatePresetOptions(document.getElementById(ids.settingsSelect), presets);
      applyPresetToUI(kind, currentValueFor(kind));

      const onValueChange = (val) => {
        setCurrentValueFor(kind, val);
        applyPresetToUI(kind, val);
      };

      document.getElementById(ids.select).addEventListener('change', (e) => {
        const customInput = document.getElementById(ids.custom);
        if (e.target.value === CUSTOM_SELECT_ID) {
          customInput.hidden = false;
          customInput.focus();
          onValueChange(customInput.value);
        } else {
          customInput.hidden = true;
          customInput.value = '';
          onValueChange(e.target.value);
        }
      });

      document.getElementById(ids.custom).addEventListener('input', (e) => {
        onValueChange(e.target.value);
      });

      document.getElementById(ids.settingsSelect).addEventListener('change', (e) => {
        const customInput = document.getElementById(ids.settingsCustom);
        if (e.target.value === CUSTOM_SELECT_ID) {
          customInput.hidden = false;
          customInput.focus();
        } else {
          customInput.hidden = true;
          customInput.value = '';
        }
      });

    });

    setupToggleControls();
  }

  // Captions/TTS/music/beat-match — plain on-off toggles, mirrored between
  // the Pack Renders control panel and the Settings tab's saved defaults,
  // same "control panel <-> settings" sync applyPresetToUI does for the
  // preset dropdowns above. Captions require real TTS word-level cues, so
  // turning TTS off forces captions off too (see orchestrate.mjs); voiceover
  // and music can't both be off at once (a silent, musicless video isn't
  // supported) — the backend enforces this too, but catching it client-side
  // avoids a round trip to find out.
  const TOGGLE_IDS = {
    captions: { control: 'renderCaptionsToggle', settings: 'setCaptionsEnabled' },
    tts: { control: 'renderTtsToggle', settings: 'setTtsEnabled' },
    music: { control: 'renderMusicToggle', settings: 'setMusicEnabled' },
    beatMatch: { control: 'renderBeatMatchToggle', settings: 'setBeatMatch' }
  };

  function currentToggleFor(kind) {
    return { captions: currentCaptionsEnabled, tts: currentTtsEnabled, music: currentMusicEnabled, beatMatch: currentBeatMatch }[kind];
  }

  function setCurrentToggleFor(kind, value) {
    if (kind === 'captions') currentCaptionsEnabled = value;
    if (kind === 'tts') currentTtsEnabled = value;
    if (kind === 'music') currentMusicEnabled = value;
    if (kind === 'beatMatch') currentBeatMatch = value;
  }

  function applyToggleToUI(kind, value) {
    const ids = TOGGLE_IDS[kind];
    const controlEl = document.getElementById(ids.control);
    const settingsEl = document.getElementById(ids.settings);
    if (controlEl) controlEl.checked = value;
    if (settingsEl) settingsEl.checked = value;
    if (kind === 'tts' && controlEl) {
      // No TTS -> no word-level cues -> captions can't render. Lock the
      // captions toggle off (rather than just unchecking it once) so it's
      // clear why it can't be turned back on until TTS is re-enabled.
      const captionsIds = TOGGLE_IDS.captions;
      [captionsIds.control, captionsIds.settings].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = !value;
        if (!value) el.checked = false;
      });
      if (!value) setCurrentToggleFor('captions', false);
    }
  }

  function setupToggleControls() {
    const errorEl = document.getElementById('renderControlsToggleError');
    Object.keys(TOGGLE_IDS).forEach((kind) => {
      applyToggleToUI(kind, currentToggleFor(kind));
    });

    Object.entries(TOGGLE_IDS).forEach(([kind, ids]) => {
      [ids.control, ids.settings].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', (e) => {
          const value = e.target.checked;
          if (kind === 'tts' && !value && !currentToggleFor('music')) {
            e.target.checked = true;
            if (errorEl) { errorEl.textContent = 'At least one of voiceover or music must stay enabled.'; errorEl.hidden = false; }
            return;
          }
          if (kind === 'music' && !value && !currentToggleFor('tts')) {
            e.target.checked = true;
            if (errorEl) { errorEl.textContent = 'At least one of voiceover or music must stay enabled.'; errorEl.hidden = false; }
            return;
          }
          if (errorEl) errorEl.hidden = true;
          setCurrentToggleFor(kind, value);
          applyToggleToUI(kind, value);
        });
      });
    });
  }

  // --- Pack renders --------------------------------------------------------

  async function triggerRender(kind, packId, button, resetLabel) {
    const { apiFetch } = window.ScripForgeAuth;
    if (button) { button.disabled = true; button.textContent = 'Queuing…'; }
    try {
      await apiFetch('/api/video-admin/jobs', {
        method: 'POST',
        body: {
          kind, packId: packId || undefined, quality: currentQuality, pacing: currentPacing, length: currentLength, angle: currentAngle,
          speed: currentSpeed, animation: currentAnimation,
          captionsEnabled: currentCaptionsEnabled, ttsEnabled: currentTtsEnabled, musicEnabled: currentMusicEnabled, beatMatch: currentBeatMatch
        }
      });
      toast(`${KIND_LABELS[kind] || kind} render queued.`, 'success');
      showTab('queue');
      await loadJobs();
      startJobsPolling();
      await loadPacks();
    } catch (err) {
      toast(err.message, 'error');
      if (button) { button.disabled = false; button.textContent = resetLabel || `Render ${KIND_LABELS[kind] || kind}`; }
    }
  }

  // Populates the Overview test-render pack picker from the real catalog —
  // any pack, any format, using whatever render controls are set on the
  // Pack Renders tab. Falls back to the first pack if nothing is chosen.
  async function setupTestRender() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    const form = document.getElementById('testRenderForm');
    const packSelect = document.getElementById('testRenderPack');
    const kindSelect = document.getElementById('testRenderKind');
    const btn = document.getElementById('renderTestBtn');
    if (!form || !packSelect || !kindSelect || !btn) return;

    try {
      const { packs } = await apiFetch('/api/video-admin/packs');
      packSelect.innerHTML = packs.map((p) => `<option value="${escapeHtml(p.packId)}">${escapeHtml(p.packName)} (${escapeHtml(p.gameTitle)})</option>`).join('');
    } catch (err) {
      packSelect.innerHTML = '<option value="">No packs available</option>';
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const packId = packSelect.value;
      const kind = kindSelect.value;
      if (!packId) { toast('No pack selected to render.', 'error'); return; }
      // triggerRender shows its own success/error toast and navigates to the
      // Queue tab on success, but (unlike the per-pack buttons, which get
      // recreated by the next loadPacks()) this static button would
      // otherwise stay disabled until a page reload — reset it either way.
      await triggerRender(kind, packId, btn, '🎬 Render test video');
      btn.disabled = false;
      btn.textContent = '🎬 Render test video';
    });
  }

  async function loadPacks() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    const { packs } = await apiFetch('/api/video-admin/packs');
    packs.forEach((p) => { packNameCache[p.packId] = p.packName; });
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
      closeJobModal();
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
  let currentPreviewPath = null;

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
      const schedulable = SCHEDULABLE_KINDS.includes(o.kind) && !o.approval;
      const hasScore = typeof o.predictedScore === 'number';
      const scoreClass = hasScore ? (o.predictedScore >= 60 ? 'good' : o.predictedScore >= 40 ? 'mid' : 'low') : '';
      return `
        <div class="video-gallery-card" data-path="${escapeHtml(o.relPath)}" data-name="${escapeHtml(o.name)}">
          <div class="video-gallery-thumb-wrap ${vertical ? 'vertical' : ''}">
            <img loading="lazy" src="/api/video-admin/outputs/thumbnail?path=${encodeURIComponent(o.relPath)}" alt="">
            <div class="video-gallery-play">▶</div>
            ${o.durationSec ? `<div class="video-gallery-duration">${formatDuration(o.durationSec)}</div>` : ''}
            ${o.approval ? `<div class="video-scheduled-badge status-${escapeHtml(o.approval.status)}">✓ Scheduled · ${escapeHtml(PLATFORM_LABELS[o.approval.platform] || o.approval.platform)}</div>` : ''}
            ${hasScore ? `<div class="video-score-badge ${scoreClass}" title="Predicted popularity (0-100)">${Math.round(o.predictedScore)}</div>` : ''}
          </div>
          <div class="video-gallery-card-body">
            <div class="name">${escapeHtml(o.name)}</div>
            <div class="sub">${o.kind ? escapeHtml(KIND_LABELS[o.kind] || o.kind) + ' · ' : ''}${o.width || '?'}×${o.height || '?'} · ${formatBytes(o.sizeBytes)}</div>
            ${o.isRedo ? '<div class="empty-state">↻ Auto-redo of a low-scoring render</div>' : ''}
            ${o.hasRedo && !o.isRedo ? '<div class="empty-state">↻ Scored low — an improved redo was queued</div>' : ''}
            <div class="video-gallery-actions">
              ${schedulable ? `<button type="button" class="video-approve-btn" data-path="${escapeHtml(o.relPath)}">Approve &amp; schedule</button>` : ''}
              <button type="button" class="video-download-btn" data-path="${escapeHtml(o.relPath)}">⬇ Download</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.video-gallery-card').forEach((card) => {
      card.addEventListener('click', () => openPreview(card.dataset.path, card.dataset.name));
    });
    container.querySelectorAll('.video-approve-btn').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        openApproveModal(btn.dataset.path);
      });
    });
    container.querySelectorAll('.video-download-btn').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        window.open(`/api/video-admin/outputs/download?path=${encodeURIComponent(btn.dataset.path)}`, '_blank');
      });
    });
  }

  async function loadGallery() {
    const { apiFetch } = window.ScripForgeAuth;
    const { outputs } = await apiFetch('/api/video-admin/outputs');
    galleryCache = outputs;
    renderGallery();
  }

  function openPreview(relPath, name) {
    currentPreviewPath = relPath;
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
    currentPreviewPath = null;
  }

  function setupGallery() {
    document.getElementById('galleryKindFilter').addEventListener('change', renderGallery);
    document.getElementById('previewModalClose').addEventListener('click', closePreview);
    document.getElementById('previewModalBackdrop').addEventListener('click', closePreview);
    document.getElementById('previewDownloadBtn').addEventListener('click', () => {
      if (currentPreviewPath) {
        window.open(`/api/video-admin/outputs/download?path=${encodeURIComponent(currentPreviewPath)}`, '_blank');
      }
    });
  }

  // --- Approve & schedule (admin → social upload) ------------------------

  // Default platform per render kind; the modal restricts the selector to
  // the kinds the backend actually allows.
  function platformForKind(kind) {
    if (kind === 'shorts') return 'youtube_shorts';
    return 'tiktok';
  }

  function allowedPlatformsForKind(kind) {
    if (kind === 'shorts') return ['youtube_shorts'];
    if (kind === 'tiktok') return ['tiktok'];
    return ['tiktok', 'youtube_shorts'];
  }

  function restrictPlatformOptions(kind) {
    const allowed = allowedPlatformsForKind(kind);
    const select = document.getElementById('approvePlatform');
    Array.from(select.options).forEach((opt) => {
      opt.hidden = !allowed.includes(opt.value);
      if (!allowed.includes(opt.value) && opt.selected) opt.selected = false;
    });
    if (!allowed.includes(select.value)) select.value = allowed[0];
  }

  // Backend returns 'YYYY-MM-DD HH:MM:SS' UTC — convert to the local
  // datetime-local value the input expects.
  function toLocalInputValue(utcDateTime) {
    if (!utcDateTime) return '';
    const date = new Date(utcDateTime.replace(' ', 'T') + 'Z');
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  async function openApproveModal(relPath) {
    const { apiFetch } = window.ScripForgeAuth;
    currentApprovePath = relPath;
    const item = galleryCache.find((o) => o.relPath === relPath);
    const kind = item && item.kind;
    restrictPlatformOptions(kind);

    document.getElementById('approveModalTitle').textContent = `Approve & schedule — ${item ? item.name : relPath}`;
    const video = document.getElementById('approveModalVideo');
    video.src = `/api/video-admin/outputs/media?path=${encodeURIComponent(relPath)}`;
    const errorBox = document.getElementById('approveError');
    errorBox.hidden = true;
    document.getElementById('approveModal').hidden = false;
    document.getElementById('approveConfirmBtn').disabled = true;

    try {
      const platform = document.getElementById('approvePlatform').value;
      const { draft } = await apiFetch(`/api/video-admin/outputs/approval-draft?path=${encodeURIComponent(relPath)}&platform=${platform}`);
      document.getElementById('approveTitle').value = draft.title;
      document.getElementById('approveDescription').value = draft.description;
      document.getElementById('approveScheduledAt').value = toLocalInputValue(draft.scheduledAt);
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
    } finally {
      document.getElementById('approveConfirmBtn').disabled = false;
    }
  }

  function closeApproveModal() {
    document.getElementById('approveModal').hidden = true;
    const video = document.getElementById('approveModalVideo');
    video.pause();
    video.removeAttribute('src');
    video.load();
    currentApprovePath = null;
  }

  async function submitApproveForm() {
    const { apiFetch } = window.ScripForgeAuth;
    const errorBox = document.getElementById('approveError');
    errorBox.hidden = true;
    const btn = document.getElementById('approveConfirmBtn');
    btn.disabled = true;
    try {
      const platform = document.getElementById('approvePlatform').value;
      const body = {
        path: currentApprovePath,
        platform,
        title: document.getElementById('approveTitle').value.trim(),
        description: document.getElementById('approveDescription').value.trim()
      };
      const scheduledAt = document.getElementById('approveScheduledAt').value;
      if (scheduledAt) body.scheduledAt = new Date(scheduledAt).toISOString();

      const result = await apiFetch('/api/video-admin/outputs/approve', { method: 'POST', body });
      toast(
        result.alreadyScheduled
          ? 'Video already scheduled — no duplicate created.'
          : `Scheduled for ${PLATFORM_LABELS[platform] || platform}. It will upload when due.`,
        'success'
      );
      closeApproveModal();
      await Promise.all([loadGallery(), loadScheduledPosts()]);
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
      btn.disabled = false;
    }
  }

  function setupApproveModal() {
    document.getElementById('approveModalClose').addEventListener('click', closeApproveModal);
    document.getElementById('approveModalBackdrop').addEventListener('click', closeApproveModal);
    document.getElementById('approveCancelBtn').addEventListener('click', closeApproveModal);
    document.getElementById('approveForm').addEventListener('submit', (event) => {
      event.preventDefault();
      submitApproveForm();
    });
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

  // --- Scheduled for upload (admin approvals) ---------------------------

  async function loadScheduledPosts() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    const { publications } = await apiFetch('/api/video-admin/approvals');
    const container = document.getElementById('scheduledPostsContainer');

    if (!publications.length) {
      container.innerHTML = '<p class="empty-state">No admin-approved posts scheduled yet — approve a render from the Output Gallery.</p>';
      return;
    }

    container.innerHTML = publications.map((p) => `
      <div class="bot-list-row">
        <div class="bot-list-row-header">
          <strong>${escapeHtml(p.title)}</strong>
          <span class="video-job-status-tag status-${p.status === 'published' ? 'completed' : p.status === 'failed' ? 'failed' : p.status === 'publishing' ? 'running' : 'queued'}">${escapeHtml(p.status)}</span>
        </div>
        <div class="empty-state">
          ${escapeHtml(PLATFORM_LABELS[p.platform] || p.platform)} · scheduled ${formatDate(p.scheduledAt)}${p.videoPath ? ` · ${escapeHtml(p.videoPath)}` : ''}
          ${p.publishedAt ? ` · posted ${formatDate(p.publishedAt)}` : ''}
          ${p.platformUrl ? ` · <a href="${escapeHtml(p.platformUrl)}" target="_blank" rel="noopener">view post</a>` : ''}
          ${p.error ? ` · <span style="color:#ef4444">${escapeHtml(p.error)}</span>` : ''}
        </div>
      </div>
    `).join('');
  }

  // --- Settings ------------------------------------------------------------

  async function loadSettings() {
    const { apiFetch } = window.ScripForgeAuth;
    const { settings } = await apiFetch('/api/video-admin/settings');
    document.getElementById('setTtsVoice').value = settings.ttsVoice || '';
    document.getElementById('setEdgeTtsVoice').value = settings.edgeTtsVoice || '';
    document.getElementById('setPreferGpu').checked = settings.preferGpu !== false;
    applyQualityToUI(settings.quality || 'standard');

    setCurrentToggleFor('tts', settings.ttsEnabled !== false);
    setCurrentToggleFor('music', settings.musicEnabled !== false);
    setCurrentToggleFor('captions', settings.captionsEnabled !== false);
    setCurrentToggleFor('beatMatch', !!settings.beatMatch);
    applyToggleToUI('tts', currentToggleFor('tts'));
    applyToggleToUI('music', currentToggleFor('music'));
    applyToggleToUI('captions', currentToggleFor('captions'));
    applyToggleToUI('beatMatch', currentToggleFor('beatMatch'));

    const selectIdFor = {
      pacing: 'setPacing', length: 'setLength', angle: 'setAngle', speed: 'setSpeed', animation: 'setAnimation'
    };
    const customIdFor = {
      pacing: 'setPacingCustom', length: 'setLengthCustom', angle: 'setAngleCustom', speed: 'setSpeedCustom', animation: 'setAnimationCustom'
    };
    const fields = [
      { kind: 'pacing', raw: settings.pacing, fallback: 'normal' },
      { kind: 'length', raw: settings.length, fallback: 'auto' },
      { kind: 'angle', raw: settings.angle, fallback: 'auto' },
      { kind: 'speed', raw: settings.speed, fallback: 'normal' },
      { kind: 'animation', raw: settings.animation, fallback: 'moderate' }
    ];
    fields.forEach(({ kind, raw, fallback }) => {
      const trimmed = (raw || '').trim();
      const value = trimmed || fallback;
      const isPreset = renderPresetsCache[kind] && renderPresetsCache[kind].some((p) => p.id === trimmed);
      if (trimmed && !isPreset) {
        setCurrentValueFor(kind, trimmed);
        const selectEl = document.getElementById(selectIdFor[kind]);
        const customEl = document.getElementById(customIdFor[kind]);
        if (selectEl) selectEl.value = CUSTOM_SELECT_ID;
        if (customEl) { customEl.value = trimmed; customEl.hidden = false; }
      } else {
        setCurrentValueFor(kind, value);
        applyPresetToUI(kind, value);
      }
    });

    ['pacing', 'length', 'angle', 'speed', 'animation'].forEach((kind) => {
      const current = currentValueFor(kind);
      applyPresetToUI(kind, current);
    });
  }

  function setupSettingsForm() {
    document.getElementById('videoSettingsForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorBox = document.getElementById('videoSettingsError');
      errorBox.hidden = true;
      const { apiFetch } = window.ScripForgeAuth;
      try {
        const resolveField = (selectId, customId) => {
          const selectEl = document.getElementById(selectId);
          const customEl = document.getElementById(customId);
          if (selectEl.value === CUSTOM_SELECT_ID && customEl) return customEl.value.trim();
          return selectEl.value;
        };
        const ttsEnabled = document.getElementById('setTtsEnabled').checked;
        const musicEnabled = document.getElementById('setMusicEnabled').checked;
        if (!ttsEnabled && !musicEnabled) {
          throw new Error('At least one of voiceover or music must stay enabled as the default.');
        }
        await apiFetch('/api/video-admin/settings', {
          method: 'PUT',
          body: {
            ttsVoice: document.getElementById('setTtsVoice').value.trim(),
            edgeTtsVoice: document.getElementById('setEdgeTtsVoice').value.trim(),
            preferGpu: document.getElementById('setPreferGpu').checked,
            quality: document.getElementById('setQuality').value,
            pacing: resolveField('setPacing', 'setPacingCustom'),
            length: resolveField('setLength', 'setLengthCustom'),
            angle: resolveField('setAngle', 'setAngleCustom'),
            speed: resolveField('setSpeed', 'setSpeedCustom'),
            animation: resolveField('setAnimation', 'setAnimationCustom'),
            captionsEnabled: document.getElementById('setCaptionsEnabled').checked,
            ttsEnabled,
            musicEnabled,
            beatMatch: document.getElementById('setBeatMatch').checked
          }
        });
        applyQualityToUI(document.getElementById('setQuality').value);
        ['pacing', 'length', 'angle', 'speed', 'animation'].forEach((kind) => {
          const resolved = resolveField(
            { pacing: 'setPacing', length: 'setLength', angle: 'setAngle', speed: 'setSpeed', animation: 'setAnimation' }[kind],
            { pacing: 'setPacingCustom', length: 'setLengthCustom', angle: 'setAngleCustom', speed: 'setSpeedCustom', animation: 'setAnimationCustom' }[kind]
          );
          setCurrentValueFor(kind, resolved);
          applyPresetToUI(kind, resolved);
        });
        setCurrentToggleFor('captions', document.getElementById('setCaptionsEnabled').checked);
        setCurrentToggleFor('tts', ttsEnabled);
        setCurrentToggleFor('music', musicEnabled);
        setCurrentToggleFor('beatMatch', document.getElementById('setBeatMatch').checked);
        applyToggleToUI('tts', ttsEnabled);
        applyToggleToUI('music', musicEnabled);
        applyToggleToUI('captions', currentToggleFor('captions'));
        applyToggleToUI('beatMatch', currentToggleFor('beatMatch'));
        toast('Settings saved.', 'success');
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
      }
    });
  }

  // --- Social accounts (multi-account posting) ---------------------------

  const CRED_FIELDS = {
    tiktok: [
      { key: 'clientKey', label: 'Client key' },
      { key: 'clientSecret', label: 'Client secret' },
      { key: 'refreshToken', label: 'Refresh token' }
    ],
    youtube_shorts: [
      { key: 'clientId', label: 'Client ID' },
      { key: 'clientSecret', label: 'Client secret' },
      { key: 'refreshToken', label: 'Refresh token' }
    ]
  };

  let accountsCache = [];
  let editingAccountId = null;

  function renderAccountCredFields(platform, isEdit) {
    const fields = CRED_FIELDS[platform] || [];
    const container = document.getElementById('accountCredFields');
    container.innerHTML = fields.map((f) => `
      <div class="form-group">
        <label for="accountCred_${f.key}">${f.label}${isEdit ? ' (leave blank to keep current)' : ''}</label>
        <input id="accountCred_${f.key}" type="password" autocomplete="off" placeholder="${isEdit ? '••••••••' : ''}">
      </div>
    `).join('');
  }

  function renderAccounts() {
    const { escapeHtml } = window.ScripForgeAuth;
    const container = document.getElementById('accountsGridContainer');
    if (!accountsCache.length) {
      container.innerHTML = '<p class="empty-state">No accounts connected — using the single legacy account from social/.env, if configured.</p>';
      return;
    }
    container.innerHTML = `<div class="video-account-grid">${accountsCache.map((a) => `
      <div class="video-account-card" data-id="${a.id}">
        <div class="video-account-card-header">
          <strong>${escapeHtml(a.label)}</strong>
          <span class="video-status-pill ${a.enabled ? 'ready' : 'offline'}">${a.enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
        <div class="empty-state">${escapeHtml(PLATFORM_LABELS[a.platform] || a.platform)}</div>
        <div class="empty-state">${a.credentialsConfigured ? 'Credentials configured' : 'No credentials set — add them via Update credentials'}</div>
        <div class="empty-state">${a.nichePackIds && a.nichePackIds.length ? `Focus: ${a.nichePackIds.map(escapeHtml).join(', ')}` : 'Promotes every pack'}</div>
        <div class="empty-state">Last used: ${formatDate(a.lastUsedAt)}</div>
        <div class="video-account-actions">
          <button type="button" class="btn-small account-toggle-btn" data-id="${a.id}">${a.enabled ? 'Disable' : 'Enable'}</button>
          <button type="button" class="btn-small account-edit-btn" data-id="${a.id}">Update credentials</button>
          <button type="button" class="btn-small account-delete-btn" data-id="${a.id}">Remove</button>
        </div>
      </div>
    `).join('')}</div>`;

    container.querySelectorAll('.account-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await window.ScripForgeAuth.apiFetch(`/api/video-admin/accounts/${btn.dataset.id}/toggle`, { method: 'POST' });
          await loadAccounts();
          toast('Account updated.', 'success');
        } catch (err) { toast(err.message, 'error'); }
      });
    });
    container.querySelectorAll('.account-delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!window.confirm('Remove this account? Already-scheduled posts for it are unaffected; new ones will stop being created for it.')) return;
        try {
          await window.ScripForgeAuth.apiFetch(`/api/video-admin/accounts/${btn.dataset.id}`, { method: 'DELETE' });
          await loadAccounts();
          toast('Account removed.', 'success');
        } catch (err) { toast(err.message, 'error'); }
      });
    });
    container.querySelectorAll('.account-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => openAccountModal(Number(btn.dataset.id)));
    });
  }

  async function loadAccounts() {
    const { apiFetch } = window.ScripForgeAuth;
    const { accounts } = await apiFetch('/api/video-admin/accounts');
    accountsCache = accounts;
    renderAccounts();
  }

  function openAccountModal(accountId) {
    editingAccountId = accountId || null;
    const account = accountId ? accountsCache.find((a) => a.id === accountId) : null;
    document.getElementById('accountModalTitle').textContent = account ? `Update credentials — ${account.label}` : 'Add account';
    const platformSelect = document.getElementById('accountPlatform');
    platformSelect.value = account ? account.platform : 'tiktok';
    platformSelect.disabled = Boolean(account);
    document.getElementById('accountLabel').value = account ? account.label : '';
    document.getElementById('accountNiche').value = account && account.nichePackIds ? account.nichePackIds.join(', ') : '';
    renderAccountCredFields(platformSelect.value, Boolean(account));
    document.getElementById('accountFormError').hidden = true;
    document.getElementById('accountModal').hidden = false;
  }

  function closeAccountModal() {
    document.getElementById('accountModal').hidden = true;
    document.getElementById('accountPlatform').disabled = false;
    editingAccountId = null;
  }

  async function submitAccountForm() {
    const errorBox = document.getElementById('accountFormError');
    errorBox.hidden = true;
    const btn = document.getElementById('accountSaveBtn');
    btn.disabled = true;
    try {
      const platform = document.getElementById('accountPlatform').value;
      const fields = CRED_FIELDS[platform] || [];
      const credentials = {};
      fields.forEach((f) => {
        const el = document.getElementById(`accountCred_${f.key}`);
        const val = el ? el.value.trim() : '';
        if (val) credentials[f.key] = val;
      });
      const nichePackIds = document.getElementById('accountNiche').value.split(',').map((s) => s.trim()).filter(Boolean);
      const { apiFetch } = window.ScripForgeAuth;

      if (editingAccountId) {
        await apiFetch(`/api/video-admin/accounts/${editingAccountId}`, {
          method: 'PUT',
          body: {
            label: document.getElementById('accountLabel').value.trim(),
            credentials: Object.keys(credentials).length ? credentials : undefined,
            nichePackIds
          }
        });
      } else {
        if (!Object.keys(credentials).length) throw new Error('Fill in the credential fields above.');
        await apiFetch('/api/video-admin/accounts', {
          method: 'POST',
          body: { platform, label: document.getElementById('accountLabel').value.trim(), credentials, nichePackIds }
        });
      }
      toast('Account saved.', 'success');
      closeAccountModal();
      await loadAccounts();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
    } finally {
      btn.disabled = false;
    }
  }

  function setupAccounts() {
    document.getElementById('addAccountBtn').addEventListener('click', () => openAccountModal(null));
    document.getElementById('accountModalClose').addEventListener('click', closeAccountModal);
    document.getElementById('accountModalBackdrop').addEventListener('click', closeAccountModal);
    document.getElementById('accountCancelBtn').addEventListener('click', closeAccountModal);
    document.getElementById('accountPlatform').addEventListener('change', (e) => renderAccountCredFields(e.target.value, Boolean(editingAccountId)));
    document.getElementById('accountForm').addEventListener('submit', (event) => {
      event.preventDefault();
      submitAccountForm();
    });
  }

  // --- Trend intelligence ---------------------------------------------------
  //
  // Read-only view of the trends/analytics/insights loop that already runs
  // on a cron in the background (social/scheduler.js) — see server/routes/videoAdmin.js
  // GET /intelligence. "Refresh now" just enqueues the same jobs the cron
  // ticks enqueue, so it's always a safe no-op if one is already running.

  function confidencePct(c) {
    return `${Math.round((c || 0) * 100)}%`;
  }

  // Turns a raw group key (a preset id, or an AI-authored contentPillar
  // string) into display text — preset lookups for pacing/length/angle so
  // labels match what's shown in Render controls, plain maps for
  // platform/quality, and title-cased fallback for anything else (a
  // contentPillar the fixed angle list doesn't have an exact id for, or a
  // pack id with no cached name yet).
  function formatBreakdownKey(kind, key) {
    if (kind === 'platform') return PLATFORM_LABELS[key] || key;
    if (kind === 'quality') return QUALITY_LABELS[key] || key;
    if (kind === 'pack') return packNameCache[key] || key;
    const presets = renderPresetsCache[kind] || [];
    const preset = presets.find((p) => p.id === key);
    if (preset) return preset.label;
    return String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  async function loadIntelligence() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    try {
    const { trends, trendMomentum, insights, rankedRenders, performance, forecasts, scorecard } = await apiFetch(`/api/video-admin/intelligence?days=${intelligenceDays}`);

    const trendsEl = document.getElementById('trendsContainer');
    trendsEl.innerHTML = trends.length
      ? trends.map((t) => `
          <div class="video-status-row"><span>${escapeHtml(t.topic)} <span class="empty-state">(${escapeHtml(t.source)})</span></span><span>${formatDate(t.capturedAt)}</span></div>
        `).join('')
      : '<p class="empty-state">No trend data captured yet — refreshes hourly.</p>';

    const momentumEl = document.getElementById('trendMomentumContainer');
    momentumEl.innerHTML = trendMomentum.length
      ? trendMomentum.map((m) => `
          <div class="video-status-row">
            <span>${escapeHtml(m.source)}</span>
            <span class="video-momentum-tag ${escapeHtml(m.direction)}">${m.direction === 'rising' ? '↑' : m.direction === 'falling' ? '↓' : '→'} ${escapeHtml(m.direction)} (${m.changePct > 0 ? '+' : ''}${m.changePct}%)</span>
          </div>
        `).join('')
      : '<p class="empty-state">Not enough trend history yet to compute direction — needs several days of continuous captures on each side of the window.</p>';

    const DIRECTION_ARROW = { rising: '↑', falling: '↓', flat: '→' };
    const forecastsEl = document.getElementById('trendForecastsContainer');
    const activeForecasts = (forecasts && forecasts.active) || [];
    const resolvedForecasts = (forecasts && forecasts.recentResolved) || [];
    forecastsEl.innerHTML = activeForecasts.length || resolvedForecasts.length
      ? [
          ...activeForecasts.map((f) => `
            <div class="video-status-row">
              <span>
                <span class="video-momentum-tag ${escapeHtml(f.predictedDirection)}">${DIRECTION_ARROW[f.predictedDirection] || ''} ${escapeHtml(f.predictedDirection)}</span>
                ${escapeHtml(f.topic)} <span class="empty-state">(${escapeHtml(f.source)}, ${confidencePct(f.confidence)} confidence)</span>
              </span>
              <span class="empty-state">pending — resolves ${formatDate(f.createdAt)} +${f.horizonDays}d</span>
            </div>
          `),
          ...resolvedForecasts.slice(0, 8).map((f) => `
            <div class="video-status-row">
              <span>
                <span class="video-rank-score ${f.status === 'correct' ? 'good' : f.status === 'incorrect' ? 'low' : 'mid'}">${f.status === 'correct' ? '✓' : f.status === 'incorrect' ? '✗' : '?'}</span>
                ${escapeHtml(f.topic)} <span class="empty-state">(${escapeHtml(f.source)}, predicted ${escapeHtml(f.predictedDirection)}${f.actualDirection ? `, actually ${escapeHtml(f.actualDirection)}` : ''})</span>
              </span>
              <span class="empty-state">${formatDate(f.resolvedAt)}</span>
            </div>
          `)
        ].join('')
      : '<p class="empty-state">No forecasts yet — generated nightly once there\'s enough momentum data to reason about.</p>';

    const scorecardEl = document.getElementById('aiScorecardContainer');
    const scorecardRow = (label, stats) => {
      if (!stats || !stats.total) {
        return `<div class="video-status-row"><span>${label}</span><span class="empty-state">no resolved predictions yet</span></div>`;
      }
      const accClass = stats.accuracyPct == null ? 'mid' : stats.accuracyPct >= 60 ? 'good' : stats.accuracyPct >= 40 ? 'mid' : 'low';
      return `
        <div class="video-status-row">
          <span>${label} <span class="empty-state">(${stats.total} resolved, ${stats.inconclusive} inconclusive)</span></span>
          <span class="video-rank-score ${accClass}">${stats.accuracyPct == null ? 'n/a' : `${stats.accuracyPct}%`} <span class="empty-state">avg reward ${stats.avgReward}</span></span>
        </div>
      `;
    };
    scorecardEl.innerHTML = scorecardRow('Trend forecasts', scorecard && scorecard.trendForecast) + scorecardRow('Popularity predictions', scorecard && scorecard.popularityPrediction);

    const rankedEl = document.getElementById('rankedRendersContainer');
    rankedEl.innerHTML = rankedRenders.length
      ? rankedRenders.map((r) => {
          const scoreClass = r.predictedScore >= 60 ? 'good' : r.predictedScore >= 40 ? 'mid' : 'low';
          return `
            <div class="video-status-row">
              <span>
                <span class="video-rank-score ${scoreClass}">${Math.round(r.predictedScore)}</span>
                ${escapeHtml(packNameCache[r.packId] || r.packId || 'Website')} · ${escapeHtml(KIND_LABELS[r.kind] || r.kind)}
                ${r.angle ? `· ${escapeHtml(r.angle)}` : ''}
                ${r.redoOf ? '<span class="empty-state">(redo)</span>' : ''}
                ${r.hasRedo ? '<span class="empty-state">(redone)</span>' : ''}
              </span>
              <span class="empty-state">${formatDate(r.createdAt)}</span>
            </div>
          `;
        }).join('')
      : '<p class="empty-state">No scored renders in this window yet — every completed render gets scored automatically.</p>';

    const insightsEl = document.getElementById('insightsContainer');
    insightsEl.innerHTML = insights.length
      ? insights.map((i) => `
          <div class="video-status-row"><span>${escapeHtml(i.insight)} <span class="empty-state">(${escapeHtml(i.scope)}, ${confidencePct(i.confidence)} confidence)</span></span><span>${formatDate(i.createdAt)}</span></div>
        `).join('')
      : '<p class="empty-state">No learned insights yet — needs published posts with performance data. Runs nightly.</p>';

    document.getElementById('performanceGrid').innerHTML = `
      <div class="stat-card"><div class="stat-label">Posts tracked</div><div class="stat-value">${performance.postsTracked}</div></div>
      <div class="stat-card"><div class="stat-label">Views</div><div class="stat-value">${performance.totals.views.toLocaleString()}</div></div>
      <div class="stat-card"><div class="stat-label">Likes</div><div class="stat-value">${performance.totals.likes.toLocaleString()}</div></div>
      <div class="stat-card"><div class="stat-label">Comments</div><div class="stat-value">${performance.totals.comments.toLocaleString()}</div></div>
      <div class="stat-card"><div class="stat-label">Shares</div><div class="stat-value">${performance.totals.shares.toLocaleString()}</div></div>
    `;

    const topPostsEl = document.getElementById('topPostsContainer');
    topPostsEl.innerHTML = performance.topPosts.length
      ? performance.topPosts.map((post) => `
          <div class="video-toppost-row">
            <div class="video-toppost-main">
              <strong>${escapeHtml(post.title || '(untitled)')}</strong>
              <span class="empty-state">
                ${escapeHtml(PLATFORM_LABELS[post.platform] || post.platform)}${post.packId ? ` · ${escapeHtml(packNameCache[post.packId] || post.packId)}` : ''}
                · ${post.source === 'admin' ? 'Admin render' : 'AI-authored'}${post.angle ? ` · ${escapeHtml(formatBreakdownKey('angle', post.angle))}` : ''}
              </span>
            </div>
            <div class="video-toppost-stats">
              <span>${post.views.toLocaleString()} views</span>
              <span>${(post.engagementRate * 100).toFixed(1)}% engagement</span>
              ${post.platformUrl ? `<a href="${escapeHtml(post.platformUrl)}" target="_blank" rel="noopener">view post</a>` : ''}
            </div>
          </div>
        `).join('')
      : '<p class="empty-state">No published posts with tracked performance yet in this window.</p>';

    const dims = [
      { key: 'byAngle', kind: 'angle', title: 'By video type' },
      { key: 'byPacing', kind: 'pacing', title: 'By pacing' },
      { key: 'byLength', kind: 'length', title: 'By rough length' },
      { key: 'byQuality', kind: 'quality', title: 'By quality' },
      { key: 'byPlatform', kind: 'platform', title: 'By platform' },
      { key: 'byPack', kind: 'pack', title: 'By pack' }
    ];
    document.getElementById('breakdownGridContainer').innerHTML = dims.map(({ key, kind, title }) => {
      const groups = (performance[key] || []).slice(0, 6);
      const maxViews = Math.max(1, ...groups.map((g) => g.avgViews));
      return `
        <div class="video-breakdown-card">
          <h4>${title}</h4>
          ${groups.length
            ? groups.map((g) => `
                <div class="video-breakdown-row">
                  <div class="video-breakdown-row-label">
                    <span>${escapeHtml(formatBreakdownKey(kind, g.key))}</span>
                    <span class="empty-state">${g.avgViews.toLocaleString()} avg views · ${g.posts} post${g.posts === 1 ? '' : 's'} · ${(g.avgEngagementRate * 100).toFixed(1)}% eng.</span>
                  </div>
                  <div class="video-breakdown-bar-track"><div class="video-breakdown-bar" style="width:${Math.round((g.avgViews / maxViews) * 100)}%"></div></div>
                </div>
              `).join('')
            : '<p class="empty-state">Not enough data yet.</p>'}
        </div>
      `;
    }).join('');
    } catch (err) {
      toast('Failed to load intelligence: ' + err.message, 'error');
    }
  }

  function setupIntelligence() {
    const daysSelect = document.getElementById('intelligenceDays');
    if (daysSelect) {
      daysSelect.addEventListener('change', () => {
        intelligenceDays = Number(daysSelect.value) || 30;
        loadIntelligence().catch((err) => toast(err.message, 'error'));
      });
    }

    const btn = document.getElementById('refreshIntelligenceBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Refreshing…';
      try {
        await window.ScripForgeAuth.apiFetch('/api/video-admin/intelligence/refresh', { method: 'POST' });
        toast('Refresh queued — trend/analytics/insight jobs run in the background, usually within a couple minutes.', 'success');
        setTimeout(() => { loadIntelligence().catch(() => {}); loadRisingTrends().catch(() => {}); loadTrendAlerts().catch(() => {}); }, 5000);
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '🔄 Refresh now';
      }
    });
  }

  // --- Trend Intelligence extensions (rising trends, alerts, overrides, digest) ---

  async function loadRisingTrends() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    const container = document.getElementById('risingTrendsContainer');
    if (!container) return;
    try {
      const { trends } = await apiFetch('/api/trend-insights/rising?days=14&limit=15');
      if (!trends || !trends.length) {
        container.innerHTML = '<p class="empty-state">No rising trends detected yet. Trends need to accumulate momentum over several days.</p>';
        return;
      }
      container.innerHTML = trends.map((t) => {
        const conf = t.forecastConfidence != null ? `${Math.round(t.forecastConfidence * 100)}%` : '—';
        const change = t.changePct != null ? `${t.changePct > 0 ? '+' : ''}${t.changePct}%` : '—';
        const overrideBadge = t.override === 'always_pursue' ? ' <span style="color:#4ade80;font-size:0.8em">[always pursue]</span>' : '';
        return `<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08)">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div><strong>${escapeHtml(t.topic)}</strong>${overrideBadge} <span class="empty-state">${escapeHtml(t.source)}</span></div>
            <div style="font-size:0.85em;text-align:right">
              <span style="color:${t.momentumDirection === 'rising' ? '#4ade80' : '#f87171'}">${change}</span>
              &nbsp;|&nbsp; forecast: ${conf}
            </div>
          </div>
        </div>`;
      }).join('');
    } catch (err) {
      container.innerHTML = `<p class="empty-state">Could not load rising trends: ${escapeHtml(err.message)}</p>`;
    }
  }

  async function loadTrendAlerts() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    const container = document.getElementById('trendAlertsContainer');
    if (!container) return;
    try {
      const { alerts, webhookConfigured } = await apiFetch('/api/trend-insights/alerts');
      if (!alerts || !alerts.length) {
        container.innerHTML = `<p class="empty-state">No alerts right now. Alerts fire when a rising trend crosses both a momentum (≥15%) and forecast-confidence (≥60%) threshold.${webhookConfigured ? ' Webhook is configured.' : ''}</p>`;
        return;
      }
      container.innerHTML = alerts.map((a) => `<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><strong>${escapeHtml(a.topic)}</strong> <span class="empty-state">${escapeHtml(a.source)}</span></div>
          <div style="font-size:0.85em">
            <span style="color:#4ade80">+${a.changePct}%</span>
            &nbsp;|&nbsp; ${Math.round(a.confidence * 100)}% confidence
          </div>
        </div>
        ${a.reasoning ? `<div style="font-size:0.8em;color:rgba(255,255,255,0.6);margin-top:4px">${escapeHtml(a.reasoning)}</div>` : ''}
      </div>`).join('');
    } catch (err) {
      container.innerHTML = `<p class="empty-state">Could not load alerts: ${escapeHtml(err.message)}</p>`;
    }
  }

  async function loadTrendOverrides() {
    const { apiFetch, escapeHtml } = window.ScripForgeAuth;
    const container = document.getElementById('trendOverridesContainer');
    if (!container) return;
    try {
      const { overrides } = await apiFetch('/api/trend-overrides');
      if (!overrides || !overrides.length) {
        container.innerHTML = '<p class="empty-state">No overrides set. Add one below to pin or block a topic.</p>';
        return;
      }
      container.innerHTML = overrides.map((o) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08)">
        <div>
          <span style="color:${o.mode === 'always_pursue' ? '#4ade80' : '#f87171'};font-weight:600">${o.mode === 'always_pursue' ? '▲' : '▼'}</span>
          <strong>${escapeHtml(o.topic)}</strong>
          ${o.reason ? `<span class="empty-state" style="margin-left:8px">${escapeHtml(o.reason)}</span>` : ''}
          <span class="empty-state" style="margin-left:8px">by ${escapeHtml(o.createdBy || 'unknown')}</span>
        </div>
        <button class="btn btn-secondary btn-sm delete-override-btn" data-id="${o.id}" style="padding:2px 8px;font-size:0.8em">Remove</button>
      </div>`).join('');

      container.querySelectorAll('.delete-override-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            await apiFetch(`/api/trend-overrides/${btn.dataset.id}`, { method: 'DELETE' });
            toast('Override removed.', 'success');
            loadTrendOverrides();
          } catch (err) {
            toast(err.message, 'error');
            btn.disabled = false;
          }
        });
      });
    } catch (err) {
      container.innerHTML = `<p class="empty-state">Could not load overrides: ${escapeHtml(err.message)}</p>`;
    }
  }

  function setupOverrideForm() {
    const form = document.getElementById('addOverrideForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { apiFetch } = window.ScripForgeAuth;
      const topic = document.getElementById('overrideTopic').value.trim();
      const mode = document.getElementById('overrideMode').value;
      const reason = document.getElementById('overrideReason').value.trim();
      if (!topic) return;
      try {
        await apiFetch('/api/trend-overrides', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic, mode, reason: reason || undefined }) });
        toast(`Override added: ${mode} "${topic}"`, 'success');
        form.reset();
        loadTrendOverrides();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  function setupDigestLinks() {
    const select = document.getElementById('digestDays');
    if (!select) return;
    select.addEventListener('change', () => {
      const days = select.value;
      document.getElementById('digestCsvLink').href = `/api/trend-insights/digest?format=csv&days=${days}`;
      document.getElementById('digestMdLink').href = `/api/trend-insights/digest?format=md&days=${days}`;
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

    setupModalKeyboard();
    [setupTabs, setupPackActions, setupTestRender, setupJobModal, setupGallery, setupApproveModal, setupSettingsForm, setupAccounts, setupIntelligence, setupOverrideForm, setupDigestLinks].forEach((fn) => {
      try { fn(); } catch (err) { console.error(`video-admin: ${fn.name} failed:`, err); }
    });

    await setupRenderControls();

    try {
      await Promise.all([loadStatus(), loadPacks(), loadJobs(), loadGallery(), loadSocialQueue(), loadScheduledPosts(), loadSettings(), loadDeployment(), loadAccounts(), loadIntelligence(), loadRisingTrends(), loadTrendAlerts(), loadTrendOverrides()]);
    } catch (err) {
      console.error('Failed to load video admin data:', err);
      toast('Could not load some Video Studio data. See console for details.', 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
