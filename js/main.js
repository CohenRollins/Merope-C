// Merope-C shared navigation, filters and an animated starfield.
(() => {
  'use strict';
  document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
    const selected=button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    document.querySelectorAll('[data-category]').forEach(card=>card.hidden=selected!=='all'&&card.dataset.category!==selected);
  }));

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
    const density=Math.max(100,Math.min(245,Math.round(w*h/5600)));
    stars=Array.from({length:density},(_,i)=>({
      x:rng(i+1)*w,y:rng(i+913)*h,
      radius:.65+rng(i+488)*1.25,
      speed:.013+rng(i+115)*.045,
      blink:rng(i+809)*6.283,
      rate:.00044+rng(i+18)*.00064,
      bright:rng(i+391)>.68,
      cross:rng(i+74)>.93,
      hue:rng(i+43)>.57?'175,218,255':'225,241,255'
    }));
    if(reduced.matches)draw(0);
  }
  function draw(time){
    ctx.clearRect(0,0,w,h);
    for(const s of stars){
      const x=s.x;
      const drift=reduced.matches?0:time*s.speed*.008;
      const y=((s.y+drift-scrolled*(s.bright?.135:.065))%(h+30)+(h+30))%(h+30)-15;
      const wave=reduced.matches?.55:(.55+.30*Math.sin(time*s.rate+s.blink));
      const flash=reduced.matches?0:Math.pow(Math.max(0,Math.sin(time*(s.rate*.7)+s.blink)),20);
      const a=Math.min(.95,(s.bright?.52:.30)*wave+(s.cross?.65:0)*flash);
      ctx.beginPath();ctx.fillStyle=`rgba(${s.hue},${a.toFixed(3)})`;
      ctx.arc(x,y,s.radius+(s.cross?flash*.75:0),0,Math.PI*2);ctx.fill();
      if(s.cross&&flash>.18){
        const len=4.5+flash*9.5;
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
