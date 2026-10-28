// The showcase (2026-10-28, owner: "some more actions to add: ... when a job finished and a video was requested and produced,
// show the video on the tv and pepe sitting in front watching once it is published. for an audio task pepe walks to the
// record player and playes the produced audio ... if a webpage is created its shown on the big machine for a bit ... when
// the burnexecutor got called ... a new package arrives at the door ... a plane flys by with the message in a flying banner
// ... when art or a token logo is produced the pic is shown on the canvas next to the big machine").
// The server's snapshot (selfhost/showcase.py, /proxy/showcase) every POLL_MS; what is new since the page opened goes to
// onNew, oldest first, and the house acts it out (main.js, brain.js showEvent). On the first read only what happened in
// the last RECENT_MS plays; the easel gets the newest picture whatever its age (onArt).
// kinds: video, audio, site, art (an image or a token logo), burn, plane (Agent Surf's message)
export const POLL_MS = 30000, RECENT_MS = 10 * 60000;
export const VIDEO_S = 40, AUDIO_S = 45, SITE_S = 22, PLANE_S = 24;

const KIND = { video: 'video', audio: 'audio', site: 'site', image: 'art' };
export const keyOf = (kind, it) => kind + ':' + (it.id || it.tx);

export class ShowcaseFeed {
  constructor({ url, onNew, onArt = () => {}, fetchFn = (u) => fetch(u, { cache: 'no-store' }), now = () => Date.now(), every = POLL_MS, recent = RECENT_MS } = {}) {
    Object.assign(this, { url, onNew, onArt, fetchFn, now, every, recent });
    this.seen = new Set(); this.first = true; this.last = null; this.timer = null;
  }

  start() { if (!this.timer) { this.poll(); this.timer = setInterval(() => this.poll(), this.every); } }
  stop() { clearInterval(this.timer); this.timer = null; }

  // every item of the snapshot as {kind, item, at}
  items(d) {
    const out = [];
    for (const o of (d && d.outputs) || []) if (KIND[o.kind]) out.push({ kind: KIND[o.kind], item: o, at: o.at });
    for (const b of (d && d.burns) || []) out.push({ kind: 'burn', item: b, at: b.at });
    for (const p of (d && d.surf) || []) out.push({ kind: 'plane', item: p, at: p.at });
    return out;
  }

  async poll() {
    let d = null;
    try { const r = await this.fetchFn(this.url); if (r && r.ok) d = await r.json(); } catch (e) { return; }
    if (!d || typeof d !== 'object') return;
    this.last = d;
    const fresh = [];
    for (const x of this.items(d)) {
      const k = keyOf(x.kind, x.item);
      if (this.seen.has(k)) continue;
      this.seen.add(k);
      const t = Date.parse(x.at || '');
      if (this.first && !(t && this.now() - t < this.recent)) continue;
      fresh.push(x);
    }
    const wasFirst = this.first;
    this.first = false;
    if (wasFirst) { const art = this.latest('art'); if (art) this.onArt(art); }
    fresh.sort((a, b) => (Date.parse(a.at || '') || 0) - (Date.parse(b.at || '') || 0));
    for (const x of fresh) this.onNew(x);
  }

  // the newest item of a kind in the last snapshot ({kind, item, at}), or null
  latest(kind) {
    const all = this.items(this.last).filter((x) => x.kind === kind);
    all.sort((a, b) => (Date.parse(b.at || '') || 0) - (Date.parse(a.at || '') || 0));
    return all[0] || null;
  }
}

// ---------- the players (main.js); doc: document ----------
// the video the house draws on its TV: in the page (some browsers decode a detached one poorly) but out of sight; muted unless
// heard (2026-10-28: a video's sound is music, main.js musicOn)
export function videoEl(doc, url, heard = false) {
  const v = doc.createElement('video');
  v.muted = !heard; v.volume = 0.8; v.playsInline = true; v.preload = 'auto';
  v.setAttribute('aria-hidden', 'true'); v.tabIndex = -1;
  v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  v.src = url;
  doc.body.append(v);
  return v;
}

export function dropMedia(el) {
  if (!el) return;
  try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) { /* gone already */ }
  if (el.remove) el.remove();
}

// the new site over the machine's screen: a frame of the page at desktop width, scaled down to the screen, following the
// canvas (scroll, the column's grip, full screen). Sandboxed without same-origin (an opaque origin: it cannot reach the
// house), no popups, no top navigation, no autoplay, camera or microphone; clicks go to the canvas below (main.js).
export const SITE_W = 1280;
export function siteOverlay(doc, canvas, screen, url, world = { w: 480, h: 320 }) {
  const box = doc.createElement('div');
  box.className = 'site-show';
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = 'position:fixed;overflow:hidden;pointer-events:none;z-index:5;background:#fff';
  const f = doc.createElement('iframe');
  f.title = 'A new site, shown on his machine';
  f.setAttribute('sandbox', 'allow-scripts');
  f.setAttribute('allow', "autoplay 'none'; camera 'none'; microphone 'none'; geolocation 'none'; fullscreen 'none'");
  f.referrerPolicy = 'no-referrer'; f.tabIndex = -1; f.loading = 'eager';
  const h = Math.round(SITE_W * screen.h / screen.w);
  f.style.cssText = `width:${SITE_W}px;height:${h}px;border:0;transform-origin:0 0;pointer-events:none;background:#fff`;
  f.src = url;
  box.append(f);
  doc.body.append(box);
  let raf = 0;
  const place = () => {
    const r = canvas.getBoundingClientRect(), k = r.width / world.w;
    box.style.left = `${r.left + screen.x * k}px`; box.style.top = `${r.top + screen.y * k}px`;
    box.style.width = `${screen.w * k}px`; box.style.height = `${screen.h * k}px`;
    f.style.transform = `scale(${(screen.w * k) / SITE_W})`;
    box.style.visibility = r.width > 0 ? 'visible' : 'hidden';
    raf = requestAnimationFrame(place);
  };
  place();
  return { el: box, remove() { cancelAnimationFrame(raf); f.src = 'about:blank'; box.remove(); } };
}
