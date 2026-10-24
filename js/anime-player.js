/* Merope-C Anime Hub v0.12.
 * A source selector for local/Jellyfin media and ordinary documented iframe embeds.
 * No third-party stream extraction, access-control bypass, or video proxying.
 * External embeds are only loaded after the visitor clicks Play.
 */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const KEY = 'merope_anime_player_links_v1';
  const PROGRESS = 'merope_anime_player_progress_v1';
  const HISTORY = 'merope_anime_recent_v1';
  const PREFS = 'merope_anime_player_selections_v2';
  const OVERRIDES = 'merope_anime_id_overrides_v1';
  const el = (tag, cls='', content) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (content !== undefined) e.textContent = String(content);
    return e;
  };
  const stored = key => {
    try { const o=JSON.parse(localStorage.getItem(key)); return o && typeof o==='object' && !Array.isArray(o) ? o : {}; }
    catch { return {}; }
  };
  const save = (key,value) => { try { localStorage.setItem(key,JSON.stringify(value)); } catch {} };
  const safe = value => {
    try { const u=new URL(value,location.href); return ['https:','http:'].includes(u.protocol) ? u.href : ''; }
    catch { return ''; }
  };
  const validId = x => /^\d{1,10}$/.test(String(x||''));
  const validImdb = x => /^tt\d{5,12}$/.test(String(x||''));
  let config={titles:{}}, local=stored(KEY), progress=stored(PROGRESS), prefs=stored(PREFS), history=stored(HISTORY);
  let overrides=stored(OVERRIDES), current=null, hls=null;
  let teardownActive=null, refreshSourceList=null;
  const backend={}, status={}, identities={};
  const AUDIO=[['sub','Sub'],['dub','Dub'],['original','Original']];

  const PROVIDERS = [
    {id:'vidlink',label:'VidLink Anime',build:m=>`https://vidlink.pro/anime/${m.mal}/${m.episode}/${m.audio==='dub'?'dub':'sub'}?fallback=true`},
    {id:'videasy',label:'Videasy',build:m=>m.id && `https://player.videasy.ws/embed/${m.movie?'movie':'tv'}/${m.id}${m.movie?'':`/${m.season}/${m.episode}`}`},
    {id:'vidsrc',label:'VidSrc',build:m=>m.id && `https://vidsrc.sh/embed/${m.movie?'movie':'tv'}/${m.id}${m.movie?'':`/${m.season}/${m.episode}`}`},
    {id:'cinesrc',label:'CineSrc',build:m=>m.tmdb && `https://cinesrc.st/embed/${m.movie?'movie':'tv'}/${m.tmdb}${m.movie?'':`?s=${m.season}&e=${m.episode}`}`},
    {id:'screenscape',label:'ScreenScape',build:m=>m.id && `https://nxsha.screenscape.me/embed?${validImdb(m.id)?'imdb':'tmdb'}=${m.id}&type=${m.movie?'movie':'tv'}${m.movie?'':`&s=${m.season}&e=${m.episode}`}`},
    {id:'embedstream',label:'Embed API Stream',build:m=>m.id && `https://watch.embed-api.stream/embed/${m.movie?'movie':'tv'}/${m.id}${m.movie?'':`/${m.season}/${m.episode}`}`},
    // Separate legacy endpoint, possibly using overlapping upstream mirrors.
    {id:'embedlegacy',label:'Embed API (legacy)',build:m=>m.tmdb && `https://player.embed-api.stream/?id=${m.tmdb}&type=${m.movie?'movie':'tv'}${m.movie?'':`&s=${m.season}&e=${m.episode}`}`}
  ];

  fetch('../data/anime-sources.json',{cache:'no-store'})
    .then(r=>r.ok?r.json():{}).then(x=>{if(x&&typeof x.titles==='object')config=x;if(current)refreshSourceList?.();}).catch(()=>{});

  async function loadBackend(id) {
    try {
      const r=await fetch('../api/media/sources?mal_id='+encodeURIComponent(id),{cache:'no-store'});
      if (!r.ok) throw new Error('Media bridge unavailable');
      const data=await r.json(); backend[id]=Array.isArray(data.sources)?data.sources:[];
      status[id]='connected';
    } catch {backend[id]=[];status[id]='unavailable';}
    if(current && String(current.mal_id)===id)refreshSourceList?.();
  }
  async function loadIdentity(id) {
    try {
      const r=await fetch('../api/media/identity?mal_id='+encodeURIComponent(id),{cache:'no-store'});
      if(!r.ok)throw new Error('Mapping unavailable');
      const data=await r.json();
      identities[id]=data&&typeof data==='object'?data:{};
    } catch {identities[id]={status:'unavailable'};}
    if(current && String(current.mal_id)===id)refreshSourceList?.();
  }
  function idMapping(mal, movie) {
    const raw=identities[mal]||{}, manual=overrides[mal]||{};
    const type=movie?'movie':'tv';
    const picked=manual[type]||raw.tmdb?.[type];
    const tmdb=validId(picked)?String(picked):'';
    const imdb=validImdb(manual.imdb)?manual.imdb:(validImdb(raw.imdb_id)?raw.imdb_id:'');
    return {tmdb,id:tmdb||imdb,imdb};
  }
  function mediaItems(mal) {
    const list=[...(backend[mal]||[]),...(Array.isArray(config.titles?.[mal])?config.titles[mal]:[]),...(local[mal]||[])];
    return list.filter(x=>x && Number.isInteger(Number(x.season)) && Number.isInteger(Number(x.episode)) && Number(x.episode)>=0 && safe(x.url))
      .map(x=>({...x,season:Number(x.season),episode:Number(x.episode),audio:String(x.audio||'sub').toLowerCase(),type:String(x.type||'embed').toLowerCase(),label:String(x.label||'Library source').slice(0,80)}));
  }
  function stop() {
    if(teardownActive){teardownActive();teardownActive=null;}
    if(hls){try{hls.destroy();}catch{}hls=null;}
  }
  function play(x, frame, note) {
    stop();frame.replaceChildren();note.textContent='';
    const url=safe(x.url);if(!url){note.textContent='No usable URL for this source.';return;}
    if(['mp4','webm','hls'].includes(x.type)) {
      const video=el('video','anime-real-video');video.controls=true;video.playsInline=true;video.preload='metadata';
      frame.append(video);
      const tools=el('div','anime-native-tools');
      const rewind=el('button','','−10 seconds'),forward=el('button','', '+10 seconds');
      const speed=el('select');speed.setAttribute('aria-label','Playback speed');
      for(const rate of [0.75,1,1.25,1.5,2]){const opt=el('option','',rate+'×');opt.value=String(rate);speed.append(opt);}
      rewind.type=forward.type='button';
      rewind.addEventListener('click',()=>{video.currentTime=Math.max(0,video.currentTime-10);});
      forward.addEventListener('click',()=>{video.currentTime=Math.min(Number.isFinite(video.duration)?video.duration:video.currentTime+10,video.currentTime+10);});
      speed.addEventListener('change',()=>{video.playbackRate=Number(speed.value)||1;});
      const captionLabel=el('label','anime-caption-label','Subtitles (WebVTT)');
      const captionInput=el('input');captionInput.type='file';captionInput.accept='.vtt,text/vtt';
      const clearCaption=el('button','','Remove subtitles');clearCaption.type='button';
      let captionUrl='';
      const removeCaption=()=>{
        video.querySelectorAll('track[data-personal-caption]').forEach(t=>t.remove());
        if(captionUrl){URL.revokeObjectURL(captionUrl);captionUrl='';}
        clearCaption.hidden=true;
      };
      clearCaption.hidden=true;clearCaption.addEventListener('click',()=>{removeCaption();captionInput.value='';});
      captionInput.addEventListener('change',()=>{
        removeCaption();
        const file=captionInput.files?.[0];
        if(!file)return;
        if(file.size>2*1024*1024||!/\.vtt$/i.test(file.name)){note.textContent='Use a .vtt subtitle file smaller than 2 MB.';return;}
        captionUrl=URL.createObjectURL(file);
        const track=el('track');track.kind='subtitles';track.label='Uploaded subtitles';track.srclang='en';track.default=true;track.src=captionUrl;track.dataset.personalCaption='true';video.append(track);
        track.addEventListener('load',()=>{track.track.mode='showing';},{once:true});
        clearCaption.hidden=false;note.textContent='Subtitles loaded from this device.';
      });
      captionLabel.append(captionInput);
      tools.append(rewind,forward,speed,captionLabel,clearCaption);
      frame.after(tools);
      teardownActive=()=>{video.pause();removeCaption();tools.remove();};
      const key=String(current.mal_id)+'/'+x.season+'/'+x.episode+'/'+x.audio+'/'+url;
      video.addEventListener('loadedmetadata',()=>{const t=Number(progress[key]||0);if(t>10&&t<video.duration-10)video.currentTime=t;});
      video.addEventListener('timeupdate',()=>{
        if(Number.isFinite(video.currentTime) && video.currentTime>=5 && Date.now()-(video._lastSave||0)>5000){
          video._lastSave=Date.now();
          progress[key]=Math.floor(video.currentTime);save(PROGRESS,progress);
          history[String(current.mal_id)]={mal_id:Number(current.mal_id),title:String(current.title||'Anime'),type:String(current.type||'TV'),season:x.season,episode:x.episode,audio:x.audio,seconds:Math.floor(video.currentTime),duration:Number.isFinite(video.duration)?Math.floor(video.duration):0,updatedAt:Date.now()};
          save(HISTORY,history);
          window.dispatchEvent(new Event('merope:watch-progress'));
        }
      });
      video.addEventListener('ended',()=>{progress[key]=0;save(PROGRESS,progress);delete history[String(current.mal_id)];save(HISTORY,history);window.dispatchEvent(new Event('merope:watch-progress'));});
      video.addEventListener('waiting',()=>{note.textContent='Buffering video…';});
      video.addEventListener('playing',()=>{note.textContent='Playing configured video.';});
      video.addEventListener('stalled',()=>{note.textContent='Playback has stalled. Check your connection or try another authorized source.';});
      video.addEventListener('error',()=>{note.textContent='Video could not be decoded or downloaded. Check the media URL and format.';});
      if(x.type==='hls'&&!video.canPlayType('application/vnd.apple.mpegurl')){
        if(window.Hls?.isSupported()){hls=new Hls();hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal){note.textContent='HLS playback failed: '+(data.details||'stream unavailable')+'.';try{hls.destroy();}catch{}hls=null;}});hls.loadSource(url);hls.attachMedia(video);}
        else note.textContent='HLS support is unavailable in this browser. Try a different source.';
      }else video.src=url;
      return;
    }
    const iframe=el('iframe','anime-real-frame');iframe.src=url;
    iframe.title=String(current.title||'Anime')+' player';iframe.loading='eager';
    iframe.allow='autoplay; fullscreen; picture-in-picture; encrypted-media';iframe.allowFullscreen=true;
    iframe.referrerPolicy='strict-origin-when-cross-origin';
    iframe.sandbox='allow-scripts allow-same-origin allow-presentation allow-forms';
    frame.append(iframe);
    note.textContent='Third-party player loaded. If it stays blank, try another source. Some players block embedding.';
    const ext=el('a','anime-external-link','Open source directly ↗');ext.href=url;ext.target='_blank';ext.rel='noopener noreferrer';note.append(' ',ext);
  }
  function optionsFor(mal,movie,season,episode,audio) {
    const result=[];
    for(const item of mediaItems(mal)) {
      if(item.season!==season||item.episode!==episode||item.audio!==audio)continue;
      result.push({...item,key:'library:'+item.label+':'+item.url,available:true});
    }
    const identity=idMapping(mal,movie);
    const args={...identity,mal,movie,season,episode:movie?1:episode,audio};
    for(const provider of PROVIDERS){
      const url=provider.build(args)||'';
      result.push({key:'remote:'+provider.id,label:provider.label+(url?'':' · ID needed'),url,type:'embed',season,episode,audio,available:Boolean(url),remote:true});
    }
    return result;
  }
  function render() {
    const root=byId('anime-detail-player');if(!root||!current)return;
    stop();refreshSourceList=null;root.replaceChildren();
    const mal=String(current.mal_id),movie=current.type==='Movie',files=mediaItems(mal);
    const defaults=prefs[mal]||{};
    const startSeason=Number.isInteger(defaults.season)?defaults.season:movie?0:1;
    const startEpisode=Number.isInteger(defaults.episode)?defaults.episode:movie?0:1;
    const wrap=el('div','anime-source-controls'),bar=el('div','anime-source-row');
    const makeNumber=(label,num,min,max)=>{
      const w=el('label','anime-source-label',label),i=el('input','anime-number-field');i.type='number';i.min=String(min);i.max=String(max);i.step='1';i.value=String(Math.min(max,Math.max(min,num)));w.append(i);bar.append(w);return i;
    };
    const makeSelect=(label,values)=>{
      const w=el('label','anime-source-label',label),s=el('select');for(const [value,name] of values){const o=el('option','',name);o.value=value;s.append(o);}w.append(s);bar.append(w);return s;
    };
    const season=makeNumber('Season (TV numbering)',startSeason,movie?0:1,99),
      episode=makeNumber(movie?'Movie':'Episode',startEpisode,movie?0:1,9999);
    if(movie){season.closest('label').hidden=true;episode.closest('label').hidden=true;}
    const audio=makeSelect('Audio preference',AUDIO);
    if(['sub','dub','original'].includes(defaults.audio))audio.value=defaults.audio;
    const server=makeSelect('Video source',[]);
    const frame=el('div','anime-playback-stage'),note=el('p','anime-play-status');
    const action=el('button','button anime-load-embed','▶ Load selected player');action.type='button';
    const message=el('p','anime-source-hint');
    const controls=el('div','anime-load-actions');controls.append(action);
    const playback=el('div','anime-player-options');playback.append(frame,controls,note,message);
    wrap.append(bar,playback);root.append(wrap);
    let active=[];
    const persist=(key)=>{prefs[mal]={season:Number(season.value),episode:Number(episode.value),audio:audio.value,provider:key||''};save(PREFS,prefs);};
    const resetFrame=()=>{stop();frame.parentElement?.querySelectorAll('.anime-native-tools').forEach(n=>n.remove());frame.replaceChildren(el('div','anime-embed-placeholder','Choose a source, then click Load selected player.'));note.textContent='';};
    function populate(keepPrevious=true,resetPlayback=true){
      const old=keepPrevious?server.value:'';
      const s=Number(season.value),e=Number(episode.value);
      active=optionsFor(mal,movie,s,e,audio.value);
      server.replaceChildren();
      for(const item of active){const opt=el('option','',item.label);opt.value=item.key;opt.disabled=!item.available;server.append(opt);}
      const previous=old||defaults.provider;
      const chosen=active.find(x=>x.key===previous&&x.available);
      const first=active.find(x=>x.available);
      if(chosen)server.value=chosen.key;
      else if(first)server.value=first.key;
      const selected=active.find(x=>x.key===server.value&&x.available);
      action.disabled=!selected;
      if(resetPlayback)resetFrame();
      const extCount=active.filter(x=>x.remote&&x.available).length;
      const isMap=identities[mal] && identities[mal].status==='ok';
      message.textContent=`${extCount} external player option${extCount===1?'':'s'} configured. Availability has not been verified. `+
        (extCount<PROVIDERS.length?(isMap?'Some services need a different title ID.':'TMDB mapping unavailable or still loading. VidLink uses the MAL ID directly.'):'')+
        (movie?'':' TV providers may number anime seasons differently.');
      if(status[mal]==='connected')message.textContent+= (backend[mal]?.length ? ' Polaris media bridge returned source entries; playback is not yet verified.' : ' Polaris media bridge responded but has no matched video sources.');
      if(status[mal]==='unavailable')message.textContent+=' Polaris media bridge is unavailable.';
    }
    for(const control of [season,episode,audio])control.addEventListener('change',()=>{populate(false);persist(server.value);});
    server.addEventListener('change',()=>{persist(server.value);resetFrame();});
    action.addEventListener('click',()=>{
      const selected=active.find(x=>x.key===server.value&&x.available);if(!selected)return;
      persist(selected.key);play(selected,frame,note);
    });
    refreshSourceList=()=>populate(true,false);
    populate(true);
    const nav=el('div','anime-episode-nav');
    const prev=el('button','button alt','← Previous'),next=el('button','button alt','Next episode →');
    prev.type=next.type='button';
    if(!movie){
      prev.addEventListener('click',()=>{if(Number(episode.value)>1){episode.value=String(Number(episode.value)-1);episode.dispatchEvent(new Event('change'));}});
      next.addEventListener('click',()=>{episode.value=String(Number(episode.value)+1);episode.dispatchEvent(new Event('change'));});
      nav.append(prev,next);root.append(nav);
    }
    const identity=el('details','anime-id-details');
    const title=el('summary','','Wrong anime or missing players? Edit title IDs');identity.append(title);
    identity.append(el('p','smallprint','TMDB mappings are looked up automatically, but MAL and TMDB season numbering can differ. An override here is saved only in this browser.'));
    const override=el('form','anime-id-form');
    const fields=[['tv','TMDB TV ID'],['movie','TMDB Movie ID'],['imdb','IMDb ID (tt...)']];
    const ids=idMapping(mal,movie),original=identities[mal]?.tmdb||{};
    const valueFor=k=>overrides[mal]?.[k]|| (k==='imdb' ? (ids.imdb||'') : original[k]||'');
    for(const [k,label] of fields){const w=el('label','',label),input=el('input');input.name=k;input.value=String(valueFor(k));input.placeholder=k==='imdb'?'tt1234567':'12345';w.append(input);override.append(w);}
    const set=el('button','button alt','Save ID matching');set.type='submit';override.append(set);
    override.addEventListener('submit',ev=>{
      ev.preventDefault();const data=new FormData(override),tv=String(data.get('tv')||'').trim(),film=String(data.get('movie')||'').trim(),imdb=String(data.get('imdb')||'').trim();
      if((tv&&!validId(tv))||(film&&!validId(film))||(imdb&&!validImdb(imdb)))return;
      overrides[mal]={tv,movie:film,imdb};save(OVERRIDES,overrides);render();
    });identity.append(override);root.append(identity);
    const details=el('details','anime-add-source');details.append(el('summary','','Add a personal playback link'));
    details.append(el('p','smallprint','Save a direct MP4/WebM/HLS file URL or a supported embed for this browser only.'));const form=el('form','anime-source-form');
    function addField(label,name,type,value){const w=el('label','',label),input=el('input');input.name=name;input.type=type;input.required=true;input.value=value;w.append(input);form.append(w);return input;}
    const numSeason=addField('Season','season','number',movie?'0':String(season.value));numSeason.min='0';
    const numEpisode=addField('Episode','episode','number',movie?'0':String(episode.value));numEpisode.min='0';
    addField('Playback URL','url','url','').placeholder='https://example.com/video.mp4';
    const typeWrap=el('label','','Source type'),typeSelect=el('select');typeSelect.name='type';for(const k of ['embed','mp4','webm','hls']){const o=el('option','',k.toUpperCase());o.value=k;typeSelect.append(o);}typeWrap.append(typeSelect);form.append(typeWrap);
    const audioWrap=el('label','','Audio'),audioSelect=el('select');audioSelect.name='audio';for(const [v,n] of AUDIO){const o=el('option','',n);o.value=v;audioSelect.append(o);}audioWrap.append(audioSelect);form.append(audioWrap);
    addField('Source name','label','text','My source');
    const submit=el('button','button','Save source');submit.type='submit';form.append(submit);
    form.addEventListener('submit',ev=>{ev.preventDefault();const d=new FormData(form),url=safe(d.get('url'));if(!url)return;
      local[mal]??=[];local[mal].push({season:Number(d.get('season')),episode:Number(d.get('episode')),audio:String(d.get('audio')),label:String(d.get('label')||'Personal'),type:String(d.get('type')),url});save(KEY,local);render();});
    details.append(form);root.append(details);
  }
  window.meropePlayer = {
    open(anime){if(!anime||!validId(anime.mal_id))return;current=anime;render();
      const mal=String(anime.mal_id);void loadBackend(mal);void loadIdentity(mal);},
    close(){stop();refreshSourceList=null;current=null;}
  };
})();
