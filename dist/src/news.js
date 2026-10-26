// Reading The IMD Daily in the house (2026-10-26): a popup over the house with one page of the issue's PDF at a time,
// swiped (touch), clicked (Previous / Next) or keyed (arrows); rendered by pdf.js from assets/pdfjs/ (vendored: the swarm
// host allows scripts from the site itself only). The PDF comes straight from the publisher's files (CORS *, range
// requests), page by page, so the 8..23 MB issues load what is looked at.
import { DAILY } from './daily.js';

const $ = (id) => document.getElementById(id);
const here = (p) => new URL(p, import.meta.url).href;

export class NewsReader {
  constructor() {
    this.pdfjs = null; this.doc = null; this.issue = null; this.page = 1; this.pages = 0; this.rendering = 0; this.token = 0;
    this.touch = null;
    $('news-close').addEventListener('click', () => this.close());
    $('news-pop').addEventListener('click', (e) => { if (e.target === $('news-pop')) this.close(); });
    $('news-prev').addEventListener('click', () => this.go(this.page - 1));
    $('news-next').addEventListener('click', () => this.go(this.page + 1));
    document.addEventListener('keydown', (e) => {
      if ($('news-pop').hidden) return;
      if (e.key === 'Escape') this.close();
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); this.go(this.page + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); this.go(this.page - 1); }
    });
    const st = $('news-stage');
    st.addEventListener('touchstart', (e) => { const t = e.touches[0]; this.touch = { x: t.clientX, y: t.clientY, at: Date.now() }; }, { passive: true });
    st.addEventListener('touchend', (e) => {
      const t = this.touch, c = e.changedTouches[0]; this.touch = null;
      if (!t || !c) return;
      const dx = c.clientX - t.x, dy = c.clientY - t.y;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - t.at < 800) this.go(this.page + (dx < 0 ? 1 : -1));
    }, { passive: true });
    window.addEventListener('resize', () => { if (!$('news-pop').hidden && this.doc) this.render(); });
  }

  get open_() { return !$('news-pop').hidden; }

  msg(text) { $('news-msg').textContent = text || ''; }

  // the popup with the issue (daily.js latestIssue); the PDF loads while the first message shows
  async open(issue) {
    const token = ++this.token;
    this.issue = issue; this.page = 1; this.pages = 0;
    $('news-head').textContent = issue.title;
    $('news-meta').textContent = `${issue.isToday ? 'Today\'s issue' : issue.date ? 'The latest issue, ' + issue.date : 'The latest issue'} · No. ${issue.id}` +
      (issue.available && issue.closesAt && issue.closesAt > Date.now() ? ` · a copy collects for ${issue.price} IMD on The IMD Daily, ${Math.max(1, Math.round((issue.closesAt - Date.now()) / 3600000))} h left` : '');
    $('news-open').href = DAILY.site; $('news-count').textContent = ''; $('news-prev').disabled = $('news-next').disabled = true;
    $('news-pop').hidden = false; $('news-close').focus();
    const g = $('news-page').getContext('2d'); g.clearRect(0, 0, $('news-page').width, $('news-page').height);
    if (!issue.pdf) { this.msg('This issue has no PDF address.'); return; }
    this.msg(`Fetching ${issue.title}…`);
    try {
      if (!this.pdfjs) {
        this.pdfjs = await import('../assets/pdfjs/pdf.min.mjs');
        this.pdfjs.GlobalWorkerOptions.workerSrc = here('../assets/pdfjs/pdf.worker.min.mjs');
      }
      if (token !== this.token) return;
      if (this.doc && this.doc.url !== issue.pdf) { try { await this.doc.pdf.destroy(); } catch (e) { /* gone */ } this.doc = null; }
      if (!this.doc) {
        const pdf = await this.pdfjs.getDocument({ url: issue.pdf, wasmUrl: here('../assets/pdfjs/wasm/'), withCredentials: false, disableAutoFetch: true, disableStream: false }).promise;
        if (token !== this.token) { pdf.destroy(); return; }
        this.doc = { url: issue.pdf, pdf, rendered: new Map() };
      }
      this.pages = this.doc.pdf.numPages;
      this.msg('');
      await this.render();
    } catch (e) {
      if (token === this.token) this.msg(`Can't fetch the issue (${(e && e.message) || e}). Read it on The IMD Daily instead.`);
    }
  }

  close() { $('news-pop').hidden = true; this.token++; const c = document.getElementById('game'); if (c) c.focus(); }

  go(n) { if (!this.doc || n < 1 || n > this.pages || n === this.page) return; this.page = n; this.render(); }

  // the current page onto the canvas at the stage's width (device pixels), the next one warmed up
  async render() {
    if (!this.doc) return;
    const token = ++this.rendering, canvas = $('news-page'), stage = $('news-stage');
    $('news-count').textContent = `Page ${this.page} of ${this.pages}`;
    $('news-prev').disabled = this.page <= 1; $('news-next').disabled = this.page >= this.pages;
    try {
      const page = await this.doc.pdf.getPage(this.page);
      if (token !== this.rendering) return;
      // the whole page in view (swiped, not scrolled): the stage's width, or less when the height would not fit
      const base = page.getViewport({ scale: 1 }), maxH = Math.max(260, Math.min(window.innerHeight - 300, 1100));   // the card's chrome takes ~300 px
      const cssW = Math.max(200, Math.min(stage.clientWidth || 640, 900, maxH * base.width / base.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1), scale = cssW / base.width, vp = page.getViewport({ scale: scale * dpr });
      canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
      canvas.style.width = cssW + 'px'; canvas.style.height = Math.round(vp.height / dpr) + 'px';
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      if (this.page < this.pages) this.doc.pdf.getPage(this.page + 1).catch(() => {});
    } catch (e) {
      if (token === this.rendering) this.msg(`Can't draw page ${this.page} (${(e && e.message) || e}).`);
    }
  }
}
