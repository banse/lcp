// Wiring: render loop, looks (themes), seat choice (#/seat/N, #demo), following a job (#/job/<id>), wallet lookup,
// diary, daily letter, counters.
import { House } from './brain.js';
import { LiveFeed, DemoFeed, JobFollower, SwarmJobs, isAsleep } from './feed.js';
import { wallets, connect, seatsOf } from './wallet.js';
import { Sound } from './sound.js';
import { CATEGORIES, expertise } from './mapping.js';
import { taskCategory } from './feed.js';
import { THEMES, DEFAULT_THEME } from './themes/index.js';
import { THINGS } from './themes/imd-layout.js';
import { setPhase } from './world.js';
import { parse, answer, pick, stressCost, HELP, BUSY, DO, EGG, UNKNOWN, ASLEEP, AWAY, OUT, WALKOUT, LOOKUP, STRESS, MARKET, marketText,
  SWORN, BURN, RADIO, NEWS, trophyLine } from './talk.js';
import { DAILY, latestIssue, issueLine, paperLines } from './daily.js';
import { NewsReader } from './news.js';
import { cardOf } from './sworn.js';
import { SWORN_FRAME } from './themes/imd.js';
import { Radio, STATIONS, PENDING, GAIN, stationByName, stationFor, sadStation, SITE as THEIDM } from './radio.js';
import { StationFeed, SILENCE, amount } from './stationfeed.js';
import { IMD_CA, WETH, CHAINS, launchOf, quote, chartUrl, swapUrl, usd, DEFINED_URL, LLAMA_URL } from './market.js';
import { LOCAL, RELAY } from './env.js';
import { BUILD } from './build.js';

const $ = (id) => document.getElementById(id);
// built but switched off (the owner, 2026-10-24: "dont delete the cut features, we may add it back later"): the look
// switch (IMD | LCP) and the wallet lookup. Elements marked data-feature="…" show only when theirs is on.
// machineTicker: the green ticker and the effort dial on the machine wall (owner, 2026-10-24: reverted, other ways to
// show provider, model and effort wanted); the data behind it (LiveFeed.checkMachine) still runs.
// marketPane: charts and swaps in a frame of this page, off in the swarm build only (owner, 2026-10-25: a first swarm-hosted
// version without iframe features; "the server version should have all features"); off, he answers with the link
// boardSeats: a "Working now" row of buttons under the large whiteboard (2026-10-25; switched off the same day, owner:
// "just make the cards directly clickable … without extra buttons"); the cards switch the seat either way
// radio: theidm.fun's stations as the house's background music (2026-10-25, radio.js), in every build; radioLine: the line
// under the command line naming the station (switched off the same day, owner: "remove this line"; the button in the
// top bar next to Sound stays, its title names the station)
// news: The IMD Daily on IMD or swarm news (2026-10-26, daily.js, news.js), in every build
// sworn: the seat owner's Sworn card over the fireplace (2026-10-26, sworn.js), in every build
// counters: the Tasks / Accepted / Rejected / Failed panel under the house (switched off by the owner, 2026-10-26: "remove this
// panel"; the plaque on the tree carries the acceptance rate and his expertise instead, FEATURES.plaque)
const FEATURES = { lookSwitch: false, wallet: false, machineTicker: false, marketPane: BUILD !== 'swarm', boardSeats: false, radio: true, radioLine: false, news: true, sworn: true, counters: false, plaque: true };
// a switched-off feature's elements are hidden; the others keep their own state (the pane stays hidden until it shows a page)
for (const el of document.querySelectorAll('[data-feature]')) if (!FEATURES[el.dataset.feature]) el.hidden = true;

// light or dark page around the house (IMD look). The switch in the top bar works like explorer.imd.fun's (it names the
// other mode; the choice is kept in this browser); inside the side-by-side page the explorer's mode decides instead
// ({type: 'lcp:mode', mode}, kept for this tab, so a reload of the frame starts in it). Dark when nothing says; a
// script in index.html sets it before the first paint.
function setMode(m, keep = false) {
  if (m !== 'light' && m !== 'dark') return;
  document.documentElement.dataset.mode = m;
  try { sessionStorage.setItem('lcp:mode', m); if (keep) localStorage.setItem('lcp:mode', m); } catch (e) { /* no storage */ }
  $('mode-btn').querySelector('span').textContent = m === 'dark' ? 'Light mode' : 'Dark mode';
}
try { setMode(sessionStorage.getItem('lcp:mode') || localStorage.getItem('lcp:mode') || 'dark'); } catch (e) { setMode('dark'); }
$('mode-btn').addEventListener('click', () => setMode(document.documentElement.dataset.mode === 'light' ? 'dark' : 'light', true));
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

// ---------- the radio: theidm.fun's stations on the record player (radio.js; what plays, read from the pool: stationfeed.js) ----------
// The visitor's choice (on, station, volume) lives in this browser; a browser plays nothing before the first click or
// key, so a wanted radio starts at that first interaction. While it plays the house reads the station's pool itself and
// reacts to what the visitor hears; when it is off, nothing is read.
const radio = new Radio({ store: { get: (k) => store(k), set: (k, v) => store(k, v) }, onChange: radioChanged });
const stationFeed = new StationFeed(onStationEvent);
// The IMD Daily: the popup reader, and the issue he read last (a click on him while he reads opens it)
const news = FEATURES.news ? new NewsReader() : null;
let newsIssue = null;
let radioStage = 0, radioBpm = 100, radioRate = null, radioFeedKey = null, sadTimer = null;
function radioSync() {
  if (!house) return;
  house.state.radio = FEATURES.radio ? radio.houseState({ bpm: radioBpm, stage: radioStage }) : null;
  house.onPaper = onPaper;
  // his own record (the routine, or "spin a record"): music while he is at the player, even with the visitor's radio off
  house.onRecords = (on) => {
    if (!FEATURES.radio || radio.on) return;
    if (on) { radio.playFor('records'); if (radio.live) addDiary(`He puts a record on: ${radio.label()}.`); }
    else { if (radio.live) addDiary('He lifts the needle.'); radio.stopFor('records'); }
  };
}
function radioChanged(r) {
  if (!FEATURES.radio) return;
  const st = r.station;
  const note = r.live ? `live from its pool on ${st.chain}` : r.armed ? 'starts at your first click or key' : 'off';
  $('radio-station').textContent = st.label; $('radio-note').textContent = note;
  $('radio-open').href = THEIDM + '?net=' + st.key; $('radio-open').title = `${st.label} on theidm.fun: the live sound of its pool, every trade a note`;
  $('radio-btn').textContent = r.on ? 'Radio on' : 'Radio off'; $('radio-btn').setAttribute('aria-pressed', String(r.on));
  $('radio-btn').title = `${st.label} on theidm.fun, ${note}: background music, the live sound of a token's pool`;
  radioSync();
  const key = r.live ? st.key : null;
  if (key !== radioFeedKey) { radioFeedKey = key; radioStage = 0; radioRate = null; if (key) stationFeed.start(st); else stationFeed.stop(); radioSync(); }
}
// the station's pool, as the stream page reads it: a note per trade, whales, pulses, the silence stages, a finished track
function onStationEvent(e) {
  const st = radio.station;
  if (e.type === 'tick') {
    radioBpm = e.bpm; radioRate = e.rate;
    if (e.stage !== radioStage) {
      const up = e.stage > radioStage; radioStage = e.stage;
      if (house && radio.live && (up || e.stage === 0)) addDiary(`${st.label}: ${SILENCE[e.stage]}.`);
      if (e.stage === 3 && house) house.event({ type: 'radio', act: 'yawn' });
    }
    radioSync(); return;
  }
  if (!house || !radio.live) return;
  if (e.type === 'swap') {
    house.event({ type: 'radio', act: 'note' });
    if (e.pulse) addDiary(`A pulse kept the music alive: $IDM's treasury bought ${amount(e, st)}.`);
    else if (e.whale) {
      house.event({ type: 'radio', act: e.isBuy ? 'whaleBuy' : 'whaleSell' });
      addDiary(e.isBuy ? `A whale bought ${st.ticker}: ${amount(e, st)}. The kick just got heavier.` : `A whale sold ${st.ticker}: ${amount(e, st)}. A track went quiet; the dog howls.`);
    }
    if (radioStage) { radioStage = 0; radioSync(); }
    return;
  }
  if (e.type === 'track') { radio.tracks++; house.event({ type: 'radio', act: 'track' }); radioSync(); addDiary(`Track #${e.trackNo} of $IDM finished onchain. Fireworks, and a record for the wall.`); return; }
  if (e.type === 'error') addDiary(`Can't read ${st.label}'s pool right now (${e.message}). The radio plays on; he just can't hear the trades.`);
}
// a rejection: the sad record for a while (seeded by the seat, never the one playing), then the visitor's choice again
function sadRecord() {
  if (!FEATURES.radio || !radio.live) return;
  const st = sadStation(seatSeed, radio.key);
  radio.tune(st.key, 'sad', true);
  addDiary(`He puts on the sad record: ${st.label}.`);
  if (house) house.event({ type: 'radio', act: 'tune', done: () => radio.sync() }); else radio.sync();
  clearTimeout(sadTimer);
  sadTimer = setTimeout(() => { if (radio.restore('sad', true)) { addDiary(`Back to ${radio.station.label}.`); if (house) house.event({ type: 'radio', act: 'tune', done: () => radio.sync() }); else radio.sync(); } }, 45000);
}
let house = null, seatSeed = 4242, feed = null, seatId = null, mode = null, tick = 0;
let pendingLetter = null, wallet = null, lastUpdate = null;
const ownedSeats = new Set();
const KNOCK_AGAIN_MS = 30 * 60000, ACK_MS = 6 * 3600000;

const live = new LiveFeed(onEvent, onStatus);
const demo = new DemoFeed(onEvent, onStatus, () => house);
// a hosted page has no relay: the jobs it lists and follows are the ones /swarm's events show (feed.js, SwarmJobs)
const swarmJobs = new SwarmJobs();
live.onSwarm = (sw) => swarmJobs.ingest(sw);
const follower = new JobFollower(onFollow, RELAY ? null : swarmJobs);
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
  if (house) house.state.board = board.model;          // the job on his whiteboard (below)
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
function visit(id, job = false, hint = null) {
  id = Math.max(0, Math.min(1999, Math.floor(Number(id))));
  if (!Number.isFinite(id)) return;
  if (!job) stopFollowing();
  demo.stop(); setPhase(null);
  mode = 'live'; seatId = id;
  house = new House(id, sound, theme); seatSeed = id; theme.setSeed(id); radioSync(); house.state.seatNo = id;
  house.onLetterDone = showLetter;
  house.onKnock = showKnock;
  feed = live; lastUpdate = null; hideKnock();
  if (!job) clearDiary();
  hideLetter(); machineSaid = ''; talkState.stress = 0; talkReply(null);   // his last answer was the other seat's
  setTitle('Who lives in Swarmstreet ', id);
  $('lede').textContent = job && followed ? followLede() : 'A little pepe lives the working day of this IMD swarm seat. Everything he does comes from the seat\'s public record.';
  $('seat-input').value = id;
  $('demo-btn').setAttribute('aria-pressed', 'false');
  if (!job && location.hash !== '#/seat/' + id) history.replaceState(null, '', '#/seat/' + id);
  live.setSeat(id, hint);
  explorerButton();
  plaqueRetry = 0; clearTimeout(plaqueTimer);
  dailyPending = null; setTimeout(dailyWatch, 6000);          // a new seat: the day's paper, if this browser hasn't had it
  if (FEATURES.sworn) swornFor(id, house);
  if (!job) resetBoard();                              // another seat: its own job on the board (a followed job stays)
  setTimeout(readBoard, 1500);
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
  renderJobs(jobList);
}

function stopFollowing() { follower.stop(); followed = null; renderJobs(jobList); if (FEATURES.radio && radio.restore('follow')) addDiary(`Back to ${radio.station.label} on the radio.`); }
// the station follows the work (2026-10-25): a followed job about a token that has a station puts that record on
function followRadio(job) {
  if (!FEATURES.radio || !radio.live || !job) return;
  const st = stationFor(job.objective);
  if (st && st.key !== radio.key && radio.tune(st.key, 'follow', true)) { addDiary(`The job is about ${st.ticker}: he puts on ${st.label}.`); if (house) house.event({ type: 'radio', act: 'tune', done: () => radio.sync() }); else radio.sync(); }
}

function jobName(job) {
  const o = (job && job.objective || '').replace(/\s+/g, ' ').trim();
  return o ? `"${o.length > 70 ? o.slice(0, 69) + '…' : o}"` : 'job ' + followed.id.slice(0, 8);
}

function followLede() {
  const j = followed && followed.job;
  return `Following job ${followed.id.slice(0, 8)}${j && j.objective ? ': ' + jobName(j) : ''}. The house is the seat working on it now, and moves to the seat on its next step.`;
}

// the step a seat runs for the followed job: the house shows that work, not a guess from the seat's recent tasks
function stepHint(e, st) {
  return st && { seat: st.seat, jobId: e.jobId, step: st.key, role: st.role, job: e.job && { template: e.job.template, launch: e.job.launch } };
}

function onFollow(e) {
  if (!followed || e.jobId !== followed.id) return;
  if (e.job) followed.job = e.job;
  const name = jobName(followed.job), st = e.step;
  if (e.type === 'error') {
    if (e.hosted) {                                   // a hosted page: back to a seat, and say why
      stopFollowing();
      history.replaceState(null, '', seatId != null && mode === 'live' ? '#/seat/' + seatId : location.pathname);
      const note = () => addDiary('Following a job works in the local version only: a hosted page can\'t read the job records.');
      if (house && mode === 'live') { $('lede').textContent = 'A little pepe lives the working day of this IMD swarm seat. Everything he does comes from the seat\'s public record.'; note(); }
      else Promise.resolve(randomBusySeat()).then(note);
      return;
    }
    if (e.first) addDiary(RELAY ? `Can't read job ${followed.id.slice(0, 8)} (${e.error}). Following a job needs the local server's relay. Retrying.`
      : `Can't read the swarm's live feed (${e.error}). Retrying.`);
    return;
  }
  if (e.type === 'start') {
    setTimeout(readBoard, 300);
    followRadio(e.job);
    if (st && st.seat !== seatId) visit(st.seat, true, e.running ? stepHint(e, st) : null);
    else if (st && e.running) live.setHint(stepHint(e, st));
    $('lede').textContent = followLede();
    const o = e.job && e.job.oracle;
    if (e.unseen) addDiary(`Following job ${followed.id.slice(0, 8)}. The swarm's live feed doesn't show it right now; the house moves when one of its steps changes.`);
    else if (o && !e.running) addDiary(`Following ${name}, an oracle question: ${o.members.length} of ${o.panelSize} seats have answered (quorum ${o.quorum}).`);
    else addDiary(!st ? `Following ${name}. No seat has started on it yet; the house moves when one does.`
      : e.running ? `Following ${name}. Seat #${st.seat} works on its step ${st.key}${e.count > 1 ? `, the longest of the ${e.count} seats on it now` : ''}.`
        : `Following ${name}. No seat works on it right now; this is seat #${st.seat}, the last one that did (${st.key}). The house moves when a seat starts its next step.`);
  } else if (e.type === 'step') {
    addDiary(e.picked ? `You chose ${st.key}: seat #${st.seat} works on it now${st.seat === seatId ? '.' : ', and the house moves there.'}`
      : `${e.from ? e.from.key + ' is done. ' : ''}Seat #${st.seat} started ${st.key}${st.seat === seatId ? ': the same seat goes on.' : ': the house moves there.'}`);
    if (st.seat !== seatId) visit(st.seat, true, stepHint(e, st));
    else live.setHint(stepHint(e, st));
  } else if (e.type === 'waiting') {
    addDiary(`${e.from.key} is done. Waiting for a seat to start the next step of ${name}.`);
  } else if (e.type === 'answers') {                // an oracle question: the house is the panel seat that answered last
    if (!e.first) addDiary(`${e.answered} of ${e.panelSize} seats have answered ${name} (quorum ${e.quorum}).${e.seat !== seatId ? ` Seat #${e.seat} was the last: the house moves there.` : ''}`);
    if (e.seat != null && e.seat !== seatId) visit(e.seat, true, { seat: e.seat, jobId: e.jobId, step: 'oracle_assess', role: 'implement' });
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
  talkState.stress = 0; talkReply(null);
  mode = 'demo'; seatId = 'demo';
  house = new House(4242, sound, theme); seatSeed = 4242; theme.setSeed(4242); radioSync(); house.state.seatNo = '0000';
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
  if (mode === 'live' && (e.type === 'work' || e.type === 'workkind' || e.type === 'init')) setTimeout(readBoard, 1200);
  if (followed && e.jobId === followed.id && (e.type === 'jobdone' || e.type === 'launched')) return;   // the follower ends it
  if (e.type === 'init') {
    const st = e.paused ? 'He\'s out: the seat\'s owner paused it. A sign on the door says he\'ll be back soon.' : e.asleep ? 'He\'s asleep: the seat left the network or has had no task for three days.' : e.working ? 'He\'s working on ' + (e.label || 'a task') + (e.guess ? ' (probably, going by his recent work).' : '.') : 'He\'s at home, between tasks.';
    addDiary(mode === 'demo' ? 'The demo starts. ' + st : `You're visiting seat #${e.seat}. ${st}`);
    if (e.update && e.update.needs) addDiary(`A parcel waits at his door: the seat runs ${e.update.current}, and the newest worker is ${e.update.latest}.`);
    if (mode === 'live') e.letter = prepareLetter(e.seat, e.data, e.asleep, e.paused);
    else { pendingLetter = demoLetter(); e.letter = true; }
  } else if (SAY[e.type]) { const line = SAY[e.type](e); if (line) addDiary(line); }
  house.event(e);
  if (FEATURES.radio) {                                     // the radio follows his day (radio.js)
    if (e.type === 'init') { radio.setNight(!!e.asleep); radio.setBoost(!!e.working && e.category === 'audio'); }
    if (e.type === 'sleep') { radio.setNight(true); if (radio.live) addDiary('Lights out: the radio goes low.'); }
    if (e.type === 'wake') { radio.setNight(false); if (radio.live) addDiary('Up again: the radio comes back up.'); }
    if ((e.type === 'work' || e.type === 'workkind') && e.category === 'audio' && !radio.boost) { radio.setBoost(true); if (radio.live) addDiary('An audio task: he turns the radio up.'); }
    if (e.type === 'workdone' && radio.boost) radio.setBoost(false);
    if (e.type === 'rejected') sadRecord();
  }
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

let lastStatusError = null;
function onStatus(s) {
  if (s.error) {
    $('st-line').textContent = 'Can\'t reach the swarm (' + s.error + '). Retrying.';
    if (!FEATURES.counters && s.error !== lastStatusError) addDiary('Can\'t reach the swarm (' + s.error + '). Retrying.');
    lastStatusError = s.error; return;
  }
  lastStatusError = null;
  if (FEATURES.plaque) plaqueFor(s);
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
// On its own the house offers "IMD Explorer" while that page answers: it opens with this house on the left and
// the seat's agent page on the right (following the same job, if one is followed). Inside it, the page says so
// ({type: 'lcp:split', on: true, activeJobs}) and the button hides the explorer again: the page goes back to this
// house alone; "Random job" asks the page to follow one (its job page left, this house following it).
// A hosted copy, or a page framed by anything else, shows neither.
const SPLIT = 'http://127.0.0.1:8798/side-by-side';
const EXPLORER = 'https://explorer.imd.fun';                  // a hosted page opens it in a new tab (it refuses frames)
let inSplit = false, splitUp = false, activeJobs = 0;

function explorerButton() {
  const b = $('explorer-btn'), r = $('random-job-btn');
  b.hidden = !inSplit && (mode !== 'live' || seatId == null || !((splitUp || !LOCAL) && window.parent === window));
  b.textContent = inSplit ? 'Hide explorer' : 'IMD Explorer';
  r.hidden = !inSplit;
  $('job-form').hidden = inSplit;                     // the side-by-side page has its own job list
  $('mode-btn').hidden = inSplit;                     // and its own light / dark switch
  r.disabled = !activeJobs;
  r.title = activeJobs ? `Follow one of the ${activeJobs} active job${activeJobs === 1 ? '' : 's'}, picked at random` : 'No active jobs right now';
}

$('random-job-btn').addEventListener('click', () => { if (inSplit) window.parent.postMessage({ type: 'lcp:randomJob' }, '*'); });

async function probeSplit() {
  if (LOCAL && window.parent === window) {
    try { await fetch(SPLIT, { mode: 'no-cors', cache: 'no-store' }); splitUp = true; } catch (e) { splitUp = false; }
  }
  explorerButton();
}
probeSplit();
setInterval(probeSplit, 60000);

$('explorer-btn').addEventListener('click', () => {
  if (inSplit) { window.parent.postMessage({ type: 'lcp:hideExplorer', hash: location.hash }, '*'); return; }
  if (!LOCAL) { window.open(EXPLORER + (followed ? '/jobs/' + followed.id : '/agents/' + seatId), '_blank', 'noopener'); return; }
  const q = new URLSearchParams({ seat: String(seatId) });
  if (followed) q.set('job', followed.id);
  location.href = SPLIT + '?' + q;
});

// ---------- the job on his whiteboard (2026-10-25; owner: "go with 2", the blueprint on the office wall) ----------
// The job his seat works on (or the followed one; after the work, the last one) as a small diagram on the whiteboard in
// the top-floor office, his steps ringed in red marker. When a step changes he walks over and taps it (at most every
// 45 s; the brain's 'board' scene), and that step blinks. A click on the board (or Enter on the house) shows it large.
// Local: the relay's /proxy/jobs/<id>/steps, every step with its dependencies; hosted: the steps /swarm's events showed
// (SwarmJobs; no dependency lines, so they stand in one column). An oracle question is one step: its panel's answers
// come from /oracle/requests (open CORS), each answering seat a box in front of it.
const BOARD_MS = 15000, TAP_GAP_MS = 45000;
const board = { id: null, model: null, sig: null, tapAt: 0, told: null };

function resetBoard() { board.id = null; board.model = null; board.sig = null; }

const BOARD_DONE = ['accepted', 'completed'], BOARD_FAIL = ['failed', 'rejected', 'blocked', 'cancelled'];
function boardState(x) {
  if (x.live || ['working', 'running', 'leased'].includes(x.state)) return 'working';
  if (x.state === 'verifying') return 'verifying';
  if (BOARD_DONE.includes(x.state)) return 'accepted';
  if (BOARD_FAIL.includes(x.state)) return 'failed';
  return 'waiting';
}

// rec: a /proxy/jobs/<id>/steps or SwarmJobs record; panel: an oracle question's answering seats, or null
function boardModel(rec, seat, panel) {
  if (!rec || !rec.steps || !rec.steps.length) return null;
  let steps = rec.steps.map((x) => ({ key: x.key, seat: x.seat ?? null, deps: (x.dependsOn || []).slice(), state: boardState(x),
    mine: x.seat != null && String(x.seat) === String(seat) }));
  if (panel && panel.members.length && steps.length === 1) {
    const answers = panel.members.map((m) => ({ key: 'answer #' + m, seat: m, deps: [], state: 'accepted', mine: String(m) === String(seat) }));
    steps = [...answers, { ...steps[0], deps: answers.map((a) => a.key), mine: steps[0].mine && !answers.some((a) => a.mine) }];
  }
  const keys = new Set(steps.map((x) => x.key));
  for (const x of steps) x.deps = x.deps.filter((d) => keys.has(d));
  const lines = steps.some((x) => x.deps.length);
  const depth = new Map(), by = new Map(steps.map((x) => [x.key, x]));
  const d = (k) => { if (depth.has(k)) return depth.get(k); depth.set(k, 0); const x = by.get(k);
    const v = x.deps.length ? 1 + Math.max(...x.deps.map(d)) : 0; depth.set(k, v); return v; };
  const cols = [];
  if (lines) for (const x of steps) (cols[d(x.key)] ||= []).push(x);
  else for (let i = 0; i < steps.length; i += 8) cols.push(steps.slice(i, i + 8));   // no lines: columns of eight, in the order seen
  const o = (rec.objective || '').replace(/\s+/g, ' ').trim();
  return { id: rec.id, title: o.split(/[,.:]/)[0].slice(0, 60) || 'job ' + String(rec.id).slice(0, 8), objective: o,
    state: rec.state, steps, cols: cols.filter(Boolean), lines, panel, flash: null, flashUntil: 0 };
}

const panels = new Map();                              // job id -> {at, members, panelSize, quorum, status}
async function oraclePanel(jobId) {
  const hit = panels.get(jobId);
  if (hit && Date.now() - hit.at < BOARD_MS - 1000) return hit;
  try {
    const r = await fetch('https://api.imd.fun/oracle/requests?jobId=' + encodeURIComponent(jobId) + '&limit=1', { cache: 'no-store' });
    const q = r.ok && ((await r.json()).requests || [])[0];
    if (!q) return null;
    const dr = await fetch('https://api.imd.fun/oracle/requests/' + encodeURIComponent(q.id), { cache: 'no-store' });
    const det = dr.ok ? await dr.json() : null, req = det && (det.request || det);
    if (!req) return null;
    const p = { at: Date.now(), members: (req.members || []).map((m) => Number(m.tokenId)).filter(Number.isFinite),
      panelSize: req.panelSize, quorum: req.quorum, status: req.status };
    panels.set(jobId, p);
    return p;
  } catch (e) { return null; }
}

async function readBoard() {
  const id = followed ? followed.id : (live.work && live.work.jobId) || board.id;
  if (mode !== 'live' || !house || !id) return;
  let rec = null;
  try {
    if (followed && follower.rec && follower.rec.id === id && follower.rec.steps) rec = follower.rec;
    else if (RELAY) { const r = await fetch('/proxy/jobs/' + id + '/steps', { cache: 'no-store' }); if (r.ok) rec = await r.json(); }
    else { await swarmJobs.refresh(45000); rec = swarmJobs.record(id); }
  } catch (e) { return; }                              // the board keeps what it shows
  if (!rec || !rec.steps || !rec.steps.length) return;
  const panel = rec.steps.length === 1 && rec.steps[0].key === 'oracle_assess' ? await oraclePanel(id) : null;
  const now = followed ? followed.id : (live.work && live.work.jobId) || board.id;
  if (now !== id) return;                              // he moved on while it was read
  const model = boardModel({ ...rec, id }, seatId, panel);
  if (!model) return;
  const sig = model.steps.map((x) => x.key + ':' + x.state + ':' + x.seat).join('|');
  if (board.id === id && board.sig && sig !== board.sig && board.model) {
    const was = new Map(board.model.steps.map((x) => [x.key, x.state]));
    const changed = model.steps.find((x) => was.get(x.key) !== x.state);
    if (changed && Date.now() - board.tapAt > TAP_GAP_MS) {
      model.flash = changed.key; model.flashUntil = Date.now() + 6000; board.tapAt = Date.now();
      house.event({ type: 'board' });
    }
  }
  if (board.told !== id) {
    board.told = id;
    addDiary(`His whiteboard shows ${model.panel ? 'the oracle question' : 'the job'} ${model.title ? '"' + model.title + '"' : ''} (${model.steps.length} ${model.steps.length === 1 ? 'step' : 'steps'}${model.steps.some((x) => x.mine) ? ', his own ringed in red' : ''}). Click the board to look closer.`);
  }
  board.id = id; board.sig = sig; board.model = model;
  if (!$('board-pop').hidden) renderBoardPop();
}
setInterval(readBoard, BOARD_MS);

// the board large, in the popup over the house: the same diagram, with names and seats
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function boardSvg(b) {
  const ink = '#0b0b0b', paper = '#fbfbf9', marker = '#d42a24', amber = '#e0a92a', grey = '#9a9a96', red = '#ff6b62';
  const rows = Math.max(...b.cols.map((c) => c.length)), cw = 240, rh = 42, bw = 200, bh = 26;
  const W = Math.max(420, b.cols.length * cw + 40), H = rows * rh + 70;
  const at = new Map();
  b.cols.forEach((c, ci) => c.forEach((x, ri) => at.set(x.key, { x: 20 + ci * cw + (cw - bw) / 2, y: 46 + (rows - c.length) * rh / 2 + ri * rh })));
  let g = `<rect width="${W}" height="${H}" fill="${paper}"/><text x="20" y="28" font-size="13" font-weight="600" fill="${ink}">${esc(b.title.toUpperCase())}</text>`;
  for (const x of b.steps) for (const dk of x.deps) {
    const p = at.get(dk), q = at.get(x.key);
    if (!p || !q) continue;
    const xm = (p.x + bw + q.x) / 2;
    g += `<path d="M${p.x + bw} ${p.y + bh / 2} H${xm} V${q.y + bh / 2} H${q.x}" fill="none" stroke="${ink}" stroke-width="1.2"/>`;
  }
  const flash = b.flash && Date.now() < b.flashUntil ? b.flash : null;
  for (const x of b.steps) {
    const p = at.get(x.key);
    if (!p) continue;
    const fill = x.state === 'accepted' ? ink : x.state === 'working' ? amber : x.state === 'verifying' ? grey : x.state === 'failed' ? red : paper;
    const tc = x.state === 'accepted' ? paper : ink;
    const name = x.key.replace(/^audit_/, 'audit ').replace(/_/g, ' ');
    const other = switchable(x);                         // another seat works on it now: a click moves the house there
    g += `<g${other ? ` class="board-step" data-step="${esc(x.key)}" role="button" tabindex="0" aria-label="Switch to seat #${x.seat}, ${esc(name)}"` : ''}><title>${esc(x.key)}${x.seat != null ? ' #' + x.seat : ''}: ${x.state}${other ? ' (click: go to this seat)' : ''}</title>
      <rect x="${p.x}" y="${p.y}" width="${bw}" height="${bh}" rx="3" fill="${fill}" stroke="${x.state === 'waiting' ? grey : ink}" stroke-width="${flash === x.key ? 3 : 1.5}" ${x.state === 'waiting' ? 'stroke-dasharray="3 3"' : ''}/>
      <text x="${p.x + 8}" y="${p.y + 17}" font-size="11" fill="${tc}">${esc(name.length > 23 ? name.slice(0, 22) + '…' : name)}</text>
      <text x="${p.x + bw - 8}" y="${p.y + 17}" font-size="11" fill="${tc}" text-anchor="end">${x.seat != null ? '#' + x.seat : ''}</text></g>`;
    if (x.mine) g += `<ellipse cx="${p.x + bw / 2}" cy="${p.y + bh / 2}" rx="${bw / 2 + 12}" ry="${bh / 2 + 9}" fill="none" stroke="${marker}" stroke-width="2.5" transform="rotate(-3 ${p.x + bw / 2} ${p.y + bh / 2})"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.title)}: ${b.steps.length} steps">${g}</svg>`;
}

// a step another seat works on right now (parallel work): the large board lets the visitor switch the house to it
const switchable = (x) => x.state === 'working' && x.seat != null && String(x.seat) !== String(seatId) && !x.key.startsWith('answer #');

// switching: follow the board's job at that step (#/job/<id>/step/<key>); the follower shows the seat on it while it
// runs, and the house moves there (as when the side-by-side page picks a step)
function switchTo(key) {
  const b = board.model;
  if (!b) return;
  $('board-pop').hidden = true;
  location.hash = '#/job/' + b.id + '/step/' + encodeURIComponent(key);
}

function renderBoardPop() {
  const b = board.model;
  if (!b) { $('board-pop').hidden = true; return; }
  $('board-svg').innerHTML = boardSvg(b);
  // the seats working on the job now, one button each (the house's own marked): parallel steps, switch between them
  const working = b.steps.filter((x) => x.state === 'working' && x.seat != null && !x.key.startsWith('answer #'));
  const row = $('board-seats');
  row.innerHTML = '';
  row.hidden = !FEATURES.boardSeats || !working.some(switchable);
  if (!row.hidden) {
    const lab = document.createElement('span'); lab.textContent = 'Working now:'; row.append(lab);
    for (const x of working) {
      const bt = document.createElement('button');
      bt.type = 'button'; bt.className = 'quiet-ink'; bt.dataset.step = x.key;
      bt.textContent = `#${x.seat} · ${x.key.replace(/^audit_/, 'audit ').replace(/_/g, ' ')}`;
      if (!switchable(x)) { bt.disabled = true; bt.setAttribute('aria-current', 'true'); bt.title = 'The house shows this seat'; }
      else bt.title = `Go to seat #${x.seat}: the house follows this job at its step ${x.key}`;
      row.append(bt);
    }
  }
  const mine = b.steps.filter((x) => x.mine).map((x) => x.key).join(', ');
  $('board-note').textContent = [
    b.objective.length > 160 ? b.objective.slice(0, 159) + '…' : b.objective,
    `Ink: accepted. Amber: a seat works on it. Grey: handed in, being checked. Red: failed. Dashed: waiting.${mine ? ` Ringed: seat #${seatId}'s ${mine}.` : ''}`,
    b.steps.some(switchable) ? 'Click an amber step of another seat to go to that seat.' : '',
    b.panel ? `An oracle question: ${b.panel.members.length} of ${b.panel.panelSize} panel seats answered, quorum ${b.panel.quorum}, ${b.panel.status}.` : '',
    b.lines ? '' : 'The swarm-hosted page sees the steps the live feed shows, not how they depend on each other: they stand in the order seen.',
  ].filter(Boolean).join('\n');
  $('board-pop').hidden = false;
}
function openBoard() { if (board.model) { renderBoardPop(); $('board-close').focus(); } }
$('board-close').addEventListener('click', () => { $('board-pop').hidden = true; canvas.focus(); });
$('board-seats').addEventListener('click', (e) => { const bt = e.target.closest('button[data-step]'); if (bt && !bt.disabled) switchTo(bt.dataset.step); });
$('board-svg').addEventListener('click', (e) => { const st = e.target.closest('.board-step'); if (st) switchTo(st.dataset.step); });
$('board-svg').addEventListener('keydown', (e) => {
  const st = e.target.closest('.board-step');
  if (st && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); switchTo(st.dataset.step); }
});
$('board-pop').addEventListener('click', (e) => { if (e.target === $('board-pop')) $('board-pop').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('board-pop').hidden) $('board-pop').hidden = true; });
// a click on the whiteboard (world units: the canvas draws the 480 x 320 world at any size)
function onBoard(e) {
  const r = canvas.getBoundingClientRect(), wb = THINGS.board;
  const x = (e.clientX - r.left) * 480 / r.width, y = (e.clientY - r.top) * 320 / r.height;
  return x >= wb.x - 3 && x <= wb.x + wb.w + 3 && y >= wb.y - 3 && y <= wb.y + wb.h + 3;
}
canvas.addEventListener('click', (e) => { if (board.model && onBoard(e)) openBoard(); });
canvas.addEventListener('mousemove', (e) => { canvas.style.cursor = board.model && onBoard(e) ? 'pointer' : ''; });
canvas.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && board.model) { e.preventDefault(); openBoard(); } });

// ---------- talking to him (talk.js) ----------
// Page commands do what the buttons do, whatever he's busy with. The rest is up to him: while the seat works he
// refuses (an explorer page he points you to opens anyway), every request stresses him a little (more while he works,
// less with please, more with insults; it wears off in 15 s steps), and past STRESS.walkout he takes the dog out.
// Questions he looks up at the machine; a page the explorer shows opens beside him (or the side-by-side page opens).
const talkState = { stress: 0, at: 0, history: [], back: 0, market: null, asked: null };
// the house's own sites; the burn tracker's contract (anyone can send its update) is not deployed yet: null until then
// the burn tracker's site is a newer one (2026-10-24): named burned-6427.identitymd.eth, on eth.limo, not on sites.imd.fun
const SITE = { sworn: 'https://swornbyswarm.sites.imd.fun/', burned: 'https://burned-6427.identitymd.eth.limo/' };
const BURN_TRACKER_CA = null;

// link: {href, label}, a page he found, opened in a new tab (beside him too, in the split view)
function talkReply(text, who = true, link = null) {
  const p = $('talk-reply');
  p.textContent = '';
  if (text == null) return;
  if (who) { const w = document.createElement('span'); w.className = 'who'; w.textContent = 'pepe: '; p.append(w); }
  p.append(text);
  if (link) {
    const a = document.createElement('a');
    a.href = link.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = link.label;
    p.append(' ', a);
  }
}

function talkSay(cmd, text, link = null) {
  talkReply(text, true, link);
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
// a token page beside him: the split view shows it in the right pane; alone, the house moves into the split view with
// it (as for explorer pages); without the split view (a hosted copy) this page's own pane shows it. Returns where it
// is, for his answer ('on the right', 'below'), or false (his answer still carries the link).
function openMarket(url) {
  if (!url) return false;
  if (inSplit) { window.parent.postMessage({ type: 'lcp:market', url }, '*'); return 'on the right'; }
  if (LOCAL && splitUp && window.parent === window && mode === 'live' && seatId != null) {
    const q = new URLSearchParams({ seat: String(seatId), mk: url });
    if (followed) q.set('job', followed.id);
    setTimeout(() => { location.href = SPLIT + '?' + q; }, 2500);      // a moment longer: his answer has numbers
    return 'on the right';
  }
  return showPane(url);
}

// this page's own pane: only the shapes the side-by-side page accepts too (defined.fi with the ref code, LlamaSwap)
const WIDE_PANE = matchMedia('(min-width: 1500px)');
function showPane(url) {
  const name = DEFINED_URL.test(url) ? 'defined.fi' : LLAMA_URL.test(url) ? 'LlamaSwap' : null;
  if (!name || !FEATURES.marketPane) return false;
  paneFrame().src = url; $('pane-name').textContent = name; $('pane-open').href = url; $('pane-open').title = 'Open this page on ' + name;
  $('pane').hidden = false; document.body.classList.add('with-pane');
  fit();                                                     // the house takes the width that is left
  return WIDE_PANE.matches ? 'on the right' : 'below';
}
// the frame exists only once the pane shows a page: with the feature off the page has no iframe at all
function paneFrame() {
  let f = $('pane-frame');
  if (f) return f;
  f = document.createElement('iframe');
  f.id = 'pane-frame'; f.title = 'A page he opened'; f.referrerPolicy = 'strict-origin-when-cross-origin';
  f.allow = 'clipboard-write';
  f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals');
  $('pane').append(f);
  return f;
}
$('pane-close').addEventListener('click', () => {
  $('pane').hidden = true; if ($('pane-frame')) $('pane-frame').src = 'about:blank'; document.body.classList.remove('with-pane');
  fit();
});

// one of the house's sites beside him (the split view passes it through, wallets off), or the split view with it
function openSite(key) {
  if (inSplit) { window.parent.postMessage({ type: 'lcp:site', site: key }, '*'); return true; }
  if (splitUp && window.parent === window && mode === 'live' && seatId != null) {
    const q = new URLSearchParams({ seat: String(seatId), site: key });
    if (followed) q.set('job', followed.id);
    setTimeout(() => { location.href = SPLIT + '?' + q; }, 4000);      // his answer is long: time to read it first
    return true;
  }
  return false;
}

const explorerLink = (path) => ({ href: EXPLORER + path, label: 'explorer.imd.fun' + path });

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

// the active jobs: locally the relay's list (every job not over among the newest 200), hosted the ones /swarm's events
// show plus the oracle questions still being answered; null when neither answers
async function activeJobList() {
  if (RELAY) {
    try { const r = await fetch('/proxy/jobs/active', { cache: 'no-store' }); if (r.ok) return (await r.json()).jobs || []; } catch (e) { /* no relay */ }
    return null;
  }
  try { await swarmJobs.refresh(45000); } catch (e) { /* the oracle list may still answer */ }
  try { await swarmJobs.refreshOracles(); } catch (e) { /* the swarm's jobs alone */ }
  return swarmJobs.at || swarmJobs.oracleAt ? swarmJobs.active() : null;
}

// ---------- following a job picked from the active ones (2026-10-25) ----------
// The list under the seat row, read every 30 s; rebuilt only when it changed and the visitor is not choosing from it.
// The followed job stays in it. Inside the side-by-side page its own list is used instead.
let jobList = [], jobListKey = null;                 // null: nothing shown yet (an empty list has the key '')

function jobLabel(j) {
  const o = (j.objective || '').replace(/\s+/g, ' ').trim();
  return `${j.state} · ${o.length > 58 ? o.slice(0, 57) + '…' : o || j.template || 'job'} · ${j.id.slice(0, 8)}`;
}

function renderJobs(list) {
  const sel = $('job-select'), btn = $('follow-job-btn');
  const shown = (list || []).slice();
  if (followed && !shown.some((j) => j.id === followed.id)) {
    shown.unshift({ id: followed.id, state: 'followed', objective: (followed.job && followed.job.objective) || 'the job the house follows' });
  }
  const key = list === null ? 'none' : shown.map((j) => j.id + j.state + (j.objective || '').length).join();
  if (key === jobListKey || document.activeElement === sel) return;
  jobListKey = key;
  const keep = sel.value || (followed && followed.id);
  sel.innerHTML = '';
  if (!shown.length) {
    sel.add(new Option(list === null ? 'Can\'t read the jobs right now' : 'No active jobs right now', ''));
    sel.disabled = true; btn.disabled = true; return;
  }
  sel.disabled = false; btn.disabled = false;
  for (const j of shown) { const o = new Option(jobLabel(j), j.id); o.title = j.objective || ''; sel.add(o); }
  if (keep && shown.some((j) => j.id === keep)) sel.value = keep;
}

async function loadJobs() { jobList = await activeJobList(); renderJobs(jobList); }
if (!RELAY) $('job-select').title = 'The jobs the swarm\'s live feed shows. A job whose steps have not changed for a while may be missing.';
$('job-form').addEventListener('submit', (ev) => { ev.preventDefault(); const id = $('job-select').value; if (id) followFromTalk(id); });
$('job-select').addEventListener('blur', () => renderJobs(jobList));
loadJobs();
setInterval(loadJobs, 30000);

// a job by its full id, or by the first characters of an active one
async function resolveJob(id) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return id;
  const hit = ((await activeJobList()) || []).filter((j) => j.id.startsWith(id));
  return hit.length === 1 ? hit[0].id : null;
}

// following a job from the command line: what the buttons do (the side-by-side page shows it too); step: a step key to
// show while it runs (a pasted #/job/<id>/step/<key> link)
function followFromTalk(id, step = null) {
  if (inSplit) window.parent.postMessage({ type: 'lcp:followJob', id }, '*');
  else location.hash = '#/job/' + id + (step ? '/step/' + encodeURIComponent(step) : '');
}

// is a job (or an oracle question's job) still running? {id, state, active, objective}, or null when nothing here can
// tell: locally the relay's record; hosted what /swarm showed; both then the oracle routes (open CORS), which know an
// oracle question by its job id or its own id. A hosted page cannot read other jobs' records (/jobs has no CORS).
const JOB_OVER = ['completed', 'blocked', 'failed', 'cancelled'], ORACLE_RUNS = ['assessing', 'reproducing'];
async function jobActivity(id, oracle = false) {
  if (!oracle && RELAY) {
    try {
      const r = await fetch('/proxy/jobs/' + id + '/steps', { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); if (j && j.state) return { id, state: j.state, active: !JOB_OVER.includes(j.state), objective: j.objective || '' }; }
    } catch (e) { /* not a job the relay can read */ }
  } else if (!oracle) {
    try { await swarmJobs.refresh(30000); } catch (e) { /* what it saw before */ }
    const j = swarmJobs.jobs.get(id);
    if (j) return { id, state: j.ended ? j.ended.state : 'executing', active: !j.ended, objective: j.objective };
  }
  try {
    const api = 'https://api.imd.fun/oracle/requests';
    let q = oracle ? null : ((await (await fetch(api + '?jobId=' + id + '&limit=1', { cache: 'no-store' })).json()).requests || [])[0];
    if (!q) { const r = await fetch(api + '/' + id + '?members=0', { cache: 'no-store' }); if (r.ok) { const d = await r.json(); q = d.request || d; } }
    if (q && q.jobId) return { id: q.jobId, state: q.status, active: ORACLE_RUNS.includes(q.status), objective: q.question || '', oracle: true };
  } catch (e) { /* the oracle routes did not answer */ }
  return null;
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
      if (!list) { say(RELAY ? 'Can\'t list the jobs without the local relay.' : 'Can\'t read the swarm\'s jobs right now.'); return; }
      if (!list.length) { say('No active jobs. The swarm is touching grass.'); return; }
      followFromTalk(pick(list).id); say('Following a random active job. Strap in.');
      return;
    }
    case 'load': {                                       // a job id or link dropped in: he follows it while it runs
      const r = await jobActivity(it.job, it.oracle);
      const name = (o) => { const t = (o || '').replace(/\s+/g, ' ').trim(); return t ? ` ("${t.length > 60 ? t.slice(0, 59) + '…' : t}")` : ''; };
      if (r && !r.active) {
        talkSay(cmd, `${r.oracle ? 'That oracle question' : 'Job ' + r.id.slice(0, 8)} is already ${r.state}${name(r.objective)}. Nothing left to follow. Its page:`,
          explorerLink('/jobs/' + r.id));
        return;
      }
      if (!r && RELAY) { say(`No job or oracle question ${it.job.slice(0, 8)} that I can find. Typo?`); return; }
      followFromTalk(r ? r.id : it.job, it.step);
      say(r ? `${r.oracle ? 'That oracle question is still open' : 'Job ' + r.id.slice(0, 8) + ' is running'}${name(r.objective)}. Following it${it.step ? ' at ' + it.step : ''}.`
        : `I can't check from here whether job ${it.job.slice(0, 8)} still runs (this page reads only the swarm's live feed). Following it: the house moves when one of its steps changes.`);
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
    const url = swapUrl(IMD_CA, 'ethereum', 'buy');
    house.event({ type: 'command', act: 'buy', done: () => {
      const where = openMarket(url);
      talkSay(cmd, pick(EGG.buyAfter) + (where ? ` LlamaSwap is open ${where}, ETH to IMD.` : ' Here\'s LlamaSwap, ETH to IMD:'), { href: url, label: 'LlamaSwap' });
    } });
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
  if (it.kind === 'radio') return radioTalk(it, cmd, s);          // the radio works whatever he does (page-like)
  if (house.walkout) return talkSay(cmd, pick(OUT));
  if (s.away) return talkSay(cmd, AWAY);
  if (it.kind === 'egg' && it.act === 'sell') { talkReply(null); addDiary(`You: "${cmd}".`); return; }   // he doesn't even look up
  if (s.asleep) return talkSay(cmd, pick(ASLEEP));
  if (it.kind === 'confirm') return confirmTalk(it, cmd);
  // IMD, Sworn and the burns: he drops everything
  const busy = s.working && !(it.kind === 'egg' && it.act === 'buy') && it.kind !== 'sworn' && it.kind !== 'burn';
  const lvl = stressAdd(stressCost(it, busy));
  if (lvl >= STRESS.walkout) {
    talkState.stress = 0;
    house.event({ type: 'walkout', seconds: STRESS.outSeconds });
    return talkSay(cmd, pick(WALKOUT));
  }
  if (it.kind === 'market') return marketTalk(it, cmd, busy, lvl);
  if (it.kind === 'sworn') {
    house.event({ type: 'flash', icon: 'heart' });
    const beside = openSite('sworn');
    return talkSay(cmd, `${pick(SWORN.lead[it.alpha ? 'alpha' : 'nft'])} ${SWORN.eli5} ${SWORN.mint(beside)}`, { href: SITE.sworn, label: 'swornbyswarm.sites.imd.fun' });
  }
  if (it.kind === 'burn') {
    house.event(s.working ? { type: 'flash', icon: 'dots' } : { type: 'command', act: 'fire' });   // he lights the fire
    const beside = openSite('burned');
    talkState.asked = { what: 'burnUpdate', at: Date.now() };
    return talkSay(cmd, `${pick(BURN.lead)} ${BURN.note(beside)}`, { href: SITE.burned, label: 'burned-6427.identitymd.eth.limo' });
  }
  if (busy) {
    const tier = lvl >= STRESS.warn ? 2 : lvl >= STRESS.grumpy ? 1 : 0;
    house.event({ type: 'flash', icon: tier ? 'bang' : 'dots' });
    let text = pick(BUSY[tier]);
    let link = null;
    if (it.kind === 'news') return talkSay(cmd, text + ' ' + NEWS.busy, { href: DAILY.site, label: 'The IMD Daily' });
    if (it.kind === 'ask') {
      const a = answer(it, talkContext());
      if (a.explorer && openExplorer(a.explorer)) text += ' Look it up yourself, it\'s on the explorer.';
      else if (a.explorer) { text += ' Look it up yourself:'; link = explorerLink(a.explorer); }
    }
    return talkSay(cmd, text, link);
  }
  const grumble = lvl >= STRESS.warn ? ' (Last one. I mean it.)' : lvl >= STRESS.grumpy ? ' (Sigh.)' : '';
  if (it.kind === 'ask') {
    const asked = house;
    if (it.topic === 'job' && it.job && it.job.length < 36) it.job = (await resolveJob(it.job)) || it.job;
    if (house !== asked) return;                       // another seat by now: this pepe wasn't asked
    talkReply(LOOKUP, false);
    house.event({ type: 'command', act: 'lookup', done: () => {
      const a = answer(it, talkContext()), opened = !!a.explorer && openExplorer(a.explorer);
      talkSay(cmd, a.text + grumble, a.explorer && !opened ? explorerLink(a.explorer) : null);
    } });
    return;
  }
  if (it.kind === 'news') return newsTalk(cmd, grumble);
  if (it.kind === 'do') { house.event({ type: 'command', act: it.act }); return talkSay(cmd, DO[it.act] + grumble); }
  if (it.kind === 'egg') return egg(it, cmd, grumble);
  house.event({ type: 'flash', icon: 'ask' });
  return talkSay(cmd, pick(UNKNOWN));
}

// the radio (radio.js): stations, volume, what plays; the genre is the market's. He reacts when he can (brain.js radioEvent):
// working, the dog manages; asleep, the radio switches on its own. Grumpy, he turns it down a notch while he's at it.
function radioTalk(it, cmd, s) {
  if (!FEATURES.radio) return talkSay(cmd, 'No radio in this house.');
  const lvl = stressAdd(stressCost({ kind: 'do', polite: it.polite, rude: it.rude }, s.working));
  const grumble = lvl >= STRESS.warn ? ' (Last one. I mean it.)' : lvl >= STRESS.grumpy ? ' (Sigh.)' : '';
  const say = (text, link = null) => talkSay(cmd, text + grumble, link);
  const lead = s.asleep ? RADIO.asleep + ' ' : s.working ? RADIO.working + ' ' : '';
  const st = radio.station, chart = (x) => (x.chainId === 1 ? { href: chartUrl(x.token, 'ethereum', x.pool.id), label: 'defined.fi' } : { href: THEIDM + '?net=' + x.key, label: 'theidm.fun' });
  const scene = (act) => house.event({ type: 'radio', act, done: () => radio.sync() });   // the frame moves when he gets there
  switch (it.act) {
    case 'on':
      if (radio.on && radio.live) return say(RADIO.same(radio.label()));
      radio.setOn(true, true); scene('tune'); return say(lead + RADIO.on(radio.label()));
    case 'off': case 'offWorking':
      if (!radio.on) return say(RADIO.nowOff);
      radio.setOn(false, true); scene('off'); return say(it.act === 'offWorking' ? RADIO.offWorking : pick(RADIO.off));
    case 'tune': case 'next': {
      let to = it.act === 'next' ? STATIONS[(STATIONS.findIndex((x) => x.key === radio.key) + 1) % STATIONS.length] : stationByName(it.name);
      if (!to) { const p = PENDING.find((x) => x.key === String(it.name).toLowerCase()); return say(p ? RADIO.pending(p) : RADIO.unknown(it.name)); }
      if (to.key === radio.key && radio.live) return say(RADIO.same(to.label));
      radio.tune(to.key, null, true); if (!radio.on) radio.setOn(true, true);
      if (lvl >= STRESS.grumpy) radio.saved.gain = Math.max(GAIN.min, radio.saved.gain - GAIN.step);
      scene('tune'); return say(lead + RADIO.tuned(to.label));
    }
    case 'now':
      if (!radio.live) return say(radio.on ? RADIO.armed(radio.label()) : RADIO.nowOff);
      return say(RADIO.now(st, radioStage, radioRate), { href: THEIDM + '?net=' + st.key, label: 'theidm.fun' });
    case 'volume': {
      if (!radio.on) return say(RADIO.nowOff);
      const before = radio.saved.gain, pct = radio.volume(it.delta * GAIN.step);
      if (radio.saved.gain === before) return say(it.delta > 0 ? RADIO.max : RADIO.min);
      return say(it.delta > 0 ? RADIO.louder(pct) : RADIO.quieter(pct));
    }
    case 'list': return say(RADIO.stations(STATIONS, radio.live ? radio.key : null));
    case 'genre': house.event({ type: 'flash', icon: 'dots' }); return say(RADIO.genre(it.genre), chart(st));
    case 'request': house.event({ type: 'flash', icon: 'dots' }); return say(RADIO.request, st.chainId === 1 ? { href: swapUrl(st.token, 'ethereum', 'buy'), label: 'LlamaSwap' } : chart(st));
    default: return say(pick(UNKNOWN));
  }
}
if (FEATURES.radio) {
  const walk = (act) => (house ? house.event({ type: 'radio', act, done: () => radio.sync() }) : radio.sync());
  $('radio-btn').addEventListener('click', () => {
    radio.setOn(!radio.on, true); walk(radio.on ? 'tune' : 'off');
    if (house) addDiary(radio.on ? `Radio on: ${radio.label()}.` : 'Radio off.');
  });
  // the record cabinet on the canvas (world units: 264..292 x 183..208): a sleeve puts that station on, the player toggles
  const cabinetHit = (e) => {
    const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * 480 / r.width, y = (e.clientY - r.top) * 320 / r.height;
    if (x < 263 || x > 293 || y < 182 || y > 209) return null;
    const i = Math.floor((x - 280.4) / 2.6);
    return x >= 280 && y >= 192 && i >= 0 && i < STATIONS.length ? { station: STATIONS[i] } : { toggle: true };
  };
  canvas.addEventListener('click', (e) => {
    const hit = cabinetHit(e);
    if (!hit || !house) return;
    if (hit.station) {
      if (hit.station.key === radio.key && radio.live) { radio.setOn(false, true); walk('off'); addDiary('Radio off.'); return; }
      radio.tune(hit.station.key, null, true); if (!radio.on) radio.setOn(true, true);
      walk('tune'); addDiary(`You picked a record: ${radio.label()}.`);
    } else { radio.setOn(!radio.on, true); walk(radio.on ? 'tune' : 'off'); addDiary(radio.on ? `Radio on: ${radio.label()}.` : 'Radio off.'); }
  });
  canvas.addEventListener('mousemove', (e) => { if (cabinetHit(e)) canvas.style.cursor = 'pointer'; });
}

// the plaque on the tree (2026-10-26): the acceptance rate from the seat record, his expertise from his newest tasks (the
// relay's seat detail; hosted, the steps the swarm's live feed showed for this seat), against the swarm's mix (mapping.js)
let plaqueSaid = null, plaqueRetry = 0, plaqueTimer = null;
function plaqueFor(s) {
  if (!house || !s.data || s.seat !== seatId) { if (house && (!s.data || s.seat !== seatId)) house.state.plaque = null; return; }
  const d = s.data, rate = d.attempts ? Math.round(100 * d.accepted / d.attempts) : null;
  let recent = (live.detail && live.detail.recent) || null;
  // the seat detail (his newest tasks) arrives after the first status: look again a few times until it is there
  clearTimeout(plaqueTimer);
  if (!recent && mode === 'live' && RELAY && plaqueRetry < 8) { plaqueRetry++; plaqueTimer = setTimeout(() => plaqueFor(s), 3000); } else if (recent) plaqueRetry = 0;
  if (!recent && live.swarm && live.swarm.events) recent = live.swarm.events.filter((e) => String(e.tokenId) === String(seatId) && (e.step || e.nodeKey || e.role))
    .map((e) => ({ nodeKey: e.step || e.nodeKey || '', role: e.role || '', launch: e.launch || null, objective: e.objective || '' }));
  const counts = {};
  for (const t of (recent || []).slice(0, 20)) { const k = taskCategory(t) || 'other'; counts[k] = (counts[k] || 0) + 1; }
  const ex = expertise(counts);
  house.state.plaque = { rate, word: ex ? ex.word : null, job: ex ? ex.job : null, category: ex ? ex.category : null, demo: mode === 'demo' };
  const key = `${seatId}|${rate}|${ex ? ex.category : ''}`;
  if (mode === 'live' && key !== plaqueSaid) {
    plaqueSaid = key;
    addDiary(`The plaque on the tree: ${rate == null ? 'no tasks yet' : rate + ' % accepted'}${ex ? `, by trade a ${ex.job.toLowerCase()}: ${ex.word} are ${Math.round(ex.share * 100)} % of his newest tasks, ${ex.ratio >= 2 ? Math.round(ex.ratio) + ' x' : Math.round(ex.ratio * 10) / 10 + ' x'} the swarm's share` : ''}.`);
  }
}

// the Sworn card over the fireplace (2026-10-26): the seat's owner (the /swarm owners list) and the card that wallet holds
// (sworn.js, read-only); none for a wallet without one, and none in the demo. A tap on it: no link, he tells you it's his
// onchain trophy and how proud he is (owner, 2026-10-26: "typical degen ironic humour").
async function swornFor(id, asked) {
  let owner = null;
  try { const sw = live.swarm || await live.fetchSwarm(); owner = sw && sw.owners ? sw.owners[id] : null; } catch (e) { /* no swarm list */ }
  if (house !== asked) return;
  if (!owner) { house.state.sworn = null; return; }
  let card = null;
  try { card = await cardOf(owner); } catch (e) { /* the registry did not answer: no card shown */ }
  if (house !== asked) return;
  house.state.sworn = card;
  if (card) addDiary(`A Sworn card hangs over the fireplace: his owner's, No. ${card.tokenId}, ${card.lit === 0 ? 'no fact lit yet' : card.lit === 1 ? 'one fact lit' : card.lit + ' facts lit'}.`);
}
function onSworn(e) {
  if (!house || !house.state.sworn) return false;
  const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * 480 / r.width, y = (e.clientY - r.top) * 320 / r.height, f = SWORN_FRAME;
  return x >= f.x && x <= f.x + f.w && y >= f.y - 2 && y <= f.y + f.h;
}
if (FEATURES.sworn) {
  canvas.addEventListener('click', (e) => {
    if (!onSworn(e)) return;
    const line = trophyLine(house.state.sworn);
    house.event({ type: 'flash', icon: 'heart' });
    talkReply(line);
    addDiary(`You tapped the card over the fireplace. He: ${line}`);
  });
  canvas.addEventListener('mousemove', (e) => { if (onSworn(e)) canvas.style.cursor = 'pointer'; });
}

// IMD or swarm news (2026-10-26): the issue loads while he fetches the paper; when he starts reading he gives the headline.
// A click on him while he reads (state.action 'news') opens the issue page by page (news.js).
function newsTalk(cmd, grumble) {
  if (!FEATURES.news) return talkSay(cmd, 'No paper in this house.');
  const asked = house;
  const pending = latestIssue().then((i) => i, (e) => ({ error: (e && e.message) || String(e) }));
  pending.then((i) => { if (house === asked && i && !i.error) { newsIssue = i; house.state.news = paperLines(i); } });   // the sheet's print, as soon as it is known
  talkReply(NEWS.fetching, false);
  let said = false;
  const finish = async () => {                           // once: when he starts reading, or after 20 s if something cut his walk short
    if (said) return; said = true;
    const i = await pending;
    if (house !== asked) return;
    if (!i || i.error) { newsIssue = null; return talkSay(cmd, NEWS.none + (i && i.error ? ` (${i.error})` : ''), { href: DAILY.site, label: 'The IMD Daily' }); }
    newsIssue = i;
    talkSay(cmd, issueLine(i) + grumble, { href: DAILY.site, label: 'The IMD Daily' });
  };
  setTimeout(finish, 20000);
  house.event({ type: 'command', act: 'news', done: finish });
}
// the day's IMD Daily (owner, 2026-10-26): when a new issue is out (the collection's issueCount grew; read every 5 min and on
// each visit, cached 10 min in daily.js), the mail carrier brings the paper to the mailbox, and he reads it when he is free.
// What this browser has seen: lcp:daily:seen (the newest issue id delivered here), so each issue comes once.
const DAILY_POLL_MS = 5 * 60000;
let dailyPending = null, dailyTimer = null;
async function dailyWatch() {
  if (!FEATURES.news || !house || mode !== 'live') return;
  let issue = null;
  try { issue = await latestIssue(); } catch (e) { return; }
  if (!issue || !house) return;
  const seen = Number(store('lcp:daily:seen') || 0);
  if (issue.id <= seen || dailyPending) return;
  dailyPending = issue;
  house.event({ type: 'daily' });
}
function onPaper() {
  const issue = dailyPending; dailyPending = null;
  if (!issue || !house) return;
  store('lcp:daily:seen', issue.id);
  newsIssue = issue; house.state.news = paperLines(issue);
  addDiary(`The mail carrier brings ${issue.isToday ? 'today\'s' : 'the new'} IMD Daily, No. ${issue.id}: "${issue.title}".`);
  const s = house.state;
  if (s.working || s.asleep || s.away || house.walkout) { addDiary('The paper waits in the mailbox until he has a minute.'); return; }
  house.event({ type: 'command', act: 'news', done: () => { talkReply(issueLine(issue)); addDiary(`He reads it. ${issueLine(issue)}`); } });
}
if (FEATURES.news) { setTimeout(dailyWatch, 8000); dailyTimer = setInterval(dailyWatch, DAILY_POLL_MS); }

// a click on him while he reads: in the armchair the paper's rectangle (THINGS.chair, the sheet past it), else around his sprite
function onReader(e) {
  if (!house || house.state.action !== 'news' || house.man.hidden) return false;
  const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * 480 / r.width, y = (e.clientY - r.top) * 320 / r.height, m = house.man;
  if (m.pose === 'tvsit') { const c = THINGS.chair; return x >= c.x - 14 && x <= c.x + c.w + 14 && y >= c.y - 29 && y <= c.y + c.h; }
  return x >= m.x - 11 && x <= m.x + 11 && y >= m.y - 34 && y <= m.y + 2;
}
if (FEATURES.news) {
  canvas.addEventListener('click', async (e) => {
    if (!onReader(e)) return;
    let i = newsIssue;
    if (!i) { try { i = await latestIssue(); newsIssue = i; house.state.news = paperLines(i); } catch (err) { addDiary(`Can't fetch The IMD Daily right now (${err.message || err}).`); return; } }
    news.open(i);
    addDiary(`You read ${i.title} over his shoulder.`);
  });
  canvas.addEventListener('mousemove', (e) => { if (onReader(e)) canvas.style.cursor = 'pointer'; });
}

// yes or no to the question he asked last (within two minutes): the burn tracker's contract on Etherscan. The new tab
// opens right in the visitor's submit (a browser lets a page open one only then); the answer carries the link too.
function confirmTalk(it, cmd) {
  const q = talkState.asked;
  talkState.asked = null;
  if (!q || Date.now() - q.at > 2 * 60000) return talkSay(cmd, BURN.nothing[it.yes ? 0 : 1]);
  if (!it.yes) return talkSay(cmd, BURN.no);
  if (!BURN_TRACKER_CA) return talkSay(cmd, BURN.noCa);
  const url = `https://etherscan.io/address/${BURN_TRACKER_CA}#writeContract`;
  let tab = null;
  try { tab = window.open(url, '_blank'); if (tab) tab.opener = null; } catch (e) { /* blocked */ }   // null: blocked
  return talkSay(cmd, tab ? BURN.yes : BURN.blocked, { href: url, label: 'Etherscan' });
}

// a token's market: a ticker alone gets a question back (an address pasted next answers it); with an address he reads
// DexScreener at the machine and opens defined.fi (price, chart) or LlamaSwap (buy, sell) beside him. While the seat
// works he says no, and the page opens anyway.
async function marketTalk(it, cmd, busy, lvl) {
  const asked = house, last = talkState.market;
  const act = it.act || (last && Date.now() - last.at < 5 * 60000 ? last.act : 'price');
  const grumble = lvl >= STRESS.warn ? ' (Last one. I mean it.)' : lvl >= STRESS.grumpy ? ' (Sigh.)' : '';
  if (!it.ca) {
    talkState.market = { act, at: Date.now() };
    house.event({ type: 'flash', icon: 'ask' });
    return talkSay(cmd, (it.ticker ? pick(MARKET.needCa(it.ticker)) : MARKET.noWhat[act]) + grumble);
  }
  talkState.market = null;
  // the page for the answer: LlamaSwap for a buy or sell it can route, else defined.fi (a launch's own pool; Ethereum
  // when nothing names the chain); null on a chain neither knows
  const page = (q) => {
    if ((act === 'buy' || act === 'sell') && !q.error && !q.missing && !q.noPool) {
      const s = swapUrl(q.ca, q.chainId, act);
      if (s) return { href: s, label: 'LlamaSwap' };
    }
    const c = chartUrl(q.ca, q.chainId || 'ethereum', q.poolId);
    return c && { href: c, label: 'defined.fi' };
  };
  const pending = launchOf(it.ca).then((l) => quote(it.ca, fetch, l));      // read while he walks to the machine
  const finish = (q, lead) => {
    const pg = page(q), c = CHAINS[q.chainId || 'ethereum'];
    const beside = !!pg && act !== 'price' && openMarket(pg.href);          // a price is an answer; the rest are pages
    if (lead != null) return talkSay(cmd, lead + (pg ? ` Look it up yourself${beside ? `, it's ${beside}` : ':'}${beside ? '.' : ''}` : ''), pg);
    if (!pg && q.pairUrl) return talkSay(cmd, MARKET.offChain(q) + ' DexScreener has it:' + grumble, { href: q.pairUrl, label: 'DexScreener' });
    const eth = q.ca === WETH ? { symbol: 'ETH', coin: 'USDC' } : { coin: c && c.coin };
    talkSay(cmd, marketText(act, { ...q, ...eth }, usd, c ? c.name : q.chainId, beside, pg && pg.label) + grumble, pg);
  };
  if (busy) {
    const tier = lvl >= STRESS.warn ? 2 : lvl >= STRESS.grumpy ? 1 : 0;
    house.event({ type: 'flash', icon: tier ? 'bang' : 'dots' });
    const q = await pending;
    if (house === asked) finish(q, pick(BUSY[tier]));
    return;
  }
  talkReply(LOOKUP, false);
  house.event({ type: 'command', act: 'lookup', done: async () => {
    const q = await pending;
    if (house === asked) finish(q, null);
  } });
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
if (FEATURES.radio) { radio.armAutostart(); radioChanged(radio); }   // a wanted radio starts at the first click or key
requestAnimationFrame(frame);
window.__house = () => house;   // for local testing in the console
window.__live = live;
window.__theme = () => theme;
window.__demo = demo;
window.__follower = follower;
window.__radio = radio;
window.__news = () => ({ issue: newsIssue, reader: news });
window.__stationFeed = stationFeed;
