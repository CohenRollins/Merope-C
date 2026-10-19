// Merope-C: small, framework-free gallery filter.
const filterButtons = document.querySelectorAll('[data-filter]');
filterButtons.forEach(button => {
  button.addEventListener('click', () => {
    const selected = button.dataset.filter;
    filterButtons.forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    document.querySelectorAll('[data-category]').forEach(card => {
      card.hidden = selected !== 'all' && card.dataset.category !== selected;
    });
  });
});
