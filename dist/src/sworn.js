// The Sworn card over the fireplace (2026-10-26, the owner: "add a sworn card above the fireplace but only for agents
// connected to a wallet holding a sworn card, colors should stay house / imd aligned, but filled hives (grey) should
// match the actual wallet facts"). Sworn is an ownerless registry on Ethereum (swarm launch #2404, repo banse/sworn):
// one card per wallet, 25 catalog facts in 13 families, each family a cell of the card's hive, filled to the tier the
// wallet holds. The house reads the seat owner's card over a public RPC (tokenOf, traitsOf; read-only) and draws the
// hive in the house's greys at the real card's layout (measured from tokenURI of cards #1..#11 on 2026-10-26).
export const SWORN = {
  registry: '0x0da2679000ea5380d1361cc3cca7d4e8c881f766',
  site: 'https://sworn.vibingco.de/',            // the owner's copy (2026-10-27), as Pepe's links
  rpc: ['https://ethereum-rpc.publicnode.com', 'https://mainnet.gateway.tenderly.co'],
};
export const SEL = { tokenOf: '0x42ec38e2', traitsOf: '0xc26b340e', hasTrait: '0xb75a3e4e' };
// the 13 families (trait id / 100) in the hive's slots: the Renderer's layout (slot 0 Swarmed in the centre, 1..5
// Spawned..Benchmarked around it, the rest outside), centres in the card's 1000 x 1000 box, tiers per family
export const FAMILIES = [
  { fam: 6, name: 'Swarmed', x: 500, y: 480, tiers: 1 },
  { fam: 1, name: 'Spawned', x: 500, y: 313.7, tiers: 1 },
  { fam: 2, name: 'Zero-Shot', x: 644, y: 396.9, tiers: 2 },
  { fam: 3, name: 'Hopper', x: 644, y: 563.1, tiers: 3 },
  { fam: 4, name: 'Bullfrog', x: 500, y: 646.3, tiers: 4 },
  { fam: 5, name: 'Benchmarked', x: 356, y: 563.1, tiers: 3 },
  { fam: 7, name: 'Uptime', x: 356, y: 396.9, tiers: 1 },
  { fam: 8, name: 'Holdout', x: 644, y: 230.6, tiers: 1 },
  { fam: 9, name: 'Final Token', x: 788, y: 480, tiers: 1 },
  { fam: 10, name: 'Hotfix', x: 644, y: 729.4, tiers: 1 },
  { fam: 11, name: 'PID', x: 356, y: 729.4, tiers: 1 },          // ordinals: one level, whatever the id
  { fam: 12, name: 'Top Weights', x: 212, y: 480, tiers: 1 },
  { fam: 13, name: 'Pretrained', x: 356, y: 230.6, tiers: 1 },
];
const CACHE_MS = 10 * 60000;
const cache = new Map();                                            // wallet -> {at, card}

const hex = (h) => String(h || '').replace(/^0x/, '');
const num = (w) => parseInt(w || '0', 16);
export const padAddr = (a) => hex(a).toLowerCase().padStart(64, '0');

// uint16[] return value -> numbers
export function decodeUint16Array(data) {
  const h = hex(data);
  if (h.length < 128) return [];
  const off = num(h.slice(0, 64)) * 2, len = num(h.slice(off, off + 64)), out = [];
  for (let i = 0; i < len; i++) out.push(num(h.slice(off + 64 + i * 64, off + 128 + i * 64)));
  return out;
}

// the hive from a wallet's trait ids: per slot the level held (0 = none) and the family's tiers
export function hive(traits) {
  return FAMILIES.map((f) => {
    const mine = traits.filter((t) => Math.floor(t / 100) === f.fam);
    let level = 0;
    if (mine.length) level = f.tiers === 1 ? 1 : Math.max(1, Math.min(f.tiers, Math.max(...mine.map((t) => t % 100))));
    return { fam: f.fam, name: f.name, x: f.x, y: f.y, tiers: f.tiers, level };
  });
}

async function call(fetchFn, data) {
  let err = null;
  for (const url of SWORN.rpc) {
    try {
      const r = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: SWORN.registry, data }, 'latest'] }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || 'rpc error');
      return j.result;
    } catch (e) { err = e; }
  }
  throw err || new Error('no rpc');
}

// the wallet's card: {tokenId, traits, cells (hive), lit (count)} or null when it holds none; cached ten minutes
export async function cardOf(wallet, fetchFn = (...a) => fetch(...a), now = Date.now()) {
  const w = String(wallet || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(w)) return null;
  const hit = cache.get(w);
  if (hit && now - hit.at < CACHE_MS) return hit.card;
  const tokenId = num(hex(await call(fetchFn, SEL.tokenOf + padAddr(w))));
  let card = null;
  if (tokenId > 0) {
    const traits = decodeUint16Array(await call(fetchFn, SEL.traitsOf + padAddr(w)));
    const cells = hive(traits);
    card = { tokenId, wallet: w, traits, cells, lit: cells.filter((c) => c.level > 0).length };
  }
  cache.set(w, { at: now, card });
  return card;
}
export const forgetCards = () => cache.clear();
export const explorerUrl = (wallet) => SWORN.site + '#/explorer?address=' + wallet;
