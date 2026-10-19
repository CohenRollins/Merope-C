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
      {label:'PERC House',href:'pages/house.html',items:[['PERC House','pages/house.html'],['House rules','pages/house.html#rules'],['House information & code','pages/house-access.html'],['House photo albums','pages/house-access.html#photos'],['PERC Bot','pages/perc.html'],['PERC Discord','https://discord.gg/pkrvyUvmDJ']]}
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

  const canvas=document.createElement('canvas');
  canvas.className='merope-stars';canvas.setAttribute('aria-hidden','true');
  document.body.prepend(canvas);
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let w=0,h=0,dpr=1,frame=0,scrolled=window.scrollY||0,stars=[];
  const rng=n=>{let x=Math.sin(n*127.1+17.3)*43758.5453;return x-Math.floor(x);};
  function resize(){
    w=innerWidth;h=innerHeight;dpr=Math.min(devicePixelRatio||1,1.7);
    canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const density=Math.max(62,Math.min(145,Math.round(w*h/10800)));
    stars=Array.from({length:density},(_,i)=>({
      x:rng(i+1)*w,y:rng(i+913)*h,
      radius:1.05+rng(i+488)*1.8,
      speed:.035+rng(i+115)*.075,
      blink:rng(i+809)*6.283,
      rate:.0012+rng(i+18)*.0024,
      bright:rng(i+391)>.42,
      cross:rng(i+74)>.82,
      hue:rng(i+43)>.57?'175,218,255':'225,241,255'
    }));
    if(reduced.matches)draw(0);
  }
  function draw(time){
    ctx.clearRect(0,0,w,h);
    for(const s of stars){
      const x=s.x+(reduced.matches?0:Math.sin(time*.0001+s.blink)*3.5);
      const drift=reduced.matches?0:time*s.speed*.045;
      const y=((s.y+drift-scrolled*(s.bright?.135:.065))%(h+30)+(h+30))%(h+30)-15;
      const wave=reduced.matches?.82:(.55+.43*Math.sin(time*s.rate+s.blink));
      const flash=reduced.matches?0:Math.pow(Math.max(0,Math.sin(time*(s.rate*.82)+s.blink)),9);
      const a=Math.min(1,(s.bright?.92:.70)*wave+(s.cross?.95:0)*flash);
      ctx.beginPath();ctx.fillStyle=`rgba(${s.hue},${a.toFixed(3)})`;
      ctx.shadowColor=s.bright?"#8acaff":"#c9e8ff";ctx.shadowBlur=s.cross?4+flash*15:2;
      ctx.arc(x,y,s.radius+(s.cross?flash*1.15:0),0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
      if(s.cross&&flash>.11){
        const len=8+flash*12;
        ctx.lineWidth=.8+flash*.6;
        ctx.strokeStyle=`rgba(${s.hue},${Math.min(.9,flash*.84)})`;
        ctx.beginPath();ctx.moveTo(x-len,y);ctx.lineTo(x+len,y);ctx.moveTo(x,y-len);ctx.lineTo(x,y+len);ctx.stroke();
      }
    }
  }
  function tick(t){draw(t);if(!reduced.matches)frame=requestAnimationFrame(tick);}
  function start(){cancelAnimationFrame(frame);frame=0;if(reduced.matches)draw(0);else frame=requestAnimationFrame(tick);}
  resize();start();
  addEventListener('resize',()=>{resize();start();},{passive:true});
  addEventListener('scroll',()=>{scrolled=window.scrollY||0;if(reduced.matches)draw(0);},{passive:true});
  if(reduced.addEventListener)reduced.addEventListener('change',start);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else start();});
})();
