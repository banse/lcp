# lcp: the seat house

A browser game that looks like the 1985 cut-away house of *Little Computer People*, with our own art at
480 x 320 game pixels (scaled 2x on desktop). One little man lives the working day of one IMD swarm seat:
the phone rings when work is queued, he types while the seat works, posts results, gets good or bad mail,
watches through the telescope on an oracle panel, fans a smoking computer when a run fails, and sleeps when
the seat goes quiet. Between tasks he follows his own routine. Name, art and code are ours; not affiliated
with Activision or Identity.md.

Status: local test build (2026-10-24). The idea, its evidence and the plan for a swarm-built IPFS site are in
aidude `ideas/seat-house-life-sim.md`.

## Run

A browser wallet only injects into http pages, so serve it rather than opening the file:

    python3 -I serve.py . 8795             # from this folder; caching off
    open http://127.0.0.1:8795/#demo       # every event in about three minutes
    open http://127.0.0.1:8795/#/seat/558  # a live seat; no hash opens a random busy seat

## How it works

- Data: `api.imd.fun/swarm` every 30 s while the tab is visible (CORS *): per-seat counters, `owners[2000]`,
  health, the last 60 events. `/oracle/requests` every 5 min for panel membership. Nothing else.
- Wallet: EIP-6963 discovery, then `window.ethereum`; asks only for the address, never for a signature.
  The seats shown are the `/swarm` owners entries equal to the address, each confirmed with `ownerOf(i)` on
  the IDMD collection through the wallet when it is on mainnet.
- `src/world.js` house, sky and props · `src/person.js` man, dog, mail carrier, bubbles ·
  `src/brain.js` activities as generators with priorities and a seeded routine · `src/feed.js` live and demo
  feeds · `src/wallet.js` · `src/sound.js` · `src/main.js` loop, routing, diary, daily letter, counters.
- Worker updates: the newest worker release comes from GitHub (`Identity-md/worker` releases, CORS *, cached
  30 min). The seat's own version and online state come from `api.imd.fun/seats/<n>`, which sends no CORS header,
  so `serve.py` relays four fields of it at `/proxy/seats/<n>` (local only). A seat "needs an update" when it is
  not on the newest release and that release is 6 h old or the seat is 3 releases behind: the mail carrier
  brings a parcel, the idle computer blinks a download badge. When the version changes he fetches the parcel and
  installs it with a progress bar. Without the relay (a hosted copy today) the worker line says it can't read
  the seat record, and sleep falls back to the 72 h rule.
- Console helpers: `__house()`, `__live`.
- Fonts come from Google Fonts here; a swarm-hosted build must bundle them (the host allows same-origin scripts only).
