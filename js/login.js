(function () {
  function isSafeRedirect(target) {
    if (!target) return false;
    if (target.includes('://') || target.startsWith('//') || target.includes(':')) return false;
    return /^[a-zA-Z0-9/_.-]+\.html$/.test(target);
  }

  function getRedirectTarget() {
    const params = new URLSearchParams(window.location.search);
    const target = params.get('redirect');
    return isSafeRedirect(target) ? target : 'games.html';
  }

  async function refreshCaptcha() {
    const label = document.getElementById('captchaLabel');
    const input = document.getElementById('captchaAnswer');
    try {
      // The captcha answer is stored server-side against this browser's
      // session, so the session/CSRF token must already be established
      // before asking for a question — otherwise this request and auth.js's
      // own startup csrf-token fetch could race and end up on two different
      // brand-new sessions, silently orphaning the stored answer.
      await window.ScripForgeAuth.refreshCsrfToken();
      const { question } = await window.ScripForgeAuth.getCaptcha();
      label.textContent = question;
      input.value = '';
    } catch (err) {
      label.textContent = 'Could not load the verification question. Refresh the page.';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('formError');
    const loginPanel = document.getElementById('loginPanel');
    const totpPanel = document.getElementById('totpPanel');
    const totpForm = document.getElementById('totpForm');
    const totpError = document.getElementById('totpError');
    if (!loginForm) return;

    refreshCaptcha();

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      loginError.hidden = true;

      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const captchaAnswer = document.getElementById('captchaAnswer').value.trim();

      try {
        const result = await window.ScripForgeAuth.login(username, password, captchaAnswer);
        if (result && result.requiresTotp) {
          loginPanel.hidden = true;
          totpPanel.hidden = false;
          document.getElementById('totpCode').focus();
          return;
        }
        window.location.href = getRedirectTarget();
      } catch (err) {
        loginError.textContent = err.message;
        loginError.hidden = false;
        refreshCaptcha();
      }
    });

    if (totpForm) {
      totpForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        totpError.hidden = true;

        const code = document.getElementById('totpCode').value.trim();

        try {
          await window.ScripForgeAuth.loginTotp(code);
          window.location.href = getRedirectTarget();
        } catch (err) {
          totpError.textContent = err.message;
          totpError.hidden = false;
        }
      });
    }
  });
})();
