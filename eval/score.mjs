// Scores eval/generate.py output: does each program load and run, does it
// match the expected program exactly, and how close is it line by line.
import fs from 'node:fs';
import { validate } from '../engine/validate.mjs';

const rows = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l));
let ok = 0, exact = 0, withExp = 0, lineHits = 0, lineTot = 0;
const byGenre = {};
for (const r of rows) {
  const v = validate(r.generated, { seconds: 3 });
  r.ok = v.ok; r.why = v.error || v.warnings.join('; ');
  if (v.ok) ok++;
  if (r.expected) {
    withExp++;
    if (r.generated.trim() === r.expected.trim()) exact++;
    const exp = new Set(r.expected.split('\n'));
    for (const l of r.generated.split('\n')) { lineTot++; if (exp.has(l)) lineHits++; }
    const g = byGenre[r.genre] || (byGenre[r.genre] = { n: 0, ok: 0, exact: 0 });
    g.n++; if (v.ok) g.ok++; if (r.generated.trim() === r.expected.trim()) g.exact++;
  }
}
console.log(`runs: ${ok}/${rows.length} (${(100 * ok / rows.length).toFixed(1)}%)`);
if (withExp) console.log(`exact: ${exact}/${withExp} (${(100 * exact / withExp).toFixed(1)}%)  line precision ${(100 * lineHits / lineTot).toFixed(1)}%`);
for (const [g, s] of Object.entries(byGenre)) console.log(`  ${g.padEnd(11)} ok ${s.ok}/${s.n}  exact ${s.exact}/${s.n}`);
if (process.argv.includes('--show')) for (const r of rows.slice(0, 60)) console.log(`\n# ${r.ok ? '✓' : '✗ ' + r.why} — ${r.prompt}\n${r.generated}`);
