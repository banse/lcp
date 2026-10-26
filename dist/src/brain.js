// What he does: one activity at a time, written as generators that advance one tick (1/30 s) per step.
// Seat events queue activities by priority; with nothing queued he works, sleeps or follows his routine.
import { FLOOR_Y, OUT_Y, FLIGHTS, DOOR_X, P } from './world.js';

const SPEED = 1.1;
const sec = (s) => Math.round(s * 30);
const KEEP = ['mail', 'install'];
// where each activity happens (a look's spots); a look without the spot sends him to the stove
const STATION_SPOT = { computer: 'desk', telescope: 'telescope', book: 'shelf', tv: 'armchair', piano: 'piano', easel: 'easel',
  cook: 'stove', magnifier: 'desk2', typewriter: 'desk2', lab: 'lab', workbench: 'workbench', whiteboard: 'whiteboard',
  cabinet: 'cabinet', pinball: 'pinball' };   // what waits for him while he sleeps or is out

// theme: { mapping (task category -> activity, mapping.js), spots (where each thing is, world.js SPOTS shape) }
export class House {
  constructor(seed, sound, theme) {
    this.sound = sound;
    this.mapping = theme.mapping; this.spots = theme.spots;
    this.man = { x: 226, floor: 0, y: FLOOR_Y[0], face: 1, pose: 'stand', step: 0, icon: null, carry: null, seat: 10 };
    this.dog = { x: 150, floor: 0, y: FLOOR_Y[0], face: 1, pose: 'sit', step: 0, target: null, wait: 0, mode: null };
    this.carrier = null;
    this.state = { action: null, asleep: false, away: false, sign: false, working: false, smoke: false, phoneRinging: false,
      mailbox: 0, mailDue: 0, parcelDue: false, outgoing: 0, tvStatic: false, frames: 0, doorOpen: false, parcel: false,
      needsUpdate: false, installProgress: 0, atStation: null, fireworks: 0, bigFireworks: 0, alarm: 0, machine: null,
      chart: null, chartHold: 0, buying: null, radio: null, radioNote: 0, radioHowl: 0,   // radio: main.js (radio.js houseState)
      paper: false, paperDue: false, seatNo: null };                                         // the day's IMD Daily in the mailbox; the number on it
    this.pace = 1;               // walking speed, 1 = his usual (buying IMD makes him run, a lost trade makes him drag)
    this.flash = null;           // {icon, left}: a quick reaction over his head (talking to him while he works)
    this.walkout = false;        // he left with the dog because he was asked too much (talk.js)
    this.queue = [];
    this.current = null;
    this.cooldown = {};
    this.timers = [];             // [{left, fn}]: things that happen in a few ticks (the radio switching when he gets there)
    this.seedRoutine(seed);
    this.onLetterDone = null;     // (why, late): why = 'bed' or 'away' when he left it as a note
    this.onKnock = null;          // (info) => the page shows its message to the owner
    this.onRecords = null;        // (on) => he put a record on / left the player (main.js: the radio, when the visitor's is off)
    this.onPaper = null;          // () => the mail carrier dropped the day's IMD Daily into the mailbox (main.js: he reads it)
    this.knockAck = false;
  }

  seedRoutine(seed) {
    let h = (seed * 40503 + 7) >>> 0;
    const r = () => { h = (h * 1664525 + 1013904223) >>> 0; return 0.4 + (h >>> 8) / 16777216 * 1.6; };
    this.weights = { tv: r(), piano: r(), records: r(), cook: r(), snack: r(), book: r(), exercise: r(), shower: r(),
      brush: r() * 0.6, feedDog: r(), petDog: r(), water: r() * 0.7, fire: r() * 0.7, window: r() * 0.6, mailcheck: 0.3, nap: 0.2 };
  }

  // ---------- events from the seat ----------
  push(prio, name, gen, data) { this.queue.push({ prio, name, gen, data }); this.queue.sort((a, b) => b.prio - a.prio); }

  // going to bed or out: accepted mail counts on the plaque at once, a letter he has not typed yet becomes a note,
  // and only his mail and a pending install wait for him
  rest(why) {
    const s = this.state, items = this.current ? [...this.queue, this.current] : this.queue;
    for (const q of items) if (q.name === 'mail' && q.data.good && !q.data.counted) { s.frames += q.data.n; q.data.counted = true; }
    if (items.some((q) => q.name === 'letter')) this.leaveNote(why, true);
    this.queue = this.queue.filter((q) => KEEP.includes(q.name));
  }

  // the look's activity for a category; a look without one shows it like the launch it belongs to (base)
  activityFor(category, base) { return this.mapping[category] || this.mapping[base] || 'cook'; }
  get workKind() { return this.activityFor(this.workCategory, this.workBase); }

  // another theme: its mapping and its stations; a station activity starts over at the new place
  setTheme(theme) {
    this.mapping = theme.mapping; this.spots = theme.spots;
    if (this.current && ['work', 'oracle'].includes(this.current.name)) this.current = null;
  }

  leaveNote(why, late) { if (this.onLetterDone) this.onLetterDone(why, late); }

  // a verdict: the carrier brings it at once, also at night or while he is out; he reads it when he is up
  letterFor(good, n) {
    const s = this.state, data = { good, n, counted: false, taken: false }, c = this.carrier;
    if (c && c.kind === 'letter' && c.phase === 'in') c.letters++; else s.mailDue++;
    if (good && (s.asleep || s.away)) { s.frames += n; data.counted = true; }
    this.push(5, 'mail', () => this.mail(data), data);
  }

  leave() {
    const m = this.man;
    m.floor = 'out'; m.x = this.spots.away.x; m.y = OUT_Y; m.face = -1; m.pose = 'stand'; m.hidden = true;
  }

  event(e) {
    const s = this.state;
    switch (e.type) {
      case 'init':
        s.asleep = e.asleep; s.away = !!e.paused; s.sign = s.away; s.working = e.working; s.frames = e.accepted; s.tvStatic = e.verifierDown;
        this.workCategory = e.category || this.workCategory || 'other'; this.workBase = e.base || this.workBase || 'other';
        s.needsUpdate = !!(e.update && e.update.needs); s.parcel = s.needsUpdate;
        this.queue = this.queue.filter((q) => q.name === 'celebrate'); this.current = null;   // the seat's first reading can come after it
        if (s.away) this.leave();
        else this.place(e.asleep ? 'bed' : e.working && this.workKind === 'computer' ? 'desk' : 'livingMid');
        if (e.asleep && !s.away) this.man.pose = 'sleep';
        if (e.letter && (s.away || e.asleep)) this.leaveNote(s.away ? 'away' : 'bed', false);
        else if (e.letter) this.push(2, 'letter', () => this.writeLetter());
        break;
      case 'work': s.working = true; this.workCategory = e.category || 'other'; this.workBase = e.base || 'other'; this.push(3, 'work', () => this.work()); break;
      case 'workkind': case 'submitted':
        if (!e.category) break;
        if (s.working && this.activityFor(e.category, e.base) !== this.workKind) {
          this.workCategory = e.category; this.workBase = e.base || 'other';
          if (this.current && this.current.name === 'work') this.current = null;   // start over with the right activity
        } else { this.workCategory = e.category; this.workBase = e.base || this.workBase || 'other'; }
        break;
      // a job he worked on is done: he cheers when it completed, scratches his head when it is blocked
      case 'jobdone': this.push(4, 'jobdone', () => this.jobDone(e.state === 'completed')); break;
      case 'launched': s.fireworks = sec(12); break;               // a launch he worked on went live: fireworks
      // the job the page followed is done: big fireworks, and he dances in the garden; it gets him out of bed too (9.5 is
      // above sleep), not back home while the seat is paused (away, 10)
      case 'celebrate': s.fireworks = sec(32); s.bigFireworks = sec(32); this.push(9.5, 'celebrate', () => this.celebrate()); break;
      case 'alarm': s.alarm = sec(4); this.sound.ring(); break;    // a schedule opened his job: the clock rings
      case 'machine': s.machine = e.info || null; break;           // what his machine runs while he works (feed.js machineInfo)
      // the visitor told him something (talk.js, main.js): one scene at a time, the newest wins; done() when it's over
      case 'command': {
        const gen = this.commandScene(e.act, e.done);
        if (!gen) break;
        this.queue = this.queue.filter((q) => q.name !== 'command');
        if (this.current && this.current.name === 'command') this.current = null;
        this.push(e.act === 'buy' ? 6.6 : 6.5, 'command', gen);
        break;
      }
      case 'flash': this.flash = { icon: e.icon, left: sec(e.seconds || 2.5) }; break;
      // a step of the job on his whiteboard changed (main.js): he walks over and taps it, then goes back to his work
      case 'board': if (!this.queue.some((q) => q.name === 'board') && !(this.current && this.current.name === 'board')) this.push(3.5, 'board', () => this.tapBoard()); break;
      case 'walkout': if (!this.walkout) this.push(9.6, 'walkout', () => this.walkOut(e.seconds || 90)); break;
      // the radio (main.js, radio.js): he puts a record on or lifts the arm, a note rises at a trade, a whale has him dance
      // and the dog howl, an hour of silence has him yawn, a finished $IDM track hangs as a record beside the pictures
      case 'radio': this.radioEvent(e); break;
      // a new issue of The IMD Daily (main.js dailyWatch): the mail carrier brings the paper to the mailbox
      case 'daily': if (!s.paper && !(this.carrier && this.carrier.kind === 'paper')) s.paperDue = true; break;
      case 'workdone': s.working = false; break;
      case 'post': this.push(4, 'post', () => this.post()); break;
      case 'accepted': case 'rejected': this.letterFor(e.type === 'accepted', e.n); break;
      case 'failed': s.smoke = true; this.push(7, 'smoke', () => this.fan()); break;
      case 'phone': s.phoneRinging = true; this.push(6, 'phone', () => this.answer()); break;
      case 'oracle': this.push(4, 'oracle', () => this.station(this.activityFor('oracle', 'other'), () => false, 18)); break;
      case 'verifier': s.tvStatic = e.down; break;
      case 'update': s.needsUpdate = true; if (!s.parcel && !(this.carrier && this.carrier.kind === 'parcel')) s.parcelDue = true; break;
      case 'updated': this.knockAck = true; this.push(5, 'install', () => this.install()); break;
      case 'knock':
        if (!s.asleep && !s.away && !this.queue.some((q) => q.name === 'knock') && !(this.current && this.current.name === 'knock')) {
          this.knockInfo = e.info; this.push(8, 'knock', () => this.knock());
        }
        break;
      case 'sleep':
        s.asleep = true; s.smoke = false; s.phoneRinging = false;
        this.rest('bed');
        this.push(9, 'sleep', () => this.sleep());
        break;
      case 'wake': s.asleep = false; this.queue = this.queue.filter((q) => q.name !== 'sleep'); break;
      case 'pause':
        s.away = true; s.smoke = false; s.phoneRinging = false;
        this.rest('away');
        this.push(10, 'away', () => this.away());
        break;
      case 'resume': s.away = false; break;
      default: break;
    }
  }

  // ---------- the tick ----------
  tick(t) {
    const s = this.state, top = this.queue[0];
    const floor = s.away ? 10 : s.asleep ? 9 : 0;           // while he is out or asleep, nothing else starts
    if (top && top.prio >= floor && (!this.current || top.prio > this.current.prio)) {
      this.queue.shift();
      const cur = this.current;
      if (cur && cur.prio >= 4 && cur.name !== 'sleep' && (top.prio < 9 || KEEP.includes(cur.name))) {
        this.push(cur.prio, cur.name, cur.gen, cur.data);                                      // resume it later
      }
      this.start(top);
    }
    if (!this.current) {
      if (s.away) this.start({ prio: 10, name: 'away', gen: () => this.away() });
      else if (s.asleep) this.start({ prio: 9, name: 'sleep', gen: () => this.sleep() });
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
    if (this.state.fireworks > 0) this.state.fireworks--;
    if (this.state.bigFireworks > 0) this.state.bigFireworks--;
    if (this.state.alarm > 0) this.state.alarm--;
    if (this.state.chartHold > 0 && --this.state.chartHold === 0) this.state.chart = null;
    if (this.flash && --this.flash.left <= 0) this.flash = null;
    if (this.state.radioNote > 0) this.state.radioNote--;
    if (this.timers.length) { const due = this.timers.filter((x) => --x.left <= 0); this.timers = this.timers.filter((x) => x.left > 0); for (const x of due) x.fn(); }
    if (this.state.radioHowl > 0) this.state.radioHowl--;
    if (this.state.phoneRinging && t % 30 === 0) this.sound.ring();
  }

  start(item) {
    this.man.icon = null; this.man.carry = null; this.state.action = null; this.state.closeup = null;   // a cut-off knock leaves no overlay
    this.state.party = item.name === 'celebrate';
    this.pace = 1; this.state.buying = null; this.state.chart = null; this.state.chartHold = 0;   // a new scene wipes the screen
    if (this.walkout && item.name !== 'walkout') this.backHome();
    if (this.man.pose === 'sleep' && item.name !== 'sleep') this.place('bed', true);
    const m = this.man;
    if (m.pose !== 'sleep') m.y = m.floor === 'out' ? OUT_Y : FLOOR_Y[m.floor];   // an interrupted climb lands him on his floor
    this.current = { ...item, it: item.gen() };
  }

  place(spot, standing) {
    const s = this.spots[spot], m = this.man;
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
      m.x += Math.sign(d) * Math.min(SPEED * this.pace, Math.abs(d));
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
    const n = Math.ceil(Math.abs(b[0] - a[0]) / (SPEED * 0.8 * this.pace));
    m.pose = 'walk'; m.face = Math.sign(b[0] - a[0]);
    for (let i = 1; i <= n; i++) { m.x = a[0] + (b[0] - a[0]) * i / n; m.y = a[1] + (b[1] - a[1]) * i / n; m.step++; yield; }
    m.floor = up ? flight.lower + 1 : flight.lower;
    m.y = FLOOR_Y[m.floor]; m.pose = 'stand';
  }

  *goTo(name) {
    const d = this.spots[name], m = this.man;
    if (d.floor === 'out') {
      if (m.floor !== 'out' && m.floor !== 0) yield* this.goTo('livingMid');
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
  // working on a task: the theme's mapping turns its category into an activity
  *work() { yield* this.station(this.workKind, () => this.state.working, 15, true); }

  // one activity at its station, while keepGoing() holds and for at least minS seconds; follow: stop when the
  // seat's task changes to another activity
  *station(kind, keepGoing, minS, follow = false) {
    const s = this.state, m = this.man;
    const spot = STATION_SPOT[kind] || 'stove';
    yield* this.goTo(this.spots[spot] ? spot : 'stove');
    s.atStation = kind;
    let i = 0;
    while (keepGoing() || i < sec(minS)) {
      if (kind === 'computer') { s.action = 'type'; m.pose = 'type'; m.seat = 10; if (i % 5 === 0) this.sound.tick(); }
      else if (kind === 'telescope') { s.action = 'telescope'; m.pose = 'telescope'; m.icon = 'star'; }
      else if (kind === 'book') { s.action = 'research'; m.pose = 'read'; m.book = P.red; }
      else if (kind === 'tv') { s.action = 'tv'; m.pose = 'tvsit'; m.seat = 12; }
      else if (kind === 'piano') { s.action = 'piano'; m.pose = 'piano'; m.seat = 10; m.icon = 'note'; if (i % 9 === 0) this.sound.note(); }
      else if (kind === 'easel') { s.action = 'paint'; m.pose = (i % sec(12)) < sec(10) ? 'paint' : 'stand'; }    // a step back now and then
      else if (kind === 'magnifier') { s.action = 'inspect'; m.pose = 'inspect'; }
      else if (kind === 'typewriter') { s.action = 'typewrite'; m.pose = 'typewrite'; if (i % 4 === 0) this.sound.tick(); }
      else if (kind === 'lab') { s.action = 'experiment'; m.pose = 'experiment'; }
      else if (kind === 'workbench') { s.action = 'hammer'; m.pose = 'hammer'; if (i % 12 === 0) this.sound.tick(); }
      else if (kind === 'whiteboard') { s.action = 'plan'; m.pose = 'plan'; }
      else if (kind === 'cabinet') { s.action = 'file'; m.pose = 'file'; }
      else if (kind === 'pinball') { s.action = 'pinball'; m.pose = 'pinball'; if (i % 20 === 0) this.sound.note(); }
      else { s.action = 'cook'; m.pose = (i % sec(20)) < sec(16) ? 'cook' : 'eat'; }       // cooking, with a taste now and then
      if (i > 0 && i % sec(90) === 0 && kind !== 'tv') { m.pose = 'stretch'; for (let k = 0; k < sec(2); k++) yield; }
      i++;
      yield;
      if (s.asleep || s.away || (follow && kind !== this.workKind)) break;
    }
    s.action = null; s.atStation = null; m.pose = 'stand'; m.icon = null; m.seat = 10;
  }

  *tapBoard() {
    yield* this.goTo('whiteboard');
    const s = this.state, m = this.man;
    s.action = 'plan'; m.pose = 'plan'; m.face = this.spots.whiteboard.face;
    yield* this.wait(3.5);
    s.action = null; m.pose = 'stand';
  }

  *jobDone(ok) {
    if (ok) { this.sound.jingle(); yield* this.act('cheer', 'dance', 2.5, 'heart'); }
    else yield* this.act('puzzled', 'puzzled', 3, 'ask');
  }

  // in the kitchen with the dog (owner, 2026-10-24: not alone in the garden): the dog runs over to the side it comes
  // from and wags, barks and bows; he dances facing it under the fireworks. The kitchen stays lit even when the seat
  // sleeps (state.party, set in start); after it the dog goes back to what the house says (bed, the door, free).
  *celebrate() {
    const d = this.dog, x = this.spots.party.x, side = d.x < x ? -1 : 1;
    this.dogTo(x + side * 18, 'party', 34);
    yield* this.goTo('party');
    this.man.face = side;
    this.state.fireworks = Math.max(this.state.fireworks, sec(18));            // still going while he dances, however long
    this.state.bigFireworks = Math.max(this.state.bigFireworks, sec(18));      // the walk down from upstairs took
    this.sound.jingle();
    yield* this.act('cheer', 'dance', 6, 'star');
    this.sound.jingle();
    yield* this.act('cheer', 'dance', 6, 'heart');
    this.sound.jingle();
    yield* this.act('cheer', 'dance', 4, 'note');
    d.mode = undefined;
  }

  // ---------- what the visitor tells him (talk.js; main.js decides whether he does it) ----------
  commandScene(act, done) {
    const r = this.routines, routine = (name) => () => r[name].call(this);
    const scenes = {
      feedDog: routine('feedDog'), petDog: routine('petDog'), piano: routine('piano'), records: routine('records'), tv: routine('tv'),
      cook: routine('cook'), snack: routine('snack'), book: routine('book'), exercise: routine('exercise'), shower: routine('shower'),
      brush: routine('brush'), water: routine('water'), fire: routine('fire'), window: routine('window'), nap: routine('nap'),
      mailcheck: routine('mailcheck'),
      paint: () => this.station('easel', () => false, 9), telescope: () => this.station('telescope', () => false, 8),
      dance: () => this.act('dance', 'dance', 5, 'note'), lfg: () => this.act('dance', 'dance', 4, 'star'),
      gm: () => this.act('gm', 'stretch', 1.6, 'heart'), nope: () => this.act('nope', 'puzzled', 2, 'bang'),
      moon: () => this.moon(), touchGrass: () => this.touchGrass(), lookup: () => this.lookup(done), news: () => this.readNews(done),
      trade: () => this.trade(done), buy: () => this.buyImd(done),
    };
    return scenes[act] || null;
  }

  // the radio's scenes. Busy (working, asleep, out, walked out) he stays put: the dog barks at the stairs until the record
  // changes, a whale gets a star over his head and the dog's party; otherwise he walks to the record player. e.done
  // (main.js: the frame switches) runs when he lifts the arm, when the dog gets to the stairs, at once when nobody is
  // home to do it, and at the latest after 16 s (a higher event may cut his walk short); once.
  radioEvent(e) {
    const s = this.state, busy = s.working || s.asleep || s.away || this.walkout, home = !s.asleep && !s.away && !this.walkout;
    const scene = (gen, prio = 6.5) => {
      this.queue = this.queue.filter((q) => q.name !== 'command');
      if (this.current && this.current.name === 'command') this.current = null;
      this.push(prio, 'command', gen);
    };
    let fired = false;
    const done = () => { if (fired) return; fired = true; if (e.done) e.done(); };
    const latest = (ticks) => { this.timers.push({ left: ticks, fn: done }); };
    switch (e.act) {
      case 'tune':
        if (busy) {
          if (home) { const d = this.dog, to = FLIGHTS[0].bottom[0] - 14; this.dogTo(to, 'party', 4); latest(Math.ceil(Math.abs(d.x - to) / 0.9) + sec(0.8)); }
          else done();
          break;
        }
        latest(sec(16)); scene(() => this.putOn(done)); break;
      case 'off':
        if (busy) { done(); break; }
        latest(sec(16)); scene(() => this.needleUp(done)); break;
      case 'note': s.radioNote = sec(1.4); break;
      case 'whaleBuy':
        if (busy) { this.flash = { icon: 'star', left: sec(3) }; if (home) this.dogTo(this.man.floor === 0 ? this.man.x + 16 : 230, 'party', 6); break; }
        scene(() => this.whaleDance(), 6.7); break;
      case 'whaleSell':
        s.radioHowl = sec(5);
        if (home) this.dogTo(this.dog.x, 'howl', 5);
        if (!busy) this.flash = { icon: 'dots', left: sec(3) };
        break;
      case 'yawn': if (!busy) scene(() => this.act('yawn', 'stretch', 2.2, 'z'), 1.5); break;
      case 'track':
        s.fireworks = Math.max(s.fireworks, sec(12));
        if (!busy) scene(() => this.hangRecord(), 6.6);
        break;
      default: break;
    }
  }
  *putOn(done) { yield* this.goTo('records'); yield* this.act('records', 'stand', 1.2); if (done) done(); yield* this.act('records', 'dance', 2.6, 'note'); }
  *needleUp(done) { yield* this.goTo('records'); yield* this.act('needle', 'reach', 0.7); if (done) done(); yield* this.act('needle', 'stand', 0.6); }
  *whaleDance() {
    if (this.man.floor === 0) this.dogTo(this.man.x + 16, 'party', 7);
    yield* this.act('cheer', 'dance', 5, 'star');
    this.dog.mode = undefined;
  }
  *hangRecord() { this.man.carry = 'frame'; yield* this.goTo('frames'); this.man.carry = null; yield* this.act('hang', 'hang', 1.5, 'note'); }

  // IMD or swarm news (2026-10-26): the paper from the mailbox, then the armchair in front of the TV (which stays off): seen
  // from behind, the paper unfolded in both hands (owner, 2026-10-26). The visitor can click him there (main.js opens The
  // IMD Daily); done() when he starts reading (the headline).
  *readNews(done) {
    const m = this.man;
    yield* this.goTo('mailbox');
    yield* this.act('pickup', 'reach', 0.8);
    this.state.paper = false;                                   // the delivered paper leaves the mailbox with him
    m.carry = 'paper';
    yield* this.goTo('armchair');
    m.carry = null; m.seat = 12;
    if (done) done();
    yield* this.act('news', 'tvsit', 26);
    m.seat = 10;
  }

  // a question about data: he hurries to the machine, types, then the answer (done)
  *lookup(done) {
    this.pace = 1.8;
    yield* this.goTo('desk');
    this.pace = 1;
    yield* this.act('type', 'type', 2.5, null, (i) => { if (i % 5 === 0) this.sound.tick(); });
    if (done) done();
  }

  // memecoins: at the machine the chart runs green and red and ends in one big red candle; he drags himself off crying
  *trade(done) {
    const s = this.state;
    yield* this.goTo('desk');
    s.chart = 0; s.chartHold = 0;
    yield* this.act('trade', 'type', 7.5, null, (i) => { s.chart = i; if (i % 4 === 0) this.sound.tick(); });
    s.chartHold = sec(14);                                   // the red candle stays on the screen while he walks off
    if (done) done();
    this.pace = 0.45; this.man.icon = 'tear';
    yield* this.goTo('livingMid');
    this.pace = 1;
    yield* this.act('cry', 'sad', 5, 'tear');
  }

  // IMD: he runs to the machine and buys, green on the screen
  *buyImd(done) {
    const s = this.state;
    this.pace = 3; this.man.icon = 'bang';
    yield* this.goTo('desk');
    this.pace = 1;
    s.buying = 0;
    yield* this.act('buy', 'type', 3.5, 'heart', (i) => { s.buying = i; if (i % 3 === 0) this.sound.tick(); });
    this.sound.jingle();
    if (done) done();
    yield* this.act('cheer', 'dance', 2.5, 'heart');
    s.buying = null;
  }

  *touchGrass() {
    yield* this.goTo('doorOut');
    yield* this.walkX(22);
    this.man.face = -1;
    yield* this.act('grass', 'eat', 5, 'leaf');
    yield* this.goTo('livingMid');
  }

  *moon() { yield* this.goTo('telescope'); yield* this.act('telescope', 'telescope', 7, 'moon'); }

  // asked too much: he takes the dog out of the house for a while (a BACK SOON sign on the door), then comes home
  *walkOut(seconds) {
    const s = this.state, d = this.dog, m = this.man;
    this.walkout = true; s.sign = true;
    d.target = 66; d.goal = 'sit'; d.wait = 1e9;           // the dog comes to the door
    yield* this.goTo('doorOut');
    for (let i = 0; i < sec(8) && Math.abs(d.x - 66) > 1; i++) yield;
    d.hidden = true;                                        // the dog goes first
    yield* this.walkX(this.spots.away.x);
    m.hidden = true;
    yield* this.wait(seconds);
    m.hidden = false;
    d.hidden = false; d.x = 66; d.target = 150; d.goal = 'sit'; d.wait = sec(4);
    yield* this.goTo('livingMid');
    this.backHome();
  }

  backHome() {
    this.walkout = false; this.state.sign = this.state.away;
    if (!this.state.away) this.man.hidden = false;
    this.dog.hidden = false; this.dog.mode = undefined;
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

  *mail(data) {
    const s = this.state, m = this.man, good = data.good;
    if (!data.taken) {
      for (let i = 0; !s.mailbox && i < sec(60); i++) yield;     // the carrier is still on the way
      yield* this.goTo('mailbox');
      s.mailbox = Math.max(0, s.mailbox - 1); data.taken = true;
    } else yield* this.goTo('mailbox');
    m.carry = 'letter';
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
      if (!data.counted) { s.frames += data.n; data.counted = true; }
    } else {
      this.sound.sad();
      yield* this.goTo('bedEdge');
      m.seat = 13;
      yield* this.act('sad', 'sad', 8 + Math.random() * 8, 'dots');
      m.seat = 10;
    }
  }

  newCarrier(kind) { return { x: -16, y: OUT_Y, face: 1, step: 0, phase: 'in', wait: 0, kind, carry: kind, letters: 0 }; }

  // the seat's worker changed version: fetch the parcel from the doorstep and install it at the computer
  *install() {
    const s = this.state, m = this.man;
    if (!s.parcel) {
      if (!(this.carrier && this.carrier.kind === 'parcel')) s.parcelDue = true;
      for (let i = 0; i < sec(40) && !s.parcel; i++) yield;
    }
    yield* this.goTo('parcel');
    s.parcel = false; s.parcelDue = false; m.carry = 'parcel';
    yield* this.goTo('desk');
    m.carry = null; m.seat = 10;
    for (let i = 0; i <= sec(8); i++) { s.action = 'install'; m.pose = 'type'; s.installProgress = i / sec(8); if (i % 6 === 0) this.sound.tick(); yield; }
    s.needsUpdate = false; s.installProgress = 0; s.action = null;
    this.sound.jingle();
    m.pose = 'stand';
    yield* this.act('installed', 'stretch', 2, 'star');
  }

  // he comes up to the glass and knocks, so the owner looks up from whatever they were doing
  *knock() {
    const s = this.state, m = this.man;
    yield* this.goTo('livingMid');
    m.face = 1; m.pose = 'stand';
    this.knockAck = false;
    s.closeup = { phase: 'up', k: 0, knocks: 0 };
    for (let i = 0; i <= sec(1); i++) { s.closeup.k = i / sec(1); yield; }
    s.closeup.phase = 'knock';
    if (this.onKnock) this.onKnock(this.knockInfo);
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < sec(1.6); i++) {
        s.closeup.hit = (i % 12) < 3 && i < sec(1.1);
        if (i % 12 === 0 && i < sec(1.1)) { this.sound.knock(); s.closeup.knocks++; }
        yield;
      }
      s.closeup.hit = false;
      for (let i = 0; i < sec(1.2) && !this.knockAck; i++) yield;
      if (this.knockAck) break;
    }
    s.closeup.phase = 'wait'; s.closeup.ack = this.knockAck;
    for (let i = 0; i < sec(20) && !this.knockAck; i++) yield;
    s.closeup.phase = 'down'; s.closeup.ack = this.knockAck;
    for (let i = sec(1); i >= 0; i--) { s.closeup.k = i / sec(1); yield; }
    s.closeup = null;
    yield* this.act('nod', 'stand', 1.5, this.knockAck ? 'heart' : 'dots');
  }

  ackKnock() { this.knockAck = true; }

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

  *sleep() {
    const m = this.man, s = this.state;
    if (m.pose !== 'sleep') { yield* this.goTo('bed'); }
    s.action = 'sleep'; m.pose = 'sleep'; m.icon = 'z';
    while (s.asleep) yield;
    m.icon = null; s.action = null;
    this.place('bed', true);
    yield* this.act('stretch', 'stretch', 2);
  }

  // the owner paused the seat: he hangs a sign on the front door and goes out until the seat is on again
  *away() {
    const s = this.state, m = this.man;
    if (!m.hidden) {
      yield* this.goTo('doorOut');
      yield* this.act('sign', 'reach', 1.2);
      s.sign = true;
      yield* this.walkX(this.spots.away.x);
      m.hidden = true;
    }
    while (s.away) yield;
    m.hidden = false;
    yield* this.walkX(this.spots.doorOut.x);
    m.face = 1;
    yield* this.act('sign', 'reach', 1);
    s.sign = false;
    yield* this.goTo('livingMid');
    yield* this.act('home', 'stand', 1.5, 'heart');
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
    const w = { ...this.weights, nap: (this.idleHours || 0) > 12 ? 3 : this.weights.nap,   // long lulls: more naps
      parcel: this.state.parcel ? 1.5 : 0 };                                              // an update waits at the door
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
      *records() {                                                  // his own record: the radio plays while he is there (main.js onRecords)
        yield* this.goTo('records'); yield* this.act('records', 'stand', 1.5);
        if (this.onRecords) this.onRecords(true);
        yield* this.act('records', 'dance', 8, 'note');
        if (this.onRecords) this.onRecords(false);
      },
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
      *parcel() { yield* this.goTo('parcel'); yield* this.act('parcel', 'stand', 3, 'ask'); yield* this.goTo('livingMid'); },
      *mailcheck() { yield* this.goTo('mailbox'); yield* this.act('mailcheck', 'stand', 2, 'ask'); yield* this.goTo('livingMid'); },
    };
  }

  // ---------- the dog keeps to the ground floor ----------
  dogTo(x, pose, s) { const d = this.dog; d.target = Math.max(66, Math.min(350, x)); d.goal = pose; d.wait = sec(s); }

  tickDog() {
    const d = this.dog, m = this.man, s = this.state;
    if (d.hidden) return;                                   // out with him (walkOut)
    const mode = s.away ? 'door' : s.asleep ? 'sleep' : null;     // while he is out the dog waits by the door
    if (mode !== d.mode) {
      d.mode = mode;
      if (mode === 'door') { d.target = 68; d.goal = 'sit'; d.wait = 1e9; }
      else if (mode === 'sleep') { d.target = 322; d.goal = 'sleep'; d.wait = 1e9; }
      else { d.wait = 0; d.goal = null; }
    }
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
    const s = this.state;
    if (!this.carrier) {
      if (s.mailDue > 0) { this.carrier = this.newCarrier('letter'); this.carrier.letters = s.mailDue; s.mailDue = 0; }
      else if (s.parcelDue) { this.carrier = this.newCarrier('parcel'); s.parcelDue = false; }
      else if (s.paperDue) { this.carrier = this.newCarrier('paper'); s.paperDue = false; }
      else return;
    }
    const c = this.carrier;
    c.step++;
    const stop = c.kind === 'parcel' ? 36 : 8;
    if (c.phase === 'in') { c.face = 1; c.x += 0.9; c.pose = 'walk'; if (c.x >= stop) { c.phase = 'drop'; c.wait = sec(1); c.pose = 'stand'; } }
    else if (c.phase === 'drop') {
      if (--c.wait <= 0) {
        if (c.kind === 'parcel') s.parcel = true;
        else if (c.kind === 'paper') { s.paper = true; if (this.onPaper) this.onPaper(); }
        else { s.mailbox += c.letters; s.outgoing = 0; }
        c.carry = null; this.sound.clunk(); c.phase = 'out';
      }
    }
    else { c.face = -1; c.x -= 0.9; c.pose = 'walk'; if (c.x < -20) this.carrier = null; }
  }
}

export const DOG_Y = FLOOR_Y[0];
export { P };
