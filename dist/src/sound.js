// Small square-wave sounds, silent until the visitor turns sound on.
export class Sound {
  constructor() { this.on = false; this.ctx = null; }
  enable(on) {
    this.on = on;
    if (on && !this.ctx) { const A = window.AudioContext || window.webkitAudioContext; if (A) this.ctx = new A(); }
    if (on && this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
  beep(freq, dur, when = 0, type = 'square', vol = 0.05) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + when, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  tick() { this.beep(1800 + Math.random() * 400, 0.02, 0, 'square', 0.015); }
  note() { const s = [392, 440, 523, 587, 659, 784]; this.beep(s[Math.floor(Math.random() * s.length)], 0.25, 0, 'triangle', 0.06); }
  ring() { for (let i = 0; i < 6; i++) this.beep(i % 2 ? 1100 : 1300, 0.06, i * 0.07, 'square', 0.03); }
  clunk() { this.beep(160, 0.12, 0, 'square', 0.06); }
  knock() { this.beep(95, 0.07, 0, 'triangle', 0.18); this.beep(80, 0.07, 0.11, 'triangle', 0.18); }
  jingle() { [523, 659, 784, 1047].forEach((f, i) => this.beep(f, 0.14, i * 0.12, 'square', 0.04)); }
  sad() { [392, 349, 311].forEach((f, i) => this.beep(f, 0.3, i * 0.25, 'triangle', 0.05)); }
}
