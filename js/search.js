(function () {
  function render() {
    const navActions = document.querySelector('.nav-actions');
    if (!navActions || document.getElementById('navSearchForm')) return;

    const form = document.createElement('form');
    form.id = 'navSearchForm';
    form.className = 'nav-search';
    form.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.35-4.35"></path></svg>
      <input type="search" id="navSearchInput" placeholder="Search packs…" aria-label="Search packs">
    `;
    navActions.insertBefore(form, navActions.firstChild);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const query = document.getElementById('navSearchInput').value.trim();
      const rootPrefix = document.body.dataset.rootPrefix || '';
      const target = `${rootPrefix}pages/catalog.html${query ? `?q=${encodeURIComponent(query)}` : ''}`;
      window.location.href = target;
    });
  }

  document.addEventListener('DOMContentLoaded', render);
})();
