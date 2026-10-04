import { RainScene } from './rain-scene.js';

// Only synthetic values from the original project's makeDemo; no weather service.
const rates = [0,0,0,0,0,0.6,1.4,2.2,3.1,4.8,7.2,10.8,13.6,11.8,8.4,5.8,3.6,2.1,1.2,0.5,0.1,0,0,0];
const $ = id => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let scene, playing = false, last = 0, raf = 0, visible = true;
let settling = 2, minutes = 45, rate = 4.8, mode = 'timeline';
try {
  scene = new RainScene($('webgl'));
  $('poster').hidden = true;
} catch {
  $('graphicsError').hidden = false;
  $('play').disabled = true;
  $('orbit').disabled = true;
}

function resize() {
  if (!scene) return;
  const { width, height } = $('webgl').getBoundingClientRect();
  scene.renderer.setSize(width, height);
  scene.camera.aspect = width / height;
  scene.camera.updateProjectionMatrix();
  settling = 2;
  wake();
}
function sample(t) {
  const p = t / 5, i = Math.floor(p), f = p - i;
  return rates[i] + (rates[Math.min(i + 1, rates.length - 1)] - rates[i]) * f;
}
function update() {
  if (mode === 'timeline') rate = sample(minutes);
  const band = rate <= 0 ? '无雨' : rate < 2.5 ? '小雨' : rate < 7.5 ? '中雨' : '大雨';
  $('rate').textContent = `${band}，${rate.toFixed(1)} mm/h`;
  $('previewTime').textContent = mode === 'timeline' ? `演示 +${Math.round(minutes)} 分钟` : '固定雨势预览';
  $('progress').value = minutes;
  $('progress').setAttribute('aria-valuetext', `演示第 ${Math.round(minutes)} 分钟，${band}，${rate.toFixed(1)} 毫米每小时`);
  $('cursor').setAttribute('x1', minutes / 115 * 656);
  $('cursor').setAttribute('x2', minutes / 115 * 656);
  document.querySelectorAll('[data-rate]').forEach(button => button.setAttribute('aria-pressed', String(mode === 'preset' && Number(button.dataset.rate) === rate)));
  scene?.setRate(rate);
}
function setPlaying(value) {
  playing = value;
  $('play').textContent = playing ? '暂停过程' : '播放过程';
  $('play').setAttribute('aria-pressed', String(playing));
}
function wake() {
  if (!raf && scene && visible && !document.hidden) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
}
function frame(now) {
  raf = 0;
  if (!visible || document.hidden || !scene) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (playing) {
    minutes = Math.min(115, minutes + dt * 115 / 15);
    update();
    if (minutes >= 115) setPlaying(false);
  }
  // Respect reduced motion while still allowing a user-triggered orbit/playback.
  scene.render(reduced && !playing && settling <= 0 ? 0 : dt);
  settling -= dt;
  if (!reduced || playing || settling > 0) raf = requestAnimationFrame(frame);
}
$('progress').addEventListener('input', event => {
  minutes = Number(event.target.value); mode = 'timeline'; setPlaying(false);
  update(); settling = 2; wake();
});
document.querySelectorAll('[data-rate]').forEach(button => button.addEventListener('click', () => {
  mode = 'preset'; rate = Number(button.dataset.rate); setPlaying(false);
  update(); settling = 2; wake();
}));
$('play').addEventListener('click', () => {
  if (!playing) { mode = 'timeline'; if (minutes >= 115) minutes = 0; }
  setPlaying(!playing); update(); wake();
});
$('orbit').addEventListener('click', () => { scene?.beginEntrance(false); settling = 2; wake(); });
const coords = rates.map((r, i) => [i / 23 * 656, 46 - r / 13.6 * 40]);
const path = coords.map(([x,y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
$('curve').setAttribute('d', path);
$('area').setAttribute('d', `${path} L656,52 L0,52 Z`);
new ResizeObserver(resize).observe($('webgl'));
new IntersectionObserver(entries => {
  visible = entries[0].isIntersecting;
  if (visible) wake();
}, {threshold: 0}).observe($('webgl'));
document.addEventListener('visibilitychange', wake);
if (scene) {
  scene.renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); cancelAnimationFrame(raf); raf = 0;
    setPlaying(false); scene = null;
    $('poster').hidden = false; $('graphicsError').hidden = false;
    $('play').disabled = true; $('orbit').disabled = true;
  });
}
update(); resize();
