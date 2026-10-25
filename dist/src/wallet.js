// Read-only wallet: find the browser wallets (EIP-6963, then window.ethereum), ask for the address, never sign.
export const IDMD = '0x0000eC93127BAA929E58E97dd0095A2BFb38ec1D';
const providers = new Map();

window.addEventListener('eip6963:announceProvider', (e) => {
  const d = e.detail;
  if (d && d.info && d.provider) providers.set(d.info.uuid, d);
});
window.dispatchEvent(new Event('eip6963:requestProvider'));

export function wallets() {
  const list = [...providers.values()];
  if (!list.length && window.ethereum) list.push({ info: { uuid: 'injected', name: 'Browser wallet', icon: '' }, provider: window.ethereum });
  return list;
}

export async function connect(w) {
  const accounts = await w.provider.request({ method: 'eth_requestAccounts' });
  const chainId = await w.provider.request({ method: 'eth_chainId' });
  return { address: (accounts[0] || '').toLowerCase(), chainId, provider: w.provider, name: w.info.name };
}

// seats whose owner in the /swarm list is this address, each confirmed with ownerOf(i) on mainnet
export async function seatsOf(conn, owners) {
  const ids = [];
  owners.forEach((o, i) => { if (o && o.toLowerCase() === conn.address) ids.push(i); });
  if (conn.chainId !== '0x1') return { ids, confirmed: false };
  const out = [];
  for (const id of ids) {
    try {
      const data = '0x6352211e' + id.toString(16).padStart(64, '0');
      const res = await conn.provider.request({ method: 'eth_call', params: [{ to: IDMD, data }, 'latest'] });
      if (('0x' + res.slice(-40)).toLowerCase() === conn.address) out.push(id);
    } catch (e) { out.push(id); }
  }
  return { ids: out, confirmed: true };
}
