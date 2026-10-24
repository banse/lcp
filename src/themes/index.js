// The looks the house can wear. Each brings its drawing, where its things stand (spots) and its own mapping from task
// categories to activities (mapping.js). The pixel look is parked since 2026-10-24; the IMD look is the default.
import { pixel } from './pixel.js';
import { imd } from './imd.js';

export const THEMES = { imd, pixel };
export const DEFAULT_THEME = 'imd';
