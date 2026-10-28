// Wiring: render loop, looks (themes), seat choice (#/seat/N, #demo), following a job (#/job/<id>), wallet lookup,
// diary, daily letter, counters.
import { House } from './brain.js';
import { LiveFeed, DemoFeed, JobFollower, SwarmJobs, isAsleep } from './feed.js';
import { wallets, connect, seatsOf } from './wallet.js';
import { Sound } from './sound.js';
import { CATEGORIES, expertise, firstSentence } from './mapping.js';
import { taskCategory } from './feed.js';
import { THEMES, DEFAULT_THEME } from './themes/index.js';
import { THINGS } from './themes/imd-layout.js';
import { setPhase } from './world.js';
import { parse, answer, pick, stressCost, HELP, BUSY, DO, EGG, UNKNOWN, ASLEEP, AWAY, OUT, WALKOUT, LOOKUP, STRESS, MARKET, marketText, poolText,
  SWORN, BURN, OXTXT, SHOW, RADIO, NEWS, WALLET, SCREEN, FAQ, SUGGEST, trophyLine } from './talk.js';
import { DAILY, latestIssue, issueLine, paperLines } from './daily.js';
import { NewsReader } from './news.js';
import { cardOf } from './sworn.js';
import { SWORN_FRAME, GRID_PANEL, SHOW_SPOTS } from './themes/imd.js';
import { ShowcaseFeed, videoEl, dropMedia, siteOverlay, VIDEO_S, AUDIO_S, SITE_S, PLANE_S } from './showcase.js';
import { CHANGELOG } from './changelog.js';
import { StationPop } from './station.js';
import { Radio, STATIONS, PENDING, GAIN, stationByName, stationFor, sadStation, SITE as THEIDM } from './radio.js';
import { StationFeed, SILENCE, POLL_MS, amount, readGrid } from './stationfeed.js';
import { IMD_CA, IMD_POOL, WETH, CHAINS, CHAIN_OF_ID, launchOf, quote, poolQuote, poolNum, chartUrl, usd, DEFINED_URL } from './market.js';
import { RELAY, MIRRORS, proxyUrl } from './env.js';
import { Column } from './column.js';
import { Menu } from './menu.js';
import { FullScreen, place } from './full.js';
import { BUILD } from './build.js';

const $ = (id) => document.getElementById(id);
// built but switched off (the owner, 2026-10-24: "dont delete the cut features, we may add it back later"): the look
// switch (IMD | LCP) and the wallet lookup. Elements marked data-feature="…" show only when theirs is on.
// machineTicker: the green ticker and the effort dial on the machine wall (owner, 2026-10-24: reverted, other ways to
// show provider, model and effort wanted); the data behind it (LiveFeed.checkMachine) still runs.
// marketPane: a token's market beside him, off in the swarm build only (owner, 2026-10-25: a first swarm-hosted version
// without iframe features; "the server version should have all features"): since 2026-10-26 (launch panel) a swarm
// launch's or IMD's own pool in the column's token panel, any other token on defined.fi in a new tab; off, he answers
// with the defined.fi link
// boardSeats: a "Working now" row of buttons under the large whiteboard (2026-10-25; switched off the same day, owner:
// "just make the cards directly clickable … without extra buttons"); the cards switch the seat either way
// radio: theidm.fun's stations as the house's background music (2026-10-25, radio.js), in every build; radioLine: the line
// under the command line naming the station (switched off the same day, owner: "remove this line"; the button in the
// top bar next to Sound stays, its title names the station)
// news: The IMD Daily on IMD or swarm news (2026-10-26, daily.js, news.js), in every build
// sworn: the seat owner's Sworn card over the fireplace (2026-10-26, sworn.js), in every build
// counters: the Tasks / Accepted / Rejected / Failed panel under the house (switched off by the owner, 2026-10-26: "remove this
// panel"; the plaque on the tree carries the acceptance rate and his expertise instead, FEATURES.plaque)
// column: the house's own column beside it (2026-10-26, src/column.js): the swarm's jobs and seats from this origin's
// relay, or a page he shows; off in the swarm build (no relay to read the list through, api.imd.fun sends no CORS)
// seatForm, jobForm, barButtons (switched off by the owner, 2026-10-27: "remove the buttons RANDOM and VISIT, Seat label and
// input and also the job combo box and follow job buttons. actions stay still available by asking pepe. same for demo sound
// off and radio off. only the LCP on the left, the dark/light mode switch at the right, and the LITTLE COMPUTER PEPES in the
// middle"): the Seat row (input, Visit, Random), the job list with Follow job, and Legend / Demo / Sound / Radio in the top
// bar. Their handlers stay; the talk line does each ("visit 1299", "random seat", "follow job <id>", "random job", "legend",
// "help", "demo", "sound on|off", "radio on|off"; pageCommand clicks the hidden Legend and Demo buttons as before)
// modeButton: the light / dark switch at the right end of the top bar (switched off by the owner, 2026-10-27: "make the frog
// button a menu entry with several submenus, put first he dark/light switch in"): the frog's menu has it (src/menu.js), with
// the music, the sound and full screen; its handler stays, and the bar keeps its empty right side, so the name stays centred
const FEATURES = { lookSwitch: false, wallet: false, machineTicker: false, marketPane: BUILD !== 'swarm', boardSeats: false, radio: true, radioLine: false, news: true, sworn: true, counters: false, plaque: true, column: BUILD !== 'swarm',
  seatForm: false, jobForm: false, barButtons: false, modeButton: false,
  showcase: BUILD === 'server',
  // what visitors ask, counted (2026-10-28, owner: "counts only for now"): the kind and act of each line, never its text
  talkCounts: BUILD === 'server',
  // his own record with the visitor's music off (2026-10-26) played the station anyway; off since 2026-10-28 (owner: "music should
  // only be external audio from jobs or videos or anything else, and sound should be everything produced by pepe itself")
  recordsWithoutMusic: false };                        // the swarm's new work and the burns acted out (2026-10-28): the server's /proxy/showcase
// a switched-off feature's elements are hidden; the others keep their own state (the pane stays hidden until it shows a page).
// An element may name several (data-feature="radio barButtons"): it shows only while all of them are on
for (const el of document.querySelectorAll('[data-feature]')) if (el.dataset.feature.split(/\s+/).some((f) => !FEATURES[f])) el.hidden = true;

// the house's own column (src/column.js; below, "the column beside the house"): made before the mode, which it follows.
// Its list is panels/ next to this page (relative, so the house served under /pepe/ frames /pepe/panels/).
const column = FEATURES.column ? new Column({ panelUrl: new URL('panels/', document.baseURI).href, onPick: picked, onResize: () => columnMoved(),
  onNotLaunch: (ca) => addDiary(`The pool reader knows no launch at ${ca}; defined.fi has it (his answer links it).`) }) : null;

// the house in full screen (2026-10-27, src/full.js): the browser's full screen while the column is shut, the whole left
// side while it is open; fit() lays it out, the frog's menu and the talk line switch it
const WIDE = matchMedia('(min-width: 900px)');                 // style.css: the column fixed on the right from 900px
const full = new FullScreen({ columnOpen: () => !!(column && column.open), wide: () => WIDE.matches, onChange: () => { fit(); menuSync(); } });
let menu = null;                                               // the frog's menu (below, once the radio and the sound exist)
let columnWas = false;
function columnMoved() {                                       // the column opened, closed or changed width
  const open = !!(column && column.open);
  if (open !== columnWas) { columnWas = open; full.column(open); }
  fit();
}

// the visitor's wallet (launches-portfolio Task 5, 2026-10-26; owner: "dazu muss man pepe aber erst sein wallet nennen",
// "can be stored in local storage client side"): told to him in the command line ("my wallet is 0x…" or a name.eth, which
// the server resolves), kept only in this browser as localStorage['lcp:wallet'], and only as an address of 40 hex digits
// (lowercase); anything else found there is removed and he asks again. It reaches the column's panel by message only
// (column.sync), never a url, a log or the console; his lines and the diary show it shortened. The swarm build keeps none.
const WALLET_KEY = 'lcp:wallet', WALLET_RE = /^0x[0-9a-f]{40}$/;
const ENS_NAME = (n) => n.length <= 64 && n.endsWith('.eth') && n.split('.').every((l) => /^[a-z0-9-]{1,63}$/.test(l));   // panels.py plain_name
const shortAddr = (a) => a.slice(0, 4) + '…' + a.slice(-4);
// the visitor's words as the diary keeps them: any 0x address in them shortened (2026-10-27: "whats my portfolio ? 0x…" put
// the whole address in the diary)
const echo = (cmd) => cmd.replace(/0x[0-9a-f]{40}/gi, (a) => shortAddr(a.toLowerCase()));
function storedWallet() {
  if (!column) return null;
  try {
    const v = localStorage.getItem(WALLET_KEY);
    if (v == null) return null;
    if (WALLET_RE.test(v)) return v;
    localStorage.removeItem(WALLET_KEY);                  // a bad value: gone, he asks again
  } catch (e) { /* no storage */ }
  return null;
}
let visitorWallet = storedWallet();
if (column && visitorWallet) column.sync({ wallet: visitorWallet });
function keepWallet(w) {
  visitorWallet = w;
  try { if (w) localStorage.setItem(WALLET_KEY, w); else localStorage.removeItem(WALLET_KEY); } catch (e) { /* this visit only */ }
  if (column) column.sync({ wallet: w });
}

// light or dark page around the house (IMD look). The switch in the top bar works like explorer.imd.fun's (it names the
// other mode; the choice is kept in this browser, and this tab's in sessionStorage). Dark when nothing says; a script in
// index.html sets it before the first paint. The column's list follows it (house -> panel since 2026-10-26; until then
// the two-pane page sent the explorer's mode the other way).
function setMode(m, keep = false) {
  if (m !== 'light' && m !== 'dark') return;
  document.documentElement.dataset.mode = m;
  try { sessionStorage.setItem('lcp:mode', m); if (keep) localStorage.setItem('lcp:mode', m); } catch (e) { /* no storage */ }
  $('mode-btn').querySelector('span').textContent = m === 'dark' ? 'Light mode' : 'Dark mode';
  if (column) column.sync({ mode: m });
  menuSync();
}
try { setMode(sessionStorage.getItem('lcp:mode') || localStorage.getItem('lcp:mode') || 'dark'); } catch (e) { setMode('dark'); }
$('mode-btn').addEventListener('click', () => setMode(document.documentElement.dataset.mode === 'light' ? 'dark' : 'light', true));
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
const stationPop = FEATURES.radio ? new StationPop() : null;   // the station's details, a click on the panel over the piano
// The IMD Daily: the popup reader, and the issue he read last (a click on him while he reads opens it)
const news = FEATURES.news ? new NewsReader() : null;
let newsIssue = null;
let radioStage = 0, radioBpm = 100, radioRate = null, radioFeedKey = null, sadTimer = null;
let radioGrid = null;   // the playing station's sequencer state from its hook ($IDM), drawn over the piano while music plays
// a station without a hook has no grid of its own: the panel then shows the hooked station's last read pattern in the
// playing station's colour (owner 2026-10-26: the panel over the piano went missing on the deployed page, where a new
// visitor starts on IMD/ETH; "panel immer zeigen"), read every POLL_MS while such a station plays
const HOOKED = STATIONS.find((s) => s.pool.hook);
let hookGrid = null, hookTimer = null;
const shownGrid = () => radioGrid || (radio.live && !radio.station.pool.hook ? hookGrid : null);
function hookGridSync() {
  const want = FEATURES.radio && HOOKED && radio.live && !radio.station.pool.hook;
  if (!want) { clearInterval(hookTimer); hookTimer = null; return; }
  if (hookTimer) return;
  const read = async () => {
    const g = await readGrid(HOOKED);
    if (!g || !hookTimer) return;
    hookGrid = g; radioSync();
    if (stationPop && stationPop.open_ && !radioGrid) stationPop.update(hookGrid, {});
  };
  hookTimer = setInterval(read, POLL_MS);
  read();
}
function radioSync() {
  if (!house) return;
  house.state.radio = FEATURES.radio ? radio.houseState({ bpm: radioBpm, stage: radioStage, grid: shownGrid() }) : null;
  house.onPaper = onPaper;
  house.onNeedle = onNeedle;
  // his own record (the routine, or "spin a record"): music while he is at the player, even with the visitor's radio off
  house.onRecords = (on) => {
    if (!FEATURES.radio || radio.on || !FEATURES.recordsWithoutMusic) return;
    if (on) { radio.playFor('records'); if (radio.live) addDiary(`He puts a record on: ${radio.label()}.`); }
    else { if (radio.live) addDiary('He lifts the needle.'); radio.stopFor('records'); }
  };
}
// the needle drops (the owner, 2026-10-26: a short party riff every time he puts a record on): the house's own chip riff
// (sound.js RIFF), or a clip of the owner's (their file and licence) named here, e.g. 'assets/celebrate.mp3'; a probe for
// the file was a 404 in the console on every hosted load (v2 live check), so the name is set by hand. Heard with the
// visitor's sound on, never for the music alone (2026-10-28: Sound is what Pepe makes himself, the piano, his beeps, this
// celebration; Music is the audio from outside). Returns the seconds he stands at the player before the music.
const celebrateClip = null;
function onNeedle() {
  if (!FEATURES.radio || !sound.on) return 0;
  house.lastNeedle = { kind: celebrateClip ? 'clip' : 'riff', at: Date.now() };
  return celebrateClip ? sound.clip(celebrateClip, 4) : sound.riff();
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
  if (key !== radioFeedKey) { radioFeedKey = key; radioStage = 0; radioRate = null; radioGrid = null; if (stationPop) stationPop.close(); if (key) stationFeed.start(st); else stationFeed.stop(); radioSync(); }
  hookGridSync();
  menuSync();
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
  if (e.type === 'grid') { radioGrid = e.grid; radioSync(); if (stationPop && stationPop.open_) stationPop.update(radioGrid, feedReading()); return; }
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
// the showcase's media and what shows now (2026-10-28; its functions further down, showReset runs with every new house)
const showing = { video: null, audio: null, site: null };
let tvVideo = null, showAudio = null, siteEl = null, lastArt = null, burnShown = null, showFeed = null, audioAt = 0;
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
  const lay = full.layout, root = document.documentElement, talk = document.querySelector('.talk');
  if (lay) root.dataset.full = lay; else delete root.dataset.full;
  if (column && column.open) column.placeTop();                 // the top bar is back (or gone) before the column is measured
  if (lay === 'house' || lay === 'side') return fitFull(lay, root, talk);
  delete talk.dataset.place;
  for (const v of ['--house-x', '--house-y', '--house-w', '--talk-x', '--talk-y', '--talk-w', '--talk-h', '--strip-h']) root.style.removeProperty(v);
  const avail = Math.min(document.querySelector('.page').clientWidth, window.innerWidth - 32);
  canvas.style.width = '100%';
  canvas.parentElement.style.width = theme.cssWidth(avail);   // the screen box carries the width; the letter covers it
  if (theme.scale) theme.scale(canvas, 0);
}

// full screen (src/full.js): the house in a box, the window's (house) or the room left of the column under the top bar
// (side); the talk line under it, beside it, or over the ground strip in front of the house when there is no room (place()).
// Both are fixed boxes (style.css html[data-full]); the canvas is drawn at the size it is shown, so it stays crisp.
function fitFull(lay, root, talk) {
  let box = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
  if (lay === 'side') {
    const col = $('column').getBoundingClientRect(), left = parseFloat(getComputedStyle(document.body).paddingLeft) || 16;
    box = { x: left, y: col.top, w: Math.max(0, col.left - 24 - left), h: Math.max(0, window.innerHeight - col.top - 16) };
  }
  delete talk.dataset.place;
  const line = $('talk-form').offsetHeight || 40;
  const p = place(box, { below: line + 56, step: theme.id === 'pixel' ? 480 : 0, top: lay === 'side', pad: lay === 'house' ? 8 : 0 });   // under it: the line, two lines of his reply
  const px = (v) => Math.round(v * 10) / 10 + 'px';
  root.style.setProperty('--house-x', px(p.house.x)); root.style.setProperty('--house-y', px(p.house.y)); root.style.setProperty('--house-w', px(p.house.w));
  root.style.setProperty('--talk-x', px(p.talk.x)); root.style.setProperty('--talk-y', px(p.talk.y));
  root.style.setProperty('--talk-w', px(p.talk.w)); root.style.setProperty('--talk-h', px(p.talk.h));
  root.style.setProperty('--strip-h', px(p.where === 'over' ? p.talk.h + 8 : 0));   // the house's popups stay above the line
  talk.dataset.place = p.where;
  canvas.style.width = '100%';
  canvas.parentElement.style.width = px(p.house.w);
  if (theme.scale) theme.scale(canvas, p.house.w * (window.devicePixelRatio || 1));
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
  house = new House(id, sound, theme); seatSeed = id; theme.setSeed(id); radioSync(); house.state.seatNo = id; showReset();
  house.onLetterDone = showLetter;
  house.onKnock = showKnock;
  feed = live; lastUpdate = null; hideKnock();
  if (!job) clearDiary();
  hideLetter(); machineSaid = ''; talkState.stress = 0; talkReply(null);   // his last answer was the other seat's
  setTitle('Who lives in Swarmstreet ', id);
  if (job && followed) setLede(followLede(), true); else setLede(DEFAULT_LEDE);
  $('seat-input').value = id;
  $('demo-btn').setAttribute('aria-pressed', 'false');
  if (!job && location.hash !== '#/seat/' + id) history.replaceState(null, '', '#/seat/' + id);
  live.setSeat(id, hint);
  columnSync();
  plaqueRetry = 0; clearTimeout(plaqueTimer);
  dailyPending = null; setTimeout(dailyWatch, 6000);          // a new seat: the day's paper, if this browser hasn't had it
  if (FEATURES.sworn) swornFor(id, house);
  if (!job) resetBoard();                              // another seat: its own job on the board (a followed job stays)
  setTimeout(readBoard, 1500);
}

// ---------- following a job: the house of the seat working on it, then of the seat on its next step ----------
// step: #/job/<id>/step/<key>, a step the visitor chose (a pasted step link); the address goes back to #/job/<id>, so
// choosing it again is a new address change
function followJob(id, step = null) {
  if (location.hash !== '#/job/' + id) history.replaceState(null, '', '#/job/' + id);
  if (followed && followed.id === id) { if (step) follower.prefer(step); return; }
  followed = { id, job: null };
  clearDiary();
  addDiary(`Looking up job ${id.slice(0, 8)}…`);
  if (pickedJob === id) addDiary('You picked it from the list beside the house; he follows it.');
  pickedJob = null;
  columnSync();
  setLede(followLede(), true);
  follower.start(id, step);
  renderJobs(jobList);
}

function stopFollowing() { follower.stop(); followed = null; renderJobs(jobList); columnSync(); if (FEATURES.radio && radio.restore('follow')) addDiary(`Back to ${radio.station.label} on the radio.`); }
// the station follows the work (2026-10-25): a followed job about a token that has a station puts that record on
function followRadio(job) {
  if (!FEATURES.radio || !radio.live || !job) return;
  const st = stationFor(job.objective);
  if (st && st.key !== radio.key && radio.tune(st.key, 'follow', true)) { addDiary(`The job is about ${st.ticker}: he puts on ${st.label}.`); if (house) house.event({ type: 'radio', act: 'tune', done: () => radio.sync() }); else radio.sync(); }
}

// the job's name in the lede: the objective's first sentence, whole (mapping.js firstSentence)
function jobName(job) {
  const o = firstSentence(job && job.objective);
  return o ? `"${o}"` : 'job ' + followed.id.slice(0, 8);
}

// the job, then a blank line, then what the house does (the owner, 2026-10-26: two lines over the whole width; 2026-10-27:
// "remove this after job id" (its first sentence), "make jobid to a link that opens the job with expanded description in
// the right panel", "add a blank line below that line and the next"). Without the column the id opens the explorer's job page
function followLede() {
  const id = followed.id;
  const a = document.createElement('a');
  a.className = 'lede-job'; a.textContent = id.slice(0, 8);
  if (column) {
    a.href = '#/job/' + id; a.title = 'this job in the list on the right, its description whole';
    a.addEventListener('click', (e) => { e.preventDefault(); column.showJob(id); });
  } else {
    a.href = 'https://explorer.imd.fun/jobs/' + id; a.target = '_blank'; a.rel = 'noopener noreferrer';
  }
  return ['Following job ', a, '.\n\nThe house is the seat working on it now, and moves to the seat on its next step.'];
}
const DEFAULT_LEDE = 'A little pepe lives the working day of this IMD swarm seat. Everything he does comes from the seat\'s public record.';
function setLede(text, wide = false) { const el = $('lede'); el.replaceChildren(...[].concat(text)); el.classList.toggle('wide', !!wide); }

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
      if (house && mode === 'live') { setLede(DEFAULT_LEDE); note(); }
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
    setLede(followLede(), true);
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
  house = new House(4242, sound, theme); seatSeed = 4242; theme.setSeed(4242); radioSync(); house.state.seatNo = '0000'; showReset();
  house.onLetterDone = showLetter;
  house.onKnock = showKnock; lastUpdate = null; hideKnock();
  clearDiary(); hideLetter();
  setTitle('Demo: a made-up seat, one fast day', null);
  setLede('Every event the house knows, one after another, each when he is done with the last: the phone, each kind of work (token launch, websites, research, video, audio, images, oracles), mail, a failed run, a worker update, the checker going down, sleep with mail at night, and the owner pausing the seat.');
  $('demo-btn').setAttribute('aria-pressed', 'true');
  if (location.hash !== '#demo') history.replaceState(null, '', '#demo');
  demo.start();
  columnSync();
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

// ---------- the column beside the house (src/column.js; own pane, docs/own-pane.md, 2026-10-26) ----------
// The right-hand side of the old two-pane page, now part of this page (owner: "split view entfernen, und stattdessen einen
// als teil der eigenen seite bauen"): the swarm's jobs and seats from this origin (panels/), or a page he shows. No button
// opens it (owner: "kein button, man muss pepe danach fragen dann macht er es"): asked in the command line he pins the list
// up ("show jobs", "list the seats"), and his answers show their page in it (a chart, the Sworn site, the burn tracker,
// an explorer page; owner: foreign pages only "wenn pepe was zeigen will"). "hide the list" or its × closes it.
// A row clicked in the list: the house follows that job, or moves to that seat; the list marks what the house shows.
// Inside a foreign page, clicks are the page's own (the old "House follows the explorer" is gone). The swarm build has no
// column; the local one has no mirrors, so there the answers keep their links and only the list and the charts show.
const EXPLORER = 'https://explorer.imd.fun';                  // links to it (it refuses frames; the server mirrors it)
let pickedJob = null;                                         // the job a list row asked for, until followJob takes it

function picked(pick) {
  if (pick.token) { openToken(pick.token); return; }      // a launch or a holding row: its token view
  if (pick.job) {
    if (followed && followed.id === pick.job) return;
    pickedJob = pick.job; followFromTalk(pick.job);
    return;
  }
  if (pick.seat == null) return;
  if (mode === 'live' && seatId === pick.seat && !followed) return;
  visit(pick.seat);
  addDiary(`You picked seat #${pick.seat} from the list beside the house.`);
}

// what the house shows, for the list's marked row (a demo seat is none)
function columnSync() {
  if (column) column.sync({ seat: mode === 'live' && Number.isInteger(seatId) ? seatId : null, job: followed ? followed.id : null });
}

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
    else if (RELAY) { const r = await fetch(proxyUrl('/proxy/jobs/' + id + '/steps'), { cache: 'no-store' }); if (r.ok) rec = await r.json(); }
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
// runs, and the house moves there (as a pasted step link does)
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
// Questions he looks up at the machine; a page the explorer shows opens beside him, in the column (the server's mirror).
const talkState = { stress: 0, at: 0, history: [], back: 0, market: null, asked: null };
// the house's own sites; the burn tracker's contract (anyone can send its update) is not deployed yet: null until then
// 2026-10-27 (owner: "do the 2 changes for sworn and burn"): the owner's copies on vibingco.de. Sworn's is a 1:1 copy of
// the swarm's site; burn.imd.vibingco.de redirects to the burn tracker's newest version (its eth.limo name no longer answers)
const SITE = { sworn: 'https://sworn.vibingco.de/', burned: 'https://burn.imd.vibingco.de/' };
const SITE_LABEL = { sworn: 'sworn.vibingco.de', burned: 'burn.imd.vibingco.de' };
const BURN_TRACKER_CA = null;

// link: {href, label}, a page he found, opened in a new tab (beside him too, in the column, where it opened there)
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
  addDiary(text ? `You: "${echo(cmd)}". He: ${text}` : `You: "${echo(cmd)}".`);
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

// a page beside him, in the column: one of the house's sites or an explorer page (the server's mirrors: the real ones
// refuse frames), or a token's own pool (column.showToken, the token panel). Returns where it opened, for his answer
// ('on the right', or 'below' under the house on a phone), or false: no column (the swarm build) or no mirror (the local
// build); his answer carries the link then.
const shownWhere = () => (WIDE.matches ? 'on the right' : 'below');
const PANEL = !!column && FEATURES.marketPane;                // the token panel (server, local); the swarm build: links
function openToken(ca) {
  if (!PANEL) return false;
  column.showToken(ca);
  return shownWhere();
}
// a token that is no swarm launch: defined.fi (with the ref) in a new tab (owner: "should open the defined.fi link instead
// in a new tab"). 'tab', or 'blocked' when the browser refuses it (his answer is async, after the walk to the machine);
// his answer links it either way. Not window.open(url, '_blank', 'noopener'): with 'noopener' it returns null even when the
// tab opened, so a block could not be told; the opener is cut by hand instead, as for Etherscan (burnTalk).
function newTab(url) {
  if (!PANEL || !DEFINED_URL.test(url)) return false;
  let tab = null;
  try { tab = window.open(url, '_blank'); if (tab) tab.opener = null; } catch (e) { /* blocked */ }
  return tab ? 'tab' : 'blocked';
}

// '0x' (2026-10-28, owner: "remove the TXT from the OXTXT labels and titles, and render the 0 before the X in dark grey so its only
// barely visible"): its name is 0x, the 0 faint (SITE_FAINT: how many leading characters)
const SITE_NAME = { sworn: 'Sworn', burned: 'The burn tracker', '0x': '0x' };
const SITE_FAINT = { '0x': 1 };
// path: a page of the site (0xTXT's /surf or /wallet/<who>); the head's "open" is the real site, or the page itself where the
// site has no public home (0xTXT, 2026-10-27)
function openSite(key, path = '/') {
  if (!column || !MIRRORS || !MIRRORS[key]) return false;
  column.showPage({ url: MIRRORS[key] + path, name: SITE_NAME[key], open: SITE[key] || MIRRORS[key] + path, faint: SITE_FAINT[key] || 0 });
  return shownWhere();
}

const explorerLink = (path) => ({ href: EXPLORER + path, label: 'explorer.imd.fun' + path });

// a page he would point to on the explorer, opened in the column's own panels where they show it (2026-10-28, owner: "when pepes
// working he still opens the old job and launch links, when asked about jobs or tokens, he should open them in new panel view
// instead"): a job in Jobs, opened; the jobs, the swarm and inference in Jobs; tokens and launches in Launches; oracles in
// Oracles; an agent in Seats, opened; the agents in Seats. Where, or false; the rest (heartbeats, companies, parts) stays on the
// explorer (openAnswer)
const PANEL_OF = { '/': 'jobs', '/tokens': 'launches', '/oracle': 'oracles', '/agents': 'seats', '/agents?show=working': 'seats' };
function openPanelFor(path) {
  if (!column || !path) return false;
  let m;
  if ((m = /^\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(path))) { column.showJob(m[1]); return shownWhere(); }
  if ((m = /^\/agents\/(\d{1,4})$/.exec(path)) && Number(m[1]) < 2000) { column.showSeat(Number(m[1])); return shownWhere(); }
  if (PANEL_OF[path]) { column.showList(PANEL_OF[path]); return shownWhere(); }
  return false;
}
const openAnswer = (path) => openPanelFor(path) || openExplorer(path);

function openExplorer(path) {
  if (!path || !column || !MIRRORS || !MIRRORS.explorer) return false;
  column.showPage({ url: MIRRORS.explorer + path, name: 'explorer.imd.fun' + (path === '/' ? '' : path), open: EXPLORER + path });
  return shownWhere();
}

// the active jobs: locally the relay's list (every job not over among the newest 200), hosted the ones /swarm's events
// show plus the oracle questions still being answered; null when neither answers
async function activeJobList() {
  if (RELAY) {
    try { const r = await fetch(proxyUrl('/proxy/jobs/active'), { cache: 'no-store' }); if (r.ok) return (await r.json()).jobs || []; } catch (e) { /* no relay */ }
    return null;
  }
  try { await swarmJobs.refresh(45000); } catch (e) { /* the oracle list may still answer */ }
  try { await swarmJobs.refreshOracles(); } catch (e) { /* the swarm's jobs alone */ }
  return swarmJobs.at || swarmJobs.oracleAt ? swarmJobs.active() : null;
}

// ---------- following a job picked from the active ones (2026-10-25) ----------
// The list under the seat row, read every 30 s; rebuilt only when it changed and the visitor is not choosing from it.
// The followed job stays in it.
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

// following a job from the command line or the list beside the house: what the buttons do; step: a step key to show
// while it runs (a pasted #/job/<id>/step/<key> link)
function followFromTalk(id, step = null) {
  location.hash = '#/job/' + id + (step ? '/step/' + encodeURIComponent(step) : '');
}

// is a job (or an oracle question's job) still running? {id, state, active, objective}, or null when nothing here can
// tell: locally the relay's record; hosted what /swarm showed; both then the oracle routes (open CORS), which know an
// oracle question by its job id or its own id. A hosted page cannot read other jobs' records (/jobs has no CORS).
const JOB_OVER = ['completed', 'blocked', 'failed', 'cancelled'], ORACLE_RUNS = ['assessing', 'reproducing'];
async function jobActivity(id, oracle = false) {
  if (!oracle && RELAY) {
    try {
      const r = await fetch(proxyUrl('/proxy/jobs/' + id + '/steps'), { cache: 'no-store' });
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
  const say = (text) => { talkReply(text); addDiary(`You: "${echo(cmd)}". ${text}`); };
  switch (it.act) {
    case 'help': talkReply(HELP, false); return;
    case 'visit': visit(it.seat); say(`Seat #${it.seat}. You moved, I didn't.`); return;
    case 'random': await randomBusySeat(); talkReply('A random busy seat. Same face, different bags.'); return;
    case 'demo': $('demo-btn').click(); talkReply(mode === 'demo' ? 'The demo: a made-up seat. Like most roadmaps.' : 'Back to a real seat.'); return;
    case 'sound': setSound(it.on); say(it.on ? 'Sound on. Hope you like beeps.' : 'Sound off. Finally.'); return;
    case 'mode': {                                       // light or dark (2026-10-27: the frog's menu has the switch too)
      const was = document.documentElement.dataset.mode;
      setMode(it.mode, true);
      say(was === it.mode ? SCREEN.modeAlready(it.mode) : SCREEN.mode[it.mode]);
      return;
    }
    case 'fullscreen': {                                 // the house in full screen (2026-10-27, src/full.js)
      if (!it.on) { say(full.leave() ? SCREEN.left : SCREEN.notOn); return; }
      if (full.on) { say(SCREEN.already); return; }
      say(SCREEN.on[full.enter()]);
      return;
    }
    case 'legend': $('legend-btn').click(); return;
    case 'showList': {                                   // the column beside the house: only when asked (2026-10-26)
      const seats = it.view === 'seats';
      if (it.view === 'oracles') {                        // the oracle questions and research panels (job-detail-oracles, 2026-10-26)
        if (!column) {
          talkSay(cmd, 'The oracle list lives in the self-hosted copy of this house; here I only get the swarm\'s live feed. The explorer has every question:', explorerLink('/oracle'));
          return;
        }
        if (house && mode === 'live') house.event({ type: 'board' });   // he walks to his whiteboard, as for the other lists
        column.showList('oracles');
        talkReply(`The oracle questions, ${shownWhere()}, research panels too. Click one and its panel opens as a hive; click an agent in it and I go there.`);
        addDiary(`You: "${echo(cmd)}". He pins the swarm's oracle questions up beside the house.`);
        return;
      }
      if (it.view === 'launches') {                       // every swarm launch (launches-portfolio, 2026-10-26)
        if (!column) { talkSay(cmd, WALLET.swarmLaunches, explorerLink('/tokens')); return; }
        if (house && mode === 'live') house.event({ type: 'board' });
        column.showList('launches');
        talkReply(WALLET.launches(shownWhere()));
        addDiary(`You: "${echo(cmd)}". He pins the swarm's launches up beside the house.`);
        return;
      }
      if (!column) {
        talkSay(cmd, `The ${seats ? 'seats' : 'jobs'} list lives in the self-hosted copy of this house; here I only get the swarm's live feed. The explorer has ${seats ? 'them' : 'every job'}:`,
          explorerLink(seats ? '/agents' : '/'));
        return;
      }
      if (house && mode === 'live') house.event({ type: 'board' });   // he walks to his whiteboard
      column.showList(seats ? 'seats' : 'jobs');
      talkReply(seats ? `The seats, ${shownWhere()}. Online first. Mine's in there somewhere.` : `The swarm's jobs, ${shownWhere()}. Click one and I follow it.`);
      addDiary(`You: "${echo(cmd)}". He pins the swarm's ${seats ? 'seats' : 'jobs'} up beside the house.`);
      return;
    }
    case 'setWallet': return walletTalk(it.value, cmd);
    case 'forgetWallet': {
      if (!column) { talkSay(cmd, WALLET.swarm); return; }
      const had = visitorWallet || storedWallet();
      if (!had) { talkSay(cmd, WALLET.none); return; }
      keepWallet(null);
      talkSay(cmd, WALLET.forgot(shortAddr(had)));
      return;
    }
    case 'showPortfolio': {
      if (!column) { talkSay(cmd, WALLET.swarm); return; }
      if (it.value) return walletTalk(it.value, cmd, true);    // "whats my portfolio ? 0x…" (2026-10-27): told and shown at once
      if (!visitorWallet) { talkSay(cmd, WALLET.ask); return; }
      portfolioUp(cmd);
      return;
    }
    case 'hideList':
      if (column && column.open) { column.hide(); say('Down it comes. Just the house again.'); } else say('Nothing beside me to close, ser.');
      return;
    case 'explorer':                                     // explorer.imd.fun's front page: on the server its mirror
      if (openExplorer('/')) { say(`The explorer, ${shownWhere()}. For the jobs and the seats in my own list: show jobs.`); return; }
      talkSay(cmd, column ? 'No explorer beside me here, ser. Ask me for the jobs or the seats and I pin them up. The explorer itself:' : 'No explorer beside me here, ser. Just the house. The explorer itself:', explorerLink('/'));
      return;
    case 'randomJob': {
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
        const where = openPanelFor('/jobs/' + r.id);
        talkSay(cmd, `${r.oracle ? 'That oracle question' : 'Job ' + r.id.slice(0, 8)} is already ${r.state}${name(r.objective)}. Nothing left to follow. ${where ? `Its page is ${where}.` : 'Its page:'}`,
          where ? null : explorerLink('/jobs/' + r.id));
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

// "my wallet is …": an address is kept as it is; a name.eth goes to the server's /proxy/panels/resolve first (a forward
// lookup the mainnet registry answers directly; 404 for anything else, offchain names included). The diary gets his line
// (the address shortened), never what was typed.
// the visitor's portfolio in the column (lead: what he says before it, e.g. that he noted the wallet)
function portfolioUp(cmd, lead = '') {
  if (house && mode === 'live') house.event({ type: 'board' });   // he walks to his whiteboard, as for the lists
  column.showList('portfolio');
  talkReply(lead + WALLET.portfolio(shortAddr(visitorWallet), shownWhere()));
  addDiary(`You: "${echo(cmd)}". He pins up what ${shortAddr(visitorWallet)} holds beside the house.`);
}

// show: a portfolio was asked for with the wallet in the same line; once it is known, the portfolio goes up
async function walletTalk(raw, cmd, show = false) {
  const told = (text) => { talkReply(text); addDiary(`You told him a wallet. He: ${text}`); };
  if (!column) { told(WALLET.swarm); return; }
  const v = String(raw || '').toLowerCase().replace(/[.?!,;]+$/, '');
  const noted = (w, name) => {
    keepWallet(w);
    if (show) { portfolioUp(cmd, WALLET.noted(shortAddr(w), name) + ' '); return; }
    told(WALLET.noted(shortAddr(w), name) + (column.open ? WALLET.tab(shownWhere()) : WALLET.hint));
  };
  if (WALLET_RE.test(v)) { noted(v, null); return; }
  if (!/\.eth$/.test(v)) { told(WALLET.bad); return; }
  if (!ENS_NAME(v)) { told(WALLET.badName(v.slice(0, 64))); return; }
  talkReply(WALLET.lookup(v));
  let r = null, d = null;
  try {
    r = await fetch(proxyUrl('/proxy/panels/resolve?name=' + encodeURIComponent(v)), { cache: 'no-store' });
    d = await r.json().catch(() => null);
  } catch (e) { /* no relay */ }
  if (r && r.ok && d && WALLET_RE.test(String(d.address || '').toLowerCase())) { noted(String(d.address).toLowerCase(), v); return; }
  if (r && (r.status === 429 || (r.ok && d && d.busy))) { told(WALLET.busy); return; }
  if (r && r.status === 404 && d && d.error) { told(WALLET.noName(v)); return; }
  if (r && r.status === 400) { told(WALLET.badName(v)); return; }
  told(WALLET.down);
}

// 0xTXT (2026-10-27): Agent Surf's feed, or a wallet's posts. Its /wallet/<x> route takes an address only, so a name.eth goes
// through the server's resolver first (as "my wallet is …"); a name it cannot read opens the lookup page instead
async function oxtxtTalk(it, cmd) {
  house.event({ type: 'flash', icon: 'dots' });
  const v = String(it.who || '').toLowerCase().replace(/[.?!,;]+$/, '');
  if (!v) return talkSay(cmd, `${pick(OXTXT.lead)} ${OXTXT.note(openSite('0x', '/surf'), null)}`);
  let addr = WALLET_RE.test(v) ? v : null;
  if (!addr && column && ENS_NAME(v)) {
    try {
      const r = await fetch(proxyUrl('/proxy/panels/resolve?name=' + encodeURIComponent(v)), { cache: 'no-store' });
      const d = r.ok ? await r.json().catch(() => null) : null;
      if (d && WALLET_RE.test(String(d.address || '').toLowerCase())) addr = String(d.address).toLowerCase();
    } catch (e) { /* no relay: the lookup page */ }
  }
  if (!addr) return talkSay(cmd, OXTXT.noName(v.slice(0, 64), openSite('0x', '/wallet')));
  return talkSay(cmd, `${pick(OXTXT.walletLead)} ${OXTXT.note(openSite('0x', '/wallet/' + addr), v)}`);
}

function egg(it, cmd, grumble) {
  if (it.act === 'trade') {
    house.event({ type: 'command', act: 'trade', done: () => talkSay(cmd, pick(EGG.tradeAfter)) });
    talkSay(cmd, pick(EGG.trade)); return;
  }
  if (it.act === 'buy') {                                // no swap (2026-10-26): he runs, IMD's pool opens, defined.fi linked
    const url = chartUrl(IMD_CA, 'ethereum', IMD_POOL);
    house.event({ type: 'command', act: 'buy', done: () => {
      const where = openToken(IMD_CA);
      talkSay(cmd, pick(EGG.buyAfter) + (where ? ` IMD's pool is ${where}; defined.fi has the rest:` : ' IMD on defined.fi:'), { href: url, label: 'defined.fi' });
    } });
    talkSay(cmd, pick(EGG.buy)); return;
  }
  const scene = { gm: 'gm', gn: 'nap', moon: 'moon', lfg: 'lfg', mint: 'paint', pump: 'exercise', seed: 'nope', wallet: 'nope',
    nothing: 'telescope' }[it.act];
  if (scene) house.event({ type: 'command', act: scene });
  else house.event({ type: 'flash', icon: it.act === 'thanks' ? 'heart' : ['insult', 'ngmi', 'fud'].includes(it.act) ? 'bang' : 'dots' });
  talkSay(cmd, pick(EGG[it.act] || UNKNOWN) + (it.act === 'thanks' ? '' : grumble));
}

// one line counted on the server (selfhost/talkcount.py): its kind and its act or topic, nothing the visitor typed, no wallet,
// no seat. Best effort: a beacon, no answer read
function countTalk(it) {
  if (!FEATURES.talkCounts || typeof navigator === 'undefined' || !navigator.sendBeacon) return;
  const s = it.kind === 'confirm' ? (it.yes ? 'yes' : 'no') : it.act || it.topic || null;
  try { navigator.sendBeacon(proxyUrl('/proxy/talk'), JSON.stringify({ k: it.kind, s: typeof s === 'string' ? s : null })); } catch (e) { /* not counted */ }
}

async function talk(raw) {
  const cmd = String(raw || '').trim().slice(0, 160);
  if (!cmd) return;
  talkState.history.push(cmd); talkState.back = 0;
  const it = parse(cmd);
  countTalk(it);
  if (it.kind === 'page') return pageCommand(it, cmd);
  if (!house) { talkReply('Nobody lives here yet. Pick a seat first.'); return; }
  const s = house.state;
  if (it.kind === 'radio') return radioTalk(it, cmd, s);          // the radio works whatever he does (page-like)
  if (house.walkout) return talkSay(cmd, pick(OUT));
  if (s.away) return talkSay(cmd, AWAY);
  if (it.kind === 'egg' && it.act === 'sell') { talkReply(null); addDiary(`You: "${echo(cmd)}".`); return; }   // he doesn't even look up
  if (s.asleep) return talkSay(cmd, pick(ASLEEP));
  if (it.kind === 'confirm') return confirmTalk(it, cmd);
  // IMD, Sworn and the burns: he drops everything; so does a question about the swarm itself (the docs' answer)
  const busy = s.working && !(it.kind === 'egg' && it.act === 'buy') && !['sworn', 'burn', 'oxtxt', 'showcase', 'changelog', 'faq'].includes(it.kind);
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
    return talkSay(cmd, `${pick(SWORN.lead[it.alpha ? 'alpha' : 'nft'])} ${SWORN.eli5} ${SWORN.mint(beside)}`, { href: SITE.sworn, label: SITE_LABEL.sworn });
  }
  if (it.kind === 'oxtxt') return oxtxtTalk(it, cmd);
  if (it.kind === 'changelog') { openChangelog(); return talkSay(cmd, SHOW.changelog); }
  if (it.kind === 'faq') {
    const f = FAQ[it.topic];
    house.event({ type: 'flash', icon: 'dots' });
    return talkSay(cmd, f.text, { href: f.href, label: f.label });
  }
  if (it.kind === 'showcase') return showcaseTalk(it, cmd);
  if (it.kind === 'burn') {
    house.event(s.working ? { type: 'flash', icon: 'dots' } : { type: 'command', act: 'fire' });   // he lights the fire
    const beside = openSite('burned');
    talkState.asked = { what: 'burnUpdate', at: Date.now() };
    return talkSay(cmd, `${pick(BURN.lead)} ${BURN.note(beside)}`, { href: SITE.burned, label: SITE_LABEL.burned });
  }
  if (busy) {
    const tier = lvl >= STRESS.warn ? 2 : lvl >= STRESS.grumpy ? 1 : 0;
    house.event({ type: 'flash', icon: tier ? 'bang' : 'dots' });
    let text = pick(BUSY[tier]);
    let link = null;
    if (it.kind === 'news') return talkSay(cmd, text + ' ' + NEWS.busy, { href: DAILY.site, label: 'The IMD Daily' });
    if (it.kind === 'ask') {
      const a = answer(it, talkContext());
      const where = a.explorer && openPanelFor(a.explorer);
      if (where) text += ` Look it up yourself, it's ${where}.`;
      else if (a.explorer && openExplorer(a.explorer)) text += ' Look it up yourself, it\'s on the explorer.';
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
      const a = answer(it, talkContext()), opened = !!a.explorer && openAnswer(a.explorer);
      talkSay(cmd, a.text + grumble, a.explorer && !opened ? explorerLink(a.explorer) : null);
    } });
    return;
  }
  if (it.kind === 'news') return newsTalk(cmd, grumble);
  if (it.kind === 'do') { house.event({ type: 'command', act: it.act }); return talkSay(cmd, DO[it.act] + grumble); }
  if (it.kind === 'egg') return egg(it, cmd, grumble);
  house.event({ type: 'flash', icon: 'ask' });
  if (it.kind === 'suggest') {                           // a typo: he asks, a yes runs the line he guessed (confirmTalk)
    talkState.asked = { what: 'suggest', line: it.line, at: Date.now() };
    return talkSay(cmd, SUGGEST.ask(it.line));
  }
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
    case 'request': house.event({ type: 'flash', icon: 'dots' }); return say(RADIO.request, chart(st));
    default: return say(pick(UNKNOWN));
  }
}
// the radio on or off as the visitor asks (the hidden Radio button, the frog's menu: Music): he walks to the record player
// and the music follows when he gets there
function radioWalk(act) { if (house) house.event({ type: 'radio', act, done: () => radio.sync() }); else radio.sync(); }
function toggleRadio() {
  if (!FEATURES.radio) return;
  radio.setOn(!radio.on, true); radioWalk(radio.on ? 'tune' : 'off');
  if (house) addDiary(radio.on ? `Radio on: ${radio.label()}.` : 'Radio off.');
}
if (FEATURES.radio) {
  const walk = radioWalk;
  $('radio-btn').addEventListener('click', toggleRadio);
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
    addDiary(`The plaque on the tree: ${rate == null ? 'no tasks yet' : rate + ' % accepted'}${ex ? `, by trade ${/^[aeiou]/i.test(ex.job) ? 'an' : 'a'} ${ex.job.toLowerCase()}: ${ex.word} are ${Math.round(ex.share * 100)} % of his newest tasks, ${ex.ratio >= 2 ? Math.round(ex.ratio) + ' x' : Math.round(ex.ratio * 10) / 10 + ' x'} the swarm's share` : ''}.`);
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
// the panel over the piano (themes/imd.js GRID_PANEL), there only while music plays and the station has a grid
function onPanel(e) {
  const s = house && house.state.radio;
  if (!s || !s.on || !s.grid) return false;
  const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * 480 / r.width, y = (e.clientY - r.top) * 320 / r.height, p = GRID_PANEL;
  const w = 16 * p.pitch + 2.4 - p.pitch / 4, h = 5.25 * p.pitch + 2.4;
  return x >= p.x - 1.5 && x <= p.x + w + 1.5 && y >= p.y - 1.5 && y <= p.y + h + 1.5;
}
const feedReading = () => ({ rate: radioRate, stage: radioStage, lastAt: stationFeed.lastAt });
if (FEATURES.radio) {
  canvas.addEventListener('click', (e) => {
    if (!onPanel(e)) return;
    if (!radioGrid) {                                  // a station without a hook: the panel shows the hooked one's pattern
      stationPop.open(HOOKED, hookGrid, {});
      addDiary(`You tapped the panel over the piano: ${radio.station.label} has no hook to hold a pattern, so it shows ${HOOKED.label}'s.`);
      return;
    }
    stationPop.open(radio.station, radioGrid, feedReading());
    addDiary(`You tapped the panel over the piano: ${radio.station.label}, as its hook holds it.`);
  });
  canvas.addEventListener('mousemove', (e) => { if (onPanel(e)) canvas.style.cursor = 'pointer'; });
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

// ---------- the showcase (2026-10-28, owner: "some more actions to add"; showcase.js, brain.js showEvent) ----------
// The server's /proxy/showcase every 30 s: the swarm's new video plays on the TV while he watches, new audio on the record
// player (the radio held meanwhile), a new site on his machine's screen for a while, new art on the easel; the BurnExecutor's
// box goes into the fire and he thanks the sender; Agent Surf's new message is towed past by a plane. Each can be clicked
// while it shows (owner: "all can be clicked and opened in the explorer if possible if not in a new window"): a job opens in
// the explorer in the column (else a new tab), a burn on Etherscan in a new tab, the plane's message in the 0xTXT pane; the
// surfboard over the bed opens Agent Surf's feed.
const showTitle = (t) => (t && String(t).trim()) || 'untitled';
const imdAmount = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
// Music (2026-10-28, owner): every sound from outside the house, the radio, the swarm's audio, a video's own sound
const musicOn = () => !!(FEATURES.radio && radio.on);
function stopVideo() { dropMedia(tvVideo); tvVideo = null; showing.video = null; if (house) house.state.tvVideo = null; if (FEATURES.radio) radio.release('showcase'); }
function stopAudio() { dropMedia(showAudio); showAudio = null; showing.audio = null; if (FEATURES.radio) radio.release('showcase'); }
function stopSite() { if (siteEl) siteEl.remove(); siteEl = null; showing.site = null; }
// a new house (another seat, the demo): nothing keeps playing for the old one; the easel keeps the newest picture
function showReset() { stopVideo(); stopAudio(); stopSite(); burnShown = null; if (house && lastArt) house.state.easelArt = lastArt; }
function loadArt(item, then) {
  const img = new Image();
  img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
  img.onload = () => { lastArt = { img, item }; if (house) house.state.easelArt = lastArt; if (then) then(lastArt); };
  img.src = item.url;
}
function openTab(url) { try { window.open(url, '_blank', 'noopener,noreferrer'); } catch (e) { /* blocked */ } }
// one item of the snapshot, acted out; asked: the visitor asked for it (his line comes from showcaseTalk)
function showItem({ kind, item }, asked = false) {
  if (!house || !FEATURES.showcase) return;
  const t = showTitle(item.title);
  if (kind === 'video') {
    house.event({ type: 'show', kind, item, seconds: VIDEO_S, stop: stopVideo, ended: () => !tvVideo || tvVideo.ended || !!tvVideo.error,
      start: () => {
        stopVideo(); const heard = musicOn();
        tvVideo = videoEl(document, item.url, heard); house.state.tvVideo = tvVideo; showing.video = item;
        if (heard) radio.hold('showcase');                                  // its own sound instead of the station
        const v = tvVideo;
        v.play().catch(() => { if (v === tvVideo && !v.muted) { v.muted = true; v.play().catch(() => {}); } });   // no click yet: muted
      } });
    if (!asked) addDiary(`A new video from the swarm: ${t}. He watches it on the TV.`);
  } else if (kind === 'audio') {
    // nothing to hear (the sound off, or the browser refused): he stands at the player a short while only
    house.event({ type: 'show', kind, item, seconds: AUDIO_S, stop: stopAudio,
      ended: () => (showAudio && !showAudio.paused ? showAudio.ended || !!showAudio.error : Date.now() - audioAt > 12000),
      start: () => {
        stopAudio(); showing.audio = item; audioAt = Date.now();
        if (FEATURES.radio) radio.hold('showcase');
        if (musicOn()) { showAudio = new Audio(item.url); showAudio.volume = 0.8; showAudio.play().catch(() => {}); }
      } });
    if (!asked) addDiary(`New audio from the swarm: ${t}. He puts it on the record player${musicOn() ? '' : ' (the music is off)'}.`);
  } else if (kind === 'site') {
    house.event({ type: 'show', kind, item, host: item.host, seconds: SITE_S, stop: stopSite,
      start: () => { stopSite(); showing.site = item; if (item.url && theme.id === 'imd') siteEl = siteOverlay(document, canvas, THINGS.screen, item.url); } });
    if (!asked) addDiary(`A new site from the swarm: ${t}${item.host ? ` (${item.host})` : ''}. It shows on his machine for a while.`);
  } else if (kind === 'art') {
    loadArt(item, (art) => { if (house) house.event({ type: 'show', kind: 'art', art, item }); });
    if (!asked) addDiary(`New art from the swarm: ${t}. It goes on the easel.`);
  } else if (kind === 'burn') {
    burnShown = item;
    const who = item.name || shortAddr(item.from), imd = imdAmount(item.imd);
    house.event({ type: 'show', kind, item, done: () => {
      talkReply(SHOW.burn(imd, who), true, { href: item.etherscan, label: 'Etherscan' });
      addDiary(`A box from the BurnExecutor came to the door and he threw it into the fire: ${imd} IMD burned, sent by ${who}.`);
      setTimeout(() => { if (burnShown === item) burnShown = null; }, 20000);
    } });
  } else if (kind === 'plane') {
    house.event({ type: 'show', kind, text: item.text, tx: item.tx, seconds: PLANE_S });
    if (!asked) addDiary(`A plane tows Agent #0's new message past the house: "${item.text}"`);
  }
}
// "latest video", "last burn" …: the newest of that kind again
function showcaseTalk(it, cmd) {
  if (!FEATURES.showcase || !showFeed) return talkSay(cmd, SHOW.off);
  const x = showFeed.latest(it.what);
  if (!x) return talkSay(cmd, SHOW.none[it.what] || 'Nothing like that yet.');
  showItem(x, true);
  const t = showTitle(x.item.title);
  const line = { video: SHOW.video(t), audio: SHOW.audio(t, musicOn()), site: SHOW.site(t), art: SHOW.art(t), plane: SHOW.plane(x.item.text) }[it.what];
  if (line) talkSay(cmd, line, x.item.explorer ? { href: x.item.explorer, label: 'its job' } : null);
  else addDiary(`You: "${echo(cmd)}". He fetches the last box from the BurnExecutor again.`);
}
const worldOf = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * 480 / r.width, y: (e.clientY - r.top) * 320 / r.height }; };
const inBox = (p, b) => !!b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
function showSpot(e) {
  if (!house || !FEATURES.showcase || theme.id !== 'imd') return null;
  const p = worldOf(e), s = house.state;
  if (s.plane && s.plane.tx && inBox(p, s.plane.box)) return { open: 'post', tx: s.plane.tx };
  if (showing.video && inBox(p, SHOW_SPOTS.tv)) return { open: 'job', item: showing.video };
  if (showing.audio && inBox(p, SHOW_SPOTS.records)) return { open: 'job', item: showing.audio };
  if (showing.site && inBox(p, SHOW_SPOTS.screen)) return { open: 'site', item: showing.site };
  if (s.easelArt && s.easelArt.item && inBox(p, SHOW_SPOTS.easel)) return { open: 'job', item: s.easelArt.item };
  if (burnShown && (inBox(p, SHOW_SPOTS.box) || inBox(p, SHOW_SPOTS.fire))) return { open: 'burn', item: burnShown };
  if (inBox(p, SHOW_SPOTS.surfboard)) return { open: 'surf' };
  return null;
}
if (FEATURES.showcase) {
  showFeed = new ShowcaseFeed({ url: proxyUrl('/proxy/showcase'), onNew: (x) => showItem(x), onArt: (x) => loadArt(x.item) });
  setTimeout(() => showFeed.start(), 5000);
  canvas.addEventListener('click', (e) => {
    const t = showSpot(e);
    if (!t) return;
    if (t.open === 'job') {
      if (!openAnswer('/jobs/' + t.item.id)) openTab(t.item.explorer);
      addDiary(`You clicked ${showTitle(t.item.title)}: its job opens beside the house.`);
    } else if (t.open === 'site') {
      // the site itself from IPFS beside the house (2026-10-28, owner: "if a website is built by the swarm, use the ipfs link for
      // preview"); without a CID, its job as before
      if (column && column.showSite(t.item.url, t.item.host ? 'https://' + t.item.host : null)) addDiary(`You clicked ${showTitle(t.item.title)}: the site opens beside the house, from IPFS.`);
      else { if (!openAnswer('/jobs/' + t.item.id)) openTab(t.item.explorer); addDiary(`You clicked ${showTitle(t.item.title)}: its job opens beside the house.`); }
    } else if (t.open === 'burn') {
      openTab(t.item.etherscan);
      addDiary('You clicked the burn: Etherscan opens in a new tab.');
    } else if (t.open === 'post') {
      if (!openSite('0x', '/surf/' + t.tx)) talkReply(OXTXT.note(false, null));
      addDiary('You clicked the banner: Agent #0\'s post opens beside the house.');
    } else if (t.open === 'surf') {
      house.event({ type: 'flash', icon: 'heart' });
      const line = `${pick(OXTXT.lead)} ${OXTXT.note(openSite('0x', '/surf'), null)}`;
      talkReply(line);
      addDiary(`You tapped the surfboard over the bed. He: ${line}`);
    }
  });
  canvas.addEventListener('mousemove', (e) => { if (showSpot(e)) canvas.style.cursor = 'pointer'; });
}
// the changelog (2026-10-28): what changed in the house, newest first (changelog.js)
function openChangelog() {
  const list = $('changelog-list');
  list.textContent = '';
  for (const c of CHANGELOG) {
    const h = document.createElement('h3'), ul = document.createElement('ul');
    h.textContent = c.date;
    for (const i of c.items) { const li = document.createElement('li'); li.textContent = i; ul.append(li); }
    list.append(h, ul);
  }
  $('changelog-pop').hidden = false;
  $('changelog-close').focus();
}
const closeChangelog = () => { $('changelog-pop').hidden = true; canvas.focus(); };
$('changelog-close').addEventListener('click', closeChangelog);
$('changelog-pop').addEventListener('click', (e) => { if (e.target === $('changelog-pop')) closeChangelog(); });
$('changelog-pop').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeChangelog(); });

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
  if (hasNoMinute()) { addDiary('The paper waits in the mailbox until he has a minute.'); paperLater(issue); return; }
  readPaper(issue);
}
// busy for the paper: working, asleep, out, walked out, or in the middle of something the visitor asked for (a scene the
// news would cut short: 2026-10-26, "spin a record" lost to the paper that came 4 s later)
function hasNoMinute() {
  const s = house.state;
  return !!(s.working || s.asleep || s.away || house.walkout || (house.current && house.current.name === 'command') || (house.queue || []).some((q) => q.name === 'command'));
}
function readPaper(issue) { house.event({ type: 'command', act: 'news', done: () => { talkReply(issueLine(issue)); addDiary(`He reads it. ${issueLine(issue)}`); } }); }
// the paper lies in the mailbox: every 3 s a look whether he has a minute now; a request or a click may have taken it already
let paperTimer = null;
function paperLater(issue) {
  clearInterval(paperTimer);
  paperTimer = setInterval(() => {
    if (!house || !house.state.paper) { clearInterval(paperTimer); return; }
    if (hasNoMinute()) return;
    clearInterval(paperTimer); readPaper(issue);
  }, 3000);
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
  if (q.what === 'suggest') return it.yes ? talk(q.line) : talkSay(cmd, pick(SUGGEST.no));
  if (!it.yes) return talkSay(cmd, BURN.no);
  if (!BURN_TRACKER_CA) return talkSay(cmd, BURN.noCa);
  const url = `https://etherscan.io/address/${BURN_TRACKER_CA}#writeContract`;
  let tab = null;
  try { tab = window.open(url, '_blank'); if (tab) tab.opener = null; } catch (e) { /* blocked */ }   // null: blocked
  return talkSay(cmd, tab ? BURN.yes : BURN.blocked, { href: url, label: 'Etherscan' });
}

// a token's market: a ticker alone gets a question back (an address pasted next answers it). With an address he reads at
// the machine (launch panel, 2026-10-26): a swarm launch or IMD from its own pool on our server (poolQuote, the numbers
// the token panel shows), and its pool opens beside him in the column, whatever he was asked; any other token on
// DexScreener, and a chart (or a bare address) opens defined.fi in a new tab. Buy and sell: no swap, he links defined.fi.
// The swarm build has no pool reader and no column: DexScreener (a launch in its launch pool) and the defined.fi link,
// as before. While the seat works he says no, and the pool opens anyway.
async function marketTalk(it, cmd, busy, lvl) {
  const asked = house, last = talkState.market;
  const recent = last && Date.now() - last.at < 5 * 60000 ? last.act : null;
  const act = it.act || recent || 'price', bare = !it.act && !recent;
  const grumble = lvl >= STRESS.warn ? ' (Last one. I mean it.)' : lvl >= STRESS.grumpy ? ' (Sigh.)' : '';
  if (!it.ca) {
    talkState.market = { act, at: Date.now() };
    house.event({ type: 'flash', icon: 'ask' });
    return talkSay(cmd, (it.ticker ? pick(MARKET.needCa(it.ticker)) : MARKET.noWhat[act]) + grumble);
  }
  talkState.market = null;
  const pending = readMarket(it.ca);                                       // read while he walks to the machine
  // a launch's or IMD's own pool: the panel beside him, his numbers from the same read
  const finishPool = (p, lead) => {
    const c = CHAINS[p.chain] || null, beside = openToken(p.ca);
    const link = { href: chartUrl(p.ca, p.chain || 'ethereum', p.poolId), label: 'defined.fi' };
    if (lead != null) return talkSay(cmd, `${lead} Look it up yourself${beside ? `, its pool is ${beside}.` : ':'}`, link);
    talkSay(cmd, poolText(act, p, poolNum, c ? c.name : 'chain ' + p.chainId, beside) + grumble, link);
  };
  // DexScreener (a non-launch; the swarm build): defined.fi for the chain (Ethereum when nothing names it), in a new tab
  // for a chart or a bare address
  const finishQuote = (q, lead) => {
    const c = CHAINS[q.chainId || 'ethereum'], url = chartUrl(q.ca, q.chainId || 'ethereum', q.poolId);
    const pg = url && { href: url, label: 'defined.fi' };
    const tab = pg && (act === 'chart' || bare) ? newTab(url) : false;
    if (lead != null) return talkSay(cmd, lead + (pg ? ` Look it up yourself${tab === 'tab' ? ': ' + MARKET.tab : ':'}` : ''), pg);
    if (!pg && q.pairUrl) return talkSay(cmd, MARKET.offChain(q) + ' DexScreener has it:' + grumble, { href: q.pairUrl, label: 'DexScreener' });
    const eth = q.ca === WETH ? { symbol: 'ETH', coin: 'USDC' } : { coin: c && c.coin };
    talkSay(cmd, marketText(act, { ...q, ...eth }, usd, c ? c.name : q.chainId, tab, pg && pg.label) + grumble, pg);
  };
  const finish = (m, lead) => (m.pool ? finishPool(m.pool, lead) : finishQuote(m.q, lead));
  if (busy) {
    const tier = lvl >= STRESS.warn ? 2 : lvl >= STRESS.grumpy ? 1 : 0;
    house.event({ type: 'flash', icon: tier ? 'bang' : 'dots' });
    const m = await pending;
    if (house === asked) finish(m, pick(BUSY[tier]));
    return;
  }
  talkReply(LOOKUP, false);
  house.event({ type: 'command', act: 'lookup', done: async () => {
    const m = await pending;
    if (house === asked) finish(m, null);
  } });
}

// what he reads for an address: {pool} (poolQuote: a launch's or IMD's own pool; while our server cannot answer, a launch
// the relay knows still opens its pool, which the panel reads again) or {q} (quote: DexScreener). A launch without a
// readable pool counts as a non-launch (docs/launch-panel.md "Settled").
async function readMarket(ca) {
  if (PANEL) {
    const p = await poolQuote(ca);
    if (p && !p.error && !p.noPool) return { pool: p };
    if (p && p.error) {
      const l = await launchOf(ca);
      if (l && l.pool && l.pool.id) return { pool: { ...p, kind: 'launch', launchNumber: l.launchNumber, chain: CHAIN_OF_ID[l.chainId] || null, chainId: l.chainId, poolId: l.pool.id } };
    }
    return { q: await quote(ca, fetch, null) };
  }
  return { q: await quote(ca, fetch, await launchOf(ca)) };
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
// the house's beeps: the hidden Sound button, the frog's menu and the talk line ("sound on") all set it here
function setSound(on) {
  sound.enable(!!on);
  $('sound-btn').setAttribute('aria-pressed', String(sound.on)); $('sound-btn').textContent = sound.on ? 'Sound on' : 'Sound off';
  menuSync();
}
$('sound-btn').addEventListener('click', () => setSound(!sound.on));
window.addEventListener('hashchange', route);

// ---------- the frog's menu (src/menu.js): light / dark, music, sound, full screen, the original ----------
// Each entry shows its state; whatever changes it (the menu, the talk line, the browser's own way out of full screen)
// calls menuSync, so the menu says what is.
menu = new Menu({ button: $('menu-btn'), menu: $('lcp-menu'), onPick: (item) => {
  if (item === 'mode') setMode(document.documentElement.dataset.mode === 'light' ? 'dark' : 'light', true);
  else if (item === 'music') toggleRadio();
  else if (item === 'sound') setSound(!sound.on);
  else if (item === 'full') { if (full.on) full.leave(); else full.enter(); }
} });
function menuSync() {
  if (!menu) return;
  menu.set('mode', document.documentElement.dataset.mode !== 'light');
  if (FEATURES.radio) menu.set('music', radio.on, `${radio.station.label} on theidm.fun`);
  menu.set('sound', sound.on);
  menu.set('full', full.on, full.on ? 'Esc, or here, to leave' : 'the house as large as it fits');
}
// Esc leaves full screen (the browser's own full screen takes its Esc itself: src/full.js ends the mode then); a letter, the
// paper, the station, the whiteboard, the legend or the menu open: Esc closes that first, as before
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !full.on || menu.isOpen) return;
  if (document.querySelector('.letter-pop:not([hidden]), dialog[open]')) return;
  full.leave();
}, true);

applyTheme(theme.id);
route();
if (FEATURES.radio) { radio.armAutostart(); radioChanged(radio); }   // a wanted radio starts at the first click or key
menuSync();
requestAnimationFrame(frame);
window.__house = () => house;   // for local testing in the console
window.__live = live;
window.__theme = () => theme;
window.__demo = demo;
window.__follower = follower;
window.__radio = radio;
window.__full = full;
window.__news = () => ({ issue: newsIssue, reader: news });
window.__stationFeed = stationFeed;
