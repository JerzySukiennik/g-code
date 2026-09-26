// G-Code 2D renderer: draws the core's state on a canvas. Side view projects
// (x, y); top view projects (x, z) with height shown as lift and shadow.
// Any slot with a doodle (an image or canvas) is drawn as that picture.

const SKY = {
  day: ['#7cc4fa', '#d6efff'], night: ['#0b1026', '#27305a'], sunset: ['#ff8a5c', '#ffd29d'],
  dawn: ['#9fb8ff', '#ffd6e0'], space: ['#02030a', '#0b0f2a'], storm: ['#3b4252', '#6b7385'],
  underwater: ['#0a4f7a', '#1c9ad6'], candy: ['#ffb3d9', '#c9f0ff'],
};
const GROUND = {
  grass: ['#4caf50', '#2e7d32'], sand: ['#e8cf8f', '#c9a55c'], snow: ['#f4f8ff', '#cfdcee'],
  water: ['#2f8fd8', '#1c5f9e'], lava: ['#ff5a1f', '#a3200b'], stone: ['#8d8f98', '#5d5f68'],
  ice: ['#bfe6ff', '#86c3e8'], dirt: ['#8d5a3b', '#5e3a24'],
};

export function shade(hex, k) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (k < 0) { r *= 1 + k; g *= 1 + k; b *= 1 + k; } else { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function isColor(c) { return typeof c === 'string' && (c.startsWith('#') || c.startsWith('rgb') || c.startsWith('hsl')); }

export function createRender2D(canvas) {
  const ctx = canvas.getContext('2d');
  const stars = Array.from({ length: 140 }, (_, i) => ({ x: (i * 97.3) % 1, y: (i * 57.1) % 1, s: (i % 3) + 1, p: i }));
  const drops = Array.from({ length: 160 }, (_, i) => ({ x: (i * 0.618) % 1, y: (i * 0.377) % 1, v: 0.6 + (i % 5) * 0.1 }));
  let W = 0, H = 0, dpr = 1;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
  }

  function draw(c, doodles = {}) {
    if (canvas.clientWidth !== W || canvas.clientHeight !== H) resize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const top = c.view === 'top';
    const a = c.arena();
    const band = top ? 0 : 1.4;
    const { sc, ox: ox0, oy: oy0 } = view(c);
    const shx = c.cam.shake > 0 ? (Math.random() - 0.5) * c.cam.shake * 18 : 0;
    const shy = c.cam.shake > 0 ? (Math.random() - 0.5) * c.cam.shake * 18 : 0;
    const ox = ox0 + shx, oy = oy0 + shy;
    const P = top
      ? (x, y, z) => [ox + x * sc, oy + z * sc - y * sc * 0.35]
      : (x, y) => [ox + x * sc, oy - y * sc];

    drawSky(c, top);
    if (top) drawTopGround(c, sc, ox, oy);
    else drawSideGround(c, sc, ox, oy);

    const list = c.things.filter((t) => t.alive && t.visible);
    list.sort(top ? (p, q) => (p.pos.z - q.pos.z) || (p.pos.y - q.pos.y) : (p, q) => (p.solidOn === q.solidOn ? p.pos.z - q.pos.z : p.solidOn ? -1 : 1));

    if (top) for (const t of list) {
      if (t.pos.y + t.offset.y < 0.1 || t.shape === 'plane') continue;
      const [sx, sy] = [ox + t.pos.x * sc, oy + t.pos.z * sc];
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(sx, sy + t.half(2) * sc * 0.3, t.half(0) * sc, t.half(2) * sc * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const t of list) {
      const x = t.pos.x + t.offset.x, y = t.pos.y + t.offset.y, z = t.pos.z + t.offset.z;
      const [sx, sy] = P(x, y, z);
      const w = t.dims[0] * t.scale * sc;
      const h = (top ? Math.max(t.dims[2], t.dims[1] * 0.6) : t.dims[1]) * t.scale * sc;
      ctx.save();
      ctx.translate(sx, sy);
      if (top) ctx.rotate(t.heading || 0);
      ctx.rotate(-(t.rot.z || 0));
      const flip = !top && t.facing && t.facing.x < 0 ? -1 : 1;
      ctx.scale(flip * (2 - t.squash), t.squash);
      if (!top && t.rot.y) ctx.scale(Math.cos(t.rot.y) || 0.05, 1);
      ctx.globalAlpha = t.opacity * (t.invuln > 0 && Math.floor(t.invuln * 20) % 2 ? 0.4 : 1);
      if (t.glowOn) { ctx.shadowColor = t.color; ctx.shadowBlur = 18; }
      const doodle = doodles[t.slot];
      if (doodle) ctx.drawImage(doodle, -w / 2, -h / 2, w, h);
      else drawShape(ctx, t.shape, w, h, t.flash > 0 ? '#ffffff' : t.color, t.age, top);
      ctx.restore();
      if (t.text) {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3;
        ctx.font = `600 ${Math.max(11, sc * 0.5)}px system-ui`; ctx.textAlign = 'center';
        ctx.strokeText(t.text, sx, sy - h / 2 - 6); ctx.fillText(t.text, sx, sy - h / 2 - 6);
      }
      if (t.hpMax > 1 && t.hp < t.hpMax) {
        ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(sx - w / 2, sy - h / 2 - 8, w, 4);
        ctx.fillStyle = '#30a46c'; ctx.fillRect(sx - w / 2, sy - h / 2 - 8, w * Math.max(0, t.hp / t.hpMax), 4);
      }
    }

    for (const p of c.particles) {
      const [sx, sy] = P(p.x, p.y, p.z);
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.5));
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(1.5, p.size * sc), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawWeather(c);
  }

  function drawSky(c, top) {
    const sky = c.world.sky;
    const pair = SKY[sky] || (isColor(sky) ? [sky, shade(sky, 0.35)] : SKY.day);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, pair[0]); g.addColorStop(1, pair[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (sky === 'night' || sky === 'space' || c.world.stars) {
      for (const s of stars) {
        ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(c.time * 1.3 + s.p));
        ctx.fillStyle = '#fff';
        ctx.fillRect(s.x * W, s.y * H * (sky === 'space' ? 1 : 0.7), s.s, s.s);
      }
      ctx.globalAlpha = 1;
    }
    if (!top && (sky === 'day' || sky === 'sunset' || sky === 'dawn')) {
      ctx.fillStyle = sky === 'day' ? '#fff3b0' : '#ffe8c2';
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 40;
      ctx.beginPath(); ctx.arc(W * 0.82, H * 0.18, Math.min(W, H) * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    if (!top && sky === 'night') {
      ctx.fillStyle = '#f2f0e6'; ctx.beginPath(); ctx.arc(W * 0.8, H * 0.16, Math.min(W, H) * 0.05, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = SKY.night[0]; ctx.beginPath(); ctx.arc(W * 0.8 + 12, H * 0.16 - 6, Math.min(W, H) * 0.045, 0, Math.PI * 2); ctx.fill();
    }
    if (sky === 'underwater') {
      ctx.globalAlpha = 0.12; ctx.fillStyle = '#fff';
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(W * (0.1 + i * 0.17 + Math.sin(c.time * 0.3 + i) * 0.03), 0); ctx.lineTo(W * (0.2 + i * 0.17), H); ctx.lineTo(W * (0.15 + i * 0.17), H); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
  }

  function groundColors(c) {
    const gr = c.world.ground;
    return GROUND[gr] || (isColor(gr) ? [gr, shade(gr, -0.3)] : GROUND.grass);
  }

  function drawSideGround(c, sc, ox, oy) {
    if (c.world.ground === 'none') return;
    const [a, b] = groundColors(c);
    ctx.fillStyle = b; ctx.fillRect(0, oy, W, H - oy);
    ctx.fillStyle = a; ctx.fillRect(0, oy, W, Math.max(4, sc * 0.35));
    if (c.world.ground === 'grass') {
      ctx.fillStyle = shade(a, 0.15);
      const off = ((ox % (sc * 0.8)) + sc * 0.8) % (sc * 0.8);
      for (let x = off - sc; x < W; x += sc * 0.8) ctx.fillRect(x, oy, 3, -Math.max(3, sc * 0.18));
    }
    if (c.world.ground === 'water' || c.world.ground === 'lava') {
      ctx.fillStyle = shade(a, 0.3);
      for (let x = 0; x < W; x += 24) ctx.fillRect(x + Math.sin(c.time * 2 + x) * 6, oy + 6 + (x % 3) * 8, 14, 3);
    }
  }

  function drawTopGround(c, sc, ox, oy) {
    if (c.world.ground === 'none') return;
    const [a, b] = groundColors(c);
    ctx.fillStyle = a; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = shade(a, -0.08); ctx.lineWidth = 1;
    const step = sc * 2;
    const offx = ((ox % step) + step) % step, offy = ((oy % step) + step) % step;
    ctx.beginPath();
    for (let x = offx; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = offy; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    ctx.fillStyle = b; ctx.globalAlpha = 0.25;
    for (let i = 0; i < 40; i++) ctx.fillRect(((i * 131.7 + ox) % W + W) % W, ((i * 71.3 + oy) % H + H) % H, 4, 4);
    ctx.globalAlpha = 1;
  }

  function drawWeather(c) {
    const w = c.world.weather;
    if (w !== 'rain' && w !== 'snow') return;
    ctx.fillStyle = w === 'rain' ? 'rgba(200,220,255,.6)' : 'rgba(255,255,255,.9)';
    for (const d of drops) {
      const y = ((d.y + c.time * d.v * (w === 'rain' ? 1.6 : 0.25)) % 1) * H;
      const x = ((d.x + (w === 'snow' ? Math.sin(c.time + d.y * 9) * 0.02 : c.time * 0.05)) % 1) * W;
      if (w === 'rain') ctx.fillRect(x, y, 1.5, 12);
      else { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  function view(c) {
    const top = c.view === 'top';
    const a = c.arena();
    const band = top ? 0 : 1.4;
    const f = c.frame;
    if (f) {
      const sc = Math.min(W / f.w, H / (f.h + band));
      if (top) return { sc, ox: W / 2 - f.x * sc, oy: H / 2 + f.y * sc };
      return { sc, ox: W / 2 - f.x * sc, oy: f.y0 <= 0 ? H - band * sc : H / 2 + f.y * sc };
    }
    const sc = Math.min(W / a.w, H / (a.h + band));
    return { sc, ox: W / 2 - c.cam.x * sc, oy: top ? H / 2 - (c.cam.z || 0) * sc : H - band * sc - (H - (a.h + band) * sc) / 2 };
  }

  function toPlane(c, px, py) {
    const top = c.view === 'top';
    const { sc, ox, oy } = view(c);
    return top ? { u: (px - ox) / sc, v: -(py - oy) / sc } : { u: (px - ox) / sc, v: (oy - py) / sc };
  }

  return { draw, toPlane, dispose() {} };
}

export function drawShape(ctx, shape, w, h, color, age = 0, top = false) {
  const dark = shade(color, -0.35), light = shade(color, 0.35);
  const line = Math.max(1.5, Math.min(w, h) * 0.06);
  ctx.lineWidth = line; ctx.strokeStyle = dark; ctx.lineJoin = 'round';
  const fill = (path) => { ctx.fillStyle = color; path(); ctx.fill(); ctx.stroke(); };
  const e = (x, y, rx, ry, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2); ctx.fill(); };
  const eye = (x, y, r) => { e(x, y, r, r, '#fff'); e(x + r * 0.25, y, r * 0.5, r * 0.5, '#1b1b1f'); };
  switch (shape) {
    case 'sphere': case 'rock': case 'snowball': {
      if (shape === 'rock') {
        fill(() => { ctx.beginPath(); const n = 8; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, r = 0.42 + ((i * 37) % 7) / 60; ctx.lineTo(Math.cos(a) * w * r, Math.sin(a) * h * r); } ctx.closePath(); });
        return;
      }
      const g = ctx.createRadialGradient(-w * 0.15, -h * 0.18, 1, 0, 0, Math.max(w, h) / 2);
      g.addColorStop(0, light); g.addColorStop(1, color);
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      return;
    }
    case 'cube': case 'box': case 'plane': {
      ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = light; ctx.globalAlpha *= 0.5; ctx.fillRect(-w / 2 + line, -h / 2 + line, w - line * 2, Math.min(h * 0.18, 6)); ctx.globalAlpha /= 0.5;
      return;
    }
    case 'cylinder': case 'capsule': {
      ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, shape === 'capsule' ? w / 2 : w * 0.15); ctx.fill(); ctx.stroke();
      if (shape === 'cylinder') e(0, -h / 2 + w * 0.12, w / 2 - line, w * 0.12, light);
      return;
    }
    case 'cone': case 'pyramid': fill(() => { ctx.beginPath(); ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath(); }); return;
    case 'torus': case 'coin': {
      if (shape === 'coin') {
        e(0, 0, w / 2, h / 2, dark); e(0, 0, w / 2 - line * 1.2, h / 2 - line * 1.2, color);
        ctx.fillStyle = light; ctx.fillRect(-w * 0.06, -h * 0.25, w * 0.12, h * 0.5);
        return;
      }
      ctx.lineWidth = Math.min(w, h) * 0.22; ctx.strokeStyle = color;
      ctx.beginPath(); ctx.ellipse(0, 0, w / 2 - ctx.lineWidth / 2, h / 2 - ctx.lineWidth / 2, 0, 0, Math.PI * 2); ctx.stroke();
      return;
    }
    case 'star': fill(() => { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.22 : 0.5; ctx.lineTo(Math.cos(a) * w * r, Math.sin(a) * h * r); } ctx.closePath(); }); return;
    case 'heart': fill(() => { ctx.beginPath(); ctx.moveTo(0, h * 0.4); ctx.bezierCurveTo(-w * 0.7, -h * 0.05, -w * 0.3, -h * 0.6, 0, -h * 0.2); ctx.bezierCurveTo(w * 0.3, -h * 0.6, w * 0.7, -h * 0.05, 0, h * 0.4); }); return;
    case 'diamond': fill(() => { ctx.beginPath(); ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, -h * 0.1); ctx.lineTo(0, h / 2); ctx.lineTo(-w / 2, -h * 0.1); ctx.closePath(); }); return;
    case 'tree': {
      ctx.fillStyle = '#7a4a2a'; ctx.fillRect(-w * 0.1, 0, w * 0.2, h / 2);
      if (top) { e(0, 0, w / 2, h / 2, color); e(-w * 0.12, -h * 0.12, w * 0.25, h * 0.25, light); return; }
      e(0, -h * 0.12, w / 2, h * 0.36, dark); e(0, -h * 0.16, w * 0.46, h * 0.32, color); e(-w * 0.14, -h * 0.26, w * 0.18, h * 0.12, light);
      return;
    }
    case 'house': {
      ctx.fillStyle = color; ctx.fillRect(-w * 0.4, -h * 0.05, w * 0.8, h * 0.55); ctx.strokeRect(-w * 0.4, -h * 0.05, w * 0.8, h * 0.55);
      ctx.fillStyle = '#b5332e'; ctx.beginPath(); ctx.moveTo(-w / 2, -h * 0.02); ctx.lineTo(0, -h / 2); ctx.lineTo(w / 2, -h * 0.02); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#6b3f23'; ctx.fillRect(-w * 0.08, h * 0.2, w * 0.16, h * 0.3);
      ctx.fillStyle = '#bfe6ff'; ctx.fillRect(-w * 0.32, h * 0.05, w * 0.16, h * 0.13); ctx.fillRect(w * 0.16, h * 0.05, w * 0.16, h * 0.13);
      return;
    }
    case 'rocket': {
      fill(() => { ctx.beginPath(); ctx.moveTo(0, -h / 2); ctx.quadraticCurveTo(w * 0.45, -h * 0.15, w * 0.3, h * 0.3); ctx.lineTo(-w * 0.3, h * 0.3); ctx.quadraticCurveTo(-w * 0.45, -h * 0.15, 0, -h / 2); });
      ctx.fillStyle = '#e5484d'; ctx.beginPath(); ctx.moveTo(-w * 0.3, h * 0.05); ctx.lineTo(-w / 2, h * 0.4); ctx.lineTo(-w * 0.28, h * 0.3); ctx.fill();
      ctx.beginPath(); ctx.moveTo(w * 0.3, h * 0.05); ctx.lineTo(w / 2, h * 0.4); ctx.lineTo(w * 0.28, h * 0.3); ctx.fill();
      e(0, -h * 0.08, w * 0.14, w * 0.14, '#7cc4fa');
      e(0, h * 0.4 + Math.sin(age * 40) * h * 0.03, w * 0.16, h * 0.12, '#ffb020');
      return;
    }
    case 'car': {
      if (top) { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(-w * 0.28, -h / 2, w * 0.56, h, w * 0.12); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#9fd3ff'; ctx.fillRect(-w * 0.2, -h * 0.28, w * 0.4, h * 0.16); return; }
      ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(-w / 2, -h * 0.1, w, h * 0.45, h * 0.12); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(-w * 0.28, -h / 2, w * 0.5, h * 0.45, h * 0.12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#9fd3ff'; ctx.fillRect(-w * 0.2, -h * 0.4, w * 0.16, h * 0.25); ctx.fillRect(0, -h * 0.4, w * 0.16, h * 0.25);
      for (const x of [-w * 0.3, w * 0.3]) { e(x, h * 0.35, h * 0.2, h * 0.2, '#1b1b1f'); e(x, h * 0.35, h * 0.08, h * 0.08, '#aaa'); }
      return;
    }
    case 'cloud': e(-w * 0.2, h * 0.08, w * 0.28, h * 0.32, color); e(w * 0.18, h * 0.1, w * 0.3, h * 0.3, color); e(0, -h * 0.1, w * 0.3, h * 0.4, color); return;
    case 'person': {
      const legs = Math.sin(age * 10) * w * 0.12;
      ctx.strokeStyle = dark; ctx.lineWidth = w * 0.18; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-w * 0.1, h * 0.15); ctx.lineTo(-w * 0.1 + legs, h * 0.46); ctx.moveTo(w * 0.1, h * 0.15); ctx.lineTo(w * 0.1 - legs, h * 0.46); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(-w * 0.32, -h * 0.15, w * 0.64, h * 0.38, w * 0.15); ctx.fill();
      e(0, -h * 0.3, w * 0.3, w * 0.3, '#f2c9a0'); eye(w * 0.1, -h * 0.32, w * 0.07);
      return;
    }
    case 'fish': {
      const wag = Math.sin(age * 8) * h * 0.1;
      ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-w * 0.3, 0); ctx.lineTo(-w / 2, -h * 0.35 + wag); ctx.lineTo(-w / 2, h * 0.35 + wag); ctx.fill();
      e(w * 0.05, 0, w * 0.38, h * 0.4, color); eye(w * 0.22, -h * 0.08, h * 0.1);
      return;
    }
    case 'bird': {
      const flap = Math.sin(age * 14) * h * 0.35;
      e(0, 0, w * 0.35, h * 0.3, color);
      ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-w * 0.1, 0); ctx.lineTo(-w * 0.35, -flap); ctx.lineTo(w * 0.1, 0); ctx.fill();
      ctx.fillStyle = '#f5b700'; ctx.beginPath(); ctx.moveTo(w * 0.33, -h * 0.05); ctx.lineTo(w / 2, h * 0.02); ctx.lineTo(w * 0.33, h * 0.08); ctx.fill();
      eye(w * 0.18, -h * 0.1, h * 0.09);
      return;
    }
    case 'ghost': {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-w / 2, h / 2); ctx.lineTo(-w / 2, 0); ctx.arc(0, 0, w / 2, Math.PI, 0); ctx.lineTo(w / 2, h / 2);
      for (let i = 3; i >= 0; i--) ctx.lineTo(-w / 2 + (w / 4) * i + w / 8, h / 2 - (i % 2 ? 0 : h * 0.12) + Math.sin(age * 6 + i) * 2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      e(-w * 0.15, -h * 0.05, w * 0.08, h * 0.1, '#1b1b1f'); e(w * 0.15, -h * 0.05, w * 0.08, h * 0.1, '#1b1b1f');
      return;
    }
    case 'flower': {
      ctx.strokeStyle = '#2e7d32'; ctx.lineWidth = w * 0.08; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, h / 2); ctx.stroke();
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; e(Math.cos(a) * w * 0.2, -h * 0.15 + Math.sin(a) * w * 0.2, w * 0.15, w * 0.15, color); }
      e(0, -h * 0.15, w * 0.13, w * 0.13, '#ffd60a');
      return;
    }
    case 'ufo': {
      e(0, -h * 0.1, w * 0.22, h * 0.32, '#9fe3ff'); e(0, h * 0.08, w / 2, h * 0.2, color);
      for (let i = -2; i <= 2; i++) e(i * w * 0.18, h * 0.1, w * 0.04, w * 0.04, Math.floor(age * 6 + i) % 2 ? '#ffd60a' : '#fff');
      return;
    }
    case 'bullet': e(0, 0, w / 2, h / 2, color); e(0, 0, w * 0.25, h * 0.25, '#fff'); return;
    case 'mushroom': ctx.fillStyle = '#f2e6d0'; ctx.fillRect(-w * 0.15, 0, w * 0.3, h / 2); fill(() => { ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h * 0.4, 0, Math.PI, 0); ctx.closePath(); }); e(-w * 0.2, -h * 0.15, w * 0.08, w * 0.08, '#fff'); e(w * 0.15, -h * 0.25, w * 0.06, w * 0.06, '#fff'); return;
    case 'snowman': e(0, h * 0.22, w * 0.45, h * 0.28, '#f5f5f7'); e(0, -h * 0.18, w * 0.32, h * 0.2, '#f5f5f7'); eye(-w * 0.1, -h * 0.22, w * 0.05); eye(w * 0.1, -h * 0.22, w * 0.05); ctx.fillStyle = '#f76b15'; ctx.beginPath(); ctx.moveTo(0, -h * 0.15); ctx.lineTo(w * 0.3, -h * 0.13); ctx.lineTo(0, -h * 0.1); ctx.fill(); ctx.fillStyle = color; ctx.fillRect(-w * 0.25, -h * 0.42, w * 0.5, h * 0.06); ctx.fillRect(-w * 0.16, -h / 2, w * 0.32, h * 0.1); return;
    case 'cat': case 'dog': {
      e(-w * 0.05, h * 0.1, w * 0.38, h * 0.28, color);
      e(w * 0.28, -h * 0.15, w * 0.22, h * 0.25, color);
      ctx.fillStyle = color;
      if (shape === 'cat') { ctx.beginPath(); ctx.moveTo(w * 0.14, -h * 0.28); ctx.lineTo(w * 0.18, -h / 2); ctx.lineTo(w * 0.28, -h * 0.34); ctx.moveTo(w * 0.32, -h * 0.34); ctx.lineTo(w * 0.42, -h / 2); ctx.lineTo(w * 0.45, -h * 0.26); ctx.fill(); }
      else e(w * 0.16, -h * 0.2, w * 0.08, h * 0.2, shade(color, -0.3));
      ctx.strokeStyle = color; ctx.lineWidth = w * 0.08; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-w * 0.4, h * 0.05); ctx.lineTo(-w / 2, -h * 0.25 + Math.sin(age * 8) * h * 0.05); ctx.stroke();
      eye(w * 0.34, -h * 0.18, w * 0.05);
      return;
    }
    default: e(0, 0, w / 2, h / 2, color);
  }
}
