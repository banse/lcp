// The house's own column (docs/own-pane.md, own pane Task 5, 2026-10-26): the right-hand side of the old two-pane page,
// now part of the house's page (owner: "im grunde bauen wir eine seite die den alten splitview nachahmt"). It shows our
// own list (panels/, Jobs and Seats, same origin) or a page Pepe shows: a market chart, the Sworn site, the burn tracker,
// an explorer page (owner: foreign pages only "wenn pepe was zeigen will").
// No button opens it (owner: "kein button, man muss pepe danach fragen dann macht er es"): main.js calls showList(),
// showToken() or showPage() from his answers. The "×" closes it; a close control is not an opener. Over the list the column has
// no head (owner, 2026-10-26: "remove the Jobs & Seats header and make the LCP header take all width above the two panels"):
// the "×" sits at the end of the list's tab row ({type: 'lcp:close'}), and the column starts under the page's header, growing
// to the top as the page scrolls the header away (--column-top). A token or a foreign page keeps a head with its name.
// showToken(ca) (launch panel Task 5, 2026-10-26): a swarm launch's (or IMD's) own pool in the list frame's token view
// (panels/?view=token&ca=), the head names its symbol once the panel has read it, with "Back to the list".
//
// Two frames, each made when first needed: #column-frame is the list (our own origin, not sandboxed, loaded once per
// opening; after that the view, mode, seat and job go to it as messages), #column-page the foreign page (sandboxed as the
// market pane was, so it cannot move this page). Going back to the list keeps the list where it was. Closing drops both
// frames, so nothing keeps reading while the column is shut.
// Messages with the list (panels/panels.js), same origin only:
//   house -> panel  {type: 'lcp:panel', view?, mode?, seat?, job?, wallet}   (on the frame's load, then on every change)
//                   {type: 'lcp:panel', view: 'token', ca}           (showToken; the frame's load sends it again)
//   panel -> house  {type: 'lcp:pick', job} | {type: 'lcp:pick', seat} | {type: 'lcp:pick', token} | {type: 'lcp:view', view}
//                   {type: 'lcp:close'}                               (the "×" in its tab row)
//                   {type: 'lcp:site', url, open}                     (2026-10-28: a swarm site's IPFS preview, url only on
//                                                                     imd-ipfs.xyz/ipfs/<cid>/, open the real site or null)
//                   {type: 'lcp:token', ca, symbol} | {type: 'lcp:token', ca, symbol: null, notLaunch: true}
// The views (launches-portfolio Task 5, 2026-10-26): jobs, seats, launches, oracles (job-detail-oracles Task 4, 2026-10-26: a
// row there expands into its hive in the panel; a click on an agent's cell is a seat pick, {type: 'lcp:pick', seat}), and
// portfolio once the house knows the visitor's wallet. The wallet goes to the panel only by message (wallet: '0x…' or null,
// which forgets it and takes the tab away), never in the frame's url; the frame's load sends it again with the view.
// The grip between the house and the column sets its width (30 % to 70 % of the window), kept in this browser.

const KEY = 'lcp:column';
const MIN = 30, MAX = 70, DEFAULT = 44;
export const IPFS_SITE = /^https:\/\/imd-ipfs\.xyz\/ipfs\/(baf[a-z2-7]{50,100}|Qm[1-9A-HJ-NP-Za-km-z]{44})\/$/;   // a swarm site's preview (showSite)
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals';
const ADDR = /^0x[0-9a-f]{40}$/;
const JOB = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIEWS = ['jobs', 'seats', 'launches', 'oracles', 'portfolio'];
const addrOf = (v) => (typeof v === 'string' && ADDR.test(v.toLowerCase()) ? v.toLowerCase() : null);

const clamp = (n) => Math.max(MIN, Math.min(MAX, n));
function stored() {
  try { const n = Number(localStorage.getItem(KEY)); return Number.isFinite(n) && n > 0 ? clamp(n) : DEFAULT; } catch (e) { return DEFAULT; }
}
function keep(n) { try { localStorage.setItem(KEY, String(Math.round(n * 10) / 10)); } catch (e) { /* no storage: this visit only */ } }

export class Column {
  // panelUrl: the list page (panels/ against the house page, so it works under /pepe/ too); onPick({job} | {seat} | {token});
  // onResize: the column opened, closed or changed width (the house fits itself to what is left)
  // onNotLaunch(ca): the panel's server said the token it shows is no launch (main.js asked the same server first, so rare)
  constructor({ panelUrl, onPick, onResize = () => {}, onNotLaunch = () => {}, root = document.getElementById('column') }) {
    this.panelUrl = panelUrl; this.onPick = onPick; this.onResize = onResize; this.onNotLaunch = onNotLaunch; this.root = root;
    this.$ = (id) => root.querySelector('#' + id);
    this.body = this.$('column-body');
    this.view = 'jobs'; this.state = { seat: null, job: null, mode: null, wallet: null };
    this.list = null; this.page = null; this.listReady = false; this.showing = null;   // null | 'list' | 'token' | 'page'
    this.token = null;                                    // the address the list frame's token view shows (showToken)
    this.symbols = new Map();                             // ca -> symbol the panel told (it tells each token once)
    this.setWidth(stored(), false);
    this.$('column-close').addEventListener('click', () => this.hide());
    this.$('column-back').addEventListener('click', () => this.backToList());
    addEventListener('message', (e) => this.message(e));
    this.grip(this.$('column-grip'));
    this.topQueued = false;
    const queue = () => {
      if (this.topQueued || !this.open) return;
      this.topQueued = true;
      requestAnimationFrame(() => { this.topQueued = false; this.placeTop(); });
    };
    addEventListener('scroll', queue, { passive: true });
    addEventListener('resize', queue);
  }

  get open() { return !this.root.hidden; }

  // the list on a tab ('jobs' | 'seats' | 'launches' | 'oracles' | 'portfolio', the last only with a wallet): loaded the first time,
  // after that only told
  showList(view = this.view) {
    this.view = this.viewOf(view);
    this.token = null;
    if (!this.list) this.makeList();                      // its load tells the panel the job to open (this.opening)
    else { this.post({ view: this.view, ...(this.opening ? { open: this.opening } : {}), ...(this.openingSeat != null ? { openSeat: this.openingSeat } : {}) }); this.opening = null; this.openingSeat = null; }
    this.dropPage();
    this.list.hidden = false;
    this.head(null);
    this.showing = 'list';
    this.show();
  }

  // a token's own pool in the list frame's token view; the head is its address until the panel names its symbol
  showToken(ca) {
    ca = String(ca || '').toLowerCase();
    if (!ADDR.test(ca)) return;
    const again = this.showing === 'token' && this.token === ca;
    this.token = ca;
    if (!this.list) this.makeList();
    else this.post({ view: 'token', ca });
    this.dropPage();
    this.list.hidden = false;
    if (!again) this.head(this.symbols.get(ca) || ca.slice(0, 6) + '…' + ca.slice(-4), null, true, false);
    this.showing = 'token';
    this.show();
  }

  // a swarm site's preview from IPFS (2026-10-28, owner: "if a website is built by the swarm, use the ipfs link for preview"): only
  // a URL on the gateway (IPFS_SITE), its head named after the real site, whose https URL "open" takes in a new tab; false otherwise
  showSite(url, open = null) {
    if (typeof url !== 'string' || !IPFS_SITE.test(url)) return false;
    let real = null;
    try { const u = new URL(open); if (u.protocol === 'https:' && !u.username && !u.password) real = u.href; } catch (e) { /* no real site */ }
    this.showPage({ url, name: real ? new URL(real).hostname : 'a swarm site, from IPFS', open: real || url });
    return true;
  }

  // a page Pepe shows: url in the frame, name in the head, open = the real site (a new tab); faint: the name's first characters
  // barely visible (0x's "0", 2026-10-28)
  showPage({ url, name, open = url, faint = 0 }) {
    this.token = null;                                    // the list frame keeps its view until "Back to the list"
    if (!this.page) {
      const f = this.page = document.createElement('iframe');
      f.id = 'column-page'; f.referrerPolicy = 'strict-origin-when-cross-origin'; f.allow = 'clipboard-write';
      f.setAttribute('sandbox', SANDBOX);
      this.body.append(f);
    }
    this.page.title = name; this.page.src = url; this.page.hidden = false;
    if (this.list) this.list.hidden = true;
    this.head(name, open, !!open, true, faint);
    this.showing = 'page';
    this.show();
  }

  backToList() { this.showList(this.view); }

  // the Seats tab with one agent's detail open (2026-10-28: his own page, "who owns you"); the panel opens it once its row is listed
  showSeat(n) {
    if (!Number.isInteger(n) || n < 0 || n >= 2000) return;
    this.openingSeat = n;
    this.showList('seats');
  }

  // the Jobs tab with one job open, its description whole (owner, 2026-10-27: the job id in the lede "opens the job with
  // expanded description in the right panel"); the panel opens it once its row is listed
  showJob(id) {
    if (!JOB.test(String(id || ''))) return;
    this.opening = String(id).toLowerCase();
    this.showList('jobs');
  }

  hide() {
    if (!this.open) return;
    this.dropPage();
    if (this.list) { this.list.remove(); this.list = null; this.listReady = false; }
    this.root.hidden = true; this.showing = null; this.token = null;
    document.body.classList.remove('with-column');
    this.onResize();
  }

  // what the house shows now; the list marks that row and takes the mode; wallet: the visitor's (null forgets it: the
  // panel drops its Portfolio tab and, if it showed it, goes back to Jobs)
  sync({ seat, job, mode, wallet } = {}) {
    if (seat !== undefined) this.state.seat = Number.isInteger(seat) ? seat : null;
    if (job !== undefined) this.state.job = job || null;
    if (mode !== undefined) this.state.mode = mode === 'light' || mode === 'dark' ? mode : null;
    if (wallet !== undefined) {
      this.state.wallet = addrOf(wallet);
      if (!this.state.wallet && this.view === 'portfolio') this.view = 'jobs';
    }
    this.post({ ...this.state });
  }

  viewOf(view) { return VIEWS.includes(view) && (view !== 'portfolio' || this.state.wallet) ? view : 'jobs'; }

  // ---------- inside ----------
  // the list frame, on what the column shows now (a token or a tab); its load sends the whole state, so a token view
  // asked before the frame was ready is not pulled back to the Jobs tab
  makeList() {
    const f = this.list = document.createElement('iframe');
    f.id = 'column-frame'; f.title = 'The swarm\'s jobs and seats';
    const u = new URL(this.panelUrl);
    u.searchParams.set('view', this.token ? 'token' : this.view);   // portfolio without its wallet: the load's message has it
    if (this.token) u.searchParams.set('ca', this.token);
    if (this.state.mode) u.searchParams.set('mode', this.state.mode);
    if (this.state.seat != null) u.searchParams.set('seat', String(this.state.seat));
    if (this.state.job) u.searchParams.set('job', this.state.job);
    this.listReady = false;
    f.addEventListener('load', () => {
      this.listReady = true;
      this.post({ ...this.state, ...(this.token ? { view: 'token', ca: this.token } : { view: this.view }), ...(this.opening ? { open: this.opening } : {}),
        ...(this.openingSeat != null ? { openSeat: this.openingSeat } : {}) });
      this.opening = null; this.openingSeat = null;
    });
    f.src = u.href;
    this.body.append(f);
  }

  show() {
    const was = this.open;
    this.root.hidden = false;
    document.body.classList.add('with-column');
    this.placeTop();
    if (!was) this.onResize();
  }

  // where the column starts (wide windows, where it is fixed): under the page's header and its margin, as the house does; 0
  // once the page has scrolled the header away
  placeTop() {
    const bar = document.querySelector('.topbar');
    let top = 0;
    if (bar) top = bar.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(bar).marginBottom) || 0);
    this.root.style.setProperty('--column-top', Math.max(0, Math.round(top)) + 'px');
  }

  dropPage() {
    if (!this.page) return;
    this.page.remove(); this.page = null;                 // the foreign page stops (sound, timers) with its frame
  }

  // name null: no head (the list); back: "Back to the list" (a foreign page has it, and so has a token); close: the "×" (not
  // for a token: the list frame's own tab row has it)
  head(name, open = null, back = !!open, close = true, faint = 0) {
    this.$('column-head').hidden = name == null;
    if (name == null) return;
    const el = this.$('column-name');
    if (faint > 0) el.replaceChildren(Object.assign(document.createElement('span'), { className: 'name-faint', textContent: name.slice(0, faint) }), name.slice(faint));
    else el.textContent = name;
    const a = this.$('column-open');
    a.hidden = !open; if (open) { a.href = open; a.title = 'Open ' + name + ' in a new tab'; } else a.removeAttribute('href');
    this.$('column-back').hidden = !back;
    this.$('column-close').hidden = !close;
  }

  post(msg) {
    if (!this.list || !this.listReady || !this.list.contentWindow) return;   // the load event sends everything
    this.list.contentWindow.postMessage({ type: 'lcp:panel', ...msg }, location.origin);
  }

  message(e) {
    if (!this.list || e.source !== this.list.contentWindow || e.origin !== location.origin) return;
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'lcp:view' && VIEWS.includes(d.view) && this.viewOf(d.view) === d.view) {
      this.view = d.view;
      if (this.showing === 'token') { this.token = null; this.showing = 'list'; this.head(null); }   // a tab inside it
    }
    if (d.type === 'lcp:close') { this.hide(); return; }
    if (d.type === 'lcp:token' && this.showing === 'token' && typeof d.ca === 'string' && d.ca.toLowerCase() === this.token) {
      if (d.notLaunch) { this.head('Not a swarm launch', null, true, false); this.onNotLaunch(this.token); return; }
      if (typeof d.symbol === 'string' && d.symbol) {
        const sym = d.symbol.slice(0, 32);
        if (this.symbols.size > 50) this.symbols.clear();
        this.symbols.set(this.token, sym);
        this.head(sym, null, true, false);                // textContent: as text
      }
      return;
    }
    if (d.type === 'lcp:site') { this.showSite(d.url, d.open); return; }
    if (d.type !== 'lcp:pick') return;
    if (typeof d.job === 'string' && JOB.test(d.job)) this.onPick({ job: d.job.toLowerCase() });
    else if (Number.isInteger(d.seat) && d.seat >= 0 && d.seat < 2000) this.onPick({ seat: d.seat });
    else if (addrOf(d.token)) this.onPick({ token: addrOf(d.token) });   // a launch or a holding: its token view
  }

  setWidth(pct, save = true) {
    this.width = clamp(pct);
    document.documentElement.style.setProperty('--column-w', this.width + 'vw');
    const g = this.$('column-grip');
    if (g) g.setAttribute('aria-valuenow', String(Math.round(this.width)));
    if (save) keep(this.width);
  }

  // drag (mouse, pen, touch) or the arrow keys; the frames take no pointer events while dragging, so the drag survives
  // passing over them
  grip(g) {
    if (!g) return;
    const at = (x) => (window.innerWidth - x) / window.innerWidth * 100;
    g.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      e.preventDefault();
      g.setPointerCapture(e.pointerId);
      this.root.classList.add('dragging');
      const move = (ev) => { this.setWidth(at(ev.clientX), false); this.onResize(); };
      const up = () => {
        g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up);
        this.root.classList.remove('dragging');
        keep(this.width); this.onResize();
      };
      g.addEventListener('pointermove', move); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
    });
    g.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowLeft' ? 2 : e.key === 'ArrowRight' ? -2 : 0;
      if (!step) return;
      e.preventDefault();
      this.setWidth(this.width + step); this.onResize();
    });
  }
}
