// Where the house runs (2026-10-24). Local: served from 127.0.0.1 by serve.py, with its relay (/proxy/…) and, when it
// runs, the side-by-side page on 127.0.0.1:8798. Hosted (lcp.sites.imd.fun): static files only; api.imd.fun's /seats,
// /jobs and /launches send no CORS, so nothing calls the relay, and nothing probes 127.0.0.1 either (current Chrome asks
// a public page's visitor for local network access).
// (no location at all: the node tests, which play the local page)
// The swarm build (src/build.js) is hosted wherever it runs, 127.0.0.1 too (tools/preview.py shows it as the host serves it).
import { BUILD } from './build.js';
export const LOCAL = BUILD !== 'swarm'
  && (typeof location === 'undefined' || ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname));
export const RELAY = LOCAL;
