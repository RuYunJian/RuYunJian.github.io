import { createObservatoryScene } from './observatory-scene';
import { connectFolia } from './observatory-folia';
import renderMathInElement from 'katex/contrib/auto-render';

const root = document.querySelector('#observatory');
const config = JSON.parse(document.querySelector('#observatory-data').textContent);
const musicEnabled = config.musicEnabled !== false;
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24"><use href="#obs-icon-${name}"></use></svg>`;
const announce = message => { $('#observatory-status').textContent = message; };
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
let scene;
let phase = 'tree';
let lastSculpture = 'tree';
let view = 'home';
let paused = reduced.matches;
let auto = !reduced.matches;
let elapsed = 0;
let lastTick = performance.now();
let carouselElapsed = 0;
let orbitHeld = false;
let activeArticle = 0;
let previousFocus;
let articleRequest;
let musicReveal;
let musicSettled = false;
const homeURL = new URL(config.home, location.href);
const pageTitle = config.title;
const cards = $$('.obs-card');
const featured = config.posts.slice(0, cards.length);
const articleURLs = new Map(config.posts.map(post => [new URL(post.url, homeURL).pathname, post]));

let foliaExpanded = false;
const folia = musicEnabled ? connectFolia(config, { icon, onExpand(value) {
  foliaExpanded = value;
  for (const element of [$('.obs-header'), $('.obs-orbit'), $('.obs-bottom'), $('#music-panel')]) element.inert = value;
  syncPause();
}, onSurfaceReady: settleMusic }) : null;

// The outgoing sculpture keeps moving until the native surface has painted, then rests offscreen.
function settleMusic() {
  clearTimeout(musicReveal);
  if (phase !== 'music' || !folia?.surfaceReady) return;
  musicReveal = setTimeout(() => { musicSettled = true; syncPause(); }, reduced.matches ? 120 : 1450);
}

function setPhase(next, manual = false, immediate = false) {
  if (next === 'music' && !musicEnabled) next = lastSculpture;
  if (manual) auto = false;
  phase = next;
  if (next !== 'music') lastSculpture = next;
  root.dataset.phase = next;
  musicSettled = false;
  $('#scene-toggle').hidden = next === 'music';
  $('#scene-toggle').setAttribute('aria-label', next === 'tree' ? '切换为粒子方块' : '切换为粒子树');
  clearTimeout(musicReveal);
  if ($('#music-panel')) $('#music-panel').hidden = !(next === 'music' && view === 'home');
  if (next === 'music' && view === 'home') {
    folia?.start();
    settleMusic();
  }
  if (view === 'home') $$('.obs-nav button').forEach(button => {
    const active = button.dataset.view === (next === 'music' ? 'music' : 'home');
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
  });
  if (next !== 'music') scene?.setPhase(next, immediate || reduced.matches || paused);
  syncPause();
  if (manual) announce({tree:'已切换至粒子树',cube:'已切换至粒子方块',music:'已打开音乐空间'}[next]);
}

function syncPause() {
  scene?.pause(paused || document.hidden || view !== 'home' || foliaExpanded || musicSettled);
  folia?.setAmbient(document.hidden || view !== 'home' || phase !== 'music' ? 'hidden' : paused || reduced.matches ? 'paused' : 'running');
  $('#scene-motion').setAttribute('aria-pressed', String(paused));
  $('#scene-motion').setAttribute('aria-label', paused ? '继续场景动画' : '暂停场景动画');
  $('#scene-motion').innerHTML = icon(paused ? 'play' : 'pause');
}
$('#scene-motion').addEventListener('click', () => { paused = !paused; syncPause(); });
$('#scene-replay').addEventListener('click', () => {
  showView('home'); elapsed = 0; auto = true; paused = false;
  setPhase('tree', false, true); syncPause(); announce('重新播放开场动画');
});
$('#scene-toggle').addEventListener('click', () => {
  if (view === 'home' && phase !== 'music') setPhase(phase === 'tree' ? 'cube' : 'tree', true, paused);
});
document.addEventListener('visibilitychange', () => { lastTick = performance.now(); syncPause(); });
reduced.addEventListener('change', () => { paused = reduced.matches; if (paused) auto = false; syncPause(); });

function positionCards() {
  // The first frame matches the approved orbital arrangement, with Rain Island in front.
  const order = [0, 2, 4, 3, 1];
  const focus = order.indexOf(activeArticle);
  cards.forEach((card, i) => {
    let offset = (order.indexOf(i) - focus + cards.length) % cards.length;
    if (offset > cards.length / 2) offset -= cards.length;
    card.dataset.slot = String(offset);
    card.classList.toggle('is-current', offset === 0);
    card.querySelector('a').setAttribute('aria-label', `阅读${featured[i].title}`);
  });
  $('.obs-count').textContent = `${String(activeArticle + 1).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')}`;
}
function moveCards(direction) {
  const order = [0, 2, 4, 3, 1];
  const at = order.indexOf(activeArticle);
  activeArticle = order[(at + direction + cards.length) % cards.length];
  carouselElapsed = 0;
  positionCards();
}
$('#article-prev').addEventListener('click', () => moveCards(-1));
$('#article-next').addEventListener('click', () => moveCards(1));
$('.obs-orbit').addEventListener('pointerenter', () => { orbitHeld = true; });
$('.obs-orbit').addEventListener('pointerleave', () => { orbitHeld = false; });
$('.obs-orbit').addEventListener('focusin', () => { orbitHeld = true; });
$('.obs-orbit').addEventListener('focusout', event => { if (!$('.obs-orbit').contains(event.relatedTarget)) orbitHeld = false; });
let touchX = null;
$('.obs-orbit').addEventListener('touchstart', event => { touchX = event.touches[0].clientX; }, {passive:true});
$('.obs-orbit').addEventListener('touchend', event => { const dx = event.changedTouches[0].clientX - touchX; if (touchX !== null && Math.abs(dx) > 45) moveCards(dx < 0 ? 1 : -1); touchX = null; }, {passive:true});
cards.forEach((card, i) => card.addEventListener('click', event => {
  if (event.target.closest('a')) return;
  if (activeArticle === i) openArticle(featured[i].url);
  else { activeArticle = i; carouselElapsed = 0; positionCards(); }
}));
positionCards();

function setHistory(url, state = {}, replace = false) {
  const target = new URL(url, homeURL);
  if (location.href !== target.href) history[replace ? 'replaceState' : 'pushState']({observatory:true,...state}, '', target);
}
history.replaceState({observatory:true,view:'home'}, '', location.href);

function showView(next, options = {}) {
  folia?.close();
  if (next === 'music' && !musicEnabled) next = 'home';
  const {historyUpdate = true, focus = true} = options;
  const music = next === 'music';
  if (music) next = 'home';
  if (view === 'home' && next !== 'home') previousFocus = document.activeElement;
  view = next;
  root.dataset.view = next;
  $$('.obs-panel').forEach(panel => { panel.hidden = panel.id !== `${next}-panel`; });
  $('.obs-orbit').inert = next !== 'home';
  $('.obs-scene-controls').inert = next !== 'home';
  $('#scene-toggle').inert = next !== 'home';
  $('.obs-carousel-controls').inert = next !== 'home';
  if ($('#music-panel')) $('#music-panel').hidden = !(next === 'home' && phase === 'music');
  $$('.obs-nav button').forEach(button => {
    const active = button.dataset.view === (music ? 'music' : next === 'reader' ? 'articles' : next);
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
  });
  if (next !== 'reader' && historyUpdate) setHistory(next === 'home' ? homeURL : `${homeURL}#${next}`, {view:next});
  if (next !== 'reader') { articleRequest?.abort(); document.title = next === 'home' ? pageTitle : `${{articles:'文章',tools:'工具与作品',about:'关于'}[next]} | ${pageTitle}`; }
  if (focus) {
    if (next === 'home') { if (previousFocus?.isConnected && !previousFocus.closest('[hidden]')) previousFocus.focus({preventScroll:true}); }
    else $(`#${next}-panel h1`)?.focus({preventScroll:true});
  }
  if (music) setPhase('music', true);
  else if (next === 'home' && phase === 'music') setPhase(lastSculpture, true);
  syncPause();
}

function renderArticleList() {
  const query = $('#article-search').value.trim().toLocaleLowerCase();
  const matches = config.posts.filter(post => `${post.title} ${post.category} ${(post.tags || []).join(' ')} ${post.summary}`.toLocaleLowerCase().includes(query));
  const list = $('.obs-article-list');
  list.replaceChildren();
  $('#search-count').textContent = query ? `找到 ${matches.length} 篇文章` : `共 ${config.posts.length} 篇文章`;
  for (const post of matches) {
    const a = document.createElement('a');
    a.className = 'obs-article-row'; a.href = new URL(post.url, homeURL).href; a.dataset.article = '';
    const date = document.createElement('time'); date.textContent = post.date;
    const text = document.createElement('div');
    const heading = document.createElement('h2'); heading.textContent = post.title;
    const summary = document.createElement('p'); summary.textContent = post.summary.slice(0,100);
    const tag = document.createElement('span'); tag.className = 'obs-article-tag'; tag.textContent = post.category;
    text.append(heading,summary); a.append(date,text,tag); list.append(a);
  }
  if (!matches.length) { const p = document.createElement('p'); p.className = 'obs-message'; p.textContent = '没有找到匹配的文章，换个关键词试试。'; list.append(p); }
}
renderArticleList();
$('#article-search').addEventListener('input', renderArticleList);

function ensureMathStyle() {
  if ($('#obs-math-style')) return;
  const link = document.createElement('link'); link.id = 'obs-math-style'; link.rel = 'stylesheet';
  link.href = new URL('vendor/katex/katex.min.css', homeURL).href; document.head.append(link);
}

async function openArticle(href, options = {}) {
  const url = new URL(href, homeURL);
  const post = articleURLs.get(url.pathname);
  if (!post) { location.assign(url.href); return; }
  articleRequest?.abort(); const controller = new AbortController(); articleRequest = controller;
  showView('reader', {historyUpdate:false,focus:false});
  $('#reader-title').textContent = post.title;
  const meta = $('.obs-reader-meta'); meta.replaceChildren();
  const date = document.createElement('time'); date.textContent = post.date;
  const direct = document.createElement('a'); direct.href = url.href; direct.target = '_blank'; direct.rel = 'noopener'; direct.textContent = '独立页面打开';
  meta.append(date,direct);
  const body = $('.obs-reader-body'); body.replaceChildren(); body.setAttribute('aria-busy','true');
  const loading = document.createElement('p'); loading.className='obs-message'; loading.textContent='正在打开文章…'; body.append(loading);
  $('#reader-panel').scrollTop=0;
  $('#reader-title').focus({preventScroll:true});
  if (options.historyUpdate !== false) setHistory(url, {view:'reader',article:url.pathname});
  document.title = `${post.title} | ${pageTitle}`;
  try {
    let html;
    if ($('#observatory-article') && url.pathname === new URL(document.baseURI).pathname && !window.__obsArticleFetched) {
      html = document;
      window.__obsArticleFetched = true;
    } else {
      const response = await fetch(url, {signal:controller.signal});
      if (!response.ok) throw new Error('HTTP '+response.status);
      html = new DOMParser().parseFromString(await response.text(), 'text/html');
    }
    const content = html.querySelector('#observatory-article')?.content.querySelector('.content')?.cloneNode(true) || html.querySelector('.article > .content');
    if (!content) throw new Error('No readable article content');
    content.querySelectorAll('script,style,object,embed').forEach(node=>node.remove());
    content.querySelectorAll('.aplayer[data-server="netease"][data-type="song"]').forEach(legacy => {
      const id = legacy.dataset.id;
      if (!musicEnabled) { legacy.remove(); return; }
      const button = document.createElement('button'); button.type = 'button'; button.className = 'obs-article-music';
      const status = document.createElement('p'); status.className = 'obs-article-music-status'; status.setAttribute('role', 'status');
      button.textContent = '用 Folia 播放本文配乐';
      button.addEventListener('click', () => { status.textContent = '正在加载本文配乐…'; folia.playSong(id, message => { status.textContent = message; }); });
      legacy.replaceWith(button, status);
    });
    content.querySelectorAll('*').forEach(node=>{
      [...node.attributes].filter(attr=>attr.name.startsWith('on')).forEach(attr=>node.removeAttribute(attr.name));
      for(const name of ['src','href','poster']) {
        const value=node.getAttribute(name); if(!value || value.startsWith('#')) continue;
        const resolved=new URL(value,url); if(['javascript:','vbscript:'].includes(resolved.protocol)) node.removeAttribute(name); else node.setAttribute(name,resolved.href);
      }
      if(node.hasAttribute('srcset')) node.removeAttribute('srcset');
      if(node.tagName==='IMG') { node.loading='lazy'; node.decoding='async'; }
      if(node.tagName==='IFRAME') {
        node.loading='lazy'; node.title ||= '文章内嵌作品';
        // Keep old tools from navigating the outer audio shell.
        node.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups');
      }
    });
    if (controller.signal.aborted) return;
    body.replaceChildren(...content.childNodes);
    ensureMathStyle();
    renderMathInElement(body,{delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'$',right:'$',display:false},{left:'\\(',right:'\\)',display:false}],throwOnError:false});
    if(url.hash) { const target=body.querySelector(`[id="${CSS.escape(decodeURIComponent(url.hash.slice(1)))}"]`); target?.scrollIntoView({block:'start'}); }
  } catch(error) {
    if(controller.signal.aborted) return;
    body.replaceChildren();
    const p=document.createElement('p');p.className='obs-message';p.textContent='文章暂时无法加载。';
    const retry=document.createElement('button');retry.type='button';retry.textContent='重新加载';retry.addEventListener('click',()=>openArticle(url.href,{historyUpdate:false}));
    const fallback=document.createElement('a');fallback.href=url.href;fallback.target='_blank';fallback.rel='noopener';fallback.textContent='打开原文章页面';
    body.append(p,retry,document.createTextNode(' · '),fallback);
  } finally { if(!controller.signal.aborted) body.removeAttribute('aria-busy'); }
}

document.addEventListener('click', event => {
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey) return;
  const nav=event.target.closest('button[data-view]');
  if(nav) { showView(nav.dataset.view); return; }
  if(event.target.closest('[data-home]')) { event.preventDefault();showView('home');return; }
  const anchor=event.target.closest('a');
  if(!anchor || anchor.target==='_blank') return;
  if(anchor.classList.contains('obs-skip')) {event.preventDefault();showView('articles');return;}
  if(anchor.getAttribute('href')?.startsWith('#') && anchor.closest('.obs-reader-body')) {
    event.preventDefault(); const id=decodeURIComponent(anchor.getAttribute('href').slice(1));$('.obs-reader-body').querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({block:'start'});return;
  }
  const target=new URL(anchor.href,homeURL);
  if(target.origin===homeURL.origin&&articleURLs.has(target.pathname)) { event.preventDefault(); openArticle(target.href); }
  else if(target.origin===homeURL.origin&&/^\/(archives|tags|categories)(\/|$)/.test(target.pathname)) { event.preventDefault(); showView('articles'); }
});
$('#open-search').addEventListener('click',()=>{ showView('articles');$('#article-search').focus(); });
$$('.close-panel').forEach(button=>button.addEventListener('click',()=>showView('home')));
$('#reader-back').addEventListener('click',()=>showView('articles'));
window.addEventListener('popstate',()=>{
  if(articleURLs.has(location.pathname)) openArticle(location.href,{historyUpdate:false});
  else showView(['articles','tools','about'].includes(location.hash.slice(1))?location.hash.slice(1):'home',{historyUpdate:false});
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&view!=='home') showView('home');
  if(view!=='home'||event.target.closest('input,textarea,button,a')) return;
  if(event.key==='ArrowLeft') moveCards(-1);
  if(event.key==='ArrowRight') moveCards(1);
});

// Small covers are drawn from mathematical point fields; they are not stock photos.
function drawCover(canvas) {
  const ctx=canvas.getContext('2d');const w=canvas.width,h=canvas.height;ctx.fillStyle='#070d1d';ctx.fillRect(0,0,w,h);
  const kind=canvas.dataset.art;
  let seed=47;const rand=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
  for(let i=0;i<95;i++){ctx.fillStyle=`rgba(101,155,255,${rand()*.6})`;ctx.fillRect(rand()*w,rand()*h,1,1);}
  if(kind==='wave'||kind==='terrain') {
    for(let row=0;row<26;row++){ctx.beginPath();for(let x=0;x<w;x+=3){const z=row/25;const y=h*.27+z*h*.56+Math.sin(x/w*7+z*5)*h*.12*Math.sin(z*Math.PI)+Math.cos(x/w*13-z*4)*h*.06; if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.strokeStyle=`rgba(${kind==='wave'?'91,164,255':'105,136,228'},${.12+row/50})`;ctx.lineWidth=.7;ctx.stroke();}
  }else if(kind==='network'){
    const points=Array.from({length:32},()=>({x:w*.15+rand()*w*.7,y:h*.15+rand()*h*.7}));
    for(const a of points){for(const b of points){if(Math.hypot(a.x-b.x,a.y-b.y)<w*.23){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle='#3866ac55';ctx.stroke();}}ctx.beginPath();ctx.arc(a.x,a.y,2,0,Math.PI*2);ctx.fillStyle='#9acbff';ctx.fill();}
  }else{
    for(let i=0;i<2500;i++){const angle=rand()*Math.PI*2;const r=Math.sqrt(rand())*w*.35;const x=w/2+Math.cos(angle)*r,y=h*.43+Math.sin(angle)*r*.68;ctx.fillStyle=`rgba(66,139,255,${rand()*.8})`;ctx.fillRect(x,y,1.4,1.4);}
    for(let i=0;i<1000;i++){const z=rand(),x=w/2+(rand()-.5)*w*.045*(1-z)+Math.sin(z*4)*w*.022,y=h*.44+z*h*.4;ctx.fillStyle='#6ab9ffd0';ctx.fillRect(x,y,1,1);}
  }
}
$$('.obs-art-canvas').forEach(drawCover);

async function bootScene() {
  await Promise.race([document.fonts.load('32px FoliaHand'),new Promise(resolve=>setTimeout(resolve,1200))]);
  try {
    scene=createObservatoryScene($('#observatory-canvas'),{reducedMotion:reduced.matches,textSpeed:config.textFlowSpeed,onReady:result=>{if(result?.supported===false)$('.obs-fallback').hidden=false;}});
    scene.setText(config.textFlow);scene.setPhase(phase === 'music' ? lastSculpture : phase,true);syncPause();
    document.fonts.ready.then(()=>scene.setText(config.textFlow));
  }catch(error){$('.obs-fallback').hidden=false;auto=false;}
  lastTick=performance.now();
}
bootScene();
// Prewarm during the tree so the first hand-off does not expose a blank player document.
if (musicEnabled) {
  if ('requestIdleCallback' in window) requestIdleCallback(() => folia.start(), { timeout: 1800 });
  else setTimeout(() => folia.start(), 1200);
}
setInterval(()=>{
  const now=performance.now(),delta=Math.min(now-lastTick,250);lastTick=now;
  if(paused||document.hidden||view!=='home')return;
  if(auto){elapsed+=delta;if(elapsed>=config.treeHold+config.cubeHold&&phase!=='music'){if(musicEnabled){setPhase('music');auto=false;}else{elapsed=0;setPhase('tree');}}else if(elapsed>=config.treeHold&&phase==='tree')setPhase('cube');}
  if(!orbitHeld&&!reduced.matches){carouselElapsed+=delta;if(carouselElapsed>8000)moveCards(1);}
},100);
const initialView=location.hash.slice(1) || config.initialView;
if(config.initialFilter) { $('#article-search').value=config.initialFilter; renderArticleList(); }
if(articleURLs.has(location.pathname)) { auto=false; openArticle(location.href,{historyUpdate:false}); }
else if(['articles','tools','about'].includes(initialView)) { auto=false; showView(initialView,{historyUpdate:false}); }
