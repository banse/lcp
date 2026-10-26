// The IMD look (2026-10-24): imd.fun's engraved black-and-white room with its green screens, and its pepe and dog
// sprites (assets/imd, see NOTICE.md) with the moves imd.fun gives them, on the same floor plan as the pixel house.
// Drawn smooth at 3x the 480 x 320 world grid.
import { W, H, FLIGHTS, ROOMS, WINDOWS, skyPhase } from '../world.js';
import { MAPPINGS } from '../mapping.js';
import { IMD_SPOTS, THINGS } from './imd-layout.js';

const S = 3;
const C = {
  page: '#000000', paper: '#f4f4f2', paper2: '#e6e6e6', wall: '#d6d6d2', greyL: '#bbbbb6', grey: '#9a9a96',
  greyM: '#7d7d79', greyD: '#5c5c58', ink: '#0b0b0b', glass: '#040804', green: '#38d050', greenD: '#208030',
  greenL: '#88d090', red: '#ff6b62', redD: '#b3261e', amber: '#e0a92a', blue: '#9fd3ff',
};
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
// the page behind the house: by day the window blue with an ink sun and light grey clouds (the owner's pick of four
// previews, 2026-10-24); at dawn a soft peach with the sun low in the east (left), at dusk an orange with the sun low
// in the west (right); the windows show the same sky. Night keeps imd.fun's black page.
const SKY = {
  day: { page: C.blue, line: C.ink, glass: C.blue, cloud: '#e2e2de', sun: C.paper, sunAt: [30, 30] },
  dawn: { page: '#f6cdb0', line: C.ink, glass: '#f6cdb0', cloud: '#fdeee3', sun: '#ffe9a8', sunAt: [28, 234] },
  dusk: { page: '#e89a6c', line: C.ink, glass: '#e89a6c', cloud: '#f3c3a4', sun: C.amber, sunAt: [461, 168] },
};

// ---------- small drawing helpers (world units) ----------
const R = (a, b) => a + Math.random() * (b - a);
function seeded(seed) { let h = seed >>> 0; return () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; }; }
function ln(g, x0, y0, x1, y1, w = 0.5, c = C.ink) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineWidth = w; g.strokeStyle = c; g.stroke(); }
function box(g, x, y, w, h, fill = C.paper, lw = 0.6) {
  if (fill) { g.fillStyle = fill; g.fillRect(x, y, w, h); }
  if (lw) { g.lineWidth = lw; g.strokeStyle = C.ink; g.strokeRect(x, y, w, h); }
}
function rbox(g, x, y, w, h, r, fill = C.paper, lw = 0.6) {
  g.beginPath(); g.roundRect(x, y, w, h, r);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (lw) { g.lineWidth = lw; g.strokeStyle = C.ink; g.stroke(); }
}
function disc(g, cx, cy, r, fill = C.paper, lw = 0.6) {
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (lw) { g.lineWidth = lw; g.strokeStyle = C.ink; g.stroke(); }
}
// engraving shade: parallel diagonal lines clipped to a rectangle
function hatch(g, x, y, w, h, gap = 1.4, alpha = 0.45, lw = 0.25, dir = 1) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.globalAlpha = alpha; g.lineWidth = lw; g.strokeStyle = C.ink; g.beginPath();
  for (let k = -h; k < w + h; k += gap) { g.moveTo(x + k, y); g.lineTo(x + k + dir * h, y + h); }
  g.stroke(); g.restore();
}
function dots(g, x, y, w, h, gap = 2.4, r = 0.24, alpha = 0.3) {
  g.save(); g.globalAlpha = alpha; g.fillStyle = C.ink;
  for (let j = 0, yy = y + gap / 2; yy < y + h; yy += gap, j++) {
    for (let xx = x + gap / 2 + (j % 2) * gap / 2; xx < x + w; xx += gap) { g.beginPath(); g.arc(xx, yy, r, 0, Math.PI * 2); g.fill(); }
  }
  g.restore();
}
function text(g, s, x, y, size, color = C.ink, weight = 600, align = 'left') {
  g.font = `${weight} ${size}px ${MONO}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'alphabetic'; g.fillText(s, x, y);
}

// ---------- the house, drawn once ----------
function roof(g) {
  box(g, 318, 8, 16, 36, C.paper, 0.7);                     // chimney behind the roof
  for (let y = 12; y < 44; y += 4) ln(g, 318, y, 334, y, 0.3);
  for (let y = 8, j = 0; y < 44; y += 4, j++) for (let x = 318 + (j % 2) * 4; x < 334; x += 8) ln(g, x, y, x, y + 4, 0.3);
  box(g, 315, 5, 22, 4, C.ink, 0);
  g.beginPath(); g.moveTo(250, 4); g.lineTo(468, 52); g.lineTo(32, 52); g.closePath();
  g.fillStyle = C.wall; g.fill();
  g.save(); g.clip();
  for (let y = 9, j = 0; y < 52; y += 4.5, j++) {
    ln(g, 30, y, 470, y, 0.35);
    for (let x = 30 + (j % 2) * 5; x < 470; x += 10) ln(g, x, y - 4.5, x, y, 0.3);
  }
  hatch(g, 30, 4, 220, 48, 1.6, 0.28, 0.25, -1);
  g.restore();
  g.beginPath(); g.moveTo(250, 4); g.lineTo(468, 52); g.lineTo(32, 52); g.closePath(); g.lineWidth = 1.1; g.strokeStyle = C.ink; g.stroke();
  disc(g, 250, 31, 7.5, C.paper, 0.9);                       // attic window
  disc(g, 250, 31, 5.5, '#141414', 0.5);
  ln(g, 250, 25.5, 250, 36.5, 0.7, C.paper); ln(g, 244.5, 31, 255.5, 31, 0.7, C.paper);
}

const TEXTURE = {
  kitchen: (g, x, y, w, h) => { for (let yy = y + 32; yy < y + 48; yy += 4) ln(g, x, yy, x + w, yy, 0.18); for (let xx = x; xx < x + w; xx += 4) ln(g, xx, y + 32, xx, y + 48, 0.18); dots(g, x, y, w, 30, 3, 0.2, 0.2); },
  living: (g, x, y, w, h) => { for (let xx = x + 2; xx < x + w; xx += 5) ln(g, xx, y, xx, y + h, 0.14, C.greyM); },
  study: (g, x, y, w, h) => dots(g, x, y, w, h, 2.6, 0.26, 0.28),
  music: (g, x, y, w, h) => hatch(g, x, y, w, h, 3.2, 0.16, 0.25),
  bedroom: (g, x, y, w, h) => { g.save(); g.globalAlpha = 0.25; for (let yy = y + 4; yy < y + h; yy += 8) for (let xx = x + 4 + ((yy / 8) % 2) * 4; xx < x + w; xx += 8) { ln(g, xx - 0.8, yy, xx + 0.8, yy, 0.25); ln(g, xx, yy - 0.8, xx, yy + 0.8, 0.25); } g.restore(); },
  bath: (g, x, y, w, h) => { for (let yy = y + 40; yy < y + h; yy += 5) ln(g, x, yy, x + w, yy, 0.2); for (let xx = x; xx < x + w; xx += 5) ln(g, xx, y + 40, xx, y + h, 0.2); },
  stair: (g, x, y, w, h) => { for (let yy = y + 6; yy < y + h; yy += 9) ln(g, x, yy, x + w, yy, 0.12, C.greyM); },
};

function rooms(g) {
  for (const [name, x0, y0, x1, y1] of ROOMS) {
    const w = x1 - x0, h = y1 - y0;
    box(g, x0, y0, w, h, name === 'stair' ? C.paper2 : C.paper, 0);
    TEXTURE[name](g, x0, y0, w, h);
    hatch(g, x0, y0, w, 6, 1.1, 0.4, 0.25);                  // shade under the ceiling
    ln(g, x0, y1 - 2, x1, y1 - 2, 0.4);                        // skirting
  }
  g.save(); g.globalCompositeOperation = 'destination-out';
  for (const [x0, y0, x1, y1] of WINDOWS) g.fillRect(x0, y0, x1 - x0, y1 - y0);   // glass is drawn every frame
  g.restore();
  for (const [x0, y0, x1, y1] of WINDOWS) {
    g.lineWidth = 1.4; g.strokeStyle = C.ink; g.strokeRect(x0 - 0.7, y0 - 0.7, x1 - x0 + 1.4, y1 - y0 + 1.4);
    ln(g, (x0 + x1) / 2, y0, (x0 + x1) / 2, y1, 0.8); ln(g, x0, (y0 + y1) / 2, x1, (y0 + y1) / 2, 0.8);
    box(g, x0 - 3, y1 + 1, x1 - x0 + 6, 2, C.paper, 0.5);     // sill
  }
}

function machineWall(g) {
  const m = THINGS.machine, sc = THINGS.screen;
  box(g, m.x, m.y, m.w, m.h, C.paper2, 0.8);
  box(g, m.x + 1.5, m.y + 1.5, 12, m.h - 3, C.paper, 0.5);                    // left panel: knobs, a dial, a slider
  for (const [cy] of [[m.y + 7], [m.y + 14]]) { disc(g, m.x + 4.5, cy, 1.8, C.paper, 0.5); disc(g, m.x + 10.5, cy, 1.8, C.paper, 0.5); ln(g, m.x + 4.5, cy, m.x + 5.5, cy - 1.4, 0.4); }
  disc(g, m.x + 7.5, m.y + 25, 4.5, C.paper, 0.6); ln(g, m.x + 7.5, m.y + 25, m.x + 10, m.y + 22.5, 0.5);
  for (let a = 0; a < 7; a++) { const t = Math.PI * (0.85 + a * 0.22); ln(g, m.x + 7.5 + Math.cos(t) * 3.6, m.y + 25 + Math.sin(t) * 3.6, m.x + 7.5 + Math.cos(t) * 4.3, m.y + 25 + Math.sin(t) * 4.3, 0.3); }
  box(g, m.x + 4, m.y + 34, 7, 1.2, C.ink, 0); box(g, m.x + 6, m.y + 32.6, 2.4, 4, C.paper, 0.5);
  box(g, sc.x - 1.5, sc.y - 1.5, sc.w + 3, sc.h + 3, C.ink, 0);              // main screen bezel; the glass is live
  for (let i = 0; i < 8; i++) box(g, sc.x + 1 + i * 3.6, sc.y + sc.h + 4, 2.2, 1.6, C.paper, 0.4);   // LED row
  for (let i = 0; i < 4; i++) rbox(g, sc.x + 1 + i * 7.4, sc.y + sc.h + 9, 5.4, 4, 0.8, C.paper, 0.5);
  box(g, m.x + 46, m.y + 1.5, 10.5, m.h - 3, C.paper, 0.5);                   // right panel: small screen, gauge, switches
  box(g, m.x + 47.5, m.y + 4, 7.5, 5, C.glass, 0.4);
  disc(g, m.x + 51.2, m.y + 18, 4, C.paper, 0.6); ln(g, m.x + 51.2, m.y + 18, m.x + 49, m.y + 15.6, 0.5);
  for (let i = 0; i < 3; i++) { box(g, m.x + 48 + i * 2.6, m.y + 28, 1.4, 4, C.paper, 0.4); ln(g, m.x + 48.7 + i * 2.6, m.y + 28, m.x + 48.7 + i * 2.6, m.y + 26.4, 0.5); }
  disc(g, m.x + 51.2, m.y + 39, 2, C.paper, 0.5);
  box(g, 62, 186, 66, 3.2, C.ink, 0);                                         // console top, front, legs
  box(g, 64, 189.2, 62, 8, C.paper, 0.6); ln(g, 95, 189.2, 95, 197.2, 0.4); disc(g, 92, 193, 0.7, C.ink, 0); disc(g, 98, 193, 0.7, C.ink, 0);
  ln(g, 66, 197, 66, 208, 0.9); ln(g, 124, 197, 124, 208, 0.9);
  box(g, 84, 183.6, 22, 2.4, C.paper2, 0.5); for (let x = 86; x < 105; x += 2) ln(g, x, 183.8, x, 185.8, 0.2);
}

function furniture(g) {
  // ---- study: machine wall + console, picture wall (live), easel, bookshelf
  machineWall(g);
  const e = THINGS.easel;
  ln(g, e.x + 9, e.y - 2, e.x + 1, 208, 0.8); ln(g, e.x + 9, e.y - 2, e.x + 17, 208, 0.8); ln(g, e.x + 9, e.y, e.x + 9, 208, 0.5);
  box(g, e.x, e.y, e.w, e.h, C.paper, 0.7); box(g, e.x - 1, e.y + e.h, e.w + 2, 1.6, C.ink, 0);
  box(g, 166, 140, 28, 68, C.paper, 0.8);
  const rnd = seeded(5), fills = [C.paper, C.wall, C.greyM, C.ink, C.paper2, C.greyL];
  for (const y of [141, 157, 173, 189]) {
    for (let x = 167.5; x < 192; ) {
      const w = 1.8 + rnd() * 1.6, h = 9 + rnd() * 5, f = fills[Math.floor(rnd() * fills.length)];
      if (x + w > 192.5) break;
      box(g, x, y + 15 - h, w, h, f, 0.35); if (f === C.paper && rnd() < 0.5) hatch(g, x, y + 15 - h, w, h, 0.9, 0.5);
      x += w + 0.25;
    }
    box(g, 166, y + 15, 28, 1.4, C.ink, 0);
  }
  // ---- music room: piano, oscilloscope (live glass), record cabinet, telescope
  box(g, 206, 166, 38, 42, C.ink, 0); ln(g, 208, 168, 208, 206, 0.4, C.greyM); ln(g, 242, 168, 242, 206, 0.4, C.greyM);
  box(g, 206, 185, 38, 5, C.paper, 0.5); for (let x = 207.5; x < 243; x += 2.2) ln(g, x, 185, x, 190, 0.25);
  for (let x = 208.6; x < 242; x += 2.2) if (Math.round((x - 208.6) / 2.2) % 7 !== 2 && Math.round((x - 208.6) / 2.2) % 7 !== 6) box(g, x, 185, 1.1, 3, C.ink, 0);
  box(g, 216, 158, 18, 8, C.paper, 0.5); for (let i = 0; i < 3; i++) ln(g, 218, 160.5 + i * 2, 232, 160.5 + i * 2, 0.25);
  box(g, 207, 203, 3, 5, C.ink, 0); box(g, 240, 203, 3, 5, C.ink, 0);
  const sp = THINGS.scope;
  rbox(g, sp.x, sp.y, sp.w, sp.h, 1.2, C.paper2, 0.7); box(g, sp.x + 2, sp.y + 2, 17, sp.h - 4, C.glass, 0.4);
  disc(g, sp.x + 22.5, sp.y + 5, 1.6, C.paper, 0.5); disc(g, sp.x + 22.5, sp.y + 11.5, 1.6, C.paper, 0.5);
  box(g, 264, 190, 28, 18, C.paper, 0.7); hatch(g, 266, 193, 11, 13, 0.9, 0.55); box(g, 279, 193, 11, 13, C.paper, 0.4);
  g.beginPath(); g.ellipse(277, 188.6, 9, 1.8, 0, 0, Math.PI * 2); g.fillStyle = C.ink; g.fill();
  ln(g, 286, 187, 281, 188.5, 0.5);
  ln(g, 326, 186, 317, 208, 0.7); ln(g, 326, 186, 326, 208, 0.7); ln(g, 326, 186, 335, 208, 0.7);
  g.save(); g.translate(326, 185); g.rotate(-0.62);
  box(g, -12, -3, 28, 6, C.paper, 0.7); box(g, 16, -3.8, 4, 7.6, C.paper2, 0.6); box(g, -15, -1.6, 3, 3.2, C.ink, 0); hatch(g, -12, 0, 28, 3, 0.9, 0.5);
  g.restore();
  // ---- living room: lamp, TV cabinet, TV (live glass), phone table, fireplace, rug
  const tv = THINGS.tv;
  box(g, tv.x - 3, tv.y + tv.h, tv.w + 6, 290 - tv.y - tv.h, C.paper, 0.6); hatch(g, tv.x - 3, tv.y + tv.h, tv.w + 6, 290 - tv.y - tv.h, 1.2, 0.3);
  rbox(g, tv.x, tv.y, tv.w, tv.h, 2, C.paper2, 0.8);
  box(g, tv.x + tv.w - 6, tv.y + 3, 4, tv.h - 6, C.paper, 0.4); disc(g, tv.x + tv.w - 4, tv.y + 8, 1.2, C.paper, 0.4); disc(g, tv.x + tv.w - 4, tv.y + 14, 1.2, C.paper, 0.4);
  ln(g, tv.x + 12, tv.y, tv.x + 6, tv.y - 9, 0.5); ln(g, tv.x + 16, tv.y, tv.x + 22, tv.y - 9, 0.5);
  armchair(g);
  ln(g, 276, 276, 275, 290, 0.6); ln(g, 286, 276, 287, 290, 0.6); box(g, 273, 275, 16, 1.6, C.ink, 0);
  box(g, 296, 244, 52, 46, C.paper, 0.8);
  for (let y = 247, j = 0; y < 290; y += 4, j++) { ln(g, 296, y, 348, y, 0.25); for (let x = 296 + (j % 2) * 4; x < 348; x += 8) ln(g, x, y - 3, x, y, 0.25); }
  box(g, 293, 240, 58, 4, C.ink, 0);
  const fp = THINGS.fire; box(g, fp.x - 2, fp.y - 2, fp.w + 4, fp.h + 2, C.paper, 0.6); box(g, fp.x, fp.y, fp.w, fp.h, C.ink, 0);
  disc(g, 302, 234, 4, C.paper, 0.7); ln(g, 302, 234, 302, 231.5, 0.5); ln(g, 302, 234, 304, 234, 0.5);
  rbox(g, 338, 232, 6, 8, 2, C.paper, 0.6); hatch(g, 338, 232, 6, 8, 0.9, 0.5);
  box(g, 226, 288.4, 70, 1.6, C.greyD, 0);
  // ---- kitchen: shelf with jars, counter + sink, stove, fridge, bowl
  box(g, 100, 236, 52, 1.6, C.ink, 0);
  for (const [x, w, h] of [[103, 6, 8], [111, 5, 6], [118, 6, 9], [126, 5, 7], [134, 7, 8], [143, 5, 6]]) { rbox(g, x, 236 - h, w, h, 1, C.paper, 0.5); box(g, x + 0.8, 236 - h - 1, w - 1.6, 1.2, C.ink, 0); }
  box(g, 62, 264, 50, 26, C.paper, 0.7); ln(g, 87, 264, 87, 290, 0.5); disc(g, 84.5, 276, 0.7, C.ink, 0); disc(g, 89.5, 276, 0.7, C.ink, 0);
  box(g, 60, 261, 54, 3, C.ink, 0); g.beginPath(); g.ellipse(76, 262.4, 9, 1.2, 0, 0, Math.PI * 2); g.fillStyle = C.greyD; g.fill();
  ln(g, 80, 261, 80, 252, 0.8); ln(g, 80, 252, 86, 252, 0.8); ln(g, 86, 252, 86, 254.4, 0.8);
  const st = THINGS.stove; box(g, st.x, st.y, st.w, st.h, C.paper2, 0.7); box(g, st.x + 4, st.y + 9, st.w - 8, 13, '#141414', 0.5);
  for (const x of [st.x + 5, st.x + 12, st.x + 19]) disc(g, x, st.y + 4.5, 1.3, C.paper, 0.5);
  box(g, st.x + 1, st.y - 2, 9, 1.6, C.ink, 0); box(g, st.x + 13, st.y - 2, 9, 1.6, C.ink, 0);
  const fr = THINGS.fridge; rbox(g, fr.x, fr.y, fr.w, fr.h, 2, C.paper, 0.8); ln(g, fr.x, fr.y + 20, fr.x + fr.w, fr.y + 20, 0.6);
  box(g, fr.x + fr.w - 5, fr.y + 6, 1.4, 9, C.ink, 0); box(g, fr.x + fr.w - 5, fr.y + 25, 1.4, 16, C.ink, 0); hatch(g, fr.x + fr.w - 3, fr.y, 3, fr.h, 0.8, 0.4);
  g.beginPath(); g.ellipse(149, 288.4, 5, 1.6, 0, 0, Math.PI * 2); g.fillStyle = C.ink; g.fill();
  // ---- bedroom: bed, nightstand + lamp, wardrobe
  box(g, 62, 96, 4, 30, C.ink, 0); box(g, 118, 106, 4, 20, C.ink, 0);
  box(g, 66, 108, 52, 6, C.paper, 0.6); box(g, 66, 114, 52, 6, C.ink, 0);
  rbox(g, 68, 102.5, 12, 6.5, 2, C.paper, 0.6);
  box(g, 124, 112, 12, 14, C.paper, 0.6); ln(g, 124, 118, 136, 118, 0.4); disc(g, 130, 115, 0.6, C.ink, 0);
  ln(g, 130, 112, 130, 106, 0.6); g.beginPath(); g.moveTo(125.5, 106); g.lineTo(134.5, 106); g.lineTo(133, 100); g.lineTo(127, 100); g.closePath(); g.fillStyle = C.paper; g.fill(); g.lineWidth = 0.6; g.strokeStyle = C.ink; g.stroke();
  box(g, 162, 66, 32, 60, C.paper, 0.8); ln(g, 178, 66, 178, 126, 0.6); disc(g, 175.5, 96, 0.8, C.ink, 0); disc(g, 180.5, 96, 0.8, C.ink, 0);
  hatch(g, 162, 66, 32, 4, 0.9, 0.5); box(g, 136, 124, 24, 2, C.greyD, 0);
  // ---- bathroom: tub, curtain rod, mirror, sink, towel, cabinet
  ln(g, 204, 58, 264, 58, 0.8);
  rbox(g, 204, 105, 60, 17, [1, 1, 6, 6], C.paper, 0.8); ln(g, 204, 108, 264, 108, 0.4);
  ln(g, 210, 122, 209, 126, 0.9); ln(g, 258, 122, 259, 126, 0.9);
  ln(g, 210, 62, 210, 100, 0.7); ln(g, 210, 62, 218, 62, 0.7);
  rbox(g, 282, 72, 20, 24, 1.5, C.paper2, 0.7); ln(g, 286, 76, 292, 70 + 12, 0.35, C.greyM); ln(g, 289, 76, 296, 84, 0.35, C.greyM);
  box(g, 284, 99, 16, 6, C.paper, 0.6); box(g, 290, 105, 4, 21, C.paper, 0.6);
  ln(g, 304, 96, 318, 96, 0.7); box(g, 306, 96, 10, 14, C.paper, 0.5); hatch(g, 306, 96, 10, 14, 1, 0.35);
  box(g, 322, 64, 26, 22, C.paper, 0.7); ln(g, 335, 64, 335, 86, 0.5); disc(g, 333, 75, 0.6, C.ink, 0); disc(g, 337, 75, 0.6, C.ink, 0);
  // ---- added 2026-10-24: writing desk + typewriter, test tubes, filing cabinet, workbench, whiteboard, pinball
  newFurniture(g);
  // ---- stairwell: plant, shelf
  rbox(g, 372, 199, 10, 9, [0, 0, 2, 2], C.paper, 0.6); hatch(g, 372, 199, 10, 9, 1, 0.4);
  for (const [x, y, a] of [[377, 192, 0], [373, 194, -0.8], [381, 194, 0.8], [376, 186, -0.3], [379, 187, 0.4]]) { g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.ellipse(0, 0, 1.8, 4.5, 0, 0, Math.PI * 2); g.fillStyle = C.paper; g.fill(); g.lineWidth = 0.5; g.strokeStyle = C.ink; g.stroke(); g.restore(); }
  box(g, 400, 236, 28, 1.6, C.ink, 0); box(g, 404, 229, 5, 7, C.paper, 0.5); box(g, 413, 227, 4, 9, C.ink, 0); disc(g, 422, 233, 3, C.paper, 0.5);
}

function newFurniture(g) {
  const d = THINGS.desk2;                                                    // bedroom writing desk with a typewriter
  box(g, d.x, d.y, d.w, 2.4, C.ink, 0); ln(g, d.x + 1.5, d.y + 2, d.x + 1.5, 126, 0.8); ln(g, d.x + d.w - 1.5, d.y + 2, d.x + d.w - 1.5, 126, 0.8);
  rbox(g, d.x + 2, d.y - 6, 12, 6, [2, 2, 0, 0], C.greyD, 0.5); box(g, d.x + 3.5, d.y - 3, 9, 1.4, C.paper2, 0);
  box(g, d.x + 4, d.y - 9, 8, 3.4, C.paper, 0.4);
  const r = THINGS.rack;                                                     // test-tube rack on the kitchen counter
  box(g, r.x, r.y + 5, r.w, 2, C.greyD, 0); box(g, r.x, r.y + 1, r.w, 1.2, C.greyD, 0);
  for (let i = 0; i < 4; i++) rbox(g, r.x + 2 + i * 4, r.y - 3, 2.2, 11, [0, 0, 1.1, 1.1], C.paper, 0.4);
  const c = THINGS.cabinet;                                                  // filing cabinet
  box(g, c.x, c.y, c.w, c.h, C.paper2, 0.8);
  for (let i = 0; i < 3; i++) { box(g, c.x + 1.5, c.y + 1.5 + i * 9, c.w - 3, 7.6, C.paper, 0.5); box(g, c.x + c.w / 2 - 2.5, c.y + 4.5 + i * 9, 5, 1.2, C.ink, 0); }
  const b = THINGS.bench;                                                    // workbench, a vise, tools on the wall
  box(g, b.x, b.y, b.w, 3, C.wall, 0.7); hatch(g, b.x, b.y, b.w, 3, 0.9, 0.4);
  ln(g, b.x + 2, b.y + 3, b.x + 2, 126, 0.9); ln(g, b.x + b.w - 2, b.y + 3, b.x + b.w - 2, 126, 0.9); ln(g, b.x + 2, 120, b.x + b.w - 2, 120, 0.5);
  box(g, b.x + b.w - 9, b.y - 4, 7, 4, C.greyD, 0.4);
  box(g, b.x + 3, 96, 2, 9, C.ink, 0); box(g, b.x + 1.5, 94, 5, 3, C.greyD, 0);           // hammer
  ln(g, b.x + 10, 95, b.x + 10, 105, 0.9); disc(g, b.x + 10, 94.5, 1.4, C.paper, 0.5);     // screwdriver
  ln(g, b.x + 15, 96, b.x + 20, 104, 1); ln(g, b.x + 20, 96, b.x + 15, 104, 1);           // pliers
  const w = THINGS.board;                                                    // whiteboard
  box(g, w.x, w.y, w.w, w.h, '#fbfbf9', 0.9); box(g, w.x + 2, w.y + w.h, w.w - 4, 1.6, C.greyD, 0);
  box(g, w.x + 4, w.y + w.h - 0.8, 4, 1, C.green, 0); box(g, w.x + 10, w.y + w.h - 0.8, 4, 1, C.red, 0);
  const pb = THINGS.pinball;                                                 // pinball machine: backbox and table
  rbox(g, pb.x + 1, pb.y, pb.w - 2, 20, 1.5, C.ink, 0); box(g, pb.x + 3, pb.y + 2, pb.w - 6, 13, '#141414', 0.4);
  text(g, 'TILT', pb.x + pb.w / 2, pb.y + 18.6, 3.2, C.greyL, 600, 'center');
  box(g, pb.x, pb.y + 20, pb.w, 14, C.paper2, 0.7); hatch(g, pb.x, pb.y + 20, pb.w, 14, 1.2, 0.3);
  ln(g, pb.x + 2, pb.y + 34, pb.x + 2, 290, 0.9); ln(g, pb.x + pb.w - 2, pb.y + 34, pb.x + pb.w - 2, 290, 0.9);
}

function armchair(g) {
  const c = THINGS.chair;
  rbox(g, c.x - 3, c.y + 10, 6, 20, 2, C.paper2, 0.7); rbox(g, c.x + c.w - 3, c.y + 10, 6, 20, 2, C.paper2, 0.7);
  rbox(g, c.x, c.y, c.w, c.h - 3, [6, 6, 1, 1], C.paper2, 0.8);
  hatch(g, c.x, c.y + 18, c.w, c.h - 21, 1, 0.35);
  for (const [dx, dy] of [[7, 8], [13, 8], [19, 8], [10, 14], [16, 14]]) disc(g, c.x + dx, c.y + dy, 0.5, C.ink, 0);
  box(g, c.x + 2, c.y + c.h - 3, 2, 3, C.ink, 0); box(g, c.x + c.w - 4, c.y + c.h - 3, 2, 3, C.ink, 0);
}

function stairs(g) {
  for (const f of FLIGHTS) {
    const [bx, by] = f.bottom, [tx, ty] = f.top, dir = Math.sign(tx - bx), rise = (by - ty) / 9;
    g.beginPath(); g.moveTo(bx, by);
    for (let i = 0; i < 9; i++) {
      const x = bx + dir * 8 * i, y = by - rise * (i + 1);
      g.lineTo(x, y); g.lineTo(x + dir * 8, y);
    }
    g.lineTo(tx, by); g.closePath(); g.fillStyle = C.paper; g.fill(); g.lineWidth = 0.6; g.strokeStyle = C.ink; g.stroke();
    hatch(g, Math.min(bx, tx), ty, Math.abs(tx - bx), by - ty, 1.6, 0.18);
    ln(g, bx, by - 20, tx, ty - 20, 0.8);
    for (let i = 0; i <= 9; i++) { const x = bx + (tx - bx) * i / 9, y = by + (ty - by) * i / 9; ln(g, x, y - 20, x, y - 1, 0.35); }
  }
}

function shell(g) {
  for (const y of [48, 126, 208]) {
    box(g, 56, y, 388, y === 48 ? 4 : 6, C.ink, 0);
    if (y !== 48) for (let x = 62; x < 440; x += 18) ln(g, x, y + 2.4, x + 8, y + 2.4, 0.35, C.greyM);
  }
  for (const [y0, y1] of [[52, 126], [132, 208], [214, 290]]) {
    for (const x of [196, 356]) {
      box(g, x, y1 - 36, 4, 36, C.paper2, 0); hatch(g, x, y1 - 36, 4, 36, 1, 0.45);   // the doorway's passage
      box(g, x, y0, 4, y1 - y0 - 36, C.wall, 0); ln(g, x, y0, x, y1 - 36, 0.5); ln(g, x + 4, y0, x + 4, y1 - 36, 0.5);
      box(g, x - 1, y1 - 37, 6, 2, C.ink, 0);
    }
  }
  for (const x of [56, 440]) {                                       // outer walls in section: the cut is hatched
    box(g, x, 48, 4, 250, C.ink, 0);
    g.save(); g.beginPath(); g.rect(x, 48, 4, 250); g.clip(); g.strokeStyle = C.greyM; g.lineWidth = 0.35;
    g.beginPath(); for (let y = 44; y < 300; y += 2.2) { g.moveTo(x, y + 4); g.lineTo(x + 4, y); } g.stroke(); g.restore();
  }
  box(g, 52, 290, 396, 8, C.greyM, 0.6);
  for (let x = 58, j = 0; x < 448; x += 9, j++) ln(g, x, 290 + (j % 2) * 4, x, 294 + (j % 2) * 4, 0.4);
  ln(g, 52, 294, 448, 294, 0.4);
}

function garden(g) {
  box(g, 0, 296, W, 24, C.paper, 0); ln(g, 0, 296.3, W, 296.3, 0.7);
  const rnd = seeded(11);
  g.save(); g.fillStyle = C.ink;
  for (let i = 0; i < 520; i++) { const x = rnd() * W, y = 297 + rnd() * 23, a = 0.12 + rnd() * 0.4; g.globalAlpha = a; g.fillRect(x, y, 0.3 + rnd() * 1.6, 0.25); }
  g.restore();
  for (let x = 10; x < 54; x += 9) rbox(g, x, 297.2, 7, 2.2, 1, C.paper2, 0.4);     // path stones
  box(g, 23, 274, 3, 24, C.ink, 0);                                                   // mailbox post
  box(g, 459, 238, 8, 59, C.paper, 0.7); for (let y = 244; y < 296; y += 5) ln(g, 460.5, y, 465.5, y + 2, 0.3);
  for (const [cx, cy, r] of [[463, 224, 19], [450, 216, 11], [474, 212, 10], [462, 206, 9]]) {
    disc(g, cx, cy, r, C.paper, 0.8);
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip(); hatch(g, cx - r * 0.1, cy - r, r * 1.2, r * 2, 1.2, 0.45); g.restore();
  }
  disc(g, 450, 292, 5.5, C.paper, 0.7); hatch(g, 448, 287, 8, 10, 1, 0.4);
}

function drawLayer(g) {
  g.clearRect(0, 0, W, H);
  roof(g);
  rooms(g);
  furniture(g);
  stairs(g);
  shell(g);
  garden(g);
}

// ---------- sprites ----------
const PEPE = ['stand', 'walk1', 'walk2', 'lookup_mid', 'lookup', 'scratch1', 'scratch2', 'side_stand', 'side_walk1',
  'side_walk2', 'side_walk3', 'side_walk4', 'q34_back', 'q34_front', 'front_stand', 'front_lookup', 'front_scratch',
  'cheer1', 'cheer2'];
const DOG = ['sleep', 'head_up', 'look', 'tilt', 'sit', 'sit_bark', 'stand', 'wag', 'bow', 'bark', 'walk1', 'walk2',
  'walk3', 'walk4', 'away1', 'away2', 'away3', 'away4', 'toward1', 'toward2', 'toward3', 'toward4', 'wag2'];
const PI = Object.fromEntries(PEPE.map((n, i) => [n, i])), DI = Object.fromEntries(DOG.map((n, i) => [n, i]));
const PH = 38, PW = PH * 240 / 284, DWD = 30, DHT = DWD * 120 / 168;
const SIDE = ['side_walk1', 'side_walk2', 'side_walk3', 'side_walk4'], DWALK = ['walk1', 'walk2', 'walk3', 'walk4'];

// imd.fun's moves (its script, 2026-10-24): frame name and milliseconds
const SEQ = {
  look: [['lookup_mid', 140], ['lookup', 1300], ['lookup_mid', 140], ['stand', 300]],
  scratch: [['scratch1', 220], ['scratch2', 220], ['scratch1', 220], ['scratch2', 220], ['scratch1', 220], ['scratch2', 220], ['stand', 300]],
  shuffle: [['walk1', 170], ['stand', 170], ['walk2', 170], ['stand', 170], ['walk1', 170], ['stand', 170], ['walk2', 170], ['stand', 300]],
  front: [['q34_back', 200], ['side_stand', 200], ['q34_front', 220], ['front_stand', 500], ['front_lookup', 1100], ['front_stand', 500],
    ['q34_front', 220], ['side_stand', 200], ['q34_back', 200], ['stand', 300]],
  flook: [['front_lookup', 1100], ['front_stand', 500]],
  fscratch: [['front_scratch', 240], ['front_stand', 200], ['front_scratch', 240], ['front_stand', 200], ['front_scratch', 240], ['front_stand', 500]],
  dlook: [['head_up', 900], ['look', 1300], ['head_up', 700]],
  dtilt: [['head_up', 300], ['tilt', 1400], ['head_up', 500]],
  dglance: [['head_up', 900], ['look', 1300], ['head_up', 700], ['sleep', 10]],
};

// a pose holds a base frame and now and then plays one of its moves; a loop repeats for as long as the pose lasts
class Mover {
  constructor(gap) { this.gap = gap; this.key = null; this.seq = null; }
  frame(key, spec, now) {
    if (key !== this.key) { this.key = key; this.seq = null; this.next = now + R(this.gap[0] * 0.4, this.gap[1] * 0.6); }
    if (spec.loop) {
      const total = spec.loop.reduce((a, [, ms]) => a + ms, 0);
      let t = now % total;
      for (const [name, ms] of spec.loop) { if (t < ms) return name; t -= ms; }
      return spec.loop[0][0];
    }
    if (this.seq) {
      while (this.seq && now >= this.at + this.seq[this.i][1]) {
        this.at += this.seq[this.i][1]; this.i++;
        if (this.i >= this.seq.length) { this.seq = null; this.next = now + R(this.gap[0], this.gap[1]); }
      }
      if (this.seq) return this.seq[this.i][0];
    }
    if (spec.moves && spec.moves.length && now >= this.next) {
      this.seq = SEQ[spec.moves[Math.floor(Math.random() * spec.moves.length)]]; this.i = 0; this.at = now;
      return this.seq[0][0];
    }
    return spec.base;
  }
}

const BACK_ACTIONS = ['window', 'records', 'snack', 'parcel', 'mailcheck', 'sign', 'fire'];
function pepeSpec(m, s) {
  switch (m.pose) {
    case 'type': case 'review': return { base: 'stand', moves: ['look', 'scratch', 'shuffle', 'front'] };
    case 'cook': return { base: 'stand', moves: ['scratch', 'shuffle'] };
    case 'read': return { base: 'stand', moves: ['look', 'look', 'scratch'] };
    case 'telescope': return { loop: [['lookup', 2600], ['lookup_mid', 180], ['lookup', 1800], ['lookup_mid', 160], ['stand', 260], ['lookup_mid', 160]] };
    case 'piano': return { loop: [['walk1', 170], ['stand', 170], ['walk2', 170], ['stand', 170]] };
    case 'paint': return { loop: [['scratch1', 320], ['scratch2', 320], ['scratch1', 320], ['stand', 600]] };
    case 'fan': return { loop: [['scratch1', 110], ['scratch2', 110]] };
    case 'dance': {                                              // to the radio he dances in its tempo (72..118 bpm)
      const k = s && s.radio && s.radio.on && s.radio.bpm ? 120 / s.radio.bpm : 1;
      return { loop: [['cheer1', Math.round(260 * k)], ['cheer2', Math.round(240 * k)]] };
    }
    case 'exercise': return { loop: [['cheer1', 380], ['stand', 380]] };
    case 'stretch': return { base: 'cheer1' };
    case 'sad': return { base: 'front_scratch' };
    case 'hang': case 'reach': return { base: 'lookup' };
    case 'readmail': case 'eat': return { base: 'front_stand', moves: ['flook'] };
    case 'phone': case 'pet': case 'carry': return { base: 'side_stand', flip: true };
    case 'water': case 'brush': case 'stoke': return { base: 'stand', moves: ['scratch'] };
    case 'inspect': return { base: 'stand', moves: ['look', 'scratch'] };
    case 'typewrite': return { loop: [['stand', 360], ['walk1', 120], ['stand', 120], ['walk2', 120]] };
    case 'experiment': return { base: 'stand', moves: ['scratch', 'look', 'shuffle'] };
    case 'hammer': return { loop: [['scratch1', 220], ['scratch2', 160]] };
    case 'plan': return { base: 'lookup', moves: ['scratch'] };
    case 'file': return { base: 'stand', moves: ['look'] };
    case 'pinball': return { loop: [['walk1', 110], ['stand', 110], ['walk2', 110], ['stand', 110]] };
    case 'puzzled': return { base: 'front_scratch' };
    default:
      if (BACK_ACTIONS.includes(s.action)) return { base: 'stand', moves: ['look'] };
      return { base: 'front_stand', moves: ['flook', 'fscratch'] };
  }
}

function dogSpec(d) {
  if (d.pose === 'walk') return { walk: true };
  if (d.pose === 'wag') return { loop: [['wag', 160], ['wag2', 160]] };
  if (d.pose === 'party') return { loop: [['wag', 150], ['wag2', 150], ['wag', 150], ['wag2', 150], ['bark', 260], ['sit_bark', 240], ['bow', 420], ['wag', 150], ['wag2', 150]] };
  if (d.pose === 'eat') return { loop: [['bow', 900], ['stand', 300]] };
  if (d.pose === 'sleep') return { base: 'sleep', moves: ['dglance'] };
  if (d.pose === 'howl') return { loop: [['sit_bark', 420], ['sit', 180]] };       // a whale sold on the radio
  return d.mode === 'door' ? { base: 'sit' } : { base: 'head_up', moves: ['dlook', 'dtilt'] };
}

// ---------- the theme ----------
export const imd = {
  id: 'imd',
  label: 'IMD',
  mapping: MAPPINGS.imd,
  spots: IMD_SPOTS,
  activityText: {
    computer: 'stands at the machine wall in the study', cook: 'cooks at the stove', book: 'looks through the bookshelf',
    tv: 'watches TV from the armchair', piano: 'plays the piano', easel: 'paints at the easel under the picture wall',
    telescope: 'looks through the telescope',
    magnifier: 'looks the work over with a magnifying glass at the writing desk', lab: 'runs tests with the test tubes in the kitchen',
    workbench: 'puts it together at the workbench upstairs', typewriter: 'types at the typewriter',
    pinball: 'plays pinball: a fuzz run throws random balls at the code', whiteboard: 'plans it out on the whiteboard upstairs',
    cabinet: 'sorts index cards in the filing cabinet',
  },
  layer: null, pepe: null, dog: null, ready: false, loading: false,
  pm: new Mover([3000, 8000]), dm: new Mover([5000, 12000]),

  attach(canvas) {
    canvas.width = W * S; canvas.height = H * S;
    if (!this.loading) {
      this.loading = true;
      const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
      Promise.all([load('assets/imd/pepe.webp'), load('assets/imd/dog.webp'),
        document.fonts ? document.fonts.load(`600 10px ${MONO}`).catch(() => null) : null])
        .then(([p, d]) => { this.pepe = p; this.dog = d; this.ready = true; });
    }
    if (!this.layer) {
      this.layer = document.createElement('canvas');
      this.layer.width = W * S; this.layer.height = H * S;
      const lg = this.layer.getContext('2d'); lg.setTransform(S, 0, 0, S, 0, 0);
      drawLayer(lg);
    }
  },

  cssWidth(avail) { return Math.min(960, avail) + 'px'; },
  setSeed() {},

  draw(g, house, tick) {
    const now = performance.now(), phase = skyPhase(new Date());
    g.setTransform(S, 0, 0, S, 0, 0);
    const day = SKY[phase] || null;
    g.fillStyle = day ? day.page : C.page; g.fillRect(0, 0, W, H);
    if (day) dots(g, 0, 0, W, 296, 3.2, 0.3, 0.16);
    sky(g, phase, now, day);
    if (house && house.state.fireworks > 0) fireworks(g, now);
    glass(g, phase, now, day);
    g.drawImage(this.layer, 0, 0, W, H);
    if (!house) return;
    if (house.state.bigFireworks > 0) bigFireworks(g, now, day);
    const s = house.state, m = house.man;
    props(g, s, now, tick);
    if (this.flags && this.flags.machineTicker && s.working && s.machine && !s.asleep && !s.away) machineReadout(g, s.machine, THINGS.machine, now);
    if (this.ready) {
      drawDog(g, this, house.dog, now);
      if (!m.hidden && !(s.closeup && s.closeup.k > 0.3)) drawPepe(g, this, m, s, now);
    }
    if (house.carrier) drawCarrier(g, house.carrier);
    lights(g, s, phase);
    // at his station the bubble shows the model's namesake; with an icon of the activity too, the two take turns
    const work = workInfo(s), sym = work && s.atStation ? MODEL_SYMBOL[work.family] : null;
    const icon = (house.flash && house.flash.icon) || (m.icon && sym ? (Math.floor(now / 3000) % 2 ? sym : m.icon) : m.icon || sym);
    if (icon && !m.hidden) {
      const head = m.pose === 'sleep' ? [76, 97] : ['tvsit', 'nap'].includes(m.pose) ? [THINGS.chair.x + 13, THINGS.chair.y - 14] : [m.x, m.y - PH + 2];
      bubble(g, head[0], head[1], icon, now);
    }
    if (s.closeup) closeup(g, this, s.closeup, now);
  },
};

function drawPepe(g, th, m, s, now) {
  const img = th.pepe;
  if (!img) return;
  const frame = (name, x, yFeet, flip = false, crop) => {
    const i = PI[name];
    g.save(); g.translate(x, yFeet); if (flip) g.scale(-1, 1);
    if (crop) g.drawImage(img, i * 240 + crop[0], crop[1], crop[2], crop[3], -crop[2] / 240 * PW / 2, -crop[3] / 284 * PH, crop[2] / 240 * PW, crop[3] / 284 * PH);
    else g.drawImage(img, i * 240, 0, 240, 284, -PW / 2, -PH, PW, PH);
    g.restore();
  };
  if (m.pose === 'shower') return;
  if (m.pose === 'sleep') {                                    // the back of his head on the pillow, the blanket over him
    g.save(); g.translate(77, 106); g.rotate(-Math.PI / 2);
    g.drawImage(img, PI.stand * 240 + 30, 14, 180, 136, -7, -10.5, 14, 10.6); g.restore();
    rbox(g, 80, 104.5, 38, 8.5, [4, 2, 1, 1], C.paper, 0.6); hatch(g, 80, 104.5, 38, 8.5, 1, 0.4);
    ln(g, 88, 105.5, 92, 112, 0.35); ln(g, 100, 105, 103, 112, 0.35);
    return;
  }
  if (['tvsit', 'nap', 'sit'].includes(m.pose)) {             // in the armchair: his head over its back
    const c = THINGS.chair, tilt = m.pose === 'nap' ? 0.28 : 0, news = s.action === 'news';
    if (news) bigPaper(g, c, now, s.news);                     // The IMD Daily unfolded in front of him, wider than he is: number, date, headline
    g.save(); g.translate(c.x + c.w / 2, c.y + 5); g.rotate(tilt);
    const name = m.pose === 'nap' ? 'stand' : news ? 'stand' : th.pm.frame('chair', { base: 'stand', moves: ['look'] }, now);
    g.drawImage(img, PI[name] * 240 + 30, 14, 180, 136, -PW * 0.375, -PH * 0.48, PW * 0.75, PH * 0.48); g.restore();
    armchair(g);
    if (news) { const y = c.y - 4 + Math.sin(now / 700) * 0.3;  // his hands on the paper's edges, arms out past the chair
      box(g, c.x - 9.5, y, 3.2, 2.6, '#5aa05a', 0.35); box(g, c.x + c.w + 6.3, y, 3.2, 2.6, '#5aa05a', 0.35); }
    return;
  }
  if (m.pose === 'walk') {
    frame(SIDE[(m.step >> 2) % 4], m.x, m.y + 1, m.face < 0);
  } else {
    const spec = pepeSpec(m, s);
    const name = th.pm.frame(m.pose + '|' + s.action, spec, now);
    frame(name, m.x, m.y + 1, spec.flip ? m.face < 0 : false);
  }
  if (m.carry) carried(g, m.carry, m.x + (m.face < 0 ? -9 : 9), m.y - 15);
  if (m.pose === 'readmail') { rbox(g, m.x - 5, m.y - 18, 10, 7, 0.6, C.paper, 0.5); ln(g, m.x - 3.5, m.y - 15.5, m.x + 3.5, m.y - 15.5, 0.3); }
}

function carried(g, what, x, y) {
  if (what === 'paper') { g.save(); g.translate(x, y); g.rotate(-0.35); box(g, -4, -1.5, 8, 3, C.paper, 0.45); ln(g, -2.5, 0, 2.5, 0, 0.25, C.greyD); g.restore(); return; }   // The IMD Daily, folded
  if (what === 'letter') { box(g, x - 3.5, y - 2.5, 7, 5, C.paper, 0.5); ln(g, x - 3.5, y - 2.5, x, y, 0.35); ln(g, x + 3.5, y - 2.5, x, y, 0.35); }
  else if (what === 'frame') { box(g, x - 4, y - 4, 8, 7, C.paper, 0.6); box(g, x - 2.5, y - 2.5, 5, 4, C.glass, 0); ln(g, x - 2, y, x + 2, y - 1, 0.4, C.green); }
  else if (what === 'parcel') { box(g, x - 5, y - 6, 10, 8, C.paper2, 0.6); box(g, x - 0.7, y - 6, 1.4, 8, C.amber, 0); }
}

// the unfolded paper seen from behind (he sits in the armchair, 2026-10-26): a wide sheet past his shoulders and over his
// head, the fold in the middle, the print showing through faintly; news.js opens the real issue on a click
// the plaque on the tree (mapping.js expertise; main.js plaqueFor): a small sign nailed to the trunk, the acceptance rate
// on top, his thing underneath (owner, 2026-10-26)
export const PLAQUE_BOX = { x: 451, y: 255, w: 24, h: 13 };
function treePlaque(g, p) {
  const b = PLAQUE_BOX;
  rbox(g, b.x, b.y, b.w, b.h, 0.8, C.wall, 0.6);                                   // light grey, lighter than the first try (owner, 2026-10-26)
  disc(g, b.x + b.w / 2, b.y + 1.3, 0.5, C.ink, 0);
  text(g, p.rate == null ? '–' : p.rate + '%', b.x + b.w / 2, b.y + 7, 5, C.ink, 700, 'center');
  if (p.job) text(g, p.job, b.x + b.w / 2, b.y + 11.4, 3.2, C.greyD, 600, 'center');   // his trade, not the kind of job
}

export const SWORN_FRAME = { x: 314, y: 219, w: 16, h: 16 };            // the hive's box on the wall (no frame, owner 2026-10-26)
function hexPath(g, cx, cy, r) {
  g.beginPath();
  for (let i = 0; i < 6; i++) { const t = i * Math.PI / 3; g.lineTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r); }
  g.closePath();
}
function swornCard(g, card, now) {
  const f = SWORN_FRAME, k = f.w / 1000, ox = f.x, oy = f.y + 0.3;
  hexPath(g, ox + 500 * k, oy + 480 * k, 440 * k); g.fillStyle = C.paper; g.fill(); g.lineWidth = 0.35; g.strokeStyle = C.greyM; g.stroke();   // the outer ring is the card's edge
  for (const c of card.cells) {
    const cx = ox + c.x * k, cy = oy + c.y * k, r = 89 * k;
    if (c.level > 0) {
      const frac = c.level / c.tiers, inner = 77 * k, h = 2 * inner * 0.866;
      g.save(); hexPath(g, cx, cy, inner); g.clip();
      g.fillStyle = C.grey; g.fillRect(cx - inner, cy + h / 2 - h * frac, inner * 2, h * frac);
      g.restore();
    }
    hexPath(g, cx, cy, r); g.lineWidth = c.level > 0 ? 0.4 : 0.25; g.strokeStyle = c.level > 0 ? C.ink : C.greyM; g.stroke();
  }
}

function bigPaper(g, c, now, news) {
  const w = c.w + 26, h = 30, x = c.x - 13, y = c.y - 27 + Math.sin(now / 700) * 0.3;
  g.save(); g.translate(x + w / 2, y + h); g.rotate(Math.sin(now / 1900) * 0.012); g.translate(-(x + w / 2), -(y + h));
  rbox(g, x, y, w, h, 0.5, C.paper, 0.55);
  // the sheet's print (owner, 2026-10-26: number, date and headline on the paper): masthead, the issue line, the headline
  text(g, 'The IMD Daily', x + w / 2, y + 4.6, 4.2, C.ink, 700, 'center');
  ln(g, x + 2, y + 5.8, x + w - 2, y + 5.8, 0.3, C.ink);
  if (news) {
    text(g, `No. ${news.no} · ${news.date}`, x + w / 2, y + 8.6, 2.5, C.greyD, 600, 'center');
    const words = String(news.headline || '').split(' '), lines = [], max = Math.floor((w - 4) / (3 * 0.56));
    let cur = '';
    for (const wd of words) { if ((cur + ' ' + wd).trim().length > max && cur) { lines.push(cur); cur = wd; } else cur = (cur + ' ' + wd).trim(); if (lines.length === 3) break; }
    if (cur && lines.length < 3) lines.push(cur);
    lines.forEach((l, i) => text(g, l, x + 2, y + 13 + i * 3.6, 3, C.ink, 700, 'left'));
    const from = y + 13 + lines.length * 3.6;
    for (let yy = from + 1; yy < y + h - 1.4; yy += 2.2) { ln(g, x + 2, yy, x + w / 2 - 1.2, yy, 0.22, '#cfcfca'); ln(g, x + w / 2 + 1.2, yy, x + w - 2, yy, 0.22, '#cfcfca'); }
  } else for (let yy = y + 9; yy < y + h - 1.4; yy += 2.6) ln(g, x + 2, yy, x + w - 2, yy, 0.22, '#d9d9d4');
  g.restore();
}

// the broadsheet held standing (not used since he sits for it, 2026-10-26; kept): masthead, two columns, a picture
function newspaper(g, x, y, now) {
  const w = 17, h = 12, px = x - w / 2, py = y - 21 + Math.sin(now / 900) * 0.3;
  rbox(g, px, py, w, h, 0.4, C.paper, 0.5);
  ln(g, px + w / 2, py + 3.2, px + w / 2, py + h - 1, 0.25, C.greyM);
  box(g, px + 1.2, py + 1.1, w - 2.4, 1.4, C.ink, 0);
  for (let i = 0; i < 5; i++) { ln(g, px + 1.4, py + 4.2 + i * 1.5, px + w / 2 - 0.8, py + 4.2 + i * 1.5, 0.25, C.greyD); ln(g, px + w / 2 + 0.8, py + 4.2 + i * 1.5, px + w - 1.4, py + 4.2 + i * 1.5, 0.25, C.greyD); }
  box(g, px + w / 2 + 0.8, py + 7.4, w / 2 - 2.2, 3.4, C.greyL, 0.3);
}

function drawDog(g, th, d, now) {
  if (d.hidden) return;
  const img = th.dog;
  if (!img) return;
  const spec = dogSpec(d);
  const name = spec.walk ? DWALK[Math.floor(d.step / 6) % 4] : th.dm.frame(d.pose + '|' + d.mode, spec, now);
  const flip = d.face < 0 && (spec.walk || ['wag', 'eat', 'party'].includes(d.pose));
  g.save();
  g.beginPath(); g.ellipse(d.x, d.y + 0.4, DWD * 0.32, 1.6, 0, 0, Math.PI * 2);
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.fill();
  g.translate(d.x, d.y + 1);
  if (name === 'sleep') { const b = (1 - Math.cos(now / 3800 * Math.PI * 2)) / 2; g.scale(1 + 0.012 * b, 1 + 0.045 * b); }
  if (flip) g.scale(-1, 1);
  g.filter = 'drop-shadow(0 0 1px #fff)';
  g.drawImage(img, DI[name] * 168, 0, 168, 120, -DWD / 2, -DHT * 0.967, DWD, DHT);
  g.restore();
}

function drawCarrier(g, c) {                                    // the mail carrier, drawn in ink
  const k = c.pose === 'walk' ? (c.step >> 3) % 2 : 0;
  g.save(); g.translate(c.x, c.y); g.scale(c.face, 1);
  ln(g, -1.6, -11, -1.6 - (k ? 3 : -1), 0, 1.6); ln(g, 1.6, -11, 1.6 + (k ? 3 : -1), 0, 1.6);
  rbox(g, -5, -24, 10, 14, 2.5, C.greyD, 0.6);
  ln(g, -4.6, -23, 4.4, -12, 0.6, C.amber);
  disc(g, 0, -28.5, 4.4, C.paper, 0.6); disc(g, 2, -29, 0.6, C.ink, 0);
  rbox(g, -4.8, -34, 9.6, 3.2, [2, 2, 0, 0], C.ink, 0); box(g, 1, -31.4, 6, 1.2, C.ink, 0);
  rbox(g, -9, -18, 6, 8, 1, C.paper2, 0.6);
  if (c.carry === 'letter') { box(g, 4, -19, 6, 4, C.paper, 0.4); }
  if (c.carry === 'parcel') { box(g, 3, -22, 9, 8, C.paper2, 0.5); box(g, 6.8, -22, 1.4, 8, C.amber, 0); }
  if (c.carry === 'paper') { g.save(); g.translate(7, -19); g.rotate(-0.35); box(g, -4, -1.5, 8, 3, C.paper, 0.45); ln(g, -2.5, 0, 2.5, 0, 0.25, C.greyD); g.restore(); }   // The IMD Daily, folded
  g.restore();
}

// ---------- what changes every frame ----------
// a cloud: overlapping puffs with one outline around them all
function cloud(g, x, y, w, ink, fill) {
  const puffs = [[0, 0, w * 0.22], [w * 0.24, -w * 0.1, w * 0.26], [w * 0.52, -w * 0.02, w * 0.22], [w * 0.72, w * 0.04, w * 0.16]];
  g.save(); g.lineWidth = 1.6; g.strokeStyle = ink;
  for (const [dx, dy, r] of puffs) { g.beginPath(); g.arc(x + dx, y + dy, r, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = fill;
  for (const [dx, dy, r] of puffs) { g.beginPath(); g.arc(x + dx, y + dy, r, 0, Math.PI * 2); g.fill(); }
  g.beginPath(); g.moveTo(x - w * 0.12, y + w * 0.12); g.lineTo(x + w * 0.8, y + w * 0.12); g.lineWidth = 0.4; g.globalAlpha = 0.5; g.stroke();
  g.restore();
}

function sun(g, x, y, ink, fill, now) {
  g.save(); g.lineWidth = 0.9; g.strokeStyle = ink;
  g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); g.stroke();
  const turn = now / 20000;
  for (let i = 0; i < 12; i++) { const t = turn + i * Math.PI / 6; g.beginPath(); g.moveTo(x + Math.cos(t) * 11, y + Math.sin(t) * 11); g.lineTo(x + Math.cos(t) * (i % 2 ? 13.5 : 15.5), y + Math.sin(t) * (i % 2 ? 13.5 : 15.5)); g.stroke(); }
  g.restore();
}

function sky(g, phase, now, day) {
  if (day) {
    const ink = day.line, fill = day.cloud;
    sun(g, day.sunAt[0], day.sunAt[1], ink, day.sun, now);
    const drift = (now / 900) % 60;
    cloud(g, 92 + drift * 0.6, 22, 34, ink, fill);
    cloud(g, 372 + drift * 0.4, 18, 42, ink, fill);
    cloud(g, 6 + drift * 0.3, 150, 26, ink, fill);
    return;
  }
  if (phase !== 'night') return;
  const rnd = seeded(3);
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 46; i++) {
    const x = rnd() * W, y = rnd() * 280, tw = (Math.sin(now / 900 + i) + 1) / 2;
    if (y > 40 && x > 30 && x < 470) continue;
    g.globalAlpha = 0.25 + 0.6 * tw; g.fillRect(x, y, 0.7, 0.7);
  }
  g.globalAlpha = 1;
  g.beginPath(); g.arc(30, 28, 9, 0, Math.PI * 2); g.lineWidth = 0.8; g.strokeStyle = '#ffffff'; g.stroke();
  g.beginPath(); g.arc(34, 25, 8, 0, Math.PI * 2); g.fillStyle = C.page; g.fill();
}

function glass(g, phase, now, day) {
  for (const [x0, y0, x1, y1] of WINDOWS) {
    const w = x1 - x0, h = y1 - y0;
    if (phase === 'night') {
      box(g, x0, y0, w, h, '#0a0c14', 0);
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 3; i++) { g.globalAlpha = 0.5 + 0.5 * Math.sin(now / 700 + i * 2 + x0); g.fillRect(x0 + ((i * 11 + x0) % w), y0 + ((i * 7 + y0) % h), 0.6, 0.6); }
      g.globalAlpha = 1;
    } else {
      box(g, x0, y0, w, h, day ? day.glass : '#e8b98a', 0);
      g.save(); g.globalAlpha = 0.55; g.strokeStyle = '#ffffff'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x0 + w * 0.2, y1); g.lineTo(x0 + w * 0.6, y0); g.moveTo(x0 + w * 0.45, y1); g.lineTo(x0 + w * 0.8, y0); g.stroke(); g.restore();
    }
  }
}

function screenText(g, x, y, w, h, now, color = C.green) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  const off = (now / 120) % 3;
  for (let i = 0; i < 8; i++) {
    const len = 4 + ((i * 7 + Math.floor(now / 360)) % 13) * 1.6;
    g.fillStyle = color; g.globalAlpha = 0.9;
    g.fillRect(x + 2, y + 2 + i * 3 - off, Math.min(len, w - 4), 0.9);
  }
  if ((now >> 9) % 2) g.fillRect(x + 2, y + h - 3, 1.6, 1.4);
  g.restore();
}

function wave(g, x, y, w, h, now, amp, speed, color = C.green) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.beginPath();
  for (let i = 0; i <= w; i += 0.5) {
    const t = i / w, v = Math.sin(t * 14 + now / speed) * amp + Math.sin(t * 31 + now / (speed * 0.7)) * amp * 0.35;
    if (i === 0) g.moveTo(x + i, y + h / 2 + v); else g.lineTo(x + i, y + h / 2 + v);
  }
  g.lineWidth = 0.6; g.strokeStyle = color; g.shadowColor = color; g.shadowBlur = 2; g.stroke(); g.restore();
}

function heartbeat(g, x, y, w, h, now) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  const off = (now / 30) % w, mid = y + h / 2;
  g.beginPath(); g.moveTo(x, mid);
  for (let i = 0; i <= w * 2; i += 1) {
    const xx = x + i - off, ph = i % 22;
    const v = ph === 8 ? -h * 0.32 : ph === 9 ? h * 0.22 : ph === 10 ? -h * 0.12 : 0;
    g.lineTo(xx, mid + v);
  }
  g.lineWidth = 0.55; g.strokeStyle = C.green; g.shadowColor = C.green; g.shadowBlur = 2; g.stroke(); g.restore();
}

function props(g, s, now, tick) {
  const a = s.action, sc = THINGS.screen, m = THINGS.machine;
  // the machine wall's main screen
  box(g, sc.x, sc.y, sc.w, sc.h, s.smoke && (tick >> 2) % 2 ? '#2a0806' : C.glass, 0);
  if (s.smoke) {
    text(g, 'ERR', sc.x + sc.w / 2, sc.y + sc.h / 2 + 2, 6, C.red, 600, 'center');
    for (let i = 0; i < 6; i++) { const k = (now / 40 + i * 13) % 40; g.globalAlpha = 1 - k / 40; disc(g, sc.x + 6 + ((i * 5) % 18) + k / 6, sc.y - 3 - k, 2 + k / 10, C.greyL, 0.3); }
    g.globalAlpha = 1;
  } else if (a === 'install') {
    text(g, 'INSTALL', sc.x + sc.w / 2, sc.y + 7, 4.2, C.green, 600, 'center');
    box(g, sc.x + 3, sc.y + 11, sc.w - 6, 3, null, 0.5); g.strokeStyle = C.green; g.strokeRect(sc.x + 3, sc.y + 11, sc.w - 6, 3);
    box(g, sc.x + 3, sc.y + 11, (sc.w - 6) * (s.installProgress || 0), 3, C.green, 0);
  } else if (s.chart != null) candles(g, sc.x, sc.y, sc.w, sc.h, s.chart);
  else if (s.buying != null) buyScreen(g, sc.x, sc.y, sc.w, sc.h, s.buying);
  else if (['type', 'review', 'letter'].includes(a)) screenText(g, sc.x, sc.y, sc.w, sc.h, now);
  else if (s.needsUpdate && (now >> 9) % 2) {
    text(g, 'UPDATE', sc.x + sc.w / 2, sc.y + 8, 4.4, C.amber, 600, 'center');
    g.beginPath(); g.moveTo(sc.x + sc.w / 2 - 3, sc.y + 11); g.lineTo(sc.x + sc.w / 2 + 3, sc.y + 11); g.lineTo(sc.x + sc.w / 2, sc.y + 15); g.closePath(); g.fillStyle = C.amber; g.fill();
  } else heartbeat(g, sc.x, sc.y, sc.w, sc.h, now);
  for (let i = 0; i < 8; i++) {                                  // LEDs and the small screen
    const on = ((i * 37 + Math.floor(now / (260 + i * 40))) % 5) < 2;
    box(g, sc.x + 1 + i * 3.6, sc.y + sc.h + 4, 2.2, 1.6, on ? C.green : C.paper, 0.4);
  }
  box(g, m.x + 47.5, m.y + 4, 7.5, 5, C.glass, 0.4);
  for (let i = 0; i < 3; i++) box(g, m.x + 48.5 + i * 2, m.y + 9 - 1 - ((i + Math.floor(now / 300)) % 3) * 1.2, 1.3, 1 + ((i + Math.floor(now / 300)) % 3) * 1.2, C.green, 0);
  // oscilloscope in the music room
  const sp = THINGS.scope;
  box(g, sp.x + 2, sp.y + 2, 17, sp.h - 4, C.glass, 0);
  const onAir = !!(s.radio && s.radio.on), drone = onAir && s.radio.stage >= 3, musical = onAir || ['piano', 'records', 'dance'].includes(a);
  wave(g, sp.x + 2, sp.y + 2, 17, sp.h - 4, now, musical ? (drone ? 1.2 : 3.2) : 0.5, musical ? (drone ? 260 : 70) : 400);
  // TV
  const tv = THINGS.tv, tx = tv.x + 3, ty = tv.y + 3, tw = tv.w - 11, thh = tv.h - 6;
  if (s.tvStatic) {
    for (let y = ty; y < ty + thh; y += 1.2) for (let x = tx; x < tx + tw; x += 1.2) { const v = (x * 7 + y * 13 + tick * 5) % 4; g.fillStyle = [C.paper, C.grey, C.greyD, C.ink][v | 0]; g.fillRect(x, y, 1.2, 1.2); }
  } else if (a === 'tv') {
    box(g, tx, ty, tw, thh, '#0c2a12', 0);
    g.fillStyle = C.green; g.globalAlpha = 0.8;
    g.fillRect(tx + 2 + ((now / 90) % (tw - 8)), ty + thh - 8, 6, 5); g.fillRect(tx + 3, ty + 3, tw - 6, 1.2);
    disc(g, tx + tw * 0.7, ty + 6, 2.4 + Math.sin(now / 300), C.greenL, 0); g.globalAlpha = 1;
  } else { box(g, tx, ty, tw, thh, C.glass, 0); ln(g, tx + 3, ty + thh - 3, tx + 9, ty + 3, 0.7, 'rgba(255,255,255,0.25)'); }
  const work = workInfo(s);
  // fire and chimney smoke while he is home and awake
  if (!s.asleep && !s.away) {
    const f = THINGS.fire;
    for (let i = 0; i < 5; i++) {
      const hgt = 8 + ((Math.sin(now / 90 + i * 1.7) + 1) * 4) + (a === 'fire' ? 4 : 0), x = f.x + 3 + i * 4;
      g.beginPath(); g.moveTo(x - 2.6, f.y + f.h); g.quadraticCurveTo(x - 2, f.y + f.h - hgt * 0.6, x, f.y + f.h - hgt); g.quadraticCurveTo(x + 2, f.y + f.h - hgt * 0.6, x + 2.6, f.y + f.h); g.closePath();
      g.fillStyle = i % 2 ? C.amber : C.red; g.fill();
    }
    // the chimney: a few light puffs; with premium work it follows the effort, from a thin wisp (minimal) to fast, thick,
    // darker billows (max, ultra)
    const lvl = work && work.level >= 0 ? work.level : -1;
    const n = lvl < 0 ? 4 : 2 + lvl * 2, grow = lvl < 0 ? 1 : 0.6 + lvl * 0.32, speed = lvl < 0 ? 1 : 1 + lvl * 0.18;
    const puff = lvl >= 5 ? C.grey : lvl >= 3 ? C.greyL : lvl >= 0 ? C.paper2 : C.greyL;
    // the chimney top is at the picture's top edge, so the effort smoke drifts right with the wind, over the open sky
    // above the roof, where it can be seen growing; the usual puffs rise as before
    for (let i = 0; i < n; i++) {
      const k = (now / 60 * speed + i * (100 / n)) % 100;
      g.globalAlpha = Math.max(0, 0.7 - k / 140);
      const x = lvl < 0 ? 326 + Math.sin(k / 12 + i) * 3 : 326 + k * 1.25 + Math.sin(k / 9 + i) * 2;
      const y = lvl < 0 ? 8 - k * 0.5 : 9 - k * 0.07 + Math.sin(k / 7 + i * 2) * 1.2;
      disc(g, x, y, (2 + k / 25) * grow, puff, 0);
    }
    g.globalAlpha = 1;
  }
  // the attic window: lit while he does premium work, in the provider's colour
  if (work && work.premium) {
    const col = PROVIDER_LIGHT[work.runtime] || C.paper;
    g.globalAlpha = 0.28 + 0.06 * Math.sin(now / 700); disc(g, 250, 31, 10, col, 0); g.globalAlpha = 1;
    disc(g, 250, 31, 5.5, col, 0.5);
    ln(g, 250, 25.5, 250, 36.5, 0.7, C.ink); ln(g, 244.5, 31, 255.5, 31, 0.7, C.ink);
  }
  // phone
  const shake = s.phoneRinging && (tick >> 1) % 2 ? 0.8 : 0;
  rbox(g, 276 + shake, 271.5, 10, 3.6, 1, C.ink, 0);
  if (a !== 'phone') rbox(g, 275 + shake, 269.6, 12, 2.2, 1, C.ink, 0);
  if (s.phoneRinging && (tick >> 3) % 2) { ln(g, 272, 268, 270, 265, 0.6); ln(g, 290, 268, 292, 265, 0.6); ln(g, 281, 266, 281, 263, 0.6); }
  // record spinning, fridge open, pot, shower curtain, watering
  if (a === 'records' || onAir) {                                 // the record turns, to the radio in its tempo
    const r = now / (200 * (onAir && s.radio.bpm ? 120 / s.radio.bpm : 1));
    ln(g, 277, 188.6, 277 + Math.cos(r) * 7, 188.6 + Math.sin(r) * 1.4, 0.5, C.paper);
  }
  // the radio (radio.js): the stations as record sleeves in the cabinet's right half, the one playing pulled up; a note
  // rises over the player at a trade in its pool; finished $IDM tracks hang as records beside the pictures
  if (s.radio) {
    (s.radio.sleeves || []).forEach((r, i) => {
      const up = r.current && onAir ? 2 : 0, x = 280.4 + i * 2.6;
      box(g, x, 194.5 - up, 2, 10.5 + up, r.color, 0.3);
      if (r.current) box(g, x, 194.5 - up, 2, 1, C.paper, 0);
    });
    if (s.radioNote > 0) {
      const k = 1 - s.radioNote / 42;
      g.save(); g.globalAlpha = 1 - k;
      text(g, '♪', 277 + Math.sin(k * 9) * 1.5, 183 - k * 9, 5.5, C.paper, 600, 'center');
      g.restore();
    }
    for (let i = 0; i < Math.min(3, s.radio.tracks || 0); i++) {
      disc(g, THINGS.frames.x + 33, THINGS.frames.y + 4 + i * 9, 3, C.ink, 0.5);
      disc(g, THINGS.frames.x + 33, THINGS.frames.y + 4 + i * 9, 0.9, C.paper, 0);
    }
  }
  if (a === 'snack') { const fr = THINGS.fridge; box(g, fr.x + 1, fr.y + 21, fr.w - 2, fr.h - 22, '#eef6f2', 0.4); box(g, fr.x - 12, fr.y + 20, 12, fr.h - 20, C.paper, 0.6); ln(g, fr.x + 1, fr.y + 38, fr.x + fr.w - 1, fr.y + 38, 0.4); disc(g, fr.x + 8, fr.y + 34, 2.5, C.amber, 0.4); box(g, fr.x + 16, fr.y + 30, 6, 8, C.red, 0.4); }
  if (a === 'cook') {
    const st = THINGS.stove; rbox(g, st.x + 6, st.y - 8, 12, 6, [0, 0, 2, 2], C.ink, 0);
    for (let i = 0; i < 3; i++) { const k = (now / 50 + i * 9) % 26; g.globalAlpha = 1 - k / 26; ln(g, st.x + 9 + i * 3 + Math.sin(k / 3) * 1.2, st.y - 9 - k, st.x + 9 + i * 3 + Math.sin(k / 3 + 1) * 1.2, st.y - 11 - k, 0.5, C.greyM); }
    g.globalAlpha = 1;
  }
  if (a === 'shower') {
    box(g, 206, 59, 56, 47, C.paper, 0.6); for (let x = 210; x < 262; x += 4) ln(g, x, 59, x + 1, 106, 0.35);
    for (let i = 0; i < 8; i++) box(g, 214 + ((i * 7 + now / 30) % 40), 64 + ((now / 15 + i * 11) % 38), 0.6, 2, C.blue, 0);
    for (let i = 0; i < 4; i++) { const k = (now / 40 + i * 13) % 30; g.globalAlpha = 1 - k / 30; disc(g, 222 + i * 9, 57 - k / 2, 1.6, C.greyL, 0); }
    g.globalAlpha = 1;
  } else { box(g, 204, 59, 7, 45, C.paper, 0.6); for (let x = 205.5; x < 211; x += 1.8) ln(g, x, 59, x, 104, 0.3); }
  if (a === 'water') for (let i = 0; i < 3; i++) box(g, 382 - i * 2, 186 + ((now / 40 + i * 5) % 10), 0.6, 1.6, C.blue, 0);
  // mailbox and its flag, the parcel, the front door, the sign
  rbox(g, 14, 264, 20, 11, [5, 5, 0, 0], C.paper, 0.7); ln(g, 18, 268, 30, 268, 0.6);
  if (s.seatNo != null) text(g, '#' + s.seatNo, 24, 273.4, 3.6, C.ink, 700, 'center');                  // the house number (owner, 2026-10-26)
  if (s.paper) { g.save(); g.translate(30, 262.6); g.rotate(-0.55); rbox(g, -6, -1.6, 12, 3.2, 0.6, C.paper2, 0.5); ln(g, -4, 0, 4, 0, 0.3, C.greyD); g.restore(); }   // the day's Daily, rolled in the slot
  if (s.mailbox > 0 || s.outgoing) { box(g, 34, 256, 1.6, 10, C.ink, 0); box(g, 35.6, 256, 5, 3.4, C.red, 0.4); } else box(g, 34, 266, 8, 1.6, C.greyD, 0);
  if (s.parcel) { box(g, 40, 288, 12, 10, C.paper2, 0.6); box(g, 45.3, 288, 1.4, 10, C.amber, 0); ln(g, 40, 291, 52, 291, 0.3); }
  if (s.doorOpen) { box(g, 56, 252, 4, 38, C.page, 0); box(g, 46, 252, 10, 38, C.paper, 0.6); disc(g, 48, 271, 0.8, C.ink, 0); }
  else { box(g, 55, 252, 6, 38, C.paper2, 0.6); disc(g, 59, 271, 0.8, C.ink, 0); }
  box(g, 53.5, 250, 9, 2, C.ink, 0);
  if (s.sign) {
    ln(g, 46, 256, 50.5, 253, 0.4); ln(g, 55, 256, 50.5, 253, 0.4); disc(g, 50.5, 252.8, 0.6, C.ink, 0);
    rbox(g, 38, 256, 25, 15, 1, C.paper, 0.7);
    text(g, 'BACK', 50.5, 262.4, 5, C.ink, 600, 'center'); text(g, 'SOON', 50.5, 268.6, 5, C.ink, 600, 'center');
  }
  // pictures for accepted work, the plaque with the total
  const fx = THINGS.frames.x, fy = THINGS.frames.y, n = Math.min(9, s.frames);
  for (let i = 0; i < n; i++) {
    const x = fx + (i % 3) * 10, y = fy + Math.floor(i / 3) * 9;
    box(g, x, y, 8, 7, C.paper, 0.6); box(g, x + 1.4, y + 1.4, 5.2, 4.2, C.glass, 0);
    if (i % 3 === 0) ln(g, x + 2, y + 4.6, x + 6, y + 2.4, 0.4, C.green);
    else if (i % 3 === 1) disc(g, x + 4, y + 3.5, 1.1, C.green, 0);
    else { ln(g, x + 2, y + 3.5, x + 3.2, y + 2.4, 0.4, C.green); ln(g, x + 3.2, y + 2.4, x + 4.6, y + 4.6, 0.4, C.green); ln(g, x + 4.6, y + 4.6, x + 6, y + 3, 0.4, C.green); }
  }
  box(g, fx, fy + 28, 28, 6.4, C.ink, 0);
  text(g, String(Math.min(99999, s.frames)), fx + 14, fy + 33, 4.8, C.paper, 600, 'center');
  // added 2026-10-24: what the new stations show while he works there
  const d2 = THINGS.desk2;
  if (a === 'inspect') {
    box(g, d2.x + 14, d2.y - 1.6, 8, 1.6, C.paper, 0.35); box(g, d2.x + 15, d2.y - 2.6, 7, 1, C.paper2, 0.3);
    const mx = d2.x + 18 + Math.sin(now / 500) * 2.5;
    ln(g, mx + 1.6, d2.y - 4, mx + 4, d2.y - 1.2, 0.8);
    g.beginPath(); g.arc(mx, d2.y - 5.5, 2.4, 0, Math.PI * 2); g.fillStyle = 'rgba(159,211,255,0.55)'; g.fill(); g.lineWidth = 0.6; g.strokeStyle = C.ink; g.stroke();
  }
  if (a === 'typewrite') {
    const k = (now / 2600) % 1;
    box(g, d2.x + 4, d2.y - 9 - k * 6, 8, 3.4 + k * 6, C.paper, 0.4);
    for (let i = 0; i < Math.floor(k * 4); i++) ln(g, d2.x + 5, d2.y - 9 - k * 6 + 1.2 + i * 1.6, d2.x + 11 - (i % 2), d2.y - 9 - k * 6 + 1.2 + i * 1.6, 0.25);
  }
  const rk = THINGS.rack;
  if (a === 'experiment') {
    for (let i = 0; i < 4; i++) {
      const lvl = 4 + Math.sin(now / 400 + i * 1.3) * 2;
      box(g, rk.x + 2.4 + i * 4, rk.y + 8 - lvl, 1.4, lvl, i % 2 ? C.green : C.blue, 0);
      const k = (now / 30 + i * 9) % 18;
      g.globalAlpha = 1 - k / 18; disc(g, rk.x + 3.1 + i * 4 + Math.sin(k) * 0.6, rk.y - 3 - k * 0.6, 0.6, C.paper, 0.25); g.globalAlpha = 1;
    }
  }
  const cb = THINGS.cabinet;
  if (a === 'file') {
    box(g, cb.x - 7, cb.y + 1, cb.w, 7.6, C.paper, 0.5);
    for (let i = 0; i < 5; i++) box(g, cb.x - 5.5 + i * 3, cb.y - 0.5 - ((i + Math.floor(now / 400)) % 3), 2.2, 3, '#fbfbf9', 0.3);
  }
  const bn = THINGS.bench;
  if (a === 'hammer' && (now % 380) < 120) {
    for (const [dx, dy] of [[-3, -3], [3, -3], [0, -4.5], [-4, 0], [4, 0]]) ln(g, bn.x + 17 + dx * 0.4, bn.y - 1 + dy * 0.4, bn.x + 17 + dx, bn.y - 1 + dy, 0.5, C.amber);
  }
  const wb = THINGS.board;
  if (s.board && s.board.steps.length) jobBoard(g, wb, s.board, now);
  else if (a === 'plan') {
    const k = Math.floor(now / 700) % 9;
    g.save(); g.lineWidth = 0.5; g.strokeStyle = C.ink;
    const parts = [[4, 5, 9, 5], [16, 5, 24, 5], [8, 10, 18, 13], [4, 16, 10, 16], [14, 18, 26, 18], [6, 22, 22, 22], [20, 9, 26, 14], [4, 10, 7, 13], [24, 20, 27, 24]];
    for (let i = 0; i <= k; i++) { const [x0, y0, x1, y1] = parts[i]; g.strokeRect(wb.x + x0, wb.y + y0 - 1.5, x1 - x0, 3); }
    ln(g, wb.x + 9, wb.y + 5, wb.x + 16, wb.y + 5, 0.4, C.green); g.restore();
  }
  const pb = THINGS.pinball;
  for (let i = 0; i < 5; i++) {
    const on = a === 'pinball' ? ((i + Math.floor(now / 150)) % 3) === 0 : i === 2 && (now >> 10) % 2;
    disc(g, pb.x + 5 + i * 3, pb.y + 8, 1, on ? [C.amber, C.red, C.green][i % 3] : '#2a2a2a', 0);
  }
  if (a === 'pinball') disc(g, pb.x + 4 + ((now / 40) % (pb.w - 8)), pb.y + 26 + Math.sin(now / 120) * 3, 0.9, C.ink, 0);
  if (s.alarm > 0) {                                                         // a schedule's alarm: the clock on the mantel rings
    const j = (now >> 5) % 2 ? 0.7 : -0.7;
    disc(g, 302 + j, 234, 4.4, C.paper, 0.7); ln(g, 302 + j, 234, 302 + j, 231.4, 0.5); ln(g, 302 + j, 234, 304 + j, 234, 0.5);
    disc(g, 299 + j, 229.4, 1.3, C.amber, 0.4); disc(g, 305 + j, 229.4, 1.3, C.amber, 0.4);
    for (const [x0, y0, x1, y1] of [[295, 228, 293, 226], [309, 228, 311, 226], [295, 238, 293, 240], [309, 238, 311, 240]]) ln(g, x0, y0, x1, y1, 0.5);
  }
  // the Sworn card over the fireplace (sworn.js; main.js sets s.sworn for a seat whose owner holds one): the real card's
  // hive in the house's greys, each family cell filled to the tier the wallet holds (owner, 2026-10-26)
  if (s.sworn) swornCard(g, s.sworn, now);
  if (s.plaque) treePlaque(g, s.plaque);
  // the easel's picture grows while he paints
  const e = THINGS.easel;
  if (a === 'paint') {
    const k = 1 + Math.floor(now / 420) % 18;
    for (let i = 0; i < k; i++) { g.fillStyle = [C.green, C.blue, C.red, C.amber, C.greenD][i % 5]; g.beginPath(); g.ellipse(e.x + 3 + (i * 5) % 12, e.y + 3 + (i * 3) % 10, 1.6, 1, i, 0, Math.PI * 2); g.fill(); }
  } else { ln(g, e.x + 3, e.y + 11, e.x + 15, e.y + 9, 0.3, C.grey); }
}

// a launch he worked on went live: bursts over the roof
// The job his seat works on (or the followed one) as a small diagram on the whiteboard (2026-10-25; main.js sets
// s.board): a column per dependency depth, a box per step: ink when accepted, amber while a seat works on it, grey while
// it is checked, red when it failed, an outline while it waits. His steps are ringed in red marker; the step that just
// changed blinks green while he taps it (board.flash until board.flashUntil, wall-clock ms).
function jobBoard(g, wb, b, now) {
  const cols = b.cols, rows = Math.max(...cols.map((c) => c.length)), pad = 2.4;
  const cw = (wb.w - pad * 2) / cols.length, rh = Math.min(5.2, (wb.h - pad * 2) / rows);
  const bw = Math.min(6.5, cw * 0.62), bh = Math.min(2.8, rh * 0.6);
  const at = new Map();
  cols.forEach((c, ci) => c.forEach((st, ri) => at.set(st.key, {
    x: wb.x + pad + ci * cw + (cw - bw) / 2, y: wb.y + pad + (wb.h - pad * 2 - c.length * rh) / 2 + ri * rh + (rh - bh) / 2 })));
  for (const st of b.steps) for (const d of st.deps) {
    const p = at.get(d), q = at.get(st.key);
    if (p && q) ln(g, p.x + bw, p.y + bh / 2, q.x, q.y + bh / 2, 0.22, C.greyM);
  }
  const flash = b.flash && Date.now() < b.flashUntil ? b.flash : null;
  for (const st of b.steps) {
    const p = at.get(st.key);
    if (!p) continue;
    const blink = flash === st.key && (now >> 8) % 2;
    const fill = blink ? C.green : st.state === 'accepted' ? C.ink : st.state === 'working' ? ((now >> 9) % 2 ? C.amber : '#f2cf7d')
      : st.state === 'verifying' ? C.grey : st.state === 'failed' ? C.red : '#fbfbf9';
    box(g, p.x, p.y, bw, bh, fill, st.state === 'waiting' ? 0.2 : 0.3);
    if (st.mine) {
      g.save(); g.beginPath(); g.ellipse(p.x + bw / 2, p.y + bh / 2, bw / 2 + 1.3, bh / 2 + 1.1, -0.1, 0, Math.PI * 2);
      g.lineWidth = 0.45; g.strokeStyle = C.redD; g.stroke(); g.restore();
    }
  }
}

function fireworks(g, now) {
  for (let k = 0; k < 6; k++) {                     // in the open sky left and right of the roof, which hides the rest
    const t = now / 1300 + k * 0.19, n = Math.floor(t), f = t - n, rnd = seeded(n * 7 + k * 101);
    const x = k % 2 ? 22 + rnd() * 95 : 385 + rnd() * 80, y = 8 + rnd() * 20, col = [C.amber, C.red, C.green, C.blue][Math.floor(rnd() * 4)], r = 4 + f * 24;
    g.save(); g.globalAlpha = 1 - f * f;
    for (let a = 0; a < 16; a++) {
      const th = a * Math.PI / 8, cx = Math.cos(th), cy = Math.sin(th);
      ln(g, x + cx * r * 0.5, y + cy * r * 0.5, x + cx * r, y + cy * r, 1.1, col);
      disc(g, x + cx * (r + 1.6), y + cy * (r + 1.6), 0.6, col, 0);
    }
    g.restore();
  }
}

// While he works: a green ticker along the machine wall's top edge, under the ceiling (provider · model · effort), and
// the big dial's needle on the effort over its seven marks (feed.js EFFORTS), with a green arc up to it; when the effort
// is not known (the step does not run the seat's premium model) the needle rests and a '?' sits on the dial.
function machineReadout(g, info, m, now) {
  const x = m.x, y = 132.6, w = m.w, h = 8.6;
  box(g, x, y, w, h, C.glass, 0.6);
  const msg = `${info.provider} · ${info.model || 'MODEL ?'} · ${info.effort ? info.effort.toUpperCase() : 'EFFORT ?'}   ·   `;
  g.save();
  g.beginPath(); g.rect(x + 1, y + 0.6, w - 2, h - 1.2); g.clip();
  g.font = `600 5.8px ${MONO}`;
  const tw = g.measureText(msg).width, off = (now / 1000 * 15) % tw;
  for (let k = 0; k < 3; k++) text(g, msg, x + 2 - off + k * tw, y + 6.4, 5.8, C.green, 600, 'left');
  g.fillStyle = 'rgba(4,8,4,0.45)';                                   // the dot matrix: dark gaps between the LEDs
  for (let i = x + 1; i < x + w - 1; i += 1.15) g.fillRect(i, y + 0.6, 0.3, h - 1.2);
  for (let j = y + 1.2; j < y + h - 0.6; j += 1.15) g.fillRect(x + 1, j, w - 2, 0.3);
  g.restore();
  const cx = m.x + 7.5, cy = m.y + 25, start = Math.PI * 0.85;
  disc(g, cx, cy, 4.5, C.paper, 0.6);
  for (let a = 0; a < 7; a++) { const t = start + a * Math.PI * 0.22; ln(g, cx + Math.cos(t) * 3.6, cy + Math.sin(t) * 3.6, cx + Math.cos(t) * 4.3, cy + Math.sin(t) * 4.3, 0.3); }
  if (info.level >= 0) {
    const t = start + info.level * Math.PI * 0.22;
    g.beginPath(); g.arc(cx, cy, 2.9, start, t); g.lineWidth = 1.2; g.strokeStyle = C.green; g.stroke();
    ln(g, cx, cy, cx + Math.cos(t) * 3.7, cy + Math.sin(t) * 3.7, 0.6, C.ink);
  } else {
    ln(g, cx, cy, cx, cy + 3.4, 0.6, C.ink);
    text(g, '?', cx, cy - 0.6, 4.6, C.greenD, 600, 'center');
  }
  disc(g, cx, cy, 0.7, C.ink, 0);
}

// the job the page followed is done: big bursts all over the sky, the roof too, each after its rocket's climb; deeper
// colours by day, where the sky is the window blue
function bigFireworks(g, now, day) {
  const cols = day ? [C.redD, C.amber, C.greenD, '#6a3df0', C.red] : [C.amber, C.red, C.green, C.blue, C.paper];
  for (let k = 0; k < 11; k++) {
    const t = now / (1500 + k * 70) + k * 0.31, n = Math.floor(t), f = t - n, rnd = seeded(n * 13 + k * 211);
    const x = 18 + rnd() * 444, y = 8 + rnd() * 38, col = cols[Math.floor(rnd() * cols.length)], col2 = cols[Math.floor(rnd() * cols.length)];
    if (f < 0.2) {                                    // the rocket climbs
      const e = f / 0.2, y0 = y + 50, at = (v) => y0 - (y0 - y) * v;
      ln(g, x, at(Math.max(0, e - 0.35)), x, at(e), 1.3, col);
      disc(g, x, at(e), 1.1, col, 0);
      continue;
    }
    const e = (f - 0.2) / 0.8, r = 7 + (1 - (1 - e) * (1 - e)) * 44, drop = e * e * 11;
    g.save(); g.globalAlpha = Math.min(1, 1.25 - e * e * 1.25);
    for (let a = 0; a < 28; a++) {
      const th = a * Math.PI / 14 + k, cx = Math.cos(th), cy = Math.sin(th);
      ln(g, x + cx * r * 0.58, y + cy * r * 0.58 + drop, x + cx * r, y + cy * r + drop, 1.8, col);
      disc(g, x + cx * (r + 2.4), y + cy * (r + 2.4) + drop * 1.3, 1.1, col, 0);
      if (a % 2 === 0) disc(g, x + cx * r * 0.38, y + cy * r * 0.38 + drop, 0.9, col2, 0);
    }
    if (e < 0.12) disc(g, x, y, 5 * (1 - e / 0.12) + 1.2, C.paper, 0);   // the flash
    g.restore();
  }
}

function lights(g, s, phase) {
  // an hour without a trade on the radio: the music room dims with the drone
  if (s.radio && s.radio.on && s.radio.stage >= 3 && !s.asleep && !s.away && !s.party) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(200, 134, 148, 74); }
  if ((!s.asleep && !s.away) || s.party) return;        // a party keeps the lights on
  g.fillStyle = phase === 'night' || phase === 'dusk' ? 'rgba(0,0,0,0.62)' : 'rgba(0,0,0,0.38)';
  g.fillRect(56, 48, 388, 242);
}

function bubble(g, x, y, icon, now) {
  const w = 11, h = 9.5, bx = x - w / 2, by = y - h - 3 - (Math.floor(now / 530) % 2) * 0.6;
  g.beginPath(); g.roundRect(bx, by, w, h, 2.4); g.moveTo(bx + 3, by + h); g.lineTo(bx + 2.4, by + h + 2.6); g.lineTo(bx + 5.4, by + h);
  g.fillStyle = C.paper; g.fill(); g.lineWidth = 0.55; g.strokeStyle = C.ink; g.stroke();
  const cx = bx + w / 2, cy = by + h / 2;
  if (icon === 'heart') {
    g.beginPath(); g.moveTo(cx, cy + 3); g.bezierCurveTo(cx - 5, cy - 1, cx - 2.4, cy - 4.4, cx, cy - 1.6); g.bezierCurveTo(cx + 2.4, cy - 4.4, cx + 5, cy - 1, cx, cy + 3);
    g.fillStyle = C.red; g.fill();
  } else if (icon === 'star') {
    g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 1.5 : 3.6, t = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(cx + Math.cos(t) * r, cy + 0.4 + Math.sin(t) * r); }
    g.closePath(); g.fillStyle = C.amber; g.fill(); g.lineWidth = 0.35; g.stroke();
  } else if (icon === 'quill') {                                   // Sonnet
    g.beginPath(); g.moveTo(cx - 3, cy + 3.6); g.quadraticCurveTo(cx - 2.4, cy - 2.4, cx + 3.4, cy - 3.8);
    g.quadraticCurveTo(cx + 1.4, cy + 0.8, cx - 3, cy + 3.6); g.fillStyle = C.paper2; g.fill(); g.lineWidth = 0.45; g.strokeStyle = C.ink; g.stroke();
    ln(g, cx - 3.6, cy + 4.3, cx + 1.8, cy - 1.9, 0.45);
  } else if (icon === 'leaf') {                                    // Haiku
    g.save(); g.translate(cx, cy + 0.3); g.rotate(-0.6);
    g.beginPath(); g.ellipse(0, 0, 3.9, 2.1, 0, 0, Math.PI * 2); g.fillStyle = C.green; g.fill(); g.lineWidth = 0.4; g.strokeStyle = C.ink; g.stroke();
    ln(g, -4.4, 0, 3.4, 0, 0.35); g.restore();
  } else if (icon === 'book') {                                    // Fable
    g.beginPath(); g.moveTo(cx, cy - 1.8); g.quadraticCurveTo(cx - 2.2, cy - 3, cx - 4.2, cy - 2.2); g.lineTo(cx - 4.2, cy + 2.8);
    g.quadraticCurveTo(cx - 2.2, cy + 2, cx, cy + 3.2); g.quadraticCurveTo(cx + 2.2, cy + 2, cx + 4.2, cy + 2.8); g.lineTo(cx + 4.2, cy - 2.2);
    g.quadraticCurveTo(cx + 2.2, cy - 3, cx, cy - 1.8); g.closePath(); g.fillStyle = C.paper; g.fill(); g.lineWidth = 0.45; g.strokeStyle = C.ink; g.stroke();
    ln(g, cx, cy - 1.8, cx, cy + 3.2, 0.4);
    for (const d of [-0.4, 0.8, 2]) { ln(g, cx - 3.3, cy + d - 0.6, cx - 0.9, cy + d - 0.2, 0.25); ln(g, cx + 0.9, cy + d - 0.2, cx + 3.3, cy + d - 0.6, 0.25); }
  } else if (icon === 'sun') {                                     // Sol
    for (let i = 0; i < 8; i++) { const t = i * Math.PI / 4; ln(g, cx + Math.cos(t) * 2.7, cy + Math.sin(t) * 2.7, cx + Math.cos(t) * 4, cy + Math.sin(t) * 4, 0.55, C.ink); }
    disc(g, cx, cy, 2.1, C.amber, 0.45);
  } else if (icon === 'tear') {                                    // a lost trade
    g.beginPath(); g.moveTo(cx, cy - 3.8); g.quadraticCurveTo(cx + 3.2, cy + 0.6, cx, cy + 3.2); g.quadraticCurveTo(cx - 3.2, cy + 0.6, cx, cy - 3.8);
    g.fillStyle = C.blue; g.fill(); g.lineWidth = 0.45; g.strokeStyle = C.ink; g.stroke();
  } else if (icon === 'moon') {                                    // Luna
    disc(g, cx - 0.4, cy + 0.2, 3.3, C.greyL, 0.45); disc(g, cx + 1.4, cy - 0.9, 2.8, C.paper, 0);
  } else {
    const glyph = { note: '♪', z: 'z', ask: '?', bang: '!', dots: '…' }[icon] || '';
    text(g, glyph, cx, cy + 2.6, icon === 'note' ? 7.2 : 7, C.ink, 600, 'center');
  }
}

// trading memecoins on the machine: green and red candles, one more every half second, and then the big red one
// (frame: ticks since he sat down, 30 a second)
function candles(g, x, y, w, h, frame) {
  box(g, x, y, w, h, C.glass, 0);
  const n = Math.min(8, 1 + Math.floor(frame / 15)), crash = frame > 156, rnd = seeded(2021);
  let p = y + h * 0.62;
  for (let i = 0; i < n; i++) {
    const up = rnd() < (i < 5 ? 0.72 : 0.4), d = (1.2 + rnd() * 2.6) * (up ? -1 : 1), cx = x + 1.6 + i * 3.1;
    const top = Math.min(p, p + d), bh = Math.max(0.8, Math.abs(d)), col = up ? C.green : C.red;
    ln(g, cx + 0.8, top - 1, cx + 0.8, top + bh + 1, 0.3, col);
    box(g, cx, top, 1.6, bh, col, 0);
    p = Math.max(y + 2.5, Math.min(y + h - 2.5, p + d));
  }
  if (crash) {
    const cx = x + 1.6 + n * 3.1, grow = Math.min(1, (frame - 156) / 20);
    box(g, cx, y + 1.5, 2.8, (h - 3) * grow, C.red, 0);
    if (grow >= 1) text(g, '-87%', x + w - 1.5, y + h - 2, 4.2, C.red, 600, 'right');
  }
}

// buying IMD on the machine: BUY, and the candles go one way only
function buyScreen(g, x, y, w, h, frame) {
  box(g, x, y, w, h, C.glass, 0);
  const n = Math.min(6, 1 + Math.floor(frame / 12));
  for (let i = 0; i < n; i++) box(g, x + 2 + i * 3.4, y + h - 3 - i * 2.2 - 3, 1.8, 3 + i * 0.4, C.green, 0);
  if ((frame >> 3) % 2) text(g, 'BUY', x + w - 2, y + 6.5, 5, C.green, 600, 'right');
}

// the step he works on now, as feed.js machineInfo reads it (provider, model, family, premium, effort), while he is
// home and awake; null otherwise
function workInfo(s) { return s.working && s.machine && !s.asleep && !s.away ? s.machine : null; }
// each model shows as its namesake in his bubble (Opus a piece of music, Sonnet a quill, Haiku a leaf, Fable a book;
// Astra a star, Sol the sun, Luna the moon); another family shows none
const MODEL_SYMBOL = { opus: 'note', sonnet: 'quill', haiku: 'leaf', fable: 'book', astra: 'star', sol: 'sun', luna: 'moon' };
// the attic light's colour for premium work: warm amber for Claude Code, cool white-green for Codex
const PROVIDER_LIGHT = { claude: '#f0b43c', codex: '#d4f5cf' };

// at the glass: his sprite from the front, big, pressed to the screen; each knock bumps him towards you
function closeup(g, th, c, now) {
  const k = c.k == null ? 1 : c.k, ease = 1 - (1 - k) * (1 - k);
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, W, H);
  if (!th.pepe) return;
  const name = c.phase === 'knock' ? (c.hit ? 'front_lookup' : 'front_stand') : c.phase === 'wait' && !c.ack ? 'front_scratch' : 'front_stand';
  const grow = c.hit ? 1.06 : 1, h = 300 * grow, w = h * 240 / 284, top = 330 - ease * 250 - (grow - 1) * 120;
  g.drawImage(th.pepe, PI[name] * 240, 0, 240, 284, W / 2 - w / 2, top, w, h);
  if (c.hit) {
    const hx = W / 2, hy = top + 60;
    g.lineWidth = 2.2; g.strokeStyle = '#ffffff';
    for (const [dx, dy] of [[-110, -30], [110, -36], [-120, 30], [118, 26], [0, -80], [-70, -70], [72, -66]]) {
      g.beginPath(); g.moveTo(hx + dx * 0.78, hy + dy * 0.78); g.lineTo(hx + dx, hy + dy); g.stroke();
    }
  }
  g.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 40; i++) g.fillRect(90 + i * 2, 20 + i * 3, 30, 1.6);
}
