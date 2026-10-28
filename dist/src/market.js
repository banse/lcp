// A token's market for the command line (owner, 2026-10-24; launch panel Task 5, 2026-10-26). A token the swarm launched,
// and IMD (the house's token), is read in its own Uniswap v4 pool by our server (/proxy/panels/token, selfhost/pools.py),
// never the deepest one, since launches attract fee-trap pools; the column shows that pool in our token panel
// (panels/?view=token). Everything else: the price from DexScreener, the chart on defined.fi (with the owner's referral
// code) in a new tab. No swaps (owner, 2026-10-26: "vergiss die swap funktion erstmal wieder"): buy and sell answers give
// the defined.fi link; the LlamaSwap frame and its links are gone. The swarm-hosted build has no relay: there a launch is
// read on DexScreener in its launch pool (data/launch-pools.json) and every page is a link, as before.
// Measured 2026-10-24 from a 127.0.0.1 page: DexScreener's API sends CORS *, finds the chain from the address alone and
// agreed with defined.fi; GeckoTerminal names IMD "Vibe Coins / VIBE", so not that. Only 0x addresses: the parser
// lowercases what the visitor types.

import { RELAY, proxyUrl } from './env.js';

export const IMD_CA = '0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7';     // IMD on Ethereum (BridgedFP, LayerZero OFT)
export const IMD_POOL = '0x415829f72e9f54531c26eae76f107618540e898a45d6ae35959e143f5faca704';   // its IMD/ETH v4 pool (radio.js)
export const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';         // ETH by its ticker (owner, 2026-10-24)
export const DEFINED_REF = 'UF1R0';
const DEXSCREENER = 'https://api.dexscreener.com/latest/dex/tokens/';

// DexScreener chain id -> its name and defined.fi's (each pair checked on 2026-10-24)
export const CHAINS = {
  ethereum: { name: 'Ethereum', defined: 'eth', coin: 'ETH' },
  base: { name: 'Base', defined: 'base', coin: 'ETH' },
  arbitrum: { name: 'Arbitrum', defined: 'arbitrum', coin: 'ETH' },
  bsc: { name: 'BNB Chain', defined: 'bsc', coin: 'BNB' },
  robinhood: { name: 'Robinhood Chain', defined: 'robinhood', coin: 'ETH' },
};
export const CHAIN_OF_ID = { 1: 'ethereum', 8453: 'base', 4663: 'robinhood' };      // a launch record's chainId

// the only pages he opens in a new tab for a token (main.js newTab): defined.fi with the ref code
export const DEFINED_URL = /^https:\/\/www\.defined\.fi\/token\/(eth|base|arbitrum|bsc|robinhood)\/0x[0-9a-f]{40}(\/0x[0-9a-f]{64})?\?ref=UF1R0$/;

// poolId: show that pool (a launch's own); defined.fi falls back to the token page while it does not know the pool yet
export function chartUrl(ca, chainId, poolId = null) {
  const c = CHAINS[chainId];
  return c ? `https://www.defined.fi/token/${c.defined}/${ca}${poolId ? '/' + poolId : ''}?ref=${DEFINED_REF}` : null;
}

// the token's deepest pool where it is the base token (its price is the token's), on any chain
export function pickPair(pairs, ca) {
  const mine = (pairs || []).filter((p) => p && p.baseToken && String(p.baseToken.address).toLowerCase() === ca && p.priceUsd);
  return mine.sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0))[0] || null;
}

// the swarm's launch of this token: {launchNumber, chainId, pool: {id}} or null. Local through the relay (fresh); hosted
// from data/launch-pools.json, which tools/export.py writes into dist/ ({token: [launchNumber, chainId, poolId]}): a
// launch newer than the export is missing there and reads the deepest pool until the next export
let poolTable = null;
export async function launchOf(ca, fetchImpl = fetch, relay = RELAY) {
  try {
    if (relay) {
      const r = await fetchImpl(proxyUrl('/proxy/launches/token/' + ca), { cache: 'no-store' });
      return r.ok ? (await r.json()).launch || null : null;
    }
    poolTable = poolTable || fetchImpl('data/launch-pools.json').then((r) => (r.ok ? r.json() : { launches: {} }));
    const row = ((await poolTable).launches || {})[ca];
    return row ? { launchNumber: row[0], chainId: row[1], pool: { id: row[2] } } : null;
  } catch (e) { poolTable = null; return null; }
}

// DexScreener, for a non-launch (and for every token in the swarm build, which has no pool reader). launch: launchOf().
// {ca, chainId, symbol, name, price, change24, liquidity, mcap, dex, pairUrl, launch, poolId}; a
// launch whose pool DexScreener does not list yet: {ca, chainId, launch, poolId, noPool: true}; {ca, missing: true}
// (no pool and not a launch); {ca, error} (DexScreener did not answer; a launch still has its chain and pool)
export async function quote(ca, fetchImpl = fetch, launch = null) {
  const chainId = launch ? CHAIN_OF_ID[launch.chainId] || null : null, poolId = launch ? launch.pool.id : null;
  const known = launch ? { ca, chainId, launch, poolId } : { ca };
  try {
    const r = await fetchImpl(DEXSCREENER + ca, { cache: 'no-store' });
    if (!r.ok) return { ...known, error: 'DexScreener answered ' + r.status };
    const pairs = (await r.json()).pairs || [];
    const p = launch ? pairs.find((x) => String(x.pairAddress).toLowerCase() === poolId && x.priceUsd) || null : pickPair(pairs, ca);
    if (!p) return launch ? { ...known, noPool: true } : { ca, missing: true };
    const base = String(p.baseToken.address).toLowerCase() === ca;
    return { ...known, chainId: chainId || p.chainId, symbol: (base ? p.baseToken.symbol : p.quoteToken.symbol) || '?',
      name: (base ? p.baseToken.name : p.quoteToken.name) || '',
      price: base ? Number(p.priceUsd) : Number(p.priceUsd) / Number(p.priceNative),
      change24: base && p.priceChange && p.priceChange.h24 != null ? Number(p.priceChange.h24) : null,
      liquidity: p.liquidity && p.liquidity.usd, mcap: base ? p.marketCap || p.fdv || null : null, dex: p.dexId, pairUrl: p.url };
  } catch (e) { return { ...known, error: 'DexScreener did not answer' }; }
}

// $3.88, $2,300.33, $0.50, $0.0001234, $0.0000001234, $16.2M (four digits that count below $1, never 1.2e-7)
export function usd(n) {
  if (n == null || !Number.isFinite(Number(n))) return '?';
  n = Number(n);
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return '$' + (n / 1e3).toFixed(1) + 'K';
  if (n >= 1 || n <= 0) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fixed = n.toFixed(Math.min(20, 3 - Math.floor(Math.log10(n)))).replace(/0+$/, '');
  return '$' + (fixed.split('.')[1].length < 2 ? n.toFixed(2) : fixed);
}

// A launch's (or IMD's) own pool as our server reads it (/proxy/panels/token, selfhost/pools.py `token`), the same answer
// the token panel shows, so his spoken price and the panel agree. null: not a launch (the server's 404); {ca, error}: the
// server did not answer; {..., noPool: true}: a launch without a readable pool (no seeded pool: treated as a non-launch).
// Else {ca, chain (CHAINS key), chainId, kind: 'launch'|'house', launchNumber, symbol, name, pair (its symbol), poolId,
// price: {paired, usd}, liquidity: {token, paired, usd}, volume24h: {paired, usd, swaps}, indexing, problem}; each number
// a finite number or null.
const fin = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const txt = (x, n = 32) => (typeof x === 'string' && x ? x.slice(0, n) : null);
export async function poolQuote(ca, fetchImpl = fetch) {
  let d;
  try {
    const r = await fetchImpl(proxyUrl('/proxy/panels/token?ca=' + ca), { cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) return { ca, error: 'the pool reader answered ' + r.status };
    d = await r.json();
  } catch (e) { return { ca, error: 'the pool reader did not answer' }; }
  if (!d || typeof d !== 'object' || String(d.ca || '').toLowerCase() !== ca || !d.price || typeof d.price !== 'object') return { ca, error: 'the pool reader answered nonsense' };
  const l = d.liquidity || {}, v = d.volume24h || {};
  const out = { ca, chain: CHAIN_OF_ID[d.chainId] || null, chainId: Number(d.chainId) || null, kind: d.kind === 'house' ? 'house' : 'launch',
    launchNumber: Number.isInteger(d.launchNumber) ? d.launchNumber : null, symbol: txt(d.symbol), name: txt(d.name, 64),
    pair: txt(d.pair && d.pair.symbol), poolId: /^0x[0-9a-f]{64}$/.test(String(d.poolId || '')) ? d.poolId : null,
    price: { paired: fin(d.price.paired), usd: fin(d.price.usd) },
    liquidity: { token: fin(l.token), paired: fin(l.paired), usd: fin(l.usd) },
    volume24h: { paired: fin(v.paired), usd: fin(v.usd), swaps: Number.isInteger(v.swaps) ? v.swaps : null },
    indexing: d.indexing && typeof d.indexing === 'object' ? d.indexing : null, problem: txt(d.problem, 120) };
  if (out.problem && out.price.paired == null) out.noPool = true;
  return out;
}

// The token panel's numbers (panels/panels.js `num`, the same rules, kept here because the swarm build has no panels/):
// four significant digits; at 1,000 and up whole and grouped (8,621), at a million "90.71 M"; below 0.001 the explorers'
// subscript-zero form, the subscript counting the zeros after "0.": 0.0000283 -> 0.0₄283.
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const trimZeros = (t) => (t.includes('.') ? t.replace(/0+$/, '').replace(/\.$/, '') : t);
export function poolNum(x, sig = 4) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return '–';
  if (x === 0) return '0';
  const sign = x < 0 ? '-' : '', a = Math.abs(x);
  if (a >= 1e9) return `${sign}${trimZeros((a / 1e9).toFixed(2))} B`;
  if (a >= 1e6) return `${sign}${trimZeros((a / 1e6).toFixed(2))} M`;
  if (a >= 1000) return sign + Math.round(a).toLocaleString('en-US');
  if (a >= 0.001) return sign + trimZeros(Number(a.toPrecision(sig)).toFixed(Math.max(0, sig - 1 - Math.floor(Math.log10(a)))));
  const [m, e] = a.toExponential(sig - 1).split('e');
  const zeros = -Number(e) - 1;
  if (zeros < 3) return sign + trimZeros(Number(a.toPrecision(sig)).toFixed(zeros + sig));
  return `${sign}0.0${[...String(zeros)].map((d) => SUB[d]).join('')}${m.replace('.', '').replace(/0+$/, '') || '0'}`;
}
