// The community's list of what is built on IMD (2026-10-29, owner: "if someone asks pepe about "awesome imd" projects "awesome imd"
// can be the trigger. he should show all projects with links in a popup listed in this readme"): github.com/Identity-md/awesome-imd,
// its README.md read in the visitor's browser (raw.githubusercontent.com sends Access-Control-Allow-Origin: *, measured 2026-10-29),
// cut into its sections and entries. The text is someone else's: it is shown as text, and a link only when it is http(s).

export const AWESOME_REPO = 'https://github.com/Identity-md/awesome-imd';
export const AWESOME_RAW = 'https://raw.githubusercontent.com/Identity-md/awesome-imd/main/README.md';
const MAX_BYTES = 256 * 1024, MAX_ITEMS = 300;
const SKIP = /^(?:contributing|contribute|how to contribute|license)\b/i;      // the sections that are no projects
const LEAD = /^[^\p{L}\p{N}[*`]+/u;                                         // the emoji and marks before a title or an entry
const href = (u) => (/^https?:\/\/[^\s<>"']+$/i.test(u) ? u : null);

// "[text](url)", "**bold**", "`code`" -> [{text, href} | {text, code: true} | {text}] (bold reads as plain text)
export function inline(s) {
  const out = [], re = /\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*/g;
  let at = 0, m;
  const text = (t) => { if (t) out.push({ text: t }); };
  while ((m = re.exec(s))) {
    text(s.slice(at, m.index));
    if (m[1] !== undefined) out.push(href(m[2]) ? { text: m[1].replace(/\*\*|`/g, ''), href: m[2] } : { text: m[1].replace(/`/g, '') });
    else if (m[3] !== undefined) out.push({ text: m[3], code: true });
    else text(m[4]);
    at = re.lastIndex;
  }
  text(s.slice(at));
  return out;
}

// the README -> {intro, sections: [{title, items: [{name, href, parts}]}], count}
export function parseAwesome(md) {
  const lines = String(md || '').slice(0, MAX_BYTES).split(/\r?\n/);
  const sections = [];
  let sec = null, fence = false, intro = null, count = 0;
  for (const raw of lines) {
    if (/^\s*```/.test(raw)) { fence = !fence; continue; }
    if (fence) continue;
    const h = /^##\s+(.+)$/.exec(raw);
    if (h) {
      const title = h[1].replace(LEAD, '').trim();
      sec = SKIP.test(title) ? null : { title, items: [] };
      if (sec) sections.push(sec);
      continue;
    }
    if (!intro) { const q = /^>\s*(.+)$/.exec(raw); if (q) { intro = inline(q[1]).map((x) => x.text).join('').trim(); continue; } }
    const li = /^[-*]\s+(.+)$/.exec(raw);                     // an entry: a list item at the start of a line, in a section
    if (!li || !sec || count >= MAX_ITEMS) continue;
    let s = li[1].replace(LEAD, '');
    let name = null, link = null;
    let m = /^\*\*\[([^\]]+)\]\(([^)\s]+)\)\*\*/.exec(s) || /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(s);
    if (m) { name = m[1]; link = href(m[2]); s = s.slice(m[0].length); }
    else if ((m = /^\*\*([^*]+)\*\*/.exec(s))) { name = m[1]; s = s.slice(m[0].length); }
    else continue;
    s = s.replace(/^\s*(?:—|–|-|·|:)\s*/, '').trim();
    const parts = inline(s);
    if (!link) { const first = parts.find((x) => x.href); link = first ? first.href : null; }   // "**Website** — [imd.fun](…)"
    sec.items.push({ name: name.trim(), href: link, parts });
    count++;
  }
  return { intro, sections: sections.filter((x) => x.items.length), count };
}

// the list, read at most every KEEP_MS in this browser
const KEEP_MS = 10 * 60000;
let kept = null;
export async function readAwesome(fetcher = fetch, now = Date.now()) {
  if (kept && now - kept.at < KEEP_MS) return kept.list;
  const r = await fetcher(AWESOME_RAW, { cache: 'no-cache' });
  if (!r.ok) throw new Error('GitHub answered ' + r.status);
  const list = parseAwesome(await r.text());
  if (!list.count) throw new Error('no entries in the list');
  kept = { at: now, list };
  return list;
}
