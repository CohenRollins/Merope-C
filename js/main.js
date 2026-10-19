// Keep this file small and framework-free for easy web-development coursework reuse.
document.querySelectorAll('[data-filter]').forEach(button => {
  button.addEventListener('click', () => {
    const selected = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    document.querySelectorAll('[data-category]').forEach(card => {
      card.hidden = selected !== 'all' && card.dataset.category !== selected;
    });
  });
});
