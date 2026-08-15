// Services (Discord Bots, Websites, SMM) are sold as one plan tier plus any
// number of add-ons — not a flat multi-select list like the game packs this
// page's markup is otherwise identical to (js/site.js's generic
// .script-card/.script-choice selection). This layers tier-exclusivity on
// top of that shared mechanism without modifying it: plan cards behave like
// a radio group, add-on/hosting cards stay freely multi-select.
(function () {
  function dispatchChange(el) {
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function init() {
    const cards = Array.from(document.querySelectorAll('.script-card'));
    const planCards = cards.filter((card) => card.dataset.category === 'Plan');
    if (!planCards.length) return;

    // js/site.js defaults every script-card to selected, which would
    // otherwise stack all plan tiers together. Collapse that down to just
    // the cheapest (first) plan, with every add-on and hosting option off.
    cards.forEach((card) => {
      const checkbox = card.querySelector('.script-choice');
      if (!checkbox) return;
      const shouldBeChecked = card === planCards[0];
      if (checkbox.checked !== shouldBeChecked) {
        checkbox.checked = shouldBeChecked;
        dispatchChange(checkbox);
      }
    });

    // Picking a different plan swaps it in for whichever one was selected.
    planCards.forEach((card) => {
      const checkbox = card.querySelector('.script-choice');
      if (!checkbox) return;
      checkbox.addEventListener('change', () => {
        if (!checkbox.checked) return;
        planCards.forEach((other) => {
          if (other === card) return;
          const otherCheckbox = other.querySelector('.script-choice');
          if (otherCheckbox && otherCheckbox.checked) {
            otherCheckbox.checked = false;
            dispatchChange(otherCheckbox);
          }
        });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
