// The little man, his dog and the mail carrier, drawn from rectangles in every pose they need.
import { P, rect, shade } from './world.js';

const SKIN = ['#f1c9a5', '#e0ac84', '#c68b5f', '#9a6440', '#6e4428'];
const HAIR = ['#2b1d16', '#6b3f1f', '#b5793a', '#e3c27a', '#8a8a8a', '#a33a22'];
const SHIRT = [P.red, P.blue, P.green, P.yellow, P.purple, P.teal, P.pink, '#e07b2e'];
const PANTS = ['#3a4a7a', '#4a3a2a', '#5d5a56', '#2f5a3a', '#6a2f3a'];

export function lookFor(seed) {
  let h = (seed * 2654435761) >>> 0;
  const pick = (a) => { h = (h * 1103515245 + 12345) >>> 0; return a[(h >>> 8) % a.length]; };
  return { skin: pick(SKIN), hair: pick(HAIR), shirt: pick(SHIRT), pants: pick(PANTS), shoes: P.ink,
    blanket: pick([P.red, P.blue, P.green, P.purple, P.teal]), dog: pick(['#a8743c', '#e8d8b8', '#3a2e26', '#c9a26a']) };
}

// draw in local coordinates: dx forward, dy up from the feet (negative)
function painter(g, x, y, face) {
  return (dx, dy, w, h, c) => {
    const sx = face === 1 ? x + dx : x - dx - w;
    rect(g, c, sx, y + dy, w, h);
  };
}

function head(R, L, dy = 0, closed = false) {
  R(-3, -28 + dy, 7, 8, L.skin);
  R(-4, -30 + dy, 8, 3, L.hair);
  R(-4, -27 + dy, 2, 5, L.hair);
  R(4, -24 + dy, 1, 1, L.skin);                     // nose
  R(1, -25 + dy, 1, closed ? 1 : 2, P.ink);         // eye
  R(1, -22 + dy, 2, 1, shade(L.skin, -0.3));        // mouth
  R(-1, -25 + dy, 1, 2, shade(L.skin, -0.2));       // ear
}

function torso(R, L, top = -19, h = 9) {
  R(-4, top, 8, h, L.shirt);
  R(-1, top, 3, 1, shade(L.shirt, 0.3));
  R(-1, top - 1, 2, 1, L.skin);                     // neck
}

function leg(R, L, hip, foot, top = -10) {
  R(hip, top, 3, 5, L.pants);
  R(foot, top + 5, 3, -top - 7, L.pants);
  R(foot - 1, -2, 5, 2, L.shoes);
}

function seated(R, L, seat, arms) {
  const s = -seat;
  R(-3, s - 1, 8, 3, L.pants);                      // thigh
  R(3, s + 2, 3, seat - 4, L.pants);                // shin
  R(2, -2, 6, 2, L.shoes);
  torso(R, L, s - 10, 10);
  head(R, L, s + 9);
  arms(s);
}

export function drawPerson(g, p, t, L) {
  const R = painter(g, Math.round(p.x), Math.round(p.y), p.face);
  const f = (t >> 3) % 2;
  switch (p.pose) {
    case 'walk': {
      const k = (p.step >> 2) % 4, bob = k % 2 ? -1 : 0;
      const R2 = painter(g, Math.round(p.x), Math.round(p.y) + bob, p.face);
      const [b, fr] = [[-6, 3], [-3, 0], [2, -4], [-3, 0]][k];
      R2(-2, -18, 2, 8, shade(L.shirt, -0.25));
      leg(R2, { ...L, pants: shade(L.pants, -0.25) }, -3, b);
      leg(R2, L, 0, fr);
      torso(R2, L);
      head(R2, L);
      R2(k === 0 ? -2 : k === 2 ? 2 : 0, -18, 2, 7, L.shirt); R2(k === 0 ? -2 : k === 2 ? 2 : 0, -11, 2, 2, L.skin);
      if (p.carry === 'letter') { R2(4, -15, 6, 4, P.white); R2(4, -15, 6, 1, P.red); }
      if (p.carry === 'frame') { R2(4, -16, 6, 6, P.yellow); R2(5, -15, 4, 4, P.green); }
      break;
    }
    case 'sit': case 'type': case 'review': case 'piano': case 'tvsit': case 'sad': {
      const seat = p.seat || 10;
      seated(R, L, seat, (s) => {
        if (p.pose === 'type' || p.pose === 'piano') {
          const up = p.pose === 'piano' ? (t >> 2) % 3 : f;
          R(1, s - 8, 6, 2, L.shirt); R(7, s - 8 - up, 2, 2, L.skin);
        } else if (p.pose === 'review') {
          R(1, s - 8, 5, 2, L.shirt); R(5, s - 15, 6, 8, P.white); R(6, s - 13, 4, 1, P.greyD); R(6, s - 11, 3, 1, P.greyD);
        } else if (p.pose === 'sad') {
          R(-1, s - 8, 2, 7, L.shirt);
        } else { R(0, s - 8, 2, 6, L.shirt); R(1, s - 3, 3, 2, L.skin); }
      });
      if (p.pose === 'sad') R(-3, -seat - 19, 7, 1, L.hair);
      break;
    }
    case 'sleep': {                                      // lying in bed, head on the pillow
      const x = 70, y = 101;
      rect(g, L.skin, x, y, 8, 7); rect(g, L.hair, x - 1, y, 3, 7); rect(g, P.ink, x + 4, y + 2, 2, 1);
      rect(g, L.blanket, 80, 105, 38, 8); rect(g, shade(L.blanket, 0.3), 80, 105, 38, 2);
      rect(g, shade(L.blanket, -0.2), 96, 104, 12, 2);
      break;
    }
    case 'shower': break;                                // hidden behind the curtain
    default: {
      // standing poses
      const hop = p.pose === 'dance' && f ? -2 : 0;
      const S = painter(g, Math.round(p.x), Math.round(p.y) + hop, p.face);
      const wide = (p.pose === 'dance' && f) || (p.pose === 'exercise' && f);
      S(-2, -18, 2, 8, shade(L.shirt, -0.25));
      leg(S, { ...L, pants: shade(L.pants, -0.25) }, -3, wide ? -6 : -3);
      leg(S, L, 0, wide ? 3 : 0);
      torso(S, L);
      head(S, L, 0, p.pose === 'stretch');
      const arm = (dx, dy, w, h) => { S(dx, dy, w, h, L.shirt); };
      switch (p.pose) {
        case 'dance': case 'exercise': case 'stretch':
          if (f || p.pose === 'stretch') { arm(-4, -27, 2, 8); arm(3, -27, 2, 8); S(-4, -29, 2, 2, L.skin); S(3, -29, 2, 2, L.skin); }
          else { arm(-7, -18, 4, 2); arm(4, -18, 4, 2); }
          break;
        case 'phone': arm(1, -20, 2, 4); S(2, -26, 2, 7, P.black); break;
        case 'telescope': arm(1, -20, 5, 2); S(5, -22, 2, 2, L.skin); break;
        case 'fan': arm(1, -18 - f * 6, 5, 2); S(6, -21 - f * 6, 3, 6, P.white); break;
        case 'cook': arm(1, -15 + f, 6, 2); S(7, -17 + f, 1, 6, P.woodD); break;
        case 'eat': if (f) { arm(1, -18, 2, 4); S(2, -22, 2, 2, L.skin); } else { arm(0, -18, 2, 7); S(0, -11, 2, 2, L.skin); } break;
        case 'read': arm(1, -16, 4, 2); S(4, -22, 6, 8, p.book || P.blue); S(5, -21, 4, 6, P.white); break;
        case 'readmail': arm(1, -16, 4, 2); S(4, -22, 7, 6, P.white); S(5, -20, 5, 1, P.greyD); break;
        case 'hang': arm(1, -28, 2, 10); S(1, -32, 6, 6, P.yellow); S(2, -31, 4, 4, P.green); break;
        case 'carry': arm(1, -15, 4, 2); S(4, -15, 6, 4, P.white); S(4, -15, 6, 1, P.red); break;
        case 'water': arm(1, -15, 4, 2); S(4, -16, 6, 5, P.teal); S(10, -18, 3, 1, P.teal); break;
        case 'brush': arm(1, -19, 2, 4); S(2 + f, -23, 4, 1, P.white); break;
        case 'pet': arm(1, -14, 6, 2); S(7, -12 + f, 2, 2, L.skin); break;
        case 'stoke': arm(1, -14, 7, 2); S(8, -13, 6, 1, P.greyD); break;
        default: arm(0, -18, 2, 7); S(0, -11, 2, 2, L.skin);
      }
    }
  }
}

export function drawDog(g, d, t, color) {
  const x = Math.round(d.x), y = Math.round(d.y), f = d.face;
  const R = painter(g, x, y, f);
  const dark = shade(color, -0.35);
  if (d.pose === 'sleep') {
    R(-6, -5, 12, 5, color); R(3, -6, 5, 4, color); R(6, -5, 2, 2, dark); R(-7, -3, 2, 2, color);
    return;
  }
  const k = d.pose === 'walk' ? (d.step >> 2) % 2 : 0;
  R(-6, -9, 11, 5, color);                         // body
  R(4, -12, 5, 5, color); R(8, -10, 2, 2, P.ink);  // head, nose
  R(5, -11, 1, 1, P.ink); R(3, -12, 2, 4, dark);   // eye, ear
  const wag = d.pose === 'wag' || d.pose === 'eat' ? (t >> 2) % 2 : 0;
  R(-8, -11 + wag, 2, 3, color);                   // tail
  if (d.pose === 'sit') { R(-6, -5, 4, 5, color); R(2, -4, 2, 4, color); }
  else { R(-5 + k, -4, 2, 4, color); R(-2 - k, -4, 2, 4, dark); R(1 + k, -4, 2, 4, color); R(3 - k, -4, 2, 4, dark); }
  if (d.pose === 'eat') R(4, -8, 5, 3, color);
}

export function drawCarrier(g, c, t) {
  const L = { skin: '#e0ac84', hair: '#2b1d16', shirt: '#2f4a8a', pants: '#26407a', shoes: P.ink };
  drawPerson(g, { ...c, pose: c.pose || 'walk' }, t, L);
  const R = painter(g, Math.round(c.x), Math.round(c.y), c.face);
  R(-4, -31, 9, 3, '#26407a'); R(3, -29, 4, 1, '#26407a');          // cap
  R(-7, -16, 4, 7, P.wood); R(-6, -18, 2, 2, P.woodD);              // bag
}

const ICONS = {
  note: ['0011', '0011', '0010', '0010', '1110', '1110'],
  bang: ['1', '1', '1', '1', '0', '1'],
  ask: ['111', '001', '011', '010', '000', '010'],
  z: ['111', '001', '010', '100', '111'],
  heart: ['01010', '11111', '11111', '01110', '00100'],
  star: ['00100', '01110', '11111', '01110', '01010'],
  dots: ['00000', '00000', '00000', '00000', '10101'],
  smoke: ['0110', '1111', '0110'],
};

export function drawBubble(g, x, y, icon, t) {
  const bits = ICONS[icon];
  if (!bits) return;
  const w = Math.max(...bits.map((r) => r.length)) + 4, h = bits.length + 4;
  const bx = Math.round(x - w / 2), by = Math.round(y - h - 2 - ((t >> 4) % 2));
  rect(g, P.ink, bx - 1, by - 1, w + 2, h + 2);
  rect(g, P.white, bx, by, w, h);
  rect(g, P.white, bx + 2, by + h, 2, 2); rect(g, P.ink, bx + 2, by + h + 2, 1, 1);
  bits.forEach((row, j) => [...row].forEach((b, i) => { if (b === '1') rect(g, icon === 'heart' ? P.red : P.ink, bx + 2 + i, by + 2 + j, 1, 1); }));
}
