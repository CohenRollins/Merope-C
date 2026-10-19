/* The gallery works without the admin backend; it falls back to data/gallery.json. */
(() => {
  const grid = document.getElementById('art-grid');
  if (!grid) return;
  const sort = document.getElementById('art-sort');
  const empty = document.getElementById('art-empty');
  const buttons = [...document.querySelectorAll('[data-art-filter]')];
  let items = [];
  let filter = 'all';
  const labels = { commission: 'Commission', artfight: 'ArtFight', 'my-character': 'My character', 'other-person': "Someone else’s character", sketch: 'Sketch' };
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if(cls)e.className=cls; if(text!==undefined)e.textContent=text; return e; };
  function render() {
    grid.replaceChildren();
    const visible = items.filter(x => x.published !== false && (filter === 'all' || (x.tags||[]).includes(filter)));
    visible.sort((a,b) => {
      // Sketches always last, including in oldest-first mode.
      const diff = Number((a.tags||[]).includes('sketch')) - Number((b.tags||[]).includes('sketch'));
      if(diff)return diff;
      if(sort.value==='title')return (a.title||'').localeCompare(b.title||'');
      const dateDiff = (a.file_date||'').localeCompare(b.file_date||'');
      return sort.value==='oldest'?dateDiff:-dateDiff;
    });
    for(const item of visible){
      const a=mk('a','art-card'); a.href=item.src; a.target='_blank'; a.rel='noopener noreferrer';
      const picture=mk('div','art-picture'); const img=mk('img');img.loading='lazy';img.src=item.src;img.alt=item.description||item.title||'Artwork';picture.append(img);
      const details=mk('div','details');details.append(mk('strong','',item.title||'Untitled'));
      if(item.artist)details.append(mk('p','',`Artist: ${item.artist}`));
      if(item.description)details.append(mk('p','',item.description));
      if(item.file_date)details.append(mk('p','art-meta',`${item.file_date} · ${item.date_type==='archive-modified'?'File date':'Artwork date'}`));
      const row=mk('div','meta-tags');for(const t of item.tags||[])row.append(mk('span','',labels[t]||t));details.append(row);
      a.append(picture,details);grid.append(a);
    }
    empty.hidden=visible.length>0;
  }
  buttons.forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.artFilter; buttons.forEach(v=>v.setAttribute('aria-pressed',String(v===b)));render();}));
  sort.addEventListener('change',render);
  (async()=>{
    try { const r=await fetch('/api/gallery',{cache:'no-store'}); if(!r.ok)throw Error();items=await r.json(); }
    catch { try {const r=await fetch('../data/gallery.json');if(!r.ok)throw Error();items=await r.json();}catch { empty.hidden=false;empty.textContent='Could not load the artwork list.';return;} }
    render();
  })();
})();
