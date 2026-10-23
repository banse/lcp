// Seat data. LiveFeed polls the public /swarm route (CORS *) and the oracle panels; DemoFeed replays every event.
// Both call onEvent({type, ...}) and onStatus(status). Nothing else leaves the page.
const API = 'https://api.imd.fun';
// Asleep = the daemon looks offline: an "agent left" event, or no task for 72 h. Measured 2026-10-24 00:07 UTC:
// 1,026 of 1,055 seats online, yet 86 % had no task for 6 h; at 72 h 22 % read as asleep.
const POLL_MS = 30000, ORACLE_MS = 300000, QUIET_MS = 72 * 3600 * 1000;

export function isAsleep(seat, now = Date.now()) {
  if (!seat || !seat.last) return true;
  if (seat.working) return false;
  return now - Date.parse(seat.last) > QUIET_MS;
}

function roleFor(events, id) {
  const mine = (events || []).filter((e) => String(e.tokenId) === String(id) && (e.role || e.step));
  if (!mine.length) return '';
  mine.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return mine[0].role || mine[0].step || '';
}

// ---------- worker releases (GitHub, CORS *) and the seat's version ----------
const RELEASES = 'https://api.github.com/repos/Identity-md/worker/releases?per_page=40';
const RELEASES_MS = 30 * 60000, GRACE_H = 6, BEHIND_MAX = 3;

export async function workerReleases() {
  const key = 'seathouse:releases';
  try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c && Date.now() - c.at < RELEASES_MS) return c.list; } catch (e) { /* no storage */ }
  const r = await fetch(RELEASES, { cache: 'no-store' });
  if (!r.ok) throw new Error('GitHub answered ' + r.status);
  const list = (await r.json()).map((x) => {
    const m = /^worker-v([\d.]+)-([0-9a-f]+)$/.exec(x.tag_name || '');
    return m && { version: m[1], sha: m[2], at: Date.parse(x.published_at) };
  }).filter(Boolean).sort((a, b) => b.at - a.at);
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), list })); } catch (e) { /* no storage */ }
  return list;
}

// Needs an update: not on the newest release, and the newest has been out GRACE_H hours or the seat is
// BEHIND_MAX releases behind (seats with --auto-update catch up between tasks; releases ship every few hours).
export function updateStatus(daemonVersion, releases, now = Date.now()) {
  if (!daemonVersion || !releases || !releases.length) return null;
  const sha = (daemonVersion.split('+')[1] || '').toLowerCase();
  const latest = releases[0];
  const idx = sha ? releases.findIndex((r) => r.sha.startsWith(sha) || sha.startsWith(r.sha)) : -1;
  const behind = idx === -1 ? null : idx;
  const latestAgeH = (now - latest.at) / 3600000;
  const needs = idx !== 0 && (behind == null || behind >= BEHIND_MAX || latestAgeH >= GRACE_H);
  return { current: daemonVersion, latest: latest.version + '+' + latest.sha.slice(0, 8), behind, latestAgeH, needs };
}

async function seatDetail(id) {
  for (const url of ['/proxy/seats/' + id, API + '/seats/' + id]) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok) { const d = await r.json(); return d.seat || d; }
    } catch (e) { /* not readable from here */ }
  }
  return null;
}

function prevChanged(a, b) {
  return !a || ['attempts', 'accepted', 'rejected', 'failed', 'working'].some((k) => a[k] !== b[k]);
}

export class LiveFeed {
  constructor(onEvent, onStatus) {
    this.onEvent = onEvent; this.onStatus = onStatus;
    this.seat = null; this.prev = null; this.swarm = null; this.timer = null; this.oracleTimer = null;
    this.seenOracle = null; this.fails = 0; this.leftAt = null;
    this.detail = null; this.update = null; this.detailTimer = null; this.lastDetailAt = 0;
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && this.seat != null) this.poll(); });
  }

  async fetchSwarm() {
    const r = await fetch(API + '/swarm', { cache: 'no-store' });
    if (!r.ok) throw new Error('swarm answered ' + r.status);
    this.swarm = await r.json();
    return this.swarm;
  }

  setSeat(id) {
    this.seat = id; this.prev = null; this.seenOracle = null; this.leftAt = null; this.detail = null; this.update = null;
    clearTimeout(this.timer); clearTimeout(this.oracleTimer); clearTimeout(this.detailTimer);
    const first = this.checkDetail(true);
    Promise.race([first, new Promise((r) => setTimeout(r, 3000))]).then(() => { if (this.seat === id) this.poll(); });
    this.oracleTimer = setTimeout(() => this.checkOracle(), 4000);
  }

  stop() { this.seat = null; clearTimeout(this.timer); clearTimeout(this.oracleTimer); clearTimeout(this.detailTimer); }

  // the seat record (online, worker version) through the local relay, and the newest worker release
  async checkDetail(first = false) {
    clearTimeout(this.detailTimer);
    const id = this.seat;
    if (id == null) return;
    this.lastDetailAt = Date.now();
    const det = await seatDetail(id);
    if (id !== this.seat) return;
    let rel = null;
    try { rel = await workerReleases(); } catch (e) { /* GitHub unreachable or rate limited */ }
    if (id !== this.seat) return;
    const before = this.detail, upd = det ? updateStatus(det.daemonVersion, rel) : null;
    this.detail = det; this.releases = rel;
    if (!first && before && det && before.daemonVersion && det.daemonVersion && before.daemonVersion !== det.daemonVersion) {
      this.onEvent({ type: 'updated', from: before.daemonVersion, to: det.daemonVersion, info: upd });
    } else if (upd && upd.needs && !(this.update && this.update.needs) && this.prev) {
      this.onEvent({ type: 'update', info: upd });
    }
    this.update = upd;
    this.detailTimer = setTimeout(() => this.checkDetail(), 10 * 60000);
  }

  async poll() {
    clearTimeout(this.timer);
    if (this.seat == null) return;
    if (document.visibilityState === 'hidden') { this.timer = setTimeout(() => this.poll(), POLL_MS); return; }
    const id = this.seat;
    try {
      const sw = await this.fetchSwarm();
      if (id !== this.seat) return;
      this.fails = 0;
      const cur = sw.seats[String(id)] || null;
      const now = Date.now();
      // agent left/joined events for this seat override the 6 h rule
      for (const e of sw.events || []) {
        if (e.kind === 'agent' && String(e.tokenId) === String(id)) {
          if (e.state === 'left') this.leftAt = Math.max(this.leftAt || 0, Date.parse(e.at));
          if (e.state === 'joined' && this.leftAt && Date.parse(e.at) > this.leftAt) this.leftAt = null;
        }
      }
      const online = this.detail && typeof this.detail.online === 'boolean' ? this.detail.online : null;
      const asleep = online != null ? !online && !(cur && cur.working)
        : isAsleep(cur, now) || (this.leftAt != null && !(cur && cur.working));
      const verifierDown = sw.health && sw.health.verifierUp === false;
      const idleHours = cur && cur.last && !cur.working ? (now - Date.parse(cur.last)) / 3600000 : 0;
      const status = { seat: id, data: cur, asleep, verifierDown, idleHours, at: new Date(), live: true, health: sw.health,
        online, version: this.detail ? this.detail.daemonVersion : null, update: this.update, detailRead: !!this.detail };
      if (!this.prev) {
        this.onEvent({ type: 'init', seat: id, data: cur, asleep, working: !!(cur && cur.working),
          accepted: cur ? cur.accepted : 0, verifierDown, update: this.update });
      } else {
        if (Date.now() - this.lastDetailAt > 2 * 60000 && cur && prevChanged(this.prev.data, cur)) this.checkDetail();
        this.diff(this.prev, cur, asleep, verifierDown, sw.events);
      }
      this.prev = { data: cur, asleep, verifierDown };
      this.onStatus(status);
    } catch (err) {
      this.fails++;
      this.onStatus({ seat: id, error: String(err.message || err), at: new Date(), live: true });
    }
    const wait = this.fails ? Math.min(POLL_MS * 2 ** this.fails, 300000) : POLL_MS;
    this.timer = setTimeout(() => this.poll(), wait);
  }

  diff(prev, cur, asleep, verifierDown, events) {
    const p = prev.data || {}, c = cur || {};
    const d = (k) => (c[k] || 0) - (p[k] || 0);
    if (prev.asleep && !asleep) this.onEvent({ type: 'wake' });
    if (!p.working && c.working) this.onEvent({ type: 'work', role: roleFor(events, this.seat) });
    if (p.working && !c.working) this.onEvent({ type: 'workdone' });
    if (d('attempts') > 0) this.onEvent({ type: 'post', n: d('attempts') });
    if (d('accepted') > 0) this.onEvent({ type: 'accepted', n: d('accepted') });
    if (d('rejected') > 0) this.onEvent({ type: 'rejected', n: d('rejected') });
    if (d('failed') > 0) this.onEvent({ type: 'failed', n: d('failed') });
    if (!(p.queued > 0) && c.queued > 0) this.onEvent({ type: 'phone' });
    if (prev.verifierDown !== verifierDown) this.onEvent({ type: 'verifier', down: verifierDown });
    if (!prev.asleep && asleep) this.onEvent({ type: 'sleep' });
  }

  async checkOracle() {
    clearTimeout(this.oracleTimer);
    const id = this.seat;
    if (id == null) return;
    try {
      const r = await fetch(API + '/oracle/requests?limit=20', { cache: 'no-store' });
      const list = (await r.json()).requests || [];
      const first = this.seenOracle == null;
      if (first) this.seenOracle = new Set();
      const fresh = list.filter((q) => !this.seenOracle.has(q.id));
      for (const q of fresh.slice(0, 10)) {
        this.seenOracle.add(q.id);
        const age = Date.now() - Date.parse(q.createdAt);
        if (age > (first ? 30 : 180) * 60000) continue;
        const det = await (await fetch(API + '/oracle/requests/' + q.id, { cache: 'no-store' })).json();
        const req = det.request || det;
        if ((req.members || []).some((m) => String(m.tokenId) === String(id)) && id === this.seat) {
          this.onEvent({ type: 'oracle', request: q.id });
        }
      }
      for (const q of fresh.slice(10)) this.seenOracle.add(q.id);
    } catch (err) { /* the next check retries */ }
    this.oracleTimer = setTimeout(() => this.checkOracle(), ORACLE_MS);
  }
}

// A scripted day in fast motion: every event the house knows, about two minutes per loop.
export class DemoFeed {
  constructor(onEvent, onStatus) {
    this.onEvent = onEvent; this.onStatus = onStatus; this.timers = [];
    this.data = { tokenId: 'demo', agentId: '00000', attempts: 120, accepted: 7, rejected: 2, failed: 1, pending: 0, queued: 0,
      working: false, last: new Date().toISOString() };
  }

  start() {
    this.stop();
    const D = this.data;
    const status = (asleep = false, verifierDown = false) => this.onStatus({ seat: 'demo', data: { ...D }, asleep, verifierDown, at: new Date(), live: false });
    const plan = [
      [0, () => { this.onEvent({ type: 'init', seat: 'demo', data: D, asleep: false, working: false, accepted: D.accepted, verifierDown: false, letter: true }); status(); }],
      [14, () => { D.queued = 1; this.onEvent({ type: 'phone' }); status(); }],
      [22, () => { D.queued = 0; D.working = true; this.onEvent({ type: 'work', role: 'implement' }); status(); }],
      [42, () => { D.attempts++; this.onEvent({ type: 'post', n: 1 }); status(); }],
      [56, () => { D.accepted++; this.onEvent({ type: 'accepted', n: 1 }); status(); }],
      [80, () => { this.onEvent({ type: 'oracle' }); status(); }],
      [104, () => { D.working = false; this.onEvent({ type: 'workdone' }); D.failed++; this.onEvent({ type: 'failed', n: 1 }); status(); }],
      [118, () => { D.rejected++; this.onEvent({ type: 'rejected', n: 1 }); status(); }],
      [140, () => { this.onEvent({ type: 'update', info: { current: '0.1.4+011c9f4c', latest: '0.1.4+1103e27b', behind: 3, latestAgeH: 7, needs: true } }); status(); }],
      [168, () => { this.onEvent({ type: 'updated', from: '0.1.4+011c9f4c', to: '0.1.4+1103e27b', info: { needs: false } }); status(); }],
      [196, () => { this.onEvent({ type: 'verifier', down: true }); status(false, true); }],
      [208, () => { this.onEvent({ type: 'verifier', down: false }); status(); }],
      [214, () => { this.onEvent({ type: 'sleep' }); status(true); }],
      [232, () => { this.onEvent({ type: 'wake' }); status(); }],
      [244, () => this.start()],
    ];
    for (const [s, fn] of plan) this.timers.push(setTimeout(fn, s * 1000));
  }

  stop() { this.timers.forEach(clearTimeout); this.timers = []; }
}
