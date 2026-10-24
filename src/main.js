// Wiring: render loop, looks (themes), seat choice (#/seat/N, #demo), following a job (#/job/<id>), wallet lookup,
// diary, daily letter, counters.
import { House } from './brain.js';
import { LiveFeed, DemoFeed, JobFollower, isAsleep } from './feed.js';
import { wallets, connect, seatsOf } from './wallet.js';
import { Sound } from './sound.js';
import { CATEGORIES } from './mapping.js';
import { THEMES, DEFAULT_THEME } from './themes/index.js';
import { setPhase } from './world.js';
import { parse, answer, pick, stressCost, HELP, BUSY, DO, EGG, UNKNOWN, ASLEEP, AWAY, OUT, WALKOUT, LOOKUP, STRESS } from './talk.js';

const $ = (id) => document.getElementById(id);
// built but switched off (the owner, 2026-10-24: "dont delete the cut features, we may add it back later"): the look
// switch (IMD | LCP) and the wallet lookup. Elements marked data-feature="…" show only when theirs is on.
// machineTicker: the green ticker and the effort dial on the machine wall (owner, 2026-10-24: reverted, other ways to
// show provider, model and effort wanted); the data behind it (LiveFeed.checkMachine) still runs.
const FEATURES = { lookSwitch: false, wallet: false, machineTicker: false };
for (const el of document.querySelectorAll('[data-feature]')) el.hidden = !FEATURES[el.dataset.feature];

// light or dark page around the house (IMD look): the side-by-side page sends the explorer's mode as
// {type: 'lcp:mode', mode}; kept for this tab, so a reload of the frame starts in it. Dark when nothing says.
function setMode(m) {
  if (m !== 'light' && m !== 'dark') return;
  document.documentElement.dataset.mode = m;
  try { sessionStorage.setItem('lcp:mode', m); } catch (e) { /* no storage */ }
}
try { setMode(sessionStorage.getItem('lcp:mode')); } catch (e) { /* no storage */ }
window.addEventListener('message', (e) => {
  if (!e.data) return;
  if (e.data.type === 'lcp:mode') setMode(e.data.mode);
  if (e.data.type === 'lcp:split' && e.source === window.parent && window.parent !== window) {
    inSplit = !!e.data.on; activeJobs = Number(e.data.activeJobs) || 0; explorerButton();
  }
});
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
const follower = new JobFollower(onFollow);
let followed = null;                 // the job followed now: {id, job}

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
  theme.flags = FEATURES;
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

// job: the seat is shown because it works on the followed job; the diary goes on and the address stays #/job/<id>
function visit(id, job = false) {
  id = Math.max(0, Math.min(1999, Math.floor(Number(id))));
  if (!Number.isFinite(id)) return;
  if (!job) stopFollowing();
  demo.stop(); setPhase(null);
  mode = 'live'; seatId = id;
  house = new House(id, sound, theme); seatSeed = id; theme.setSeed(id);
  house.onLetterDone = showLetter;
  house.onKnock = showKnock;
  feed = live; lastUpdate = null; hideKnock();
  if (!job) clearDiary();
  hideLetter(); machineSaid = ''; talkState.stress = 0;
  setTitle('Who lives in Swarmstreet ', id);
  $('lede').textContent = job && followed ? followLede() : 'A little pepe lives the working day of this IMD swarm seat. Everything he does comes from the seat\'s public record.';
  $('seat-input').value = id;
  $('demo-btn').setAttribute('aria-pressed', 'false');
  if (!job && location.hash !== '#/seat/' + id) history.replaceState(null, '', '#/seat/' + id);
  live.setSeat(id);
  explorerButton();
}

// ---------- following a job: the house of the seat working on it, then of the seat on its next step ----------
// step: #/job/<id>/step/<key>, a step the visitor chose (the side-by-side page sends it when a step row of the job opens
// in the explorer); the address goes back to #/job/<id>, so choosing it again is a new address change
function followJob(id, step = null) {
  if (location.hash !== '#/job/' + id) history.replaceState(null, '', '#/job/' + id);
  if (followed && followed.id === id) { if (step) follower.prefer(step); return; }
  followed = { id, job: null };
  clearDiary();
  addDiary(`Looking up job ${id.slice(0, 8)}…`);
  $('lede').textContent = followLede();
  follower.start(id, step);
}

function stopFollowing() { follower.stop(); followed = null; }

function jobName(job) {
  const o = (job && job.objective || '').replace(/\s+/g, ' ').trim();
  return o ? `"${o.length > 70 ? o.slice(0, 69) + '…' : o}"` : 'job ' + followed.id.slice(0, 8);
}

function followLede() {
  const j = followed && followed.job;
  return `Following job ${followed.id.slice(0, 8)}${j && j.objective ? ': ' + jobName(j) : ''}. The house is the seat working on it now, and moves to the seat on its next step.`;
}

function onFollow(e) {
  if (!followed || e.jobId !== followed.id) return;
  if (e.job) followed.job = e.job;
  const name = jobName(followed.job), st = e.step;
  if (e.type === 'error') {
    if (e.first) addDiary(`Can't read job ${followed.id.slice(0, 8)} (${e.error}). Following a job needs the local server's relay. Retrying.`);
    return;
  }
  if (e.type === 'start') {
    if (st && st.seat !== seatId) visit(st.seat, true);
    $('lede').textContent = followLede();
    addDiary(!st ? `Following ${name}. No seat has started on it yet; the house moves when one does.`
      : e.running ? `Following ${name}. Seat #${st.seat} works on its step ${st.key}${e.count > 1 ? `, the longest of the ${e.count} seats on it now` : ''}.`
        : `Following ${name}. No seat works on it right now; this is seat #${st.seat}, the last one that did (${st.key}). The house moves when a seat starts its next step.`);
  } else if (e.type === 'step') {
    addDiary(e.picked ? `You chose ${st.key}: seat #${st.seat} works on it now${st.seat === seatId ? '.' : ', and the house moves there.'}`
      : `${e.from ? e.from.key + ' is done. ' : ''}Seat #${st.seat} started ${st.key}${st.seat === seatId ? ': the same seat goes on.' : ': the house moves there.'}`);
    if (st.seat !== seatId) visit(st.seat, true);
  } else if (e.type === 'waiting') {
    addDiary(`${e.from.key} is done. Waiting for a seat to start the next step of ${name}.`);
  } else if (e.type === 'ended') {
    if (st && (e.first ? st.seat !== seatId : !house)) visit(st.seat, true);
    const reason = e.job.blockedReason ? ` (${String(e.job.blockedReason).slice(0, 100)})` : '';
    if (e.first) addDiary(`${name} is already ${e.state}${reason}.${st ? ` This is seat #${st.seat}, the last one that worked on it.` : ''}`);
    else if (e.state === 'completed') { addDiary(`${name} is done! Fireworks over Swarmstreet, and he dances in the kitchen with his dog.`); if (house) house.event({ type: 'celebrate' }); }
    else { addDiary(`${name} is ${e.state}${reason}. He scratches his head.`); if (house) house.event({ type: 'jobdone', state: 'blocked' }); }
  }
}

function startDemo() {
  stopFollowing();
  live.stop();
  talkState.stress = 0;
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
  explorerButton();
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
  const j = h.match(/^#\/job\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/step\/([^/]{1,200}))?$/);
  if (m) visit(m[1]);
  else if (j) { let step = null; try { step = j[2] ? decodeURIComponent(j[2]) : null; } catch (e) { /* not a step key */ } followJob(j[1], step); }
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
  machine: (e) => machineLine(e.info),
};

// what he works with, in words, once per model (the house shows it as the attic light, the chimney smoke and the
// symbol in his bubble): null when there is nothing new to say
let machineSaid = '';
function machineLine(m) {
  const key = m && m.modelId ? m.modelId + '|' + (m.effort || '') : '';
  if (!key || key === machineSaid) { if (!key) machineSaid = ''; return null; }
  machineSaid = key;
  const rt = { claude: 'Claude Code', codex: 'Codex' }[m.runtime] || m.runtime;
  if (FEATURES.machineTicker) return `His machine runs ${m.modelId} on ${rt}, ${m.effort ? 'effort ' + m.effort : 'effort not shown for this tier'}.`;
  return m.premium
    ? `He works with ${m.modelId} on ${rt}, the seat's premium model${m.effort ? ', effort ' + m.effort : ''}: the attic light is on.`
    : `He works with ${m.modelId} on ${rt}, not the seat's premium model, so its effort isn't published.`;
}
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
  if (followed && e.jobId === followed.id && (e.type === 'jobdone' || e.type === 'launched')) return;   // the follower ends it
  if (e.type === 'init') {
    const st = e.paused ? 'He\'s out: the seat\'s owner paused it. A sign on the door says he\'ll be back soon.' : e.asleep ? 'He\'s asleep: the seat left the network or has had no task for three days.' : e.working ? 'He\'s working on ' + (e.label || 'a task') + (e.guess ? ' (probably, going by his recent work).' : '.') : 'He\'s at home, between tasks.';
    addDiary(mode === 'demo' ? 'The demo starts. ' + st : `You're visiting seat #${e.seat}. ${st}`);
    if (e.update && e.update.needs) addDiary(`A parcel waits at his door: the seat runs ${e.update.current}, and the newest worker is ${e.update.latest}.`);
    if (mode === 'live') e.letter = prepareLetter(e.seat, e.data, e.asleep, e.paused);
    else { pendingLetter = demoLetter(); e.letter = true; }
  } else if (SAY[e.type]) { const line = SAY[e.type](e); if (line) addDiary(line); }
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
  // following a job the house moves from seat to seat, and each new seat may write: the letter closes itself after 10 s
  clearTimeout(letterTimer);
  if (followed) letterTimer = setTimeout(() => { $('letter').hidden = true; }, 10000);
}
let letterTimer = null;
function hideLetter() { $('letter').hidden = true; pendingLetter = null; clearTimeout(letterTimer); }
$('letter-close').addEventListener('click', () => { $('letter').hidden = true; clearTimeout(letterTimer); });
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

// ---------- the IMD Explorer beside the house: the local side-by-side page (tools/side-by-side/, port 8798) ----------
// On its own the house offers "Show on IMD Explorer" while that page answers: it opens with this house on the left and
// the seat's agent page on the right (following the same job, if one is followed). Inside it, the page says so
// ({type: 'lcp:split', on: true, activeJobs}) and the button hides the explorer again: the page goes back to this
// house alone; "Random job" asks the page to follow one (its job page left, this house following it).
// A hosted copy, or a page framed by anything else, shows neither.
const SPLIT = 'http://127.0.0.1:8798/side-by-side';
let inSplit = false, splitUp = false, activeJobs = 0;

function explorerButton() {
  const b = $('explorer-btn'), r = $('random-job-btn');
  b.hidden = !inSplit && (mode !== 'live' || seatId == null || !(splitUp && window.parent === window));
  b.textContent = inSplit ? 'Hide explorer' : 'Show on IMD Explorer';
  r.hidden = !inSplit;
  r.disabled = !activeJobs;
  r.title = activeJobs ? `Follow one of the ${activeJobs} active job${activeJobs === 1 ? '' : 's'}, picked at random` : 'No active jobs right now';
}

$('random-job-btn').addEventListener('click', () => { if (inSplit) window.parent.postMessage({ type: 'lcp:randomJob' }, '*'); });

async function probeSplit() {
  if (window.parent === window) {
    try { await fetch(SPLIT, { mode: 'no-cors', cache: 'no-store' }); splitUp = true; } catch (e) { splitUp = false; }
  }
  explorerButton();
}
probeSplit();
setInterval(probeSplit, 60000);

$('explorer-btn').addEventListener('click', () => {
  if (inSplit) { window.parent.postMessage({ type: 'lcp:hideExplorer', hash: location.hash }, '*'); return; }
  const q = new URLSearchParams({ seat: String(seatId) });
  if (followed) q.set('job', followed.id);
  location.href = SPLIT + '?' + q;
});

// ---------- talking to him (talk.js) ----------
// Page commands do what the buttons do, whatever he's busy with. The rest is up to him: while the seat works he
// refuses (an explorer page he points you to opens anyway), every request stresses him a little (more while he works,
// less with please, more with insults; it wears off in 15 s steps), and past STRESS.walkout he takes the dog out.
// Questions he looks up at the machine; a page the explorer shows opens beside him (or the side-by-side page opens).
const talkState = { stress: 0, at: 0, history: [], back: 0 };

function talkReply(text, who = true) {
  const p = $('talk-reply');
  p.textContent = '';
  if (text == null) return;
  if (who) { const w = document.createElement('span'); w.className = 'who'; w.textContent = 'pepe: '; p.append(w); }
  p.append(text);
}

function talkSay(cmd, text) {
  talkReply(text);
  addDiary(text ? `You: "${cmd}". He: ${text}` : `You: "${cmd}".`);
}

function talkContext() {
  const sw = live.swarm || {};
  return { seat: seatId, demo: mode === 'demo', detail: live.detail || {}, data: (live.prev && live.prev.data) || {},
    health: sw.health || {}, counts: sw.counts || {}, machine: live.machine, update: live.update,
    followed: followed ? followed.id : null, now: Date.now() };
}

function stressAdd(cost) {
  const now = Date.now();
  talkState.stress = Math.max(0, talkState.stress - Math.floor((now - talkState.at) / STRESS.decayMs) + cost);
  talkState.at = now;
  return talkState.stress;
}

// a page on explorer.imd.fun beside him: in the side-by-side page, or by opening it; false when neither is there
function openExplorer(path) {
  if (!path) return false;
  if (inSplit) { window.parent.postMessage({ type: 'lcp:explore', path }, '*'); return true; }
  if (splitUp && window.parent === window && mode === 'live' && seatId != null) {
    const q = new URLSearchParams({ seat: String(seatId), ex: path });
    if (followed) q.set('job', followed.id);
    setTimeout(() => { location.href = SPLIT + '?' + q; }, 1800);      // a moment to read his answer first
    return true;
  }
  return false;
}

async function activeJobList() {
  try { const r = await fetch('/proxy/jobs/active', { cache: 'no-store' }); if (r.ok) return (await r.json()).jobs || []; } catch (e) { /* no relay */ }
  return null;
}

// a job by its full id, or by the first characters of an active one
async function resolveJob(id) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return id;
  const hit = ((await activeJobList()) || []).filter((j) => j.id.startsWith(id));
  return hit.length === 1 ? hit[0].id : null;
}

// following a job from the command line: what the buttons do (the side-by-side page shows it too)
function followFromTalk(id) {
  if (inSplit) window.parent.postMessage({ type: 'lcp:followJob', id }, '*');
  else location.hash = '#/job/' + id;
}

async function pageCommand(it, cmd) {
  const say = (text) => { talkReply(text); addDiary(`You: "${cmd}". ${text}`); };
  switch (it.act) {
    case 'help': talkReply(HELP, false); return;
    case 'visit': visit(it.seat); say(`Seat #${it.seat}. You moved, I didn't.`); return;
    case 'random': await randomBusySeat(); talkReply('A random busy seat. Same face, different bags.'); return;
    case 'demo': $('demo-btn').click(); talkReply(mode === 'demo' ? 'The demo: a made-up seat. Like most roadmaps.' : 'Back to a real seat.'); return;
    case 'sound': if (sound.on !== it.on) $('sound-btn').click(); say(it.on ? 'Sound on. Hope you like beeps.' : 'Sound off. Finally.'); return;
    case 'legend': $('legend-btn').click(); return;
    case 'hideExplorer':
      if (inSplit) $('explorer-btn').click(); else say('There\'s no explorer to hide, ser.');
      return;
    case 'showExplorer':
      if (inSplit) say('It\'s right there. Next to me. On the right.');
      else if (!$('explorer-btn').hidden) $('explorer-btn').click();
      else say('No explorer here: the side-by-side page isn\'t running (tools/side-by-side).');
      return;
    case 'randomJob': {
      if (inSplit) { $('random-job-btn').click(); say('A random active job. Strap in.'); return; }
      const list = await activeJobList();
      if (!list) { say('Can\'t list the jobs without the local relay.'); return; }
      if (!list.length) { say('No active jobs. The swarm is touching grass.'); return; }
      followFromTalk(pick(list).id); say('Following a random active job. Strap in.');
      return;
    }
    case 'follow': {
      if (!it.job) { say('Which one? follow job <id>, or random job.'); return; }
      const id = await resolveJob(it.job);
      if (!id) { say(`No active job starts with ${it.job}. Typo, or it already shipped.`); return; }
      followFromTalk(id); say(`Following job ${id.slice(0, 8)}. I'll tell the dog.`);
      return;
    }
    default: return;
  }
}

function egg(it, cmd, grumble) {
  if (it.act === 'trade') {
    house.event({ type: 'command', act: 'trade', done: () => talkSay(cmd, pick(EGG.tradeAfter)) });
    talkSay(cmd, pick(EGG.trade)); return;
  }
  if (it.act === 'buy') {
    house.event({ type: 'command', act: 'buy', done: () => talkSay(cmd, pick(EGG.buyAfter)) });
    talkSay(cmd, pick(EGG.buy)); return;
  }
  const scene = { gm: 'gm', gn: 'nap', moon: 'moon', lfg: 'lfg', mint: 'paint', pump: 'exercise', seed: 'nope', wallet: 'nope',
    nothing: 'telescope' }[it.act];
  if (scene) house.event({ type: 'command', act: scene });
  else house.event({ type: 'flash', icon: it.act === 'thanks' ? 'heart' : ['insult', 'ngmi', 'fud'].includes(it.act) ? 'bang' : 'dots' });
  talkSay(cmd, pick(EGG[it.act] || UNKNOWN) + (it.act === 'thanks' ? '' : grumble));
}

async function talk(raw) {
  const cmd = String(raw || '').trim().slice(0, 160);
  if (!cmd) return;
  talkState.history.push(cmd); talkState.back = 0;
  const it = parse(cmd);
  if (it.kind === 'page') return pageCommand(it, cmd);
  if (!house) { talkReply('Nobody lives here yet. Pick a seat first.'); return; }
  const s = house.state;
  if (house.walkout) return talkSay(cmd, pick(OUT));
  if (s.away) return talkSay(cmd, AWAY);
  if (it.kind === 'egg' && it.act === 'sell') { talkReply(null); addDiary(`You: "${cmd}".`); return; }   // he doesn't even look up
  if (s.asleep) return talkSay(cmd, pick(ASLEEP));
  const busy = s.working && !(it.kind === 'egg' && it.act === 'buy');                                  // IMD: he drops everything
  const lvl = stressAdd(stressCost(it, busy));
  if (lvl >= STRESS.walkout) {
    talkState.stress = 0;
    house.event({ type: 'walkout', seconds: STRESS.outSeconds });
    return talkSay(cmd, pick(WALKOUT));
  }
  if (busy) {
    const tier = lvl >= STRESS.warn ? 2 : lvl >= STRESS.grumpy ? 1 : 0;
    house.event({ type: 'flash', icon: tier ? 'bang' : 'dots' });
    let text = pick(BUSY[tier]);
    if (it.kind === 'ask') { const a = answer(it, talkContext()); if (a.explorer && openExplorer(a.explorer)) text += ' Look it up yourself, it\'s on the explorer.'; }
    return talkSay(cmd, text);
  }
  const grumble = lvl >= STRESS.warn ? ' (Last one. I mean it.)' : lvl >= STRESS.grumpy ? ' (Sigh.)' : '';
  if (it.kind === 'ask') {
    if (it.topic === 'job' && it.job && it.job.length < 36) it.job = (await resolveJob(it.job)) || it.job;
    talkReply(LOOKUP, false);
    house.event({ type: 'command', act: 'lookup', done: () => {
      const a = answer(it, talkContext()), opened = !!a.explorer && openExplorer(a.explorer);
      talkSay(cmd, a.text + (a.explorer && !opened ? ` (explorer.imd.fun${a.explorer})` : '') + grumble);
    } });
    return;
  }
  if (it.kind === 'do') { house.event({ type: 'command', act: it.act }); return talkSay(cmd, DO[it.act] + grumble); }
  if (it.kind === 'egg') return egg(it, cmd, grumble);
  house.event({ type: 'flash', icon: 'ask' });
  return talkSay(cmd, pick(UNKNOWN));
}

$('talk-form').addEventListener('submit', (e) => { e.preventDefault(); const v = $('talk-input').value; $('talk-input').value = ''; talk(v); });
$('talk-input').addEventListener('keydown', (e) => {                // the shell's arrows: earlier commands
  const h = talkState.history;
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  e.preventDefault();
  talkState.back = Math.max(0, Math.min(h.length, talkState.back + (e.key === 'ArrowUp' ? 1 : -1)));
  $('talk-input').value = talkState.back ? h[h.length - talkState.back] : '';
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
window.__follower = follower;
