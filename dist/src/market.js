// A token's market for the command line (owner, 2026-10-24): price from DexScreener, the chart on defined.fi (with the
// owner's referral code), buy and sell on LlamaSwap. A token the swarm launched is read in its launch's own Uniswap v4
// pool (relay /proxy/launches/token/<ca>: the pool key and id), never the deepest one, since launches attract fee-trap
// pools; the chart opens even when DexScreener has no pool (owner, 2026-10-24). Measured 2026-10-24 from a 127.0.0.1
// page: DexScreener's API sends CORS *, finds the chain from the address alone and agreed with defined.fi; defined.fi
// and LlamaSwap may be framed (KyberSwap, Uniswap, 1inch, Jumper and Matcha may not); GeckoTerminal names IMD
// "Vibe Coins / VIBE", so not that. Only 0x addresses: the parser lowercases what the visitor types, and LlamaSwap is
// EVM only.

import { RELAY } from './env.js';

export const IMD_CA = '0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7';     // IMD on Ethereum (BridgedFP, LayerZero OFT)
export const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';         // ETH by its ticker (owner, 2026-10-24)
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';                // what ETH is bought with and sold for
export const DEFINED_REF = 'UF1R0';
const NATIVE = '0x0000000000000000000000000000000000000000';            // LlamaSwap's word for the chain's own coin
const DEXSCREENER = 'https://api.dexscreener.com/latest/dex/tokens/';

// DexScreener chain id -> its name, defined.fi's and LlamaSwap's (each pair checked on 2026-10-24; LlamaSwap has no
// Robinhood Chain)
export const CHAINS = {
  ethereum: { name: 'Ethereum', defined: 'eth', llama: 'ethereum', coin: 'ETH' },
  base: { name: 'Base', defined: 'base', llama: 'base', coin: 'ETH' },
  arbitrum: { name: 'Arbitrum', defined: 'arbitrum', llama: 'arbitrum', coin: 'ETH' },
  bsc: { name: 'BNB Chain', defined: 'bsc', llama: 'bsc', coin: 'BNB' },
  robinhood: { name: 'Robinhood Chain', defined: 'robinhood', llama: null, coin: 'ETH' },
};
const CHAIN_OF_ID = { 1: 'ethereum', 8453: 'base', 4663: 'robinhood' };      // a launch record's chainId

// the pages the side-by-side page agrees to show beside the house; it checks the same shapes
export const DEFINED_URL = /^https:\/\/www\.defined\.fi\/token\/(eth|base|arbitrum|bsc|robinhood)\/0x[0-9a-f]{40}(\/0x[0-9a-f]{64})?\?ref=UF1R0$/;
export const LLAMA_URL = /^https:\/\/swap\.defillama\.com\/\?chain=(ethereum|base|arbitrum|bsc)&from=0x[0-9a-f]{40}&tab=swap&to=0x[0-9a-f]{40}$/;

// poolId: show that pool (a launch's own); defined.fi falls back to the token page while it does not know the pool yet
export function chartUrl(ca, chainId, poolId = null) {
  const c = CHAINS[chainId];
  return c ? `https://www.defined.fi/token/${c.defined}/${ca}${poolId ? '/' + poolId : ''}?ref=${DEFINED_REF}` : null;
}

// buy: the chain's coin -> the token; sell: the token -> the coin; ETH itself (WETH): USDC -> ETH and back, on Ethereum
export function swapUrl(ca, chainId, act) {
  const c = CHAINS[chainId];
  if (!c || !c.llama) return null;
  const [from, to] = ca === WETH ? (act === 'sell' ? [NATIVE, USDC] : [USDC, NATIVE]) : act === 'sell' ? [ca, NATIVE] : [NATIVE, ca];
  return `https://swap.defillama.com/?chain=${c.llama}&from=${from}&tab=swap&to=${to}`;
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
      const r = await fetchImpl('/proxy/launches/token/' + ca, { cache: 'no-store' });
      return r.ok ? (await r.json()).launch || null : null;
    }
    poolTable = poolTable || fetchImpl('data/launch-pools.json').then((r) => (r.ok ? r.json() : { launches: {} }));
    const row = ((await poolTable).launches || {})[ca];
    return row ? { launchNumber: row[0], chainId: row[1], pool: { id: row[2] } } : null;
  } catch (e) { poolTable = null; return null; }
}

// launch: launchOf(). {ca, chainId, symbol, name, price, change24, liquidity, mcap, dex, pairUrl, launch, poolId}; a
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
