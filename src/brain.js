// What he does: one activity at a time, written as generators that advance one tick (1/30 s) per step.
// Seat events queue activities by priority; with nothing queued he works, sleeps or follows his routine.
import { FLOOR_Y, OUT_Y, FLIGHTS, SPOTS, DOOR_X, P } from './world.js';

const SPEED = 1.1;
const sec = (s) => Math.round(s * 30);

export class House {
  constructor(seed, sound) {
    this.sound = sound;
    this.man = { x: 226, floor: 0, y: FLOOR_Y[0], face: 1, pose: 'stand', step: 0, icon: null, carry: null, seat: 10 };
    this.dog = { x: 150, floor: 0, y: FLOOR_Y[0], face: 1, pose: 'sit', step: 0, target: null, wait: 0 };
    this.carrier = null;
    this.state = { action: null, asleep: false, working: false, smoke: false, phoneRinging: false, mailWaiting: false,
      outgoing: 0, tvStatic: false, frames: 0, pendingFrames: 0, doorOpen: false };
    this.queue = [];
    this.current = null;
    this.cooldown = {};
    this.seedRoutine(seed);
    this.onLetterDone = null;
  }

  seedRoutine(seed) {
    let h = (seed * 40503 + 7) >>> 0;
    const r = () => { h = (h * 1664525 + 1013904223) >>> 0; return 0.4 + (h >>> 8) / 16777216 * 1.6; };
    this.weights = { tv: r(), piano: r(), records: r(), cook: r(), snack: r(), book: r(), exercise: r(), shower: r(),
      brush: r() * 0.6, feedDog: r(), petDog: r(), water: r() * 0.7, fire: r() * 0.7, window: r() * 0.6, mailcheck: 0.3, nap: 0.2 };
  }

  // ---------- events from the seat ----------
  push(prio, name, gen) { this.queue.push({ prio, name, gen }); this.queue.sort((a, b) => b.prio - a.prio); }

  event(e) {
    const s = this.state;
    switch (e.type) {
      case 'init':
        s.asleep = e.asleep; s.working = e.working; s.frames = e.accepted; s.tvStatic = e.verifierDown;
        this.queue = []; this.current = null;
        this.place(e.asleep ? 'bed' : e.working ? 'desk' : 'livingMid');
        if (e.asleep) this.man.pose = 'sleep';
        if (e.letter) this.push(2, 'letter', () => this.writeLetter());
        break;
      case 'work': s.working = true; this.workRole = e.role; this.push(3, 'work', () => this.work()); break;
      case 'workdone': s.working = false; break;
      case 'post': this.push(4, 'post', () => this.post()); break;
      case 'accepted': s.pendingFrames += e.n; this.push(5, 'mail', () => this.mail(true, e.n)); break;
      case 'rejected': this.push(5, 'mail', () => this.mail(false, e.n)); break;
      case 'failed': s.smoke = true; this.push(7, 'smoke', () => this.fan()); break;
      case 'phone': s.phoneRinging = true; this.push(6, 'phone', () => this.answer()); break;
      case 'oracle': this.push(4, 'oracle', () => this.telescope()); break;
      case 'verifier': s.tvStatic = e.down; break;
      case 'sleep':
        s.asleep = true; s.smoke = false; s.phoneRinging = false;
        s.frames += s.pendingFrames; s.pendingFrames = 0;
        this.queue = []; this.push(9, 'sleep', () => this.sleep());
        break;
      case 'wake': s.asleep = false; this.dog.wait = 0; this.dog.goal = null; break;
      default: break;
    }
  }

  // ---------- the tick ----------
  tick(t) {
    const top = this.queue[0];
    if (top && (!this.current || top.prio > this.current.prio)) {
      this.queue.shift();
      const cur = this.current;
      if (cur && cur.prio >= 4 && cur.name !== 'sleep') this.push(cur.prio, cur.name, cur.gen);   // resume it later
      this.start(top);
    }
    if (!this.current) {
      const s = this.state;
      if (s.asleep) this.start({ prio: 9, name: 'sleep', gen: () => this.sleep() });
      else if (s.working) this.start({ prio: 3, name: 'work', gen: () => this.work() });
      else this.start(this.routine());
    }
    const r = this.current.it.next();
    if (r.done) { this.current = null; this.man.icon = null; this.state.action = null; this.man.carry = null; }
    this.tickDog(t);
    this.tickCarrier();
    const m = this.man;
    this.state.doorOpen = (m.floor === 'out' || (m.floor === 0 && m.x < 70)) && Math.abs(m.x - DOOR_X) < 10;
    if (this.state.outgoing > 0) this.state.outgoing--;
    if (this.state.phoneRinging && t % 30 === 0) this.sound.ring();
  }

  start(item) {
    this.man.icon = null; this.man.carry = null; this.state.action = null;
    if (this.man.pose === 'sleep' && item.name !== 'sleep') this.place('bed', true);
    const m = this.man;
    if (m.pose !== 'sleep') m.y = m.floor === 'out' ? OUT_Y : FLOOR_Y[m.floor];   // an interrupted climb lands him on his floor
    this.current = { ...item, it: item.gen() };
  }

  place(spot, standing) {
    const s = SPOTS[spot], m = this.man;
    m.floor = s.floor; m.x = s.x; m.face = s.face; m.y = s.floor === 'out' ? OUT_Y : FLOOR_Y[s.floor];
    m.pose = standing ? 'stand' : spot === 'desk' ? 'type' : 'stand';
    if (spot === 'desk' && !standing) this.state.action = 'type';
  }

  // ---------- movement ----------
  *wait(s) { for (let i = 0; i < sec(s); i++) yield; }

  *walkX(x) {
    const m = this.man;
    m.pose = 'walk';
    while (Math.abs(m.x - x) > 0.01) {
      const d = x - m.x;
      m.face = d > 0 ? 1 : -1;
      m.x += Math.sign(d) * Math.min(SPEED, Math.abs(d));
      m.step++;
      if (m.floor === 0 && m.x < DOOR_X) { m.floor = 'out'; m.y = OUT_Y; }
      else if (m.floor === 'out' && m.x >= DOOR_X) { m.floor = 0; m.y = FLOOR_Y[0]; }
      yield;
    }
    m.pose = 'stand';
  }

  *climb(flight, up) {
    const m = this.man;
    const [a, b] = up ? [flight.bottom, flight.top] : [flight.top, flight.bottom];
    const n = Math.ceil(Math.abs(b[0] - a[0]) / (SPEED * 0.8));
    m.pose = 'walk'; m.face = Math.sign(b[0] - a[0]);
    for (let i = 1; i <= n; i++) { m.x = a[0] + (b[0] - a[0]) * i / n; m.y = a[1] + (b[1] - a[1]) * i / n; m.step++; yield; }
    m.floor = up ? flight.lower + 1 : flight.lower;
    m.y = FLOOR_Y[m.floor]; m.pose = 'stand';
  }

  *goTo(name) {
    const d = SPOTS[name], m = this.man;
    if (d.floor === 'out') {
      yield* this.goTo('livingMid');
      yield* this.walkX(d.x);
    } else {
      if (m.floor === 'out') yield* this.walkX(DOOR_X + 4);
      while (m.floor !== d.floor) {
        if (m.floor < d.floor) {
          const f = FLIGHTS[m.floor];
          yield* this.walkX(f.bottom[0]); yield* this.climb(f, true);
        } else {
          const f = FLIGHTS[m.floor - 1];
          yield* this.walkX(f.top[0]); yield* this.climb(f, false);
        }
      }
      yield* this.walkX(d.x);
    }
    m.face = d.face;
  }

  *act(action, pose, s, icon = null, extra) {
    const m = this.man;
    this.state.action = action; m.pose = pose; m.icon = icon;
    for (let i = 0; i < sec(s); i++) { if (extra) extra(i); yield; }
    this.state.action = null; m.icon = null; m.pose = 'stand';
  }

  // ---------- activities for seat events ----------
  *work() {
    const s = this.state, m = this.man, role = this.workRole || '';
    if (/research/.test(role)) {
      yield* this.goTo('shelf');
      yield* this.act('research', 'read', 6, null);
    }
    yield* this.goTo('desk');
    const pose = /review|audit|judge|critic/.test(role) ? 'review' : 'type';
    let i = 0;
    while (s.working || i < sec(15)) {
      s.action = pose === 'review' ? 'review' : 'type'; m.pose = pose; m.seat = 10;
      if (pose === 'type' && i % 5 === 0) this.sound.tick();
      if (i > 0 && i % sec(90) === 0) { m.pose = 'stretch'; for (let k = 0; k < sec(2); k++) yield; }
      i++;
      yield;
      if (s.asleep) return;
    }
    s.action = null; m.pose = 'stand';
  }

  *post() {
    const m = this.man;
    yield* this.goTo('mailbox');
    m.pose = 'carry'; m.carry = 'letter';
    yield* this.wait(1);
    m.carry = null; this.state.outgoing = sec(25); this.sound.clunk();
    yield* this.wait(0.5);
    yield* this.goTo('livingMid');
  }

  *mail(good, n) {
    const s = this.state, m = this.man;
    if (!s.mailWaiting && !this.carrier) this.carrier = { x: -16, y: OUT_Y, face: 1, step: 0, phase: 'in', wait: 0 };
    while (!s.mailWaiting) yield;
    yield* this.goTo('mailbox');
    s.mailWaiting = false; m.carry = 'letter';
    yield* this.walkX(48);
    m.face = 1; m.carry = null;
    yield* this.act('readmail', 'readmail', 2.5, good ? 'heart' : 'dots');
    if (good) {
      this.sound.jingle();
      yield* this.act('dance', 'dance', 3, 'note');
      m.carry = 'frame';
      yield* this.goTo('frames');
      m.carry = null;
      yield* this.act('hang', 'hang', 1.5);
      s.frames += n; s.pendingFrames = Math.max(0, s.pendingFrames - n);
    } else {
      this.sound.sad();
      yield* this.goTo('bedEdge');
      m.seat = 13;
      yield* this.act('sad', 'sad', 8 + Math.random() * 8, 'dots');
      m.seat = 10;
    }
  }

  *fan() {
    yield* this.goTo('deskStand');
    yield* this.act('fan', 'fan', 5, 'bang');
    this.state.smoke = false;
  }

  *answer() {
    yield* this.goTo('phone');
    this.state.phoneRinging = false;
    yield* this.act('phone', 'phone', 3, 'bang');
  }

  *telescope() {
    yield* this.goTo('telescope');
    yield* this.act('telescope', 'telescope', 18, 'star');
  }

  *sleep() {
    const m = this.man, s = this.state;
    if (m.pose !== 'sleep') { yield* this.goTo('bed'); }
    s.action = 'sleep'; m.pose = 'sleep'; m.icon = 'z';
    while (s.asleep) yield;
    m.icon = null; s.action = null;
    this.place('bed', true);
    yield* this.act('stretch', 'stretch', 2);
  }

  *writeLetter() {
    yield* this.goTo('desk');
    const m = this.man;
    for (let i = 0; i < sec(6); i++) { this.state.action = 'letter'; m.pose = 'type'; if (i % 5 === 0) this.sound.tick(); yield; }
    this.state.action = null; m.pose = 'stand';
    if (this.onLetterDone) this.onLetterDone();
  }

  // ---------- his own routine ----------
  routine() {
    const now = Date.now();
    const w = { ...this.weights, nap: (this.idleHours || 0) > 12 ? 3 : this.weights.nap };   // long lulls: more naps
    let opts = Object.entries(w).filter(([k]) => !(this.cooldown[k] > now));
    if (!opts.length) { this.cooldown = {}; opts = Object.entries(w); }
    let total = opts.reduce((a, [, w]) => a + w, 0), r = Math.random() * total, pick = opts[0][0];
    for (const [k, w] of opts) { r -= w; if (r <= 0) { pick = k; break; } }
    this.cooldown[pick] = now + 90000 + Math.random() * 120000;
    return { prio: 1, name: pick, gen: () => this.routines[pick].call(this) };
  }

  get routines() {
    return {
      *tv() { yield* this.goTo('armchair'); this.man.seat = 12; yield* this.act('tv', 'tvsit', 20 + Math.random() * 20); this.man.seat = 10; },
      *piano() {
        yield* this.goTo('piano'); this.man.seat = 10;
        yield* this.act('piano', 'piano', 14 + Math.random() * 10, 'note', (i) => { if (i % 9 === 0) this.sound.note(); });
      },
      *records() { yield* this.goTo('records'); yield* this.act('records', 'stand', 1.5); yield* this.act('records', 'dance', 8, 'note'); },
      *cook() { yield* this.goTo('stove'); yield* this.act('cook', 'cook', 10); yield* this.goTo('sink'); yield* this.act('eat', 'eat', 6); },
      *snack() { yield* this.goTo('fridge'); yield* this.act('snack', 'stand', 2); yield* this.act('eat', 'eat', 4); },
      *book() { yield* this.goTo('shelf'); yield* this.act('book', 'read', 14 + Math.random() * 8, null); },
      *exercise() { yield* this.goTo('gym'); yield* this.act('exercise', 'exercise', 8); },
      *shower() { yield* this.goTo('tub'); yield* this.act('shower', 'shower', 9, null, (i) => { if (i === 30) this.man.icon = 'note'; }); },
      *brush() { yield* this.goTo('bathSink'); yield* this.act('brush', 'brush', 5); },
      *feedDog() { yield* this.goTo('bowl'); this.dogTo(152, 'eat', 8); yield* this.act('feed', 'pet', 3); },
      *petDog() {
        yield* this.goTo('livingMid');
        this.dogTo(this.man.x + 14, 'wag', 8);
        for (let i = 0; i < sec(6) && this.dog.target != null; i++) yield;
        this.man.face = 1;
        yield* this.act('pet', 'pet', 4, 'heart');
      },
      *water() { yield* this.goTo('plant'); yield* this.act('water', 'water', 5); },
      *fire() { yield* this.goTo('fire'); yield* this.act('fire', 'stoke', 4); yield* this.goTo('armchair'); this.man.seat = 12; yield* this.act('rest', 'tvsit', 8); this.man.seat = 10; },
      *window() { const w = Math.random() < 0.5 ? 'kitchenWin' : 'bedWin'; yield* this.goTo(w); yield* this.act('window', 'stand', 6, Math.random() < 0.5 ? 'ask' : 'heart'); },
      *nap() { yield* this.goTo('armchair'); this.man.seat = 12; yield* this.act('nap', 'nap', 25 + Math.random() * 20, 'z'); this.man.seat = 10; },
      *mailcheck() { yield* this.goTo('mailbox'); yield* this.act('mailcheck', 'stand', 2, 'ask'); yield* this.goTo('livingMid'); },
    };
  }

  // ---------- the dog keeps to the ground floor ----------
  dogTo(x, pose, s) { const d = this.dog; d.target = Math.max(66, Math.min(350, x)); d.goal = pose; d.wait = sec(s); }

  tickDog() {
    const d = this.dog, m = this.man;
    if (this.state.asleep && d.goal !== 'sleep') { d.target = 322; d.goal = 'sleep'; d.wait = 1e9; }
    if (d.target != null) {
      if (Math.abs(d.x - d.target) > 0.6) { d.face = d.target > d.x ? 1 : -1; d.x += d.face * 0.9; d.pose = 'walk'; d.step++; return; }
      d.target = null; d.pose = d.goal || 'sit';
      return;
    }
    if (d.wait > 0) { d.wait--; return; }
    d.goal = null; d.pose = 'sit';
    const r = Math.random();
    if (m.floor === 0 && r < 0.006) this.dogTo(m.x + (Math.random() < 0.5 ? -16 : 16), 'sit', 4);
    else if (r < 0.009) this.dogTo(322, 'sleep', 25);
    else if (r < 0.013) this.dogTo(70 + Math.random() * 280, 'sit', 5);
  }

  tickCarrier() {
    const c = this.carrier;
    if (!c) return;
    c.step++;
    if (c.phase === 'in') { c.face = 1; c.x += 0.9; c.pose = 'walk'; if (c.x >= 8) { c.phase = 'drop'; c.wait = sec(1); c.pose = 'carry'; } }
    else if (c.phase === 'drop') { if (--c.wait <= 0) { this.state.mailWaiting = true; this.state.outgoing = 0; this.sound.clunk(); c.phase = 'out'; } }
    else { c.face = -1; c.x -= 0.9; c.pose = 'walk'; if (c.x < -20) this.carrier = null; }
  }
}

export const DOG_Y = FLOOR_Y[0];
export { P };
