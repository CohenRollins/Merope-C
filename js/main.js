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


// v0.6: deterministic, lightweight blue/white glints behind website content.
(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const positions = [[8,19],[23,44],[38,15],[56,61],[72,27],[87,55],[92,13],[13,76],[31,91],[68,84],[48,36],[82,94]];
  positions.forEach(([x,y], i) => {
    const node=document.createElement('span');
    node.className='star-glint';
    node.setAttribute('aria-hidden','true');
    node.style.left=x+'%'; node.style.top=y+'%';
    node.style.setProperty('--glint-delay', `${(i*1.19-6.3).toFixed(2)}s`);
    node.style.setProperty('--glint-duration', `${6+(i%4)*1.13}s`);
    document.body.appendChild(node);
  });
})();
