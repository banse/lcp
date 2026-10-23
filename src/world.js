// The house: geometry, the static drawing (cached once) and the props that change every frame.
export const W = 480, H = 320;
export const FLOOR_Y = [290, 208, 126];          // feet line per floor: ground, first, top
export const CEIL_Y = [214, 132, 52];
export const OUT_Y = 298;                        // feet line outside
export const DOOR_X = 58;                        // front door in the left outer wall
export const FLIGHTS = [                         // [x, y] of each flight's ends
  { lower: 0, bottom: [364, 290], top: [436, 208] },
  { lower: 1, bottom: [436, 208], top: [364, 126] },
];

// where he stands or sits for each thing he does: floor ('out' = garden), x, facing (1 right, -1 left)
export const SPOTS = {
  desk: { floor: 1, x: 102, face: 1 },
  deskStand: { floor: 1, x: 108, face: 1 },
  shelf: { floor: 1, x: 160, face: 1 },
  frames: { floor: 1, x: 84, face: -1 },
  telescope: { floor: 1, x: 304, face: 1 },
  piano: { floor: 1, x: 250, face: -1 },
  records: { floor: 1, x: 262, face: 1 },
  plant: { floor: 1, x: 390, face: -1 },
  armchair: { floor: 0, x: 250, face: -1 },
  phone: { floor: 0, x: 288, face: -1 },
  fire: { floor: 0, x: 302, face: 1 },
  stove: { floor: 0, x: 126, face: 1 },
  sink: { floor: 0, x: 84, face: 1 },
  fridge: { floor: 0, x: 156, face: 1 },
  bowl: { floor: 0, x: 140, face: 1 },
  livingMid: { floor: 0, x: 226, face: 1 },
  kitchenWin: { floor: 0, x: 80, face: -1 },
  bed: { floor: 2, x: 104, face: -1 },
  bedEdge: { floor: 2, x: 112, face: 1 },
  gym: { floor: 2, x: 146, face: 1 },
  tub: { floor: 2, x: 234, face: 1 },
  bathSink: { floor: 2, x: 292, face: 1 },
  bedWin: { floor: 2, x: 148, face: 1 },
  mailbox: { floor: 'out', x: 40, face: -1 },
  parcel: { floor: 'out', x: 50, face: -1 },
};

export const P = {
  ink: '#2a1d16', white: '#fbf8ee', cream: '#f2e8d2', grey: '#a7a39a', greyD: '#5d5a56', black: '#1d1b24',
  skyDay: '#8fcff0', skyDay2: '#cbe9f6', skyNight: '#131a3e', skyNight2: '#2a336f', dusk: '#f2a46c', dusk2: '#7a5aa8',
  dawn: '#f7c58a', dawn2: '#8fb4e2', star: '#fff4c4', sun: '#ffe36a', moon: '#f4eed2',
  grass: '#5aa645', grassD: '#3f8434', grassL: '#7cc25e', soil: '#6b4a2b', path: '#cdb88c',
  roof: '#b0453a', roofD: '#82302a', roofL: '#cf6b55', brick: '#a5503a', brickD: '#7e3a2a', mortar: '#c99a7c',
  wallCut: '#efe3c8', wallEdge: '#8a6440', beam: '#6a4426', floorTop: '#c99258', plank: '#94643a',
  stone: '#9a968c', stoneD: '#6f6c64',
  kitchen: '#efe1a4', living: '#bfd8a8', study: '#a8c5e0', music: '#e3b8cb', bedroom: '#c9badf', bath: '#c2e6e2', stair: '#e4cf9c',
  wood: '#9b6332', woodL: '#c48a4e', woodD: '#6a4022', red: '#c8402e', redD: '#8e2a20', yellow: '#f2c84a',
  green: '#4f9a3c', blue: '#3a64b8', blueD: '#26407a', teal: '#3aa39a', pink: '#e27aa0', purple: '#7b5bb0',
  beige: '#ddd2b2', screen: '#2f5fa8', screenL: '#8fd0ff',
};

export function shade(hex, amt) {        // amt < 0 darker, > 0 lighter
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export function rect(g, c, x, y, w, h) {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function line(g, c, x0, y0, x1, y1, t = 1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  g.fillStyle = c;
  for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), t, t);
}

export function disc(g, c, cx, cy, r) {
  g.fillStyle = c;
  for (let y = -r; y <= r; y++) {
    const w = Math.round(Math.sqrt(r * r - y * y));
    g.fillRect(cx - w, cy + y, 2 * w + 1, 1);
  }
}

const ROOMS = [
  ['kitchen', 60, 214, 196, 290], ['living', 200, 214, 356, 290], ['study', 60, 132, 196, 208],
  ['music', 200, 132, 356, 208], ['bedroom', 60, 52, 196, 126], ['bath', 200, 52, 356, 126],
  ['stair', 360, 214, 440, 290], ['stair', 360, 132, 440, 208], ['stair', 360, 52, 440, 126],
];

// windows: the static layer leaves their panes transparent so the sky shows through
const WINDOWS = [[66, 222, 96, 244], [262, 222, 292, 244], [312, 142, 350, 176], [138, 64, 158, 90], [404, 226, 430, 252], [372, 66, 398, 90]];

function wallpaper(g, name, x0, y0, x1, y1) {
  const c = P[name];
  rect(g, c, x0, y0, x1 - x0, y1 - y0);
  const d = shade(c, -0.08);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const u = x - x0, v = y - y0;
      let on = false;
      if (name === 'kitchen') on = (u % 12 === 0) || (v % 12 === 6 && u % 12 === 6);
      else if (name === 'living') on = u % 10 === 0 || u % 10 === 2;
      else if (name === 'study') on = u % 8 === 4 && v % 8 === 4;
      else if (name === 'music') on = (u + v) % 14 === 0 && v % 2 === 0;
      else if (name === 'bedroom') on = (u % 16 === 8 && v % 16 === 8) || (u % 16 === 0 && v % 16 === 0);
      else if (name === 'stair') on = v % 10 === 0;
      else if (name === 'bath') on = false;
      if (on) { g.fillStyle = d; g.fillRect(x, y, 1, 1); }
    }
  }
  rect(g, shade(c, -0.25), x0, y1 - 3, x1 - x0, 3);     // skirting board
}

function windowFrame(g, x0, y0, x1, y1) {
  rect(g, P.woodL, x0 - 2, y0 - 2, x1 - x0 + 4, 2);
  rect(g, P.woodL, x0 - 2, y1, x1 - x0 + 4, 2);
  rect(g, P.woodL, x0 - 2, y0, 2, y1 - y0);
  rect(g, P.woodL, x1, y0, 2, y1 - y0);
  rect(g, P.white, x0 - 3, y1 + 2, x1 - x0 + 6, 2);        // sill
  const mx = Math.round((x0 + x1) / 2), my = Math.round((y0 + y1) / 2);
  rect(g, P.woodL, mx, y0, 1, y1 - y0);
  rect(g, P.woodL, x0, my, x1 - x0, 1);
}

function roof(g) {
  rect(g, P.brick, 318, 8, 16, 34);                        // chimney behind the roof
  rect(g, P.brickD, 316, 6, 20, 4);
  for (let y = 12; y < 40; y += 4) rect(g, P.mortar, 318, y, 16, 1);
  for (let y = 6; y <= 52; y++) {
    const hw = Math.round((y - 6) * 212 / 46);
    rect(g, (Math.floor((y - 6) / 5) % 2) ? P.roof : P.roofD, 250 - hw, y, 2 * hw + 1, 1);
  }
  for (let y = 11; y <= 52; y += 5) {                      // shingle seams
    const hw = Math.round((y - 6) * 212 / 46);
    for (let x = 250 - hw + ((y / 5) % 2 ? 4 : 10); x < 250 + hw; x += 12) rect(g, P.roofD, x, y - 4, 1, 4);
  }
  for (let y = 6; y <= 52; y++) {                          // trim
    const hw = Math.round((y - 6) * 212 / 46);
    rect(g, P.roofL, 250 - hw - 1, y, 2, 1);
    rect(g, P.roofL, 250 + hw, y, 2, 1);
  }
  disc(g, P.wallCut, 250, 32, 7);                          // attic window
  disc(g, P.blueD, 250, 32, 5);
  rect(g, P.wallCut, 249, 27, 2, 11);
  rect(g, P.wallCut, 245, 31, 11, 2);
}

function stairs(g) {
  for (const f of FLIGHTS) {
    const [bx, by] = f.bottom, [tx, ty] = f.top;
    const dir = Math.sign(tx - bx);
    for (let i = 0; i < 9; i++) {
      const x = dir > 0 ? bx + 8 * i : bx - 8 * (i + 1);
      const y = Math.round(by - (i + 1) * (by - ty) / 9);
      rect(g, P.woodL, x, y, 8, 2);                         // tread
      rect(g, P.wood, x, y + 2, 8, Math.round((by - ty) / 9) - 2);   // riser
    }
    line(g, P.woodD, bx, by, tx, ty, 2);                    // stringer
    line(g, P.woodD, bx, by - 20, tx, ty - 20, 1);          // banister
    for (let i = 0; i <= 9; i++) {
      const x = Math.round(bx + (tx - bx) * i / 9), y = Math.round(by + (ty - by) * i / 9);
      rect(g, P.woodD, x, y - 20, 1, 18);
    }
  }
}

function furniture(g) {
  // kitchen
  rect(g, P.woodD, 100, 236, 52, 2);
  [[104, P.red], [112, P.yellow], [120, P.green], [130, P.blue], [140, P.white]].forEach(([x, c], i) => {
    rect(g, c, x, 228 + (i % 2) * 2, 6, 8 - (i % 2) * 2); rect(g, P.woodD, x + 1, 227 + (i % 2) * 2, 4, 1);
  });
  for (let y = 248; y < 262; y += 4) for (let x = 62; x < 112; x += 4) rect(g, ((x + y) / 4) % 2 ? P.white : P.screenL, x, y, 4, 4);
  rect(g, P.woodL, 62, 264, 50, 26); rect(g, P.woodD, 86, 266, 1, 22);
  rect(g, P.woodD, 82, 274, 2, 3); rect(g, P.woodD, 89, 274, 2, 3);
  rect(g, P.grey, 60, 261, 54, 3); rect(g, P.greyD, 72, 261, 20, 2);
  rect(g, P.greyD, 80, 252, 2, 9); rect(g, P.greyD, 80, 252, 7, 2);
  rect(g, P.white, 114, 262, 24, 28); rect(g, P.greyD, 118, 272, 16, 12); rect(g, P.black, 119, 273, 14, 10);
  [118, 124, 130].forEach((x) => rect(g, P.greyD, x, 266, 3, 2));
  rect(g, P.black, 116, 259, 8, 3); rect(g, P.black, 128, 259, 8, 3);
  rect(g, P.white, 162, 230, 30, 60); rect(g, P.grey, 162, 230, 1, 60); rect(g, P.grey, 191, 230, 1, 60);
  rect(g, P.grey, 162, 230, 30, 1); rect(g, P.grey, 162, 249, 30, 1);
  rect(g, P.greyD, 186, 236, 2, 8); rect(g, P.greyD, 186, 254, 2, 16);
  rect(g, P.red, 144, 286, 10, 4); rect(g, P.woodD, 146, 285, 6, 1);
  // living room
  rect(g, P.grey, 214, 226, 22, 16); rect(g, P.skyDay, 216, 228, 18, 8); rect(g, P.green, 216, 236, 18, 4);
  disc(g, P.yellow, 230, 231, 2);
  rect(g, P.woodD, 204, 278, 30, 12); rect(g, P.wood, 206, 281, 26, 1);
  rect(g, P.greyD, 206, 252, 26, 26); rect(g, P.black, 208, 254, 22, 20);
  line(g, P.greyD, 214, 252, 208, 242); line(g, P.greyD, 224, 252, 230, 242);
  rect(g, P.redD, 260, 258, 6, 32); rect(g, P.red, 240, 276, 22, 6); rect(g, P.red, 238, 272, 4, 10);
  rect(g, P.redD, 240, 282, 22, 2); rect(g, P.woodD, 240, 284, 2, 6); rect(g, P.woodD, 262, 284, 2, 6);
  rect(g, P.woodL, 270, 278, 12, 2); rect(g, P.woodL, 272, 280, 2, 10); rect(g, P.woodL, 278, 280, 2, 10);
  for (let y = 244; y < 290; y += 4) for (let x = 298 + ((y / 4) % 2) * 4; x < 346; x += 8) {
    rect(g, P.brick, x, y, 7, 3);
  }
  rect(g, P.mortar, 298, 244, 48, 1);
  rect(g, P.woodD, 294, 241, 56, 4);
  rect(g, P.black, 310, 262, 24, 28); rect(g, P.brickD, 308, 260, 28, 2);
  rect(g, P.yellow, 300, 233, 6, 8); rect(g, P.woodD, 301, 232, 4, 1);    // clock
  rect(g, P.blue, 336, 234, 6, 7);                                          // vase
  rect(g, P.red, 230, 288, 66, 2);
  for (let x = 232; x < 294; x += 6) rect(g, P.yellow, x, 288, 2, 2);
  // study
  rect(g, P.woodD, 90, 196, 15, 3); rect(g, P.woodD, 90, 180, 3, 19); rect(g, P.woodD, 92, 199, 2, 9); rect(g, P.woodD, 102, 199, 2, 9);
  rect(g, P.woodD, 108, 188, 52, 3); rect(g, P.woodD, 110, 191, 2, 17); rect(g, P.woodD, 156, 191, 2, 17);
  rect(g, P.wood, 140, 191, 16, 7); rect(g, P.yellow, 147, 194, 2, 1);
  rect(g, P.beige, 120, 168, 26, 18); rect(g, P.beige, 130, 186, 6, 2); rect(g, P.beige, 112, 186, 14, 2);
  rect(g, P.greyD, 122, 170, 22, 14);
  rect(g, P.greyD, 150, 186, 8, 2); line(g, P.greyD, 152, 186, 150, 177);
  rect(g, P.woodD, 166, 146, 28, 62);
  [150, 164, 178, 192].forEach((y, i) => {
    for (let x = 168, k = 0; x < 192; x += 3, k++) {
      const c = [P.red, P.blue, P.yellow, P.green, P.white, P.purple, P.teal][(k + i * 2) % 7];
      rect(g, c, x, y + (k % 3 === 0 ? 2 : 0), 3, 12 - (k % 3 === 0 ? 2 : 0));
    }
    rect(g, P.wood, 166, y + 12, 28, 2);
  });
  // music room
  rect(g, P.woodD, 204, 170, 32, 38); rect(g, P.wood, 206, 172, 28, 2); rect(g, P.black, 206, 176, 28, 10);
  rect(g, P.white, 212, 164, 10, 6); rect(g, P.greyD, 213, 166, 8, 1);
  rect(g, P.woodD, 236, 186, 8, 4); rect(g, P.white, 236, 184, 8, 2);
  for (let x = 237; x < 244; x += 2) rect(g, P.black, x, 184, 1, 1);
  rect(g, P.woodD, 206, 204, 3, 4); rect(g, P.woodD, 231, 204, 3, 4);
  rect(g, P.red, 244, 196, 12, 3); rect(g, P.woodD, 249, 199, 2, 9);
  rect(g, P.woodL, 270, 192, 22, 16); rect(g, P.woodD, 280, 194, 1, 12); rect(g, P.grey, 270, 189, 22, 3);
  rect(g, P.white, 272, 148, 20, 16);
  for (let y = 151; y < 162; y += 3) rect(g, P.greyD, 274, y, 16, 1);
  rect(g, P.black, 278, 151, 2, 3); rect(g, P.black, 284, 154, 2, 3);
  line(g, P.greyD, 318, 184, 308, 208); line(g, P.greyD, 318, 184, 318, 208); line(g, P.greyD, 318, 184, 328, 208);
  line(g, P.grey, 314, 186, 340, 168, 3); rect(g, P.greyD, 312, 186, 3, 3);
  // bedroom
  rect(g, P.woodD, 62, 96, 4, 30); rect(g, P.woodD, 118, 106, 4, 20); rect(g, P.woodD, 62, 114, 60, 6);
  rect(g, P.white, 66, 108, 52, 6);
  rect(g, P.white, 68, 103, 12, 6);                                         // pillow
  rect(g, P.blue, 80, 106, 38, 7); rect(g, shade(P.blue, 0.3), 80, 106, 38, 2);   // blanket
  rect(g, P.woodL, 124, 112, 12, 14); rect(g, P.woodD, 124, 117, 12, 1);
  rect(g, P.woodD, 129, 106, 2, 6); rect(g, P.yellow, 126, 100, 8, 6);
  rect(g, P.woodL, 162, 66, 32, 60); rect(g, P.woodD, 178, 68, 1, 56); rect(g, P.woodD, 162, 66, 32, 2);
  rect(g, P.yellow, 175, 92, 2, 3); rect(g, P.yellow, 181, 92, 2, 3);
  rect(g, P.blue, 124, 124, 36, 2);
  // bathroom
  for (let y = 94; y < 123; y += 6) for (let x = 200; x < 356; x += 6) rect(g, ((x + y) / 6) % 2 ? P.white : shade(P.bath, -0.05), x, y, 6, 6);
  rect(g, P.greyD, 210, 62, 2, 44); rect(g, P.greyD, 210, 62, 10, 3); rect(g, P.grey, 216, 65, 6, 2);
  rect(g, P.greyD, 204, 58, 60, 1);
  rect(g, P.white, 204, 106, 60, 4); rect(g, P.white, 206, 110, 56, 14); rect(g, P.grey, 206, 123, 56, 1);
  rect(g, P.greyD, 208, 124, 3, 2); rect(g, P.greyD, 257, 124, 3, 2);
  rect(g, P.woodL, 282, 72, 20, 24); rect(g, P.screenL, 284, 74, 16, 20); rect(g, P.white, 286, 76, 3, 6);
  rect(g, P.white, 284, 100, 16, 6); rect(g, P.white, 290, 106, 4, 20); rect(g, P.greyD, 291, 97, 2, 3);
  rect(g, P.greyD, 304, 96, 14, 2);
  rect(g, P.white, 322, 64, 26, 22); rect(g, P.woodL, 322, 74, 26, 1); rect(g, P.woodL, 334, 64, 1, 22);
  // stairwell
  rect(g, P.red, 372, 200, 10, 8); rect(g, P.redD, 371, 199, 12, 2);
  for (const [x, y] of [[376, 186], [372, 190], [380, 190], [374, 194], [378, 194], [377, 182]]) rect(g, P.green, x, y, 4, 5);
  rect(g, P.woodD, 400, 236, 28, 2);
  rect(g, P.red, 404, 238, 6, 8); rect(g, P.blue, 416, 238, 6, 10);
  rect(g, P.greyD, 380, 270, 6, 20); rect(g, P.blueD, 381, 262, 4, 9);
}

export function drawHouse(g) {
  g.clearRect(0, 0, W, H);
  roof(g);
  for (const [y0, y1] of [[52, 126], [132, 208], [214, 290]]) for (const x of [196, 356]) rect(g, P.wallEdge, x, y0, 4, y1 - y0);   // doorway passages
  for (const [n, x0, y0, x1, y1] of ROOMS) wallpaper(g, n, x0, y0, x1, y1);
  for (const [x0, y0, x1, y1] of WINDOWS) g.clearRect(x0, y0, x1 - x0, y1 - y0);
  for (const [x0, y0, x1, y1] of WINDOWS) windowFrame(g, x0, y0, x1, y1);
  furniture(g);
  stairs(g);
  // floors and ceiling: wooden slabs
  for (const y of [48, 126, 208]) {
    rect(g, P.beam, 56, y, 388, y === 48 ? 4 : 6);
    if (y !== 48) { rect(g, P.floorTop, 56, y, 388, 2); for (let x = 62; x < 440; x += 18) rect(g, P.plank, x, y + 2, 1, 4); }
  }
  // inner walls with doorways, outer walls in section
  for (const [y0, y1] of [[52, 126], [132, 208], [214, 290]]) {
    for (const x of [196, 356]) {
      rect(g, P.wallCut, x, y0, 4, y1 - y0 - 36);
      rect(g, P.wallEdge, x, y0, 1, y1 - y0 - 36); rect(g, P.wallEdge, x + 3, y0, 1, y1 - y0 - 36);
      rect(g, P.wallEdge, x - 1, y1 - 37, 6, 2);
    }
  }
  for (const x of [56, 440]) {
    rect(g, P.wallCut, x, 48, 4, 250);
    rect(g, P.wallEdge, x, 48, 1, 250); rect(g, P.wallEdge, x + 3, 48, 1, 250);
  }
  // foundation, garden, path, mailbox post, tree, bushes
  rect(g, P.stone, 52, 290, 396, 8);
  for (let x = 54; x < 448; x += 10) rect(g, P.stoneD, x, 290 + ((x / 10) % 2) * 4, 1, 4);
  rect(g, P.grass, 0, 296, W, 24); rect(g, P.grassL, 0, 296, W, 1); rect(g, P.soil, 0, 314, W, 6);
  for (let x = 3; x < W; x += 7) rect(g, P.grassD, x, 299 + (x % 3), 1, 3);
  rect(g, P.path, 8, 297, 48, 3);
  rect(g, P.woodD, 23, 274, 3, 24);
  rect(g, P.woodD, 459, 240, 8, 58); rect(g, P.wood, 461, 246, 2, 40);
  disc(g, P.grassD, 463, 226, 19); disc(g, P.green, 460, 222, 15); disc(g, P.grassL, 455, 216, 5);
  disc(g, P.grassD, 450, 292, 6); disc(g, P.green, 450, 291, 4);
  return g;
}

// ---------- sky behind the house ----------
export function skyPhase(date) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h < 5 || h >= 21) return 'night';
  if (h < 7) return 'dawn';
  if (h < 18) return 'day';
  return 'dusk';
}

const STARS = Array.from({ length: 40 }, (_, i) => [(i * 97 + 13) % W, (i * 53 + 7) % 200, i % 3]);

export function drawSky(g, phase, t) {
  const [a, b] = { night: [P.skyNight, P.skyNight2], dawn: [P.dawn2, P.dawn], day: [P.skyDay, P.skyDay2], dusk: [P.dusk2, P.dusk] }[phase];
  const bands = 8;
  for (let i = 0; i < bands; i++) {
    const k = i / (bands - 1);
    const mix = (x, y) => '#' + [0, 2, 4].map((o) => Math.round(parseInt(x.substr(1 + o, 2), 16) * (1 - k) + parseInt(y.substr(1 + o, 2), 16) * k).toString(16).padStart(2, '0')).join('');
    rect(g, mix(a, b), 0, i * 40, W, 40);
  }
  if (phase === 'night') {
    for (const [x, y, s] of STARS) if ((t >> 4) % 7 !== s || s === 0) rect(g, P.star, x, y, s === 2 ? 2 : 1, s === 2 ? 2 : 1);
    disc(g, P.moon, 34, 34, 11); disc(g, P.skyNight, 39, 30, 10);
  } else if (phase === 'day') {
    disc(g, P.sun, 30, 30, 12);
    for (const [x0, y, w] of [[60, 70, 40], [380, 40, 52], [150, 220, 36]]) {
      const x = ((x0 + t / 20) % (W + 80)) - 60;
      rect(g, P.white, x, y, w, 6); rect(g, P.white, x + 8, y - 5, w - 18, 5);
    }
  } else {
    disc(g, P.sun, 30, phase === 'dawn' ? 250 : 240, 14);
  }
}

// ---------- props that change while he lives ----------
const DIGITS = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111' };

export function drawNumber(g, c, n, x, y) {
  for (const ch of String(n)) {
    const bits = DIGITS[ch];
    for (let i = 0; i < 15; i++) if (bits[i] === '1') rect(g, c, x + (i % 3), y + Math.floor(i / 3), 1, 1);
    x += 4;
  }
}

export function drawProps(g, s, t) {
  const a = s.action;
  // TV
  if (s.tvStatic) for (let y = 254; y < 274; y += 2) for (let x = 208; x < 230; x += 2) rect(g, [P.white, P.grey, P.greyD, P.black][(x * 7 + y * 13 + t * 5) % 4], x, y, 2, 2);
  else if (a === 'tv') {
    rect(g, P.screen, 208, 254, 22, 20);
    const c = [P.yellow, P.pink, P.green, P.screenL][(t >> 5) % 4];
    rect(g, c, 212 + ((t >> 3) % 10), 262, 6, 6); rect(g, P.screenL, 208, 270, 22, 4);
  }
  // computer
  if (s.smoke) {
    rect(g, (t >> 2) % 2 ? P.red : P.redD, 122, 170, 22, 14);
    for (let i = 0; i < 6; i++) {
      const k = (t + i * 11) % 40;
      rect(g, i % 2 ? P.grey : P.greyD, 128 + ((i * 5 + (k >> 2)) % 12), 166 - k, 4 - (k > 24 ? 1 : 0), 3);
    }
  } else if (a === 'install') {
    rect(g, P.screen, 122, 170, 22, 14);
    rect(g, P.white, 125, 176, 16, 3); rect(g, P.green, 125, 176, Math.round(16 * (s.installProgress || 0)), 3);
  } else if (['type', 'review', 'letter'].includes(a)) {
    rect(g, P.screen, 122, 170, 22, 14);
    const n = 1 + ((t >> 3) % 5);
    for (let i = 0; i < n; i++) rect(g, P.screenL, 124, 172 + i * 2, 4 + ((i * 7) % 14), 1);
  } else if (s.needsUpdate && (t >> 4) % 2) {                 // blinking update badge on the idle screen
    rect(g, P.yellow, 129, 172, 8, 10); rect(g, P.ink, 132, 173, 2, 5); rect(g, P.ink, 130, 177, 6, 1); rect(g, P.ink, 131, 178, 4, 1); rect(g, P.ink, 132, 179, 2, 1);
  }
  if (a === 'review') { rect(g, P.yellow, 146, 174, 10, 4); rect(g, shade(P.yellow, 0.5), 140, 178, 20, 10); }
  else rect(g, P.greyD, 146, 174, 10, 4);
  // fire (always lit while he is awake)
  if (!s.asleep) {
    for (let i = 0; i < 6; i++) {
      const h = 6 + ((t * 3 + i * 17) % 9) + (a === 'fire' ? 4 : 0);
      rect(g, i % 2 ? P.yellow : '#f08a2c', 313 + i * 3, 290 - h, 3, h);
    }
    if ((t >> 3) % 3 !== 0) rect(g, P.grey, 323 + ((t >> 4) % 3), 2 - ((t >> 2) % 6), 4, 3);   // chimney smoke
  }
  // phone
  const shake = s.phoneRinging && (t >> 1) % 2 ? 1 : 0;
  rect(g, P.black, 271 + shake, 273, 10, 5);
  if (a !== 'phone') rect(g, P.black, 270 + shake, 271, 12, 2);
  if (s.phoneRinging && (t >> 3) % 2) { line(g, P.ink, 268, 268, 265, 265); line(g, P.ink, 284, 268, 287, 265); }
  // record player
  rect(g, P.black, 274, 187, 12, 2);
  if (a === 'records') rect(g, P.red, 278 + ((t >> 2) % 3), 187, 2, 1);
  // fridge door, pot
  if (a === 'snack') { rect(g, P.screenL, 163, 250, 28, 39); rect(g, P.white, 192, 250, 6, 40); rect(g, P.yellow, 168, 262, 6, 6); rect(g, P.red, 178, 272, 8, 6); }
  if (a === 'cook') {
    rect(g, P.greyD, 128, 254, 10, 6);
    for (let i = 0; i < 3; i++) { const k = (t + i * 9) % 24; rect(g, P.white, 130 + i * 3, 252 - k, 2, 2); }
  }
  // shower curtain
  if (a === 'shower') {
    for (let x = 206; x < 262; x += 4) rect(g, x % 8 ? P.teal : P.white, x, 59, 4, 47);
    for (let i = 0; i < 8; i++) rect(g, P.screenL, 214 + ((i * 7 + t) % 40), 64 + ((t * 2 + i * 11) % 40), 1, 3);
    for (let i = 0; i < 4; i++) { const k = (t + i * 13) % 30; rect(g, P.white, 222 + i * 9, 58 - k / 2, 3, 2); }
  } else rect(g, P.teal, 204, 59, 8, 44);
  // plant watering
  if (a === 'water') for (let i = 0; i < 3; i++) rect(g, P.screenL, 382 - i * 2, 186 + ((t + i * 5) % 10), 1, 2);
  // mailbox
  rect(g, P.blue, 14, 264, 20, 11); rect(g, P.blueD, 14, 274, 20, 2); rect(g, P.white, 18, 268, 12, 1);
  if (s.mailWaiting || s.outgoing) rect(g, P.red, 34, 258, 2, 10); else rect(g, P.red, 34, 266, 8, 2);
  // a parcel with the new worker on the doorstep
  if (s.parcel) {
    rect(g, P.wood, 40, 288, 12, 10); rect(g, P.woodL, 40, 288, 12, 2); rect(g, P.yellow, 45, 288, 2, 10);
    rect(g, P.white, 42, 292, 3, 3); rect(g, P.ink, 43, 293, 1, 1);
  }
  // front door
  if (s.doorOpen) { rect(g, P.black, 56, 252, 4, 38); rect(g, P.wood, 46, 252, 10, 38); }
  else { rect(g, P.wood, 55, 252, 6, 38); rect(g, P.yellow, 59, 271, 2, 2); }
  rect(g, P.woodD, 54, 250, 8, 2);
  // pictures for accepted work, and the brass plaque with the total
  const n = Math.min(9, s.frames);
  for (let i = 0; i < n; i++) {
    const x = 64 + (i % 3) * 9, y = 140 + Math.floor(i / 3) * 10;
    rect(g, P.yellow, x, y, 8, 8);
    rect(g, [P.green, P.purple, P.blue, P.red, P.teal][i % 5], x + 1, y + 1, 6, 6);
    rect(g, P.white, x + 2 + (i % 2), y + 2, 2, 2);
  }
  rect(g, P.yellow, 64, 172, 26, 8); rect(g, P.woodD, 64, 172, 26, 1);
  drawNumber(g, P.ink, Math.min(99999, s.frames), 66, 174);
}

// dark overlay on the rooms while the lights are off
export function drawLights(g, s, phase) {
  if (!s.asleep) return;
  g.fillStyle = phase === 'night' || phase === 'dusk' ? 'rgba(12,14,40,0.62)' : 'rgba(30,30,50,0.28)';
  g.fillRect(56, 48, 388, 242);
  if (phase === 'night') { g.fillStyle = 'rgba(244,238,210,0.10)'; g.fillRect(138, 64, 30, 62); }
}
