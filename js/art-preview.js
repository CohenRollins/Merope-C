/* Random featured art slideshow; only the public, published catalog. */
(() => {
 'use strict';
 const image=document.getElementById('art-preview-image');
 if(!image)return;
 const caption=document.getElementById('art-preview-caption');
 const counter=document.getElementById('art-preview-counter');
 const prev=document.getElementById('art-preview-prev');
 const next=document.getElementById('art-preview-next');
 const area=document.getElementById('art-preview');
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 let items=[], index=0, ticker=null, busy=false, startX=null;
 const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
 function update(){
   if(!items.length || busy)return;
   busy=true;
   const a=items[index];
   const img=new Image();
   img.onload=()=>{
     image.classList.add('art-preview-changing');
     window.setTimeout(()=>{
       image.src=a.src;
       image.alt=a.description||a.title||'Featured artwork';
       caption.textContent=a.title||'From the art archive';
       counter.textContent=(index+1)+' / '+items.length;
       image.classList.remove('art-preview-changing');
       busy=false;
     },reduced?0:280);
   };
   img.onerror=()=>{busy=false;index=(index+1)%items.length;};
   img.src=a.src;
 }
 function navigate(direction=1){
   if(!items.length)return;
   index=(index+direction+items.length)%items.length;
   update();
 }
 function play(){
   clearInterval(ticker);
   if(items.length>1&&!reduced)ticker=setInterval(()=>{
     if(!document.hidden && !area.matches(':hover') && !area.matches(':focus-within'))navigate(1);
   },6500);
 }
 async function load(){
   let data=null;
   try{const r=await fetch('/api/gallery',{cache:'no-store'});if(r.ok)data=await r.json();}catch{}
   if(!Array.isArray(data)){
     try{const r=await fetch('../data/gallery.json',{cache:'no-store'});if(r.ok)data=await r.json();}catch{}
   }
   if(!Array.isArray(data))return;
   const entries=shuffle(data.filter(x=>x && x.published!==false && typeof x.src==='string' && (x.src.startsWith('/')||x.src.startsWith('../assets/')||x.src.startsWith('https://'))));
   if(!entries.length)return;
   items=entries;index=0;update();play();
 }
 prev.addEventListener('click',()=>{navigate(-1);play();});
 next.addEventListener('click',()=>{navigate(1);play();});
 area.addEventListener('touchstart',e=>{startX=e.touches[0]?.clientX??null;},{passive:true});
 area.addEventListener('touchend',e=>{
   if(startX==null)return;
   const x=e.changedTouches[0]?.clientX;
   if(x!=null&&Math.abs(x-startX)>45){navigate(x<startX?1:-1);play();}
   startX=null;
 },{passive:true});
 load();
})();
