// The IMD look's stations, on the same floor plan as world.js. As on imd.fun he stands with his back to us in front
// of a thing, so a station's x is the middle of that thing on the back wall.
import { SPOTS } from '../world.js';

export const IMD_SPOTS = {
  ...SPOTS,
  desk: { floor: 1, x: 95, face: 1 },          // the machine wall in the study
  deskStand: { floor: 1, x: 101, face: 1 },
  frames: { floor: 1, x: 147, face: 1 },       // the picture wall, the easel below it
  easel: { floor: 1, x: 147, face: 1 },
  shelf: { floor: 1, x: 180, face: 1 },
  piano: { floor: 1, x: 225, face: 1 },
  records: { floor: 1, x: 278, face: 1 },
  telescope: { floor: 1, x: 322, face: 1 },
  armchair: { floor: 0, x: 245, face: 1 },     // seen from behind, the TV on the wall in front of it
  phone: { floor: 0, x: 281, face: 1 },
  fire: { floor: 0, x: 322, face: 1 },
  fridge: { floor: 0, x: 177, face: 1 },
};

// where the things are drawn (world units), shared by the static layer and the props drawn every frame
export const THINGS = {
  machine: { x: 66, y: 138, w: 58, h: 48 },     // the study's machine wall; its main screen below
  screen: { x: 80, y: 145, w: 30, h: 19 },
  frames: { x: 132, y: 138 },                    // 3 x 3 pictures, plaque under them
  easel: { x: 138, y: 176, w: 18, h: 16 },
  scope: { x: 265, y: 150, w: 26, h: 17 },       // the oscilloscope in the music room
  tv: { x: 228, y: 236, w: 34, h: 26 },
  chair: { x: 232, y: 258, w: 26, h: 32 },
  fire: { x: 310, y: 262, w: 24, h: 28 },
  stove: { x: 114, y: 262, w: 24, h: 28 },
  fridge: { x: 162, y: 230, w: 30, h: 60 },
};
