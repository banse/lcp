# lcp: the seat house

A browser game that looks like the 1985 cut-away house of *Little Computer People*, with our own art at
480 x 320 game pixels (scaled 2x on desktop). One little man lives the working day of one IMD swarm seat:
the phone rings when work is queued, he types while the seat works, posts results, gets good or bad mail,
watches through the telescope on an oracle panel, fans a smoking computer when a run fails, and sleeps when
the seat goes quiet. Between tasks he follows his own routine. Name, art and code are ours; not affiliated
with Activision or Identity.md.

Status: local test build (2026-10-24). The idea, its evidence and the plan for a swarm-built IPFS site are in
aidude `ideas/seat-house-life-sim.md`.

## Looks (themes)

Two looks share one house logic (`src/brain.js`), one floor plan (`src/world.js`) and the seat data; each brings its
own drawing, where its things stand, and its own mapping from task categories to activities (`src/mapping.js`; both
start with the owner's mapping of 2026-10-24 and can change on their own). The switch sits next to the other controls
and is remembered per browser.

- **IMD** (default since 2026-10-24, `src/themes/imd.js`): imd.fun's look, black page, the house as an engraved black
  and white cut-away with green screens (a machine wall in the study, an oscilloscope, a CRT), IBM Plex Mono, the
  diary as a terminal. The pepe and the dog are imd.fun's sprite sheets (`assets/imd/`, see its `NOTICE.md`: the
  IMD project's art, used with IMD's agreement of 2026-10-24) with imd.fun's moves: he looks up, scratches his head, shuffles, turns to the front,
  cheers; the dog naps (breathing), glances, tilts, wags and walks. He stands with his back to us at the thing he
  works on, as on imd.fun; in the armchair only his head shows over the back, in bed the back of his head on the
  pillow. When he knocks on the glass, his front-facing sprite fills the screen and bumps towards you with each
  knock.
- **Pixel** (parked, `src/themes/pixel.js`): the 480 x 320 pixel house in the original game's look.

## Run

A browser wallet only injects into http pages, so serve it rather than opening the file:

    python3 -I serve.py . 8795             # from this folder; caching off
    open http://127.0.0.1:8795/#demo       # every event in about six minutes
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
  so `serve.py` relays four fields and the 20 newest tasks of it at `/proxy/seats/<n>` (local only). A seat "needs an update" when it is
  not on the newest release and that release is 6 h old or the seat is 3 releases behind: the mail carrier
  brings a parcel, the idle computer blinks a download badge. When the version changes he fetches the parcel and
  installs it with a progress bar. Without the relay (a hosted copy today) the worker line says it can't read
  the seat record, and sleep falls back to the 72 h rule.
- Knocking on the glass: when the connected wallet owns the seat on screen and that seat needs an update (and is
  awake), he walks to the living room, his face comes up close behind the glass and he knocks (screen shake, two
  thuds with sound on). A banner names the seat's worker, the newest one and how to update (`imd update` and a
  restart, or `--auto-update`). "Got it" stops it for 6 h on that version; otherwise he knocks again every 30 min.
  Visitors who don't own the seat see only the parcel. The demo knocks so the scene can be seen.
- What he does while the seat works depends on the task. `feed.js` puts it into a category, and each look's mapping
  (`src/mapping.js`) turns the category into an activity; both mappings are the owner's of 2026-10-24, first match wins:
  oracle step = telescope; research = reads a book at the shelf; video = watches TV; audio/music = piano;
  websites (`build_website`, `frontend_for_contract`, `design_critic`, site) = cooking; token launch work
  (task `launch` is `custom_token`, `univ4_hook` or `evm_project`) = the computer; everything else (other launch
  kinds such as `evm_contracts`, plain jobs) = cooking; images (`create_image`) = he paints at the easel in the study
  (owner, 2026-10-24). The running task is not in the seat record until
  it is posted, so he starts from the live `/swarm` event if it names the step, else from the seat's usual kind
  of work (marked "probably"), and switches when the posted task shows otherwise. Without the relay he starts
  cooking.
- While he sleeps or is out, verdicts still arrive: the mail carrier comes, the mailbox flag goes up and an
  accepted result counts on the plaque at once; he reads the letter (and hangs the picture, without counting it
  again) when he is back. The daily letter becomes a note he left before bed or before going out, shown at once.
- The owner paused the seat (`pausedByOwnerAt` set in the seat record, so only with the relay): he hangs a BACK
  SOON sign on the front door and goes out; lights and fire go out and the dog waits by the door until he comes
  home. The field was null on every seat sampled, so the scene is built from the field's name, not from a seen
  pause.
- Console helpers: `__house()`, `__live` (`__live.onEvent({type: 'pause'})` plays an event through the page).
- Fonts come from Google Fonts here; a swarm-hosted build must bundle them (the host allows same-origin scripts only).
