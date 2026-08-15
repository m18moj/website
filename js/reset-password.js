(function () {
  document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const resetPanel = document.getElementById('resetPanel');
    const invalidPanel = document.getElementById('invalidPanel');

    if (!token) {
      resetPanel.hidden = true;
      invalidPanel.hidden = false;
      return;
    }

    await window.ScripForgeAuth.refreshCsrfToken();

    const form = document.getElementById('resetForm');
    const errorBox = document.getElementById('formError');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorBox.hidden = true;

      const newPassword = document.getElementById('newPassword').value;

      try {
        await window.ScripForgeAuth.apiFetch('/api/auth/reset-password', {
          method: 'POST',
          body: { token, newPassword }
        });
        if (window.ScripForgeToast) window.ScripForgeToast.show('Password updated — sign in with your new password.', 'success');
        window.location.href = 'login';
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
      }
    });
  });
})();
