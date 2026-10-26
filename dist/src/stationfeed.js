// What the station plays, read by the house itself (2026-10-25): the pool's Swap logs over a public RPC, the same
// source theidm.fun's stream page reads, so the house can react to what the visitor hears: a note per trade, a whale
// buy or sell (theidm's rule: above ~0.02 x sqrt(FDV in ETH), clamped 0.005..50 ETH), the pulse buys of $IDM's
// treasury, the silence stages (theidm thins the music after 10, 30 and 60 quiet minutes, down to a drone), the tempo
// (theidm maps trade frequency to 72..118 bpm) and, on $IDM, a finished track (the hook's TrackComplete event).
// Pure functions first (tested alone), the poller below. Read-only: eth_blockNumber, eth_getLogs, eth_getBlockByNumber.
export const TOPIC = {
  swapV4: '0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f',      // Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)
  swapV3: '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67',      // Swap(address,address,int256,int256,uint160,uint128,int24)
  trackComplete: '0xe918d0cbbbd8e2fdb52a600fbdc9ae0d933812972c96378bdab88d72bc57087b', // TrackComplete(uint16,uint32,uint8,uint256,uint256,uint32,uint64)
};
export const SILENCE = ['the grid is live', 'ten quiet minutes: the hats and glitches fade', 'half an hour quiet: pad, bass and a soft kick', 'an hour without a trade: drone'];
export const POLL_MS = 20000, RATE_WINDOW_MS = 10 * 60000;

const words = (data) => { const h = String(data || '').replace(/^0x/, ''); const w = []; for (let i = 0; i + 64 <= h.length; i += 64) w.push(h.slice(i, i + 64)); return w; };
const uint = (w) => BigInt('0x' + w);
const sint = (w) => { const v = uint(w); return v >= (1n << 255n) ? v - (1n << 256n) : v; };
const abs = (v) => (v < 0n ? -v : v);
const eth = (wei) => Number(wei) / 1e18;

// theidm's whale line in ETH from the pool's price after the swap: FDV of 1e9 tokens in ETH (their calibration: every
// station is read as 1e9 tokens of 18 decimals; a station quoted in something else carries its quote-per-ETH rate)
export function whaleLine(st, sqrtPriceX96) {
  const p = Number(sqrtPriceX96) / 2 ** 96, price1per0 = p * p;                 // token1 per token0, both 18 decimals
  const quotePerToken = st.pool.ethSide === 0 ? 1 / price1per0 : price1per0;
  const fdvEth = 1e9 * quotePerToken / (st.pool.quotePerEth || 1);
  return Math.min(50, Math.max(0.005, 0.02 * Math.sqrt(fdvEth)));
}

// one Swap log of the station's pool -> {isBuy, quote (in the pool's quote), quoteEth, whale, whaleLine, pulse, tick,
// tx, block, sender}; null when it moves no token or is not this pool's. Trader-side deltas: positive = received.
export function decodeSwap(st, log) {
  const t = log.topics || [], w = words(log.data);
  if (w.length < 5) return null;
  let d0, d1;
  if (st.pool.kind === 'v4') {
    if ((t[0] || '').toLowerCase() !== TOPIC.swapV4 || (t[1] || '').toLowerCase() !== st.pool.id.toLowerCase()) return null;
    d0 = sint(w[0]); d1 = sint(w[1]);
  } else {
    if ((t[0] || '').toLowerCase() !== TOPIC.swapV3) return null;
    d0 = -sint(w[0]); d1 = -sint(w[1]);                                            // v3 reports the pool's side
  }
  const [quoteDelta, tokenDelta] = st.pool.ethSide === 0 ? [d0, d1] : [d1, d0];
  if (tokenDelta === 0n) return null;
  const quote = eth(abs(quoteDelta)), quoteEth = quote / (st.pool.quotePerEth || 1), line = whaleLine(st, uint(w[2]));
  const sender = t[2] ? '0x' + t[2].slice(-40).toLowerCase() : null;
  return { isBuy: tokenDelta > 0n, quote, quoteEth, whaleLine: line, whale: quoteEth >= line, tick: Number(sint(w[4])),
    pulse: !!(st.pool.treasury && sender === st.pool.treasury.toLowerCase()), sender,
    tx: log.transactionHash || null, block: Number(log.blockNumber) };
}

export function silenceStage(msSinceLast) {
  if (msSinceLast == null) return 0;
  const m = msSinceLast / 60000;
  return m >= 60 ? 3 : m >= 30 ? 2 : m >= 10 ? 1 : 0;
}
// theidm maps trade frequency to 72..118 bpm; the house takes swaps in the last ten minutes
export const bpm = (swapsIn10Min) => 72 + Math.min(46, Math.round(swapsIn10Min * 3.8));

const fmt = (n) => (n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(3) : n.toFixed(4)).replace(/\.?0+$/, '');
export const amount = (sw, st) => `${fmt(sw.quote)} ${st.pool.quoteSymbol || 'ETH'}`;

// the poller: start(station) reads the last `lookback` blocks once (the last trade's time, the rate), then every
// POLL_MS the new blocks. Events: {type: 'swap', ...decoded, at}, {type: 'track', trackNo, at}, {type: 'tick', rate,
// bpm, stage, lastAt, sinceMs}, {type: 'error', message} (once per station). fetchFn: for tests.
export class StationFeed {
  constructor(onEvent, fetchFn = (...a) => fetch(...a)) { this.onEvent = onEvent; this.fetch = fetchFn; this.st = null; this.timer = null; this.gen = 0; }

  async rpc(method, params) {
    let err = null;
    for (const url of this.st.rpc) {
      try {
        const r = await this.fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        if (j.error) throw new Error(j.error.message || 'rpc error');
        return j.result;
      } catch (e) { err = e; }
    }
    throw err || new Error('no rpc');
  }

  logs(from, to, address, topics) { return this.rpc('eth_getLogs', [{ fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16), address, topics }]); }
  swapFilter() { const p = this.st.pool; return p.kind === 'v4' ? [TOPIC.swapV4, p.id] : [TOPIC.swapV3]; }

  async start(st) {
    this.stop();
    const gen = ++this.gen;
    this.st = st; this.swaps = []; this.lastAt = null; this.lastBlock = null; this.failed = false;
    try {
      const latest = parseInt(await this.rpc('eth_blockNumber', []), 16);
      const from = Math.max(0, latest - st.lookback);
      const raw = await this.logs(from, latest, st.pool.address, this.swapFilter());
      if (gen !== this.gen) return;
      const found = raw.map((l) => decodeSwap(st, l)).filter(Boolean);
      if (found.length) {
        const last = found[found.length - 1];
        const blk = await this.rpc('eth_getBlockByNumber', ['0x' + last.block.toString(16), false]);
        if (gen !== this.gen) return;
        const lastAt = parseInt(blk.timestamp, 16) * 1000;
        this.lastAt = lastAt;
        // older swaps in the window: their time from the block distance (good enough for a rate)
        this.swaps = found.map((s) => lastAt - (last.block - s.block) * st.blockSeconds * 1000);
      }
      this.lastBlock = latest;
      this.tick();
      this.timer = setInterval(() => this.poll(gen), POLL_MS);
    } catch (e) {
      if (gen === this.gen) this.fail(e);
    }
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; this.gen++; }

  fail(e) { if (this.failed) return; this.failed = true; this.onEvent({ type: 'error', message: (e && e.message) || String(e) }); }

  async poll(gen) {
    if (gen !== this.gen) return;
    try {
      const latest = parseInt(await this.rpc('eth_blockNumber', []), 16);
      if (gen !== this.gen || latest <= this.lastBlock) { this.tick(); return; }
      const from = this.lastBlock + 1, p = this.st.pool, now = Date.now();
      const raw = await this.logs(from, latest, p.address, this.swapFilter());
      if (gen !== this.gen) return;
      for (const l of raw) {
        const sw = decodeSwap(this.st, l);
        if (!sw) continue;
        this.swaps.push(now); this.lastAt = now;
        this.onEvent({ type: 'swap', ...sw, at: now });
      }
      if (p.hook) {
        const tc = await this.logs(from, latest, p.hook, [TOPIC.trackComplete]);
        if (gen !== this.gen) return;
        for (const l of tc) this.onEvent({ type: 'track', trackNo: parseInt(l.topics[1], 16), at: now });
      }
      this.lastBlock = latest; this.failed = false;
      this.tick();
    } catch (e) { this.fail(e); }
  }

  tick() {
    const now = Date.now();
    this.swaps = this.swaps.filter((t) => now - t < RATE_WINDOW_MS);
    const sinceMs = this.lastAt == null ? null : now - this.lastAt;
    this.onEvent({ type: 'tick', rate: this.swaps.length, bpm: bpm(this.swaps.length), stage: silenceStage(sinceMs), lastAt: this.lastAt, sinceMs });
  }
}
