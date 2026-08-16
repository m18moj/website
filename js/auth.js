(function () {
  function getToastContainer() {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }
    return container;
  }

  function showToast(message, type = 'success') {
    const container = getToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // Force layout so the enter animation actually plays instead of the
    // toast appearing already in its final state.
    requestAnimationFrame(() => toast.classList.add('toast-visible'));

    setTimeout(() => {
      toast.classList.remove('toast-visible');
      toast.classList.add('toast-leaving');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 3200);
  }

  window.ScripForgeToast = { show: showToast };

  let csrfToken = null;
  let currentUser = null;
  let impersonating = null;
  let discordStatus = { checked: false, configured: false, linked: false };

  const DISCORD_ICON_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.061 0a.073.073 0 0 1 .078.01c.12.099.246.197.373.291a.077.077 0 0 1-.006.128c-.598.35-1.22.645-1.873.892a.076.076 0 0 0-.04.106c.36.698.772 1.362 1.225 1.994a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.057c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028z"/></svg>';

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function apiFetch(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = Object.assign({}, options.headers);
    let body = options.body;

    if (body && typeof body !== 'string') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }

    if (method !== 'GET' && method !== 'HEAD' && csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    const response = await fetch(path, {
      method,
      headers,
      body,
      credentials: 'same-origin'
    });

    let data = null;
    try {
      data = await response.json();
    } catch (err) {
      data = null;
    }

    if (!response.ok) {
      const message = (data && data.error) || `Request failed (${response.status}).`;
      throw new Error(message);
    }

    return data;
  }

  // Coalesced so concurrent callers (auth.js's own startup call plus a
  // page-specific script like login.js, both firing on DOMContentLoaded)
  // share one in-flight request instead of racing two separate ones — two
  // simultaneous requests with no session cookie yet would each get a
  // brand-new session from the server, and whichever Set-Cookie the browser
  // applies last "wins", silently orphaning anything (like a CAPTCHA answer)
  // stored against the other one.
  let csrfRefreshPromise = null;
  function refreshCsrfToken() {
    if (csrfRefreshPromise) return csrfRefreshPromise;
    csrfRefreshPromise = apiFetch('/api/auth/csrf-token')
      .then((data) => {
        csrfToken = data.csrfToken;
        return csrfToken;
      })
      .finally(() => {
        csrfRefreshPromise = null;
      });
    return csrfRefreshPromise;
  }

  async function loadCurrentUser() {
    const data = await apiFetch('/api/auth/me');
    currentUser = data.user;
    impersonating = data.impersonating || null;
    return currentUser;
  }

  // Drives the navbar's "Connect Discord" affordance (see renderAuthControl)
  // — signed-in users who haven't linked a Discord account yet get a
  // brand-colored CTA in place of nothing; everyone else (signed out,
  // already linked, or linking not configured on this server) gets no
  // button at all. Swallows failures into "unchecked" so a network hiccup
  // just hides the button rather than showing a broken one.
  async function refreshDiscordStatus() {
    if (!currentUser) {
      discordStatus = { checked: false, configured: false, linked: false };
      return;
    }
    try {
      const data = await apiFetch('/api/discord/status');
      discordStatus = { checked: true, configured: Boolean(data.configured), linked: Boolean(data.linked) };
    } catch (err) {
      discordStatus = { checked: false, configured: false, linked: false };
    }
  }

  // Ends an admin's "view as" session (see js/admin.js's per-user Impersonate
  // button) and restores their own identity — the CSRF token stays valid
  // across the switch since it's tied to the session, not to which user id
  // the session currently represents.
  async function stopImpersonating() {
    const data = await apiFetch('/api/auth/stop-impersonating', { method: 'POST' });
    currentUser = data.user;
    impersonating = null;
    return currentUser;
  }

  async function getCaptcha() {
    return apiFetch('/api/auth/captcha');
  }

  async function register(username, nickname, password, captchaAnswer, email) {
    const data = await apiFetch('/api/auth/register', { method: 'POST', body: { username, nickname, password, captchaAnswer, email } });
    currentUser = data.user;
    impersonating = null;
    csrfToken = data.csrfToken;
    return currentUser;
  }

  // Returns { requiresTotp: true } instead of a user when the account has
  // 2FA enabled (admin accounts only) — the caller must then call
  // loginTotp() with a code before the session is actually authenticated.
  async function login(username, password, captchaAnswer) {
    const data = await apiFetch('/api/auth/login', { method: 'POST', body: { username, password, captchaAnswer } });
    csrfToken = data.csrfToken;
    if (data.requiresTotp) return { requiresTotp: true };
    currentUser = data.user;
    impersonating = null;
    return currentUser;
  }

  async function loginTotp(code) {
    const data = await apiFetch('/api/auth/login-totp', { method: 'POST', body: { code } });
    currentUser = data.user;
    impersonating = null;
    csrfToken = data.csrfToken;
    return currentUser;
  }

  async function logout() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    currentUser = null;
    impersonating = null;
    await refreshCsrfToken();
    renderAuthControl();
  }

  function pathPrefix() {
    return document.body.dataset.rootPrefix || '';
  }

  // The homepage hero's secondary CTA doubles as an account funnel: it
  // points new visitors to registration, and once signed in becomes a
  // shortcut to order history instead of repeating a link already in the nav.
  function renderHeroCta() {
    const cta = document.getElementById('heroSecondaryCta');
    if (!cta) return;
    const prefix = pathPrefix();

    if (currentUser) {
      cta.href = `${prefix}pages/account`;
      cta.textContent = 'View Your Orders';
    } else {
      cta.href = `${prefix}pages/register`;
      cta.textContent = 'Create a Free Account';
    }
  }

  function bindExitImpersonation(id) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await stopImpersonating();
        window.location.reload();
      } catch (err) {
        btn.disabled = false;
        if (window.ScripForgeToast) window.ScripForgeToast.show(err.message, 'error');
      }
    });
  }

  function renderAuthControl() {
    renderHeroCta();
    const container = document.getElementById('authControl');
    const navbar = document.getElementById('navbar');
    if (navbar) navbar.classList.toggle('navbar-impersonating', Boolean(impersonating));
    if (!container) return;
    const prefix = pathPrefix();
    const navMenu = document.getElementById('navMenu');
    const existingMobileSection = navMenu ? navMenu.querySelector('.nav-menu-account') : null;
    if (existingMobileSection) existingMobileSection.remove();

    if (!currentUser) {
      container.innerHTML = `<a href="${prefix}pages/login" class="auth-btn auth-btn-outline">Sign In</a>`;
      return;
    }

    // Shown instead of the "Admin" link while an admin is impersonating
    // (currentUser.role is the *impersonated* account's role at that point,
    // so adminLink below is already correctly empty) — always visible in the
    // sticky nav, not just on the page where "View as" was clicked, so an
    // admin can never lose track of which identity they're browsing as.
    const impersonationNotice = impersonating
      ? `
        <span class="impersonation-pill" title="Viewing the site as ${escapeHtml(impersonating.asUsername)}">
          Viewing as ${escapeHtml(impersonating.asUsername)}
        </span>
        <button type="button" class="auth-btn auth-btn-outline impersonation-exit-btn" id="exitImpersonateBtn">Exit</button>
      `
      : '';

    const adminLink = currentUser.role === 'admin'
      ? `<a href="${prefix}admin/admin" class="nav-link admin-link">Admin</a>`
      : '';

    const discordConnectBtn = (discordStatus.checked && discordStatus.configured && !discordStatus.linked)
      ? `<a href="/api/discord/start" class="btn btn-discord btn-small">${DISCORD_ICON_SVG}Connect Discord</a>`
      : '';

    // Nicknames are capped at 8 characters (server-enforced) specifically so
    // this never breaks the navbar's width the way a long username could —
    // the display name shown here is always short by construction. The
    // avatar is a plain initial-in-a-circle (no upload/avatar system exists
    // to source a real image from) — small, fixed-size, and never grows with
    // the name underneath it.
    const displayName = currentUser.nickname || currentUser.username;
    const initial = displayName.trim().charAt(0).toUpperCase() || '?';

    container.innerHTML = `
      <div class="account-menu">
        ${impersonationNotice}
        <a href="${prefix}pages/downloads" class="nav-link">Downloads</a>
        ${adminLink}
        ${discordConnectBtn}
        <a href="${prefix}pages/account" class="account-chip" title="Account settings">
          <span class="account-chip-avatar" aria-hidden="true">${escapeHtml(initial)}</span>
          <span class="account-chip-name">${escapeHtml(displayName)}</span>
        </a>
      </div>
    `;
    bindExitImpersonation('exitImpersonateBtn');

    // The account-menu above is hidden below 768px (too wide for the top
    // bar next to the cart icon and hamburger), so mirror the same links
    // into the collapsible mobile nav-menu dropdown instead.
    if (navMenu) {
      const mobileSection = document.createElement('div');
      mobileSection.className = 'nav-menu-account';
      mobileSection.innerHTML = `
        ${impersonating ? `<span class="impersonation-pill">Viewing as ${escapeHtml(impersonating.asUsername)}</span><button type="button" class="nav-link nav-link-button" id="exitImpersonateBtnMobile">Exit view-as</button>` : ''}
        <a href="${prefix}pages/account" class="nav-link account-chip-mobile">
          <span class="account-chip-avatar" aria-hidden="true">${escapeHtml(initial)}</span>
          ${escapeHtml(displayName)}
        </a>
        <a href="${prefix}pages/downloads" class="nav-link">Downloads</a>
        ${adminLink}
        ${discordConnectBtn}
      `;
      navMenu.appendChild(mobileSection);
      bindExitImpersonation('exitImpersonateBtnMobile');
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await refreshCsrfToken();
      await loadCurrentUser();
      await refreshDiscordStatus();
    } catch (err) {
      // Not signed in / server unreachable — nav just shows "Sign In".
    }
    renderAuthControl();
  });

  window.ScripForgeAuth = {
    apiFetch,
    refreshCsrfToken,
    loadCurrentUser,
    getCaptcha,
    register,
    login,
    loginTotp,
    logout,
    stopImpersonating,
    getCsrfToken: () => csrfToken,
    getCurrentUser: () => currentUser,
    getImpersonating: () => impersonating,
    escapeHtml
  };
})();
