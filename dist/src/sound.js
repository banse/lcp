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

  // the needle drops (2026-10-26, the owner: a short party riff every time he puts a record on): a chip riff of our own,
  // lead over a bass line, 2.6 s; `wanted` = the radio is on, so a context may be made (the page already had its click)
  riff(wanted = false) {
    if (wanted && !this.ctx) { const A = window.AudioContext || window.webkitAudioContext; if (A) this.ctx = new A(); }
    if (!this.ctx || !(this.on || wanted)) return 0;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const on = this.on; this.on = true;
    for (const [f, at, d] of RIFF.lead) this.beep(f, d, at, 'square', 0.045);
    for (const [f, at, d] of RIFF.bass) this.beep(f, d, at, 'triangle', 0.07);
    this.on = on;
    return RIFF.length;
  }

  // a clip of the owner's choosing instead of the riff (assets/celebrate.mp3 when the site has it): their licence, their file
  clip(url, seconds = 4) {
    try {
      const a = new Audio(url); a.volume = 0.6; this.clipEl = a;
      a.play().catch(() => {});
      setTimeout(() => { if (this.clipEl === a) { a.pause(); this.clipEl = null; } }, seconds * 1000);
      return seconds;
    } catch (e) { return 0; }
  }
}

// the riff: [frequency, start s, length s]; E E G A, C A G E over C G A F bass, a pickup and a cheer at the end
const q = 0.16;
export const RIFF = {
  length: 2.6,
  lead: [[659, 0, q], [659, q, q], [784, 2 * q, q], [880, 3 * q, 1.5 * q], [1047, 5 * q, q], [880, 6 * q, q], [784, 7 * q, q], [659, 8 * q, 1.5 * q],
    [784, 10 * q, q], [880, 11 * q, q], [1047, 12 * q, 2.2 * q], [1319, 14 * q, 2 * q]],
  bass: [[131, 0, 2 * q], [131, 2 * q, 2 * q], [98, 4 * q, 2 * q], [98, 6 * q, 2 * q], [110, 8 * q, 2 * q], [110, 10 * q, 2 * q], [87, 12 * q, 2 * q], [98, 14 * q, 2 * q]],
};
