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

  function bindLogout(id) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', async () => {
      try {
        await logout();
      } catch (err) {
        if (window.ScripForgeToast) window.ScripForgeToast.show(err.message, 'error');
      }
    });
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
        <button type="button" class="nav-link nav-link-button" id="logoutBtnMobile">Log out</button>
      `;
      navMenu.appendChild(mobileSection);
      bindLogout('logoutBtnMobile');
      bindExitImpersonation('exitImpersonateBtnMobile');
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await refreshCsrfToken();
      await loadCurrentUser();
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
