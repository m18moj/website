// Tab switching for the "client" showcase pages (pages/client-*.html).
// Purely a local UI toggle between panels already present in the DOM.
(function () {
    const tabs = document.querySelectorAll('.client-tab');
    const panels = document.querySelectorAll('.client-panel');

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-tab-target');
            tabs.forEach((t) => t.classList.toggle('active', t === tab));
            panels.forEach((panel) => {
                panel.hidden = panel.id !== target;
            });
        });
    });
})();
