// Sound: real recordings for wind, footsteps, the door and drips (free recordings, see sounds/CREDITS.md); the rest is made in code.
const FILES = ['wind-open', 'step-stone', 'step-gravel', 'door', 'creak', 'drip-stone'];

export class Sound {
  constructor() { this.ac = null; this.bufs = {}; this.ready = false; this.muted = false; this.loops = {}; }
  // Must be called from a tap or key press: browsers only allow sound after the player does something.
  async start(base) {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ac = this.ac = new AC(); this.master = ac.createGain(); this.master.gain.value = this.muted ? 0 : 0.9; this.master.connect(ac.destination);
    this._synthLoops();
    await Promise.all(FILES.map(async (n) => {
      try { const r = await fetch(base + n + '.mp3'); if (!r.ok) return; const b = await ac.decodeAudioData(await r.arrayBuffer()); this.bufs[n] = n === 'wind-open' ? [b] : this._takes(b); } catch (e) { /* that sound is simply missing */ }
    }));
    this.ready = true; this._wind();
  }
  // A file holds several takes one after another with a short silence between; cut them apart.
  _takes(buf) {
    const d = buf.getChannelData(0), sr = buf.sampleRate, win = Math.round(sr * 0.01), out = []; let start = -1, quiet = 0;
    for (let i = 0; i < d.length; i += win) {
      let m = 0; for (let j = i; j < Math.min(d.length, i + win); j++) { const a = Math.abs(d[j]); if (a > m) m = a; }
      if (m > 0.012) { if (start < 0) start = i; quiet = 0; }
      else if (start >= 0 && ++quiet > 6) { if (i - start > sr * 0.05) out.push([start, i]); start = -1; quiet = 0; }
    }
    if (start >= 0) out.push([start, d.length]);
    return (out.length ? out : [[0, d.length]]).map(([a, b]) => { const nb = this.ac.createBuffer(buf.numberOfChannels, b - a, sr); for (let c = 0; c < buf.numberOfChannels; c++) nb.copyToChannel(buf.getChannelData(c).subarray(a, b), c); return nb; });
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ac.currentTime, 0.05); }
  play(name, { gain = 1, rate = 1, lp = 0, delay = 0 } = {}) {
    const takes = this.bufs[name]; if (!takes || !this.ac || this.ac.state !== 'running') return;
    const ac = this.ac, src = ac.createBufferSource(), g = ac.createGain(); src.buffer = takes[(Math.random() * takes.length) | 0]; src.playbackRate.value = rate; g.gain.value = gain;
    let node = src; if (lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; src.connect(f); node = f; }
    node.connect(g); g.connect(this.master); src.start(ac.currentTime + delay);
  }
  _noise(sec, fn) { const ac = this.ac, n = Math.round(ac.sampleRate * sec), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0); fn(d, ac.sampleRate); return b; }
  _loop(buffer, gain = 0) { const ac = this.ac, s = ac.createBufferSource(), g = ac.createGain(); s.buffer = buffer; s.loop = true; g.gain.value = gain; s.connect(g); g.connect(this.master); s.start(); return { src: s, gain: g }; }
  _synthLoops() {
    const ac = this.ac;
    // fire: a soft roar with sharp little cracks
    this.loops.fire = this._loop(this._noise(5, (d, sr) => { let lp = 0, crack = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; lp += (w - lp) * 0.02; if (Math.random() < 0.00035) crack = 0.5 + Math.random() * 0.5; crack *= 0.992; d[i] = lp * 1.6 + w * crack * 0.5; } for (let i = 0; i < 2000; i++) { const t = i / 2000; d[i] *= t; d[d.length - 1 - i] *= t; } }));
    // the radio: static with a slow beeping signal in it
    this.loops.radio = this._loop(this._noise(4.8, (d, sr) => { let bp = 0, ph = 0; const pat = '1010001110111000101010000000'; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; bp += (w - bp) * 0.35; const k = pat[Math.floor(i / sr / 0.17) % pat.length] === '1' ? 1 : 0; ph += 2 * Math.PI * 720 / sr; d[i] = bp * 0.35 * (0.6 + 0.4 * Math.sin(i / sr * 3)) + Math.sin(ph) * 0.16 * k; } }));
    // a low hum under everything
    const drone = ac.createGain(); drone.gain.value = 0; drone.connect(this.master); this.drone = drone;
    for (const [f, v] of [[55, 0.5], [82.4, 0.3], [110.6, 0.18], [164.2, 0.07]]) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; o.type = 'sine'; g.gain.value = v; const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 0.05 + Math.random() * 0.08; lg.gain.value = v * 0.5; l.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(drone); o.start(); l.start(); }
  }
  _wind() {
    const ac = this.ac, buf = this.bufs['wind-open'] ? this.bufs['wind-open'][0] : this._noise(6, (d) => { let a = 0, b = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; a += (w - a) * 0.01; b += (a - b) * 0.05; d[i] = b * 9 * (0.6 + 0.4 * Math.sin(i / d.length * Math.PI * 2 * 3)); } });
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = buf; s.loop = true; f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0; s.connect(f); f.connect(g); g.connect(this.master); s.start();
    this.wind = { filter: f, gain: g };
  }
  // Called every frame: how much open air (0 indoors .. 1 outside), gusting, nearest fire and the radio.
  ambience({ open, gust, fire, radio, on }) {
    if (!this.ac) return; const t = this.ac.currentTime, k = on ? 1 : 0;
    if (this.wind) { this.wind.gain.gain.setTargetAtTime(k * (0.16 + 0.5 * open + 0.3 * gust), t, 0.3); this.wind.filter.frequency.setTargetAtTime(380 + 5200 * open * open, t, 0.3); }
    this.loops.fire.gain.gain.setTargetAtTime(k * fire * 0.55, t, 0.15); this.loops.radio.gain.gain.setTargetAtTime(k * radio * 0.22, t, 0.15); this.drone.gain.setTargetAtTime(k * 0.05, t, 1.5);
  }
  tone(freq, dur = 0.15, { type = 'sine', gain = 0.2, delay = 0, slide = 0 } = {}) {
    if (!this.ac || this.ac.state !== 'running') return; const ac = this.ac, o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  burst(dur, { gain = 0.4, hp = 0, lp = 0, delay = 0 } = {}) {
    if (!this.ac || this.ac.state !== 'running') return; const ac = this.ac, s = ac.createBufferSource(), g = ac.createGain(), t = ac.currentTime + delay;
    s.buffer = this._noise(dur, (d) => { for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.5); }); let node = s;
    if (hp) { const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; } if (lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
    g.gain.value = gain; node.connect(g); g.connect(this.master); s.start(t);
  }
  pickup() { this.tone(660, 0.5, { gain: 0.12 }); this.tone(990, 0.7, { gain: 0.1, delay: 0.09 }); this.tone(1320, 0.9, { gain: 0.06, delay: 0.18 }); }
  page() { this.burst(0.25, { gain: 0.25, hp: 2500 }); this.burst(0.2, { gain: 0.18, hp: 3500, delay: 0.12 }); }
  key() { this.tone(1180, 0.08, { type: 'square', gain: 0.06 }); }
  wrong() { this.tone(180, 0.35, { type: 'sawtooth', gain: 0.1 }); this.tone(170, 0.35, { type: 'sawtooth', gain: 0.1, delay: 0.02 }); }
  right() { this.tone(880, 0.12, { type: 'square', gain: 0.06 }); this.tone(1320, 0.3, { type: 'square', gain: 0.06, delay: 0.12 }); this.burst(0.1, { gain: 0.3, lp: 900, delay: 0.35 }); }
  click() { this.burst(0.04, { gain: 0.3, hp: 1800 }); }
  iceHit(last) { this.burst(0.18, { gain: 0.6, lp: 1400 }); this.burst(0.35, { gain: 0.35, hp: 3000, delay: 0.02 }); for (let i = 0; i < (last ? 14 : 5); i++) this.tone(2200 + Math.random() * 3800, 0.12 + Math.random() * 0.2, { gain: 0.05, delay: 0.03 + Math.random() * (last ? 0.9 : 0.3) }); if (last) this.burst(1.6, { gain: 0.5, lp: 700, delay: 0.1 }); }
  shiver() { this.burst(0.5, { gain: 0.12, hp: 900, lp: 2200 }); }
}
