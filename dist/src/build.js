// Which build this is (2026-10-25). The source runs as 'local' (127.0.0.1, serve.py); tools/export.py writes 'swarm'
// into dist/ (the version the swarm hosts at lcp.sites.imd.fun); path B's build will write 'server' (docs/self-hosted.md).
// Only the swarm build is reduced (the owner: "the reduced version is only for the swarm hosted one, the server version
// should have all features").
export const BUILD = 'swarm';
