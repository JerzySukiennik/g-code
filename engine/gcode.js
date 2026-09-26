// G-Code host: mounts a game in a container element, runs a program against
// the core, picks the 2D or 3D renderer from world({ mode }), feeds input and
// draws the HUD. `run(code)` can be called again at any time to hot-swap.

import { createCore } from './core.js';
import { createRender2D } from './render2d.js';
import { createAudio } from './audio.js';

let render3dModule = null;

export function mount(container, { onState, onError } = {}) {
  container.classList.add('gc-stage');
  const c2 = document.createElement('canvas');
  const c3 = document.createElement('canvas');
  const hud = document.createElement('div');
  const overlay = document.createElement('div');
  for (const el of [c2, c3]) el.className = 'gc-canvas';
  hud.className = 'gc-hud';
  overlay.className = 'gc-overlay';
  container.append(c2, c3, hud, overlay);
  if (!document.getElementById('gc-style')) {
    const st = document.createElement('style');
    st.id = 'gc-style';
    st.textContent = `.gc-stage{position:relative;overflow:hidden;background:#000;user-select:none;-webkit-user-select:none;touch-action:none}
.gc-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.gc-hud{position:absolute;inset:0;pointer-events:none;font:600 15px/1.2 ui-rounded,system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.55)}
.gc-hud .row{position:absolute;top:12px;left:14px;right:14px;display:flex;gap:18px;align-items:center}
.gc-hud .title{position:absolute;top:10px;left:0;right:0;text-align:center;font-size:17px;letter-spacing:.02em;opacity:.95}
.gc-hud .msg{position:absolute;top:40%;left:0;right:0;text-align:center;font-size:26px}
.gc-hud .right{margin-left:auto}
.gc-overlay{position:absolute;inset:0;display:none;place-items:center;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);color:#fff;font:700 34px ui-rounded,system-ui,sans-serif;text-align:center;cursor:pointer}
.gc-overlay small{display:block;font:500 14px system-ui;opacity:.8;margin-top:10px}`;
    document.head.appendChild(st);
  }

  const audio = createAudio();
  const r2 = createRender2D(c2);
  let r3 = null;
  let core = null, code = '', doodles = {}, raf = 0, last = 0, seed = 1, active = null;
  const keys = new Set(), pressed = new Set();
  const pointer = { u: 0, v: 0, down: false, clicked: false, px: 0, py: 0 };

  const norm = (k) => (k === ' ' ? ' ' : k.toLowerCase());
  const onKey = (e) => {
    const ae = document.activeElement;
    if (ae && (['TEXTAREA', 'INPUT', 'SELECT'].includes(ae.tagName) || ae.isContentEditable)) return;
    const k = norm(e.key);
    if (e.type === 'keydown') {
      if (!keys.has(k)) pressed.add(k);
      keys.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      audio.unlock();
      if (core && core.state !== 'play' && (k === ' ' || k === 'enter')) restart();
    } else keys.delete(k);
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('blur', () => keys.clear());

  const pos = (e) => {
    const r = container.getBoundingClientRect();
    pointer.px = e.clientX - r.left; pointer.py = e.clientY - r.top;
  };
  container.tabIndex = 0;
  container.addEventListener('pointerdown', (e) => { pos(e); pointer.down = true; pointer.clicked = true; container.focus({ preventScroll: true }); audio.unlock(); });
  container.addEventListener('pointermove', pos);
  window.addEventListener('pointerup', () => { pointer.down = false; });
  overlay.addEventListener('click', (e) => { e.stopPropagation(); restart(); });

  function start() {
    core = createCore({ seed });
    core.input.keys = keys;
    core.input.pressed = pressed;
    core.input.pointer = pointer;
    let error = null;
    try { core.load(code); } catch (e) { error = e; }
    const want = core.world.mode === '3d' ? '3d' : '2d';
    activate(want);
    audio.music(core.world.music);
    overlay.style.display = 'none';
    if (onState) onState({ slots: [...core.slots.values()], warnings: core.warnings, error, mode: want, view: core.view });
    if (error && onError) onError(error);
  }

  async function activate(want) {
    active = want;
    c2.style.display = want === '2d' ? 'block' : 'none';
    c3.style.display = want === '3d' ? 'block' : 'none';
    if (want === '3d' && !r3) {
      if (!render3dModule) render3dModule = await import('./render3d.js');
      if (!r3) r3 = render3dModule.createRender3D(c3);
    }
    if (want === '3d' && r3) r3.reset();
  }

  function restart() { seed++; start(); }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - last) / 1000 || 1 / 60);
    last = t;
    if (!core) return;
    const r = active === '3d' ? r3 : r2;
    if (r) {
      const p = r.toPlane(core, pointer.px, pointer.py);
      pointer.u = p.u; pointer.v = p.v;
    }
    core.step(dt);
    for (const s of core.sounds) audio.play(s);
    core.sounds.length = 0;
    if (r) r.draw(core, doodles, dt);
    drawHud();
  }

  function drawHud() {
    const h = core.hud;
    const parts = [];
    if (h.score != null) parts.push(`<span>★ ${h.score}${h.goal ? ' / ' + h.goal : ''}</span>`);
    if (h.lives != null) parts.push(`<span>${'♥'.repeat(Math.max(0, Math.min(10, h.lives)))}</span>`);
    if (h.timer != null) parts.push(`<span class="right">⏱ ${Math.ceil(h.timer)}</span>`);
    const title = h.title ? `<div class="title">${esc(h.title)}</div>` : '';
    const msg = core.messages.length ? `<div class="msg">${esc(core.messages[core.messages.length - 1].text)}</div>` : '';
    const html = `<div class="row">${parts.join('')}</div>${title}${msg}`;
    if (hud._html !== html) { hud.innerHTML = html; hud._html = html; }
    if (core.state !== 'play' && overlay.style.display !== 'grid') {
      overlay.innerHTML = `<div>${esc(core.endText)}<small>click or press space to play again</small></div>`;
      overlay.style.display = 'grid';
    }
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }

  raf = requestAnimationFrame(frame);

  return {
    run(newCode, { keepSeed = true } = {}) { code = newCode; if (!keepSeed) seed++; start(); },
    restart,
    setDoodles(d) { doodles = d || {}; },
    async setSound(name, blob) { await audio.record(name, blob); },
    clearSounds() { audio.clearRecorded(); },
    get core() { return core; },
    destroy() {
      cancelAnimationFrame(raf);
      audio.stopMusic();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      if (r3) r3.dispose();
      container.innerHTML = '';
    },
  };
}
