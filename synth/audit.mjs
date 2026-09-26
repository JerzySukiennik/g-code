// Consistency audit: every colour, mode, count and number that appears in a
// program must be recoverable from its prompt. Prints the violations.
import { sample } from './generate.mjs';
import { COLOR_WORDS, ENT } from './lexicon.mjs';

function makeR(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, 1 | t); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  return { f: r, chance: (p) => r() < p, int: (a, b) => a + Math.floor(r() * (b - a + 1)), pick: (xs) => xs[Math.floor(r() * xs.length)], shuffle: (xs) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }, weighted: (o) => { const tot = Object.values(o).reduce((a, b) => a + b, 0); let x = r() * tot; for (const [k, w] of Object.entries(o)) { if ((x -= w) <= 0) return k; } return Object.keys(o)[0]; } };
}
const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').toLowerCase();
const R = makeR(Number(process.argv[2] || 9));
const N = Number(process.argv[3] || 3000);
let bad = 0;
const byKind = {};
for (let i = 0; i < N; i++) {
  const s = sample(R);
  const p = strip(s.prompt);
  const problems = [];
  const mode = /mode: '(\w+)'/.exec(s.code)[1];
  if (/\b2d\b|dwuwymiar|two-dim/.test(p) && mode !== '2d') problems.push('mode2d');
  if (!/\b2d\b|dwuwymiar|two-dim/.test(p) && mode === '2d') problems.push('mode2d-unsaid');
  for (const m of s.code.matchAll(/(add|spawn|scatter)\('(\w+)', \{ shape: '\w+', color: '(\w+)'/g)) {
    const [, , key, color] = m;
    if (ENT[key] && ENT[key].color === color) continue;
    if (['theme', 'breakout'].includes(s.genre) && !/\b(red|blue|green|yellow|orange|purple|pink|white|black|gray|grey|brown|gold|czerwon|niebiesk|zielon|zolt|pomarancz|fiolet|roz|bial|czarn|szar|braz|zlot|teczow|rainbow|multicolor|kolorow)/.test(p)) continue;
    if (color === 'random' || color === 'rainbow') { if (!COLOR_WORDS[color][s.lang].some((w) => p.includes(strip(w).slice(0, 5)))) problems.push('color-' + color); continue; }
    const words = COLOR_WORDS[color][s.lang].map((w) => strip(w).slice(0, Math.max(4, strip(w).length - 3)));
    if (!words.some((w) => p.includes(w))) problems.push(`color:${key}=${color}`);
  }
  if (problems.length) { bad++; for (const k of problems) byKind[k.split(':')[0].split('=')[0]] = (byKind[k.split(':')[0].split('=')[0]] || 0) + 1; if (bad <= 8) console.log(problems.join(','), '|', s.genre, '|', s.prompt, '\n   ', s.code.split('\n').filter((l) => /color/.test(l)).join('\n    ')); }
}
console.log(`\n${bad}/${N} with problems`, byKind);
