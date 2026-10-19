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


// Parallax starfield: tiny scroll-driven background offsets (no animation loop).
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  let frame = 0;
  function updateStars() {
    frame = 0;
    const y = reduceMotion.matches ? 0 : window.scrollY;
    root.style.setProperty('--stars-far', `${Math.round(y * -0.035)}px`);
    root.style.setProperty('--stars-near', `${Math.round(y * -0.095)}px`);
  }
  function onScroll() {
    if (!frame) frame = window.requestAnimationFrame(updateStars);
  }
  window.addEventListener('scroll', onScroll, {passive:true});
  if (typeof reduceMotion.addEventListener === 'function') reduceMotion.addEventListener('change', updateStars);
  updateStars();
})();
