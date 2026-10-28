// The radio (2026-10-25, the owner: background music from theidm.fun, Pepe switches the station from the command line;
// read-only, nothing of ours runs on their side). theidm.fun plays a token's pool as music: every swap in the pool is a
// note (a Uniswap v4 hook on $IDM; the other stations run the same rules in the browser from the pool's Swap logs).
// Their UI-less stream page, https://theidm.fun/stream.html?net=<key>&gain=<0..1> (the page their YouTube radio plays),
// starts the audio on load, so the house frames it, hidden, with allow="autoplay": a browser lets that frame play once
// the visitor has clicked or typed on this page (never before: the first interaction starts it, remembered in lcp:radio).
// A new src switches the station without another click (measured 2026-10-25 in Chromium). The genre is the market's
// (theidm: epoch = page / 4), so he switches stations, not genres. The record player in the music room shows it.
export const SITE = 'https://theidm.fun/';
export const STREAM = 'https://theidm.fun/stream.html';
const V4_MAINNET = '0x000000000004444c5dc75cB358380D2e3dE08A90';

// theidm.fun's stations on 2026-10-25 (stations/registry.json + /stations-data/stations.json): the keys the player
// takes as ?net=<key>, each pool as the house reads it too (stationfeed.js), the station's LCD colour for its sleeve.
// house: theidm's own, always on air; the others are paid and may go off air (then the stream page stays silent).
export const STATIONS = [
  { key: 'imd-eth', label: 'IMD/ETH', ticker: 'IMD', token: '0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7', chain: 'Ethereum', chainId: 1, explorer: 'https://etherscan.io', house: true, color: '#6fd8ff', dim: '#2a7f9c',
    words: /\bimd(?:\s*\/\s*eth|-eth)?\b/,
    pool: { kind: 'v4', address: V4_MAINNET, id: '0x415829f72e9f54531c26eae76f107618540e898a45d6ae35959e143f5faca704', ethSide: 0 },
    rpc: ['https://mainnet.gateway.tenderly.co', 'https://ethereum-rpc.publicnode.com'], lookback: 300, blockSeconds: 12 },
  { key: 'idm', label: '$IDM', ticker: 'IDM', token: '0x4fe9f3823791c8b187b81ab8b7398d793fed28f6', chain: 'Robinhood Chain', chainId: 4663, explorer: 'https://robinhoodchain.blockscout.com', house: true, color: '#6cf595', dim: '#2f8f4f',
    words: /\bidm\b|intelligent dance market|theidm/,
    pool: { kind: 'v4', address: '0x8366a39cc670b4001a1121b8f6a443a643e40951', id: '0x519387822812b11873eb51242f9dc80632d98144742b4ed0feea792af777d94b', ethSide: 0,
      hook: '0x4ebe25e5b6493194a58ac8b62bb13b38156f7040', treasury: '0xab64b47daa0f68e50bdf776e73b4245d78575a6c' },
    rpc: ['https://rpc.mainnet.chain.robinhood.com', 'https://robinhood-rpc.publicnode.com'], lookback: 20000, blockSeconds: 0.105 },
  { key: 'infer', label: 'INFER/IMD', ticker: 'INFER', token: '0x53d0ea0a685220718dc6a0a6e4617194c6f37921', chain: 'Ethereum', chainId: 1, explorer: 'https://etherscan.io', color: '#b8ceff', dim: '#4e74cc',
    words: /\binfer\b/,
    pool: { kind: 'v4', address: V4_MAINNET, id: '0x1f03dd2c202cf17b58305b73ae2f8b3143e9c056ed9c9e8dbd4924b350431e95', ethSide: 1, quotePerEth: 438.734, quoteSymbol: 'IMD' },
    rpc: ['https://mainnet.gateway.tenderly.co', 'https://ethereum-rpc.publicnode.com'], lookback: 300, blockSeconds: 12 },
  { key: 'chog', label: 'CHOG/MON', ticker: 'CHOG', token: '0x350035555e10d9afaf1566aaebfced5ba6c27777', chain: 'Monad', chainId: 143, explorer: 'https://monadvision.com', color: '#d6c3ff', dim: '#8561d1',
    words: /\bchog\b/,
    pool: { kind: 'v3', address: '0x116e7d070f1888b81e1e0324f56d6746b2d7d8f1', ethSide: 1, quotePerEth: 111949, quoteSymbol: 'MON' },
    rpc: ['https://monad.gateway.tenderly.co'], lookback: 1000, blockSeconds: 0.4 },
];
// listed by theidm but not on air (an NFT station, pending on 2026-10-25): he knows the name, it plays nothing yet
export const PENDING = [{ key: 'credits', label: 'CREDITS', note: 'an NFT station, still pending on theidm.fun' }];

export const DEFAULT_KEY = 'imd-eth';                 // the house's own token
export const GAIN = { min: 0.1, max: 1, step: 0.15, start: 0.6, night: 0.4, boost: 1.5 };
const KEY = 'lcp:radio';

export const station = (key) => STATIONS.find((s) => s.key === key) || null;
export const streamUrl = (key, gain) => `${STREAM}?net=${encodeURIComponent(key)}&gain=${Math.round(gain * 100) / 100}`;

// a station named in words: its ticker, label or key ("imd/eth", "$idm", "infer"); null when none
export function stationByName(text) {
  const t = String(text || '').toLowerCase().replace(/\$/g, '').trim();
  if (!t) return null;
  return STATIONS.find((s) => s.key === t || s.label.toLowerCase() === t || s.ticker.toLowerCase() === t)
    || STATIONS.find((s) => s.words.test(t)) || null;
}

// the station a text is about (a followed job's objective): the first whose words appear; null when none
export function stationFor(text) {
  const t = String(text || '').toLowerCase();
  return STATIONS.find((s) => s.words.test(t)) || null;
}

// the record he likes least: seeded by the seat, never the one playing (a rejection puts it on for a while)
export function sadStation(seed, notKey) {
  const rest = STATIONS.filter((s) => s.key !== notKey);
  return rest[Math.abs(Math.floor(seed * 2654435761)) % rest.length];
}

// state: {on, key, gain}, kept in this browser (store = main.js's localStorage helper or any {get, set} pair)
export class Radio {
  constructor({ store, onChange, doc = typeof document !== 'undefined' ? document : null } = {}) {
    this.doc = doc; this.store = store; this.onChange = onChange || (() => {});
    const saved = (store && store.get(KEY)) || {};
    this.saved = { on: saved.on !== false, key: station(saved.key) ? saved.key : DEFAULT_KEY, gain: clamp(Number(saved.gain) || GAIN.start) };
    this.live = false;            // the frame exists and (as far as the browser allows) plays
    this.armed = false;           // waiting for the visitor's first click or key
    this.night = false; this.boost = false;
    this.temp = null;             // {key, why: 'follow' | 'sad'}: a station put on for a while, the visitor's choice kept
    this.tempOn = null;           // 'records': he put a record on himself while the visitor's radio is off (owner, 2026-10-26)
    this.tempTimer = null;
    this.held = null;             // why the radio is silent for a while (2026-10-28: 'showcase', the swarm's audio plays instead)
    this.tracks = 0;              // finished tracks heard this visit (records on the wall)
    this.frame = null;
  }

  get on() { return this.saved.on; }
  get wanted() { return (this.saved.on || !!this.tempOn) && !this.held; }
  get key() { return (this.temp && this.temp.key) || this.saved.key; }
  get station() { return station(this.key); }
  get gain() { return clamp(this.saved.gain * (this.night ? GAIN.night / GAIN.start : 1) * (this.boost ? GAIN.boost : 1)); }
  get url() { return streamUrl(this.key, this.gain); }
  label() { const s = this.station; return `${s.label} on theidm.fun`; }

  save() { if (this.store) this.store.set(KEY, this.saved); }

  // the browser rule: no sound before the first click or key; with the radio wanted, that first interaction starts it
  armAutostart() {
    if (!this.doc || this.armed || this.live || !this.saved.on) return;
    this.armed = true;
    // the frame starts after the event, not inside it (2026-10-28): built inside the Enter that sends a visitor's first line,
    // it swallowed that line; the click or key still counts as the activation autoplay needs
    const start = () => { this.doc.removeEventListener('pointerdown', start, true); this.doc.removeEventListener('keydown', start, true); this.armed = false; setTimeout(() => this.sync(), 0); };
    this.doc.addEventListener('pointerdown', start, true); this.doc.addEventListener('keydown', start, true);
    this.onChange(this);
  }

  // the frame follows the state (2026-10-25, owner: "the music changes long before he is at the record player"): every
  // change is kept at once, and the frame moves only in sync(), which the house calls when he lifts the arm (brain.js
  // radioEvent's done), at once when nobody walks. The hidden frame of theidm's stream page is created when the radio
  // is on and removed when it is off (hidden, it would keep playing and polling).
  sync() {
    if (!this.doc || this.armed) { this.onChange(this); return; }
    if (!this.wanted) {
      if (this.frame) { this.frame.src = 'about:blank'; this.frame.remove(); this.frame = null; }
      this.live = false; this.onChange(this); return;
    }
    const host = this.doc.getElementById('radio');
    if (!host) return;
    if (!this.frame) {
      const f = this.doc.createElement('iframe');
      f.id = 'radio-frame'; f.className = 'radio-frame'; f.title = 'theidm.fun radio (audio only)';
      f.setAttribute('allow', 'autoplay'); f.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      f.referrerPolicy = 'strict-origin-when-cross-origin'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
      host.append(f); this.frame = f;
    }
    const url = this.url;
    if (this.frame.getAttribute('src') !== url) this.frame.setAttribute('src', url);
    this.live = true;
    this.onChange(this);
  }
  // what the frame plays right now (null: nothing), for the line under the house and the tests
  get playing() { return this.live && this.frame ? (new URL(this.frame.getAttribute('src'), 'https://theidm.fun/').searchParams.get('net')) : null; }

  // his own record (the routine 'records', or 'spin a record'): the music plays while he is at the player even when the
  // visitor's radio is off; it stops when he leaves, or after ms if his routine was cut short
  playFor(why, ms = 14000) {
    clearTimeout(this.tempTimer);
    this.tempOn = why; this.sync();
    this.tempTimer = setTimeout(() => this.stopFor(why), ms);
  }
  stopFor(why) {
    if (this.tempOn !== why) return;
    clearTimeout(this.tempTimer); this.tempOn = null; this.sync();
  }

  // later: the state is kept, the frame waits for sync() (he walks to the record player first); the change is told at once
  // all the same, as tune() tells it (2026-10-27: the frog's menu shows the visitor's choice, not when the music starts)
  setOn(on, later = false) {
    this.saved.on = !!on; this.save();
    if (!later) this.sync(); else this.onChange(this);
  }

  // a station: the visitor's choice (saved), or one put on for a while (temp); true when the station changed
  tune(key, why = null, later = false) {
    if (!station(key)) return false;
    const before = this.key;
    if (why) this.temp = { key, why }; else { this.saved.key = key; this.temp = null; }
    if (!why) this.save();
    if (!later) this.sync(); else this.onChange(this);
    return this.key !== before;
  }

  next(later = false) { const i = STATIONS.findIndex((s) => s.key === this.key); return this.tune(STATIONS[(i + 1) % STATIONS.length].key, null, later); }

  // silent for a while, the visitor's choice kept (the swarm's new audio at the record player, main.js showcase); release
  // gives the station back, true when it was held for that reason
  hold(why) { this.held = why; this.sync(); }
  release(why) {
    if (this.held !== why) return false;
    this.held = null; this.sync();
    return true;
  }

  // back to the visitor's own choice after a temporary station
  restore(why = null, later = false) {
    if (!this.temp || (why && this.temp.why !== why)) return false;
    const before = this.key; this.temp = null;
    if (!later) this.sync(); else this.onChange(this);
    return this.key !== before;
  }

  // the volume is a load parameter of the stream page: a change reloads the frame (a gap of a few seconds)
  volume(delta) {
    this.saved.gain = clamp(this.saved.gain + delta); this.save();
    this.sync();
    return Math.round(this.saved.gain * 100);
  }
  setNight(on) { if (this.night === !!on) return; this.night = !!on; this.sync(); }
  setBoost(on) { if (this.boost === !!on) return; this.boost = !!on; this.sync(); }

  // what the house draws (brain.js state.radio): the sleeves in the record cabinet, the one playing pulled out
  houseState(extra = {}) {
    return { on: this.live, key: this.key, color: this.station.color, label: this.station.label, tracks: this.tracks,
      sleeves: STATIONS.map((s) => ({ key: s.key, color: s.color, current: s.key === this.key })), ...extra };
  }
}

function clamp(g) { return Math.min(GAIN.max, Math.max(GAIN.min, Math.round(g * 100) / 100)); }
