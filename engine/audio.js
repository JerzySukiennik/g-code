// G-Code audio: synthesised sound effects and tiny generative music loops.
// A recorded AudioBuffer registered under a sound name replaces the synth.

export function createAudio() {
  let ac = null, master = null, musicTimer = null, musicStyle = null;
  const recorded = {};
  const last = {};

  function ctx() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = 0.35;
      master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function tone(f0, f1, dur, type = 'square', vol = 0.3, delay = 0) {
    const a = ctx(), t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol = 0.4, lp = 2000) {
    const a = ctx();
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = buf; f.type = 'lowpass'; f.frequency.value = lp; g.gain.value = vol;
    s.connect(f).connect(g).connect(master);
    s.start();
  }

  const SFX = {
    jump: () => tone(300, 700, 0.15, 'square', 0.18),
    coin: () => { tone(988, 988, 0.08, 'square', 0.15); tone(1319, 1319, 0.25, 'square', 0.15, 0.08); },
    hit: () => { tone(200, 60, 0.25, 'sawtooth', 0.3); noise(0.15, 0.2, 800); },
    shoot: () => tone(900, 200, 0.12, 'square', 0.12),
    explode: () => { noise(0.6, 0.5, 900); tone(120, 30, 0.5, 'sine', 0.4); },
    pop: () => tone(500, 1200, 0.08, 'sine', 0.3),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.22, 'square', 0.16, i * 0.12)),
    lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, f * 0.98, 0.3, 'triangle', 0.25, i * 0.18)),
    powerup: () => [0, 1, 2, 3, 4, 5].forEach((i) => tone(400 + i * 120, 500 + i * 120, 0.07, 'square', 0.12, i * 0.05)),
    click: () => tone(1200, 1000, 0.03, 'square', 0.1),
    splash: () => noise(0.4, 0.3, 1500),
    bounce: () => tone(200, 500, 0.1, 'sine', 0.3),
  };

  function play(name) {
    const now = performance.now();
    if (last[name] && now - last[name] < 45) return;
    last[name] = now;
    try {
      if (recorded[name]) {
        const s = ctx().createBufferSource();
        s.buffer = recorded[name]; s.connect(master); s.start();
        return;
      }
      (SFX[name] || SFX.pop)();
    } catch { /* audio blocked until the first user gesture */ }
  }

  const SCALES = {
    happy: [0, 2, 4, 7, 9], chill: [0, 3, 5, 7, 10], spooky: [0, 1, 3, 6, 8], epic: [0, 2, 3, 7, 8], retro: [0, 4, 7, 11, 12],
  };

  function music(style) {
    if (style === musicStyle) return;
    stopMusic();
    musicStyle = style;
    if (!style || style === 'none') return;
    const scale = SCALES[style] || SCALES.happy;
    const root = style === 'spooky' ? 196 : style === 'epic' ? 147 : 262;
    const bpm = style === 'chill' ? 84 : style === 'epic' ? 128 : style === 'spooky' ? 70 : 116;
    const beat = 60 / bpm / 2;
    let step = 0;
    musicTimer = setInterval(() => {
      if (!ac || ac.state !== 'running') return;
      const deg = scale[(step * 3 + (step >> 3)) % scale.length] + (step % 16 > 11 ? 12 : 0);
      if (step % 2 === 0 || style === 'retro') tone(root * 2 ** (deg / 12), root * 2 ** (deg / 12), beat * 0.9, style === 'spooky' ? 'sine' : 'triangle', 0.07);
      if (step % 8 === 0) tone(root / 2 * 2 ** (scale[(step >> 3) % scale.length] / 12), root / 2, beat * 3, 'sine', 0.12);
      if (style === 'epic' || style === 'retro') if (step % 4 === 0) noise(0.05, 0.08, 400);
      step++;
    }, beat * 1000);
  }

  function stopMusic() { if (musicTimer) clearInterval(musicTimer); musicTimer = null; musicStyle = null; }

  async function record(name, blob) {
    const buf = await ctx().decodeAudioData(await blob.arrayBuffer());
    recorded[name] = buf;
  }

  function clearRecorded() { for (const k of Object.keys(recorded)) delete recorded[k]; }

  return { play, music, stopMusic, record, clearRecorded, unlock: ctx, names: Object.keys(SFX) };
}
