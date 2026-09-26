// G-Code engine core: world state, things, behaviours, rules and the API that
// generated programs are written against. Renderer-agnostic — the same state
// is drawn by render2d.js or render3d.js, and runs headless under Node for
// validating synthetic training data.

const TAU = Math.PI * 2;

export const COLORS = {
  red: '#e5484d', orange: '#f76b15', yellow: '#ffd60a', gold: '#f5b700', green: '#30a46c',
  lime: '#99d52a', teal: '#12a594', cyan: '#00c2d7', blue: '#0090ff', navy: '#1c3d8f',
  purple: '#8e4ec6', violet: '#6e56cf', pink: '#e93d82', magenta: '#d6409f', brown: '#8d5a3b',
  black: '#1b1b1f', white: '#f5f5f7', gray: '#8b8d98', grey: '#8b8d98', silver: '#c4c7cf',
  beige: '#e8d9b5', skyblue: '#7cc4fa', darkgreen: '#1d6b43', maroon: '#7a1f2b', coral: '#ff7f6a',
};

export const SHAPES = ['sphere', 'cube', 'cylinder', 'cone', 'pyramid', 'torus', 'capsule', 'coin',
  'star', 'heart', 'diamond', 'tree', 'house', 'rocket', 'car', 'cloud', 'person', 'fish', 'bird',
  'ghost', 'flower', 'rock', 'box', 'plane', 'ufo', 'bullet', 'mushroom', 'snowman', 'cat', 'dog'];

const SHAPE_ALIAS = {
  ball: 'sphere', circle: 'sphere', square: 'cube', block: 'cube', triangle: 'pyramid',
  ring: 'torus', donut: 'torus', gem: 'diamond', crystal: 'diamond', man: 'person', human: 'person',
  character: 'person', spaceship: 'rocket', ship: 'rocket', platform: 'box', wall: 'box',
  laser: 'bullet', stone: 'rock', robot: 'person', zombie: 'person', alien: 'ufo', plant: 'flower',
};

export const SKIES = ['day', 'night', 'sunset', 'dawn', 'space', 'storm', 'underwater', 'candy'];
export const GROUNDS = ['grass', 'sand', 'snow', 'water', 'lava', 'stone', 'ice', 'dirt', 'none'];

const ARENA = { side: { w: 24, h: 14 }, top: { w: 24, h: 16 } };

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

export function resolveColor(c, rng) {
  if (c == null) return null;
  if (c === 'random') return Object.values(COLORS)[Math.floor(rng() * 20)];
  if (c === 'rainbow') return '#ff5ea8';
  if (typeof c === 'number') return '#' + c.toString(16).padStart(6, '0');
  return COLORS[String(c).toLowerCase().replace(/\s+/g, '')] || c;
}

export function hsl(h, s = 80, l = 55) { return `hsl(${(h % 360 + 360) % 360},${s}%,${l}%)`; }

function mulberry(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const DEFAULT_SIZE = { person: [0.9, 1.8, 0.9], tree: [2, 3.5, 2], house: [3, 3, 3], car: [2.2, 1, 1.2],
  rocket: [1, 2.6, 1], cloud: [3, 1.4, 1.6], box: [4, 0.6, 2], coin: [0.8, 0.8, 0.2], bullet: [0.35, 0.35, 0.35],
  plane: [4, 0.1, 4], ufo: [2, 0.8, 2], fish: [1.4, 0.8, 0.5], bird: [1.2, 0.8, 1], snowman: [1.2, 2.4, 1.2],
  cat: [1.2, 1, 0.6], dog: [1.4, 1.1, 0.7] };

class Thing {
  constructor(core, slot, o = {}) {
    this.core = core;
    this.slot = slot;
    this.id = core.nextId++;
    this.shape = SHAPE_ALIAS[o.shape] || o.shape || guessShape(slot);
    this.baseColor = resolveColor(o.color, core.rng) || defaultColor(slot, this.shape, core.rng);
    this.rainbowOn = o.color === 'rainbow';
    this.color = this.baseColor;
    const s = o.size ?? 1;
    const d = DEFAULT_SIZE[this.shape] || [1, 1, 1];
    this.dims = Array.isArray(s) ? [s[0], s[1] ?? s[0], s[2] ?? s[0]] : [d[0] * s, d[1] * s, d[2] * s];
    this.scale = 1;
    this.pos = { x: 0, y: this.dims[1] / 2, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.drift = { x: 0, y: 0, z: 0 };
    this.rot = { x: 0, y: 0, z: 0 };
    this.offset = { x: 0, y: 0, z: 0 };
    this.facing = { x: 1, y: 0, z: 0 };
    this.heading = 0;
    this.behaviors = [];
    this.alive = true;
    this.visible = true;
    this.phys = false;
    this.grounded = false;
    this.solidOn = false;
    this.boundedOn = false;
    this.wrapOn = false;
    this.glowOn = !!o.glow;
    this.opacity = o.opacity ?? 1;
    this.hpMax = this.hp = o.hp ?? 1;
    this.text = o.label || null;
    this.control = null;
    this.jumpH = 3.2;
    this.age = 0;
    this.spawned = false;
    this.squash = 1;
    this.invuln = 0;
    this.flash = 0;
  }

  get r() { return Math.max(this.dims[0], this.dims[1], this.dims[2]) * this.scale / 2; }
  half(i) { return this.dims[i] * this.scale / 2; }

  at(x = 0, y = 0, z) {
    const p = this.core.plane(x, y, z ?? 0, this);
    this.pos = p;
    this.home = { ...p };
    return this;
  }
  color_(c) { this.baseColor = this.color = resolveColor(c, this.core.rng); this.rainbowOn = c === 'rainbow'; return this; }
  size(s) {
    const d = DEFAULT_SIZE[this.shape] || [1, 1, 1];
    this.dims = Array.isArray(s) ? [s[0], s[1] ?? s[0], s[2] ?? s[0]] : [d[0] * s, d[1] * s, d[2] * s];
    return this;
  }
  label(text) { this.text = String(text); return this; }
  glow() { this.glowOn = true; return this; }
  hide() { this.visible = false; return this; }
  show() { this.visible = true; return this; }

  move(dir = 'right', speed = 3) {
    const v = this.core.dirVec(dir);
    this.drift.x += v.x * speed; this.drift.y += v.y * speed; this.drift.z += v.z * speed;
    if (v.x || v.z) this.facing = norm({ x: v.x, y: 0, z: v.z });
    return this;
  }
  speed(mult = 2) {
    this.drift.x *= mult; this.drift.y *= mult; this.drift.z *= mult;
    this.speedMult = (this.speedMult || 1) * mult;
    return this;
  }
  jump(height = 3, every = 1.2) {
    this.jumpH = height;
    if (this.control) return this;
    const period = Math.max(0.4, every);
    const air = Math.min(period * 0.7, Math.sqrt(8 * height / this.core.g) || 0.6);
    this.behaviors.push((t) => {
      const ph = (t.age % period);
      const k = ph < air ? Math.sin(Math.PI * ph / air) : 0;
      t.offset.y += k * height;
      t.squash = ph < air ? 1 + 0.08 * Math.cos(TAU * ph / air) : 0.9;
    });
    return this;
  }
  bounce(height = 3) {
    if (this.control) { this.jumpH = height; return this; }
    this.behaviors.push((t) => {
      const w = Math.sqrt(this.core.g / (2 * height)) * 1.6;
      const k = Math.abs(Math.sin(t.age * w));
      t.offset.y += k * height;
      t.squash = k < 0.15 ? 0.75 + k * 1.6 : 1 + 0.1 * k;
    });
    return this;
  }
  float(amount = 0.5, speed = 1) {
    const ph = this.core.rng() * TAU;
    this.behaviors.push((t) => { t.offset.y += Math.sin(t.age * 2 * speed + ph) * amount; });
    return this;
  }
  spin(speed = 1, axis = 'y') {
    this.behaviors.push((t, dt) => { t.rot[axis] += speed * TAU * dt; });
    return this;
  }
  wobble(amount = 0.25, speed = 3) {
    this.behaviors.push((t) => { t.rot.z = Math.sin(t.age * speed) * amount; });
    return this;
  }
  pulse(amount = 0.2, speed = 3) {
    this.behaviors.push((t) => { t.scale *= 1 + Math.sin(t.age * speed) * amount; });
    return this;
  }
  orbit(radius = 4, speed = 0.5, center) {
    const c = this.core;
    const ph = c.rng() * TAU;
    this.behaviors.push((t) => {
      const target = typeof center === 'string' ? c.nearest(center, t) : center;
      const o = target ? target.pos : (t.home || t.pos);
      const a = t.age * speed * TAU + ph;
      if (c.view === 'top') { t.pos.x = o.x + Math.cos(a) * radius; t.pos.z = o.z + Math.sin(a) * radius; }
      else { t.pos.x = o.x + Math.cos(a) * radius; t.pos.y = (target ? o.y : (t.home || t.pos).y) + Math.sin(a) * radius; }
    });
    if (!this.home) this.home = { ...this.pos, y: this.core.view === 'top' ? this.pos.y : Math.max(this.pos.y, radius + 1) };
    return this;
  }
  wander(speed = 2) {
    let tgt = null, tt = 0;
    this.boundedOn = true;
    this.behaviors.push((t, dt) => {
      tt -= dt;
      if (tt <= 0 || !tgt) { tgt = this.core.randomPoint(t); tt = 1 + this.core.rng() * 2; }
      steer(t, tgt, speed, dt, this.core);
    });
    return this;
  }
  follow(target = 'player', speed = 2) {
    this.behaviors.push((t, dt) => {
      const o = typeof target === 'string' ? this.core.nearest(target, t) : target;
      if (o && o.alive) steer(t, o.pos, speed, dt, this.core);
    });
    return this;
  }
  flee(target = 'player', speed = 3) {
    this.boundedOn = true;
    this.behaviors.push((t, dt) => {
      const o = this.core.nearest(target, t);
      if (!o) return;
      const away = { x: t.pos.x * 2 - o.pos.x, y: t.pos.y * 2 - o.pos.y, z: t.pos.z * 2 - o.pos.z };
      if (dist(t.pos, o.pos) < 6) steer(t, away, speed, dt, this.core);
    });
    return this;
  }
  patrol(distance = 4, speed = 2) {
    const ph = this.core.rng() * TAU;
    this.behaviors.push((t) => {
      const h = t.home || t.pos;
      const x = h.x + Math.sin(t.age * speed / Math.max(distance, 0.1) + ph) * distance;
      t.facing = { x: Math.sign(x - t.pos.x) || t.facing.x, y: 0, z: 0 };
      t.pos.x = x;
    });
    if (!this.home) this.home = { ...this.pos };
    return this;
  }
  grow(rate = 0.3, max = 3) {
    this.behaviors.push((t, dt) => { t.growK = Math.min(max, (t.growK || 1) + rate * dt); t.scale *= t.growK; });
    return this;
  }
  shrink(rate = 0.3, min = 0) {
    this.behaviors.push((t, dt) => {
      t.growK = (t.growK || 1) - rate * dt;
      if (t.growK <= min) { if (min <= 0) t.remove(); t.growK = Math.max(min, 0.01); }
      t.scale *= t.growK;
    });
    return this;
  }
  rainbow(speed = 1) {
    this.rainbowOn = true;
    this.rainbowSpeed = speed;
    return this;
  }
  blink(rate = 2) {
    this.behaviors.push((t) => { t.visible = Math.floor(t.age * rate * 2) % 2 === 0; });
    return this;
  }
  fade(seconds = 2) {
    this.behaviors.push((t) => { t.opacity = Math.max(0, 1 - t.age / seconds); if (t.age > seconds) t.remove(); });
    return this;
  }
  trail(color) {
    this.trailColor = resolveColor(color, this.core.rng) || this.color;
    return this;
  }
  ricochet(speed = 8) {
    const c = this.core;
    const a0 = (c.rng() < 0.5 ? -1 : 1) * (0.5 + c.rng() * 0.5);
    this.ricochetOn = true;
    if (c.view === 'top') this.drift = { x: Math.cos(a0) * speed, y: 0, z: -Math.sin(Math.abs(a0)) * speed };
    else this.drift = { x: Math.sin(a0) * speed * 0.7, y: speed * 0.7, z: 0 };
    this.ricoSpeed = speed;
    return this;
  }
  fall(gravity = 1) {
    this.phys = true;
    this.gMult = gravity;
    return this;
  }
  gravity(on = true) { this.phys = !!on; return this; }
  solid() { this.solidOn = true; return this; }
  bounded() { this.boundedOn = true; return this; }
  wrap() { this.wrapOn = true; return this; }
  hp_(n = 3) { this.hp = this.hpMax = n; return this; }
  face(target = 'player') {
    this.behaviors.push((t) => {
      const o = this.core.nearest(target, t);
      if (!o) return;
      if (this.core.view === 'top') t.heading = Math.atan2(o.pos.x - t.pos.x, -(o.pos.z - t.pos.z));
      else t.facing = { x: Math.sign(o.pos.x - t.pos.x) || 1, y: 0, z: 0 };
    });
    return this;
  }
  controls(style = 'arrows', speed = 6) {
    const c = this.core;
    this.control = { style, speed };
    this.boundedOn = true;
    this.isPlayer = true;
    if (style === 'platformer' || style === 'runner' || style === 'flappy') this.phys = true;
    if (style === 'car') this.heading = 0;
    c.hasPlayer = true;
    return this;
  }
  shoot(slot = 'bullet', o = {}) {
    if (typeof o === 'number') o = { every: o };
    const c = this.core;
    const every = o.every ?? 0;
    if (!c.slots.has(slot)) c.register(slot, new Thing(c, slot, { shape: o.shape || 'bullet', color: o.color || (this.control ? 'yellow' : 'red'), size: o.size ?? 1 }), 'bullet');
    const cooldown = o.cooldown ?? (every > 0 ? every : 0.22);
    let tt = every > 0 ? c.rng() * every : 0;
    this.behaviors.push((t, dt) => {
      tt -= dt;
      const trigger = every > 0 ? tt <= 0 : c.input.down(o.key || 'space') || (o.key === 'click' && c.input.pointer.down);
      if (!trigger || tt > 0) return;
      tt = cooldown;
      c.fire(t, slot, o);
    });
    return this;
  }
  hurt(n = 1) {
    if (this.invuln > 0) return this;
    this.hp -= n;
    this.flash = 0.25;
    this.invuln = 0.5;
    if (this.hp <= 0) this.explode();
    return this;
  }
  heal(n = 1) { this.hp = Math.min(this.hpMax, this.hp + n); return this; }
  push(dir = 'up', force = 6) {
    const v = this.core.dirVec(dir);
    this.vel.x += v.x * force; this.vel.y += v.y * force; this.vel.z += v.z * force;
    return this;
  }
  launch(force = 8) { this.vel.y = force; this.grounded = false; this.phys = true; return this; }
  explode(color) {
    this.core.burst(this, color || this.color, 24);
    this.core.sound('explode');
    this.remove();
    return this;
  }
  pop(color) {
    this.core.burst(this, color || this.color, 10);
    this.core.sound('pop');
    this.remove();
    return this;
  }
  remove() { this.alive = false; return this; }
  destroy() { return this.remove(); }
  distance(other) {
    const o = typeof other === 'string' ? this.core.nearest(other, this) : other;
    return o ? dist(this.pos, o.pos) : Infinity;
  }
}

const methodAlias = { color: 'color_', hp: 'hp_' };

function norm(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }

function steer(t, p, speed, dt, c) {
  const d = { x: p.x - t.pos.x, y: c.view === 'top' || t.phys ? 0 : p.y - t.pos.y, z: c.view === 'top' ? p.z - t.pos.z : 0 };
  const l = Math.hypot(d.x, d.y, d.z);
  if (l < 0.05) return;
  const k = Math.min(l, speed * dt) / l;
  t.pos.x += d.x * k; t.pos.y += d.y * k; t.pos.z += d.z * k;
  if (Math.abs(d.x) > 0.01 || Math.abs(d.z) > 0.01) t.facing = norm({ x: d.x, y: 0, z: d.z });
  if (c.view === 'top') t.heading = Math.atan2(d.x, -d.z);
}

function guessShape(slot) {
  const s = String(slot).toLowerCase();
  for (const k of SHAPES) if (s.includes(k)) return k;
  for (const [k, v] of Object.entries(SHAPE_ALIAS)) if (s.includes(k)) return v;
  if (/enemy|monster|meteor|asteroid|obstacle/.test(s)) return /meteor|asteroid/.test(s) ? 'rock' : 'cube';
  if (/player|hero/.test(s)) return 'sphere';
  return 'sphere';
}

function defaultColor(slot, shape, rng) {
  const s = String(slot).toLowerCase();
  if (/coin|gold|star/.test(s) || shape === 'coin' || shape === 'star') return COLORS.gold;
  if (/enemy|monster|lava|fire/.test(s)) return COLORS.red;
  if (/player|hero/.test(s)) return COLORS.blue;
  if (/tree|grass|plant/.test(s) || shape === 'tree') return COLORS.green;
  if (/rock|stone|wall|meteor|asteroid/.test(s) || shape === 'rock') return COLORS.gray;
  if (/cloud|snow|ghost/.test(s) || shape === 'cloud' || shape === 'ghost') return COLORS.white;
  if (/bullet|laser/.test(s)) return COLORS.yellow;
  if (/platform|box|ground/.test(s)) return COLORS.brown;
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return Object.values(COLORS)[h % 12];
}

class Group {
  constructor(core, slot) {
    this.core = core;
    this.slot = slot;
    this.members = [];
    this.calls = [];
  }
  _apply(t) { for (const [m, a] of this.calls) callMethod(t, m, a); return t; }
  get alive() { return this.members.some((m) => m.alive); }
  get count() { return this.members.filter((m) => m.alive).length; }
  forEach(fn) { this.members.filter((m) => m.alive).forEach(fn); return this; }
}

function callMethod(t, m, a) {
  const name = methodAlias[m] || m;
  const fn = t[name];
  if (typeof fn === 'function') return fn.apply(t, a);
  t.core.warn(`unknown method .${m}()`);
  return t;
}

const THING_METHODS = Object.getOwnPropertyNames(Thing.prototype)
  .filter((n) => n !== 'constructor' && n !== 'half' && typeof Object.getOwnPropertyDescriptor(Thing.prototype, n).value === 'function')
  .map((n) => n.replace(/_$/, ''));

for (const m of THING_METHODS) {
  Group.prototype[m] = function (...a) {
    this.calls.push([m, a]);
    for (const t of this.members) if (t.alive) callMethod(t, m, a);
    return this;
  };
}

function chainable(target, core) {
  return new Proxy(target, {
    get(obj, prop) {
      if (prop === 'color' && obj instanceof Thing) return (...a) => (obj.color_(...a), proxy(obj));
      if (prop === 'hp' && obj instanceof Thing) return (...a) => (a.length ? (obj.hp_(...a), proxy(obj)) : obj.hp);
      const v = obj[prop];
      if (typeof v === 'function') return (...a) => { const r = v.apply(obj, a); return r === obj ? proxy(obj) : r; };
      if (v === undefined && typeof prop === 'string' && !prop.startsWith('_') && prop !== 'then' && prop !== 'toJSON') {
        return (..._a) => { core.warn(`unknown method .${prop}()`); return proxy(obj); };
      }
      return v;
    },
  });
  function proxy(o) { return o.__proxy || (o.__proxy = chainable(o, core)); }
}

function wrap(o, core) { return o.__proxy || (o.__proxy = chainable(o, core)); }

export function createCore({ seed = 1, headless = false } = {}) {
  const c = {
    rng: mulberry(seed),
    nextId: 1,
    things: [],
    groups: new Map(),
    spawners: [],
    rules: [],
    timers: [],
    keyHandlers: [],
    clickHandlers: [],
    tapHandlers: [],
    outHandlers: [],
    particles: [],
    messages: [],
    warnings: [],
    sounds: [],
    slots: new Map(),
    contacts: new Set(),
    time: 0,
    state: 'play',
    endText: '',
    hud: { score: null, lives: null, timer: null, goal: null, title: null, best: 0 },
    world: { mode: '2d', sky: 'day', ground: 'grass', gravity: 1, camera: 'auto', weather: 'none', fog: false, music: null, view: 'side', light: 'day' },
    view: 'side',
    g: 20,
    cam: { x: 0, y: 7, z: 0, shake: 0, target: null },
    hasPlayer: false,
    headless,
  };

  const keyState = new Set();
  const pressed = new Set();
  c.input = {
    keys: keyState,
    pressed,
    pointer: { u: 0, v: 0, down: false, clicked: false },
    down(k) {
      const ks = this.keys;
      if (k === 'space') return ks.has(' ') || ks.has('space');
      if (k === 'left') return ks.has('arrowleft') || ks.has('a');
      if (k === 'right') return ks.has('arrowright') || ks.has('d');
      if (k === 'up') return ks.has('arrowup') || ks.has('w');
      if (k === 'down') return ks.has('arrowdown') || ks.has('s');
      if (k === 'click') return this.pointer.down;
      return ks.has(String(k).toLowerCase());
    },
    hit(k) {
      const ps = this.pressed;
      if (k === 'space') return ps.has(' ') || ps.has('space');
      if (k === 'up') return ps.has('arrowup') || ps.has('w');
      if (k === 'click') return this.pointer.clicked;
      return ps.has(String(k).toLowerCase());
    },
  };

  c.warn = (m) => { if (!c.warnings.includes(m)) c.warnings.push(m); };

  c.arena = () => ARENA[c.view];

  c.plane = (u, v, h = 0, t) => {
    const lift = t ? t.dims[1] / 2 : 0.5;
    if (c.view === 'top') return { x: u, y: lift + h, z: -v };
    return { x: u, y: Math.max(v, lift), z: h };
  };

  c.dirVec = (d) => {
    if (typeof d === 'object' && d) return norm({ x: d.x || 0, y: d.y || 0, z: d.z || 0 });
    const top = c.view === 'top';
    switch (d) {
      case 'left': return { x: -1, y: 0, z: 0 };
      case 'right': return { x: 1, y: 0, z: 0 };
      case 'up': return top ? { x: 0, y: 0, z: -1 } : { x: 0, y: 1, z: 0 };
      case 'down': return top ? { x: 0, y: 0, z: 1 } : { x: 0, y: -1, z: 0 };
      case 'forward': return { x: 0, y: 0, z: -1 };
      case 'back': case 'backward': return { x: 0, y: 0, z: 1 };
      case 'random': {
        const a = c.rng() * TAU;
        return top ? { x: Math.cos(a), y: 0, z: Math.sin(a) } : { x: Math.cos(a), y: Math.sin(a), z: 0 };
      }
      default: return { x: 1, y: 0, z: 0 };
    }
  };

  c.randomPoint = (t) => {
    const a = c.arena();
    const u = (c.rng() - 0.5) * (a.w - 2) + c.cam.x;
    if (c.view === 'top') return { x: u, y: t ? t.pos.y : 0.5, z: (c.rng() - 0.5) * (a.h - 2) };
    return { x: u, y: t && t.phys ? t.pos.y : 1 + c.rng() * (a.h - 3), z: 0 };
  };

  c.nearest = (slot, from) => {
    let best = null, bd = Infinity;
    for (const t of c.things) {
      if (!t.alive || t === from || t.slot !== slot) continue;
      const d = from ? dist(t.pos, from.pos) : 0;
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  };

  c.register = (slot, t, kind) => {
    if (!c.slots.has(slot)) c.slots.set(slot, { slot, shape: t.shape, color: t.baseColor, kind, dims: t.dims });
  };

  c.makeThing = (slot, o = {}) => {
    const t = new Thing(c, slot, o);
    if (o.x != null || o.y != null || o.z != null) t.at(o.x ?? 0, o.y ?? (c.view === 'top' ? 0 : t.dims[1] / 2), o.z);
    else t.at(0, c.view === 'top' ? 0 : t.dims[1] / 2);
    t.pos.y = Math.max(t.pos.y, t.dims[1] / 2);
    for (const k of ['move', 'spin', 'float', 'bounce', 'jump', 'wander', 'orbit', 'pulse', 'rainbow', 'glow', 'trail']) {
      if (o[k] !== undefined && o[k] !== false && typeof t[k] === 'function') {
        const a = o[k] === true ? [] : Array.isArray(o[k]) ? o[k] : [o[k]];
        t[k](...a);
      }
    }
    c.things.push(t);
    return t;
  };

  c.fire = (from, slot, o = {}) => {
    const b = new Thing(c, slot, { shape: o.shape || 'bullet', color: o.color || (from.isPlayer ? 'yellow' : 'red'), size: o.size ?? 1, glow: true });
    let dir;
    if (o.at || o.dir === 'player' || o.dir === 'at') {
      const tgt = c.nearest(o.at || 'player', from);
      dir = tgt ? norm({ x: tgt.pos.x - from.pos.x, y: c.view === 'top' ? 0 : tgt.pos.y - from.pos.y, z: tgt.pos.z - from.pos.z }) : c.dirVec('down');
    } else if (o.dir) dir = c.dirVec(o.dir);
    else if (from.control && (from.control.style === 'car' || from.control.style === 'topdown')) {
      dir = c.view === 'top' ? { x: Math.sin(from.heading), y: 0, z: -Math.cos(from.heading) } : { ...from.facing };
    } else if (from.control && (from.control.style === 'platformer' || from.control.style === 'runner')) dir = { x: from.facing.x || 1, y: 0, z: 0 };
    else if (from.isPlayer) dir = c.dirVec('up');
    else dir = c.dirVec('down');
    const sp = o.speed ?? 12;
    b.pos = { x: from.pos.x + dir.x * from.r, y: from.pos.y + dir.y * from.r, z: from.pos.z + dir.z * from.r };
    b.drift = { x: dir.x * sp, y: dir.y * sp, z: dir.z * sp };
    b.spawned = true;
    b.shooter = from;
    b.life = o.life ?? 3;
    c.register(slot, b, 'bullet');
    c.things.push(b);
    c.sound(o.sound || 'shoot');
    return b;
  };

  c.burst = (at, color = '#ffd60a', n = 16) => {
    const p = at.pos || at;
    const col = resolveColor(color, c.rng);
    for (let i = 0; i < n; i++) {
      const a = c.rng() * TAU, e = c.rng() * Math.PI - Math.PI / 2, s = 2 + c.rng() * 6;
      c.particles.push({ x: p.x, y: p.y, z: p.z || 0, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + 3,
        vz: c.view === 'top' ? Math.sin(a) * s : Math.sin(a) * Math.cos(e) * s * 0.3, life: 0.6 + c.rng() * 0.6, max: 1.2, color: col, size: 0.12 + c.rng() * 0.18 });
    }
    if (c.particles.length > 1500) c.particles.splice(0, c.particles.length - 1500);
  };

  c.sound = (name) => { c.sounds.push(name); };

  // ---------------------------------------------------------------- API --

  const api = {};

  api.world = (o = {}) => {
    Object.assign(c.world, o);
    if (o.mode) c.world.mode = String(o.mode).toLowerCase() === '3d' ? '3d' : '2d';
    const view = o.view || (o.camera === 'top' ? 'top' : 'side');
    c.view = c.world.view = view === 'top' ? 'top' : 'side';
    c.g = 20 * (o.gravity ?? 1);
    if (o.title) c.hud.title = o.title;
    if (c.view === 'top') c.cam.y = 0;
  };

  api.add = (slot = 'thing', o = {}) => {
    if (typeof slot === 'object') { o = slot; slot = o.slot || o.shape || 'thing'; }
    const count = o.count ?? 1;
    if (count <= 1 && !o.group) {
      const t = c.makeThing(slot, o);
      c.register(slot, t, 'thing');
      return wrap(t, c);
    }
    const g = new Group(c, slot);
    const a = c.arena();
    for (let i = 0; i < count; i++) {
      let u, v;
      if (o.row) { u = (i - (count - 1) / 2) * (o.gap ?? 2) + (o.x ?? 0); v = o.y ?? (c.view === 'top' ? 0 : 2); }
      else if (o.grid) {
        const cols = o.grid === true ? Math.ceil(Math.sqrt(count)) : o.grid;
        u = ((i % cols) - (cols - 1) / 2) * (o.gap ?? 2) + (o.x ?? 0);
        v = (o.y ?? (c.view === 'top' ? 0 : a.h - 3)) - Math.floor(i / cols) * (o.gap ?? 1.5);
      } else if (o.circle) {
        const ang = i / count * TAU, rad = o.radius ?? 5;
        u = (o.x ?? 0) + Math.cos(ang) * rad; v = (o.y ?? (c.view === 'top' ? 0 : 6)) + Math.sin(ang) * rad;
      } else {
        const sp = o.spread ?? 1;
        u = (c.rng() - 0.5) * (a.w - 2) * sp + (o.x ?? 0);
        v = c.view === 'top' ? (c.rng() - 0.5) * (a.h - 2) * sp + (o.y ?? 0) : (o.y ?? 1 + c.rng() * (a.h - 4) * sp);
      }
      const t = c.makeThing(slot, { ...o, x: u, y: v });
      if (o.onGround && c.view === 'side') t.pos.y = t.dims[1] / 2;
      t.home = { ...t.pos };
      g.members.push(t);
      c.register(slot, t, 'thing');
    }
    return wrap(g, c);
  };

  api.scatter = (slot, o = {}) => api.add(slot, { count: 10, onGround: true, ...o });

  api.spawn = (slot = 'enemy', o = {}) => {
    const g = new Group(c, slot);
    const sp = { group: g, slot, o, every: o.every ?? 1.5, t: o.delay ?? 0.3, max: o.max ?? 40, from: o.from || (c.view === 'top' ? 'around' : 'top') };
    c.spawners.push(sp);
    const probe = new Thing(c, slot, o);
    c.register(slot, probe, 'spawn');
    return wrap(g, c);
  };

  function doSpawn(sp) {
    const o = sp.o;
    const alive = sp.group.members.filter((m) => m.alive);
    sp.group.members = alive;
    if (alive.length >= sp.max) return;
    const t = new Thing(c, sp.slot, o);
    const a = c.arena();
    const cx = c.cam.x, cz = c.view === 'top' ? c.cam.z : 0;
    const top = c.view === 'top';
    const from = sp.from === 'random' ? ['top', 'left', 'right'][Math.floor(c.rng() * 3)] : sp.from;
    const ru = () => (c.rng() - 0.5) * (a.w - 2) + cx;
    const rv = () => top ? (c.rng() - 0.5) * (a.h - 2) : 1 + c.rng() * (a.h - 4);
    let u, v;
    switch (from) {
      case 'top': u = ru(); v = top ? a.h / 2 + 1 - cz : a.h + 1; break;
      case 'bottom': u = ru(); v = top ? -a.h / 2 - 1 - cz : -1; break;
      case 'left': u = cx - a.w / 2 - 1; v = o.low ? t.dims[1] / 2 : rv(); break;
      case 'right': case 'ahead': u = cx + a.w / 2 + 1; v = o.low || o.onGround ? t.dims[1] / 2 : rv(); break;
      case 'around': {
        const ang = c.rng() * TAU, rad = Math.max(a.w, a.h) / 2 + 1;
        u = cx + Math.cos(ang) * rad; v = (top ? -cz : a.h / 2) + Math.sin(ang) * rad * (top ? 0.7 : 0.5);
        break;
      }
      case 'inside': default: u = ru(); v = top ? rv() : 1 + c.rng() * (a.h - 4);
    }
    t.at(u, v);
    if (o.onGround && !top) t.pos.y = t.dims[1] / 2;
    t.pos.y = Math.max(t.pos.y, top ? t.pos.y : -2);
    t.spawned = true;
    t.home = { ...t.pos };
    c.things.push(t);
    sp.group.members.push(t);
    sp.group._apply(t);
    if (o.move !== undefined) { const m = Array.isArray(o.move) ? o.move : [o.move]; t.move(...m); }
  }

  api.hit = (a, b, fn) => { c.rules.push({ a, b, fn: typeof fn === 'function' ? fn : ruleFromString(fn) }); };
  api.onHit = api.hit;
  api.every = (sec, fn) => { c.timers.push({ every: Math.max(0.05, sec), t: sec, fn }); };
  api.after = (sec, fn) => { c.timers.push({ every: 0, t: sec, fn }); };
  api.key = (k, fn) => { c.keyHandlers.push({ k: String(k).toLowerCase(), fn }); };
  api.click = (fn) => { c.clickHandlers.push(fn); };
  api.tap = (slot, fn) => { c.tapHandlers.push({ slot, fn }); };
  api.out = (slot, fn) => { c.outHandlers.push({ slot, fn }); };

  api.score = (n) => {
    if (c.hud.score == null) c.hud.score = 0;
    if (typeof n === 'number') c.hud.score += n;
    if (c.hud.goal != null && c.hud.score >= c.hud.goal) api.win();
    return c.hud.score;
  };
  api.lives = (n = 3) => { c.hud.lives = n; return c.hud.lives; };
  api.hurt = (n = 1) => {
    if (c.hurtCool > 0) return;
    c.hurtCool = 1;
    c.cam.shake = Math.max(c.cam.shake, 0.4);
    c.sound('hit');
    const p = c.things.find((t) => t.isPlayer && t.alive);
    if (p) p.flash = 0.6;
    if (c.hud.lives == null) { api.lose(); return; }
    c.hud.lives -= n;
    if (c.hud.lives <= 0) api.lose();
  };
  api.heal = (n = 1) => { if (c.hud.lives != null) c.hud.lives += n; };
  api.timer = (sec = 30, end = 'lose') => { c.hud.timer = sec; c.timerEnd = end; };
  api.goal = (n = 10) => { c.hud.goal = typeof n === 'object' ? n.score : n; if (c.hud.score == null) c.hud.score = 0; };
  api.title = (t) => { c.hud.title = String(t); };
  api.say = (text, sec = 2.5) => { c.messages.push({ text: String(text), t: sec }); };
  api.win = (text = 'You win!') => { if (c.state === 'play') { c.state = 'win'; c.endText = text; c.sound('win'); } };
  api.lose = (text = 'Game over') => { if (c.state === 'play') { c.state = 'lose'; c.endText = text; c.sound('lose'); } };
  api.sound = (name) => c.sound(name);
  api.music = (style = 'happy') => { c.world.music = style; };
  api.shake = (a = 0.5) => { c.cam.shake = Math.max(c.cam.shake, a); };
  api.burst = (at, color, n) => c.burst(at && at.pos ? at : at || { x: 0, y: 5, z: 0 }, color, n);
  api.random = (a = 0, b = 1) => a + c.rng() * (b - a);
  api.pick = (...xs) => { const arr = xs.length === 1 && Array.isArray(xs[0]) ? xs[0] : xs; return arr[Math.floor(c.rng() * arr.length)]; };
  api.find = (slot) => { const t = c.nearest(slot, null); return t ? wrap(t, c) : null; };
  api.all = (slot) => c.things.filter((t) => t.alive && t.slot === slot).map((t) => wrap(t, c));
  api.count = (slot) => c.things.filter((t) => t.alive && t.slot === slot).length;
  api.camera = (mode = 'follow', target = 'player') => { c.world.camera = mode; c.cam.target = target; };
  api.platforms = (n = 6, o = {}) => {
    const a = c.arena();
    const g = new Group(c, o.slot || 'platform');
    let x = -a.w / 2 + 3, y = 2.5;
    for (let i = 0; i < n; i++) {
      const w = o.width ?? 3 + c.rng() * 2;
      const t = c.makeThing(o.slot || 'platform', { shape: 'box', color: o.color || 'brown', size: [w, 0.6, 2], x, y });
      t.solidOn = true;
      t.home = { ...t.pos };
      g.members.push(t);
      c.register(o.slot || 'platform', t, 'thing');
      x += (a.w - 6) / Math.max(1, n - 1);
      y = clamp(y + (c.rng() < 0.5 ? -1 : 1) * (1 + c.rng() * 1.8), 2, a.h - 4);
    }
    return g;
  };
  api.walls = (o = {}) => {
    const a = c.arena();
    const col = o.color || 'gray';
    const mk = (x, y, w, h) => { const t = c.makeThing('wall', { shape: 'box', color: col, size: [w, c.view === 'top' ? 1.5 : h, c.view === 'top' ? h : 2], x, y }); t.solidOn = true; c.register('wall', t, 'thing'); };
    if (c.view === 'top') { mk(0, a.h / 2, a.w, 0.6); mk(0, -a.h / 2, a.w, 0.6); mk(-a.w / 2, 0, 0.6, a.h); mk(a.w / 2, 0, 0.6, a.h); }
    else { mk(-a.w / 2, a.h / 2, 0.6, a.h); mk(a.w / 2, a.h / 2, 0.6, a.h); }
  };
  api.maze = (o = {}) => {
    const a = c.arena();
    const cols = 9, rows = 6, cw = a.w / cols, ch = a.h / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if ((i + j) % 2 === 0 || c.rng() < 0.55) continue;
      const u = -a.w / 2 + cw * (i + 0.5), v = (c.view === 'top' ? -a.h / 2 : 0) + ch * (j + 0.5);
      if (Math.abs(u) < cw && Math.abs(v - (c.view === 'top' ? 0 : a.h / 2)) < ch) continue;
      const t = c.makeThing('wall', { shape: 'box', color: o.color || 'gray', size: [cw * 0.9, c.view === 'top' ? 1.5 : ch * 0.9, c.view === 'top' ? ch * 0.9 : 2], x: u, y: v });
      t.solidOn = true; c.register('wall', t, 'thing');
    }
  };
  api.log = (...a) => c.warn(a.join(' '));

  function ruleFromString(s) {
    return (A, B) => {
      for (const part of String(s || '').split(/[,;]\s*/)) {
        const [cmd, arg] = part.split(':');
        if (cmd === 'lose') api.lose(); else if (cmd === 'win') api.win();
        else if (cmd === 'score') api.score(Number(arg) || 1);
        else if (cmd === 'remove' || cmd === 'destroy') B.remove();
        else if (cmd === 'explode') B.explode();
        else if (cmd === 'hurt') api.hurt();
        else if (cmd === 'sound') api.sound(arg || 'pop');
      }
    };
  }

  c.api = api;

  // --------------------------------------------------------------- step --

  function applyControls(t, dt) {
    const k = c.input, s = t.control.speed * (t.speedMult || 1);
    const L = k.down('left'), R = k.down('right'), U = k.down('up'), D = k.down('down');
    const jumpKey = k.hit('space') || k.hit('up') || k.hit('click') || k.pointer.clicked;
    const style = t.control.style;
    const top = c.view === 'top';
    if (style === 'platformer') {
      t.pos.x += ((R ? 1 : 0) - (L ? 1 : 0)) * s * dt;
      if (L !== R) t.facing = { x: R ? 1 : -1, y: 0, z: 0 };
      if (jumpKey && (t.grounded || t.coyote > 0)) { t.vel.y = Math.sqrt(2 * c.g * t.jumpH); t.grounded = false; t.coyote = 0; c.sound('jump'); }
      if (top) t.pos.z += ((D ? 1 : 0) - (U ? 1 : 0)) * s * dt;
    } else if (style === 'runner') {
      if (jumpKey && t.grounded) { t.vel.y = Math.sqrt(2 * c.g * t.jumpH); t.grounded = false; c.sound('jump'); }
      if (k.down('down') && !t.grounded) t.vel.y -= c.g * dt * 2;
    } else if (style === 'flappy') {
      if (jumpKey) { t.vel.y = Math.sqrt(2 * c.g * Math.max(1.2, t.jumpH * 0.6)); c.sound('jump'); }
      t.rot.z = clamp(t.vel.y * 0.06, -0.8, 0.5);
    } else if (style === 'car') {
      const turn = ((L ? 1 : 0) - (R ? 1 : 0)) * 2.6 * dt;
      t.carV = lerp(t.carV || 0, ((U ? 1 : 0) - (D ? 0.6 : 0)) * s * 1.3, 1 - Math.exp(-2.5 * dt));
      if (top) {
        t.heading -= turn * Math.sign(t.carV || 1);
        t.pos.x += Math.sin(t.heading) * t.carV * dt;
        t.pos.z -= Math.cos(t.heading) * t.carV * dt;
      } else {
        t.pos.x += t.carV * dt;
        t.facing = { x: 1, y: 0, z: 0 };
      }
    } else if (style === 'mouse') {
      const p = c.plane(k.pointer.u, k.pointer.v, 0, t);
      steer(t, p, s * 2.5, dt, c);
    } else if (style === 'paddle') {
      t.pos.x += ((R ? 1 : 0) - (L ? 1 : 0)) * s * 1.4 * dt;
    } else {
      const dx = (R ? 1 : 0) - (L ? 1 : 0), dv = (U ? 1 : 0) - (D ? 1 : 0);
      if (top) { t.pos.x += dx * s * dt; t.pos.z -= dv * s * dt; }
      else if (t.phys) { t.pos.x += dx * s * dt; if (jumpKey && t.grounded) { t.vel.y = Math.sqrt(2 * c.g * t.jumpH); c.sound('jump'); } }
      else { t.pos.x += dx * s * dt; t.pos.y += dv * s * dt; }
      if (dx || dv) {
        t.facing = norm({ x: dx, y: 0, z: top ? -dv : 0 });
        if (top) t.heading = Math.atan2(dx, dv);
      }
    }
  }

  function overlap(a, b) {
    const k = 0.82;
    return Math.abs(a.pos.x + a.offset.x - b.pos.x - b.offset.x) < (a.half(0) + b.half(0)) * k &&
      Math.abs(a.pos.y + a.offset.y - b.pos.y - b.offset.y) < (a.half(1) + b.half(1)) * k &&
      Math.abs(a.pos.z + a.offset.z - b.pos.z - b.offset.z) < (a.half(2) + b.half(2)) * k;
  }

  function resolveSolid(t, s, prevY) {
    const hx = t.half(0) + s.half(0), hy = t.half(1) + s.half(1), hz = t.half(2) + s.half(2);
    const dx = t.pos.x - s.pos.x, dy = t.pos.y - s.pos.y, dz = t.pos.z - s.pos.z;
    if (Math.abs(dx) >= hx || Math.abs(dy) >= hy || Math.abs(dz) >= hz) return;
    const top = s.pos.y + s.half(1);
    if (prevY - t.half(1) >= top - 0.25 && t.vel.y <= 0) {
      t.pos.y = top + t.half(1);
      t.vel.y = 0;
      t.grounded = true;
      t.pos.x += (s.pos.x - (s.prevX ?? s.pos.x));
      return;
    }
    const ox = hx - Math.abs(dx), oy = hy - Math.abs(dy), oz = hz - Math.abs(dz);
    if (c.view === 'top' ? ox < oz : ox < oy) t.pos.x += Math.sign(dx || 1) * ox;
    else if (c.view === 'top') t.pos.z += Math.sign(dz || 1) * oz;
    else { t.pos.y += Math.sign(dy || 1) * oy; if (dy < 0) t.vel.y = Math.min(0, t.vel.y); }
  }

  c.step = (dt) => {
    dt = Math.min(dt, 1 / 20);
    if (c.state !== 'play') {
      c.input.pressed.clear(); c.input.pointer.clicked = false;
      stepParticles(dt);
      return;
    }
    c.time += dt;
    c.hurtCool = Math.max(0, (c.hurtCool || 0) - dt);
    const a = c.arena();

    for (const sp of c.spawners) {
      sp.t -= dt;
      if (sp.t <= 0) {
        sp.t = sp.every * (0.75 + c.rng() * 0.5);
        for (let i = 0; i < (sp.o.wave ?? 1); i++) doSpawn(sp);
      }
    }
    for (const tm of c.timers) {
      if (tm.done) continue;
      tm.t -= dt;
      if (tm.t <= 0) {
        run(tm.fn);
        if (tm.every > 0) tm.t += tm.every; else tm.done = true;
      }
    }
    for (const h of c.keyHandlers) if (c.input.hit(h.k)) run(h.fn);
    if (c.input.pointer.clicked) {
      for (const fn of c.clickHandlers) run(() => fn({ x: c.input.pointer.u, y: c.input.pointer.v }));
      if (c.tapHandlers.length) {
        const p = c.plane(c.input.pointer.u, c.input.pointer.v, 0);
        for (const h of c.tapHandlers) {
          let best = null, bd = Infinity;
          for (const t of c.things) {
            if (!t.alive || t.slot !== h.slot) continue;
            const q = { x: t.pos.x + t.offset.x, y: t.pos.y + t.offset.y, z: t.pos.z };
            const d = c.view === 'top' ? Math.hypot(q.x - p.x, q.z - p.z) : Math.hypot(q.x - p.x, q.y - p.y);
            if (d < Math.max(t.r * 1.3, 0.8) && d < bd) { bd = d; best = t; }
          }
          if (best) run(() => h.fn(wrap(best, c)));
        }
      }
    }

    const list = c.things;
    for (const t of list) {
      if (!t.alive) continue;
      t.age += dt;
      t.prevX = t.pos.x;
      const prevY = t.pos.y;
      t.offset.x = t.offset.y = t.offset.z = 0;
      t.scale = 1;
      t.squash = 1;
      t.invuln = Math.max(0, t.invuln - dt);
      t.flash = Math.max(0, t.flash - dt);
      if (t.control) applyControls(t, dt);
      for (const b of t.behaviors) b(t, dt);
      t.pos.x += (t.drift.x + t.vel.x) * dt;
      t.pos.z += (t.drift.z + t.vel.z) * dt;
      if (t.phys) {
        t.vel.y -= c.g * (t.gMult || 1) * dt;
        t.pos.y += t.vel.y * dt;
        t.vel.x *= Math.exp(-3 * dt); t.vel.z *= Math.exp(-3 * dt);
      } else {
        t.pos.y += (t.drift.y + t.vel.y) * dt;
        t.vel.x *= Math.exp(-2 * dt); t.vel.y *= Math.exp(-2 * dt); t.vel.z *= Math.exp(-2 * dt);
      }
      t.coyote = t.grounded ? 0.1 : Math.max(0, (t.coyote || 0) - dt);
      t.grounded = false;
      if (t.phys || t.control) {
        for (const s of list) if (s !== t && s.alive && s.solidOn) resolveSolid(t, s, prevY);
      }
      const floor = t.half(1);
      if (c.world.ground !== 'none' && t.pos.y < floor) {
        if (t.phys || !t.spawned) {
          t.pos.y = floor;
          if (t.vel.y < 0) t.vel.y = 0;
          t.grounded = true;
        }
      }
      if (c.world.ground === 'none' && t.isPlayer && t.pos.y < -4) api.lose('You fell!');
      if (t.boundedOn || t.isPlayer) {
        const hw = a.w / 2 - t.half(0);
        const follow = c.world.camera === 'follow';
        if (!follow) t.pos.x = clamp(t.pos.x, -hw, hw);
        if (c.view === 'top') { const hh = a.h / 2 - t.half(2); if (!follow) t.pos.z = clamp(t.pos.z, -hh, hh); }
        else t.pos.y = Math.min(t.pos.y, a.h - t.half(1) + (t.phys ? 4 : 0));
      }
      if (t.wrapOn) {
        const hw = a.w / 2 + t.half(0);
        if (t.pos.x > c.cam.x + hw) t.pos.x -= hw * 2; else if (t.pos.x < c.cam.x - hw) t.pos.x += hw * 2;
        if (c.view === 'side') { if (t.pos.y > a.h + t.half(1)) t.pos.y = -t.half(1) + 0.01; else if (t.pos.y < -t.half(1) - 0.02 && c.world.ground === 'none') t.pos.y = a.h; }
        else { const hh = a.h / 2 + t.half(2); if (t.pos.z > hh) t.pos.z -= hh * 2; else if (t.pos.z < -hh) t.pos.z += hh * 2; }
      }
      if (t.ricochetOn) {
        const hw = a.w / 2 - t.half(0);
        if (t.pos.x < c.cam.x - hw && t.drift.x < 0 || t.pos.x > c.cam.x + hw && t.drift.x > 0) { t.drift.x *= -1; c.sound('bounce'); }
        if (c.view === 'top') {
          const hh = a.h / 2 - t.half(2);
          if (t.pos.z < -hh && t.drift.z < 0) { t.drift.z *= -1; c.sound('bounce'); }
        } else if (t.pos.y > a.h - t.half(1) && t.drift.y > 0) { t.drift.y *= -1; c.sound('bounce'); }
        for (const o of list) {
          if (o === t || !o.alive || !(o.solidOn || o.isPlayer)) continue;
          if (!overlap(t, o)) continue;
          if (c.view === 'top') {
            if (Math.abs(t.pos.x - o.pos.x) / (o.half(0) + t.half(0)) > Math.abs(t.pos.z - o.pos.z) / (o.half(2) + t.half(2))) t.drift.x = Math.abs(t.drift.x) * Math.sign(t.pos.x - o.pos.x || 1);
            else t.drift.z = Math.abs(t.drift.z) * Math.sign(t.pos.z - o.pos.z || 1);
          } else if (o.isPlayer) {
            const k = clamp((t.pos.x - o.pos.x) / (o.half(0) + t.half(0)), -1, 1);
            const sp = t.ricoSpeed || 8;
            t.drift.x = k * sp * 0.8; t.drift.y = Math.sqrt(Math.max(1, sp * sp - t.drift.x * t.drift.x)) * Math.sign(t.pos.y - o.pos.y || 1);
          } else if (Math.abs(t.pos.x - o.pos.x) / (o.half(0) + t.half(0)) > Math.abs(t.pos.y - o.pos.y) / (o.half(1) + t.half(1))) t.drift.x = Math.abs(t.drift.x) * Math.sign(t.pos.x - o.pos.x || 1);
          else t.drift.y = Math.abs(t.drift.y) * Math.sign(t.pos.y - o.pos.y || 1);
          c.sound('bounce');
        }
        if (c.view === 'side' ? t.pos.y < -1 : t.pos.z > a.h / 2 + 1) { t.alive = false; t.wentOut = true; }
      }
      if (t.rainbowOn) t.color = hsl(t.age * 120 * (t.rainbowSpeed || 1) + t.id * 40);
      if (t.trailColor && c.rng() < 0.6) c.particles.push({ x: t.pos.x + t.offset.x, y: t.pos.y + t.offset.y, z: t.pos.z, vx: 0, vy: 0.3, vz: 0, life: 0.5, max: 0.5, color: t.trailColor, size: t.r * 0.5 });
      if (t.life != null) { t.life -= dt; if (t.life <= 0) t.alive = false; }
      if (t.spawned && !t.wrapOn) {
        const far = Math.abs(t.pos.x - c.cam.x) > a.w + 6 || t.pos.y < -8 || t.pos.y > a.h + 12 || Math.abs(t.pos.z) > a.w + 6;
        if (far) { t.alive = false; t.wentOut = true; }
      }
      if (t.wentOut && !t.outFired) {
        t.outFired = true;
        for (const h of c.outHandlers) if (h.slot === t.slot) run(() => h.fn(wrap(t, c)));
      }
      if (!Number.isFinite(t.pos.x + t.pos.y + t.pos.z)) { t.alive = false; c.warn('a thing flew off to infinity'); }
    }

    for (const r of c.rules) {
      const As = list.filter((t) => t.alive && t.slot === r.a);
      if (!As.length) continue;
      const Bs = r.a === r.b ? As : list.filter((t) => t.alive && t.slot === r.b);
      for (const A of As) for (const B of Bs) {
        if (A === B || !A.alive || !B.alive || B.shooter === A || A.shooter === B) continue;
        const key = A.id + ':' + B.id + ':' + c.rules.indexOf(r);
        if (overlap(A, B)) {
          if (!c.contacts.has(key)) { c.contacts.add(key); run(() => r.fn(wrap(A, c), wrap(B, c))); }
        } else c.contacts.delete(key);
      }
    }

    if (c.things.length > 600 || c.time % 1 < dt) {
      c.things = c.things.filter((t) => t.alive);
      if (c.contacts.size > 4000) c.contacts.clear();
    }

    if (c.hud.timer != null) {
      c.hud.timer -= dt;
      if (c.hud.timer <= 0) { c.hud.timer = 0; if (c.timerEnd === 'win') api.win('Time up — you survived!'); else if (c.timerEnd === 'lose') api.lose('Time up!'); else run(c.timerEnd); c.hud.timer = null; }
    }

    const tgt = c.cam.target ? c.nearest(c.cam.target, null) : c.things.find((t) => t.isPlayer && t.alive);
    if (c.world.camera === 'follow' && tgt) {
      c.cam.x = lerp(c.cam.x, tgt.pos.x, 1 - Math.exp(-4 * dt));
      if (c.view === 'top') c.cam.z = lerp(c.cam.z, tgt.pos.z, 1 - Math.exp(-4 * dt));
    }
    c.cam.shake = Math.max(0, c.cam.shake - dt);
    for (const m of c.messages) m.t -= dt;
    c.messages = c.messages.filter((m) => m.t > 0);
    stepParticles(dt);
    c.input.pressed.clear();
    c.input.pointer.clicked = false;
  };

  function stepParticles(dt) {
    for (const p of c.particles) {
      p.life -= dt;
      p.vy -= 9 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    c.particles = c.particles.filter((p) => p.life > 0);
  }

  function run(fn) {
    try { if (typeof fn === 'function') fn(); }
    catch (e) { c.warn(e.message); c.errors = (c.errors || 0) + 1; }
  }

  c.load = (code) => {
    const names = Object.keys(api);
    const fn = new Function(...names, '"use strict";\n' + code);
    fn(...names.map((n) => api[n]));
    if (c.world.camera === 'auto') c.world.camera = 'fixed';
    c.frame = null;
    const statics = c.things.filter((t) => t.alive);
    if (!c.hasPlayer && !c.spawners.length && statics.length && c.world.camera !== 'follow') {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const t of statics) {
        const moving = t.behaviors.length && (t.drift.x || t.drift.y || t.drift.z || t.boundedOn);
        if (moving) { x0 = -12; x1 = 12; }
        const a = c.view === 'top' ? -t.pos.z : t.pos.y;
        const r = Math.max(t.half(0), t.half(c.view === 'top' ? 2 : 1)) * 1.4 + (t.home && t.behaviors.length ? 1.5 : 0);
        x0 = Math.min(x0, t.pos.x - r); x1 = Math.max(x1, t.pos.x + r);
        y0 = Math.min(y0, a - r); y1 = Math.max(y1, a + r + (c.view === 'top' ? 0 : 3.5));
      }
      const ar = c.arena();
      if (c.view === 'side') y0 = Math.min(y0, 0);
      const w = Math.min(ar.w, Math.max(9, x1 - x0 + 3)), h = Math.min(ar.h, Math.max(6, y1 - y0 + 2));
      if (w < ar.w * 0.9 || h < ar.h * 0.9) c.frame = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, y0, w, h };
    }
  };

  return c;
}

export const API_NAMES = ['world', 'add', 'scatter', 'spawn', 'hit', 'onHit', 'every', 'after', 'key', 'click', 'tap', 'out', 'score', 'lives',
  'hurt', 'heal', 'timer', 'goal', 'title', 'say', 'win', 'lose', 'sound', 'music', 'shake', 'burst', 'random', 'pick',
  'find', 'all', 'count', 'camera', 'platforms', 'walls', 'maze', 'log'];
export { THING_METHODS };
