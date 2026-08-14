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

  window.ScriptForgeToast = { show: showToast };

  let csrfToken = null;
  let currentUser = null;

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
    return currentUser;
  }

  async function getCaptcha() {
    return apiFetch('/api/auth/captcha');
  }

  async function register(username, password, captchaAnswer, email) {
    const data = await apiFetch('/api/auth/register', { method: 'POST', body: { username, password, captchaAnswer, email } });
    currentUser = data.user;
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
    return currentUser;
  }

  async function loginTotp(code) {
    const data = await apiFetch('/api/auth/login-totp', { method: 'POST', body: { code } });
    currentUser = data.user;
    csrfToken = data.csrfToken;
    return currentUser;
  }

  async function logout() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    currentUser = null;
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
      cta.href = `${prefix}pages/account.html`;
      cta.textContent = 'View Your Orders';
    } else {
      cta.href = `${prefix}pages/register.html`;
      cta.textContent = 'Create a Free Account';
    }
  }

  function renderAuthControl() {
    renderHeroCta();
    const container = document.getElementById('authControl');
    if (!container) return;
    const prefix = pathPrefix();

    if (!currentUser) {
      container.innerHTML = `<a href="${prefix}pages/login.html" class="auth-btn auth-btn-outline">Sign In</a>`;
      return;
    }

    const adminLink = currentUser.role === 'admin'
      ? `<a href="${prefix}admin/admin.html" class="nav-link">Admin</a>`
      : '';

    container.innerHTML = `
      <div class="account-menu">
        <a href="${prefix}pages/account.html" class="account-name">Hi, ${escapeHtml(currentUser.username)}</a>
        <a href="${prefix}pages/downloads.html" class="nav-link">Downloads</a>
        ${adminLink}
        <button type="button" class="auth-btn auth-btn-outline" id="logoutBtn">Log out</button>
      </div>
    `;

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        try {
          await logout();
        } catch (err) {
          if (window.ScriptForgeToast) window.ScriptForgeToast.show(err.message, 'error');
        }
      });
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

  window.ScriptForgeAuth = {
    apiFetch,
    refreshCsrfToken,
    loadCurrentUser,
    getCaptcha,
    register,
    login,
    loginTotp,
    logout,
    getCsrfToken: () => csrfToken,
    getCurrentUser: () => currentUser,
    escapeHtml
  };
})();
