// The house in full screen (2026-10-27, owner: "add a "fullscreen mode" for the house, which isnt actually fullscreen
// everytime, only when theres no panel right, except it takes the full panel screen, while jobs list etc. keeps being
// visible. if no other space available on screen, cmd line and pepe response msgs move into the white place before the
// house"). On from the frog's menu or the talk line ("full screen"); off from the same menu, Esc, "exit full screen", or the
// browser's own way out of its full screen (its Esc, its bar), which ends the mode, not only the browser's part.
// The layout (html[data-full], style.css; main.js fit) follows what is beside the house:
//   house  the column is shut: the browser's full screen of the page (the Fullscreen API) with the house as large as it
//          fits; where the browser has none for a page (iPhone Safari) or will not give it without a click or a key just
//          before (the column closed from its frame, a message), the house fills the window instead
//   side   the column is open on a wide window: the house fills everything left of it, under the top bar; the column
//          stays as it is. Never the browser's full screen: opening the column there leaves it
//   flow   the column is open under the house (narrower than 900 px): the page as it is, the column under the house
// In all three the title, the lede and the diary give way. The frog stays: in the top bar, or in the corner (house).

// the ground strip in front of the house, in world units of the 480 x 320 house: the paper under his feet line (298), below
// the walls (x 52-448), where the talk line goes when there is no room beside or under the house (never over his rooms)
export const STRIP = { left: 52, right: 448, top: 299.5, bottom: 318.5 };
const WORLD = { w: 480, h: 320 };

// box: {x, y, w, h} to fill (px). The house (3:2) as large as it holds; the talk line under it when that leaves `below` px,
// else beside it when that leaves `beside` px, else over the strip. A strip lower than minStrip px cannot hold the line:
// then the house gives way to room under it. step: whole multiples of the world's width only (the pixel look). top: the
// house at the top of the box (beside the column, level with it), not in the middle. pad: the talk line keeps that far from
// the box's edges where the box is the screen (the house may touch them, the text should not).
// Returns {house: {x, y, w, h}, talk: {x, y, w, h}, where: 'below' | 'beside' | 'over'}.
export function place(box, { below = 96, beside = 240, gap = 8, minStrip = 26, step = 0, top = false, pad = 0 } = {}) {
  const fit = (w) => (step ? Math.max(step, Math.floor(w / step) * step) : Math.floor(w));
  let w = fit(Math.min(box.w, box.h * WORLD.w / WORLD.h)), h = w * WORLD.h / WORLD.w;
  let where = box.h - h >= below ? 'below' : box.w - w >= beside + gap ? 'beside' : 'over';
  const k = w / WORLD.w;
  if (where === 'over' && (STRIP.bottom - STRIP.top) * k < minStrip) {
    w = fit(Math.min(box.w, Math.max(0, box.h - below) * WORLD.w / WORLD.h)); h = w * WORLD.h / WORLD.w; where = 'below';
  }
  if (where === 'below') {
    const m = top ? 0 : Math.max(0, (box.h - h - below) / 2), x = box.x + (box.w - w) / 2, y = box.y + m;
    const ix = Math.max(0, pad - (x - box.x));
    return { where, house: { x, y, w, h }, talk: { x: x + ix, y: y + h + gap, w: w - 2 * ix, h: box.y + box.h - (y + h + gap) - pad } };
  }
  if (where === 'beside') {
    const tw = Math.min(box.w - w - gap - pad, 460), x = box.x + (box.w - w - gap - tw) / 2, y = box.y + (top ? 0 : (box.h - h) / 2);
    return { where, house: { x, y, w, h }, talk: { x: x + w + gap, y: y + pad, w: tw, h: h - 2 * pad } };
  }
  const x = box.x + (box.w - w) / 2, y = box.y + (top ? 0 : (box.h - h) / 2), s = w / WORLD.w;
  return { where, house: { x, y, w, h },
    talk: { x: x + STRIP.left * s, y: y + STRIP.top * s, w: (STRIP.right - STRIP.left) * s, h: (STRIP.bottom - STRIP.top) * s } };
}

// the browser's full screen of the page, prefixed where an older Safari (iPad) has only that
const el = () => document.documentElement;
export const api = {
  can: () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !!(el().requestFullscreen || el().webkitRequestFullscreen),
  element: () => document.fullscreenElement || document.webkitFullscreenElement || null,
  request: () => (el().requestFullscreen ? el().requestFullscreen({ navigationUI: 'hide' }) : Promise.resolve(el().webkitRequestFullscreen())),
  exit: () => (document.exitFullscreen ? document.exitFullscreen() : Promise.resolve(document.webkitExitFullscreen && document.webkitExitFullscreen())),
};

// on: the visitor wants it; browser: the browser's full screen holds the page now. columnOpen() and wide() say where the
// column is (main.js); onChange(this, why) after every change ('browser': the browser's way out ended it)
export class FullScreen {
  constructor({ columnOpen = () => false, wide = () => true, onChange = () => {} } = {}) {
    this.on = false; this.leaving = false;
    this.columnOpen = columnOpen; this.wide = wide; this.onChange = onChange;
    for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => this.changed());
  }

  get browser() { return !!api.element(); }
  get layout() { return !this.on ? null : !this.columnOpen() ? 'house' : this.wide() ? 'side' : 'flow'; }

  // 'browser' (asked for: the browser decides), 'window' (no browser full screen to be had: the window), 'side', 'flow'
  enter() {
    if (this.on) return this.how();
    this.on = true;
    const how = this.columnOpen() ? this.layout : this.request() ? 'browser' : 'window';
    this.onChange(this);
    return how;
  }

  leave() {
    if (!this.on) return false;
    this.on = false;
    this.exit();
    this.onChange(this);
    return true;
  }

  how() { return this.layout === 'house' ? (this.browser ? 'browser' : 'window') : this.layout; }

  // the column opened or closed while on: open leaves the browser's full screen (the house beside the column is not one);
  // closed asks for it again, which a browser gives only right after a click or a key; else the house fills the window
  column(open) {
    if (!this.on) return;
    if (open) this.exit(); else this.request();
    this.onChange(this);
  }

  // true when asked (the browser may still refuse: then the window it is, nothing else changes)
  request() {
    if (!api.can() || api.element()) return !!api.element();
    const act = navigator.userActivation;
    if (act && !act.isActive) return false;                           // no click or key just before: it would refuse
    try { Promise.resolve(api.request()).catch(() => {}); return true; } catch (e) { return false; }
  }

  exit() {
    if (!api.element()) return;
    this.leaving = true;
    try { Promise.resolve(api.exit()).catch(() => { this.leaving = false; }); } catch (e) { this.leaving = false; }
  }

  changed() {
    if (api.element()) { this.onChange(this); return; }
    if (this.leaving) { this.leaving = false; this.onChange(this); return; }
    if (this.on) { this.on = false; this.onChange(this, 'browser'); }   // the browser's Esc or its bar: the mode ends
  }
}
