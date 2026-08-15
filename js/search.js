// The site-wide navbar search box has been removed (decluttered navbar —
// see css/styles.css) in favor of a single search location: the "Search"
// filter box at the top of the Catalog page itself (#catalogSearch in
// pages/catalog.html), which already live-filters the grid and reads a
// `?q=` deep link on load (js/catalog-page.js). This file is kept as a
// harmless no-op — several pages still load it via <script src> — rather
// than removing those script tags from every page individually.
(function () {
  document.addEventListener('DOMContentLoaded', () => {});
})();
