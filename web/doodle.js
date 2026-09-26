// Doodle mode: every slot the program declared (player, enemy, coin, …) can
// be drawn by hand, and every sound it uses can be recorded. The drawings
// replace the built-in shapes in both 2D and 3D.

import { drawShape } from '../engine/render2d.js';

const INK = ['#1b1b1f', '#f5f5f7', '#e5484d', '#f76b15', '#ffd60a', '#30a46c', '#99d52a', '#0090ff', '#7cc4fa', '#8e4ec6', '#e93d82', '#8d5a3b'];

function soundsUsed(code) {
  const s = new Set();
  if (/controls\('(platformer|runner|flappy|arrows)'/.test(code)) s.add('jump');
  if (/\.shoot\(/.test(code)) s.add('shoot');
  for (const m of code.matchAll(/sound\('(\w+)'\)/g)) s.add(m[1]);
  if (/\.explode\(/.test(code)) s.add('explode');
  if (/\.pop\(/.test(code)) s.add('pop');
  if (/hurt\(/.test(code)) s.add('hit');
  if (/ricochet/.test(code)) s.add('bounce');
  if (/goal\(|timer\(|win\(/.test(code)) s.add('win');
  if (/hurt\(|lose\(/.test(code)) s.add('lose');
  return [...s];
}

export function openDoodle(root, { slots, code, doodles, onSound, onClose }) {
  const drawn = { ...doodles };
  const recorded = openDoodle.recorded || (openDoodle.recorded = new Set());
  const visual = slots.filter((s) => s.slot !== 'wall');
  root.hidden = false;
  root.innerHTML = `
    <div class="dd" role="dialog" aria-label="Draw your game">
      <div class="dd-list"><h3>things in your game</h3></div>
      <div class="dd-main">
        <div class="dd-top"><h2 id="ddTitle"></h2><span class="spacer"></span>
          <button class="ghost" id="ddClear">clear</button><button class="ghost" id="ddUndo">undo</button>
          <button class="solid" id="ddPlay">▶ play with my drawings</button></div>
        <div class="dd-canvas-wrap"><canvas id="ddCanvas"></canvas></div>
        <div class="dd-tools" id="ddTools"></div>
        <div class="rec" id="ddRec"><span>sounds — click to record (2 s):</span></div>
      </div>
    </div>`;
  const list = root.querySelector('.dd-list');
  const cv = root.querySelector('#ddCanvas');
  const ctx = cv.getContext('2d');
  let current = null, color = INK[0], size = 10, erase = false;
  const undo = [];
  const guide = document.createElement('canvas');

  const tools = root.querySelector('#ddTools');
  for (const c of INK) {
    const b = document.createElement('button');
    b.className = 'sw' + (c === color ? ' on' : '');
    b.style.background = c;
    b.onclick = () => { color = c; erase = false; tools.querySelectorAll('.sw').forEach((x) => x.classList.toggle('on', x === b)); er.classList.remove('on'); };
    tools.appendChild(b);
  }
  const pickC = document.createElement('input');
  pickC.type = 'color'; pickC.value = '#ff66aa'; pickC.title = 'any colour';
  pickC.oninput = () => { color = pickC.value; erase = false; tools.querySelectorAll('.sw').forEach((x) => x.classList.remove('on')); };
  tools.appendChild(pickC);
  const rng = document.createElement('input');
  rng.type = 'range'; rng.min = 2; rng.max = 60; rng.value = size; rng.oninput = () => (size = +rng.value);
  tools.appendChild(rng);
  const er = document.createElement('button');
  er.className = 'ghost'; er.textContent = 'eraser';
  er.onclick = () => { erase = !erase; er.classList.toggle('on', erase); };
  tools.appendChild(er);
  const fill = document.createElement('button');
  fill.className = 'ghost'; fill.textContent = 'fill';
  fill.onclick = () => { snapshot(); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = color; ctx.fillRect(0, 0, cv.width, cv.height); };
  tools.appendChild(fill);

  function snapshot() { undo.push(ctx.getImageData(0, 0, cv.width, cv.height)); if (undo.length > 30) undo.shift(); }

  function select(s) {
    if (current) store();
    current = s;
    list.querySelectorAll('.slot').forEach((b) => b.classList.toggle('on', b.dataset.slot === s.slot));
    root.querySelector('#ddTitle').textContent = s.slot;
    const [w, h] = [s.dims[0], s.dims[1]];
    const long = 460, ar = w / h;
    cv.width = Math.round(ar >= 1 ? long : long * ar);
    cv.height = Math.round(ar >= 1 ? long / ar : long);
    cv.style.aspectRatio = `${cv.width} / ${cv.height}`;
    guide.width = cv.width; guide.height = cv.height;
    const g = guide.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    g.save(); g.translate(cv.width / 2, cv.height / 2); g.globalAlpha = 0.18;
    drawShape(g, s.shape, cv.width * 0.92, cv.height * 0.92, s.color || '#888', 0, false);
    g.restore();
    cv.style.background = `url(${guide.toDataURL()}) center / contain no-repeat`;
    ctx.clearRect(0, 0, cv.width, cv.height);
    undo.length = 0;
    if (drawn[s.slot]) ctx.drawImage(drawn[s.slot], 0, 0, cv.width, cv.height);
  }

  function isEmpty() {
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    for (let i = 3; i < d.length; i += 16) if (d[i] > 8) return false;
    return true;
  }

  function store() {
    if (!current) return;
    if (isEmpty()) { delete drawn[current.slot]; }
    else {
      const c = document.createElement('canvas');
      c.width = cv.width; c.height = cv.height;
      c.getContext('2d').drawImage(cv, 0, 0);
      drawn[current.slot] = c;
    }
    const btn = list.querySelector(`[data-slot="${CSS.escape(current.slot)}"]`);
    if (btn) {
      const th = btn.querySelector('canvas');
      const tctx = th.getContext('2d');
      tctx.clearRect(0, 0, th.width, th.height);
      if (drawn[current.slot]) { const k = Math.min(th.width / cv.width, th.height / cv.height); tctx.drawImage(cv, (th.width - cv.width * k) / 2, (th.height - cv.height * k) / 2, cv.width * k, cv.height * k); }
      else paintDefault(th, current);
      btn.querySelector('.done').textContent = drawn[current.slot] ? '✓' : '';
    }
  }

  function paintDefault(th, s) {
    const t = th.getContext('2d');
    t.save(); t.translate(th.width / 2, th.height / 2);
    const ar = s.dims[0] / s.dims[1];
    drawShape(t, s.shape, ar >= 1 ? 30 : 30 * ar, ar >= 1 ? 30 / ar : 30, s.color || '#888', 0, false);
    t.restore();
  }

  for (const s of visual) {
    const b = document.createElement('button');
    b.className = 'slot'; b.dataset.slot = s.slot;
    const th = document.createElement('canvas'); th.width = 38; th.height = 38;
    b.append(th);
    const txt = document.createElement('div');
    txt.innerHTML = `<div class="nm"></div><div class="sub">${s.kind === 'spawn' ? 'spawns' : s.kind === 'bullet' ? 'projectile' : 'object'}</div>`;
    txt.querySelector('.nm').textContent = s.slot;
    b.append(txt);
    const done = document.createElement('span'); done.className = 'done'; done.textContent = drawn[s.slot] ? '✓' : '';
    b.append(done);
    if (drawn[s.slot]) th.getContext('2d').drawImage(drawn[s.slot], 0, 0, 38, 38); else paintDefault(th, s);
    b.onclick = () => select(s);
    list.appendChild(b);
  }

  let drawing = false, last = null;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
  cv.addEventListener('pointerdown', (e) => { if (!current) return; cv.setPointerCapture(e.pointerId); snapshot(); drawing = true; last = pos(e); stroke(last, last); });
  cv.addEventListener('pointermove', (e) => { if (!drawing) return; const p = pos(e); stroke(last, p); last = p; });
  const end = () => { if (drawing) { drawing = false; store(); } };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  function stroke(a, b) {
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x + 0.01, b.y); ctx.stroke();
  }
  root.querySelector('#ddUndo').onclick = () => { const d = undo.pop(); if (d) { ctx.putImageData(d, 0, 0); store(); } };
  root.querySelector('#ddClear').onclick = () => { snapshot(); ctx.clearRect(0, 0, cv.width, cv.height); store(); };

  const rec = root.querySelector('#ddRec');
  for (const name of soundsUsed(code)) {
    const b = document.createElement('button');
    b.className = 'snd' + (recorded.has(name) ? ' has' : '');
    b.textContent = name;
    b.onclick = () => record(name, b);
    rec.appendChild(b);
  }
  async function record(name, btn) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        btn.classList.remove('live');
        const blob = new Blob(chunks, { type: mr.mimeType });
        await onSound(name, blob);
        recorded.add(name);
        btn.classList.add('has');
      };
      btn.classList.add('live');
      mr.start();
      setTimeout(() => mr.state === 'recording' && mr.stop(), 2000);
    } catch { btn.textContent = name + ' (no mic)'; }
  }

  function close() {
    store();
    root.hidden = true;
    root.innerHTML = '';
    window.removeEventListener('keydown', onKey);
    onClose(drawn);
  }
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', onKey);
  root.querySelector('#ddPlay').onclick = close;
  root.onclick = (e) => { if (e.target === root) close(); };
  if (visual.length) select(visual[0]);
}
