(function () {
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('forgotForm');
    const errorBox = document.getElementById('formError');
    const successBox = document.getElementById('formSuccess');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorBox.hidden = true;
      successBox.hidden = true;

      const username = document.getElementById('username').value.trim();

      try {
        await window.ScriptForgeAuth.refreshCsrfToken();
        const data = await window.ScriptForgeAuth.apiFetch('/api/auth/forgot-password', {
          method: 'POST',
          body: { username }
        });
        successBox.textContent = data.message;
        successBox.hidden = false;
        form.reset();
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
      }
    });
  });
})();
