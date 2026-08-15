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
      // See login.js for why refreshCsrfToken() must resolve first: it
      // establishes the one session this captcha answer gets stored against.
      await window.ScripForgeAuth.refreshCsrfToken();
      const { question } = await window.ScripForgeAuth.getCaptcha();
      label.textContent = question;
      input.value = '';
    } catch (err) {
      label.textContent = 'Could not load the verification question. Refresh the page.';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('registerForm');
    const errorBox = document.getElementById('formError');
    if (!form) return;

    refreshCaptcha();

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorBox.hidden = true;

      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const captchaAnswer = document.getElementById('captchaAnswer').value.trim();
      const email = document.getElementById('email').value.trim();

      try {
        await window.ScripForgeAuth.register(username, password, captchaAnswer, email);
        window.location.href = getRedirectTarget();
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
        refreshCaptcha();
      }
    });
  });
})();
