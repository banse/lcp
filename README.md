# Little Computer Pepes (lcp)

The name is the owner's (2026-10-24); the repo stays `lcp`.

A browser game that looks like the 1985 cut-away house of *Little Computer People*, with our own art at
480 x 320 game pixels (scaled 2x on desktop). One little man lives the working day of one IMD swarm seat:
the phone rings when work is queued, he types while the seat works, posts results, gets good or bad mail,
watches through the telescope on an oracle panel, fans a smoking computer when a run fails, and sleeps when
the seat goes quiet. Between tasks he follows his own routine. Name, art and code are ours; not affiliated
with Activision or Identity.md.

Status: local test build (2026-10-24). The idea, its evidence and the plan for a swarm-built IPFS site are in
aidude `ideas/seat-house-life-sim.md`.

## Switched off, not removed (2026-10-24)

`FEATURES` in `src/main.js` turns built features on and off; elements marked `data-feature="…"` show only when theirs
is on. The owner switched off the look switch (`lookSwitch`: the page always uses the IMD look) and the wallet lookup
(`wallet`: no Connect wallet button, so a live seat never knocks for its owner; the demo still knocks). Set a flag to
`true` to bring a feature back; nothing else changes.

## Looks (themes)

Two looks share one house logic (`src/brain.js`), one floor plan (`src/world.js`) and the seat data; each brings its
own drawing, where its things stand, and its own mapping from task categories to activities (`src/mapping.js`; both
start with the owner's mapping of 2026-10-24 and can change on their own). The switch sits next to the other controls
and is remembered per browser.

- **IMD** (default since 2026-10-24, `src/themes/imd.js`): imd.fun's look, a black page at night, a window-blue page
  with an ink sun and light grey clouds by day, a peach one at dawn (sun low on the left) and an orange one at dusk
  (sun low on the right), the house as an engraved black
  and white cut-away with green screens (a machine wall in the study, an oscilloscope, a CRT), IBM Plex Mono, the
  diary as a terminal. The pepe and the dog are imd.fun's sprite sheets (`assets/imd/`, see its `NOTICE.md`: the
  IMD project's art, used with IMD's agreement of 2026-10-24) with imd.fun's moves: he looks up, scratches his head, shuffles, turns to the front,
  cheers; the dog naps (breathing), glances, tilts, wags and walks. He stands with his back to us at the thing he
  works on, as on imd.fun; in the armchair only his head shows over the back, in bed the back of his head on the
  pillow. When he knocks on the glass, his front-facing sprite fills the screen and bumps towards you with each
  knock. A light mode (2026-10-24) puts a white page around the house, like explorer.imd.fun's light mode: a page
  that embeds the house sends `postMessage({type: 'lcp:mode', mode: 'light' | 'dark'})` (the side-by-side page sends
  the explorer's mode), kept for the tab in sessionStorage; dark otherwise. The house keeps its own sky.
- **LCP** (parked, `src/themes/pixel.js`; the switch said Pixel until 2026-10-24): the 480 x 320 pixel house in the original game's look.

## Run

A browser wallet only injects into http pages, so serve it rather than opening the file:

    python3 -I serve.py . 8795             # from this folder; caching off
    open http://127.0.0.1:8795/#demo       # every event, each when he is done with the last (~9 min a loop)
    open http://127.0.0.1:8795/#/seat/558  # a live seat; no hash opens a random busy seat
    open http://127.0.0.1:8795/#/job/<id>  # follow a job from seat to seat (needs the relay)

The house beside explorer.imd.fun (`tools/side-by-side/`, local only): with the house's server running as above,

    python3 -I tools/side-by-side/side_by_side.py      # port 8798
    open http://127.0.0.1:8798/side-by-side            # ?seat=N or ?job=<id> to start there

- explorer.imd.fun sends `frame-ancestors 'none'`, so `side_by_side.py` passes it through 127.0.0.1 (GET and HEAD only,
  no cookies either way) without that directive, and hides its Launch, $IMD, Docs, Telegram, Connect and menu; its
  light/dark switch stays and decides the look of both panes. `/side-by-side/jobs` lists the active jobs.
- The page: the house left, the explorer right, a divider to drag (both stacked, house on top, below 760 px). Seat #
  shows a seat in both; Job + Follow Job follow an active job; an agent or active job opened in the explorer, or a
  step row of the followed job, moves the house too ("House follows the explorer").

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
- Launch steps (contract builds, tests, manifests, audits): the live event names the job but not its launch kind, so
  `serve.py` also relays `/proxy/jobs/<id>` (id, state, template, launch kind; `/jobs` has no CORS either). Token
  launches (custom_token, univ4_hook, evm_project) are token launch work; anything else, such as evm_contracts, is
  other launch work. Without the relay the seat's recent launches decide. Measured 2026-10-24 01:00 UTC on the
  burn tracker contract job (evm_contracts): its five busy seats had mostly token launches behind them and all went
  to the computer before; with the job record they all cook.
- The demo waits for him: each step comes when he has done the last (reached the place and worked there about 4 s,
  or finished the scene), with a 2-minute cap. It keeps its own time of day: day at the start, dusk and then night
  when he goes to bed, dawn and then day when he wakes; a live seat follows the visitor's clock again.
- Kinds of work (2026-10-24, from imd.fun/docs, the live `/skills` catalog and 200 jobs; notes in aidude
  `ideas/evidence/seat-house-life-sim/2026-10-24-imd-action-types.md`): a task's category comes from its job's
  template (`skill:token-logo`, `research`, `audit`, …) when the relay reads the job, else its step key, else its
  step's role. Seven categories joined the first eight: reviews and audits (magnifying glass at the bedroom writing
  desk), tests (test tubes on the kitchen counter), putting it together or fixing it (workbench on the top landing),
  docs (typewriter), fuzz runs (pinball), planning (whiteboard), indexers (filing cabinet). The IMD look maps them; the
  parked LCP look has no stations for them and shows them like the launch they belong to. Also: he cheers when a job
  he worked on is done and scratches his head when it is blocked; fireworks go up when a launch he worked on goes
  live; the mantel clock rings when a schedule opened his job. The relay adds `/proxy/scheduled` and step roles.
- Following a job (`#/job/<id>`, 2026-10-24): `JobFollower` in `feed.js` reads `/proxy/jobs/<id>/steps` every 10 s (the
  relay, cached 5 s). The house is the seat on the step that has run longest (a step runs while the record shows it
  working with a `live` part; it started at the `updatedAt` of the first reading that saw it). It stays there while
  that step runs; when the step is over it moves to the seat working on the job next, again the longest-running one if
  several are, or waits until a seat starts. The diary goes on across the moves and the address stays `#/job/<id>`.
  When the job completes, big fireworks fill the sky (over the roof too) and he dances in the kitchen with his dog for
  about 16 s (the dog wags, barks and bows; the kitchen stays lit even if the seat sleeps);
  blocked, he scratches his head. A job already over when opened shows its last seat. Any other seat, the demo or a
  random seat ends the following. Without the relay it says so and retries. `#/job/<id>/step/<key>` chooses a step
  (several seats can work on one job at once): if it runs now the house moves to its seat and stays while it runs,
  else nothing changes; the address goes back to `#/job/<id>`. The side-by-side page sends it when a step row of the
  followed job opens in the explorer.
- The machine wall's readout (IMD look, 2026-10-24, the owner chose a ticker and the dial over a screen readout or
  instruments alone): while the seat works, a green dot-matrix ticker along the machine's top edge scrolls
  `PROVIDER · MODEL · EFFORT` and the big dial's needle sits on the effort (seven marks: minimal, low, medium, high,
  xhigh, max, ultra; a green arc up to it). `LiveFeed.checkMachine` reads `/proxy/seats/<n>/machine` when the work
  starts and every 45 s: the seat's runtimes with the premium tier's model and effort (seat record), and the step it
  runs in the active jobs (job record `live`: runtime and model, no effort). The effort shows only when the step runs
  the premium model; otherwise the dial shows "?" (an oracle question, say, runs a cheaper tier). A seat the live feed
  still marks working after its step was accepted shows "MODEL ?" for that short while. The diary says it once per
  model. Without the relay the machine shows nothing extra. Switched off the same day (owner: revert the machine,
  other ways wanted): `FEATURES.machineTicker` brings the ticker, the dial, its diary line and legend row back; the
  data (`checkMachine`, `state.machine`) keeps running for whatever shows it next.
- What he works with, shown around the house instead (the owner's pick of three, 2026-10-24, from the owner's own
  examples: chimney smoke for effort, the attic light for premium work): the attic window lights up while the step
  runs the seat's premium model, amber for Claude Code and white-green for Codex; the chimney smoke follows that
  premium work's effort (2 to 14 puffs, bigger, faster and darker towards max and ultra; other tiers publish no effort
  and keep the usual four puffs); at his station his bubble shows the model's namesake (`MODEL_SYMBOL` in
  `src/themes/imd.js`: Opus a note, Sonnet a quill, Haiku a leaf, Fable a book, Astra a star, Sol the sun, Luna the
  moon), taking turns with the activity's own icon. The diary names the exact model once.
- The IMD Explorer beside the house (2026-10-24): the seat row has a button for the local side-by-side page
  (`tools/side-by-side/`, `http://127.0.0.1:8798/side-by-side`, see Run). On its own the house
  shows "Show on IMD Explorer" while that page answers (a `no-cors` probe every 60 s; a hosted copy never shows it, nor
  does the demo); it opens `?seat=N` (and `&job=<id>` while a job is followed): this house on the left, the
  seat's agent page on the right. Inside that page (it posts `{type: 'lcp:split', on: true}`) the button says "Hide explorer"
  and posts `{type: 'lcp:hideExplorer', hash}`; the page then gives way to the house alone on the same address.
  "Random job" (only there; greyed out when the page counts no active jobs, `activeJobs` in its message) posts
  `{type: 'lcp:randomJob'}`: the page picks one, opens its job page on the right and has this house follow it. Both
  buttons sit at the right end of the seat row and wrap below it when the pane is narrow.
- The logo (2026-10-24): a box like explorer.imd.fun's IMD mark (40 px, 1.5 px rules, the page's two colours) with
  pepe's head drawn as an outline (eyelids, pupils, mouth) and LCP; on hover the head turns like the explorer's diamond
  (`@keyframes globe`, off for reduced motion). It sits left of the Little Computer Pepes name, as the IMD box sits left
  of Explorer. It links to the original game, Little Computer People (Activision, 1985), on the Internet Archive, in a
  new tab: https://archive.org/details/Little_Computer_People_1985_Activision
- While a job is followed, the daily letter closes itself after 10 s (the house moves from seat to seat, and each new
  seat may write); a plain visit keeps it open until closed.
- Talking to him (2026-10-24, like typing to the man in Little Computer People): the line under the seat row.
  `src/talk.js` parses what is typed (pure, testable: `parse`, `answer`, the line tables, `stressCost`); `main.js`
  (`talk`) acts on it. help lists what he understands.
  - Page commands do what the buttons do, whatever he is doing: visit 1299, random seat, demo, sound on/off, legend,
    follow job <id or its first 8 characters>, random job, show job <id>, show / hide explorer. In the
    side-by-side page they go through it (`lcp:followJob`, the random job button), so the explorer moves too.
  - Things to do: feed / pet the dog, piano, records, TV, cook, snack, read, work out, shower, brush, water the plants,
    fire, window, nap, mail, paint, telescope, dance, touch grass (he goes out to the garden).
  - Questions he looks up at the machine (he hurries there, types, answers): how long he lives here (the seat's
    `pairedAt`, through the relay), stats, what he works on, model and effort, version, online, last task, owner,
    the swarm (`/swarm` health and counts), active jobs, who is working, oracle, tokens, heartbeats, companies, parts.
    When the explorer shows it, that page opens beside him: in the side-by-side page (`lcp:explore`, the house stays
    where it is), or on its own the house opens that page (`?ex=<path>`); a hosted copy names the address instead.
  - The culture: trade memecoins (a candle chart on his machine ends in one big red candle; he drags himself off
    crying), buy imd (he runs, three times his pace, even from his work; BUY and green candles), sell imd (he ignores
    you completely), gm, gn, wagmi, ngmi, wen moon (telescope), wen airdrop, rug, fud, hodl, gas, bridge, lfg, mint,
    seed phrase (never), connect wallet (no), thanks, insults.
  - Mood: while the seat works he refuses (a page he can point to opens anyway: look it up yourself); every request
    stresses him (2 while working, 1 otherwise, 1 less with please, 2 more with an insult; 1 wears off every 15 s);
    at 3 he sighs, at 6 he warns, at 8 he takes the dog out of the house for 90 s (BACK SOON on the door), and then
    nobody answers. Asleep he mumbles, paused by his owner he is out.
- Console helpers: `__house()`, `__live`, `__theme()`, `__demo`, `__follower` (`__live.onEvent({type: 'pause'})` plays an event through the page).
- Fonts come from Google Fonts here; a swarm-hosted build must bundle them (the host allows same-origin scripts only).
