/* Merope-C Anime Hub v0.5
 * Browser-side Jikan (MyAnimeList) discovery, saved list, episode checklist,
 * official trailers and official-provider links. No media scraping or playback proxy.
 */
(() => {
  'use strict';
  const API = 'https://api.jikan.moe/v4';
  const STORE_FAVES = 'merope_anime_saved_v1';
  const STORE_WATCHED = 'merope_anime_watched_v1';
  const $ = id => document.getElementById(id);
  const grid = $('anime-grid');
  if (!grid) return;
  const searchField = $('anime-search-input');
  const dialog = $('anime-dialog');
  const GENRE_MAP = new Map([['1','Action'],['2','Adventure'],['10','Fantasy'],['24','Sci-Fi'],['37','Supernatural'],['8','Drama'],['4','Comedy']]);
  const state = {mode:'top',genre:'all',query:'',sort:'rated',page:1,items:[],more:false,loading:false,controller:null,selected:null,modalRun:0,episodePage:1,episodeMore:false,epLoading:false,trigger:null};

  // Starter picks are packaged with the site so the hub isn't empty offline.
  // These are personal recommendations, not live rankings or current airing information.
  const STARTER_ANIME = [
    [5114,'Fullmetal Alchemist: Brotherhood',2009,'TV',64,['1','2','10'],'Two brothers search for a way to undo the consequences of a failed alchemy experiment.'],
    [9253,'Steins;Gate',2011,'TV',24,['24','8'],'A group of friends stumble into time travel and have to deal with what it changes.'],
    [11061,'Hunter x Hunter',2011,'TV',148,['1','2','10'],'Gon sets out to become a Hunter and meets friends along the way.'],
    [1535,'Death Note',2006,'TV',37,['8','37'],'A student finds a notebook that gives him a terrifying power.'],
    [1,'Cowboy Bebop',1998,'TV',26,['1','24'],'A crew of bounty hunters tries to make a living while carrying the weight of their pasts.'],
    [31240,'Re:Zero',2016,'TV',25,['8','10'],'Subaru finds himself in another world with a dangerous power and few easy answers.'],
    [52991,'Frieren: Beyond Journey’s End',2023,'TV',28,['2','8','10'],'An elven mage takes a new journey long after the original adventure ended.'],
    [40748,'Jujutsu Kaisen',2020,'TV',24,['1','10','37'],'A teenager enters a world of dangerous curses and sorcerers.'],
    [38000,'Demon Slayer',2019,'TV',26,['1','10'],'Tanjiro trains to fight demons while trying to help his sister.'],
    [32182,'Mob Psycho 100',2016,'TV',12,['1','4','37'],'A powerful young psychic tries to figure out who he wants to be.'],
    [50265,'SPY x FAMILY',2022,'TV',12,['1','4'],'A spy, an assassin and a telepath try to keep up the appearance of a normal family.'],
    [21,'One Piece',1999,'TV',null,['1','2','10'],'Luffy and his crew sail the seas searching for a legendary treasure.'],
    [20583,'Haikyu!!',2014,'TV',25,['4','8'],'A high school volleyball team works to rise through tough competition.'],
    [37521,'Vinland Saga',2019,'TV',24,['1','2','8'],'A young warrior searches for meaning in a world shaped by violence.'],
    [47917,'Bocchi the Rock!',2022,'TV',12,['4'],'A shy guitarist joins a band and slowly learns to play with other people.'],
    [199,'Spirited Away',2001,'Movie',null,['2','10'],'A girl enters a mysterious spirit world and must find her way home.'],
    [32281,'Your Name',2016,'Movie',null,['8','10'],'Two teenagers form a strange connection despite living far apart.'],
    [28851,'A Silent Voice',2016,'Movie',null,['8'],'A former bully tries to make amends as he grows older.']
  ].map(([mal_id,title,year,type,episodes,genres,synopsis],i)=>({mal_id,title,year,type,episodes,
    genres:genres.map(mal_id=>({mal_id:Number(mal_id),name:GENRE_MAP.get(mal_id)||'Other'})),synopsis,
    images:{},image:'',score:null,popularity:i+1,status:'Featured pick',trailer:null,url:`https://myanimelist.net/anime/${mal_id}`,rating:'',title_japanese:'',aired:null}));
  const BACKUP_KEY = 'merope_anime_catalog_backup_v1';
  function offlineTitles(){
    const q=state.query.trim().toLocaleLowerCase();
    const raw=state.mode==='movie'?STARTER_ANIME.filter(a=>a.type==='Movie'):STARTER_ANIME;
    return raw.filter(a=>(!q||a.title.toLowerCase().includes(q))&&(state.genre==='all'||a.genres.some(g=>String(g.mal_id)===state.genre)))
      .sort((a,b)=>state.sort==='popular'?Number(a.popularity)-Number(b.popularity):a.title.localeCompare(b.title));
  }
  function showOffline(reason){
    state.items=offlineTitles();state.more=false;
    renderTiles(state.items);
    $('anime-count').textContent=state.mode==='airing'?'Featured picks (airing data offline)': 'Featured picks';
    $('anime-load-more').hidden=true;
    setFeedback((reason?reason+' ':'')+'Showing the built-in picks. Live results load when the connection works.',Boolean(reason));
    if(!state.items.length)grid.replaceChildren(paragraph('No built-in picks match. Try another title or genre.'));
  }

  const saved = readStorage(STORE_FAVES, {});
  const watched = readStorage(STORE_WATCHED, {});
  let requestQueue = Promise.resolve();
  let lastRequest = 0;
  let timer = 0;
  const responseCache = new Map();

  function readStorage(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v && typeof v === 'object' && !Array.isArray(v) ? v : fallback;
    } catch { return fallback; }
  }
  function writeStorage(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); }
    catch { setFeedback('Browser storage is unavailable. Saves may not persist.', true); }
  }
  const idOf = a => Number(a?.mal_id);
  const safeUrl = value => {
    try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; }
    catch { return ''; }
  };
  const poster = a => safeUrl(a?.images?.webp?.large_image_url || a?.images?.webp?.image_url || a?.images?.jpg?.large_image_url || a?.images?.jpg?.image_url || a?.image || '');
  const titleOf = a => a?.title_english || a?.title || 'Untitled anime';
  const typeOf = a => a?.type || 'Anime';
  function normalize(a) {
    return {mal_id:idOf(a),title:titleOf(a),title_japanese:a?.title_japanese||'',images:a?.images||{},image:poster(a),score:a?.score||null,popularity:a?.popularity||null,year:a?.year||null,type:typeOf(a),episodes:a?.episodes||null,status:a?.status||'',genres:a?.genres||[],synopsis:a?.synopsis||'',trailer:a?.trailer||null,url:a?.url||'',rating:a?.rating||'',aired:a?.aired||null};
  }
  function setFeedback(value, error=false) { const e=$('anime-feedback');e.textContent=value;e.classList.toggle('is-error',error); }
  function paragraph(message, className='anime-detail-muted') { const p=document.createElement('p');p.className=className;p.textContent=message;return p; }
  function text(tag, content, cls) {const e=document.createElement(tag);e.textContent=content??'';if(cls)e.className=cls;return e;}
  function link(url,label){ const a=document.createElement('a');a.href=url;a.textContent=label;a.target='_blank';a.rel='noopener noreferrer';return a; }
  function pill(content){return text('span', content);}
  function updateSavedCount(){$('anime-saved-count').textContent=String(Object.keys(saved).length);}
  function isSaved(id){return Boolean(saved[String(id)]);}
  function saveEntry(a){
    const id=idOf(a);if(!Number.isInteger(id)||id<=0)return;
    if (isSaved(id))delete saved[String(id)];else saved[String(id)]=normalize(a);
    writeStorage(STORE_FAVES,saved);updateSavedCount();
    if(state.mode==='saved')renderSaved();else renderTiles(state.items);
    if(state.selected && idOf(state.selected)===id)updateSaveButton();
  }

  async function apiGet(path, signal) {
    const cached=responseCache.get(path);
    if(cached && Date.now()-cached.time<10*60*1000)return cached.payload;
    const run = async () => {
      // Keep requests below the public API's published burst limit.
      const wait=Math.max(0,440-(Date.now()-lastRequest));
      if(wait)await new Promise(r=>setTimeout(r,wait));
      if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
      lastRequest=Date.now();
      const timeoutController=new AbortController();
      const timeoutID=setTimeout(()=>timeoutController.abort(),6500);
      const mergedSignal=signal&&typeof AbortSignal.any==='function'?AbortSignal.any([signal,timeoutController.signal]):(signal||timeoutController.signal);
      let response;
      try { response=await fetch(API+path,{signal:mergedSignal,headers:{'Accept':'application/json'}}); }
      catch (err) { if(timeoutController.signal.aborted && !signal?.aborted)throw new Error('Live catalog timed out.'); throw err; }
      finally { clearTimeout(timeoutID); }
      if(response.status===429){
        await new Promise(r=>setTimeout(r,1750));
        if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
        lastRequest=Date.now();
        response=await fetch(API+path,{signal,headers:{'Accept':'application/json'}});
      }
      if(!response.ok)throw new Error(response.status===429?'Anime catalog is rate-limited. Please retry shortly.':`Catalog unavailable (HTTP ${response.status}).`);
      const payload=await response.json();
      if(!payload||!Array.isArray(payload.data)&&typeof payload.data!=='object')throw new Error('Unexpected response from anime catalog.');
      responseCache.set(path,{payload,time:Date.now()});
      if(responseCache.size>60)responseCache.delete(responseCache.keys().next().value);
      return payload;
    };
    // Queue API requests across search, episode and detail panels.
    const result=requestQueue.catch(()=>{}).then(run);
    requestQueue=result.catch(()=>{});
    return result;
  }

  function listEndpoint(page){
    const q=state.query.trim(), g=state.genre;
    const filters=new URLSearchParams({page:String(page),limit:'20',sfw:'true'});
    if(q)filters.set('q',q);
    if(g!=='all')filters.set('genres',g);
    if(state.mode==='movie')filters.set('type','movie');
    if(state.mode==='airing')filters.set('status','airing');
    if(!q&&g==='all'&&state.mode==='top'){
      if(state.sort==='popular')filters.set('filter','bypopularity');
      return '/top/anime?'+filters.toString();
    }
    if(!q&&g==='all'&&state.mode==='movie'){
      const p=new URLSearchParams({type:'movie',page:String(page),limit:'20',sfw:'true'});
      if(state.sort==='popular')p.set('filter','bypopularity');
      return '/top/anime?'+p.toString();
    }
    if(!q&&g==='all'&&state.mode==='airing')return '/seasons/now?'+filters.toString();
    filters.set('order_by',state.sort==='popular'?'popularity':'score');
    filters.set('sort',state.sort==='popular'?'asc':'desc');
    return '/anime?'+filters.toString();
  }

  function setBusy(busy) {
    state.loading=busy;
    $('anime-load-more').disabled=busy;
    $('anime-search-submit').disabled=busy;
  }
  async function loadCatalog(more=false){
    if(state.mode==='saved'){renderSaved();return;}
    if(state.loading&&more)return;
    if(!more){state.controller?.abort();state.controller=new AbortController();state.page=1;state.items=[];showOffline('');}
    const controller=state.controller;
    const page=state.page;
    setBusy(true);
    setFeedback(more?'Loading more titles…':'Searching the anime universe…');
    $('anime-load-more').hidden=true;
    try{
      const data=await apiGet(listEndpoint(page),controller.signal);
      if(controller!==state.controller)return;
      const fresh=(Array.isArray(data.data)?data.data:[]).filter(a=>Number.isInteger(idOf(a))&&idOf(a)>0).map(normalize);
      const seen=new Set(state.items.map(idOf));
      state.items.push(...fresh.filter(a=>{const id=idOf(a);if(seen.has(id))return false;seen.add(id);return true;}));
      state.more=Boolean(data.pagination?.has_next_page);
      if(state.items.length){renderTiles(state.items);setFeedback(`${state.items.length} title${state.items.length===1?'':'s'} displayed · Select a cover for details`);}
      else{grid.replaceChildren(paragraph('No anime matched your filters. Try a different title or genre.'));setFeedback('No matching results');}
      $('anime-count').textContent=state.query?'Search results':(state.mode==='airing'?'Currently airing':state.mode==='movie'?'Anime movies':'Top anime');
      $('anime-load-more').hidden=!state.more;
    }catch(error){
      if(error.name!=='AbortError'&&controller===state.controller){
        const msg=error instanceof TypeError?'Live catalog is unavailable.':error.message;
        if(!state.items.length || !more)showOffline(msg);
        else setFeedback(msg+' Keeping the results already loaded.',true);
      }
    }finally{if(controller===state.controller)setBusy(false);}
  }
  function renderSaved(){
    state.controller?.abort();
    const genre=state.genre;
    const query=state.query.trim().toLocaleLowerCase();
    const all=Object.values(saved).filter(a=>a&&Number.isInteger(idOf(a)));
    const filtered=all.filter(a=>(!query||[a.title,a.title_japanese].some(s=>String(s||'').toLocaleLowerCase().includes(query)))&&(genre==='all'||(a.genres||[]).some(g=>String(g.mal_id)===genre)));
    filtered.sort((a,b)=>state.sort==='popular'?((Number(a.popularity||Infinity))-(Number(b.popularity||Infinity))):((Number(b.score||0))-(Number(a.score||0))));
    renderTiles(filtered);
    if(!filtered.length)grid.replaceChildren(paragraph('Your list is empty for this filter. Save anime from the catalog using the ＋ button.'));
    $('anime-count').textContent=`${filtered.length} saved title${filtered.length===1?'':'s'}`;
    setFeedback('Saved only in this browser · Not synced across devices');
    $('anime-load-more').hidden=true;
  }
  function renderTiles(items){
    const fragment=document.createDocumentFragment();
    for(const anime of items){
      const id=idOf(anime);
      const card=document.createElement('article');card.className='anime-tile';
      const posterBtn=document.createElement('button');posterBtn.className='anime-poster';posterBtn.type='button';posterBtn.setAttribute('aria-label',`Details for ${titleOf(anime)}`);
      const imgSrc=poster(anime);
      if(imgSrc){const img=document.createElement('img');img.src=imgSrc;img.alt=`${titleOf(anime)} poster`;img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.addEventListener('error',()=>{img.remove();posterBtn.prepend(text('span',titleOf(anime),'anime-poster-letter'));},{once:true});posterBtn.append(img);}
      else {const wrap=text('span',titleOf(anime),'anime-poster-letter');posterBtn.append(wrap);}
      if(Number(anime.score)>0)posterBtn.append(text('span',`★ ${Number(anime.score).toFixed(1)}`,'anime-score'));
      posterBtn.addEventListener('click',()=>openDetail(anime,posterBtn));
      const info=document.createElement('div');info.className='anime-tile-info';
      const titleBtn=text('button',titleOf(anime),'anime-title-btn');titleBtn.type='button';titleBtn.addEventListener('click',()=>openDetail(anime,titleBtn));
      const sub=text('div',[anime.year,anime.episodes?`${anime.episodes} eps`:null].filter(Boolean).join(' · ')||anime.status||'','anime-tile-meta');
      const bottom=document.createElement('div');bottom.className='anime-tile-bottom';
      const kind=text('span',typeOf(anime),'anime-tile-kind');
      const save=text('button',isSaved(id)?'♥':'＋','anime-save-mini');save.type='button';save.setAttribute('aria-pressed',String(isSaved(id)));save.setAttribute('aria-label',`${isSaved(id)?'Remove':'Save'} ${titleOf(anime)} ${isSaved(id)?'from':'to'} my list`);
      save.addEventListener('click',()=>saveEntry(anime));
      bottom.append(kind,save);info.append(titleBtn,sub,bottom);card.append(posterBtn,info);fragment.append(card);
    }
    grid.replaceChildren(fragment);
  }

  function setMode(mode){
    if(!['top','airing','movie','saved'].includes(mode))return;
    state.mode=mode;
    document.querySelectorAll('[data-anime-mode]').forEach(b=>{const active=b.dataset.animeMode===mode;b.classList.toggle('is-active',active);b.setAttribute('aria-pressed',String(active));});
    refresh();
  }
  function setGenre(genre){
    if(genre!=='all'&&!GENRE_MAP.has(genre))return;
    state.genre=genre;
    document.querySelectorAll('[data-anime-genre]').forEach(b=>{const active=b.dataset.animeGenre===genre;b.classList.toggle('is-active',active);b.setAttribute('aria-pressed',String(active));});
    refresh();
  }
  function refresh(){if(state.mode==='saved')renderSaved();else loadCatalog(false);}
  function setFacts(a){
    const e=$('anime-detail-facts');e.replaceChildren();
    const facts=[a.score?`★ ${a.score}`:null,a.type,a.year,a.episodes?`${a.episodes} episodes`:null,a.status,a.rating].filter(Boolean);
    const gen=(Array.isArray(a.genres)?a.genres:[]).map(g=>g.name).slice(0,3);
    [...facts,...gen].forEach(f=>e.append(pill(f)));
  }
  function updateSaveButton(){const b=$('anime-detail-save'),on=isSaved(idOf(state.selected));b.textContent=on?'♥ Saved · Remove from list':'＋ Save to my list';b.setAttribute('aria-pressed',String(on));}
  function updateEpisodeProgress(){
    const id=String(idOf(state.selected));const count=Object.values(watched[id]||{}).filter(Boolean).length;
    $('anime-episodes-progress').textContent=`${count} marked watched`;
  }
  function providerLinks(a){
    const e=$('anime-detail-streaming');e.replaceChildren();
    const title=titleOf(a);
    const crunchy='https://www.crunchyroll.com/search?q='+encodeURIComponent(title);
    e.append(link(crunchy,'Search Crunchyroll ↗'));
    e.append(link('https://www.netflix.com/search?q='+encodeURIComponent(title),'Search Netflix ↗'));
  }
  async function updateOfficialLinks(a,token){
    providerLinks(a);
    const id=idOf(a);
    try{
      const json=await apiGet(`/anime/${id}/streaming`);
      if(token!==state.modalRun)return;
      const e=$('anime-detail-streaming');const providers=Array.isArray(json.data)?json.data:[];
      for(const item of providers){
        const url=safeUrl(item?.url);
        if(url)e.prepend(link(url,`Official: ${item.name||'Streaming provider'} ↗`));
      }
    }catch{/* Search links stay available; streaming lookup is optional. */}
  }
  function addEpisodeList(list, append=false){
    const area=$('anime-detail-episodes');if(!append)area.replaceChildren();
    const id=String(idOf(state.selected));watched[id]??={};
    if(!list.length&&!append){area.append(paragraph('No episode list is currently available.'));return;}
    const nodes=document.createDocumentFragment();
    for(const ep of list){
      const num=Number(ep.mal_id);if(!Number.isInteger(num)||num<1)continue;
      const row=document.createElement('label');row.className='anime-episode';
      const box=document.createElement('input');box.type='checkbox';box.checked=Boolean(watched[id][String(num)]);box.setAttribute('aria-label',`Mark episode ${num} as watched`);
      box.addEventListener('change',()=>{if(box.checked)watched[id][String(num)]=true;else delete watched[id][String(num)];writeStorage(STORE_WATCHED,watched);updateEpisodeProgress();});
      const texts=document.createElement('span');texts.className='anime-episode-text';
      texts.append(text('strong',`${num}. ${ep.title||ep.title_japanese||'Episode '+num}`));
      if(ep.aired||ep.filler||ep.recap)texts.append(text('small',[ep.aired?new Date(ep.aired).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'',ep.filler?'Filler':'',ep.recap?'Recap':''].filter(Boolean).join(' · ')));
      row.append(box,texts);nodes.append(row);
    }
    area.append(nodes);updateEpisodeProgress();
  }
  async function loadEpisodes(page,token){
    if(state.epLoading)return;
    state.epLoading=true;const e=$('anime-detail-episodes');
    if(page===1)e.replaceChildren(paragraph('Loading episode list…'));
    $('anime-more-episodes').hidden=true;
    try{
      const data=await apiGet(`/anime/${idOf(state.selected)}/episodes?page=${page}`);
      if(token!==state.modalRun)return;
      addEpisodeList(Array.isArray(data.data)?data.data:[],page>1);
      state.episodePage=page;state.episodeMore=Boolean(data.pagination?.has_next_page);
      $('anime-more-episodes').hidden=!state.episodeMore;
    }catch(error){if(token===state.modalRun)e.append(paragraph('Episode list unavailable right now. Try reopening this title.'));}
    finally{state.epLoading=false;}
  }
  async function openDetail(original,trigger){
    const a=normalize(original);
    state.selected=a;state.trigger=trigger;
    const token=++state.modalRun;
    state.episodeMore=false;state.episodePage=1;state.epLoading=false;
    $('anime-detail-image').src=poster(a);
    $('anime-detail-image').alt=`${titleOf(a)} poster`;
    $('anime-detail-title').textContent=titleOf(a);
    $('anime-detail-alt').textContent=a.title_japanese&&a.title_japanese!==a.title?a.title_japanese:'';
    $('anime-detail-type').textContent=a.type==='Movie'?'Anime film':'Anime series';
    $('anime-detail-synopsis').textContent=a.synopsis||'Synopsis not available.';
    setFacts(a);updateSaveButton();
    const mal=safeUrl(a.url);$('anime-detail-mal').href=mal||`https://myanimelist.net/anime/${idOf(a)}`;
    const trailerId=a.trailer?.youtube_id;
    $('anime-detail-trailer').hidden=!(typeof trailerId==='string'&&/^[a-zA-Z0-9_-]{6,20}$/.test(trailerId));
    $('anime-trailer-area').replaceChildren();$('anime-trailer-area').hidden=true;
    $('anime-episodes-section').hidden=a.type==='Movie';
    $('anime-detail-episodes').replaceChildren();
    $('anime-episodes-progress').textContent='';
    providerLinks(a);
    if(!dialog.open)dialog.showModal();
    void updateOfficialLinks(a,token);
    if(a.type!=='Movie')void loadEpisodes(1,token);
    // Full metadata may have a trailer or synopsis even when list responses omit it.
    try{
      const details=await apiGet(`/anime/${idOf(a)}/full`);
      if(token!==state.modalRun||!details.data)return;
      state.selected=normalize({...a,...details.data});
      const updated=state.selected;
      $('anime-detail-synopsis').textContent=updated.synopsis||'Synopsis not available.';
      setFacts(updated);updateSaveButton();
      const detailTrailer=updated.trailer?.youtube_id;
      $('anime-detail-trailer').hidden=!(typeof detailTrailer==='string'&&/^[a-zA-Z0-9_-]{6,20}$/.test(detailTrailer));
    }catch{/* Existing catalog metadata remains usable. */}
  }
  function closeDialog(){
    state.modalRun++;
    $('anime-trailer-area').replaceChildren();
    $('anime-trailer-area').hidden=true;
    if(dialog.open)dialog.close();
    state.trigger?.focus({preventScroll:true});
    state.selected=null;
  }

  document.querySelectorAll('[data-anime-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.animeMode)));
  document.querySelectorAll('[data-anime-genre]').forEach(b=>b.addEventListener('click',()=>setGenre(b.dataset.animeGenre)));
  $('anime-order').addEventListener('change',e=>{state.sort=e.target.value==='popular'?'popular':'rated';refresh();});
  $('anime-search-form').addEventListener('submit',e=>{e.preventDefault();clearTimeout(timer);state.query=searchField.value.trim();refresh();});
  searchField.addEventListener('input',()=>{
    $('anime-clear').hidden=!searchField.value;
    clearTimeout(timer);
    timer=setTimeout(()=>{state.query=searchField.value.trim();refresh();},320);
  });
  $('anime-clear').addEventListener('click',()=>{clearTimeout(timer);searchField.value='';state.query='';$('anime-clear').hidden=true;refresh();searchField.focus();});
  $('anime-load-more').addEventListener('click',()=>{if(state.more&&!state.loading){state.page++;loadCatalog(true);}});
  $('anime-dialog-close').addEventListener('click',closeDialog);
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog();});
  dialog.addEventListener('click',e=>{if(e.target===dialog)closeDialog();});
  $('anime-detail-save').addEventListener('click',()=>{if(state.selected)saveEntry(state.selected);});
  $('anime-detail-trailer').addEventListener('click',()=>{
    const id=state.selected?.trailer?.youtube_id;
    if(!id||!/^[a-zA-Z0-9_-]{6,20}$/.test(id))return;
    const area=$('anime-trailer-area');const iframe=document.createElement('iframe');
    iframe.title=`Official trailer for ${titleOf(state.selected)}`;
    iframe.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen=true;
    iframe.referrerPolicy='strict-origin-when-cross-origin';
    iframe.src=`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1`;
    area.replaceChildren(iframe);area.hidden=false;
    area.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
  });
  $('anime-more-episodes').addEventListener('click',()=>{if(state.selected&&state.episodeMore&&!state.epLoading)loadEpisodes(state.episodePage+1,state.modalRun);});
  updateSavedCount();
  loadCatalog();
})();
