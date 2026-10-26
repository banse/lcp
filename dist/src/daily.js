// The IMD Daily (2026-10-26, the owner: asked for IMD or swarm news he picks up the newspaper and reads it; a click on him
// opens today's issue). The Daily is a swarm-made newspaper: ERC-1155 editions on Ethereum (collection below, MIT repo
// identity-md-launches/launch-2368-the-imd-daily), each issue a PDF with a cover, free to read, a copy collectable for
// 0.1 IMD in a 24-hour window. Its site refuses frames (frame-ancestors 'none'), so the house reads what is open: the
// collection (issueCount, uri, issueStatus over a public RPC), the issue's metadata JSON, its PDF (pdf.js in news.js) and
// the publisher's summaries API; all answer with CORS * (measured 2026-10-26). Read-only, nothing signed.
export const DAILY = {
  site: 'https://the-imd-daily-free-to-read-colle.sites.imd.fun/',
  api: 'https://the-imd-daily.duckdns.org',                            // the publisher's files and summaries (service.json)
  collection: '0xb8fd2b7fb37cbf03a26b4c4688ed5cce86c0a9c5',            // IMDDaily, Ethereum mainnet, from block 26239377
  rpc: ['https://ethereum-rpc.publicnode.com', 'https://mainnet.gateway.tenderly.co'],
};
export const SEL = { issueCount: '0x98cf147a', uri: '0x0e89341c', issueStatus: '0x79b3bf75' };
const CACHE_MS = 10 * 60000;
let cache = null;                                                     // {at, issue}

const hex = (h) => String(h || '').replace(/^0x/, '');
const word = (h, i) => hex(h).slice(i * 64, i * 64 + 64);
const num = (w) => parseInt(w || '0', 16);
export const pad32 = (n) => BigInt(n).toString(16).padStart(64, '0');

// an ABI-encoded string return value
export function decodeString(data) {
  const h = hex(data);
  if (h.length < 128) return '';
  const off = num(h.slice(0, 64)) * 2, len = num(h.slice(off, off + 64));
  const bytes = h.slice(off + 64, off + 64 + len * 2);
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) u8[i] = parseInt(bytes.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(u8);
}
// issueStatus(id) -> (supply, publishedAt, closesAt, price, available)
export function decodeIssueStatus(data) {
  if (hex(data).length < 320) return null;
  return { supply: num(word(data, 0)), publishedAt: num(word(data, 1)) * 1000, closesAt: num(word(data, 2)) * 1000,
    price: Number(BigInt('0x' + word(data, 3))) / 1e18, available: num(word(data, 4)) === 1 };
}

async function call(fetchFn, data) {
  let err = null;
  for (const url of DAILY.rpc) {
    try {
      const r = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: DAILY.collection, data }, 'latest'] }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || 'rpc error');
      return j.result;
    } catch (e) { err = e; }
  }
  throw err || new Error('no rpc');
}

const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// the newest issue: id, title, date (editorial, YYYY-MM-DD), isToday (UTC), pdf, cover, summary, closesAt, available,
// price (IMD). Cached ten minutes. Throws when the collection cannot be read; summary and status are optional.
export async function latestIssue(fetchFn = (...a) => fetch(...a), now = Date.now()) {
  if (cache && now - cache.at < CACHE_MS) return cache.issue;
  const count = num(word(await call(fetchFn, SEL.issueCount), 0));
  if (!count) throw new Error('no issue published yet');
  const uri = decodeString(await call(fetchFn, SEL.uri + pad32(count)));
  const meta = await (await fetchFn(uri, { credentials: 'omit' })).json();
  const p = meta.properties || {};
  const issue = { id: count, title: String(meta.name || `The IMD Daily No. ${count}`).replace(/\s+/g, ' ').trim(),
    date: p.editorial_date || null, isToday: p.editorial_date === utcDay(now),
    pdf: p.pdf_url || meta.external_url || null, cover: meta.image || null, pdfHash: p.pdf_sha256 || null, uri,
    summary: null, closesAt: null, available: null, price: null };
  try {
    const st = decodeIssueStatus(await call(fetchFn, SEL.issueStatus + pad32(count)));
    if (st) Object.assign(issue, { closesAt: st.closesAt, available: st.available, price: st.price });
  } catch (e) { /* the status is a nicety */ }
  try {
    const s = (await (await fetchFn(DAILY.api + '/api/summaries', { credentials: 'omit', cache: 'no-store' })).json()).summaries || {};
    const mine = issue.pdfHash && s[issue.pdfHash];
    if (mine && typeof mine.summary === 'string') issue.summary = mine.summary.trim();
  } catch (e) { /* no summary: he reads the title */ }
  cache = { at: now, issue };
  return issue;
}
export const forgetIssue = () => { cache = null; };

// the paper's own lines (drawn on the sheet he holds, imd.js bigPaper): the issue's date as printed, the headline from the
// publisher's summary (the pages are images, so the PDF carries no text): the first paragraph that is not the "back with
// Issue #n" opener, its first sentence, no emoji, at most 72 characters
export function prettyDate(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
  if (!m) return d || '';
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
export function headlineOf(issue) {
  const paras = (issue.summary || '').split(/\n+/).map((x) => x.replace(/[^\x20-\x7E\u00A0-\u024F\u2010-\u2027]/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const pick = paras.find((p) => !/^the imd daily\b/i.test(p) && !/\bissue\s*#?\d+\s*!?$/i.test(p)) || paras[0] || '';
  let h = (pick.match(/^.*?[.!?](?=\s|$)/) || [pick])[0].trim();
  if (h.length > 72) h = h.slice(0, 69).replace(/\s+\S*$/, '') + '…';
  return h || issue.title || '';
}
// what he says after reading: short, the paper itself carries number, date and headline
export function issueLine(issue) {
  return `${issue.isToday ? 'Today\'s paper' : issue.date ? `The latest paper, from ${prettyDate(issue.date)}` : 'The latest paper'}. Click me and read along.`;
}
// what the drawn paper shows (brain state.news)
export const paperLines = (issue) => ({ no: issue.id, date: prettyDate(issue.date), headline: headlineOf(issue) });
