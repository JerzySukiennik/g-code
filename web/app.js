// G-Code playground: streams a program from the model for whatever is typed,
// renders it while it arrives and runs every complete prefix, so the game
// assembles itself line by line.

import { mount } from '../engine/gcode.js';
import { openDoodle } from './doodle.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const SERVER = params.get('server') ?? (location.port === '8765' ? '' : 'http://localhost:8765');

const EXAMPLES = [
  'a jumping green sphere', 'a 2d space shooter', 'a 3d platformer with a cat collecting fish',
  'skacząca czerwona kula', 'strzelanka z zombie w nocy', 'dodge falling meteors',
  'breakout with rainbow bricks', 'pop the balloons', 'uciekaj przed duchami 3d',
  'a solar system', 'flappy bird with a rocket', 'zbieraj monety czerwonym autem',
];

const promptEl = $('#prompt'), codeEl = $('#code'), editEl = $('#codeEdit');
const statusEl = $('#status'), metaEl = $('#meta'), warnEl = $('#warn'), slotsEl = $('#slots');
let slots = [];
let doodles = {};

const game = mount($('#stage'), {
  onState(s) {
    slots = s.slots;
    slotsEl.textContent = `${s.mode} · ${s.view} · ${s.slots.map((x) => x.slot).join(' · ')}`;
    const w = [...(s.error ? [s.error.message] : []), ...s.warnings];
    warnEl.hidden = !w.length;
    warnEl.textContent = w.slice(0, 3).join('\n');
  },
});

for (const ex of EXAMPLES) {
  const b = document.createElement('button');
  b.textContent = ex;
  b.onclick = () => { promptEl.value = ex; schedule(0); promptEl.focus(); };
  $('#examples').appendChild(b);
}

// ------------------------------------------------------------ rendering --

const KW = /\b(world|add|spawn|scatter|hit|every|after|key|click|tap|out|score|lives|hurt|heal|timer|goal|title|say|win|lose|sound|music|shake|burst|random|pick|find|all|count|camera|platforms|walls|maze|const|let|if|return)\b/g;
function highlight(src) {
  const esc = src.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return esc.replace(/('[^'\n]*'?|\b\d+(?:\.\d+)?\b|\b[a-zA-Z_]\w*(?=\()|[{}()[\],.;])/g, (m) => {
    if (m[0] === "'") return `<span class="s">${m}</span>`;
    if (/^\d/.test(m)) return `<span class="n">${m}</span>`;
    if (/^[{}()[\],.;]$/.test(m)) return `<span class="p">${m}</span>`;
    KW.lastIndex = 0;
    return KW.test(m) ? `<span class="k">${m}</span>` : m;
  });
}
function renderCode(src, streaming) {
  codeEl.innerHTML = highlight(src) + (streaming ? '<span class="caret"></span>' : '');
}

// -------------------------------------------------------------- running --

let lastRun = '';
let lastPartial = 0;
function compiles(src) { try { new Function(src); return true; } catch { return false; } }
function run(src, force) {
  if (!force && src === lastRun) return;
  lastRun = src;
  game.setDoodles(doodles);
  game.run(src);
}
function tryPartial(src) {
  const cut = src.lastIndexOf('\n');
  if (cut < 0) return;
  const prefix = src.slice(0, cut);
  const now = performance.now();
  if (now - lastPartial < 180 || prefix === lastRun) return;
  if (!compiles(prefix)) return;
  lastPartial = now;
  run(prefix);
}

// ------------------------------------------------------------ generation --

let timer = 0, ctrl = null, lastPrompt = null, current = '';
function schedule(delay) {
  clearTimeout(timer);
  const v = promptEl.value;
  timer = setTimeout(() => generate(v.trim()), delay ?? (/[\s,.!?]$/.test(v) ? 90 : 420));
}
promptEl.addEventListener('input', () => schedule());
promptEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); lastPrompt = null; schedule(0); } });

async function generate(p) {
  if (!p || p === lastPrompt) return;
  lastPrompt = p;
  if (ctrl) ctrl.abort();
  const my = ctrl = new AbortController();
  setStatus('busy', 'writing…');
  const t0 = performance.now();
  let code = '', firstAt = 0, tokens = 0;
  try {
    const res = await fetch(`${SERVER}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: p }), signal: my.signal });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, i).replace(/^data: /, '');
        buf = buf.slice(i + 2);
        if (!line) continue;
        const ev = JSON.parse(line);
        if (ev.t) {
          if (!firstAt) firstAt = performance.now();
          code += ev.t; tokens++;
          if (my === ctrl) { renderCode(code, true); tryPartial(code); }
        }
        if (ev.done && my === ctrl) {
          const ms = Math.round(performance.now() - t0);
          metaEl.textContent = ev.cached ? 'cached' : `${ev.tokens || tokens} tok · ${ms} ms`;
        }
      }
    }
    if (my !== ctrl) return;
    current = code;
    renderCode(code, false);
    if (!editEl.hidden) editEl.value = code;
    run(code, true);
    setStatus('ok', statusText);
  } catch (e) {
    if (e.name === 'AbortError') return;
    setStatus('bad', 'model offline');
    lastPrompt = null;
  }
}

// ---------------------------------------------------------------- status --

let statusText = 'ready';
function setStatus(kind, text) {
  statusEl.className = 'status ' + kind;
  statusEl.querySelector('span').textContent = text;
}
async function health() {
  try {
    const r = await fetch(`${SERVER}/health`, { cache: 'no-store' });
    const h = await r.json();
    statusText = `${Math.round(h.params / 1e6)}M · ${h.device}${h.step ? ' · step ' + h.step : ''}`;
    if (!statusEl.classList.contains('busy')) setStatus('ok', statusText);
  } catch {
    if (!statusEl.classList.contains('busy')) setStatus('bad', 'model offline');
  }
}
health();
setInterval(health, 8000);

// ---------------------------------------------------------------- buttons --

$('#editBtn').onclick = () => {
  const editing = editEl.hidden;
  editEl.hidden = !editing;
  codeEl.hidden = editing;
  $('#editBtn').classList.toggle('on', editing);
  if (editing) { editEl.value = current; editEl.focus(); } else { current = editEl.value; renderCode(current, false); }
};
let editTimer = 0;
editEl.addEventListener('input', () => {
  clearTimeout(editTimer);
  editTimer = setTimeout(() => { current = editEl.value; if (compiles(current)) run(current); }, 350);
});
$('#copyBtn').onclick = async () => {
  try { await navigator.clipboard.writeText(current); $('#copyBtn').textContent = 'copied'; setTimeout(() => ($('#copyBtn').textContent = 'copy'), 1200); } catch { /* clipboard blocked */ }
};
$('#restartBtn').onclick = () => game.restart();
$('#doodleBtn').onclick = () => {
  openDoodle($('#doodle'), {
    slots,
    code: current,
    doodles,
    onSound: (name, blob) => game.setSound(name, blob),
    onClose: (d) => { doodles = d; game.setDoodles(doodles); game.restart(); },
  });
};

// ---------------------------------------------------------------- start --

const initial = params.get('q') || 'a jumping green sphere';
promptEl.value = initial;
run(`world({ mode: '3d', sky: 'day', ground: 'grass' })\nadd('sphere', { shape: 'sphere', color: 'green' }).jump(3, 1.2)`, true);
current = lastRun;
renderCode(current, false);
schedule(0);
window.gcode = { game, generate: (p) => { promptEl.value = p; lastPrompt = null; return generate(p); } };
