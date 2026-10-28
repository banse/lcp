// Where the house runs (2026-10-24, path B 2026-10-26). Three builds (src/build.js): 'local', the source on 127.0.0.1
// served by serve.py with its relay (/proxy/…); 'swarm', the reduced copy the swarm hosts (static files only:
// api.imd.fun's /seats, /jobs and /launches send no CORS, so nothing calls a relay, and nothing probes 127.0.0.1 either,
// current Chrome asks a public page's visitor for local network access); 'server', the self-hosted copy
// (selfhost/server.py): its own origin answers /proxy, and the hosts under the house host pass explorer.imd.fun, the
// Sworn site and the burn tracker through (explorer.<host>, sworn.<host>, burned.<host>), so the house's column can show
// them where the real sites refuse frames (own pane, 2026-10-26: the two-pane page and its own meta tag are gone).
// (no location at all: the node tests, which play the local page)
import { BUILD } from './build.js';

const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];

// the pass-through mirrors the server names in <meta name="lcp-mirrors" content="explorer=https://…;sworn=https://…;
// burned=https://…"> (so the house served under another host's path, imd.<domain>/pepe/, still finds them): {explorer,
// sworn, burned} origins, or null when the build has none (local and swarm: Pepe's answers carry the links instead).
// Only https origins count; a name the house does not know is left out.
const MIRROR_KEYS = ['explorer', 'sworn', 'burned', '0x'];          // 0x: 0xTXT read only (2026-10-27), when the server has it
export function mirrorsFrom(build, content) {
  if (build !== 'server' || !content) return null;
  const out = {};
  for (const part of String(content).split(';')) {
    const i = part.indexOf('='), k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (i < 1 || !MIRROR_KEYS.includes(k)) continue;
    try { const u = new URL(v); if (u.protocol === 'https:' && u.pathname === '/' && !u.search) out[k] = u.origin; } catch (e) { /* not a url */ }
  }
  return Object.keys(out).length ? out : null;
}

// a relay path as the page must fetch it: the source on 127.0.0.1 and the tests keep the absolute path; the server
// build resolves it against the page itself, so the house served under a path (imd.<domain>/pepe/) still reaches
// its relay through that path
export function proxyUrlFor(build, path, baseURI) {
  if (build !== 'server' || !baseURI) return path;
  return new URL('.' + path, baseURI.split('#')[0]).href;
}
export const proxyUrl = (path) => proxyUrlFor(BUILD, path, typeof document === 'undefined' ? null : document.baseURI);

// whether this build's origin answers /proxy (the relay)
export const relayFor = (build) => build !== 'swarm';

const here = typeof location === 'undefined' ? null : location;
export const LOCAL = BUILD === 'local' && (!here || LOCAL_HOSTS.includes(here.hostname));
export const RELAY = relayFor(BUILD);
const named = typeof document === 'undefined' ? null : (document.querySelector('meta[name="lcp-mirrors"]') || {}).content || null;
export const MIRRORS = mirrorsFrom(BUILD, named);
