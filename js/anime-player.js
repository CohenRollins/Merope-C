/* In-site anime player. Nothing here obtains copyrighted streams or bypasses access controls.
   Playback sources come from a site config or from links entered by the viewer. */
(() => {
  'use strict';
  const KEY='merope_anime_player_links_v1';
  const PROGRESS='merope_anime_player_progress_v1';
  const byId=id=>document.getElementById(id);
  let config={titles:{}};
  let mediaBackend={}; // Source lists served from Polaris; no credentials reach the browser.
  let backendStatus={};
  let local={};let progress={};let current=null;let hls=null;
  const safe=raw=>{try{const u=new URL(raw,location.href);return (u.protocol==='https:'||u.protocol==='http:')?u.href:'';}catch{return '';}};
  const stored=key=>{try{let x=JSON.parse(localStorage.getItem(key));return x&&typeof x==='object'&&!Array.isArray(x)?x:{};}catch{return {}};};
  local=stored(KEY);progress=stored(PROGRESS);
  const remember=()=>{try{localStorage.setItem(KEY,JSON.stringify(local));}catch{}};
  const saveProgress=()=>{try{localStorage.setItem(PROGRESS,JSON.stringify(progress));}catch{}};
  const el=(tag,cls,text)=>{let e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;};
  fetch('../data/anime-sources.json',{cache:'no-store'}).then(r=>r.ok?r.json():{}).then(x=>{if(x&&typeof x.titles==='object')config=x; if(current)render();}).catch(()=>{});
  async function loadBackend(titleId){
    const id=String(titleId);
    try{
      const response=await fetch('../api/media/sources?mal_id='+encodeURIComponent(id),{cache:'no-store'});
      if(!response.ok)throw new Error('Media API returned '+response.status);
      const result=await response.json();
      mediaBackend[id]=Array.isArray(result.sources)?result.sources:[];
      backendStatus[id]='connected';
    }catch{
      mediaBackend[id]=[];
      backendStatus[id]='unavailable';
    }
    if(current && String(current.mal_id)===id)render();
  }
  function sources(){
    if(!current)return [];
    const id=String(current.mal_id);
    const raw=[...(Array.isArray(mediaBackend[id])?mediaBackend[id]:[]),...(Array.isArray(config.titles?.[id])?config.titles[id]:[]),...(Array.isArray(local[id])?local[id]:[])];
    return raw.filter(x=>x&&Number.isInteger(Number(x.season))&&Number.isInteger(Number(x.episode))&&x.episode>=0&&safe(x.url))
      .map(x=>({...x,season:Number(x.season),episode:Number(x.episode),audio:String(x.audio||'sub').toLowerCase(),type:String(x.type||'embed').toLowerCase(),label:String(x.label||'Source').slice(0,80)}));
  }
  function stop(){if(hls){try{hls.destroy();}catch{}hls=null;}}
  function play(x,frame,status){
    stop();frame.replaceChildren();const url=safe(x.url);if(!url)return;
    const kind=x.type;
    if(kind==='mp4'||kind==='webm'||kind==='hls'){
      const video=el('video','anime-real-video');video.controls=true;video.playsInline=true;video.preload='metadata';video.setAttribute('controlsList','nodownload');
      frame.append(video);let key=String(current.mal_id)+'/'+x.season+'/'+x.episode+'/'+x.audio+'/'+url;
      video.addEventListener('loadedmetadata',()=>{let t=Number(progress[key]||0);if(t>10&&t<video.duration-10)video.currentTime=t;});
      video.addEventListener('timeupdate',()=>{if(Number.isFinite(video.currentTime)&&Math.floor(video.currentTime)%5===0){progress[key]=Math.floor(video.currentTime);saveProgress();}});
      video.addEventListener('ended',()=>{progress[key]=0;saveProgress();});
      video.addEventListener('error',()=>{status.textContent='This source could not play. Check the URL and file format.';});
      if(kind==='hls'&&!video.canPlayType('application/vnd.apple.mpegurl')){
        if(window.Hls?.isSupported()){hls=new Hls();hls.loadSource(url);hls.attachMedia(video);}
        else{status.textContent='HLS requires an HLS-compatible browser or Hls.js. You can still use MP4/WebM in this browser.';video.src=url;}
      }else video.src=url;
    } else {
      const iframe=el('iframe','anime-real-frame');iframe.src=url;iframe.title=current.title+' episode '+x.episode;
      iframe.loading='lazy';iframe.allow='fullscreen; autoplay; picture-in-picture; encrypted-media';iframe.allowFullscreen=true;
      iframe.referrerPolicy='strict-origin-when-cross-origin';
      iframe.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation allow-forms');frame.append(iframe);
      status.textContent='Embedded players may require their own controls. Only link to a source you trust.';
    }
  }
  function render(){
    const root=byId('anime-detail-player');if(!root||!current)return;
    root.replaceChildren();stop();
    const items=sources();const formBox=el('div','anime-source-controls');
    const bar=el('div','anime-source-row');
    const makeSelect=(label,values)=>{
      const wrap=el('label','anime-source-label',label);const sel=el('select');
      for(const [v,txt] of values){const o=el('option','',txt);o.value=String(v);sel.append(o);}wrap.append(sel);bar.append(wrap);return sel;
    };
    let seasons=[...new Set(items.map(x=>x.season))].sort((a,b)=>a-b);
    if(!seasons.length)seasons=[1];
    const season=makeSelect('Season',seasons.map(n=>[n,'Season '+n]));
    const episode=makeSelect('Episode',[]),audio=makeSelect('Audio', [['sub','Sub'],['dub','Dub'],['original','Original']]);
    const server=makeSelect('Source',[]);
    const stage=el('div','anime-playback-stage'),status=el('p','anime-play-status','');
    function updateEpisodes(){
      episode.replaceChildren();const relevant=[...new Set(items.filter(x=>x.season===Number(season.value)).map(x=>x.episode))].sort((a,b)=>a-b);
      for(const n of relevant){let o=el('option','',current.type==='Movie'?'Movie':'Episode '+n);o.value=n;episode.append(o);}
      updateAudio();
    }
    function updateAudio(){
      const opts=[...new Set(items.filter(x=>x.season===Number(season.value)&&x.episode===Number(episode.value)).map(x=>x.audio))];
      audio.replaceChildren();for(const k of opts){let o=el('option','',k==='dub'?'Dub':k==='sub'?'Sub':k==='original'?'Original':k);o.value=k;audio.append(o);}updateServers();
    }
    function currentOptions(){return items.filter(x=>x.season===Number(season.value)&&x.episode===Number(episode.value)&&x.audio===audio.value);}
    function playSelected(){
      const opts=currentOptions();stage.replaceChildren();status.textContent='';
      const x=opts[Number(server.value)||0];if(x)play(x,stage,status);
    }
    function updateServers(){
      const opts=currentOptions();server.replaceChildren();
      for(const [i,x] of opts.entries()){let o=el('option','',x.label||('Source '+(i+1)));o.value=i;server.append(o);}
      playSelected();
    }
    season.addEventListener('change',updateEpisodes);episode.addEventListener('change',updateAudio);audio.addEventListener('change',updateServers);server.addEventListener('change',playSelected);
    const feedback=el('p','anime-source-message');
    if(items.length){updateEpisodes();formBox.append(bar,stage,status);root.append(formBox);}
    else root.append(el('p','anime-detail-muted',
      backendStatus[String(current.mal_id)]==='unavailable'
      ? 'No sources found. The Polaris media API is not connected here yet; you can still add a link below.'
      : 'No full episodes linked to this title yet. Add an MP4/WebM in your Polaris library or configure a Jellyfin item.'));
    if(backendStatus[String(current.mal_id)]==='connected' && items.length){
      root.append(el('p','anime-media-connection','Polaris media library connected'));
    }
    const details=document.createElement('details');details.className='anime-add-source';
    const summary=el('summary','', 'Add a playback link');details.append(summary);
    const help=el('p','smallprint','Choose a supported direct video (MP4, WebM, HLS) or an embeddable player URL. This saves the link in your browser only. Shared sources go in data/anime-sources.json on Polaris.');details.append(help);
    const form=el('form','anime-source-form');
    const input=(label,name,type,value)=>{const wrap=el('label','',label),inp=document.createElement('input');inp.name=name;inp.type=type;inp.required=true;inp.value=value;wrap.append(inp);form.append(wrap);return inp;};
    input('Season','season','number','1').min='0';input('Episode','episode','number',current.type==='Movie'?'0':'1').min='0';
    const linkField=input('Playback URL','url','url','');linkField.placeholder='https://your-player.example/embed/episode-1';
    const format=el('label','', 'Source type');const select=el('select');select.name='type';for(const t of ['embed','mp4','webm','hls']){let o=el('option','',t.toUpperCase());o.value=t;select.append(o);}format.append(select);form.append(format);
    const audioLabel=el('label','', 'Audio');const audioInput=el('select');audioInput.name='audio';for(const t of ['sub','dub','original']){let o=el('option','',t);o.value=t;audioInput.append(o);}audioLabel.append(audioInput);form.append(audioLabel);
    input('Source name','label','text','My source');
    const submit=el('button','button','Save source');submit.type='submit';form.append(submit,feedback);
    form.addEventListener('submit',e=>{e.preventDefault();let d=new FormData(form);let url=safe(d.get('url'));if(!url){feedback.textContent='Enter a valid HTTP or HTTPS address.';return;}
      const id=String(current.mal_id);local[id]??=[];local[id].push({season:Number(d.get('season')),episode:Number(d.get('episode')),audio:String(d.get('audio')),label:String(d.get('label')||'My source'),type:String(d.get('type')),url});remember();render();});
    details.append(form);root.append(details);
  }
  window.meropePlayer={open(a){current=a;render();void loadBackend(a.mal_id);},close(){stop();current=null;}};
})();
