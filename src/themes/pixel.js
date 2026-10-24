// The first look, parked on 2026-10-24: the 480 x 320 pixel house (world.js) and the little man (person.js).
import { W, H, SPOTS, drawHouse, drawSky, drawProps, drawLights, skyPhase } from '../world.js';
import { drawPerson, drawDog, drawCarrier, drawBubble, drawCloseup, lookFor } from '../person.js';
import { MAPPINGS } from '../mapping.js';

export const pixel = {
  id: 'pixel',
  label: 'LCP',
  mapping: MAPPINGS.pixel,
  spots: SPOTS,
  activityText: {
    computer: 'works at the computer in the study', cook: 'cooks at the stove', book: 'reads a book by the shelf',
    tv: 'watches TV in the armchair', piano: 'plays the piano', easel: 'paints at the easel in the study',
    telescope: 'looks through the telescope',
  },
  layer: null,
  look: null,

  attach(canvas) {
    canvas.width = W; canvas.height = H;
    if (!this.layer) {
      this.layer = document.createElement('canvas');
      this.layer.width = W; this.layer.height = H;
      drawHouse(this.layer.getContext('2d'));
    }
  },

  // CSS width: whole-pixel scaling where it fits, else the full width
  cssWidth(avail) { const k = Math.min(2, Math.floor(avail / W)); return k >= 1 ? k * W + 'px' : '100%'; },

  setSeed(seed) { this.look = lookFor(seed); },

  draw(g, house, tick) {
    const phase = skyPhase(new Date());
    drawSky(g, phase, tick);
    g.drawImage(this.layer, 0, 0);
    if (!house) return;
    const s = house.state, m = house.man, look = this.look;
    drawProps(g, s, tick);
    drawDog(g, house.dog, tick, look.dog);
    if (!m.hidden && !(s.closeup && s.closeup.k > 0.3)) drawPerson(g, m, tick, look);   // at the glass he is in the close-up
    drawLights(g, s, phase);
    if (house.carrier) drawCarrier(g, house.carrier, tick);
    if (m.icon && !m.hidden) {
      const hx = m.pose === 'sleep' ? 76 : m.x, hy = m.pose === 'sleep' ? 98 : m.y - 32;
      drawBubble(g, hx, hy, m.icon, tick);
    }
    if (s.closeup) drawCloseup(g, s.closeup, look, tick);
  },
};
