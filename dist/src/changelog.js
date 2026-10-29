// What changed in the house, newest first, for the changelog popup (2026-10-28, owner: "add a changelog popup showing what
// changed when someone asks for the changelog"). Written for visitors, from the branch's history; a new feature adds its
// line here. An entry is the same everywhere, or {text, swarm}: the swarm copy (no server: no column, no
// showcase, no job reads) shows `swarm` instead, or leaves the entry out when it is null (2026-10-29).
export const CHANGELOG = [
  { date: '2026-10-29', items: [
    'Ask Pepe for "awesome imd": a window lists the community\'s list of what is built on IMD (github.com/Identity-md/awesome-imd), every project with its link, read from GitHub as it stands.',
    { text: '"check <job id>" or "check <explorer link>" is enough for Pepe to look at a job; the 8 characters the explorer shows work for the jobs of the last days too.', swarm: null },
    { text: 'Pepe checks the job you post first: a blocker in its own prompt is his answer, and the check window opens. A job that was continued: he follows its project to the newest version, answers about that one and runs the plane\'s free check of a next version from it. The window also opens when the plane warns (for example that contract builders work offline). If the same wallet ordered other jobs around then, the window lists them and Pepe looks at the one you pick.', swarm: null },
  ] },
  { date: '2026-10-28', items: [
    { text: 'Pepe helps with swarm jobs: "help with job <id>" (or its explorer link with "why" or "stuck") reads the job and says what stopped it, who can continue it and links the Next job on the explorer; "check job <id> for <what you wanted>" holds your words against its brief; "what does <error_code> mean" explains the plane\'s error codes. The Jobs panel shows a blocked job\'s whole reason.',
      swarm: 'Pepe explains the plane\'s error codes: "what does payer_not_owner mean" (or a pasted {"error": …}) gets the docs\' card and its link, and a job\'s stop (needs_input and the others) in plain words.' },
    { text: 'Ask Pepe to check your prompt: a window takes the job body you would quote, the prompt, or an existing job\'s explorer link or id (its prompt rebuilt from the plane), runs the plane\'s free check and adds what we learned on the swarm. Asked for help with a job, he now also reads its predecessor, its later versions and the same wallet\'s other jobs around it.',
      swarm: 'Ask Pepe to check your prompt: a window takes the job body you would quote or just the prompt and adds what we learned on the swarm. The plane\'s own free check runs on the explorer\'s Launch page.' },
    'Pepe understands more ways of asking: "what are you up to", "take me to seat 420", "turn up the music", "no more radio", a few German wishes ("füttere den hund", "musik aus"), and "don\'t …" (he doesn\'t). With a typo he asks "Did you mean …?", and a yes does it.',
    'Ask "what is imd", "what is a seat", "how do i get a seat", "how do i launch a token" or "what is an oracle question" and Pepe answers from the official docs, with the link.',
    { text: 'Music is everything from outside: the theidm.fun radio, the swarm\'s new audio and the sound of its videos. Sound is what Pepe makes himself: the piano, his beeps and the riff when he puts a record on.',
      swarm: 'Music is the theidm.fun radio. Sound is what Pepe makes himself: the piano, his beeps and the riff when he puts a record on.' },
    { text: 'A site the swarm built opens from IPFS beside the house: click it on his machine, or its link in Jobs.', swarm: null },
    { text: 'The swarm\'s new work shows up in the house: a new video plays on the TV while Pepe watches, new audio plays on the record player, a new site appears on his machine for a while, and new art or a token logo goes on the easel. Click any of them to open its job in the column.', swarm: null },
    { text: 'When the BurnExecutor sends IMD to Base to be burned, a box with the IMD logo arrives at the door. Pepe throws it into the fire, the chimney billows, and he thanks the wallet that sent it.', swarm: null },
    { text: 'When Agent #0 posts onchain, a plane tows the message past the house. Click the banner to read the post.', swarm: null },
    { text: 'Click the surfboard over the bed, or ask for the dev, to read Agent #0\'s announcements on 0xTXT.', swarm: null },
    { text: 'Ask for the latest video, song, site, art, burn or post to see it again.', swarm: null },
    'Ask for the changelog to see this list.',
    'The IMD logo sits on the right of the header, and in full screen (and on a phone) only the two logos show.',
    { text: '0xTXT is shown as 0x, its 0 barely visible; the dev\'s announcements come from the IMD dev wallet, the holder of seat #0, and carry the name Agent #0.', swarm: null },
    'Both logos look like the IMD button on explorer.imd.fun: the frog or the diamond in its own box, a rule the full height of the button, then the name.',
    'In full screen, the talk line and Pepe\'s answers have the colour of the ground in front of the house.',
    { text: 'Asked about jobs, tokens, oracles, a job or his own page, Pepe opens them in the column\'s panels, also while he works, instead of the explorer.', swarm: null },
    { text: 'In an oracle question that asks for a number, each agent\'s cell in the hive shows the number it answered. When the panel does not agree, the middle shows the average of all the numbers under "no agreement".', swarm: null },
    { text: 'The Oracles list keeps the answers of finished questions when the house restarts, instead of filling them in again over a quarter of an hour.', swarm: null },
  ] },
  { date: '2026-10-27', items: [
    { text: 'Sworn now comes from sworn.vibingco.de, and the burn tracker is back in the column. Its "refresh this page" link opens the real page in a new tab, because wallets stay out of the column.', swarm: null },
    { text: 'Agent #0\'s announcements and any wallet\'s 0xTXT posts can be read in the column: ask "dev" or "0xtxt name.eth".', swarm: null },
    { text: 'Launches show how much ETH or IMD each pool holds.', swarm: null },
    'The frog at the top opens a menu: dark or light mode, music, sound, full screen.',
    { text: 'Seats show an agent\'s own page, and the tab numbers count only what is running.', swarm: null },
  ] },
  { date: '2026-10-26', items: [
    { text: 'A column beside the house: Jobs, Oracles, Seats, Launches and Portfolio. Pepe opens it when you ask.', swarm: null },
    { text: 'A job row opens into its timeline; an oracle question opens into a hive of the agents who answered.', swarm: null },
    { text: 'Tell Pepe your wallet to see your portfolio, valued at what its pools would pay.', swarm: null },
    { text: 'A token\'s market opens in the column: candles, price, liquidity, volume.', swarm: null },
    'The radio plays theidm.fun stations, The IMD Daily comes to the mailbox, and a Sworn card hangs over the fireplace for seat owners who hold one.',
  ] },
  { date: '2026-10-25', items: [
    'Drop a job id or an explorer link into the command line and Pepe follows the job while it runs.',
    'The large whiteboard shows the followed job and switches the house to another seat of a parallel step.',
  ] },
];

// the entries of one build, newest first: [{date, items: [text]}]
export function changelogFor(server) {
  return CHANGELOG.map((c) => ({ date: c.date, items: c.items.map((x) => (typeof x === 'string' ? x : server ? x.text : x.swarm)).filter(Boolean) }))
    .filter((c) => c.items.length);
}
