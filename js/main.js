// Merope-C shared navigation, filters and an animated starfield.
(() => {
  'use strict';
  document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
    const selected=button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    document.querySelectorAll('[data-category]').forEach(card=>card.hidden=selected!=='all'&&card.dataset.category!==selected);
  }));


  // Three main destinations, each with an accessible hover/focus menu.
  function renderNavigation(){
    const nav=document.querySelector('.topbar .navlinks');
    if(!nav)return;
    const inCharacters=location.pathname.includes('/pages/characters/');
    const inFolder=/(?:\/pages\/|\/portfolio\/)/.test(location.pathname);
    const rel=inCharacters?'../../':inFolder?'../':'';
    const groups=[
      {label:'School / Portfolio',href:'portfolio/index.html',items:[['Portfolio','portfolio/index.html'],['LinkedIn','https://www.linkedin.com/in/cohen-rollins-572b2430b/']]},
      {label:'Personal',href:'pages/personal.html',items:[['Personal home','pages/personal.html'],['About Coco','pages/about.html'],['Art Gallery','pages/art.html'],['Clouds & Lore','pages/lore.html'],['Anime Hub','pages/anime.html'],['Streams & Socials','pages/twitch.html'],['My Circle','pages/circle.html'],['Anti-Glonk','pages/anti-glonk.html']]},
      {label:'PERC House',href:'pages/house.html',items:[['PERC House','pages/house.html'],['House rules','pages/house.html#rules'],['House information & code','pages/house-access.html'],['House photo albums','pages/house-access.html#photos'],['PERC Bot','pages/perc.html']]}
    ];
    const at=location.pathname;
    nav.replaceChildren();
    for(const group of groups){
      const wrapper=document.createElement('div');wrapper.className='nav-group';
      const anchor=document.createElement('a');anchor.href=rel+group.href;
      anchor.className='nav-main-link';anchor.textContent=group.label;
      const arrow=document.createElement('span');arrow.className='nav-caret';arrow.setAttribute('aria-hidden','true');arrow.textContent='⌄';anchor.append(arrow);
      const active=group.label==='School / Portfolio'?at.includes('/portfolio/'):
          group.label==='PERC House'?/(?:\/house(?:-access)?\.html|\/perc\.html)/.test(at):
          /(\/personal\.html|\/about\.html|\/art\.html|\/lore\.html|\/anime\.html|\/twitch\.html|\/circle\.html|\/anti-glonk\.html|\/characters\/)/.test(at);
      if(active)anchor.setAttribute('aria-current','page');
      const menu=document.createElement('div');menu.className='nav-dropdown';menu.setAttribute('aria-label',group.label+' pages');
      for(const [name,href] of group.items){
        const item=document.createElement('a');const remote=href.startsWith('https://');
        item.href=remote?href:rel+href;item.textContent=name;
        if(remote){item.target='_blank';item.rel='noopener noreferrer';}
        menu.append(item);
      }
      wrapper.append(anchor,menu);nav.append(wrapper);
    }
  }
  renderNavigation();

  // Twinkling diamonds: blue at minimum, luminous white with a soft halo at peak.
  const canvas=document.createElement('canvas');
  canvas.className='merope-stars';
  canvas.setAttribute('aria-hidden','true');
  document.body.prepend(canvas);
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let width=0,height=0,ratio=1,frame=0,scroll=window.scrollY||0,stars=[];
  const mobile=window.matchMedia('(max-width: 700px)');
  function resize(){
    width=window.innerWidth;height=window.innerHeight;
    ratio=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);
    const count=mobile.matches?Math.min(62,Math.max(30,Math.round(width*height/23000))):Math.min(120,Math.max(68,Math.round(width*height/16000)));
    stars=Array.from({length:count},(_,i)=>({
      x:Math.random()*width,y:Math.random()*height,
      r:mobile.matches?1.25+Math.random()*1.25:2.4+Math.random()*2.4,
      phase:Math.random()*Math.PI*2,
      period:mobile.matches?7500+Math.random()*3000:6200+Math.random()*3000,
      bright:Math.random()>.42
    }));
  }
  function diamond(x,y,size,color){
    ctx.beginPath();
    ctx.moveTo(x,y-size);
    ctx.lineTo(x+size*.76,y);
    ctx.lineTo(x,y+size);
    ctx.lineTo(x-size*.76,y);
    ctx.closePath();
    ctx.fillStyle=color;ctx.fill();
  }
  function draw(t){
    ctx.clearRect(0,0,width,height);
    for(const s of stars){
      const progress=reduced.matches?.45:(.5+.5*Math.sin(t*Math.PI*2/s.period+s.phase));
      const glow=Math.pow(progress,mobile.matches?3.5:1.8);
      const x=s.x;
      const y=((s.y-scroll*.05+height)%height);
      const size=s.r*(.9+glow*.35);
      // Blue-to-white transition, not just changes in opacity.
      const red=Math.round(87+(255-87)*progress);
      const green=Math.round(159+(255-159)*progress);
      const blue=255;
      const alpha=mobile.matches?.20+glow*.46:.27+glow*.73;
      if(progress>.62){
        ctx.save();
        ctx.shadowColor='rgba(245,251,255,'+(.30+glow*.65)+')';
        ctx.shadowBlur=(mobile.matches?10:(s.bright?32:22))*glow;
        diamond(x,y,size*(1+glow*.18),'rgba('+red+','+green+','+blue+','+alpha+')');
        ctx.restore();
      }else{
        diamond(x,y,size,'rgba('+red+','+green+','+blue+','+alpha+')');
      }

    }
  }
  function tick(t){draw(t);frame=requestAnimationFrame(tick);}
  function start(){cancelAnimationFrame(frame);frame=0;draw(performance.now());if(!reduced.matches)frame=requestAnimationFrame(tick);}
  resize();start();
  window.addEventListener('resize',()=>{resize();start();},{passive:true});
  window.addEventListener('scroll',()=>{scroll=window.scrollY||0;if(reduced.matches)draw(0);},{passive:true});
  if(reduced.addEventListener)reduced.addEventListener('change',start);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else start();});
})();
