(() => {
  'use strict';
  const root=document.getElementById('imperial-loading'),layout=document.getElementById('layout');
  if(!root)return;
  if(!document.documentElement.classList.contains('imperial-opening')){
    clearTimeout(window.imperialEntranceTimeout);root.remove();return;
  }
  const previousFocus=document.activeElement,previousInert=layout?.inert;
  const events=new AbortController();
  function finish(){
    ended=true;
    clearTimeout(window.imperialEntranceTimeout);
    events.abort();cancelAnimationFrame(raf);
    document.documentElement.classList.remove('imperial-opening');
    if(layout)layout.inert=previousInert;
    if(root.contains(document.activeElement)){
      const target=previousFocus!==document.body&&previousFocus?.isConnected?previousFocus:layout?.querySelector('a');
      target?.focus({preventScroll:true});
    }
    root.remove();window.finishImperialEntrance=null;
  }
  window.finishImperialEntrance=()=>{ended=true;finish()};
  const canvas=document.getElementById('imperial-scene');
  const ctx=canvas.getContext('2d',{alpha:false});
  const q=new URLSearchParams(),assets=root.dataset.assets;
  if(layout)layout.inert=true;
  root.focus({preventScroll:true});
  const capture=q.has('time'),waiting=q.get('wait')==='1',duration=8000;
  let image,edges,particles=[],width=1,height=1,dpr=1,start=null,raf=0,ended=false,loaded=false,frames=0;
  let seed=1894;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  const clamp=v=>Math.max(0,Math.min(1,v)),ease=v=>{v=clamp(v);return v*v*(3-2*v)},phase=(t,a,b)=>ease((t-a)/(b-a));
  const message=data=>{if(data.type==='complete'||data.type==='error')finish()};
  function resize(){width=canvas.clientWidth||innerWidth;height=canvas.clientHeight||innerHeight;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}
  function fit(){const scale=width/height<1.1?Math.min(width/image.width,height/image.height):Math.max(width/image.width,height/image.height);const w=image.width*scale,h=image.height*scale;return{x:(width-w)/2,y:(height-h)/2,w,h}}
  function render(rawTime){
    if(!loaded)return;
    if(width!==canvas.clientWidth||height!==canvas.clientHeight||dpr!==Math.min(devicePixelRatio||1,2))resize();
    const t=clamp(rawTime/duration)*8,b=fit(),color=phase(t,5.35,7.35);
    ctx.globalAlpha=1;ctx.fillStyle='#0e0c09';ctx.fillRect(0,0,width,height);
    if(color){ctx.globalAlpha=color;ctx.drawImage(image,b.x,b.y,b.w,b.h)}
    // The image-derived outline is visible in the very first frame. No intro or caption.
    const outline=(.16+.76*phase(t,2.6,4.55))*(1-phase(t,5.8,7.4));
    ctx.globalAlpha=outline;ctx.drawImage(edges,b.x,b.y,b.w,b.h);
    const alpha=1-phase(t,4.9,6.25),scale=b.w/1280,count=width<600?Math.min(4500,particles.length):particles.length;
    for(let group=0;group<3;group++){
      ctx.strokeStyle=['#f2d7a2','#c59550','#b4b1a2'][group];ctx.globalAlpha=alpha*[.72,.48,.28][group];ctx.lineWidth=Math.max(.6,Math.min(1.3,scale*.7));ctx.beginPath();
      for(let i=0;i<count;i++){const p=particles[i];if(p.group!==group)continue;
        const settled=phase(t,p.delay,4.35+p.delay),remain=1-settled,tx=b.x+p.tx*b.w,ty=b.y+p.ty*b.h;
        const swirl=Math.sin(settled*Math.PI)*remain;
        const x=p.sx*width*remain+tx*settled+Math.sin(t*.6+p.tx*10)*swirl*width*.06;
        const y=p.sy*height*remain+ty*settled+Math.cos(t*.45+p.ty*12)*swirl*height*.035;
        const a=p.angle+remain*t*.5,len=(1.5+remain*p.len)*Math.max(.8,scale);
        ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*len,y+Math.sin(a)*len)
      }ctx.stroke()
    }
    ctx.globalAlpha=1;canvas.dataset.phase=t<4.35?'particles':t<5.35?'outline':'color';canvas.dataset.time=String(rawTime);frames++;
  }
  function complete(skipped=false){if(ended)return;ended=true;cancelAnimationFrame(raf);if(loaded)render(duration);message({type:'complete',skipped,frames})}
  function tick(now){if(start===null)start=now;const elapsed=now-start;render(elapsed);if(elapsed>=duration){complete();return}raf=requestAnimationFrame(tick)}
  function replay(){ended=false;start=null;frames=0;cancelAnimationFrame(raf);if(matchMedia('(prefers-reduced-motion: reduce)').matches){render(duration);complete(true)}else raf=requestAnimationFrame(tick)}
  function loadImage(url){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('Asset load failed'));im.src=url})}
  addEventListener('resize',()=>{resize();if(loaded&&capture)render(Number(q.get('time')))},{signal:events.signal});
  addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();complete(true)}},{signal:events.signal});
  
  if(!ctx){complete(true);return;}
  Promise.all([loadImage(assets+'background.jpg'),loadImage(assets+'edges.png'),fetch(assets+'particles.json',{signal:events.signal}).then(r=>{if(!r.ok)throw Error('Particle load failed');return r.json()})]).then(([im,ed,points])=>{
    if(ended)return;image=im;edges=ed;particles=points.map(p=>({tx:p[0],ty:p[1],angle:p[2],sx:random(),sy:random(),delay:random()*.42,len:random()*2.7,group:Math.floor(random()*3)}));loaded=true;resize();
    window.imperial={render,complete,replay,stats:()=>({loaded,ended,frames,particles:particles.length,duration,width,height,viewport:[innerWidth,innerHeight],display:[canvas.clientWidth,canvas.clientHeight],buffer:[canvas.width,canvas.height],dpr})};
    render(capture?Number(q.get('time')):0);document.body.dataset.ready='true';message({type:'ready',particles:particles.length});if(!capture&&!waiting)replay();
  }).catch(error=>{if(!ended){console.error(error);message({type:'error',message:error.message})}});
})();
