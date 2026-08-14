(function () {
    const DEVICE_ID_KEY = 'scriptforge_device_id';

    // The closest thing to a "device id" available to a plain web page without
    // installing anything: a random id generated once and kept in this
    // browser's localStorage. Clearing site data or using a different browser
    // gets a new one — see server/models/licenses.js for what this does and
    // doesn't guarantee.
    function getDeviceId() {
        let id = localStorage.getItem(DEVICE_ID_KEY);
        if (!id) {
            id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
            localStorage.setItem(DEVICE_ID_KEY, id);
        }
        return id;
    }

    function toast(message, type) {
        if (window.ScriptForgeToast) window.ScriptForgeToast.show(message, type);
    }

    // The one and only download action on this page: every script the
    // signed-in user owns, watermarked and bundled into a single zip by
    // server/routes/downloads.js (GET /api/downloads/zip).
    async function downloadAll() {
        const fp = encodeURIComponent(getDeviceId());
        const response = await fetch(`/api/downloads/zip?fp=${fp}`, { credentials: 'same-origin' });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Could not build your download bundle.');
        }

        const blob = await response.blob();
        const disposition = response.headers.get('Content-Disposition') || '';
        const match = disposition.match(/filename="?([^"]+)"?/);
        const filename = match ? match[1] : 'ScriptForge-downloads.zip';

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function renderItems(items) {
        const container = document.getElementById('downloadsContainer');
        const downloadAllRow = document.getElementById('downloadAllRow');
        const downloadAllHint = document.getElementById('downloadAllHint');
        const { escapeHtml } = window.ScriptForgeAuth;

        if (!items.length) {
            downloadAllRow.hidden = true;
            container.innerHTML = '<p class="empty-state">Nothing here yet — your purchased scripts will appear as soon as an order is paid, ready to download.</p>';
            return;
        }

        const withFile = items.filter((item) => item.hasFile).length;
        downloadAllRow.hidden = false;
        downloadAllHint.textContent = withFile === items.length
            ? `${items.length} script${items.length === 1 ? '' : 's'} in the bundle.`
            : `${withFile} of ${items.length} scripts have a file ready — the rest will be added automatically once they do.`;

        container.innerHTML = items.map((item) => `
      <div class="download-row">
        <div class="download-info">
          <h4>${escapeHtml(item.packName)} — ${escapeHtml(item.scriptTitle)}</h4>
          <small>
            ${item.version ? `v${escapeHtml(item.version)}` : ''}
            ${item.activated ? ' · Activated on this device' : ' · Not yet activated (activates on first download)'}
            ${item.downloadCount ? ` · Downloaded ${item.downloadCount}×` : ''}
          </small>
        </div>
        ${item.hasFile
          ? '<span class="status-badge status-success">In your zip</span>'
          : '<span class="status-badge status-pending">File coming soon</span>'}
      </div>
    `).join('');
    }

    document.addEventListener('DOMContentLoaded', async () => {
        try {
            await window.ScriptForgeAuth.refreshCsrfToken();
            const user = await window.ScriptForgeAuth.loadCurrentUser();

            if (!user) {
                document.getElementById('downloadsGate').hidden = false;
                return;
            }

            document.getElementById('downloadsContent').hidden = false;
            const { items } = await window.ScriptForgeAuth.apiFetch('/api/downloads');
            renderItems(items);

            const downloadAllBtn = document.getElementById('downloadAllBtn');
            downloadAllBtn.addEventListener('click', async () => {
                const originalText = downloadAllBtn.textContent;
                downloadAllBtn.disabled = true;
                downloadAllBtn.textContent = 'Building your zip…';
                try {
                    await downloadAll();
                    toast('Download started.', 'success');
                } catch (err) {
                    toast(err.message, 'error');
                } finally {
                    downloadAllBtn.disabled = false;
                    downloadAllBtn.textContent = originalText;
                }
            });
        } catch (err) {
            document.getElementById('downloadsGate').hidden = false;
        }
    });
})();
