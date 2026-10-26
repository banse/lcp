// The station behind the panel over the piano (2026-10-26, the owner: "if I click on it it should show details about that
// station in a popup"): a popup over the house with the station's facts (token, chain, pool, hook), the hook's live state
// drawn large (the 4 x 16 pattern and the bass line, the console's numbers: bpm, swap #, page, epoch, track #, heat) and
// what the house itself reads from the pool (trades in the last 10 minutes, the silence stage, the last trade). Key and
// mode stay out: theidm's console shows its synth's reading of the same state (C min for the hook's root 5 / mode 2 on
// 2026-10-26), and the genre is their choice for the epoch; both are theirs to show.
import { SILENCE } from './stationfeed.js';
import { SITE as THEIDM } from './radio.js';

const $ = (id) => document.getElementById(id);
const short = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');
const ROWS = ['KCK', 'SNR', 'HAT', 'GLT', 'BAS'];

// how long ago, in words
export function ago(ms) {
  if (ms == null) return 'no trade seen yet';
  if (ms < 60000) return 'the last trade just now';
  if (ms < 3600000) return `the last trade ${Math.round(ms / 60000)} min ago`;
  return `the last trade ${Math.round(ms / 3600000)} h ago`;
}

// the popup's content, pure: station (radio.js STATIONS), grid (stationfeed.js grid event or null), feed {rate, stage, lastAt}
export function stationFacts(st, grid, feed = {}, now = Date.now()) {
  const hooked = !!(st.pool && st.pool.hook);
  const pool = st.pool.kind === 'v4'
    ? (hooked ? `a Uniswap v4 pool with the ${st.label} hook ${short(st.pool.hook)}: the sequencer lives onchain, every swap mutates it` : 'a Uniswap v4 pool without a hook: theidm\'s rules run in the browser from its swaps')
    : 'a Uniswap v3 pool without a hook: theidm\'s rules run in the browser from its swaps';
  const rate = feed.rate == null ? null : feed.rate;
  const reading = [
    rate == null ? 'the house has not read the pool yet' : `${rate} trade${rate === 1 ? '' : 's'} in the last 10 min`,
    feed.lastAt == null ? ago(null) : ago(now - feed.lastAt),
    feed.stage ? SILENCE[feed.stage] : null,
  ].filter(Boolean).join(' · ');
  return {
    title: st.label, ticker: st.ticker, chain: st.chain, chainId: st.chainId,
    meta: `${st.ticker} on ${st.chain}${st.house ? ' · a house station of theidm.fun' : ''} · token ${short(st.token)}`,
    pool, hooked, token: st.token, hook: st.pool.hook || null,
    listen: `${THEIDM}?net=${encodeURIComponent(st.key)}`,
    explorer: st.explorer ? `${st.explorer}/address/${st.token}` : null,
    numbers: grid ? [['BPM', String(grid.bpm)], ['Swap #', String(grid.swaps)], ['Page', String(grid.page)], ['Epoch', String(Math.floor(grid.page / 4))], ['Track #', String(grid.track)], ['Heat', `${String(grid.heat).padStart(2, '0')}/16`]] : [],
    reading,
  };
}

export class StationPop {
  constructor() {
    this.grid = null; this.color = '#38d050'; this.timer = null;
    $('station-close').addEventListener('click', () => this.close());
    $('station-pop').addEventListener('click', (e) => { if (e.target === $('station-pop')) this.close(); });
    document.addEventListener('keydown', (e) => { if (!$('station-pop').hidden && e.key === 'Escape') this.close(); });
  }

  get open_() { return !$('station-pop').hidden; }

  open(st, grid, feed) {
    this.st = st; this.color = st.color || this.color;
    this.fill(st, grid, feed);
    $('station-pop').hidden = false;
    clearInterval(this.timer); this.timer = setInterval(() => this.draw(), 120);   // the running step
    $('station-close').focus();
  }

  // a newer grid or reading while it is open
  update(grid, feed) { if (this.open_) this.fill(this.st, grid, feed); }

  fill(st, grid, feed) {
    const f = stationFacts(st, grid, feed);
    this.grid = grid;
    $('station-head').textContent = f.title; $('station-meta').textContent = f.meta;
    $('station-pool').textContent = `Pool: ${f.pool}.`;
    $('station-reading').textContent = `Read by the house: ${f.reading}.`;
    const dl = $('station-numbers'); dl.replaceChildren();
    for (const [k, v] of f.numbers) { const d = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; d.append(dt, dd); dl.append(d); }
    dl.hidden = !f.numbers.length;
    $('station-listen').href = f.listen;
    const ex = $('station-explorer'); ex.hidden = !f.explorer; if (f.explorer) ex.href = f.explorer;
    $('station-grid').hidden = !grid;
    this.draw();
  }

  // the pattern large: the console's four tracks and the bass line in the station's colour
  draw() {
    const c = $('station-grid'), grid = this.grid;
    if (!grid || c.hidden) return;
    const pitch = 24, cell = 18, left = 44, top = 10, w = left + 16 * pitch + 6, h = top + 5 * pitch + 8, k = 2;
    if (c.width !== w * k) { c.width = w * k; c.height = h * k; }
    const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0);
    g.fillStyle = '#040804'; g.fillRect(0, 0, w, h);
    g.font = '600 10px "IBM Plex Mono", ui-monospace, Menlo, monospace'; g.textBaseline = 'middle';
    const step = Math.floor(Date.now() / (60000 / (grid.bpm || 96) / 4)) % 16;
    for (let r = 0; r < 5; r++) {
      const y = top + r * pitch;
      g.globalAlpha = 0.7; g.fillStyle = this.color; g.fillText(ROWS[r], 8, y + cell / 2);
      for (let i = 0; i < 16; i++) {
        const x = left + i * pitch;
        if (r < 4) { g.globalAlpha = grid.rows[r][i] ? 1 : 0.22; g.fillRect(x, y, cell, cell); }
        else { const v = grid.bass[i]; g.globalAlpha = v ? 0.85 : 0.22; const bh = v ? 3 + (v / 15) * (cell - 3) : 2; g.fillRect(x, y + cell - bh, cell, bh); }
        if (i === step) { g.globalAlpha = 0.9; g.fillRect(x, top - 6, cell, 2); }
      }
    }
    g.globalAlpha = 1;
  }

  close() { $('station-pop').hidden = true; clearInterval(this.timer); this.timer = null; const c = document.getElementById('game'); if (c) c.focus(); }
}
