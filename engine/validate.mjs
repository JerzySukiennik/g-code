// Headless check for a G-Code program: loads it into the core, simulates a few
// seconds with scripted input, and reports errors, warnings and what exists.
import { createCore } from './core.js';

export function validate(code, { seconds = 6, seed = 7 } = {}) {
  const c = createCore({ seed, headless: true });
  const res = { ok: true, error: null, warnings: [], slots: [], things: 0, state: 'play' };
  try { c.load(code); } catch (e) { return { ...res, ok: false, error: 'load: ' + e.message }; }
  const script = ['arrowright', 'arrowright', ' ', 'arrowleft', 'arrowup', ' ', 'arrowdown', 'd', 'w'];
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) {
    if (i % 30 === 0) {
      const k = script[(i / 30) % script.length];
      c.input.keys.clear(); c.input.keys.add(k); c.input.pressed.add(k);
      c.input.pointer.u = Math.sin(i) * 6; c.input.pointer.v = 5; c.input.pointer.clicked = i % 90 === 0;
    }
    try { c.step(dt); } catch (e) { return { ...res, ok: false, error: 'step: ' + e.message }; }
  }
  res.warnings = c.warnings;
  res.errors = c.errors || 0;
  res.slots = [...c.slots.keys()];
  res.things = c.things.filter((t) => t.alive).length;
  res.state = c.state;
  res.mode = c.world.mode;
  res.view = c.view;
  if (res.errors || res.warnings.some((w) => /unknown|not a function|undefined/.test(w))) res.ok = false;
  return res;
}

if (process.argv[1] && process.argv[1].endsWith('validate.mjs')) {
  const fs = await import('node:fs');
  const code = fs.readFileSync(process.argv[2] || 0, 'utf8');
  console.log(JSON.stringify(validate(code), null, 1));
}
