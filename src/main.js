// Wiring: render loop, looks (themes), seat choice (#/seat/N, #demo), wallet lookup, diary, daily letter, counters.
import { House } from './brain.js';
import { LiveFeed, DemoFeed, isAsleep } from './feed.js';
import { wallets, connect, seatsOf } from './wallet.js';
import { Sound } from './sound.js';
import { CATEGORIES } from './mapping.js';
import { THEMES, DEFAULT_THEME } from './themes/index.js';
import { setPhase } from './world.js';

const $ = (id) => document.getElementById(id);
// built but switched off (the owner, 2026-10-24: "dont delete the cut features, we may add it back later"): the look
// switch (IMD | LCP) and the wallet lookup. Elements marked data-feature="…" show only when theirs is on.
const FEATURES = { lookSwitch: false, wallet: false };
for (const el of document.querySelectorAll('[data-feature]')) el.hidden = !FEATURES[el.dataset.feature];
const canvas = $('game');
let g = canvas.getContext('2d');
let theme = (FEATURES.lookSwitch && THEMES[store('seathouse:theme')]) || THEMES[DEFAULT_THEME];

const sound = new Sound();
let house = null, seatSeed = 4242, feed = null, seatId = null, mode = null, tick = 0;
let pendingLetter = null, wallet = null, lastUpdate = null;
const ownedSeats = new Set();
const KNOCK_AGAIN_MS = 30 * 60000, ACK_MS = 6 * 3600000;

const live = new LiveFeed(onEvent, onStatus);
const demo = new DemoFeed(onEvent, onStatus, () => house);

// ---------- render loop: logic at 30 ticks a second ----------
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(250, now - last); last = now;
  while (acc >= 1000 / 30) { if (house) house.tick(tick); tick++; acc -= 1000 / 30; }
  draw();
  requestAnimationFrame(frame);
}

function draw() {
  theme.draw(g, house, tick);
  const c = house && house.state.closeup;
  canvas.style.transform = c && c.hit ? `translate(${tick % 2 ? 2 : -2}px, ${tick % 3 ? 1 : 0}px)` : '';
}

function fit() {
  const avail = Math.min(document.querySelector('.page').clientWidth, window.innerWidth - 32);
  canvas.style.width = '100%';
  canvas.parentElement.style.width = theme.cssWidth(avail);   // the screen box carries the width; the letter covers it
}

// ---------- looks: each theme draws the house its own way and has its own mapping ----------
function applyTheme(id) {
  theme = THEMES[id] || THEMES[DEFAULT_THEME];
  store('seathouse:theme', theme.id);
  document.documentElement.dataset.look = theme.id;
  theme.attach(canvas);
  g = canvas.getContext('2d');
  if (house) { house.setTheme(theme); theme.setSeed(seatSeed); }
  for (const b of document.querySelectorAll('[data-look-btn]')) b.setAttribute('aria-pressed', String(b.dataset.lookBtn === theme.id));
  renderLegend();
  fit();
}

function renderLegend() {
  const body = $('legend-work');
  body.innerHTML = '';
  for (const [cat, label] of Object.entries(CATEGORIES)) {
    const tr = document.createElement('tr'), a = document.createElement('td'), b = document.createElement('td');
    a.textContent = label;
    b.textContent = theme.activityText[theme.mapping[cat]] || 'like the launch it belongs to: token launch work or not';
    tr.append(a, b); body.append(tr);
  }
  $('legend-look').textContent = theme.label;
}
window.addEventListener('resize', fit);

// ---------- choosing a seat ----------
function setTitle(text, num) {
  const h = $('title');
  h.textContent = text;
  if (num != null) { const b = document.createElement('span'); b.className = 'num'; b.textContent = '#' + num; h.append(b, '?'); }
}

function visit(id) {
  id = Math.max(0, Math.min(1999, Math.floor(Number(id))));
  if (!Number.isFinite(id)) return;
  demo.stop(); setPhase(null);
  mode = 'live'; seatId = id;
  house = new House(id, sound, theme); seatSeed = id; theme.setSeed(id);
  house.onLetterDone = showLetter;
  house.onKnock = showKnock;
  feed = live; lastUpdate = null; hideKnock();
  clearDiary(); hideLetter();
  setTitle('Who lives in Swarmstreet ', id);
  $('lede').textContent = 'A little pepe lives the working day of this IMD swarm seat. Everything he does comes from the seat\'s public record.';
  $('seat-input').value = id;
  $('demo-btn').setAttribute('aria-pressed', 'false');
  if (location.hash !== '#/seat/' + id) history.replaceState(null, '', '#/seat/' + id);
  live.setSeat(id);
}

function startDemo() {
  live.stop();
  mode = 'demo'; seatId = 'demo';
  house = new House(4242, sound, theme); seatSeed = 4242; theme.setSeed(4242);
  house.onLetterDone = showLetter;
  house.onKnock = showKnock; lastUpdate = null; hideKnock();
  clearDiary(); hideLetter();
  setTitle('Demo: a made-up seat, one fast day', null);
  $('lede').textContent = 'Every event the house knows, one after another, each when he is done with the last: the phone, each kind of work (token launch, websites, research, video, audio, images, oracles), mail, a failed run, a worker update, the checker going down, sleep with mail at night, and the owner pausing the seat.';
  $('demo-btn').setAttribute('aria-pressed', 'true');
  if (location.hash !== '#demo') history.replaceState(null, '', '#demo');
  demo.start();
}

// a seat working right now; if none is, one that finished a task in the last hour, else in the last 24 hours
async function randomBusySeat() {
  try {
    let sw;
    try { sw = await live.fetchSwarm(); } catch (e) { sw = live.swarm; if (!sw) throw e; }
    const all = Object.values(sw.seats), now = Date.now();
    const since = (h) => all.filter((s) => s.last && now - Date.parse(s.last) < h * 3600000);
    const working = all.filter((s) => s.working);
    const pool = working.length ? working : since(1).length ? since(1) : since(24);
    const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    if (!pick) { addDiary('No seat worked in the last 24 hours. Type a seat number instead.'); return; }
    visit(pick.tokenId);
    addDiary(working.length
      ? `Seat #${pick.tokenId} is ${working.length === 1 ? 'the only seat' : 'one of ' + working.length + ' seats'} working right now.`
      : `No seat is working right now; seat #${pick.tokenId} finished a task ${ago(Date.parse(pick.last))}.`);
  } catch (e) {
    addDiary('Can\'t reach the swarm right now. Type a seat number or try the demo.');
  }
}

function route() {
  const h = location.hash;
  const m = h.match(/^#\/seat\/(\d{1,4})$/);
  if (m) visit(m[1]);
  else if (h === '#demo') startDemo();
  else randomBusySeat();
}

// ---------- events into the house and the diary ----------
const SAY = {
  work: (e) => workLine(e),
  workkind: (e) => workLine(e),
  submitted: (e) => `He posted a result: that was ${e.label}${e.task && e.task.nodeKey ? ' (' + e.task.nodeKey + ')' : ''}.`,
  workdone: () => 'He finished the task and got up.',
  post: (e) => e.n > 1 ? `He posted ${e.n} results in the mailbox.` : 'He posted a result in the mailbox.',
  accepted: (e) => resting()
    ? `Mail came while he ${resting().during}: ${e.n > 1 ? e.n + ' accepted' : 'accepted'}. The flag is up and the plaque already counts it; he hangs the picture when ${resting().after}.`
    : e.n > 1 ? `Good news in the mail: ${e.n} accepted. New pictures go on the wall.` : 'Good news in the mail: accepted. A new picture goes on the wall.',
  rejected: (e) => resting()
    ? `Mail came while he ${resting().during}: ${e.n > 1 ? e.n + ' rejections' : 'a rejection'}. The flag is up; he reads it when ${resting().after}.`
    : e.n > 1 ? `${e.n} rejections came in the mail. He sits on his bed for a while.` : 'A rejection came in the mail. He sits on his bed for a while.',
  failed: () => 'His computer started smoking: a run failed.',
  phone: () => 'The phone rings: work is waiting for him.',
  oracle: () => `His seat sits on an oracle panel: he ${theme.activityText[theme.mapping.oracle]}.`,
  verifier: (e) => e.down ? 'The TV shows static: the swarm\'s checker is down.' : 'The TV works again: the checker is back.',
  sleep: () => 'Lights out. The seat left the network or has had no task for three days.',
  wake: () => 'He\'s up again: the seat is back.',
  update: (e) => `A parcel arrived: a newer worker is out (${e.info.latest}${e.info.behind != null ? ', ' + e.info.behind + ' releases ahead of his' : ''}). It waits at the door until the seat updates.`,
  updated: (e) => `The seat updated its worker to ${e.to}. He unpacks the parcel and installs it.`,
  pause: () => 'His owner paused the seat. He hung a "back soon" sign on the door and went out.',
  jobdone: (e) => e.state === 'completed' ? 'A job he worked on is done. He cheers.' : 'A job he worked on is blocked. He scratches his head.',
  launched: (e) => `A launch he worked on went live (${e.kind}): fireworks over the roof.`,
  alarm: () => 'His alarm clock rings: a schedule opened this one.',
  resume: () => 'The seat is on again. He came home and took the sign down.',
};
const resting = () => !house ? null : house.state.away ? { during: 'was out', after: 'he\'s back' }
  : house.state.asleep ? { during: 'slept', after: 'he\'s up' } : null;

// what he does for the task: the theme's mapping and its wording
function workLine(e) {
  const act = theme.mapping[e.category] || theme.mapping[e.base] || 'cook';
  const base = 'He ' + (theme.activityText[act] || 'starts working') + ': ' + (e.label || 'a task');
  return base + (e.step ? ' (' + e.step + ')' : '') + (e.guess ? ', probably, going by his recent work.' : '.');
}

function onEvent(e) {
  if (e.type === 'phase') { setPhase(e.phase); return; }      // the demo's time of day
  if (!house) return;
  if (e.type === 'init') {
    const st = e.paused ? 'He\'s out: the seat\'s owner paused it. A sign on the door says he\'ll be back soon.' : e.asleep ? 'He\'s asleep: the seat left the network or has had no task for three days.' : e.working ? 'He\'s working on ' + (e.label || 'a task') + (e.guess ? ' (probably, going by his recent work).' : '.') : 'He\'s at home, between tasks.';
    addDiary(mode === 'demo' ? 'The demo starts. ' + st : `You're visiting seat #${e.seat}. ${st}`);
    if (e.update && e.update.needs) addDiary(`A parcel waits at his door: the seat runs ${e.update.current}, and the newest worker is ${e.update.latest}.`);
    if (mode === 'live') e.letter = prepareLetter(e.seat, e.data, e.asleep, e.paused);
    else { pendingLetter = demoLetter(); e.letter = true; }
  } else if (SAY[e.type]) addDiary(SAY[e.type](e));
  house.event(e);
  if (e.type === 'init' && e.update) lastUpdate = e.update;
  if (e.type === 'update') lastUpdate = e.info;
  if (e.type === 'updated') { lastUpdate = e.info; hideKnock(); }
  if ((e.type === 'init' && e.update && e.update.needs) || e.type === 'update' || e.type === 'wake') setTimeout(maybeKnock, e.type === 'update' ? 9000 : 4000);
}

// ---------- the knock: an outdated seat tells its owner ----------
function ackKey() { return `seathouse:knock:${seatId}:${lastUpdate ? lastUpdate.latest : ''}`; }

function maybeKnock() {
  if (!house || !lastUpdate || !lastUpdate.needs || house.state.asleep || house.state.away || !house.state.needsUpdate) return;
  if (mode !== 'demo' && !ownedSeats.has(seatId)) return;            // only the owner is knocked for
  const acked = Number(store(ackKey()) || 0);
  if (mode !== 'demo' && Date.now() - acked < ACK_MS) return;
  house.event({ type: 'knock', info: lastUpdate });
}
setInterval(maybeKnock, KNOCK_AGAIN_MS);

function showKnock(info) {
  const own = mode === 'demo' ? 'Demo: ' : '';
  $('knock-title').textContent = `${own}Knock knock: seat #${seatId === 'demo' ? '0000' : seatId} needs an update`;
  const age = info.latestAgeH < 1 ? 'under an hour' : Math.round(info.latestAgeH) + ' h';
  $('knock-text').textContent = `It runs worker ${info.current}. The newest is ${info.latest}, out ${age}` +
    (info.behind != null ? ` and ${info.behind} release${info.behind === 1 ? '' : 's'} ahead of it.` : ', more than 40 releases ahead of it.');
  $('knock').hidden = false;
  addDiary('He knocked on the glass: the seat needs an update.');
}
function hideKnock() { $('knock').hidden = true; }

$('knock-ok').addEventListener('click', () => {
  if (house) house.ackKnock();
  store(ackKey(), Date.now());
  hideKnock();
  addDiary('You told him you saw it. He won\'t knock again for six hours on this version.');
});

function onStatus(s) {
  if (s.error) { $('st-line').textContent = 'Can\'t reach the swarm (' + s.error + '). Retrying.'; return; }
  if (house) house.idleHours = s.idleHours || 0;
  const d = s.data;
  for (const k of ['attempts', 'accepted', 'rejected', 'failed']) $('st-' + k).textContent = d ? Number(d[k]).toLocaleString('en-US') : '–';
  $('st-head').textContent = s.seat === 'demo' ? 'The demo seat' : `Seat #${s.seat}`;
  const bits = [];
  if (!d) bits.push('This seat has no record in the swarm yet.');
  else {
    bits.push(s.paused ? 'Paused by its owner.' : d.working ? 'Working now.' : s.asleep ? 'Asleep.' : s.idleHours > 12 ? 'Awake, but no work for a while.' : 'Awake.');
    if (d.agentId) bits.push(`Agent ${d.agentId}.`);
    if (d.last) bits.push('Last task ' + ago(Date.parse(d.last)) + '.');
  }
  if (s.verifierDown) bits.push('The swarm\'s checker is down.');
  bits.push((s.live ? 'Read ' : 'Demo data, ') + s.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.');
  $('st-line').textContent = bits.join(' ');
}

function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 2) return 'just now';
  if (m < 120) return m + ' minutes ago';
  const h = Math.round(m / 60);
  return h < 48 ? h + ' hours ago' : Math.round(h / 24) + ' days ago';
}

function clearDiary() { $('diary').innerHTML = ''; }
function addDiary(text) {
  const li = document.createElement('li'), time = document.createElement('time'), span = document.createElement('span');
  const now = new Date();
  time.dateTime = now.toISOString();
  time.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  span.textContent = text;
  li.append(time, span);
  $('diary').prepend(li);
  while ($('diary').children.length > 60) $('diary').lastChild.remove();
}

// ---------- the daily letter: once per UTC day per seat, from counters only ----------
function store(key, val) {
  try { if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null'); localStorage.setItem(key, JSON.stringify(val)); } catch (e) { return null; }
  return null;
}

function prepareLetter(id, d, asleep, paused) {
  if (!d) return false;
  const key = 'seathouse:v1:' + id, today = new Date().toISOString().slice(0, 10);
  const prev = store(key);
  if (prev && prev.day === today) return false;
  const now = { day: today, at: Date.now(), attempts: d.attempts, accepted: d.accepted, rejected: d.rejected, failed: d.failed };
  const lines = [];
  if (!prev) {
    lines.push(`Hello! I'm the little pepe who lives in Swarmstreet #${id}.`);
    lines.push(`So far I have taken on ${d.attempts} tasks: ${d.accepted} were accepted, ${d.rejected} rejected and ${d.failed} failed.`);
  } else {
    const dd = (k) => d[k] - (prev[k] || 0);
    lines.push(`Welcome back! Since you came by ${ago(prev.at)}:`);
    if (dd('attempts') <= 0) lines.push('nothing new came in. The swarm has been quiet for me.');
    else lines.push(`I took on ${dd('attempts')} tasks. ${dd('accepted')} were accepted, ${dd('rejected')} rejected and ${dd('failed')} failed.`);
  }
  const rate = d.attempts ? Math.round(100 * d.accepted / d.attempts) : 0;
  lines.push(paused ? 'I\'m out for a while: my owner paused the seat.' : d.working ? 'Right now I\'m in the middle of a task.' : asleep ? 'I\'m having a long rest, so don\'t wake me.' : 'Right now I\'m between tasks.');
  if (d.attempts > 20) lines.push(rate >= 85 ? `Most of my work gets accepted (${rate}%). I'm proud of the wall.` : `${rate}% of my work gets accepted. I keep trying.`);
  lines.push('', 'Yours,', `seat #${id}`);
  pendingLetter = lines.join('\n');
  store(key, now);
  return true;
}

function demoLetter() {
  return 'Hello! I\'m a made-up seat, here to show you around.\nWatch the phone, the mailbox, the telescope and my computer: each one stands for something a real seat does.\n\nYours,\nthe demo seat';
}

// why: undefined when he typed it at the desk, 'bed' or 'away' when he left it as a note; late: he left just now
const NOTE = {
  bed: { head: 'A note he left before bed', diary: 'He left you a note before going to bed.', ps: 'P.S. I\'m off to bed now. See you when the seat is back.' },
  away: { head: 'A note he left before going out', diary: 'He left you a note before going out.', ps: 'P.S. I have to go out for a while: my owner paused the seat.' },
};
function showLetter(why, late) {
  if (!pendingLetter) return;
  const n = NOTE[why];
  $('letter-head').textContent = n ? n.head : 'A letter from him';
  $('letter-text').textContent = pendingLetter + (n && late ? '\n\n' + n.ps : '');
  $('letter').hidden = false;
  addDiary(n ? n.diary : 'He typed you a letter.');
  pendingLetter = null;
}
function hideLetter() { $('letter').hidden = true; pendingLetter = null; }
$('letter-close').addEventListener('click', () => { $('letter').hidden = true; });
$('letter').addEventListener('click', (e) => { if (e.target === $('letter')) $('letter').hidden = true; });   // a click beside it
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('letter').hidden) $('letter').hidden = true; });

// ---------- wallet: which seats does it hold? ----------
async function connectWallet(w) {
  const note = $('wallet-note');
  $('wallet-choices').innerHTML = '';
  try {
    note.textContent = `Asking ${w.info.name} for your address…`;
    wallet = await connect(w);
    note.textContent = 'Looking up your seats…';
    const sw = live.swarm || await live.fetchSwarm();
    const res = await seatsOf(wallet, sw.owners || []);
    ownedSeats.clear(); res.ids.forEach((id) => ownedSeats.add(id));
    const short = wallet.address.slice(0, 6) + '…' + wallet.address.slice(-4);
    const box = $('wallet-seats');
    box.innerHTML = '';
    if (!res.ids.length) note.textContent = `${short} holds no seats. You can still visit any seat by number.`;
    else {
      note.textContent = `${short} holds ${res.ids.length === 1 ? 'one seat' : res.ids.length + ' seats'}${res.confirmed ? '' : ' (from the swarm\'s list, not checked onchain: wrong network)'}:`;
      for (const id of res.ids) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'door'; b.title = 'Your seat'; b.textContent = '#' + id;
        b.addEventListener('click', () => visit(id));
        box.append(b);
      }
      if (res.ids.length === 1 && res.ids[0] !== seatId) visit(res.ids[0]);
      else setTimeout(maybeKnock, 1500);
    }
    $('wallet-btn').textContent = 'Wallet: ' + short;
    $('wallet-forget').hidden = false;
  } catch (e) {
    note.textContent = e && e.code === 4001 ? 'You declined the request. Nothing was shared.' : 'The wallet did not answer: ' + (e.message || e);
  }
}

$('wallet-btn').addEventListener('click', () => {
  $('wallet-panel').hidden = false;
  const list = wallets(), note = $('wallet-note'), box = $('wallet-choices');
  box.innerHTML = '';
  if (!list.length) { note.textContent = 'No browser wallet found. Install one, or type a seat number.'; return; }
  if (list.length === 1) { connectWallet(list[0]); return; }
  note.textContent = 'Choose a wallet. It is only asked for your address.';
  for (const w of list) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'quiet'; b.textContent = w.info.name;
    b.addEventListener('click', () => connectWallet(w));
    box.append(b);
  }
});

$('wallet-forget').addEventListener('click', () => {
  wallet = null; ownedSeats.clear(); hideKnock();
  $('wallet-seats').innerHTML = ''; $('wallet-note').textContent = 'Forgotten. This page keeps no wallet data.';
  $('wallet-btn').textContent = 'Connect wallet'; $('wallet-forget').hidden = true;
});

// ---------- the rest of the controls ----------
$('seat-form').addEventListener('submit', (e) => { e.preventDefault(); const v = $('seat-input').value; if (v !== '') visit(v); });
$('random-btn').addEventListener('click', randomBusySeat);
$('legend-btn').addEventListener('click', () => {
  const d = $('legend');
  if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  d.scrollTop = 0;
});
for (const b of document.querySelectorAll('[data-look-btn]')) b.addEventListener('click', () => applyTheme(b.dataset.lookBtn));
$('demo-btn').addEventListener('click', () => (mode === 'demo' ? randomBusySeat() : startDemo()));
$('sound-btn').addEventListener('click', () => {
  const on = !sound.on; sound.enable(on);
  $('sound-btn').setAttribute('aria-pressed', String(on)); $('sound-btn').textContent = on ? 'Sound on' : 'Sound off';
});
window.addEventListener('hashchange', route);

applyTheme(theme.id);
route();
requestAnimationFrame(frame);
window.__house = () => house;   // for local testing in the console
window.__live = live;
window.__theme = () => theme;
window.__demo = demo;
