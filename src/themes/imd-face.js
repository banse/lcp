// His face from the front, drawn in vector after the owner's reference pictures (2026-10-24): the round head with two
// eye bulges, heavy lids, big pupils with highlights, the brown lips, the blue shirt collar. Our own drawing; the
// accessories show what he is doing (headphones for audio, glasses and a pencil for research, and so on).
export const FACE = { green: '#5c8f3c', greenD: '#3f6a28', lip: '#b4553a', lipD: '#93412b', shirt: '#0048f8',
  ink: '#0b0b0b', white: '#ffffff', gold: '#e0a92a', navy: '#1a2a8a', red: '#ff6b62' };

// mood: 'calm' | 'happy' | 'worried' | 'up' | 'sleep' | 'urgent'; wear: 'headphones' | 'headset' | 'glasses' |
// 'pencil' | 'sunglasses' | 'crown' | 'beret' | 'chef' | 'nightcap' (a list); look: pupils offset in [-1, 1]
export function drawFace(g, x, y, size, opts = {}) {
  const { mood = 'calm', wear = [], look = [0, 0], blink = false } = opts;
  const k = size / 100, F = FACE;
  g.save();
  g.translate(x, y); g.scale(k, k);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const stroke = (w = 2.2) => { g.lineWidth = w; g.strokeStyle = F.ink; g.stroke(); };

  // shirt collar
  g.beginPath(); g.moveTo(8, 86); g.bezierCurveTo(30, 96, 70, 97, 94, 84); g.lineTo(100, 104); g.lineTo(2, 104); g.closePath();
  g.fillStyle = F.shirt; g.fill(); stroke();
  if (wear.includes('nightcap')) nightcap(g, F, 'back');
  // head
  g.beginPath();
  g.moveTo(14, 72);
  g.bezierCurveTo(3, 58, 3, 34, 16, 22);
  g.bezierCurveTo(22, 7, 43, 1, 52, 12);
  g.bezierCurveTo(61, 1, 85, 2, 93, 19);
  g.bezierCurveTo(100, 31, 101, 52, 97, 64);
  g.bezierCurveTo(93, 81, 70, 91, 46, 89);
  g.bezierCurveTo(30, 88, 20, 82, 14, 72);
  g.closePath();
  g.fillStyle = F.green; g.fill(); stroke(2.6);
  // the line between the bulges and the brow creases
  g.beginPath(); g.moveTo(52, 12); g.bezierCurveTo(50, 18, 50, 22, 51, 26); stroke(1.4);
  if (wear.includes('headphones') || wear.includes('headset')) headphones(g, F, wear.includes('headset'));

  // eyes
  const eyes = [[36, 37], [71, 35]];
  for (const [ex, ey] of eyes) {
    if (mood === 'sleep' || blink) {
      g.beginPath(); g.moveTo(ex - 11, ey); g.quadraticCurveTo(ex, ey + 5, ex + 11, ey); stroke(2);
      continue;
    }
    g.beginPath(); g.ellipse(ex, ey, 12, 8.5, -0.05, 0, Math.PI * 2);
    g.fillStyle = F.white; g.fill(); stroke(1.8);
    const up = mood === 'up' ? -3 : 0;
    const px = ex + 2.5 + look[0] * 3.5, py = ey + 1.5 + up + look[1] * 2.5;
    g.beginPath(); g.arc(px, py, mood === 'urgent' ? 4.2 : 5.4, 0, Math.PI * 2); g.fillStyle = F.ink; g.fill();
    g.beginPath(); g.arc(px - 1.8, py - 1.8, 1.7, 0, Math.PI * 2); g.fillStyle = F.white; g.fill();
    g.beginPath(); g.arc(px + 1.6, py + 1.2, 0.8, 0, Math.PI * 2); g.fill();
    // heavy upper lid: green cover over the top of the eye, ink edge
    const lid = mood === 'happy' ? 3.2 : mood === 'worried' || mood === 'urgent' ? 1.2 : mood === 'up' ? 0.4 : 2.4;
    g.save();
    g.beginPath(); g.ellipse(ex, ey, 12.6, 9.1, -0.05, 0, Math.PI * 2); g.clip();
    g.beginPath(); g.rect(ex - 14, ey - 12, 28, 12 - 8.5 + lid * 2); g.fillStyle = F.green; g.fill();
    g.restore();
    g.beginPath(); g.moveTo(ex - 12.5, ey - 6 + lid * 2); g.quadraticCurveTo(ex, ey - 9.5 + lid * 2, ex + 12.5, ey - 6.5 + lid * 2); stroke(1.8);
    // the crease above and the bag below
    g.beginPath(); g.moveTo(ex - 11, ey - 12); g.quadraticCurveTo(ex, ey - 16, ex + 11, ey - 12.5); stroke(1.1);
    g.beginPath(); g.moveTo(ex - 8, ey + 10.5); g.quadraticCurveTo(ex, ey + 13, ex + 9, ey + 10); stroke(1);
  }
  if (mood === 'worried' || mood === 'urgent') {
    for (const [ex, ey] of eyes) { g.beginPath(); g.moveTo(ex - 10, ey - 15); g.lineTo(ex + 8, ey - 20); stroke(1.8); }
  }

  // lips
  const smile = mood === 'happy' ? 1 : mood === 'worried' ? -0.6 : mood === 'urgent' ? -1 : 0;
  g.beginPath();
  g.moveTo(31, 63 - smile * 4);
  g.bezierCurveTo(50, 56 + smile * 3, 78, 54 + smile * 3, 95, 59 - smile * 5);
  g.bezierCurveTo(99, 62, 97, 67, 91, 67);
  g.bezierCurveTo(72, 65 + smile * 2, 52, 67 + smile * 2, 35, 69 - smile * 2);
  g.bezierCurveTo(28, 69, 26, 64, 31, 63 - smile * 4);
  g.closePath(); g.fillStyle = F.lip; g.fill(); stroke(2);
  g.beginPath();
  g.moveTo(36, 69 - smile * 2);
  g.bezierCurveTo(54, 67 + smile * 2, 74, 66 + smile * 2, 90, 67);
  g.bezierCurveTo(92, 73, 84, 77, 74, 76);
  g.bezierCurveTo(60, 77, 46, 77, 39, 74);
  g.bezierCurveTo(34, 73, 34, 70, 36, 69 - smile * 2);
  g.closePath(); g.fillStyle = F.lipD; g.fill(); stroke(2);
  if (mood === 'urgent') { g.beginPath(); g.ellipse(62, 70, 6, 3, 0, 0, Math.PI * 2); g.fillStyle = F.ink; g.fill(); }
  // chin line
  g.beginPath(); g.moveTo(40, 82); g.quadraticCurveTo(48, 85, 56, 83); stroke(1);

  if (wear.includes('glasses')) glasses(g, F, eyes);
  if (wear.includes('sunglasses')) sunglasses(g, F, eyes);
  if (wear.includes('pencil')) pencil(g, F);
  if (wear.includes('crown')) crown(g, F);
  if (wear.includes('beret')) beret(g, F);
  if (wear.includes('chef')) chef(g, F);
  if (wear.includes('nightcap')) nightcap(g, F, 'front');
  g.restore();
}

function out(g, F, w = 2) { g.lineWidth = w; g.strokeStyle = F.ink; g.stroke(); }

function headphones(g, F, mic) {
  g.beginPath(); g.moveTo(9, 44); g.bezierCurveTo(8, 2, 94, -4, 97, 40);
  g.lineWidth = 7; g.strokeStyle = F.ink; g.stroke();
  for (const [cx, cy] of [[9, 47], [97, 44]]) { g.beginPath(); g.ellipse(cx, cy, 8, 13, 0, 0, Math.PI * 2); g.fillStyle = F.ink; g.fill(); }
  if (mic) {
    g.beginPath(); g.moveTo(97, 52); g.quadraticCurveTo(96, 70, 82, 74); g.lineWidth = 2.4; g.stroke();
    g.beginPath(); g.arc(81, 74, 3, 0, Math.PI * 2); g.fillStyle = F.ink; g.fill();
  }
}

function glasses(g, F, eyes) {
  for (const [ex, ey] of eyes) { g.beginPath(); g.arc(ex + 1, ey + 1, 13.5, 0, Math.PI * 2); g.lineWidth = 2.4; g.strokeStyle = F.navy; g.stroke(); }
  g.beginPath(); g.moveTo(50, 37); g.quadraticCurveTo(54, 33, 58, 36); g.stroke();
  g.beginPath(); g.moveTo(23, 36); g.lineTo(8, 30); g.stroke();
}

function sunglasses(g, F, eyes) {
  g.beginPath(); g.moveTo(10, 30); g.lineTo(96, 26); g.lineWidth = 3; g.strokeStyle = F.ink; g.stroke();
  for (const [ex, ey] of eyes) {
    g.beginPath(); g.roundRect(ex - 13, ey - 6, 27, 13, [2, 2, 8, 8]); g.fillStyle = F.ink; g.fill();
    g.beginPath(); g.moveTo(ex - 7, ey - 3); g.lineTo(ex - 2, ey - 3); g.lineWidth = 1.6; g.strokeStyle = F.white; g.stroke();
  }
}

function pencil(g, F) {
  g.save(); g.translate(16, 88); g.rotate(-0.95);
  g.beginPath(); g.rect(0, -3, 34, 6); g.fillStyle = F.gold; g.fill(); out(g, F, 1.4);
  g.beginPath(); g.rect(-6, -3, 6, 6); g.fillStyle = '#f2a0a0'; g.fill(); out(g, F, 1.4);
  g.beginPath(); g.moveTo(34, -3); g.lineTo(42, 0); g.lineTo(34, 3); g.closePath(); g.fillStyle = '#f0d9b5'; g.fill(); out(g, F, 1.4);
  g.restore();
  g.beginPath(); g.roundRect(52, 82, 30, 22, 3); g.fillStyle = F.white; g.fill(); out(g, F, 1.6);
  for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(56, 88 + i * 5); g.lineTo(76 - i * 4, 88 + i * 5); g.lineWidth = 1; g.strokeStyle = '#7d7d79'; g.stroke(); }
  g.beginPath(); g.arc(30, 84, 6, 0, Math.PI * 2); g.fillStyle = F.green; g.fill(); out(g, F, 1.6);   // his hand
}

function crown(g, F) {
  g.beginPath();
  g.moveTo(32, 12); g.lineTo(34, -6); g.lineTo(42, 4); g.lineTo(52, -10); g.lineTo(62, 3); g.lineTo(71, -7); g.lineTo(73, 11);
  g.quadraticCurveTo(52, 6, 32, 12); g.closePath(); g.fillStyle = F.gold; g.fill(); out(g, F, 1.8);
  for (const [cx, cy] of [[42, 7], [52, 4], [62, 6]]) { g.beginPath(); g.arc(cx, cy, 1.8, 0, Math.PI * 2); g.fillStyle = F.red; g.fill(); }
}

function beret(g, F) {
  g.beginPath(); g.ellipse(64, 6, 30, 10, -0.18, 0, Math.PI * 2); g.fillStyle = F.ink; g.fill();
  g.beginPath(); g.moveTo(64, -4); g.lineTo(66, -10); g.lineWidth = 2.4; g.strokeStyle = F.ink; g.stroke();
}

function chef(g, F) {
  g.beginPath(); g.rect(30, 0, 44, 12); g.fillStyle = F.white; g.fill(); out(g, F, 1.8);
  for (const [cx, cy, r] of [[34, -4, 9], [50, -10, 12], [68, -5, 10]]) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = F.white; g.fill(); out(g, F, 1.8); }
  g.beginPath(); g.rect(31, -2, 42, 12); g.fillStyle = F.white; g.fill();
}

function nightcap(g, F, part) {
  if (part === 'back') return;
  g.beginPath(); g.moveTo(18, 22); g.quadraticCurveTo(50, -4, 90, 16); g.quadraticCurveTo(110, 30, 108, 54);
  g.quadraticCurveTo(96, 30, 18, 22); g.closePath(); g.fillStyle = '#2a4fd8'; g.fill(); out(g, F, 1.8);
  g.beginPath(); g.arc(108, 56, 6, 0, Math.PI * 2); g.fillStyle = F.white; g.fill(); out(g, F, 1.6);
}

// a green fist, for knocking on the glass
export function drawFist(g, x, y, size) {
  const k = size / 40, F = FACE;
  g.save(); g.translate(x, y); g.scale(k, k);
  g.beginPath(); g.moveTo(14, 40); g.lineTo(26, 40); g.lineTo(26, 58); g.lineTo(14, 58); g.closePath();
  g.fillStyle = F.shirt; g.fill(); out(g, F, 2);
  g.beginPath(); g.roundRect(2, 4, 36, 34, 12); g.fillStyle = F.green; g.fill(); out(g, F, 2.4);
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(2 + i * 9, 6); g.lineTo(2 + i * 9, 16); out(g, F, 1.4); }
  g.beginPath(); g.ellipse(6, 26, 7, 9, 0.4, 0, Math.PI * 2); g.fillStyle = F.green; g.fill(); out(g, F, 1.8);
  g.restore();
}
