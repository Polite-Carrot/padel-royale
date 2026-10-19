// Synthesised padel soundscape: turf bounces, glass booms, fence rattles, racket
// hits per stroke type, swing whooshes and crowd reactions. No audio files needed.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Sfx {
  constructor() {
    this.ctx = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(comp);
      this.verb = ctx.createConvolver();
      this.verb.buffer = this.impulse(1.3);
      this.verbIn = ctx.createGain();
      this.verbIn.gain.value = 0.22;
      this.verbIn.connect(this.verb).connect(this.master);
      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ready() {
    return this.ctx && this.ctx.state === 'running';
  }

  impulse(sec) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2);
    }
    return buf;
  }

  out(pan = 0, wet = 0) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    let node = g;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -0.9, 0.9);
      g.connect(p);
      node = p;
    }
    node.connect(this.master);
    if (wet > 0) {
      const w = ctx.createGain();
      w.gain.value = wet;
      node.connect(w).connect(this.verbIn);
    }
    return g;
  }

  env(param, t, peak, attack, decay) {
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  tone(dest, t, { type = 'sine', f0, f1 = f0, glide = 0.05, peak, attack = 0.001, decay }) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + glide);
    this.env(g.gain, t, peak, attack, decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  burst(dest, t, { filter = 'bandpass', f, q = 1, f1, sweep = 0, peak, attack = 0.001, decay }) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bq = this.ctx.createBiquadFilter();
    bq.type = filter;
    bq.frequency.setValueAtTime(f, t);
    if (f1) bq.frequency.exponentialRampToValueAtTime(f1, t + sweep);
    bq.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g.gain, t, peak, attack, decay);
    src.connect(bq).connect(g).connect(dest);
    src.start(t, Math.random() * 0.8);
    src.stop(t + attack + decay + 0.05);
  }

  // Pressurised ball on sand-filled turf: a short, dull "tok" with a little grit.
  bounce(speed, pan) {
    if (!this.ready || speed < 0.25) return;
    const t = this.ctx.currentTime, v = clamp(speed / 9, 0.08, 1);
    const o = this.out(pan);
    this.tone(o, t, { f0: 240 + v * 60, f1: 120, glide: 0.035, peak: 0.55 * v, decay: 0.07 });
    this.tone(o, t, { type: 'triangle', f0: 520, f1: 300, glide: 0.02, peak: 0.12 * v, decay: 0.03 });
    this.burst(o, t, { f: 1600, q: 0.8, peak: 0.22 * v, decay: 0.014 });
    this.burst(o, t, { filter: 'highpass', f: 3500, q: 0.5, peak: 0.05 * v, decay: 0.04 });
  }

  // Tempered glass panel: deep resonant boom with a hard click on top.
  glass(speed, pan) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, v = clamp(speed / 14, 0.1, 1);
    const o = this.out(pan, 0.5);
    this.tone(o, t, { f0: 95, f1: 62, glide: 0.25, peak: 0.75 * v, attack: 0.002, decay: 0.38 });
    this.tone(o, t, { f0: 188, f1: 150, glide: 0.15, peak: 0.25 * v, decay: 0.22 });
    this.burst(o, t, { f: 420, q: 5, peak: 0.25 * v, decay: 0.26 });
    this.burst(o, t, { filter: 'highpass', f: 2200, q: 0.7, peak: 0.3 * v, decay: 0.02 });
    this.bounce(speed * 0.6, pan);
  }

  // Metal mesh: buzzy clatter with inharmonic partials.
  mesh(speed, pan) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, v = clamp(speed / 12, 0.1, 1);
    const o = this.out(pan, 0.2);
    for (const f of [1270, 1890, 2710, 3480]) this.tone(o, t, { type: 'square', f0: f, peak: 0.025 * v, decay: 0.22 + Math.random() * 0.1 });
    for (let i = 0; i < 7; i++) {
      this.burst(o, t + i * 0.028 + Math.random() * 0.012, { f: 2400 + Math.random() * 1600, q: 3, peak: 0.22 * v * (1 - i / 8), decay: 0.02 });
    }
    this.tone(o, t, { f0: 140, f1: 90, glide: 0.08, peak: 0.25 * v, decay: 0.1 });
  }

  net(cord, pan) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const o = this.out(pan);
    if (cord) {
      this.tone(o, t, { type: 'triangle', f0: 1900, f1: 1400, glide: 0.03, peak: 0.12, decay: 0.05 });
      this.burst(o, t, { f: 3000, q: 2, peak: 0.12, decay: 0.03 });
    } else {
      this.burst(o, t, { filter: 'lowpass', f: 500, q: 0.7, peak: 0.45, attack: 0.004, decay: 0.12 });
      this.tone(o, t, { f0: 110, f1: 70, glide: 0.1, peak: 0.25, decay: 0.12 });
      for (let i = 0; i < 4; i++) this.burst(o, t + 0.02 + i * 0.03, { f: 1800, q: 4, peak: 0.05, decay: 0.02 });
    }
  }

  // Racket strike. Padel rackets (foam core, drilled face) give a hollow "pok"; overheads crack.
  hit(kind, power, pan) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, p = clamp(power, 0.2, 1.3);
    const o = this.out(pan, kind === 'smash' || kind === 'pop' ? 0.35 : 0.12);
    switch (kind) {
      case 'smash':
      case 'pop': {
        const big = kind === 'pop' ? 1.25 : 1;
        this.burst(o, t, { filter: 'highpass', f: 1400, q: 0.8, peak: 0.85 * big, decay: 0.035 });
        this.tone(o, t, { type: 'triangle', f0: 820, f1: 360, glide: 0.05, peak: 0.6 * big, decay: 0.07 });
        this.tone(o, t, { f0: 150, f1: 70, glide: 0.08, peak: 0.7 * big, attack: 0.002, decay: 0.12 });
        this.burst(o, t + 0.004, { f: 1100, q: 1.2, peak: 0.4 * big, decay: 0.05 });
        break;
      }
      case 'lob':
        this.tone(o, t, { type: 'triangle', f0: 760, f1: 520, glide: 0.04, peak: 0.28 * p, decay: 0.06 });
        this.burst(o, t, { f: 900, q: 1, peak: 0.22 * p, attack: 0.003, decay: 0.05 });
        this.burst(o, t, { filter: 'highpass', f: 2500, peak: 0.06, attack: 0.01, decay: 0.08 });
        break;
      case 'drop':
        this.tone(o, t, { type: 'triangle', f0: 640, f1: 420, glide: 0.03, peak: 0.2 * p, decay: 0.045 });
        this.burst(o, t, { filter: 'lowpass', f: 1200, q: 0.7, peak: 0.22 * p, decay: 0.035 });
        break;
      case 'volley':
        this.tone(o, t, { type: 'triangle', f0: 1080, f1: 700, glide: 0.025, peak: 0.42 * p, decay: 0.035 });
        this.burst(o, t, { f: 1500, q: 1.4, peak: 0.4 * p, decay: 0.018 });
        this.tone(o, t, { f0: 260, f1: 180, glide: 0.03, peak: 0.2 * p, decay: 0.04 });
        break;
      case 'bandeja':
        this.tone(o, t, { type: 'triangle', f0: 920, f1: 560, glide: 0.04, peak: 0.42 * p, decay: 0.055 });
        this.burst(o, t, { f: 1250, q: 1.1, peak: 0.42 * p, decay: 0.03 });
        this.burst(o, t + 0.006, { filter: 'highpass', f: 3000, peak: 0.12, decay: 0.05 });
        this.tone(o, t, { f0: 210, f1: 140, glide: 0.04, peak: 0.25 * p, decay: 0.06 });
        break;
      default: // drive / serve
        this.tone(o, t, { type: 'triangle', f0: 940 + p * 120, f1: 600, glide: 0.035, peak: 0.45 * p, decay: 0.05 });
        this.burst(o, t, { f: 1300, q: 1.3, peak: 0.5 * p, decay: 0.022 });
        this.tone(o, t, { f0: 240, f1: 160, glide: 0.04, peak: 0.28 * p, decay: 0.055 });
        break;
    }
  }

  whoosh(strength, pan) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, s = clamp(strength, 0.2, 1.4);
    const o = this.out(pan);
    this.burst(o, t, { f: 350, f1: 1500 + s * 600, sweep: 0.16, q: 1.6, peak: 0.16 * s, attack: 0.09, decay: 0.12 });
  }

  // Crowd: individual claps over a murmuring roar.
  crowd(intensity, cheer = false) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, k = clamp(intensity, 0.1, 1.5);
    const o = this.out(0, 0.6);
    const dur = 1.1 + k * 0.9;
    const claps = Math.floor(24 + k * 60);
    for (let i = 0; i < claps; i++) {
      const at = t + Math.pow(Math.random(), 1.6) * dur;
      this.burst(o, at, { f: 1300 + Math.random() * 1500, q: 1.4, peak: (0.03 + Math.random() * 0.05) * k, decay: 0.012 + Math.random() * 0.01 });
    }
    if (cheer) {
      this.burst(o, t, { filter: 'bandpass', f: 520, f1: 760, sweep: 0.5, q: 1.2, peak: 0.18 * k, attack: 0.18, decay: dur });
      this.burst(o, t + 0.05, { filter: 'bandpass', f: 1100, f1: 1400, sweep: 0.5, q: 2, peak: 0.07 * k, attack: 0.2, decay: dur * 0.8 });
    }
  }

  ooh() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const o = this.out(0, 0.6);
    this.burst(o, t, { filter: 'bandpass', f: 420, f1: 300, sweep: 0.8, q: 3, peak: 0.16, attack: 0.15, decay: 0.8 });
    this.burst(o, t, { filter: 'bandpass', f: 800, f1: 620, sweep: 0.8, q: 4, peak: 0.07, attack: 0.15, decay: 0.7 });
  }
}
