(function () {
  const BANNER_DISMISS_KEY = 'scripforge_banner_dismissed';
  // Pages an admin must still be able to reach even while maintenance mode
  // is on for everyone else — otherwise there'd be no way to turn it back off.
  const MAINTENANCE_ALLOWLIST = ['/pages/login.html', '/admin/admin.html'];

  let flags = null;
  const ready = fetch('/api/settings/public')
    .then((res) => res.json())
    .then((data) => { flags = data; return data; })
    .catch(() => { flags = {}; return flags; });

  function renderAnnouncementBanner() {
    const banner = flags.announcementBanner;
    if (!banner || !banner.enabled || !banner.text) return;
    if (sessionStorage.getItem(BANNER_DISMISS_KEY) === banner.text) return;

    const bar = document.createElement('div');
    bar.className = 'announcement-banner';
    bar.innerHTML = `
      <div class="container announcement-banner-inner">
        <span></span>
        <button type="button" class="announcement-banner-close" aria-label="Dismiss">&times;</button>
      </div>
    `;
    bar.querySelector('span').textContent = banner.text;
    bar.querySelector('.announcement-banner-close').addEventListener('click', () => {
      sessionStorage.setItem(BANNER_DISMISS_KEY, banner.text);
      bar.remove();
    });

    const navbar = document.getElementById('navbar');
    if (navbar) navbar.insertAdjacentElement('afterend', bar);
  }

  async function renderMaintenanceOverlay() {
    if (!flags.maintenanceMode) return;
    if (MAINTENANCE_ALLOWLIST.some((path) => window.location.pathname.endsWith(path))) return;

    const me = window.ScripForgeAuth ? await window.ScripForgeAuth.loadCurrentUser().catch(() => null) : null;
    if (me && me.role === 'admin') return;

    const overlay = document.createElement('div');
    overlay.className = 'maintenance-overlay';
    overlay.innerHTML = `
      <div class="maintenance-box">
        <div class="maintenance-icon">🛠️</div>
        <h1>Down for maintenance</h1>
        <p>ScripForge is being updated right now. Please check back in a little while.</p>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await ready;
    if (!flags) return;
    renderAnnouncementBanner();
    renderMaintenanceOverlay();
  });

  window.ScripForgeFlags = {
    ready,
    get flags() { return flags; },
    isEnabled(key) { return Boolean(flags && flags[key]); }
  };
})();
