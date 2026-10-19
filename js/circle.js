(() => {
  for(const card of document.querySelectorAll('.device-flip')){
    const toggle=()=>{const flip=!card.classList.contains('is-flipped');card.classList.toggle('is-flipped',flip);card.setAttribute('aria-pressed',String(flip));};
    card.addEventListener('click',toggle);
    card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}});
  }
})();
