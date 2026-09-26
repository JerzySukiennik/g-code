// G-Code synthetic pair generator: samples a spec, renders it both as an
// engine program and as a natural-language description (English or
// Polish), executes the program headless and keeps only pairs that run.
//
//   node synth/generate.mjs --n 400000 --out synth/out/pairs.jsonl --seed 1

import fs from 'node:fs';
import path from 'node:path';
import { validate } from '../engine/validate.mjs';
import {
  ENT, ROLES, PL, enForms, plNoun, COLOR_WORDS, COLOR_KEYS, agree, nounForm, SIZES, BEHAV, ADVERB,
  SKY, GROUND, WEATHER, MUSIC, MODE, NUM_EN, plCount, fmt,
} from './lexicon.mjs';

// ------------------------------------------------------------------ rng --

function makeR(seed) {
  let s = seed >>> 0 || 1;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, 1 | t); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const R = {
    f: r,
    chance: (p) => r() < p,
    int: (a, b) => a + Math.floor(r() * (b - a + 1)),
    pick: (xs) => xs[Math.floor(r() * xs.length)],
    shuffle: (xs) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    weighted: (obj) => { const tot = Object.values(obj).reduce((a, b) => a + b, 0); let x = r() * tot; for (const [k, w] of Object.entries(obj)) { if ((x -= w) <= 0) return k; } return Object.keys(obj)[0]; },
  };
  return R;
}

// ---------------------------------------------------------- utilities --

const q = (s) => `'${s}'`;
function objLit(o) {
  const parts = [];
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    let val;
    if (typeof v === 'string') val = q(v);
    else if (Array.isArray(v)) val = `[${v.join(', ')}]`;
    else val = String(v);
    parts.push(`${k}: ${val}`);
  }
  return `{ ${parts.join(', ')} }`;
}
function sizeVal(ent, said) {
  if (said != null) return said;
  return ENT[ent].size;
}
function entOpts(e, extra = {}) {
  const base = ENT[e.key];
  const size = e.size != null ? e.size : base.size;
  return { shape: base.shape, color: e.color || base.color, size: size === undefined ? undefined : size, glow: base.glow || e.glow ? true : undefined, ...extra };
}
function joinEn(xs) { return xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]; }
function joinPl(xs) { return xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' i ' + xs[xs.length - 1]; }
function stripPl(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L'); }

// ---------------------------------------------------- noun phrases (EN) --

function colorEn(R, c) { return c ? R.pick(COLOR_WORDS[c].en) : null; }
function sizeEn(R, s) { return s != null && SIZES[s] ? R.pick(SIZES[s].en) : null; }

// e: { key, color, size, count, behav: [{name, adv, hi}], layout }
function npEn(R, e, { article = true, participle = true } = {}) {
  const f = e._en || (e._en = enForms(e.key, R));
  const plural = e.count > 1;
  const words = [];
  if (plural) {
    if (e.countWord === 'many') words.push(R.pick(['lots of', 'many', 'a bunch of']));
    else if (e.countWord === 'few') words.push(R.pick(['a few', 'some']));
    else words.push(R.chance(0.6) && NUM_EN[e.count] ? NUM_EN[e.count] : String(e.count));
  } else if (article) words.push('A');
  const s = sizeEn(R, e.size); if (s) words.push(s);
  const c = colorEn(R, e.color); if (c) words.push(c);
  const pre = [], post = [];
  for (const b of e.behav || []) {
    const forms = R.pick(BEHAV[b.name].en);
    const adv = b.adv ? R.pick(ADVERB[b.adv].en) : null;
    const hi = b.hi ? R.pick(['high', 'really high']) : null;
    if (participle && forms[2] && !adv && !hi && pre.length === 0 && R.chance(0.6)) pre.push(forms[2]);
    else post.push({ forms, adv, hi });
  }
  words.push(...pre);
  words.push(plural ? f.pl : f.sg);
  let s2 = words.join(' ');
  if (!plural && article) s2 = s2.replace(/^A (?=[aeiou])/i, 'an ').replace(/^A /, 'a ');
  if (post.length) {
    const clauses = post.map(({ forms, adv, hi }) => [plural ? forms[1] : forms[0], hi, adv].filter(Boolean).join(' '));
    s2 += ' ' + (R.chance(0.75) ? 'that ' : 'which ') + joinEn(clauses);
  }
  if (e.layout) s2 += ' ' + R.pick({ row: ['in a row', 'in a line'], circle: ['in a circle', 'arranged in a ring'], grid: ['in a grid'], fall: ['falling from the sky', 'raining down'] }[e.layout]);
  if (e.pos) s2 += ' ' + R.pick({ left: ['on the left'], right: ['on the right'], center: ['in the middle', 'in the center'] }[e.pos]);
  if (e.ctrl) s2 += ' ' + R.pick({ arrows: ['that I can move with the arrow keys', 'controlled with arrows', 'that I control with the keyboard'], mouse: ['that follows the mouse', 'that follows my cursor'] }[e.ctrl]);
  return s2;
}

// ---------------------------------------------------- noun phrases (PL) --

function relPl(noun, plural) {
  if (plural) return noun.g === 'mv' ? 'którzy' : 'które';
  return noun.g === 'f' ? 'która' : noun.g === 'n' ? 'które' : 'który';
}

function npPl(R, e, kase = 'nom') {
  const noun = e._pl || (e._pl = plNoun(e.key, R));
  let plural = e.count > 1, nk = kase;
  const words = [];
  if (plural) {
    if (e.countWord === 'many') { words.push(R.pick(['dużo', 'mnóstwo', 'wiele'])); nk = 'gen'; }
    else if (e.countWord === 'few') { words.push('kilka'); nk = 'gen'; }
    else {
      const c = plCount(e.count, noun);
      words.push(R.chance(0.5) ? c.word : String(e.count));
      if (c.kase === 'gen') nk = 'gen';
      if (noun.g === 'mv' && e.count > 1) nk = 'gen';
    }
    if (kase === 'ins') nk = 'ins';
    if (kase === 'gen') nk = 'gen';
  }
  const adjs = [];
  if (e.size != null && SIZES[e.size]) adjs.push(R.pick(SIZES[e.size].pl));
  if (e.color) adjs.push(R.pick(COLOR_WORDS[e.color].pl));
  const post = [];
  for (const b of e.behav || []) {
    const forms = R.pick(BEHAV[b.name].pl);
    const adv = b.adv ? R.pick(ADVERB[b.adv].pl) : null;
    const hi = b.hi ? R.pick(['wysoko', 'bardzo wysoko']) : null;
    if (forms[2] && !forms[3] && !adv && !hi && adjs.length < 3 && R.chance(0.55) && !forms[2].includes(' ')) adjs.push(forms[2]);
    else post.push({ forms, adv, hi });
  }
  for (const a of adjs) words.push(agree(a, noun, nk, plural));
  words.push(nounForm(noun, nk, plural));
  let s = words.join(' ');
  if (post.length) {
    const cl = post.map(({ forms, adv, hi }) => [plural ? forms[1] : forms[0], hi, adv].filter(Boolean).join(' '));
    s += ', ' + relPl(noun, plural) + ' ' + joinPl(cl);
  }
  if (e.layout) s += ' ' + R.pick({ row: ['w rzędzie', 'w jednej linii'], circle: ['w kółku', 'w okręgu'], grid: ['w siatce', 'w równych rzędach'], fall: ['spadające z nieba', 'lecące z nieba'] }[e.layout]);
  if (e.pos) s += ' ' + R.pick({ left: ['po lewej', 'z lewej strony'], right: ['po prawej', 'z prawej strony'], center: ['na środku', 'pośrodku'] }[e.pos]);
  if (e.ctrl) s += ' ' + R.pick({ arrows: ['sterowany strzałkami', 'którym steruję strzałkami', 'którym mogę ruszać strzałkami'], mouse: ['podążający za myszką', 'który leci za kursorem'] }[e.ctrl]);
  return s;
}

// Plain Polish noun phrase with optional colour, for game prompts.
function gp(R, key, kase, plural, color, extraAdj) {
  const noun = plNoun(key, R);
  const words = [];
  if (extraAdj) words.push(agree(extraAdj, noun, kase, plural));
  if (color) words.push(agree(R.pick(COLOR_WORDS[color].pl), noun, kase, plural));
  words.push(nounForm(noun, kase, plural));
  return { s: words.join(' '), noun };
}
function ge(R, key, plural, color) {
  const f = enForms(key, R);
  const c = color ? R.pick(COLOR_WORDS[color].en) + ' ' : '';
  return { s: c + (plural ? f.pl : f.sg), a: /^[aeiou]/i.test(c + f.sg) ? 'an' : 'a', sg: c + f.sg, pl: c + f.pl };
}

// ------------------------------------------------------------- world --

function worldSpec(R, def, opts = {}) {
  const w = { mode: R.chance(0.5) ? '3d' : '2d', modeSaid: R.chance(0.55), sky: def.sky, ground: def.ground, view: def.view };
  if (!w.modeSaid) w.mode = '3d';
  if (R.chance(opts.skyP ?? 0.35)) {
    w.sky = R.pick(opts.skies || ['day', 'night', 'sunset', 'dawn', 'space', 'storm', 'underwater', 'candy']);
    w.skySaid = true;
    if (w.sky === 'space' && !opts.keepGround) w.ground = 'none';
    if (w.sky === 'underwater' && !opts.keepGround) w.ground = 'sand';
  }
  if (!opts.noGround && w.sky !== 'space' && R.chance(opts.groundP ?? 0.25)) {
    w.ground = R.pick(opts.grounds || ['grass', 'sand', 'snow', 'water', 'lava', 'stone', 'ice']);
    w.groundSaid = true;
  }
  if (R.chance(0.1) && w.sky !== 'space' && w.sky !== 'underwater') { w.weather = R.pick(['rain', 'snow']); }
  if (R.chance(0.14)) w.music = R.pick(Object.keys(MUSIC));
  if (opts.player && w.mode === '3d' && w.view !== 'top' && opts.chase !== false && R.chance(0.07)) w.camera = 'chase';
  if (!opts.player && R.chance(0.08) && w.mode === '3d') w.camera = 'orbit';
  if (R.chance(0.06)) w.title = R.pick(TITLES);
  return w;
}

const TITLES = ['Space Wars', 'Coin Rush', 'Jumpy', 'Galaxy Defender', 'Gzowo Quest', 'Sky Hopper', 'Night Run', 'Super Cat', 'Robo Dash', 'Candy Chaos', 'Zombie Escape', 'Brick Buster', 'Pop It', 'Star Catcher', 'Rocket Man', 'Ghost Hunt', 'Snow Day', 'Lava Jump', 'Turbo Racer', 'Bubble Pop'];

function worldCode(w) {
  const o = { mode: w.mode };
  if (w.view === 'top') o.view = 'top';
  o.sky = w.sky; o.ground = w.ground;
  if (w.weather) o.weather = w.weather;
  if (w.camera) o.camera = w.camera;
  if (w.title) o.title = w.title;
  return `world(${objLit(o)})`;
}

function worldTailCode(w) { return w.music ? [`music(${q(w.music)})`] : []; }

function worldEn(R, w, genreFirst) {
  const bits = [];
  if (w.skySaid) bits.push(R.pick(SKY[w.sky].en));
  if (w.groundSaid) bits.push(R.pick(GROUND[w.ground].en));
  if (w.weather) bits.push(R.pick(WEATHER[w.weather].en));
  if (w.view === 'top' && w.viewSaid) bits.push(R.pick(['seen from above', 'top-down view', 'from a top-down view']));
  if (w.camera === 'chase') bits.push(R.pick(['in third person', 'with a third-person camera', 'with the camera behind the player']));
  if (w.camera === 'orbit') bits.push(R.pick(['with a rotating camera', 'with the camera circling around']));
  if (w.music) bits.push(R.pick(MUSIC[w.music].en));
  if (w.title) bits.push(R.pick([`called "${w.title}"`, `named ${w.title}`, `with the title ${w.title}`]));
  return bits;
}
function worldPl(R, w) {
  const bits = [];
  if (w.skySaid) bits.push(R.pick(SKY[w.sky].pl));
  if (w.groundSaid) bits.push(R.pick(GROUND[w.ground].pl));
  if (w.weather) bits.push(R.pick(WEATHER[w.weather].pl));
  if (w.view === 'top' && w.viewSaid) bits.push(R.pick(['widok z góry', 'z widokiem z góry', 'widziana z góry']));
  if (w.camera === 'chase') bits.push(R.pick(['z perspektywy trzeciej osoby', 'z kamerą za graczem', 'w trzeciej osobie']));
  if (w.camera === 'orbit') bits.push(R.pick(['z obracającą się kamerą', 'z kamerą krążącą dookoła']));
  if (w.music) bits.push(R.pick(MUSIC[w.music].pl));
  if (w.title) bits.push(R.pick([`o nazwie "${w.title}"`, `pod tytułem ${w.title}`, `nazwana ${w.title}`]));
  return bits;
}
function modeEn(R, w) { return w.modeSaid ? R.pick(MODE[w.mode].en) : null; }
function modePl(R, w) { return w.modeSaid ? R.pick(MODE[w.mode].pl.slice(0, 2)) : null; }

function finishEn(R, s) {
  s = s.replace(/\s+/g, ' ').trim();
  if (R.chance(0.08)) s = s.charAt(0).toUpperCase() + s.slice(1);
  if (R.chance(0.08)) s += R.pick(['.', '!', ' please', ' pls']);
  return s;
}
function finishPl(R, s) {
  s = s.replace(/\s+/g, ' ').replace(/ ,/g, ',').trim();
  if (R.chance(0.12)) s = stripPl(s);
  if (R.chance(0.08)) s = s.charAt(0).toUpperCase() + s.slice(1);
  if (R.chance(0.08)) s += R.pick(['.', '!', ' proszę', ' pls']);
  return s;
}

const VERB_EN = ['make', 'create', 'build', 'give me', 'I want', 'show me', 'can you make', 'code', 'generate'];
const VERB_PL = ['zrób', 'stwórz', 'zrób mi', 'chcę', 'pokaż', 'napisz', 'wygeneruj', 'zbuduj', 'zakoduj'];

// ------------------------------------------------------------- scenes --

const BEHAV_POOL = { jump: 5, bounce: 4, spin: 5, float: 4, orbit: 2, wander: 3, pulse: 2, rainbow: 2, blink: 1, glow: 2, grow: 1, wobble: 2, trail: 1, moveRight: 1, moveLeft: 1, flyUp: 1, patrol: 1 };

function sampleEntity(R, pool, opts = {}) {
  const key = R.pick(pool);
  const e = { key, count: 1, behav: [] };
  if (R.chance(opts.colorP ?? 0.55)) e.color = R.chance(0.06) ? R.pick(['rainbow', 'random']) : R.pick(COLOR_KEYS);
  if (R.chance(opts.sizeP ?? 0.2)) e.size = Number(R.pick(Object.keys(SIZES)));
  if (R.chance(opts.countP ?? 0.25)) {
    const r = R.f();
    if (r < 0.1) { e.count = 12; e.countWord = 'many'; }
    else if (r < 0.18) { e.count = 3; e.countWord = 'few'; }
    else e.count = R.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20]);
  }
  const nb = opts.behav ?? (R.chance(0.8) ? (R.chance(0.3) ? 2 : 1) : 0);
  const used = new Set();
  for (let i = 0; i < nb; i++) {
    let name = R.weighted(BEHAV_POOL);
    if (used.has(name) || (used.has('jump') && name === 'bounce') || (used.has('bounce') && name === 'jump')) continue;
    if (['orbit', 'wander', 'patrol', 'moveRight', 'moveLeft', 'flyUp'].includes(name) && [...used].some((u) => ['orbit', 'wander', 'patrol', 'moveRight', 'moveLeft', 'flyUp'].includes(u))) continue;
    if (name === 'rainbow' && e.color) continue;
    used.add(name);
    const b = { name };
    if (!['glow', 'trail'].includes(name) && R.chance(0.2)) b.adv = R.pick(['fast', 'slow']);
    if (BEHAV[name].hi && !b.adv && R.chance(0.15)) b.hi = true;
    e.behav.push(b);
  }
  if (e.count > 1 && R.chance(0.3)) e.layout = R.pick(['row', 'circle', 'grid', 'fall', 'fall']);
  if (e.layout === 'fall') e.behav = e.behav.filter((b) => ['spin', 'wobble', 'glow', 'rainbow', 'blink', 'pulse', 'trail'].includes(b.name));
  if (e.count === 1 && !opts.noCtrl && R.chance(0.08)) e.ctrl = R.pick(['arrows', 'arrows', 'mouse']);
  if (e.ctrl) e.behav = e.behav.filter((b) => !['orbit', 'wander', 'patrol', 'moveRight', 'moveLeft', 'flyUp'].includes(b.name));
  return e;
}

function entityCode(e, idx, total, w) {
  const extra = {};
  if (e.count > 1 && e.layout !== 'fall') {
    extra.count = e.count;
    if (e.layout === 'row') extra.row = true;
    if (e.layout === 'circle') extra.circle = true;
    if (e.layout === 'grid') extra.grid = true;
  }
  const slots = { left: -6, right: 6, center: 0 };
  let x;
  if (e.pos) x = slots[e.pos];
  else if (e.count === 1 && total > 1) x = Math.round((idx - (total - 1) / 2) * 6);
  if (x !== undefined && x !== 0) extra.x = x;
  if (e.count > 1 && x !== undefined && e.layout !== 'row' && e.layout !== 'grid' && e.layout !== 'circle' && e.pos) extra.x = x;
  let line;
  const opts = entOpts(e);
  if (e.color === 'rainbow') opts.color = 'rainbow';
  if (e.color === 'random') opts.color = 'random';
  if (e.layout === 'fall') {
    line = `spawn(${q(e.key)}, ${objLit({ ...opts, every: fmt(e.count >= 12 ? 0.25 : 0.5), from: 'top' }).replace(/every: '([\d.]+)'/, 'every: $1')}).move('down', 3)`;
  } else {
    line = `add(${q(e.key)}, ${objLit({ ...opts, ...extra })})`;
  }
  for (const b of e.behav) line += BEHAV[b.name].code(b.adv ? ADVERB[b.adv].k : 1, b.hi);
  if (e.ctrl === 'arrows') line += `.controls('arrows', 6)`;
  if (e.ctrl === 'mouse') line += `.controls('mouse', 6)`;
  return line;
}

function genScene(R) {
  const n = R.weighted({ 1: 6, 2: 3, 3: 1 });
  const ents = [];
  const used = new Set();
  for (let i = 0; i < Number(n); i++) {
    let e;
    for (let t = 0; t < 5; t++) { e = sampleEntity(R, ROLES.prop, { noCtrl: i > 0 || ents.some((x) => x.ctrl) }); if (!used.has(e.key)) break; }
    if (used.has(e.key)) continue;
    used.add(e.key);
    if (Number(n) > 1 && e.count === 1 && R.chance(0.2)) e.pos = R.pick(['left', 'right']);
    ents.push(e);
  }
  const posUsed = new Set();
  for (const e of ents) { if (e.pos && posUsed.has(e.pos)) delete e.pos; if (e.pos) posUsed.add(e.pos); }
  const w = worldSpec(R, { sky: 'day', ground: 'grass', view: 'side' }, { player: ents.some((e) => e.ctrl) });
  if (ents.some((e) => e.key === 'fish') && !w.skySaid && R.chance(0.3)) { w.sky = 'underwater'; w.ground = 'sand'; w.skySaid = true; w.groundSaid = false; }
  const code = [worldCode(w), ...ents.map((e, i) => entityCode(e, i, ents.length, w)), ...worldTailCode(w)];

  const en = () => {
    const nps = ents.map((e) => npEn(R, e));
    const body = joinEn(nps);
    const wb = worldEn(R, w);
    const m = modeEn(R, w);
    const lead = R.chance(0.45) ? R.pick(VERB_EN) + ' ' : '';
    let s;
    if (m && R.chance(0.5)) s = `${lead}${body} ${R.pick(['in ' + m, m])}`;
    else if (m) s = `${lead}${m} ${R.pick(['scene with', 'scene:', 'world with', '']) } ${body}`;
    else s = `${lead}${body}`;
    return finishEn(R, [s, ...R.shuffle(wb)].join(' '));
  };
  const pl = () => {
    const kase = R.chance(0.45) ? 'acc' : 'nom';
    const nps = ents.map((e) => npPl(R, e, kase));
    const body = joinPl(nps);
    const wb = worldPl(R, w);
    const m = modePl(R, w);
    const lead = kase === 'acc' ? R.pick(VERB_PL) + ' ' : '';
    let s = `${lead}${body}`;
    if (m) s = R.chance(0.5) ? `${s} ${R.pick(['w ' + m, m])}` : `${m} ${R.pick(['scena:', 'świat:', ''])} ${s}`;
    return finishPl(R, [s, ...R.shuffle(wb)].join(' '));
  };
  return { genre: 'scene', code, en, pl };
}

// ------------------------------------------------------ themed scenes --

function genTheme(R) {
  const theme = R.pick(['solar', 'aquarium', 'fireworks', 'forest', 'winter', 'city', 'haunted', 'space', 'farm', 'candy', 'rainbow']);
  const w = worldSpec(R, { sky: 'day', ground: 'grass', view: 'side' }, { skyP: 0 });
  const code = [];
  let en, pl;
  const n = R.pick([3, 4, 5, 6, 8]);
  switch (theme) {
    case 'solar': {
      w.sky = 'space'; w.ground = 'none';
      const planets = R.pick([3, 4, 5]);
      code.push(worldCode(w), `add('sun', { shape: 'sphere', color: 'yellow', size: 3, glow: true })`);
      const cols = ['gray', 'orange', 'blue', 'red', 'beige', 'teal'];
      for (let i = 0; i < planets; i++) code.push(`add('planet', { shape: 'sphere', color: '${cols[i]}', size: ${fmt(0.6 + (i % 3) * 0.3)} }).orbit(${3 + i * 1.5}, ${fmt(0.4 / (1 + i * 0.5))}, 'sun')`);
      en = () => finishEn(R, R.pick([`a solar system with ${NUM_EN[planets]} planets`, `${planets} planets orbiting the sun`, `solar system, ${planets} planets`]) + (w.modeSaid ? ' in ' + modeEn(R, w) : ''));
      pl = () => finishPl(R, R.pick([`układ słoneczny z ${planets} planetami`, `${plCount(planets, PL.planeta).word} planety krążące wokół słońca`, `układ słoneczny, ${planets} planety`]) + (w.modeSaid ? ' w ' + modePl(R, w) : ''));
      break;
    }
    case 'aquarium': {
      w.sky = 'underwater'; w.ground = 'sand';
      code.push(worldCode(w), `add('fish', { shape: 'fish', color: 'random', count: ${n} }).wander(2)`, `spawn('bubble', { shape: 'sphere', color: 'skyblue', size: 0.4, every: 0.5, from: 'bottom' }).move('up', 2).wobble(0.25, 3)`);
      en = () => finishEn(R, R.pick([`an aquarium with ${n} fish`, `a fish tank with ${NUM_EN[n] || n} colorful fish and bubbles`, `underwater scene with ${n} fish swimming around`]) + (w.modeSaid ? ' ' + modeEn(R, w) : ''));
      pl = () => finishPl(R, R.pick([`akwarium z ${n} rybkami`, `akwarium, ${n} kolorowych rybek i bąbelki`, `podwodny świat z ${n} rybami`]) + (w.modeSaid ? ' ' + modePl(R, w) : ''));
      break;
    }
    case 'fireworks': {
      w.sky = 'night';
      code.push(worldCode(w), `every(0.6, () => burst({ x: random(-9, 9), y: random(6, 12), z: 0 }, 'random', 40))`);
      if (w.music) code.push(`music('${w.music}')`);
      en = () => finishEn(R, R.pick(['fireworks at night', 'a fireworks show', 'fireworks in the night sky', 'new year fireworks']) + (w.modeSaid ? ' in ' + modeEn(R, w) : ''));
      pl = () => finishPl(R, R.pick(['fajerwerki w nocy', 'pokaz fajerwerków', 'sztuczne ognie na nocnym niebie', 'noworoczne fajerwerki']) + (w.modeSaid ? ' ' + modePl(R, w) : ''));
      w.music = null;
      break;
    }
    case 'forest': {
      code.push(worldCode(w), `scatter('tree', { shape: 'tree', color: 'green', count: ${n + 4} })`, `scatter('mushroom', { shape: 'mushroom', color: 'red', count: 5 })`, `add('bird', { shape: 'bird', color: 'yellow', count: 3, y: 9 }).wander(2)`);
      en = () => finishEn(R, R.pick([`a forest with ${n + 4} trees`, 'a forest with trees, mushrooms and birds', 'a little forest']) + (w.modeSaid ? ' ' + modeEn(R, w) : ''));
      pl = () => finishPl(R, R.pick([`las z ${n + 4} drzewami`, 'las z drzewami, grzybami i ptakami', 'mały lasek']) + (w.modeSaid ? ' ' + modePl(R, w) : ''));
      break;
    }
    case 'winter': {
      w.ground = 'snow'; w.weather = 'snow';
      code.push(worldCode(w), `add('snowman', { shape: 'snowman', color: 'black' })`, `scatter('tree', { shape: 'tree', color: 'darkgreen', count: ${n} })`);
      en = () => finishEn(R, R.pick(['a winter scene with a snowman', 'a snowman in the snow with trees', 'snowy winter landscape with a snowman']) + (w.modeSaid ? ' ' + modeEn(R, w) : ''));
      pl = () => finishPl(R, R.pick(['zimowa scena z bałwanem', 'bałwan na śniegu i choinki', 'zimowy krajobraz z bałwanem']) + (w.modeSaid ? ' ' + modePl(R, w) : ''));
      break;
    }
    case 'city': {
      w.ground = 'stone';
      code.push(worldCode(w), `add('house', { shape: 'house', color: 'beige', count: 5, row: true, gap: 4.5 })`, `add('car', { shape: 'car', color: 'random', count: 3, onGround: true }).move('right', 4).wrap()`);
      en = () => finishEn(R, R.pick(['a small city with houses and cars driving', 'a street with houses and moving cars', 'a town with cars']) + (w.modeSaid ? ' ' + modeEn(R, w) : ''));
      pl = () => finishPl(R, R.pick(['małe miasto z domami i jeżdżącymi samochodami', 'ulica z domami i autami', 'miasteczko z samochodami']) + (w.modeSaid ? ' ' + modePl(R, w) : ''));
      break;
    }
    case 'haunted': {
      w.sky = 'night'; w.music = 'spooky';
      code.push(worldCode(w), `add('house', { shape: 'house', color: 'gray', size: 2 })`, `add('ghost', { shape: 'ghost', color: 'white', count: ${n} }).wander(2).float(0.5, 1)`, `scatter('pumpkin', { shape: 'sphere', color: 'orange', count: 4 }).glow()`, `music('spooky')`);
      en = () => finishEn(R, R.pick([`a haunted house with ${n} ghosts`, 'a spooky halloween night with ghosts and pumpkins', 'haunted house at night']) + (w.modeSaid ? ' ' + modeEn(R, w) : ''));
      pl = () => finishPl(R, R.pick([`nawiedzony dom z ${n} duchami`, 'straszna noc halloween z duchami i dyniami', 'nawiedzony dom w nocy']) + (w.modeSaid ? ' ' + modePl(R, w) : ''));
      w.music = null;
      break;
    }
    case 'space': {
      w.sky = 'space'; w.ground = 'none';
      code.push(worldCode(w), `add('planet', { shape: 'sphere', color: 'blue', size: 3, y: 7 }).spin(0.1)`, `add('ufo', { shape: 'ufo', color: 'green' }).orbit(5, 0.3, 'planet')`, `add('rocket', { shape: 'rocket', color: 'white', count: 2 }).float(0.5, 1)`);
      en = () => finishEn(R, R.pick(['a space scene with a planet, an ufo and rockets', 'outer space with a planet and a flying saucer', 'space with rockets']) + (w.modeSaid ? ' ' + modeEn(R, w) : ''));
      pl = () => finishPl(R, R.pick(['kosmos z planetą, ufo i rakietami', 'przestrzeń kosmiczna z planetą i latającym spodkiem', 'kosmos z rakietami']) + (w.modeSaid ? ' ' + modePl(R, w) : ''));
      break;
    }
    case 'farm': {
      code.push(worldCode(w), `add('house', { shape: 'house', color: 'red', x: -7 })`, `add('cat', { shape: 'cat', color: 'orange', count: 2 }).wander(2)`, `add('dog', { shape: 'dog', color: 'brown' }).wander(3)`, `scatter('tree', { shape: 'tree', color: 'green', count: 4 })`);
      en = () => finishEn(R, R.pick(['a farm with a house, cats and a dog', 'a cozy farm with animals', 'a farm']) + (w.modeSaid ? ' ' + modeEn(R, w) : ''));
      pl = () => finishPl(R, R.pick(['farma z domem, kotami i psem', 'przytulna farma ze zwierzętami', 'farma']) + (w.modeSaid ? ' ' + modePl(R, w) : ''));
      break;
    }
    case 'candy': {
      w.sky = 'candy'; w.ground = 'grass';
      code.push(worldCode(w), `scatter('candy', { shape: 'sphere', color: 'random', count: ${n + 4} }).float(0.3, 1)`, `add('donut', { shape: 'torus', color: 'pink', count: 3 }).spin(0.5)`);
      en = () => finishEn(R, R.pick(['a candy land with sweets and donuts', 'candy world full of sweets', 'a world made of candy']) + (w.modeSaid ? ' ' + modeEn(R, w) : ''));
      pl = () => finishPl(R, R.pick(['kraina słodyczy z cukierkami i donutami', 'cukierkowy świat pełen słodyczy', 'świat z cukierków']) + (w.modeSaid ? ' ' + modePl(R, w) : ''));
      break;
    }
    default: {
      code.push(worldCode(w), `add('star', { shape: 'star', color: 'rainbow', count: ${n + 6}, circle: true, radius: 5, y: 7 }).spin(1).glow()`);
      en = () => finishEn(R, R.pick([`a rainbow circle of ${n + 6} spinning stars`, `${n + 6} glowing rainbow stars in a circle`]) + (w.modeSaid ? ' ' + modeEn(R, w) : ''));
      pl = () => finishPl(R, R.pick([`tęczowe koło z ${n + 6} kręcących się gwiazd`, `${n + 6} świecących tęczowych gwiazd w kółku`]) + (w.modeSaid ? ' ' + modePl(R, w) : ''));
    }
  }
  code.push(...worldTailCode(w));
  return { genre: 'theme', code, en, pl };
}

// -------------------------------------------------------------- games --

function gameOpts(R, allow) {
  const o = {};
  if (allow.lives && R.chance(0.3)) o.lives = R.pick([1, 3, 3, 5, 10]);
  if (allow.timer && R.chance(0.2)) o.timer = R.pick([20, 30, 45, 60, 90, 120]);
  if (allow.goal && R.chance(0.25)) o.goal = R.pick([5, 10, 15, 20, 25, 30, 50]);
  if (allow.fast && R.chance(0.15)) o.speed = R.pick(['fast', 'slow']);
  if (allow.many && R.chance(0.12)) o.many = true;
  return o;
}

function livesEn(R, n) { return R.pick([`with ${n} ${n === 1 ? 'life' : 'lives'}`, `${n} ${n === 1 ? 'life' : 'lives'}`, `and I have ${n} ${n === 1 ? 'life' : 'lives'}`]); }
function livesPl(R, n) {
  const w = n === 1 ? 'jednym życiem' : `${n} ${n >= 2 && n <= 4 ? 'życiami' : 'życiami'}`;
  const nom = n === 1 ? '1 życie' : n >= 2 && n <= 4 ? `${n} życia` : `${n} żyć`;
  return R.pick([`z ${w}`, `${nom}`, `mam ${nom}`]);
}
function timerEn(R, s) { return R.pick([`with a ${s} second timer`, `${s} seconds`, `survive ${s} seconds to win`, `you have ${s} seconds`]); }
function timerPl(R, s) { return R.pick([`z licznikiem ${s} sekund`, `${s} sekund`, `przetrwaj ${s} sekund żeby wygrać`, `masz ${s} sekund`]); }
function goalEn(R, n, what) { return R.pick([`get ${n} points to win`, `win at ${n} points`, `${what ? 'collect ' + n + ' ' + what + ' to win' : 'first to ' + n + ' points wins'}`]); }
function goalPl(R, n, what) { return R.pick([`zdobądź ${n} punktów żeby wygrać`, `wygrywasz przy ${n} punktach`, what ? `zbierz ${n} ${what} żeby wygrać` : `do ${n} punktów`]); }

function extrasEn(R, o, what) { const b = []; if (o.lives) b.push(livesEn(R, o.lives)); if (o.timer) b.push(timerEn(R, o.timer)); if (o.goal) b.push(goalEn(R, o.goal, what)); return b; }
function extrasPl(R, o, what) { const b = []; if (o.lives) b.push(livesPl(R, o.lives)); if (o.timer) b.push(timerPl(R, o.timer)); if (o.goal) b.push(goalPl(R, o.goal, what)); return b; }

function pickDistinct(R, pool, avoid) { const xs = pool.filter((k) => !avoid.includes(k)); return R.pick(xs); }
function maybeColor(R, p = 0.3) { return R.chance(p) ? R.pick(COLOR_KEYS) : null; }

function hasMode(s) { return /\b[23]d\b|dimensional|wymiarow/i.test(s); }
function assemble(R, w, parts, extras, lang) {
  const wb = lang === 'en' ? worldEn(R, w) : worldPl(R, w);
  if (w.modeSaid && !hasMode(parts[0])) wb.push(lang === 'en' ? R.pick(['in ' + modeEn(R, w), modeEn(R, w)]) : R.pick(['w ' + modePl(R, w), modePl(R, w)]));
  const all = [...parts.slice(1), ...R.shuffle([...extras, ...wb])];
  let s = parts[0];
  for (const a of all) s += R.chance(0.35) ? ', ' + a : ' ' + a;
  return lang === 'en' ? finishEn(R, s) : finishPl(R, s);
}

// Genre noun with the optional mode word attached, EN.
function genreEn(R, w, names) {
  const g = R.pick(names);
  const m = modeEn(R, w);
  if (!m) return R.chance(0.5) ? `${/^[aeiou]/i.test(g) ? 'an' : 'a'} ${g}` : g;
  return R.pick([`a ${m} ${g}`, `${m} ${g}`, `${g} in ${m}`, `a ${g} in ${m}`]);
}
function genrePl(R, w, names) {
  const g = R.pick(names);
  const m = modePl(R, w);
  if (!m) return g;
  return R.pick([`${g} ${m}`, `${g} w ${m}`, `${m} ${g}`]);
}

function genShooter(R) {
  const player = R.pick(ROLES.shooterPlayer);
  const enemy = pickDistinct(R, ROLES.shooterEnemy, [player]);
  const shot = pickDistinct(R, ROLES.projectile, [player, enemy]);
  const pc = maybeColor(R, 0.25), ec = maybeColor(R, 0.3), sc = maybeColor(R, 0.15);
  const w = worldSpec(R, { sky: 'space', ground: 'none', view: 'side' }, { player: true, skies: ['night', 'sunset', 'day', 'storm', 'underwater', 'dawn'], keepGround: true, noGround: true });
  if (w.skySaid && w.sky !== 'space') w.ground = 'none';
  const o = gameOpts(R, { lives: true, timer: true, goal: true, fast: true, many: true });
  if (!o.lives && !o.timer) o.lives = 3;
  o.livesSaid = !!o.lives && R.chance(0.99);
  const shootBack = R.chance(0.15);
  const boss = !o.goal && !o.timer && R.chance(0.12);
  const power = R.chance(0.12);
  const free = R.chance(0.12);
  const pe = ENT[player], ee = ENT[enemy], se = ENT[shot];
  const every = o.many ? 0.5 : 1.2;
  const speed = o.speed === 'fast' ? 6 : o.speed === 'slow' ? 1.5 : 3;
  const code = [worldCode(w)];
  code.push(`add(${q(player)}, ${objLit({ shape: pe.shape, color: pc || pe.color, y: 1.5 })}).controls(${q(free ? 'arrows' : 'paddle')}, 8).shoot(${q(shot)}, ${objLit({ shape: se.shape === 'bullet' ? 'bullet' : se.shape, color: sc || se.color })})`);
  code.push(`spawn(${q(enemy)}, ${objLit({ shape: ee.shape, color: ec || ee.color, every: fmt(every), from: 'top' }).replace(/every: '([\d.]+)'/, 'every: $1')}).move('down', ${speed})` + (shootBack ? `.shoot('bomb', { every: 2, dir: 'player', color: 'red' })` : ''));
  code.push(`hit(${q(shot)}, ${q(enemy)}, (s, e) => { s.remove(); e.explode(); score(1) })`);
  code.push(`hit(${q(player)}, ${q(enemy)}, (p, e) => { e.explode(); hurt() })`);
  if (shootBack) code.push(`hit(${q(player)}, 'bomb', (p, b) => { b.remove(); hurt() })`);
  if (boss) {
    code.push(`add('boss', { shape: ${q(ee.shape)}, color: 'red', size: 3, y: 11, hp: 20 }).patrol(8, 3).shoot('bomb', { every: 1, dir: 'down', color: 'orange' })`);
    code.push(`hit(${q(shot)}, 'boss', (s, b) => { s.remove(); b.hurt(); score(5) })`);
    if (!shootBack) code.push(`hit(${q(player)}, 'bomb', (p, b) => { b.remove(); hurt() })`);
    code.push(`every(0.5, () => { if (count('boss') === 0) win() })`);
  }
  if (power) {
    code.push(`spawn('powerup', { shape: 'star', color: 'gold', every: 8, from: 'top' }).move('down', 2).spin(1)`);
    code.push(`hit(${q(player)}, 'powerup', (p, s) => { s.pop(); heal(1); sound('powerup') })`);
  }
  if (o.lives) code.push(`lives(${o.lives})`);
  if (o.goal) code.push(`goal(${o.goal})`);
  if (o.timer) code.push(`timer(${o.timer}, 'win')`);
  code.push(...worldTailCode(w));

  const en = () => {
    const P = ge(R, player, false, pc), En = ge(R, enemy, true, ec), S = ge(R, shot, true, sc);
    const spd = o.speed ? (o.speed === 'fast' ? 'fast ' : 'slow ') : '';
    const head = R.pick([
      () => genreEn(R, w, w.sky === 'space' ? ['space shooter', 'shooter', 'shoot em up', 'shooting game', 'space invaders game'] : ['shooter', 'shooting game', 'shoot em up']) + ` where ${R.pick(['I', 'you'])} ${R.pick(['fly', 'control', 'am'])} ${P.a} ${P.s} and shoot ${spd}${En.pl}`,
      () => `${R.pick(VERB_EN)} ${genreEn(R, w, ['shooter', 'shooting game', 'game'])} ${R.pick(['with', 'where'])} ${R.pick([`${P.a} ${P.s} shooting ${S.pl} at ${spd}${En.pl}`, `${P.a} ${P.s} that shoots ${spd}${En.pl}`])}`,
      () => genreEn(R, w, ['shooter', 'space shooter']) + (ec || enemy !== 'ufo' || o.speed ? ` with ${spd}${En.pl}` : '') + (pc || player !== 'rocket' ? ` and ${P.a} ${P.s}` : ''),
      () => `shoot ${spd}${En.pl} with ${P.a} ${P.s}` + (modeEn(R, w) ? ' ' + modeEn(R, w) : ''),
    ])();
    const ex = extrasEn(R, o, null);
    if (shootBack) ex.push(R.pick(['enemies shoot back', `the ${En.pl} shoot at me`, 'enemies drop bombs']));
    if (boss) ex.push(R.pick(['with a boss', 'and a big boss at the end', 'with a boss fight']));
    if (power) ex.push(R.pick(['with power-ups', 'with stars that give extra lives']));
    if (free) ex.push(R.pick(['I can fly anywhere', 'move in all directions', 'free movement']));
    if ((sc || shot !== 'laser') && !head.includes(S.pl)) ex.push(R.pick([`shooting ${S.pl}`, `with ${S.pl}`]));
    if ((pc || player !== 'rocket') && !head.includes(P.sg)) ex.push(R.pick([`you fly ${P.a} ${P.sg}`, `playing as ${P.a} ${P.sg}`, `with ${P.a} ${P.sg} as the player`]));
    if ((ec || enemy !== 'ufo' || o.speed) && !head.includes(En.pl)) ex.push(R.pick([`shoot ${spd}${En.pl}`, `enemies are ${spd}${En.pl}`]));
    if (o.many) ex.push(R.pick(['lots of enemies', 'a lot of enemies', 'many enemies']));
    return assemble(R, w, [head], ex, 'en');
  };
  const pl = () => {
    const P = gp(R, player, 'ins', false, pc), Eg = gp(R, enemy, 'gen', true, ec, o.speed === 'fast' ? 'szybki' : o.speed === 'slow' ? 'wolny' : null);
    const Ea = gp(R, enemy, 'acc', true, ec, o.speed === 'fast' ? 'szybki' : o.speed === 'slow' ? 'wolny' : null);
    const Si = gp(R, shot, 'ins', true, sc);
    const head = R.pick([
      () => genrePl(R, w, w.sky === 'space' ? ['kosmiczna strzelanka', 'strzelanka', 'gra w strzelanie'] : ['strzelanka', 'gra w strzelanie']) + `, ${R.pick(['w której', 'gdzie'])} ${R.pick(['lecę', 'steruję', 'latam'])} ${P.s} i strzelam do ${Eg.s}`,
      () => `${R.pick(VERB_PL)} ${genrePl(R, w, ['strzelankę', 'grę'])} ${R.pick(['w której', 'gdzie'])} ${P.s.split(' ').length ? `${gp(R, player, 'nom', false, pc).s} strzela ${Si.s} do ${Eg.s}` : ''}`,
      () => genrePl(R, w, ['strzelanka', 'kosmiczna strzelanka']) + ` z ${gp(R, enemy, 'ins', true, ec).s}`,
      () => `zestrzeliwuj ${Ea.s} ${P.s}` + (modePl(R, w) ? ' ' + modePl(R, w) : ''),
    ])();
    const ex = extrasPl(R, o, null);
    if (shootBack) ex.push(R.pick(['wrogowie strzelają do mnie', `${gp(R, enemy, 'nom', true).s} też strzelają`, 'wrogowie zrzucają bomby']));
    if (boss) ex.push(R.pick(['z bossem', 'i wielki boss na końcu', 'z walką z bossem']));
    if (power) ex.push(R.pick(['z bonusami', 'z gwiazdkami które dają dodatkowe życie']));
    if (free) ex.push(R.pick(['mogę latać wszędzie', 'ruch we wszystkich kierunkach', 'swobodne latanie']));
    if (o.many) ex.push(R.pick(['dużo wrogów', 'mnóstwo przeciwników']));
    const hs = stripPl(head);
    if ((pc || player !== 'rocket') && !hs.includes(stripPl(plNoun(player, R).nom).slice(0, 4)) && !ENT[player].pl.some((k) => hs.includes(stripPl(PL[k].ins).slice(0, 5)) || hs.includes(stripPl(PL[k].nom).slice(0, 5)))) ex.push(R.pick([`lecę ${P.s}`, `gracz to ${gp(R, player, 'nom', false, pc).s}`, `sterujesz ${P.s}`]));
    if ((sc || shot !== 'laser') && !ENT[shot].pl.some((k) => hs.includes(stripPl(PL[k].insP).slice(0, 5)))) ex.push(R.pick([`strzelam ${Si.s}`, `strzelanie ${Si.s}`]));
    if ((ec || enemy !== 'ufo' || o.speed) && !ENT[enemy].pl.some((k) => ['genP', 'accP', 'insP', 'nomP'].some((f) => hs.includes(stripPl(PL[k][f]).slice(0, 5))))) ex.push(`strzelaj do ${Eg.s}`);
    return assemble(R, w, [head], ex, 'pl');
  };
  return { genre: 'shooter', code, en, pl };
}

function genPlatformer(R) {
  const hero = R.pick(ROLES.character);
  const coin = pickDistinct(R, ROLES.collectible, [hero]);
  const foe = pickDistinct(R, [...ROLES.walker, ...ROLES.flyer], [hero, coin]);
  const flying = ROLES.flyer.includes(foe) && !ROLES.walker.includes(foe);
  const hc = maybeColor(R, 0.3), cc = maybeColor(R, 0.15), fc = maybeColor(R, 0.2), platC = maybeColor(R, 0.12);
  const w = worldSpec(R, { sky: 'day', ground: 'grass', view: 'side' }, { player: true, grounds: ['grass', 'sand', 'snow', 'stone', 'ice', 'lava'] });
  const o = gameOpts(R, { lives: true, timer: true, goal: false, fast: true });
  const nCoins = R.pick([5, 8, 10, 12]);
  const coinsSaid = R.chance(0.25);
  const nFoes = R.pick([2, 3, 4]);
  const noFoes = R.chance(0.15);
  const door = R.chance(0.2);
  const collectAll = !door && R.chance(0.2);
  const nPlat = R.pick([4, 5, 6, 7, 8]);
  const platSaid = R.chance(0.2);
  const high = R.chance(0.1);
  const he = ENT[hero], ce = ENT[coin], fe = ENT[foe];
  const code = [worldCode(w)];
  code.push(`add(${q(hero)}, ${objLit({ shape: he.shape, color: hc || he.color, x: -9 })}).controls('platformer', 6).jump(${high ? 6 : 4})`);
  code.push(`platforms(${nPlat}, ${objLit({ color: platC || 'brown' })})`);
  code.push(`add(${q(coin)}, ${objLit({ shape: ce.shape, color: cc || ce.color, count: nCoins })}).float(0.3, 1).spin(0.5)`);
  if (!noFoes) {
    if (flying) code.push(`add(${q(foe)}, ${objLit({ shape: fe.shape, color: fc || fe.color, count: nFoes, y: 8 })}).patrol(5, ${o.speed === 'fast' ? 5 : o.speed === 'slow' ? 1 : 3})`);
    else code.push(`add(${q(foe)}, ${objLit({ shape: fe.shape, color: fc || fe.color, count: nFoes, onGround: true })}).patrol(3, ${o.speed === 'fast' ? 4 : o.speed === 'slow' ? 1 : 2})`);
  }
  code.push(`hit(${q(hero)}, ${q(coin)}, (p, c) => { c.pop(); score(1); sound('coin') })`);
  if (!noFoes) code.push(`hit(${q(hero)}, ${q(foe)}, () => hurt())`);
  if (door) {
    code.push(`add('door', { shape: 'cube', color: 'brown', size: [1.4, 2.4, 0.4], x: 10 })`);
    code.push(`hit(${q(hero)}, 'door', () => win('Level complete!'))`);
  }
  if (collectAll) code.push(`goal(${nCoins})`);
  if (o.lives || !noFoes) code.push(`lives(${o.lives || 3})`);
  if (o.timer) code.push(`timer(${o.timer}, 'lose')`);
  code.push(...worldTailCode(w));
  const en = () => {
    const H = ge(R, hero, false, hc), C = ge(R, coin, true, cc), F = ge(R, foe, true, fc);
    const cnt = coinsSaid || collectAll ? `${nCoins} ` : '';
    const head = R.pick([
      () => genreEn(R, w, ['platformer', 'platform game', 'jump and run game', 'mario-like game']) + ` with ${H.a} ${H.s}`,
      () => `${R.pick(VERB_EN)} ${genreEn(R, w, ['platformer', 'platform game', 'game'])} where ${H.a} ${H.s} jumps on ${platSaid ? nPlat + ' ' : ''}${platC ? R.pick(COLOR_WORDS[platC].en) + ' ' : ''}platforms and collects ${cnt}${C.pl}`,
      () => genreEn(R, w, ['platformer', 'platform game']) + ` where you collect ${cnt}${C.pl}`,
      () => `${H.a} ${H.s} jumping on platforms` + (modeEn(R, w) ? ' ' + modeEn(R, w) : ''),
    ])();
    const ex = extrasEn(R, o, null);
    if (!noFoes && (fc || foe !== 'slime' || o.speed || R.chance(0.6))) ex.push(R.pick([`avoid the ${F.pl}`, `with ${o.speed === 'fast' ? 'fast ' : ''}${F.pl} as enemies`, `watch out for ${F.pl}`, `and ${F.pl} that hurt you`]));
    if (noFoes) ex.push(R.pick(['no enemies', 'without enemies']));
    if (!head.includes(C.pl)) ex.push(`collect ${cnt}${C.pl}`);
    if (collectAll) ex.push(R.pick(['collect them all to win', 'win when you get all of them']));
    if (door) ex.push(R.pick(['reach the door to win', 'get to the exit to finish the level', 'with a door at the end']));
    if (high) ex.push(R.pick(['jumps really high', 'with a super jump', 'high jumps']));
    if ((hc || hero !== 'person') && !head.includes(H.sg)) ex.push(R.pick([`play as ${H.a} ${H.sg}`, `the hero is ${H.a} ${H.sg}`]));
    if (o.speed && noFoes) o.speed = null;
    if (o.speed && !ex.some((x) => x.includes('fast')) && o.speed === 'fast') ex.push('fast enemies');
    if (o.speed === 'slow') ex.push('slow enemies');
    if ((platSaid || platC) && !head.includes(' platforms and')) ex.push(`${platSaid ? nPlat + ' ' : ''}${platC ? R.pick(COLOR_WORDS[platC].en) + ' ' : ''}platforms`);
    return assemble(R, w, [head], ex, 'en');
  };
  const pl = () => {
    const Hn = gp(R, hero, 'nom', false, hc), Ca = gp(R, coin, cnt() ? 'gen' : 'acc', true, cc), Fg = gp(R, foe, 'gen', true, fc);
    function cnt() { return coinsSaid || collectAll; }
    const c = cnt() ? `${nCoins} ` : '';
    const head = R.pick([
      () => genrePl(R, w, ['platformówka', 'gra platformowa', 'skakanka po platformach']) + ` z ${gp(R, hero, 'ins', false, hc).s}`,
      () => `${R.pick(VERB_PL)} ${genrePl(R, w, ['platformówkę', 'grę platformową', 'grę'])} w której ${Hn.s} skacze po ${platSaid ? nPlat + ' ' : ''}platformach i zbiera ${c}${Ca.s}`,
      () => genrePl(R, w, ['platformówka', 'gra platformowa']) + ` gdzie zbierasz ${c}${Ca.s}`,
      () => `${Hn.s} skaczący po platformach` + (modePl(R, w) ? ' ' + modePl(R, w) : ''),
    ])();
    const ex = extrasPl(R, o, null);
    if (!noFoes && (fc || foe !== 'slime' || o.speed || R.chance(0.6))) ex.push(R.pick([`unikaj ${Fg.s}`, `uważaj na ${gp(R, foe, 'acc', true, fc).s}`, `z ${gp(R, foe, 'ins', true, fc).s} jako wrogami`]));
    if (noFoes) ex.push(R.pick(['bez wrogów', 'bez przeciwników']));
    if (!head.includes('zbiera')) ex.push(`zbieraj ${c}${Ca.s}`);
    if (collectAll) ex.push(R.pick(['zbierz wszystkie żeby wygrać', 'wygrywasz jak zbierzesz wszystkie']));
    if (door) ex.push(R.pick(['dojdź do drzwi żeby wygrać', 'na końcu jest wyjście', 'z drzwiami na końcu poziomu']));
    if (high) ex.push(R.pick(['skacze bardzo wysoko', 'z super skokiem', 'wysokie skoki']));
    if ((hc || hero !== 'person') && !head.includes(Hn.s) && !head.includes(gp(R, hero, 'ins', false, hc).s.split(' ').pop())) ex.push(R.pick([`grasz jako ${Hn.s}`, `bohater to ${Hn.s}`]));
    if (o.speed === 'fast') ex.push(R.pick(['szybcy wrogowie', 'wrogowie są szybcy']));
    if (o.speed === 'slow') ex.push(R.pick(['powolni wrogowie', 'wrogowie są powolni']));
    if (platC || (platSaid && !head.includes('po '))) ex.push(`${platSaid && !head.includes('po ') ? nPlat + ' ' : ''}${platC ? agree(R.pick(COLOR_WORDS[platC].pl), PL.platforma, 'nom', true) + ' ' : ''}platform${platSaid && !head.includes('po ') && nPlat >= 5 ? '' : 'y'}`);
    return assemble(R, w, [head], ex, 'pl');
  };
  return { genre: 'platformer', code, en, pl };
}

function genRunner(R) {
  const hero = R.pick([...ROLES.character, 'car', 'dragon']);
  const obs = pickDistinct(R, ROLES.obstacle, [hero]);
  const hc = maybeColor(R, 0.25), oc = maybeColor(R, 0.2);
  const w = worldSpec(R, { sky: 'day', ground: 'grass', view: 'side' }, { player: true, chase: false, grounds: ['grass', 'sand', 'snow', 'stone', 'ice'] });
  const o = gameOpts(R, { lives: true, timer: true, goal: true, fast: true });
  const coins = R.chance(0.3) ? pickDistinct(R, ROLES.collectible, [hero, obs]) : null;
  const flyer = R.chance(0.2) ? pickDistinct(R, ROLES.flyer, [hero, obs]) : null;
  const he = ENT[hero], oe = ENT[obs];
  const speed = o.speed === 'fast' ? 11 : o.speed === 'slow' ? 5 : 7;
  const code = [worldCode(w)];
  code.push(`add(${q(hero)}, ${objLit({ shape: he.shape, color: hc || he.color, x: -7 })}).controls('runner').jump(4)`);
  code.push(`spawn(${q(obs)}, ${objLit({ shape: oe.shape, color: oc || oe.color, every: 1.5, from: 'right', onGround: true })}).move('left', ${speed})`);
  if (flyer) code.push(`spawn(${q(flyer)}, ${objLit({ shape: ENT[flyer].shape, color: ENT[flyer].color, every: 4, from: 'right' })}).move('left', ${speed + 2})`);
  if (coins) code.push(`spawn(${q(coins)}, ${objLit({ shape: ENT[coins].shape, color: ENT[coins].color, every: 2, from: 'right' })}).move('left', ${speed}).spin(1)`);
  code.push(`hit(${q(hero)}, ${q(obs)}, () => ${o.lives ? 'hurt()' : 'lose()'})`);
  if (flyer) code.push(`hit(${q(hero)}, ${q(flyer)}, () => ${o.lives ? 'hurt()' : 'lose()'})`);
  if (coins) code.push(`hit(${q(hero)}, ${q(coins)}, (p, c) => { c.pop(); score(5); sound('coin') })`);
  code.push(`every(1, () => score(1))`);
  if (o.lives) code.push(`lives(${o.lives})`);
  if (o.goal) code.push(`goal(${o.goal})`);
  if (o.timer) code.push(`timer(${o.timer}, 'win')`);
  code.push(...worldTailCode(w));
  const en = () => {
    const H = ge(R, hero, false, hc), O = ge(R, obs, true, oc);
    const head = R.pick([
      () => genreEn(R, w, ['endless runner', 'runner game', 'runner']) + ` with ${H.a} ${H.s}`,
      () => `${R.pick(VERB_EN)} ${genreEn(R, w, ['endless runner', 'game'])} where ${H.a} ${H.s} runs and jumps over ${O.pl}`,
      () => `${H.a} ${H.s} jumping over ${O.pl}` + (modeEn(R, w) ? ' ' + modeEn(R, w) : ''),
      () => genreEn(R, w, ['dino game', 'chrome dino game', 'runner']) + ` but with ${H.a} ${H.s}`,
    ])();
    const ex = extrasEn(R, o, null);
    if (!head.includes(O.pl)) ex.push(`${R.pick(['jump over', 'dodge', 'avoid'])} ${O.pl}`);
    if (o.speed) ex.push(o.speed === 'fast' ? R.pick(['really fast', 'super fast']) : R.pick(['slow', 'nice and slow']));
    if (coins) ex.push(`collect ${ge(R, coins, true).pl}`);
    if (flyer) ex.push(R.pick([`and flying ${ge(R, flyer, true).pl}`, `duck under ${ge(R, flyer, true).pl}`]));
    return assemble(R, w, [head], ex, 'en');
  };
  const pl = () => {
    const H = gp(R, hero, 'nom', false, hc), Oa = gp(R, obs, 'acc', true, oc);
    const head = R.pick([
      () => genrePl(R, w, ['nieskończony runner', 'runner', 'gra w bieganie']) + ` z ${gp(R, hero, 'ins', false, hc).s}`,
      () => `${R.pick(VERB_PL)} ${genrePl(R, w, ['grę', 'runnera'])} w której ${H.s} biegnie i przeskakuje ${Oa.s}`,
      () => `${H.s} przeskakujący ${Oa.s}` + (modePl(R, w) ? ' ' + modePl(R, w) : ''),
      () => genrePl(R, w, ['gra jak dinozaur z chrome', 'runner']) + ` ale z ${gp(R, hero, 'ins', false, hc).s}`,
    ])();
    const ex = extrasPl(R, o, null);
    if (!head.includes('przeskak')) ex.push(`${R.pick(['przeskakuj', 'omijaj'])} ${Oa.s}`);
    if (o.speed) ex.push(o.speed === 'fast' ? R.pick(['bardzo szybko', 'super szybka']) : R.pick(['wolna', 'powoli']));
    if (coins) ex.push(`zbieraj ${gp(R, coins, 'acc', true).s}`);
    if (flyer) ex.push(R.pick([`i latające ${gp(R, flyer, 'nom', true).s}`, `uważaj na ${gp(R, flyer, 'acc', true).s} w powietrzu`]));
    return assemble(R, w, [head], ex, 'pl');
  };
  return { genre: 'runner', code, en, pl };
}

function genCollector(R) {
  const vehicle = R.chance(0.45);
  const player = vehicle ? R.pick(['car', 'tank', 'ufo', 'spaceship']) : R.pick(ROLES.character);
  const item = pickDistinct(R, ROLES.collectible, [player]);
  const pc = maybeColor(R, 0.3), ic = maybeColor(R, 0.15);
  const w = worldSpec(R, { sky: 'day', ground: 'grass', view: 'top' }, { player: true, grounds: ['grass', 'sand', 'snow', 'stone', 'ice', 'water'] });
  w.viewSaid = R.chance(0.3);
  const o = gameOpts(R, { lives: true, timer: true, goal: true, fast: true });
  const n = R.pick([5, 8, 10, 12, 15, 20]);
  const nSaid = R.chance(0.4);
  const chaser = R.chance(0.35) ? pickDistinct(R, ROLES.chaser, [player, item]) : null;
  const trees = R.chance(0.2);
  const walls = R.chance(0.1);
  const all = !o.goal && R.chance(0.35);
  const pe = ENT[player], ie = ENT[item];
  const code = [worldCode(w)];
  code.push(`add(${q(player)}, ${objLit({ shape: pe.shape, color: pc || pe.color })}).controls(${q(vehicle && player !== 'ufo' ? 'car' : 'topdown')}, ${o.speed === 'fast' ? 10 : 7})`);
  if (walls) code.push(`walls()`);
  if (trees) code.push(`scatter('tree', { shape: 'tree', color: 'green', count: 6 }).solid()`);
  code.push(`scatter(${q(item)}, ${objLit({ shape: ie.shape, color: ic || ie.color, count: n })}).spin(1)`);
  if (chaser) code.push(`spawn(${q(chaser)}, ${objLit({ shape: ENT[chaser].shape, color: ENT[chaser].color, every: 3, from: 'around', max: 8 })}).follow(${q(player)}, ${o.speed === 'fast' ? 4 : 2.5})`);
  code.push(`hit(${q(player)}, ${q(item)}, (p, c) => { c.pop(); score(1); sound('coin') })`);
  if (chaser) code.push(`hit(${q(player)}, ${q(chaser)}, () => ${o.lives ? 'hurt()' : 'lose()'})`);
  if (all) code.push(`goal(${n})`);
  if (o.goal) code.push(`goal(${Math.min(o.goal, n)})`);
  if (o.lives) code.push(`lives(${o.lives})`);
  if (o.timer) code.push(`timer(${o.timer}, 'lose')`);
  code.push(...worldTailCode(w));
  const en = () => {
    const P = ge(R, player, false, pc), I = ge(R, item, true, ic);
    const num = nSaid || all ? `${n} ` : '';
    const head = R.pick([
      () => `${R.pick(['collect', 'pick up', 'gather'])} ${num}${I.pl} with ${P.a} ${P.s}`,
      () => `${R.pick(VERB_EN)} ${genreEn(R, w, ['game', 'collecting game'])} where ${R.pick(['I', 'you'])} ${vehicle ? 'drive' : 'walk around as'} ${P.a} ${P.s} and collect ${num}${I.pl}`,
      () => genreEn(R, w, ['top-down game', 'collecting game', 'game']) + ` with ${P.a} ${P.s} collecting ${num}${I.pl}`,
      () => `${P.a} ${P.s} ${R.pick(['collecting', 'picking up', 'eating'])} ${num}${I.pl}` + (modeEn(R, w) ? ' ' + modeEn(R, w) : ''),
    ])();
    const ex = extrasEn(R, o, I.pl);
    if (chaser) ex.push(R.pick([`while ${ge(R, chaser, true).pl} chase you`, `avoid the ${ge(R, chaser, true).pl}`, `and ${ge(R, chaser, true).pl} that follow me`]));
    if (trees) ex.push(R.pick(['with trees in the way', 'trees as obstacles']));
    if (walls) ex.push(R.pick(['with walls around', 'in a walled arena']));
    if (all) ex.push(R.pick(['collect all of them to win', 'get them all']));
    if (o.speed === 'fast') ex.push('fast');
    return assemble(R, w, [head], ex, 'en');
  };
  const pl = () => {
    const num = nSaid || all ? `${n} ` : '';
    const I = gp(R, item, num ? 'gen' : 'acc', true, ic), P = gp(R, player, 'ins', false, pc);
    const head = R.pick([
      () => `${R.pick(['zbieraj', 'zbierz', 'łap'])} ${num}${I.s} ${P.s}`,
      () => `${R.pick(VERB_PL)} ${genrePl(R, w, ['grę', 'grę w zbieranie'])} w której ${vehicle ? 'jeżdżę' : 'chodzę'} ${P.s} i zbieram ${num}${I.s}`,
      () => genrePl(R, w, ['gra z widokiem z góry', 'gra w zbieranie', 'gra']) + ` gdzie ${gp(R, player, 'nom', false, pc).s} zbiera ${num}${I.s}`,
      () => `${gp(R, player, 'nom', false, pc).s} ${R.pick(['zbierający', 'zjadający'])} ${num}${I.s}` + (modePl(R, w) ? ' ' + modePl(R, w) : ''),
    ])();
    const ex = extrasPl(R, o, gp(R, item, 'gen', true).s);
    if (chaser) ex.push(R.pick([`a ${gp(R, chaser, 'nom', true).s} mnie gonią`, `uciekaj przed ${gp(R, chaser, 'ins', true).s}`, `i ${gp(R, chaser, 'nom', true).s} które mnie gonią`]));
    if (trees) ex.push(R.pick(['z drzewami na drodze', 'drzewa jako przeszkody']));
    if (walls) ex.push(R.pick(['ze ścianami dookoła', 'na zamkniętej arenie']));
    if (all) ex.push(R.pick(['zbierz wszystkie żeby wygrać', 'zbierz je wszystkie']));
    if (o.speed === 'fast') ex.push('szybka');
    return assemble(R, w, [head], ex, 'pl');
  };
  return { genre: 'collector', code, en, pl };
}

function genDodge(R) {
  const player = R.pick([...ROLES.character, 'car']);
  const thing = pickDistinct(R, ['meteor', 'asteroid', 'rock', 'bomb', 'fireball', 'snowball', 'apple', 'star', 'box', 'cube', 'heart', 'ghost', 'spider', 'pumpkin'], [player]);
  const catchIt = ['apple', 'star', 'heart'].includes(thing) && R.chance(0.6);
  const pc = maybeColor(R, 0.25), tc = maybeColor(R, 0.2);
  const w = worldSpec(R, { sky: 'day', ground: 'grass', view: 'side' }, { player: true, chase: false });
  const o = gameOpts(R, { lives: true, timer: true, goal: true, fast: true, many: true });
  if (!catchIt && !o.timer && !o.goal && R.chance(0.6)) o.timer = 30;
  const pe = ENT[player], te = ENT[thing];
  const speed = o.speed === 'fast' ? 9 : o.speed === 'slow' ? 3 : 5;
  const code = [worldCode(w)];
  code.push(`add(${q(player)}, ${objLit({ shape: pe.shape, color: pc || pe.color, y: 1 })}).controls('paddle', 8)`);
  code.push(`spawn(${q(thing)}, ${objLit({ shape: te.shape, color: tc || te.color, every: o.many ? 0.3 : 0.6, from: 'top' })}).move('down', ${speed}).spin(1)`);
  if (catchIt) {
    code.push(`hit(${q(player)}, ${q(thing)}, (p, t) => { t.pop(); score(1); sound('coin') })`);
    code.push(`out(${q(thing)}, () => hurt())`);
    if (!o.lives) o.lives = 3;
  } else {
    code.push(`hit(${q(player)}, ${q(thing)}, (p, t) => { t.explode(); hurt() })`);
    code.push(`every(1, () => score(1))`);
  }
  code.push(`lives(${o.lives || 3})`);
  if (o.goal) code.push(`goal(${o.goal})`);
  if (o.timer) code.push(`timer(${o.timer}, 'win')`);
  code.push(...worldTailCode(w));
  const en = () => {
    const P = ge(R, player, false, pc), T = ge(R, thing, true, tc);
    const head = catchIt ? R.pick([
      () => `catch ${R.pick(['falling', 'the falling'])} ${T.pl} with ${P.a} ${P.s}`,
      () => `${R.pick(VERB_EN)} ${genreEn(R, w, ['game', 'catching game'])} where ${P.a} ${P.s} catches ${T.pl} falling from the sky`,
    ])() : R.pick([
      () => `${R.pick(['dodge', 'avoid'])} ${R.pick(['falling', 'the falling'])} ${T.pl}` + (modeEn(R, w) ? ' ' + modeEn(R, w) : ''),
      () => `${R.pick(VERB_EN)} ${genreEn(R, w, ['game', 'dodging game', 'survival game'])} where ${T.pl} fall from the sky and ${P.a} ${P.s} has to dodge them`,
      () => `${P.a} ${P.s} ${R.pick(['dodging', 'running from'])} ${T.pl} raining from the sky`,
    ])();
    const ex = extrasEn(R, o, catchIt ? T.pl : null);
    if (o.many) ex.push(R.pick(['lots of them', 'a lot of them falling']));
    if (o.speed) ex.push(o.speed === 'fast' ? 'falling fast' : 'falling slowly');
    if (catchIt) ex.push(R.pick(["don't let them hit the ground", 'lose a life if you miss one']));
    if ((pc || player !== 'person') && !head.includes(P.sg)) ex.push(R.pick([`play as ${P.a} ${P.sg}`, `you are ${P.a} ${P.sg}`]));
    return assemble(R, w, [head], ex, 'en');
  };
  const pl = () => {
    const P = gp(R, player, 'ins', false, pc), Tg = gp(R, thing, 'gen', true, tc, 'spadający');
    const head = catchIt ? R.pick([
      () => `łap ${gp(R, thing, 'acc', true, tc, 'spadający').s} ${P.s}`,
      () => `${R.pick(VERB_PL)} ${genrePl(R, w, ['grę', 'grę w łapanie'])} w której ${gp(R, player, 'nom', false, pc).s} łapie ${gp(R, thing, 'acc', true, tc).s} spadające z nieba`,
    ])() : R.pick([
      () => `unikaj ${Tg.s}` + (modePl(R, w) ? ' ' + modePl(R, w) : ''),
      () => `${R.pick(VERB_PL)} ${genrePl(R, w, ['grę', 'grę w unikanie', 'grę survivalową'])} w której ${gp(R, thing, 'nom', true, tc).s} spadają z nieba a ${gp(R, player, 'nom', false, pc).s} musi ich unikać`,
      () => `${gp(R, player, 'nom', false, pc).s} ucieka przed ${gp(R, thing, 'ins', true, tc, 'spadający').s}`,
    ])();
    const ex = extrasPl(R, o, catchIt ? gp(R, thing, 'gen', true).s : null);
    if (o.many) ex.push(R.pick(['dużo ich spada', 'mnóstwo']));
    if (o.speed) ex.push(o.speed === 'fast' ? 'spadają szybko' : 'spadają powoli');
    if (catchIt) ex.push(R.pick(['nie daj im spaść na ziemię', 'tracisz życie jak jakiś spadnie']));
    { const pn = gp(R, player, 'nom', false, pc).s; if ((pc || player !== 'person') && !head.includes(pn) && !head.includes(P.s)) ex.push(R.pick([`grasz jako ${pn}`, `sterujesz ${P.s}`])); }
    return assemble(R, w, [head], ex, 'pl');
  };
  return { genre: 'dodge', code, en, pl };
}

function genFlappy(R) {
  const player = R.pick(['bird', 'rocket', 'fish', 'ghost', 'bee', 'bat', 'dragon', 'airplane', 'ufo', 'cat']);
  const obs = R.pick(['pipe', 'pipe', 'pipe', 'rock', 'cactus', 'tree', 'box', 'cloud']);
  const pc = maybeColor(R, 0.3), oc = maybeColor(R, 0.2);
  const w = worldSpec(R, { sky: 'day', ground: 'none', view: 'side' }, { player: true, noGround: true, chase: false });
  if (w.sky === 'underwater') w.ground = 'none';
  const o = gameOpts(R, { goal: true, fast: true });
  const pe = ENT[player], oe = ENT[obs];
  const size = obs === 'pipe' ? [1.5, 5, 1.5] : obs === 'cloud' ? undefined : [1.5, 4, 1.5];
  const code = [worldCode(w)];
  code.push(`add(${q(player)}, ${objLit({ shape: pe.shape, color: pc || pe.color, x: -6, y: 7 })}).controls('flappy')`);
  code.push(`spawn(${q(obs)}, ${objLit({ shape: oe.shape, color: oc || oe.color, size, every: 1.6, from: 'right' })}).move('left', ${o.speed === 'fast' ? 8 : o.speed === 'slow' ? 3 : 5})`);
  code.push(`hit(${q(player)}, ${q(obs)}, () => lose())`);
  code.push(`out(${q(obs)}, () => score(1))`);
  if (o.goal) code.push(`goal(${o.goal})`);
  code.push(...worldTailCode(w));
  const en = () => {
    const P = ge(R, player, false, pc), O = ge(R, obs, true, oc);
    const head = R.pick([
      () => `flappy ${player === 'bird' && !pc ? 'bird' : P.s}` + (modeEn(R, w) ? ' ' + modeEn(R, w) : ''),
      () => `${R.pick(VERB_EN)} ${genreEn(R, w, ['flappy bird clone', 'flappy bird game', 'game like flappy bird'])} with ${P.a} ${P.s}`,
      () => `${genreEn(R, w, ['flappy bird', 'flappy game'])} but ${R.pick(['you are', 'with'])} ${P.a} ${P.s} ${obs !== 'pipe' || oc ? 'and ' + O.pl + ' instead of pipes' : ''}`,
    ])();
    const ex = extrasEn(R, o, null);
    if ((obs !== 'pipe' || oc) && !head.includes(O.pl)) ex.push(`fly between ${O.pl}`);
    if (o.speed) ex.push(o.speed === 'fast' ? 'fast' : 'easy and slow');
    return assemble(R, w, [head], ex, 'en');
  };
  const pl = () => {
    const P = gp(R, player, 'ins', false, pc);
    const head = R.pick([
      () => `flappy bird z ${P.s}` + (modePl(R, w) ? ' ' + modePl(R, w) : ''),
      () => `${R.pick(VERB_PL)} ${genrePl(R, w, ['grę jak flappy bird', 'klona flappy bird'])} z ${P.s}`,
      () => `${genrePl(R, w, ['flappy bird', 'gra jak flappy bird'])} ale ${gp(R, player, 'nom', false, pc).s} ${obs !== 'pipe' || oc ? 'i ' + gp(R, obs, 'nom', true, oc).s + ' zamiast rur' : ''}`,
    ])();
    const ex = extrasPl(R, o, null);
    if ((obs !== 'pipe' || oc) && !head.includes('zamiast')) ex.push(`lataj między ${gp(R, obs, 'ins', true, oc).s}`);
    if (o.speed) ex.push(o.speed === 'fast' ? 'szybka' : 'łatwa i wolna');
    return assemble(R, w, [head], ex, 'pl');
  };
  return { genre: 'flappy', code, en, pl };
}

function genBreakout(R) {
  const rows = R.pick([2, 3, 4]);
  const rowsSaid = R.chance(0.3);
  const bc = R.chance(0.5) ? 'rainbow' : R.chance(0.4) ? R.pick(COLOR_KEYS) : null;
  const ballC = maybeColor(R, 0.2), padC = maybeColor(R, 0.2);
  const w = worldSpec(R, { sky: 'night', ground: 'none', view: 'side' }, { noGround: true });
  const fast = R.chance(0.15);
  const n = rows * 8;
  const code = [worldCode(w)];
  code.push(`add('paddle', ${objLit({ shape: 'box', color: padC || 'white', size: [4, 0.5, 1], y: 1 })}).controls('paddle', 9)`);
  code.push(`add('ball', ${objLit({ shape: 'sphere', color: ballC || 'yellow', size: 0.6, y: 3 })}).ricochet(${fast ? 13 : 9})`);
  code.push(`add('brick', ${objLit({ shape: 'cube', color: bc || 'orange', size: [2.4, 0.8, 1], count: n, grid: 8, gap: 2.6, y: 12 })}).solid()`);
  code.push(`hit('ball', 'brick', (b, br) => { br.pop(); score(1) })`);
  code.push(`out('ball', () => lose())`);
  code.push(`goal(${n})`);
  code.push(...worldTailCode(w));
  const en = () => {
    const head = R.pick([
      () => genreEn(R, w, ['breakout', 'brick breaker', 'arkanoid', 'breakout game']),
      () => `${R.pick(VERB_EN)} ${genreEn(R, w, ['breakout', 'brick breaker game', 'arkanoid clone'])}`,
      () => `break ${bc ? R.pick(COLOR_WORDS[bc].en) + ' ' : ''}bricks with a ball and a paddle` + (modeEn(R, w) ? ' in ' + modeEn(R, w) : ''),
    ])();
    const ex = [];
    if (rowsSaid) ex.push(`${rows} rows of bricks`);
    if (bc && !head.includes('bricks')) ex.push(`${R.pick(COLOR_WORDS[bc].en)} bricks`);
    if (ballC) ex.push(`${R.pick(COLOR_WORDS[ballC].en)} ball`);
    if (padC) ex.push(`${R.pick(COLOR_WORDS[padC].en)} paddle`);
    if (fast) ex.push(R.pick(['fast ball', 'the ball is really fast']));
    return assemble(R, w, [head], ex, 'en');
  };
  const pl = () => {
    const head = R.pick([
      () => genrePl(R, w, ['arkanoid', 'breakout', 'gra w zbijanie cegieł']),
      () => `${R.pick(VERB_PL)} ${genrePl(R, w, ['arkanoida', 'grę w zbijanie cegiełek', 'breakout'])}`,
      () => `zbijaj ${bc ? agree(R.pick(COLOR_WORDS[bc].pl), PL.cegla, 'acc', true) + ' ' : ''}cegły piłką i paletką` + (modePl(R, w) ? ' ' + modePl(R, w) : ''),
    ])();
    const ex = [];
    if (rowsSaid) ex.push(`${rows} rzędy cegieł`);
    if (bc && !head.includes('cegły')) ex.push(`${agree(R.pick(COLOR_WORDS[bc].pl), PL.cegla, 'nom', true)} cegły`);
    if (ballC) ex.push(`${agree(R.pick(COLOR_WORDS[ballC].pl), PL.pilka, 'nom', false)} piłka`);
    if (padC) ex.push(`${agree(R.pick(COLOR_WORDS[padC].pl), PL.paletka, 'nom', false)} paletka`);
    if (fast) ex.push(R.pick(['szybka piłka', 'piłka leci bardzo szybko']));
    return assemble(R, w, [head], ex, 'pl');
  };
  return { genre: 'breakout', code, en, pl };
}

function genPopper(R) {
  const thing = R.pick(ROLES.tappable);
  const tc = R.chance(0.3) ? (R.chance(0.3) ? 'random' : R.pick(COLOR_KEYS)) : null;
  const from = R.pick(['bottom', 'bottom', 'top', 'around', 'inside']);
  const w = worldSpec(R, { sky: 'day', ground: 'grass', view: 'side' }, {});
  const o = gameOpts(R, { lives: true, timer: true, goal: true, fast: true, many: true });
  if (!o.lives && !o.timer && !o.goal) o.lives = 5;
  const te = ENT[thing];
  const move = from === 'bottom' ? `.move('up', ${o.speed === 'fast' ? 4 : 2})` : from === 'top' ? `.move('down', ${o.speed === 'fast' ? 4 : 2})` : from === 'around' ? `.wander(${o.speed === 'fast' ? 5 : 2})` : `.shrink(0.25)`;
  const code = [worldCode(w)];
  code.push(`spawn(${q(thing)}, ${objLit({ shape: te.shape, color: tc || te.color, every: o.many ? 0.4 : 0.8, from })})${move}.wobble(0.25, 3)`);
  code.push(`tap(${q(thing)}, (t) => { t.pop(); score(1) })`);
  if (from === 'bottom' || from === 'top') code.push(`out(${q(thing)}, () => hurt())`);
  if (o.lives) code.push(`lives(${o.lives})`);
  if (o.goal) code.push(`goal(${o.goal})`);
  if (o.timer) code.push(`timer(${o.timer}, 'win')`);
  code.push(...worldTailCode(w));
  const en = () => {
    const T = ge(R, thing, true, tc === 'random' ? null : tc);
    const col = tc === 'random' ? R.pick(['colorful ', 'random colored ']) : '';
    const head = R.pick([
      () => `${R.pick(['pop', 'click', 'tap'])} the ${col}${T.pl}` + (modeEn(R, w) ? ' ' + modeEn(R, w) : ''),
      () => `${R.pick(VERB_EN)} ${genreEn(R, w, ['clicker game', 'game', 'clicking game'])} where ${R.pick(['I', 'you'])} click ${col}${T.pl} to pop them`,
      () => genreEn(R, w, ['popping game', 'clicker']) + ` with ${col}${T.pl}`,
    ])();
    const ex = extrasEn(R, o, null);
    ex.push(R.pick({ bottom: ['they float up', `the ${T.pl} fly up from the bottom`, ''], top: ['they fall from the top', ''], around: ['they fly around', ''], inside: ['they appear and shrink', ''] }[from]));
    if (o.many) ex.push('lots of them');
    if (o.speed) ex.push(o.speed === 'fast' ? 'they are fast' : 'slow');
    return assemble(R, w, [head], ex.filter(Boolean), 'en');
  };
  const pl = () => {
    const col = tc === 'random' ? R.pick(['kolorowy', 'różnokolorowy']) : tc ? R.pick(COLOR_WORDS[tc].pl) : null;
    const Ta = gp(R, thing, 'acc', true, null, col);
    const head = R.pick([
      () => `${R.pick(['przebijaj', 'klikaj w', 'pękaj'])} ${Ta.s}` + (modePl(R, w) ? ' ' + modePl(R, w) : ''),
      () => `${R.pick(VERB_PL)} ${genrePl(R, w, ['klikankę', 'grę', 'grę w klikanie'])} w której klikam ${Ta.s} żeby je przebić`,
      () => genrePl(R, w, ['klikanka', 'gra w przebijanie']) + ` z ${gp(R, thing, 'ins', true, null, col).s}`,
    ])();
    const ex = extrasPl(R, o, null);
    ex.push(R.pick({ bottom: ['lecą do góry', 'wylatują od dołu', ''], top: ['spadają z góry', ''], around: ['latają dookoła', ''], inside: ['pojawiają się i znikają', ''] }[from]));
    if (o.many) ex.push('dużo ich');
    if (o.speed) ex.push(o.speed === 'fast' ? 'są szybkie' : 'powolne');
    return assemble(R, w, [head], ex.filter(Boolean), 'pl');
  };
  return { genre: 'popper', code, en, pl };
}

function genEscape(R) {
  const player = R.pick(ROLES.character);
  const chaser = pickDistinct(R, ROLES.chaser, [player]);
  const pc = maybeColor(R, 0.25), cc = maybeColor(R, 0.25);
  const w = worldSpec(R, { sky: 'night', ground: 'grass', view: 'top' }, { player: true });
  w.viewSaid = R.chance(0.25);
  const o = gameOpts(R, { lives: true, timer: true, fast: true, many: true });
  if (!o.timer) o.timer = 60;
  const stars = R.chance(0.35) ? pickDistinct(R, ROLES.collectible, [player, chaser]) : null;
  const pe = ENT[player], ce = ENT[chaser];
  const code = [worldCode(w)];
  code.push(`add(${q(player)}, ${objLit({ shape: pe.shape, color: pc || pe.color })}).controls('topdown', 7)`);
  code.push(`spawn(${q(chaser)}, ${objLit({ shape: ce.shape, color: cc || ce.color, every: o.many ? 1 : 2, from: 'around', max: 20 })}).follow(${q(player)}, ${o.speed === 'fast' ? 4.5 : o.speed === 'slow' ? 1.5 : 2.5})`);
  if (stars) {
    code.push(`scatter(${q(stars)}, ${objLit({ shape: ENT[stars].shape, color: ENT[stars].color, count: 10 })}).spin(1)`);
    code.push(`hit(${q(player)}, ${q(stars)}, (p, s) => { s.pop(); score(1); sound('coin') })`);
  }
  code.push(`hit(${q(player)}, ${q(chaser)}, () => ${o.lives ? 'hurt()' : 'lose()'})`);
  if (o.lives) code.push(`lives(${o.lives})`);
  code.push(`timer(${o.timer}, 'win')`);
  code.push(...worldTailCode(w));
  const en = () => {
    const P = ge(R, player, false, pc), C = ge(R, chaser, true, cc);
    const head = R.pick([
      () => `${R.pick(['run away from', 'escape the', 'survive the', 'hide from the'])} ${C.pl}` + (modeEn(R, w) ? ' ' + modeEn(R, w) : ''),
      () => `${R.pick(VERB_EN)} ${genreEn(R, w, ['survival game', 'game', 'chase game'])} where ${C.pl} chase ${P.a} ${P.s}`,
      () => `${P.a} ${P.s} ${R.pick(['running from', 'escaping'])} ${C.pl}`,
    ])();
    const ex = extrasEn(R, o, null).filter((x) => !/second/.test(x) || o.timer !== 60 || R.chance(0.5));
    if (o.timer !== 60 && !ex.some((x) => /second/.test(x))) ex.push(timerEn(R, o.timer));
    if (stars) ex.push(`collect ${ge(R, stars, true).pl}`);
    if (o.many) ex.push(R.pick(['hordes of them', `lots of ${C.pl}`]));
    if (o.speed) ex.push(o.speed === 'fast' ? `fast ${C.pl}` : `slow ${C.pl}`);
    if ((pc || player !== 'person') && !head.includes(P.sg)) ex.push(R.pick([`play as ${P.a} ${P.sg}`, `you are ${P.a} ${P.sg}`]));
    return assemble(R, w, [head], ex, 'en');
  };
  const pl = () => {
    const C = gp(R, chaser, 'ins', true, cc);
    const head = R.pick([
      () => `uciekaj przed ${C.s}` + (modePl(R, w) ? ' ' + modePl(R, w) : ''),
      () => `${R.pick(VERB_PL)} ${genrePl(R, w, ['grę survivalową', 'grę', 'grę w ucieczkę'])} w której ${gp(R, chaser, 'nom', true, cc).s} gonią ${gp(R, player, 'acc', false, pc).s}`,
      () => `${gp(R, player, 'nom', false, pc).s} ucieka przed ${C.s}`,
      () => `przetrwaj atak ${gp(R, chaser, 'gen', true, cc).s}`,
    ])();
    const ex = extrasPl(R, o, null);
    if (o.timer !== 60 && !ex.some((x) => /sekund/.test(x))) ex.push(timerPl(R, o.timer));
    if (stars) ex.push(`zbieraj ${gp(R, stars, 'acc', true).s}`);
    if (o.many) ex.push(R.pick(['całe hordy', 'mnóstwo ich']));
    if (o.speed) ex.push(o.speed === 'fast' ? 'szybcy przeciwnicy' : 'powolni przeciwnicy');
    { const pn = gp(R, player, 'nom', false, pc).s, pa = gp(R, player, 'acc', false, pc).s; if ((pc || player !== 'person') && !head.includes(pn) && !head.includes(pa)) ex.push(R.pick([`grasz jako ${pn}`, `jesteś ${gp(R, player, 'ins', false, pc).s}`])); }
    return assemble(R, w, [head], ex, 'pl');
  };
  return { genre: 'escape', code, en, pl };
}

const GENRES = { scene: [genScene, 30], theme: [genTheme, 6], shooter: [genShooter, 11], platformer: [genPlatformer, 10], runner: [genRunner, 8], collector: [genCollector, 9], dodge: [genDodge, 7], flappy: [genFlappy, 5], breakout: [genBreakout, 4], popper: [genPopper, 6], escape: [genEscape, 6] };

export function sample(R) {
  const w = Object.fromEntries(Object.entries(GENRES).map(([k, v]) => [k, v[1]]));
  const g = R.weighted(w);
  const s = GENRES[g][0](R);
  const lang = R.chance(0.55) ? 'en' : 'pl';
  const prompt = s[lang]();
  return { genre: s.genre, lang, prompt, code: s.code.join('\n') };
}

// ---------------------------------------------------------------- main --

if (process.argv[1] && process.argv[1].endsWith('generate.mjs')) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1]]] : a), []));
  const n = Number(args.n || 20);
  const seed = Number(args.seed || 1);
  const out = args.out;
  const check = args.check !== 'no';
  const R = makeR(seed);
  const stats = { kept: 0, bad: 0, dupe: 0, genres: {}, lang: { en: 0, pl: 0 } };
  const seen = new Set();
  const fd = out ? (fs.mkdirSync(path.dirname(out), { recursive: true }), fs.openSync(out, 'w')) : null;
  const badLog = [];
  const verdict = new Map();
  let i = 0;
  while (stats.kept < n && i < n * 4) {
    i++;
    const s = sample(R);
    const key = s.prompt + '\u0000' + s.code;
    if (seen.has(key)) { stats.dupe++; continue; }
    seen.add(key);
    if (check) {
      let v = verdict.get(s.code);
      if (!v) { v = validate(s.code, { seconds: 3, seed: 3 }); verdict.set(s.code, v); }
      if (!v.ok) { stats.bad++; if (badLog.length < 20) badLog.push({ ...s, why: v.error || v.warnings }); continue; }
    }
    stats.kept++;
    stats.genres[s.genre] = (stats.genres[s.genre] || 0) + 1;
    stats.lang[s.lang]++;
    const line = JSON.stringify({ prompt: s.prompt, code: s.code, genre: s.genre, lang: s.lang });
    if (fd) fs.writeSync(fd, line + '\n'); else console.log(`\n# [${s.genre}/${s.lang}] ${s.prompt}\n${s.code}`);
    if (fd && stats.kept % 20000 === 0) console.error(`${stats.kept} kept`);
  }
  if (fd) fs.closeSync(fd);
  console.error(JSON.stringify({ ...stats, uniquePrograms: verdict.size }, null, 1));
  if (badLog.length) console.error('bad samples:', JSON.stringify(badLog.slice(0, 5), null, 1));
}
