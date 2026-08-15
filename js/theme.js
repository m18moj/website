(function () {
  const STORAGE_KEY = 'scripforge_theme';

  function getTheme() {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  }

  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function setTheme(theme) {
    localStorage.setItem(STORAGE_KEY, theme);
    applyTheme(theme);
    renderToggle();
  }

  function renderToggle() {
    let button = document.getElementById('themeToggle');
    if (!button) {
      const navActions = document.querySelector('.nav-actions');
      if (!navActions) return;
      button = document.createElement('button');
      button.type = 'button';
      button.id = 'themeToggle';
      button.className = 'theme-toggle';
      button.setAttribute('aria-label', 'Toggle light/dark theme');
      navActions.insertBefore(button, navActions.firstChild);
      button.addEventListener('click', () => setTheme(getTheme() === 'light' ? 'dark' : 'light'));
    }

    const theme = getTheme();
    button.innerHTML = theme === 'light'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
  }

  // Applied as early as possible (before DOMContentLoaded) so the page never
  // flashes the wrong theme on load.
  applyTheme(getTheme());

  document.addEventListener('DOMContentLoaded', renderToggle);

  window.ScripForgeTheme = { getTheme, setTheme };
})();
