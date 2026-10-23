// Wiring: render loop, seat choice (#/seat/N, #demo), wallet lookup, diary, daily letter and counters.
import { W, H, drawHouse, drawSky, drawProps, drawLights, skyPhase } from './world.js';
import { House } from './brain.js';
import { drawPerson, drawDog, drawCarrier, drawBubble, lookFor } from './person.js';
import { LiveFeed, DemoFeed, isAsleep } from './feed.js';
import { wallets, connect, seatsOf } from './wallet.js';
import { Sound } from './sound.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game'), g = canvas.getContext('2d');
const layer = document.createElement('canvas');
layer.width = W; layer.height = H;
drawHouse(layer.getContext('2d'));

const sound = new Sound();
let house = null, look = null, feed = null, seatId = null, mode = null, tick = 0;
let pendingLetter = null, wallet = null;

const live = new LiveFeed(onEvent, onStatus);
const demo = new DemoFeed(onEvent, onStatus);

// ---------- render loop: logic at 30 ticks a second ----------
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(250, now - last); last = now;
  while (acc >= 1000 / 30) { if (house) house.tick(tick); tick++; acc -= 1000 / 30; }
  draw();
  requestAnimationFrame(frame);
}

function draw() {
  const phase = skyPhase(new Date());
  drawSky(g, phase, tick);
  g.drawImage(layer, 0, 0);
  if (!house) return;
  const s = house.state, m = house.man;
  drawProps(g, s, tick);
  drawDog(g, house.dog, tick, look.dog);
  drawPerson(g, m, tick, look);
  drawLights(g, s, phase);
  if (house.carrier) drawCarrier(g, house.carrier, tick);
  if (m.icon) {
    const hx = m.pose === 'sleep' ? 76 : m.x, hy = m.pose === 'sleep' ? 98 : m.y - (['sit', 'type', 'review', 'piano', 'tvsit', 'sad'].includes(m.pose) ? 32 : 32);
    drawBubble(g, hx, hy, m.icon, tick);
  }
}

function fit() {
  const avail = Math.min(document.querySelector('.page').clientWidth, window.innerWidth - 32);
  const k = Math.min(2, Math.floor(avail / W));
  canvas.style.width = k >= 1 ? k * W + 'px' : '100%';      // whole-pixel scaling where it fits, else fill the width
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
  demo.stop();
  mode = 'live'; seatId = id;
  house = new House(id, sound); look = lookFor(id);
  house.onLetterDone = showLetter;
  feed = live;
  clearDiary(); hideLetter();
  setTitle('Who lives in seat ', id);
  $('lede').textContent = 'A little person lives the working day of this IMD swarm seat. Everything he does comes from the seat\'s public record.';
  $('seat-input').value = id;
  $('demo-btn').setAttribute('aria-pressed', 'false');
  if (location.hash !== '#/seat/' + id) history.replaceState(null, '', '#/seat/' + id);
  live.setSeat(id);
}

function startDemo() {
  live.stop();
  mode = 'demo'; seatId = 'demo';
  house = new House(4242, sound); look = lookFor(4242);
  house.onLetterDone = showLetter;
  clearDiary(); hideLetter();
  setTitle('Demo: a made-up seat, one fast day', null);
  $('lede').textContent = 'Every event the house knows, in about four minutes: the phone, work, a posted result, good and bad mail, an oracle panel, a failed run, a worker update, the checker going down, sleep.';
  $('demo-btn').setAttribute('aria-pressed', 'true');
  if (location.hash !== '#demo') history.replaceState(null, '', '#demo');
  demo.start();
}

async function randomBusySeat() {
  try {
    const sw = live.swarm || await live.fetchSwarm();
    const day = Date.now() - 24 * 3600 * 1000;
    const busy = Object.values(sw.seats).filter((s) => s.last && Date.parse(s.last) > day);
    const pick = busy.length ? busy[Math.floor(Math.random() * busy.length)] : null;
    if (pick) visit(pick.tokenId);
    else addDiary('No seat worked in the last 24 hours. Type a seat number instead.');
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
  work: (e) => `He sat down at the computer: a new task${e.role ? ' (' + e.role + ')' : ''}.`,
  workdone: () => 'He finished the task and got up.',
  post: (e) => e.n > 1 ? `He posted ${e.n} results in the mailbox.` : 'He posted a result in the mailbox.',
  accepted: (e) => e.n > 1 ? `Good news in the mail: ${e.n} accepted. New pictures go on the wall.` : 'Good news in the mail: accepted. A new picture goes on the wall.',
  rejected: (e) => e.n > 1 ? `${e.n} rejections came in the mail. He sits on his bed for a while.` : 'A rejection came in the mail. He sits on his bed for a while.',
  failed: () => 'His computer started smoking: a run failed.',
  phone: () => 'The phone rings: work is waiting for him.',
  oracle: () => 'He looks through the telescope: his seat sits on an oracle panel.',
  verifier: (e) => e.down ? 'The TV shows static: the swarm\'s checker is down.' : 'The TV works again: the checker is back.',
  sleep: () => 'Lights out. The seat left the network or has had no task for three days.',
  wake: () => 'He\'s up again: the seat is back.',
  update: (e) => `A parcel arrived: a newer worker is out (${e.info.latest}${e.info.behind != null ? ', ' + e.info.behind + ' releases ahead of his' : ''}). It waits at the door until the seat updates.`,
  updated: (e) => `The seat updated its worker to ${e.to}. He unpacks the parcel and installs it.`,
};

function onEvent(e) {
  if (!house) return;
  if (e.type === 'init') {
    const st = e.asleep ? 'He\'s asleep: the seat left the network or has had no task for three days.' : e.working ? 'He\'s at his computer, working.' : 'He\'s at home, between tasks.';
    addDiary(mode === 'demo' ? 'The demo starts. ' + st : `You're visiting seat #${e.seat}. ${st}`);
    if (e.update && e.update.needs) addDiary(`A parcel waits at his door: the seat runs ${e.update.current}, and the newest worker is ${e.update.latest}.`);
    if (mode === 'live') e.letter = prepareLetter(e.seat, e.data, e.asleep);
    else { pendingLetter = demoLetter(); e.letter = true; }
  } else if (SAY[e.type]) addDiary(SAY[e.type](e));
  house.event(e);
}

function onStatus(s) {
  if (s.error) { $('st-line').textContent = 'Can\'t reach the swarm (' + s.error + '). Retrying.'; return; }
  if (house) house.idleHours = s.idleHours || 0;
  const d = s.data;
  for (const k of ['attempts', 'accepted', 'rejected', 'failed']) $('st-' + k).textContent = d ? Number(d[k]).toLocaleString('en-US') : '–';
  $('st-head').textContent = s.seat === 'demo' ? 'The demo seat' : `Seat #${s.seat}`;
  const bits = [];
  if (!d) bits.push('This seat has no record in the swarm yet.');
  else {
    bits.push(d.working ? 'Working now.' : s.asleep ? 'Asleep.' : s.idleHours > 12 ? 'Awake, but no work for a while.' : 'Awake.');
    if (d.agentId) bits.push(`Agent ${d.agentId}.`);
    if (d.last) bits.push('Last task ' + ago(Date.parse(d.last)) + '.');
  }
  if (s.verifierDown) bits.push('The swarm\'s checker is down.');
  bits.push((s.live ? 'Read ' : 'Demo data, ') + s.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.');
  $('st-line').textContent = bits.join(' ');
  $('st-worker').textContent = workerLine(s);
}

function workerLine(s) {
  if (s.seat === 'demo') return 'Worker: demo data.';
  if (!s.detailRead) return 'Worker version: this page can\'t read the seat record from here (no relay, no CORS).';
  const u = s.update, v = s.version || 'unknown';
  if (!u) return `Worker ${v}. The newest release could not be read.`;
  const age = u.latestAgeH < 1 ? 'under an hour' : Math.round(u.latestAgeH) + ' h';
  if (!u.needs && u.behind === 0) return `Worker ${v}, the newest release (out ${age}).`;
  if (!u.needs) return `Worker ${v}. A newer one (${u.latest}) came out ${age} ago; seats that update themselves catch up between tasks.`;
  return `Worker ${v}: needs an update. ${u.behind != null ? u.behind + ' releases' : 'More than 40 releases'} behind the newest (${u.latest}, out ${age}).`;
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

function prepareLetter(id, d, asleep) {
  if (!d) return false;
  const key = 'seathouse:v1:' + id, today = new Date().toISOString().slice(0, 10);
  const prev = store(key);
  if (prev && prev.day === today) return false;
  const now = { day: today, at: Date.now(), attempts: d.attempts, accepted: d.accepted, rejected: d.rejected, failed: d.failed };
  const lines = [];
  if (!prev) {
    lines.push(`Hello! I'm the little person who lives in seat #${id}.`);
    lines.push(`So far I have taken on ${d.attempts} tasks: ${d.accepted} were accepted, ${d.rejected} rejected and ${d.failed} failed.`);
  } else {
    const dd = (k) => d[k] - (prev[k] || 0);
    lines.push(`Welcome back! Since you came by ${ago(prev.at)}:`);
    if (dd('attempts') <= 0) lines.push('nothing new came in. The swarm has been quiet for me.');
    else lines.push(`I took on ${dd('attempts')} tasks. ${dd('accepted')} were accepted, ${dd('rejected')} rejected and ${dd('failed')} failed.`);
  }
  const rate = d.attempts ? Math.round(100 * d.accepted / d.attempts) : 0;
  lines.push(d.working ? 'Right now I\'m in the middle of a task.' : asleep ? 'I\'m having a long rest, so don\'t wake me.' : 'Right now I\'m between tasks.');
  if (d.attempts > 20) lines.push(rate >= 85 ? `Most of my work gets accepted (${rate}%). I'm proud of the wall.` : `${rate}% of my work gets accepted. I keep trying.`);
  lines.push('', 'Yours,', `seat #${id}`);
  pendingLetter = lines.join('\n');
  store(key, now);
  return true;
}

function demoLetter() {
  return 'Hello! I\'m a made-up seat, here to show you around.\nWatch the phone, the mailbox, the telescope and my computer: each one stands for something a real seat does.\n\nYours,\nthe demo seat';
}

function showLetter() {
  if (!pendingLetter) return;
  $('letter-text').textContent = pendingLetter;
  $('letter').hidden = false;
  addDiary('He typed you a letter.');
  pendingLetter = null;
}
function hideLetter() { $('letter').hidden = true; pendingLetter = null; }

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
    const short = wallet.address.slice(0, 6) + '…' + wallet.address.slice(-4);
    const box = $('wallet-seats');
    box.innerHTML = '';
    if (!res.ids.length) note.textContent = `${short} holds no seats. You can still visit any seat by number.`;
    else {
      note.textContent = `${short} holds ${res.ids.length === 1 ? 'one seat' : res.ids.length + ' seats'}${res.confirmed ? '' : ' (from the swarm\'s list; your wallet is on another network, so they were not checked onchain)'}.`;
      for (const id of res.ids) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'door';
        const small = document.createElement('small');
        small.textContent = 'your seat';
        b.append('#' + id, small);
        b.addEventListener('click', () => visit(id));
        box.append(b);
      }
      if (res.ids.length === 1) visit(res.ids[0]);
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
  wallet = null;
  $('wallet-seats').innerHTML = ''; $('wallet-note').textContent = 'Forgotten. This page keeps no wallet data.';
  $('wallet-btn').textContent = 'Connect wallet'; $('wallet-forget').hidden = true;
});

// ---------- the rest of the controls ----------
$('seat-form').addEventListener('submit', (e) => { e.preventDefault(); const v = $('seat-input').value; if (v !== '') visit(v); });
$('random-btn').addEventListener('click', randomBusySeat);
$('demo-btn').addEventListener('click', () => (mode === 'demo' ? randomBusySeat() : startDemo()));
$('sound-btn').addEventListener('click', () => {
  const on = !sound.on; sound.enable(on);
  $('sound-btn').setAttribute('aria-pressed', String(on)); $('sound-btn').textContent = on ? 'Sound on' : 'Sound off';
});
window.addEventListener('hashchange', route);

fit();
route();
requestAnimationFrame(frame);
window.__house = () => house;   // for local testing in the console
window.__live = live;
