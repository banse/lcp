import { CATEGORY_SAY } from './mapping.js';
import { RELAY } from './env.js';

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

function liveTask(events, id) {
  const mine = (events || []).filter((e) => String(e.tokenId) === String(id) && (e.step || e.nodeKey || e.role));
  if (!mine.length) return null;
  mine.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const e = mine[0];
  return { nodeKey: e.step || e.nodeKey || '', role: e.role || '', launch: e.launch || null, objective: e.objective || '', jobId: e.jobId || null };
}

// Which kind of work a task is: its job's skill or template when the job record says (local relay), else its step key,
// else its step's role. What he does for each category is the look's mapping (mapping.js). base = token launch work or
// not, for a look that has no activity for the category.
const TOKEN_LAUNCHES = ['custom_token', 'evm_project', 'univ4_hook'];
// launch steps carry their launch kind only once posted (measured on 12 seats, 2026-10-24: 9 of 11 contract builds
// were token launches)
const LAUNCH_STEP = /contract_project|foundry|manifest|^audit_|deploy/;
// the live skill catalog (api.imd.fun/skills, 2026-10-24) by what he does for it
const SKILL_CATEGORY = {
  'oracle-assess': 'oracle', 'research-report': 'research', 'create-image': 'image', 'token-logo': 'image',
  'create-audio': 'audio', 'create-video': 'video', 'build-website': 'website', 'frontend-for-contract': 'website',
  'implement-component': 'website', 'import-site': 'website', 'site-content-check': 'review', 'design-critic': 'review',
  'adversarial-review': 'review', 'audit-imported-code': 'review', 'audit-specialist': 'review', 'audit-judge': 'review',
  'write-foundry-tests': 'tests', 'gas-and-size-report': 'tests', 'integrate-project': 'assemble', 'fix-findings': 'assemble',
  'refine-project': 'assemble', 'adapt-contract-project': 'assemble', 'deploy-script': 'assemble',
  'write-readme-and-docs': 'docs', 'build-ponder-indexer': 'indexer', 'workflow-planner': 'planning',
};
const TEMPLATE_CATEGORY = { research: 'research', audit: 'review', fuzz: 'fuzz' };
const ROLE_CATEGORY = { review: 'review', tests: 'tests', integrate: 'assemble' };
// step keys: the plane's own and a requester's free words in a dag; the first match wins (site_content_check is a review)
const KEY_CATEGORY = [
  [/audit|review|critic|adversarial|check/, 'review'], [/website|site|frontend|landing|component/, 'website'],
  [/image|illustrat|artwork|logo/, 'image'], [/test|gas_/, 'tests'], [/manifest|integrat|fix|refine|adapt|deploy/, 'assemble'],
  [/readme|docs?$|documentation/, 'docs'], [/fuzz/, 'fuzz'], [/ponder|indexer/, 'indexer'], [/plan/, 'planning'],
];

export function taskBase(t, job) {
  return TOKEN_LAUNCHES.includes((t && t.launch) || (job && job.launch)) ? 'token' : 'other';
}

export function taskCategory(t, job) {
  if (!t) return null;
  const k = (t.nodeKey || '').toLowerCase(), o = (t.objective || '').toLowerCase(), tpl = (job && job.template) || '';
  if (tpl.startsWith('skill:') && SKILL_CATEGORY[tpl.slice(6)]) return SKILL_CATEGORY[tpl.slice(6)];
  if (TEMPLATE_CATEGORY[tpl]) return TEMPLATE_CATEGORY[tpl];
  if (/oracle/.test(k)) return 'oracle';
  if (/research|panel|prior_art/.test(k)) return 'research';
  if (/video/.test(k) || /\bvideo\b/.test(o.slice(0, 60))) return 'video';
  if (/audio|music|sound|song|voice|podcast/.test(k) || /\b(audio|music|song|soundtrack|podcast)\b/.test(o.slice(0, 60))) return 'audio';
  for (const [re, c] of KEY_CATEGORY) if (re.test(k)) return c;
  const role = t.role || (job && job.nodes && job.nodes[t.nodeKey]);
  if (ROLE_CATEGORY[role]) return ROLE_CATEGORY[role];
  return taskBase(t, job);
}

export function describeTask(t, job) {
  const c = taskCategory(t, job);
  if (!t) return '';
  const launch = t.launch || (job && job.launch);
  if (c === 'other' && launch) return 'a launch task (' + launch + ')';
  return CATEGORY_SAY[c];
}

// the seat's usual kind of work, from its newest tasks
function usualCategory(recent) {
  const c = {};
  for (const t of (recent || []).slice(0, 10)) { const k = taskCategory(t); c[k] = (c[k] || 0) + 1; }
  const best = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
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

// a job's template, launch kind, step roles and oracle question, through the local relay (/jobs has no CORS);
// undefined = not readable from here
const jobInfos = new Map();
async function jobInfo(jobId) {
  if (!jobId || !RELAY) return undefined;
  if (jobInfos.has(jobId)) return jobInfos.get(jobId);
  try {
    const r = await fetch('/proxy/jobs/' + jobId, { cache: 'no-store' });
    if (!r.ok) return undefined;
    const info = await r.json();
    jobInfos.set(jobId, info);
    return info;
  } catch (e) { return undefined; }
}

// jobs and oracle questions that schedules opened (relay /proxy/scheduled), read at most every 10 minutes
let scheduled = { at: 0, ids: new Set() };
async function scheduledIds() {
  if (!RELAY || Date.now() - scheduled.at < 10 * 60000) return scheduled.ids;
  scheduled.at = Date.now();
  try {
    const r = await fetch('/proxy/scheduled', { cache: 'no-store' });
    if (r.ok) scheduled.ids = new Set((await r.json()).ids || []);
  } catch (e) { /* no relay */ }
  return scheduled.ids;
}

async function seatDetail(id) {
  for (const url of RELAY ? ['/proxy/seats/' + id, API + '/seats/' + id] : []) {      // hosted: /seats has no CORS
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok) { const d = await r.json(); return d.seat || d; }
    } catch (e) { /* not readable from here */ }
  }
  return null;
}

// ---------- the machine wall: provider, model and effort while he works (relay /proxy/seats/<n>/machine) ----------
const PROVIDER = { claude: 'CLAUDE CODE', codex: 'CODEX' };
// the dial's seven marks, low to high (Claude's runtimes say low..max, Codex's minimal..xhigh, max or ultra)
export const EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];

// 'claude-opus-5-5' -> 'OPUS 5.5', 'gpt-6-astra' -> 'GPT-6 ASTRA', anything else in capitals
export function modelName(id) {
  if (!id) return null;
  const c = /^claude-([a-z]+)-(\d+(?:-\d+)*)$/.exec(id);
  if (c) return (c[1] + ' ' + c[2].replace(/-/g, '.')).toUpperCase();
  const g = /^(gpt-[\d.]+)-?(.*)$/.exec(id);
  if (g) return (g[1] + (g[2] ? ' ' + g[2].replace(/-/g, ' ') : '')).toUpperCase();
  return id.replace(/-/g, ' ').toUpperCase();
}

// the model's family, the word its symbol comes from: 'claude-opus-5-5' -> 'opus', 'gpt-6-astra' -> 'astra'
export function modelFamily(id) {
  const m = /^claude-([a-z]+)-\d/.exec(id || '') || /^gpt-[\d.]+-([a-z]+)/.exec(id || '');
  return m ? m[1] : null;
}

// What the house shows of the work: the running step's runtime and model (its job record), else the seat's runtime when
// it has one; premium = the step runs the seat's premium model, the one tier whose effort the seat record shows.
export function machineInfo(rec) {
  if (!rec) return null;
  const rts = rec.runtimes || [], t = rec.task;
  const rt = (t && rts.find((r) => r.id === t.runtime)) || (rts.length === 1 ? rts[0] : null);
  const runtime = (t && t.runtime) || (rt && rt.id);
  if (!runtime) return null;
  const model = (t && t.model) || null, prem = rt && rt.premiumModel;
  const premium = !!(model && prem && prem.model === model), effort = premium ? prem.effort || null : null;
  return { runtime, provider: PROVIDER[runtime] || runtime.toUpperCase(), modelId: model, model: modelName(model),
    family: modelFamily(model), premium, effort, level: effort ? EFFORTS.indexOf(effort) : -1,
    version: rt ? rt.version : null, step: t ? t.step : null, jobId: t ? t.jobId : null };
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
    this.myJobs = new Set(); this.seenDone = new Set(); this.doneReady = false;
    this.machine = null; this.machineTimer = null;
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && this.seat != null) this.poll(); });
  }

  // while the seat works: what its machine runs, read when the work starts and again every 45 s (15 s while the step is
  // not found yet); onEvent({type: 'machine', info}) when it changes, info null when the work ends or nothing is known
  async checkMachine() {
    clearTimeout(this.machineTimer);
    const id = this.seat;
    if (!RELAY || id == null || !(this.prev && this.prev.data && this.prev.data.working)) return this.setMachine(null);
    let info = null;
    try {
      const r = await fetch('/proxy/seats/' + id + '/machine', { cache: 'no-store' });
      if (r.ok) info = machineInfo(await r.json());
    } catch (e) { /* no relay: the machine shows nothing */ }
    if (id !== this.seat || !(this.prev && this.prev.data && this.prev.data.working)) return;
    this.setMachine(info);
    this.machineTimer = setTimeout(() => this.checkMachine(), info && info.modelId ? 45000 : 15000);
  }

  setMachine(info) {
    const key = (m) => (m ? [m.runtime, m.modelId, m.effort, m.step].join('|') : '');
    if (key(info) === key(this.machine)) return;
    this.machine = info;
    this.onEvent({ type: 'machine', info });
    this.workFromMachine(info);
  }

  // the machine names the step the seat runs (from its job record): when the house guessed, or shows another step, he
  // moves to the right place (the live events can miss a step that started minutes before the visit)
  async workFromMachine(info) {
    const w = this.work;
    if (!info || !info.step || !info.jobId || !w || (!w.guess && w.step === info.step && w.jobId === info.jobId)) return;
    const id = this.seat, job = await jobInfo(info.jobId);
    if (id !== this.seat || this.work !== w) return;
    const t = { nodeKey: info.step, role: job && job.nodes ? job.nodes[info.step] : undefined, jobId: info.jobId };
    const sure = { category: taskCategory(t, job), base: taskBase(t, job), label: describeTask(t, job), step: info.step, jobId: info.jobId };
    this.work = sure;
    this.onEvent({ type: 'workkind', ...sure });
  }

  // onSwarm(sw), when set, gets every reading too (SwarmJobs: the jobs a hosted page can follow)
  async fetchSwarm() {
    const r = await fetch(API + '/swarm', { cache: 'no-store' });
    if (!r.ok) throw new Error('swarm answered ' + r.status);
    this.swarm = await r.json();
    if (this.onSwarm) this.onSwarm(this.swarm);
    return this.swarm;
  }

  // hint: the step a followed job runs on this seat now ({seat, jobId, step, role, job: {template, launch}}, JobFollower)
  setSeat(id, hint = null) {
    this.seat = id; this.prev = null; this.seenOracle = null; this.leftAt = null; this.detail = null; this.update = null;
    this.work = null; this.setHint(hint);
    this.myJobs = new Set(); this.seenDone = new Set(); this.doneReady = false; this.machine = null; this.machineLoop = false;
    clearTimeout(this.timer); clearTimeout(this.oracleTimer); clearTimeout(this.detailTimer); clearTimeout(this.machineTimer);
    const first = this.checkDetail(true);
    Promise.race([first, new Promise((r) => setTimeout(r, 3000))]).then(() => { if (this.seat === id) this.poll(); });
    this.oracleTimer = setTimeout(() => this.checkOracle(), 4000);
  }

  // the followed job's step on this seat, read by the follower: the next work start takes it (once, for 5 minutes)
  setHint(hint) { this.hint = hint ? { ...hint, at: Date.now() } : null; }

  takeHint() {
    const h = this.hint;
    this.hint = null;
    return h && h.seat === this.seat && Date.now() - h.at < 5 * 60000
      ? { nodeKey: h.step, role: h.role || '', launch: (h.job && h.job.launch) || null, jobId: h.jobId, job: h.job } : null;
  }

  stop() { this.seat = null; clearTimeout(this.timer); clearTimeout(this.oracleTimer); clearTimeout(this.detailTimer); clearTimeout(this.machineTimer); }

  // the task he starts: the followed job's step on this seat, else the live event if it names the step, else his usual
  // kind of work (then the machine record corrects it, see workFromMachine). The event names the step and the job; the
  // job record (relay) adds the template, the launch kind and the role (see refineWork). Until it is read, or without
  // the relay, a launch step's kind follows the seat's recent launches.
  guessWork(events) {
    const t = this.takeHint() || liveTask(events, this.seat);
    if (t && t.nodeKey) {
      const job = jobInfos.get(t.jobId) || t.job;
      const w = { category: taskCategory(t, job), base: taskBase(t, job), label: describeTask(t, job), step: t.nodeKey,
        role: t.role, jobId: t.jobId, refine: !job && !!t.jobId };
      if (!job && !t.launch && LAUNCH_STEP.test(t.nodeKey)) {
        const kinds = ((this.detail && this.detail.recent) || []).map((r) => r.launch).filter(Boolean).slice(0, 10);
        const token = kinds.filter((k) => TOKEN_LAUNCHES.includes(k)).length;
        w.base = !kinds.length || token * 2 >= kinds.length ? 'token' : 'other';
        w.guess = true;
        if (w.category === 'token' || w.category === 'other') { w.category = w.base; w.label = w.base === 'token' ? CATEGORY_SAY.token : 'a launch task'; }
      }
      return w;
    }
    const usual = usualCategory(this.detail && this.detail.recent);
    return usual ? { category: usual, base: usual === 'token' ? 'token' : 'other', label: CATEGORY_SAY[usual], guess: true }
      : { category: 'other', base: 'other', label: 'a task', guess: true };
  }

  // the job record is read: if it changes the category or the launch kind, he moves to the right place
  async refineWork(w) {
    if (!w || !w.refine || !w.jobId) return;
    const id = this.seat, job = await jobInfo(w.jobId);
    if (!job || id !== this.seat) return;
    const t = { nodeKey: w.step, role: w.role, jobId: w.jobId };
    const sure = { category: taskCategory(t, job), base: taskBase(t, job), label: describeTask(t, job), step: w.step, jobId: w.jobId };
    if (this.work !== w) return;
    this.work = sure;
    if (sure.category !== w.category || sure.base !== w.base) this.onEvent({ type: 'workkind', ...sure });
  }

  // a schedule opened the job (or the oracle question) he starts: his alarm clock rings
  async alarmFor(w) {
    if (!w || !w.jobId) return;
    const id = this.seat, ids = await scheduledIds(), job = jobInfos.get(w.jobId) || await jobInfo(w.jobId);
    if (id === this.seat && (ids.has(w.jobId) || (job && ids.has(job.oracleRequestId)))) this.onEvent({ type: 'alarm' });
  }

  // a job this seat worked on is done: completed (and a launch goes live) or blocked. Only news after the first reading.
  watchDone(events) {
    for (const e of events || []) if (String(e.tokenId) === String(this.seat) && e.jobId) this.myJobs.add(e.jobId);
    for (const t of (this.detail && this.detail.recent) || []) if (t.jobId) this.myJobs.add(t.jobId);
    const first = !this.doneReady;
    this.doneReady = true;
    for (const e of events || []) {
      if (e.kind !== 'done' || !e.jobId || this.seenDone.has(e.jobId + e.at)) continue;
      this.seenDone.add(e.jobId + e.at);
      if (first || !this.myJobs.has(e.jobId)) continue;
      this.onEvent({ type: 'jobdone', state: e.state, jobId: e.jobId });
      if (e.state !== 'completed') continue;
      const rec = ((this.detail && this.detail.recent) || []).find((t) => t.jobId === e.jobId);
      if (rec && rec.launch) this.onEvent({ type: 'launched', kind: rec.launch, jobId: e.jobId });
      else jobInfo(e.jobId).then((job) => { if (job && job.launch && this.seat != null) this.onEvent({ type: 'launched', kind: job.launch, jobId: e.jobId }); });
    }
  }

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
    const newest = det && det.recent && det.recent[0], prevNewest = before && before.recent && before.recent[0];
    if (!first && newest && (!prevNewest || newest.submittedAt !== prevNewest.submittedAt || newest.jobId !== prevNewest.jobId)) {
      const job = jobInfos.get(newest.jobId);
      this.onEvent({ type: 'submitted', task: newest, category: taskCategory(newest, job), base: taskBase(newest, job), label: describeTask(newest, job) });
    }
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
      const paused = !!(this.detail && this.detail.pausedByOwnerAt);       // only readable through the local relay
      const idleHours = cur && cur.last && !cur.working ? (now - Date.parse(cur.last)) / 3600000 : 0;
      const status = { seat: id, data: cur, asleep, verifierDown, idleHours, at: new Date(), live: true, health: sw.health,
        online, paused, version: this.detail ? this.detail.daemonVersion : null, update: this.update, detailRead: !!this.detail };
      if (!this.prev) {
        if (cur && cur.working) {                       // wait briefly for the job record: template, launch kind, roles
          const t = liveTask(sw.events, id);
          if (t && t.jobId) await Promise.race([jobInfo(t.jobId), new Promise((r) => setTimeout(r, 2500))]);
          if (id !== this.seat) return;
        }
        const w = cur && cur.working ? this.guessWork(sw.events) : null;
        this.work = w;
        this.onEvent({ type: 'init', seat: id, data: cur, asleep, working: !!(cur && cur.working),
          accepted: cur ? cur.accepted : 0, verifierDown, paused, update: this.update, ...(w || {}) });
        this.refineWork(w);
        this.alarmFor(w);
      } else {
        const posted = cur && this.prev.data && cur.attempts !== this.prev.data.attempts;
        if (cur && (posted || (Date.now() - this.lastDetailAt > 2 * 60000 && prevChanged(this.prev.data, cur)))) setTimeout(() => this.checkDetail(), posted ? 1500 : 0);
        this.diff(this.prev, cur, asleep, verifierDown, sw.events, paused);
      }
      this.watchDone(sw.events);
      this.prev = { data: cur, asleep, verifierDown, paused };
      const working = !!(cur && cur.working);
      if (working && !this.machineLoop) { this.machineLoop = true; this.checkMachine(); }
      else if (!working && this.machineLoop) { this.machineLoop = false; clearTimeout(this.machineTimer); this.setMachine(null); }
      this.onStatus(status);
    } catch (err) {
      this.fails++;
      this.onStatus({ seat: id, error: String(err.message || err), at: new Date(), live: true });
    }
    const wait = this.fails ? Math.min(POLL_MS * 2 ** this.fails, 300000) : POLL_MS;
    this.timer = setTimeout(() => this.poll(), wait);
  }

  diff(prev, cur, asleep, verifierDown, events, paused) {
    const p = prev.data || {}, c = cur || {};
    const d = (k) => (c[k] || 0) - (p[k] || 0);
    if (prev.asleep && !asleep) this.onEvent({ type: 'wake' });
    if (!p.working && c.working) { const w = this.guessWork(events); this.work = w; this.onEvent({ type: 'work', ...w }); this.refineWork(w); this.alarmFor(w); }
    if (p.working && !c.working) { this.work = null; this.onEvent({ type: 'workdone' }); }
    if (d('attempts') > 0) this.onEvent({ type: 'post', n: d('attempts') });
    if (d('accepted') > 0) this.onEvent({ type: 'accepted', n: d('accepted') });
    if (d('rejected') > 0) this.onEvent({ type: 'rejected', n: d('rejected') });
    if (d('failed') > 0) this.onEvent({ type: 'failed', n: d('failed') });
    if (!(p.queued > 0) && c.queued > 0) this.onEvent({ type: 'phone' });
    if (prev.verifierDown !== verifierDown) this.onEvent({ type: 'verifier', down: verifierDown });
    if (!prev.asleep && asleep) this.onEvent({ type: 'sleep' });
    if (!prev.paused && paused) this.onEvent({ type: 'pause' });
    if (prev.paused && !paused) this.onEvent({ type: 'resume' });
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
          if ((await scheduledIds()).has(q.id)) this.onEvent({ type: 'alarm' });
          this.onEvent({ type: 'oracle', request: q.id });
        }
      }
      for (const q of fresh.slice(10)) this.seenOracle.add(q.id);
    } catch (err) { /* the next check retries */ }
    this.oracleTimer = setTimeout(() => this.checkOracle(), ORACLE_MS);
  }
}

// ---------- following one job (#/job/<id>) ----------
// The job record through the local relay (/proxy/jobs/<id>/steps; /jobs has no CORS), read every 10 s. A step runs while
// the record shows it working, with a `live` part and a seat. It started at the updatedAt of the first reading that saw it
// running: the parallel audits of one launch share live.since (the moment they were offered), while each updatedAt is
// the moment its seat took it (job a39fefdf, 2026-10-16). A hosted page has no relay: it reads SwarmJobs instead.
const FOLLOW_MS = 10000, FOLLOW_HOSTED_MS = 15000;
const JOB_ENDED = ['completed', 'blocked', 'failed', 'cancelled'];
const STEP_RUNNING = ['working', 'running', 'leased'], STEP_OVER = ['accepted', 'rejected', 'failed', 'verifying', 'blocked'];

// ---------- the jobs a hosted page can see (2026-10-25) ----------
// Without the relay the page lists and follows jobs from /swarm's events (open CORS): a `job` event when a job opens, one
// `node` event per step, overwritten with the step's newest state (its seat, working, verifying, accepted, ...), and a
// `done` event when the job ends (state, failure). On site job 5afefd90 (2026-10-25) every step change showed there 10 to
// 50 s after it happened. /swarm keeps the network's 60 newest events (2 to 2.5 h of them on a quiet night, 9 min in a
// reconnect wave): a job whose events have left that window is missing until one of its steps changes again; what the
// page has seen, it keeps. An oracle question is one node, whatever its panel: its seats and answers come from
// /oracle/requests/<id> (open CORS; the list /oracle/requests showed `attested` 2 min after the detail did).
const ORACLE_OPEN = ['assessing', 'reproducing'];
const ORACLE_ENDS = { attested: 'completed', disagreed: 'blocked', blocked: 'blocked', mismatch: 'blocked', refused: 'blocked', failed: 'failed' };
const JOB_QUIET_MS = 2 * 3600000;     // no step change for 2 h and no seat on it: no longer listed
const STALE_MS = 3 * 60000;           // a working step whose seat stopped working this long ago is over (the flag lags ~1 min)

export class SwarmJobs {
  constructor() { this.jobs = new Map(); this.seats = {}; this.at = 0; this.oracleAt = 0; this.reading = null; }

  job(id) {
    let j = this.jobs.get(id);
    if (!j) { j = { id, objective: '', nodes: new Map(), last: 0, ended: null, oracle: null }; this.jobs.set(id, j); }
    return j;
  }

  // one /swarm reading: LiveFeed hands over each one it makes, refresh() makes its own
  ingest(sw, now = Date.now()) {
    if (!sw) return;
    this.at = now; this.seats = sw.seats || {};
    for (const e of (sw.events || []).slice().reverse()) {        // oldest first
      if (!e.jobId || !['job', 'node', 'done'].includes(e.kind)) continue;
      const j = this.job(e.jobId), at = Date.parse(e.at) || 0;
      if (e.objective && e.objective.length > j.objective.length) j.objective = e.objective;   // a job event's is cut short
      j.last = Math.max(j.last, at);
      if (e.kind === 'done') j.ended = { state: e.state || 'completed', failure: e.failure || null };
      else if (e.kind === 'node' && e.step) {
        const n = j.nodes.get(e.step);
        if (!n || at >= n.at) j.nodes.set(e.step, { key: e.step, role: e.role, seat: e.tokenId == null ? null : Number(e.tokenId), state: e.state, at });
      }
    }
    for (const [id, j] of this.jobs) if (now - j.last > 12 * 3600000) this.jobs.delete(id);
  }

  // a reading of its own when the newest is older than maxAge (LiveFeed reads every 30 s while a seat is shown)
  refresh(maxAge = 12000) {
    if (Date.now() - this.at < maxAge) return Promise.resolve();
    if (!this.reading) {
      this.reading = fetch(API + '/swarm', { cache: 'no-store' })
        .then((r) => { if (!r.ok) throw new Error('swarm answered ' + r.status); return r.json(); })
        .then((sw) => this.ingest(sw)).finally(() => { this.reading = null; });
    }
    return this.reading;
  }

  // the oracle questions still being answered, at most once a minute
  async refreshOracles() {
    if (Date.now() - this.oracleAt < 60000) return;
    this.oracleAt = Date.now();
    const r = await fetch(API + '/oracle/requests?status=' + ORACLE_OPEN.join(',') + '&limit=20', { cache: 'no-store' });
    if (!r.ok) throw new Error('oracle requests answered ' + r.status);
    const open = new Set();
    for (const q of (await r.json()).requests || []) {
      if (!q.jobId) continue;
      open.add(q.jobId);
      const j = this.job(q.jobId);
      j.oracle = { ...(j.oracle || {}), id: q.id, listed: true };
      if (!j.objective) j.objective = q.question || '';
      j.last = Math.max(j.last, Date.parse(q.updatedAt || q.createdAt) || 0);
    }
    for (const j of this.jobs.values()) if (j.oracle && !open.has(j.id)) j.oracle.listed = false;
  }

  // a followed oracle question: the panel's answers so far and its status, from the detail (current, unlike the list);
  // a job known only from its oracle_assess node finds its request by job id
  async readOracle(jobId) {
    const j = this.jobs.get(jobId);
    if (!j || !(j.oracle || j.nodes.has('oracle_assess'))) return;
    let id = j.oracle && j.oracle.id;
    if (!id) {
      const r = await fetch(API + '/oracle/requests?jobId=' + encodeURIComponent(jobId) + '&limit=1', { cache: 'no-store' });
      const q = r.ok && ((await r.json()).requests || [])[0];
      if (!q) return;
      id = q.id; j.oracle = { id, listed: false };
    }
    const r = await fetch(API + '/oracle/requests/' + encodeURIComponent(id), { cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json(), q = d.request || d;
    j.oracle = { ...j.oracle, status: q.status, panelSize: q.panelSize, quorum: q.quorum,
      members: (q.members || []).map((m) => Number(m.tokenId)).filter(Number.isFinite) };
    if (ORACLE_ENDS[q.status] && !j.ended) j.ended = { state: ORACLE_ENDS[q.status], failure: q.failure || null };
  }

  // its steps a seat works on now (a step the page saw working, unless its seat stopped working minutes ago)
  running(j, now = Date.now()) {
    return [...j.nodes.values()].filter((n) => n.seat != null && STEP_RUNNING.includes(n.state)
      && (!this.seats[n.seat] || this.seats[n.seat].working || now - n.at < STALE_MS));
  }

  // the jobs not over: those a seat works on first, then the newest step change first
  active(now = Date.now()) {
    const out = [];
    for (const j of this.jobs.values()) {
      if (j.ended) continue;
      const seats = this.running(j, now).length;
      if (!seats && !(j.oracle && j.oracle.listed) && now - j.last > JOB_QUIET_MS) continue;
      out.push({ id: j.id, objective: j.objective, state: seats ? 'working' : j.oracle ? 'oracle' : 'waiting', seats, last: j.last });
    }
    return out.sort((a, b) => (b.seats > 0) - (a.seats > 0) || b.last - a.last);
  }

  // a job as JobFollower reads it (the relay's shape, plus the oracle panel); null when the page has not seen it
  record(id, now = Date.now()) {
    const j = this.jobs.get(id);
    if (!j) return null;
    const run = new Set(this.running(j, now));
    const steps = [...j.nodes.values()].map((n) => ({ key: n.key, role: n.role, seat: n.seat, attempt: 1,
      state: run.has(n) ? 'working' : STEP_RUNNING.includes(n.state) ? 'over' : n.state,
      updatedAt: new Date(n.at).toISOString(), live: run.has(n) }));
    const o = j.oracle && j.oracle.members ? { members: j.oracle.members, panelSize: j.oracle.panelSize, quorum: j.oracle.quorum, status: j.oracle.status } : null;
    return { id, objective: j.objective, state: j.ended ? j.ended.state : 'executing',
      blockedReason: j.ended && j.ended.failure ? String(j.ended.failure) : null, steps, oracle: o };
  }
}

// the steps running now, the longest-running first; started: key#attempt -> start, kept between readings
export function runningSteps(steps, started = new Map()) {
  const out = [];
  for (const s of steps || []) {
    if (s.seat == null || !(STEP_RUNNING.includes(s.state) || (s.live && !STEP_OVER.includes(s.state)))) continue;
    const k = s.key + '#' + s.attempt;
    if (!started.has(k)) started.set(k, Date.parse(s.updatedAt) || Date.now());
    out.push({ ...s, start: started.get(k) });
  }
  return out.sort((a, b) => a.start - b.start);
}

// the step the house shows: the one it shows while that still runs, else the one running longest, else none (wait)
export function pickStep(running, current) {
  const same = current && running.find((s) => s.key === current.key && s.seat === current.seat);
  return same || running[0] || null;
}

// when no step runs: the seat that worked on the job last
export function lastWorker(steps) {
  return (steps || []).filter((s) => s.seat != null).sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0))[0] || null;
}

// onChange({type}): start (the first reading: step running now or the last worker, or none; unseen = a hosted page has
// not seen the job), step (another step or seat runs: the house moves; picked = the visitor chose it), waiting (its step
// is over and nothing else runs), answers (an oracle question: how many of its panel answered, the newest one's seat),
// ended (completed, blocked; first = it already was), error (no relay or the plane did not answer; it retries)
// source: a SwarmJobs to read instead of the relay (a hosted page)
export class JobFollower {
  constructor(onChange, source = null) { this.onChange = onChange; this.source = source; this.id = null; this.timer = null; }

  // prefer: a step key the visitor chose; shown if it runs now (several seats can work on one job at once)
  start(id, prefer = null) {
    this.stop();
    this.id = id; this.current = null; this.started = new Map(); this.fails = 0; this.first = true; this.waiting = false;
    this.preferKey = prefer; this.answered = 0; this.rec = null;
    if (!RELAY && !this.source) { this.onChange({ type: 'error', jobId: id, error: 'hosted', hosted: true, first: true }); this.id = null; return; }
    this.poll();
  }

  // the visitor chose a step (in the explorer): read again now, and show its seat if the step runs; else nothing changes
  prefer(key) { if (!this.id) return; this.preferKey = key; this.poll(); }

  stop() { this.id = null; clearTimeout(this.timer); }

  async poll() {
    clearTimeout(this.timer);
    const id = this.id;
    if (!id) return;
    let rec;
    const every = this.source ? FOLLOW_HOSTED_MS : FOLLOW_MS;
    try {
      if (this.source) {
        await this.source.refresh();
        await this.source.readOracle(id);             // only an oracle question reads anything here
        rec = this.source.record(id) || { id, state: 'unseen', steps: [] };
      } else {
        const r = await fetch('/proxy/jobs/' + id + '/steps', { cache: 'no-store' });
        if (!r.ok) throw new Error('the relay answered ' + r.status);
        rec = await r.json();
      }
    } catch (err) {
      if (id !== this.id) return;
      this.fails++;
      this.onChange({ type: 'error', jobId: id, error: String(err.message || err), first: this.first && this.fails === 1 });
      this.timer = setTimeout(() => this.poll(), Math.min(every * 2 ** this.fails, 120000));
      return;
    }
    if (id !== this.id) return;
    this.fails = 0; this.rec = rec;                   // the newest reading, for his whiteboard (main.js)
    const first = this.first;
    this.first = false;
    const o = rec.oracle, answered = o ? o.members.length : 0;
    const answers = () => {
      if (!o || answered === this.answered) return;
      this.answered = answered;
      this.onChange({ type: 'answers', jobId: id, job: rec, answered, panelSize: o.panelSize, quorum: o.quorum, seat: o.members[answered - 1], first });
    };
    if (JOB_ENDED.includes(rec.state)) {
      this.id = null;
      this.onChange({ type: 'ended', jobId: id, job: rec, state: rec.state, first, step: this.current || lastWorker(rec.steps) });
      return;
    }
    const running = runningSteps(rec.steps, this.started);
    const picked = this.preferKey != null ? running.find((s) => s.key === this.preferKey) || null : null;
    this.preferKey = null;
    const next = picked || pickStep(running, this.current);
    if (first) this.onChange({ type: 'start', jobId: id, job: rec, step: next || lastWorker(rec.steps), running: !!next, count: running.length, picked: !!picked, unseen: rec.state === 'unseen' });
    else if (next && (!this.current || next.key !== this.current.key || next.seat !== this.current.seat)) {
      this.onChange({ type: 'step', jobId: id, job: rec, step: next, from: picked || this.waiting ? null : this.current, count: running.length, picked: !!picked });
    } else if (!next && this.current && !this.waiting) {
      this.waiting = true;
      this.onChange({ type: 'waiting', jobId: id, job: rec, from: this.current });
    }
    if (next) { this.current = next; this.waiting = false; }
    answers();
    this.timer = setTimeout(() => this.poll(), every);
  }
}

// A scripted day: every event the house knows, one after another. Each step waits until he has done what it set off
// (reached the place and worked there a few seconds, or finished the scene) and holds a moment before the next one.
// house: () => the House the page shows.
export class DemoFeed {
  constructor(onEvent, onStatus, house) {
    this.onEvent = onEvent; this.onStatus = onStatus; this.house = house; this.timers = [];
    this.data = { tokenId: 'demo', agentId: '00000', attempts: 120, accepted: 7, rejected: 2, failed: 1, pending: 0, queued: 0,
      working: false, last: new Date().toISOString() };
  }

  start() {
    this.stop();
    const D = this.data, h = () => this.house();
    const status = (asleep = false, verifierDown = false, paused = false) => this.onStatus({ seat: 'demo', data: { ...D }, asleep, verifierDown, paused, at: new Date(), live: false });
    const kind = (category, label, base = 'token') => this.onEvent({ type: 'workkind', category, base, label });
    // waits, made when their step starts: true once the scene is over
    const held = (test, s) => { let since = null; return () => { const x = h(); if (x && test(x)) { since = since ?? Date.now(); return Date.now() - since >= s * 1000; } since = null; return false; }; };
    // at the station of the work in hand (whatever the look maps it to) for s seconds
    const working = (s = 4) => held((x) => !!x.current && x.current.name === 'work' && x.state.atStation === x.workKind && !!x.state.action, s);
    const finished = (name) => () => { const x = h(); return !!x && !x.queue.some((q) => q.name === name) && !(x.current && x.current.name === name); };
    const after = (s) => { const t = Date.now() + s * 1000; return () => Date.now() >= t; };
    const phase = (p) => this.onEvent({ type: 'phase', phase: p });
    // the machine wall of a Claude seat: premium on opus-5-5 at xhigh; an oracle question runs a cheaper tier, effort unknown
    const machine = (model) => this.onEvent({ type: 'machine', info: model && machineInfo({ task: { runtime: 'claude', model, step: 'demo' },
      runtimes: [{ id: 'claude', version: 'demo', premiumModel: { model: 'claude-opus-5-5', effort: 'xhigh' } }] }) });
    const update = { current: '0.1.4+011c9f4c', latest: '0.1.4+1103e27b', behind: 3, latestAgeH: 7, needs: true };
    const steps = [                                  // [what happens, wait until, then hold seconds]
      [() => { phase('day'); this.onEvent({ type: 'init', seat: 'demo', data: D, asleep: false, working: false, accepted: D.accepted, verifierDown: false, letter: true }); status(); }, () => finished('letter'), 2],
      [() => { D.queued = 1; this.onEvent({ type: 'phone' }); status(); }, () => finished('phone'), 1],
      [() => { D.queued = 0; D.working = true; this.onEvent({ type: 'work', category: 'token', base: 'token', label: 'token launch work' }); machine('claude-opus-5-5'); status(); }, () => working(), 0],
      [() => { D.attempts++; this.onEvent({ type: 'post', n: 1 }); this.onEvent({ type: 'submitted', category: 'token', label: 'token launch work', task: { nodeKey: 'build_contract_project' } }); status(); }, () => finished('post'), 1],
      [() => { D.accepted++; this.onEvent({ type: 'accepted', n: 1 }); status(); }, () => finished('mail'), 1],
      [() => { kind('website', 'a website', 'other'); status(); }, () => working(), 0],
      [() => { kind('research', 'a research task', 'other'); status(); }, () => working(), 0],
      [() => { kind('video', 'a video task', 'other'); status(); }, () => working(), 0],
      [() => { kind('audio', 'an audio task', 'other'); status(); }, () => working(), 0],
      [() => { kind('image', 'an image task', 'other'); status(); }, () => working(), 0],
      [() => { kind('oracle', 'an oracle question', 'other'); machine('claude-sonnet-5'); status(); }, () => working(), 0],
      [() => { kind('review', 'a review'); machine('claude-opus-5-5'); status(); }, () => working(), 0],
      [() => { kind('tests', 'tests'); status(); }, () => working(), 0],
      [() => { kind('assemble', 'assembly work'); status(); }, () => working(), 0],
      [() => { kind('docs', 'docs'); status(); }, () => working(), 0],
      [() => { kind('fuzz', 'a fuzz run'); status(); }, () => working(), 0],
      [() => { kind('planning', 'planning', 'other'); status(); }, () => working(), 0],
      [() => { kind('indexer', 'an indexer', 'other'); status(); }, () => working(), 0],
      [() => { this.onEvent({ type: 'jobdone', state: 'completed' }); this.onEvent({ type: 'launched', kind: 'custom_token' }); status(); }, () => finished('jobdone'), 3],
      [() => { this.onEvent({ type: 'alarm' }); status(); }, () => after(4), 0],
      [() => { this.onEvent({ type: 'jobdone', state: 'blocked' }); status(); }, () => finished('jobdone'), 1],
      [() => { D.working = false; this.onEvent({ type: 'workdone' }); machine(null); D.failed++; this.onEvent({ type: 'failed', n: 1 }); status(); }, () => finished('smoke'), 2],
      [() => { D.rejected++; this.onEvent({ type: 'rejected', n: 1 }); status(); }, () => finished('mail'), 2],
      // the page knocks for an update 9 s after it arrives: wait for the parcel and the knock to be over
      [() => { this.onEvent({ type: 'update', info: update }); status(); }, () => { const t = after(11), k = finished('knock'); return () => t() && k() && !!h() && h().state.parcel; }, 2],
      [() => { this.onEvent({ type: 'updated', from: update.current, to: update.latest, info: { needs: false } }); status(); }, () => finished('install'), 2],
      [() => { this.onEvent({ type: 'verifier', down: true }); status(false, true); }, () => after(5), 0],
      [() => { this.onEvent({ type: 'verifier', down: false }); status(); }, () => after(1), 1],
      [() => { phase('dusk'); this.onEvent({ type: 'sleep' }); status(true); }, () => held((x) => x.man.pose === 'sleep', 2), 0],
      [() => phase('night'), () => after(3), 0],
      [() => { D.accepted++; this.onEvent({ type: 'accepted', n: 1 }); status(true); }, () => held((x) => x.state.mailbox > 0, 3), 0],
      [() => { phase('dawn'); this.onEvent({ type: 'wake' }); status(); this.timers.push(setTimeout(() => phase('day'), 5000)); }, () => finished('mail'), 2],
      [() => { this.onEvent({ type: 'pause' }); status(false, false, true); }, () => held((x) => x.man.hidden, 4), 0],
      [() => { this.onEvent({ type: 'resume' }); status(); }, () => held((x) => !x.man.hidden && !(x.current && x.current.name === 'away'), 3), 0],
    ];
    let i = 0;
    const next = () => {
      if (i >= steps.length) { this.start(); return; }
      const [run, wait, rest] = steps[i++];
      this.step = i;
      run();
      const done = wait(), t0 = Date.now();
      const check = () => {
        if (done() || Date.now() - t0 > 120000) this.timers.push(setTimeout(next, rest * 1000));   // never stall longer than 2 min
        else this.timers.push(setTimeout(check, 250));
      };
      this.timers.push(setTimeout(check, 250));
    };
    next();
  }

  stop() { this.timers.forEach(clearTimeout); this.timers = []; }
}
