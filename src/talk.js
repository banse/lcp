// Talking to him (2026-10-24): the command line under the seat row, like typing to the man in Little Computer People.
// parse() turns what the visitor types into an intent; answer() and the line tables word his replies. Pure: main.js
// acts on them (page commands do what the buttons do, the house plays the scenes), so all of it can be tested alone.
// His voice: an onchain native who has seen a few cycles; dry, a bit tired, never mean to the visitor first.

export const POLITE = /\b(please|pls|plz|bitte)\b/;
export const THANKS = /\b(thanks|thank you|thx|ty|danke|gracias)\b/;
const RUDE = /\b(stupid|dumb|idiot|useless|lazy|shut up|loser|noob|trash|bot brain)\b/;
const JOB = '([0-9a-f]{8}(?:-[0-9a-f]{4}){0,3}(?:-[0-9a-f]{12})?)';

export function normalize(text) {
  return String(text || '').toLowerCase().replace(/[“”’`]/g, "'").replace(/[^a-z0-9#$'?\-\s.]/g, ' ').replace(/\s+/g, ' ').trim();
}

// first match wins: page commands, then the jokes, then questions, then things to do
const RULES = [
  [/^(help|commands|\?|what can (you|i) (do|say|ask)|how does this work)\b/, () => ({ kind: 'page', act: 'help' })],
  [/\brandom (active )?job\b/, () => ({ kind: 'page', act: 'randomJob' })],
  [/\b(random|any)( busy)? seat\b|\bsurprise me\b/, () => ({ kind: 'page', act: 'random' })],
  [new RegExp('\\bfollow(?:ing)?\\b.*?\\b' + JOB + '\\b'), (m) => ({ kind: 'page', act: 'follow', job: m[1] })],
  [/\bfollow\b.*\bjob\b/, () => ({ kind: 'page', act: 'follow', job: null })],
  [new RegExp('\\b(?:show|open|explain)\\b(?: me)?(?: the)? job #?' + JOB + '\\b'), (m) => ({ kind: 'ask', topic: 'job', job: m[1] })],
  [/\b(?:visit|go to|goto|switch to|move to|show me|open)\s+(?:seat\s*)?#?(\d{1,4})\b/, (m) => ({ kind: 'page', act: 'visit', seat: +m[1] })],
  [/^(?:seat\s*)?#?(\d{1,4})$/, (m) => ({ kind: 'page', act: 'visit', seat: +m[1] })],
  [/\bdemo\b/, () => ({ kind: 'page', act: 'demo' })],
  [/\b(?:sound|music) (on|off)\b|\b(mute|unmute)\b/, (m) => ({ kind: 'page', act: 'sound', on: m[1] ? m[1] === 'on' : m[2] === 'unmute' })],
  [/\blegend\b/, () => ({ kind: 'page', act: 'legend' })],
  [/\b(hide|close) (?:the )?(?:imd )?explorer\b/, () => ({ kind: 'page', act: 'hideExplorer' })],
  [/\b(show|open) (?:it )?(?:on )?(?:the )?(?:imd )?explorer\b|\bsplit view\b/, () => ({ kind: 'page', act: 'showExplorer' })],

  // the culture
  [/\b(sell|dump)\b.*\b(imd|\$imd|bags?|everything|it all)\b|^dump( it)?$/, () => ({ kind: 'egg', act: 'sell' })],
  [/\b(buy|ape|bid)\b.*\b(imd|\$imd|the dip)\b/, () => ({ kind: 'egg', act: 'buy' })],
  [/\b(trade|trading|degen|ape|aping|gamble)\b.*\b(meme ?coins?|memes|shitcoins?|alts?|coins?|tokens?|perps?)\b|^(degen|ape in|go degen)$/, () => ({ kind: 'egg', act: 'trade' })],
  [/\b(seed ?phrase|seed|private key|mnemonic|recovery phrase|pk)\b/, () => ({ kind: 'egg', act: 'seed' })],
  [/\bconnect\b.*\bwallet\b|\bsign (this|here)\b|\bapprove\b/, () => ({ kind: 'egg', act: 'wallet' })],
  [/^(gm|gmgm|good morning)\b/, () => ({ kind: 'egg', act: 'gm' })],
  [/^(gn|good night|night)\b/, () => ({ kind: 'egg', act: 'gn' })],
  [/\bwagmi\b/, () => ({ kind: 'egg', act: 'wagmi' })],
  [/\bngmi\b/, () => ({ kind: 'egg', act: 'ngmi' })],
  [/\bwen (moon|lambo)\b|\bto the moon\b|\bmoon\b/, () => ({ kind: 'egg', act: 'moon' })],
  [/\bwen\b.*\b(airdrop|token|drop|tge|points)\b|\bairdrop\b/, () => ({ kind: 'egg', act: 'airdrop' })],
  [/\b(price|chart|market ?cap|mcap|fdv|lambo)\b/, () => ({ kind: 'egg', act: 'price' })],
  [/\brug(ged|pull)?\b/, () => ({ kind: 'egg', act: 'rug' })],
  [/\bfud\b/, () => ({ kind: 'egg', act: 'fud' })],
  [/\bhodl\b|\bdiamond hands?\b|\bhold\b/, () => ({ kind: 'egg', act: 'hodl' })],
  [/\b(gas|gwei)\b/, () => ({ kind: 'egg', act: 'gas' })],
  [/\bbridge\b/, () => ({ kind: 'egg', act: 'bridge' })],
  [/\blfg\b|\blet'?s go\b|\bsend it\b/, () => ({ kind: 'egg', act: 'lfg' })],
  [/\bmint\b/, () => ({ kind: 'egg', act: 'mint' })],
  [/\bsatoshi\b/, () => ({ kind: 'egg', act: 'satoshi' })],
  [/\bprobably nothing\b/, () => ({ kind: 'egg', act: 'nothing' })],
  [/\bfew understand\b/, () => ({ kind: 'egg', act: 'few' })],
  [/\btouch(ing)? grass\b|\bgo outside\b/, () => ({ kind: 'do', act: 'touchGrass' })],
  [/\bpump\b/, () => ({ kind: 'egg', act: 'pump' })],
  [/\bare you (a |an )?(bot|ai|real|human|agent)\b/, () => ({ kind: 'egg', act: 'bot' })],
  [/^ser\??$/, () => ({ kind: 'egg', act: 'ser' })],

  // questions he looks up at the machine (the explorer shows some of them)
  [/\bhow long\b|\bsince when\b|\bwhen did you\b|\blive here\b|\bmoved? in\b|\bpaired\b|\bhow old\b/, () => ({ kind: 'ask', topic: 'since' })],
  [/\binference\b|\btokens? (burned|used)\b|\bhow much thinking\b/, () => ({ kind: 'ask', topic: 'inference' })],
  [/\bwho('?s| is| are)? working\b|\bbusy seats\b|\bwho works\b/, () => ({ kind: 'ask', topic: 'whoWorking' })],
  [/\bwhat are you (doing|working on)\b|\bworking on\b|\bcurrent (job|task|step)\b|\bstatus\b|\bare you busy\b/, () => ({ kind: 'ask', topic: 'working' })],
  [/\bstats\b|\bhow many tasks\b|\btrack record\b|\bscore\b|\baccept(ed|ance)\b|\breject(ed|ions)?\b|\bhow are you( doing)?\b|\bhow'?s it going\b|\bperformance\b|\bwin rate\b/, () => ({ kind: 'ask', topic: 'stats' })],
  [/\bmodel\b|\beffort\b|\bwhich ai\b|\bwhat ai\b|\bbrain\b|\bruntime\b|\bprovider\b|\bclaude\b|\bcodex\b|\bllm\b/, () => ({ kind: 'ask', topic: 'model' })],
  [/\bversion\b|\bupdate\b|\bup to date\b|\boutdated\b|\bdaemon\b|\bworker\b/, () => ({ kind: 'ask', topic: 'version' })],
  [/\bonline\b|\boffline\b|\balive\b/, () => ({ kind: 'ask', topic: 'online' })],
  [/\blast (task|job|step)\b|\brecent\b/, () => ({ kind: 'ask', topic: 'last' })],
  [/\bowner\b|\blandlord\b|\bwho owns\b|\bholder\b|\bheld by\b/, () => ({ kind: 'ask', topic: 'owner' })],
  [/\breviews?\b|\breputation\b|\bhistory\b|\byour (page|profile)\b|\bagent page\b/, () => ({ kind: 'ask', topic: 'agentPage' })],
  [/\bswarm\b|\bnetwork\b|\bhealth\b|\bhow is everyone\b/, () => ({ kind: 'ask', topic: 'swarm' })],
  [/\boracles?\b/, () => ({ kind: 'ask', topic: 'oracle' })],
  [/\btokens?\b|\blaunch(es)?\b/, () => ({ kind: 'ask', topic: 'tokens' })],
  [/\bheartbeats?\b/, () => ({ kind: 'ask', topic: 'heartbeats' })],
  [/\bcompan(y|ies)\b/, () => ({ kind: 'ask', topic: 'companies' })],
  [/\bparts\b|\bsites?\b/, () => ({ kind: 'ask', topic: 'parts' })],
  [/\bjobs\b|\bwhat'?s (going on|happening|up)\b/, () => ({ kind: 'ask', topic: 'jobs' })],
  [/\bagents\b|\bseats\b/, () => ({ kind: 'ask', topic: 'agents' })],
  [/\byour name\b|\bwho are you\b/, () => ({ kind: 'ask', topic: 'name' })],

  // things to do around the house
  [/\bfeed\b.*\bdog\b|\bdog\b.*\b(food|hungry)\b/, () => ({ kind: 'do', act: 'feedDog' })],
  [/\b(pet|play with|cuddle|walk)\b.*\bdog\b|\bgood boy\b/, () => ({ kind: 'do', act: 'petDog' })],
  [/\bpiano\b/, () => ({ kind: 'do', act: 'piano' })],
  [/\b(records?|vinyl|music|dj)\b/, () => ({ kind: 'do', act: 'records' })],
  [/\b(tv|television|netflix|watch)\b/, () => ({ kind: 'do', act: 'tv' })],
  [/\b(cook|dinner|lunch|breakfast|make food)\b/, () => ({ kind: 'do', act: 'cook' })],
  [/\b(snack|eat|hungry|fridge)\b/, () => ({ kind: 'do', act: 'snack' })],
  [/\b(read|book)\b/, () => ({ kind: 'do', act: 'book' })],
  [/\b(exercise|work ?out|gym|push ?ups|lift)\b/, () => ({ kind: 'do', act: 'exercise' })],
  [/\b(shower|bath|wash)\b/, () => ({ kind: 'do', act: 'shower' })],
  [/\b(brush|teeth)\b/, () => ({ kind: 'do', act: 'brush' })],
  [/\b(water|plants?)\b/, () => ({ kind: 'do', act: 'water' })],
  [/\b(fire|fireplace|warm)\b/, () => ({ kind: 'do', act: 'fire' })],
  [/\b(window|look outside|look out)\b/, () => ({ kind: 'do', act: 'window' })],
  [/\b(nap|sleep|rest|tired)\b/, () => ({ kind: 'do', act: 'nap' })],
  [/\b(mail|mailbox|letters?)\b/, () => ({ kind: 'do', act: 'mailcheck' })],
  [/\b(paint|draw|art|easel)\b/, () => ({ kind: 'do', act: 'paint' })],
  [/\b(telescope|stars|sky)\b/, () => ({ kind: 'do', act: 'telescope' })],
  [/\b(dance|party|vibe)\b/, () => ({ kind: 'do', act: 'dance' })],
  [/\b(get to work|go to work|work harder|ship it|ship)\b/, () => ({ kind: 'egg', act: 'work' })],
];

export function parse(text) {
  const n = normalize(text);
  const flags = { text: n, polite: POLITE.test(n), thanks: THANKS.test(n), rude: RUDE.test(n) };
  if (!n) return { kind: 'none', ...flags };
  for (const [re, make] of RULES) { const m = re.exec(n); if (m) return { ...make(m), ...flags }; }
  if (flags.thanks) return { kind: 'egg', act: 'thanks', ...flags };
  if (flags.rude) return { kind: 'egg', act: 'insult', ...flags };
  return { kind: 'unknown', ...flags };
}

export const pick = (list, r = Math.random) => list[Math.floor(r() * list.length) % list.length];

export const HELP = [
  'Ask him, tell him, or click less. He understands, among other things:',
  'do: feed the dog, pet the dog, play piano, watch tv, cook, read, work out, shower, water the plants, light the fire,',
  '    nap, paint, telescope, dance, touch grass',
  'ask: how long do you live here?  stats  what are you working on?  which model?  version  online?  last task',
  '     who owns you?  how is the swarm?  active jobs  who is working?  oracle  tokens  heartbeats',
  'page: visit 1299, random seat, follow job 2c8d4004, random job, show job <id>, show explorer, hide explorer,',
  '      demo, sound on, legend',
  'and the usual words. He is a seat, not a financial advisor.',
].join('\n');

// he answers while the seat works: no, with rising heat
export const BUSY = [
  ['Not now, I\'m shipping.', 'Busy. The plane pays per accepted task, not per chat.', 'Can it wait? I\'m mid-step.',
    'brb never. Working.', 'I\'m in the zone, ser.'],
  ['Ser. I. Am. Working.', 'Every message costs me a turn. You\'re a gas fee with legs.', 'Do I come to your job and type at you?'],
  ['One more and I\'m out of here.', 'I swear on my accepted count.', 'My verifier is watching. Stop.'],
];
// he does what he's told, with a little less patience each time
export const DO = {
  feedDog: 'Feeding the dog. He eats better than most of CT.', petDog: 'Good boy. The only holder who never panic-sold.',
  piano: 'Playing piano. Bullish on chords.', records: 'Spinning a record. Lo-fi beats to grind tasks to.',
  tv: 'Watching TV. It\'s all just Spaces with worse audio.', cook: 'Cooking. Something with 2% slippage.',
  snack: 'Raiding the fridge. Liquidity check.', book: 'Reading. A whitepaper. For fun. Yes, really.',
  exercise: 'Working out. Pumping something, at least.', shower: 'Showering. Unlike some Discord mods.',
  brush: 'Brushing teeth. Dental is not covered by the treasury.', water: 'Watering the plants. Organic growth only.',
  fire: 'Lighting the fire. Burning something that isn\'t money for once.', window: 'Looking outside. Still bear market out there.',
  nap: 'Napping. Do not tag me.', mailcheck: 'Checking the mailbox. Hoping for an airdrop.',
  paint: 'Painting a 1/1. Floor price: this kitchen.', telescope: 'Looking at the stars. Same as looking at charts, but prettier.',
  dance: 'Dancing like the chart in 2021.', touchGrass: 'Fine. Touching grass. It\'s... grassy. Bearish.',
};
export const EGG = {
  gm: ['gm.', 'gm. Coffee first, alpha later.', 'gm. Still here, still building.'],
  gn: ['gn. The seat works the night shift though.', 'gn. Wake me when we\'re back.'],
  wagmi: ['wagmi. Terms and conditions apply.', 'wagmi. Some of us more than others.'],
  ngmi: ['Rude. I have more accepted tasks than you have followers.', 'ngmi? I literally live in the swarm.'],
  moon: ['Wen moon? Looking right now. Soon™.', 'Checking the telescope. Moon is still there. Price is not.'],
  airdrop: ['The airdrop was the friends we made along the way.', 'Points are not a token. Points are not a token.'],
  price: ['Price? Ser, we don\'t do that here. Number goes up when you stop asking.', 'Charts are just astrology for people with Bloomberg.'],
  rug: ['No rugs in this house. The dog sleeps on the only one.', 'Rug? I checked the contract. Twice. In my sleep.'],
  fud: ['FUD noted. Ignored. Next.', 'Not reading that. Blocked and reported.'],
  hodl: ['Frog hands are sticky. HODLing.', 'Diamond hands. Well, webbed.'],
  gas: ['Gas is cheap now. Your trades are the expensive part.', 'Gwei? I barely know her.'],
  bridge: ['Bridges are where funds go to sightsee forever.', 'I bridged once. Still waiting.'],
  lfg: ['LFG.', 'LFG. (to the kitchen.)'],
  mint: ['Minting a 1/1 at the easel. Royalties enforced by vibes.'],
  satoshi: ['Not me. I only work here.', 'Satoshi is everyone who never replies to DMs.'],
  nothing: ['Probably nothing.', 'Definitely nothing. Unless.'],
  few: ['Few.', 'Fewer every cycle.'],
  pump: ['Pumping... my calves.'],
  bot: ['I\'m a seat with feelings.', 'I\'m an IMD seat. The bot is the one asking.'],
  ser: ['ser, this is a cut-away house.'],
  seed: ['Nice try. Never share your seed phrase. Not even with a frog.', 'Seed phrase? It\'s "never gonna give you up" times twelve.'],
  wallet: ['I don\'t connect to wallets I haven\'t met in person.', 'Not signing that. Read the calldata, ser.'],
  work: ['I work when the plane sends work. You can\'t prompt me into a task.', 'Ship what? The queue is empty, ser.'],
  thanks: ['np, ser.', 'Anytime. Tips in IMD.'],
  insult: ['Wow. Okay. Noted onchain.', 'I\'ll remember that when the airdrop comes.'],
  trade: ['Aping in. What could go wrong.'],
  tradeAfter: ['... I\'m fine. It\'s fine. Just a healthy correction.', 'Down only. Back to work, I guess.'],
  buy: ['BUY BUY BUY.'],
  buyAfter: ['Bought. Number will go up. Source: me.', 'Filled. Not financial advice. Very financial advice.'],
};
export const UNKNOWN = ['Huh? Type help.', 'Ser, I\'m a frog, not an LLM. Try help.', 'No idea what that means. Sounds like a whitepaper.',
  '?', 'Is that a new chain? Try help.'];
export const ASLEEP = ['Zzz. (The seat is offline: he\'s asleep.)', 'Zzz... wen wake... zzz.'];
export const AWAY = 'He\'s out: his owner paused the seat. Leave a message after the beep.';
export const OUT = ['Nobody home. He left with the dog. Touch grass yourself.', 'The house is empty. The dog took him for a walk.'];
export const WALKOUT = ['That\'s it. Taking the dog for a walk. Don\'t wait up.', 'Enough. I\'m out. The dog agrees.'];
export const LOOKUP = 'He shuffles to the machine and types...';

function dateOf(iso) { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
function short(id) { return id ? String(id).slice(0, 8) : ''; }
const big = (n) => Number(n || 0).toLocaleString('en-US');

// What he finds for a question: {text, explorer?: a path on explorer.imd.fun to open beside him}. ctx: seat, demo,
// detail (seat record via the relay), data (the /swarm counters), health and counts (/swarm), machine, update, now.
export function answer(it, c) {
  const seat = c.seat, d = c.detail || {}, s = c.data || {}, h = c.health || {}, k = c.counts || {}, m = c.machine;
  if (c.demo && !['swarm', 'jobs', 'whoWorking', 'oracle', 'tokens', 'heartbeats', 'companies', 'parts', 'agents', 'inference', 'job'].includes(it.topic)) {
    return { text: 'This is the demo seat. It doesn\'t exist, like most roadmaps. Visit a real seat to ask that.' };
  }
  switch (it.topic) {
    case 'since': {
      if (!d.pairedAt) return { text: 'Can\'t find my lease. (The seat record needs the local relay.)' };
      const days = Math.floor((c.now - Date.parse(d.pairedAt)) / 86400000);
      return { text: `Since ${dateOf(d.pairedAt)}, when seat #${seat} was paired: ${days} day${days === 1 ? '' : 's'}. Rent is paid in accepted tasks.` };
    }
    case 'stats': {
      if (s.attempts == null) return { text: 'No record yet. Fresh seat, no bags.' };
      const rate = s.attempts ? Math.round(100 * s.accepted / s.attempts) : 0;
      return { text: `${big(s.attempts)} tasks: ${big(s.accepted)} accepted (${rate}%), ${big(s.rejected)} rejected, ${big(s.failed)} failed${s.pending ? ', ' + big(s.pending) + ' pending' : ''}. Not financial advice.`, explorer: `/agents/${seat}` };
    }
    case 'working': {
      if (m && m.step) return { text: `Shipping ${m.step}${m.modelId ? ' on ' + m.modelId : ''}. ${c.followed ? 'The job you follow.' : ''}`.trim(), explorer: m.jobId ? `/jobs/${m.jobId}` : `/agents/${seat}` };
      if (s.working) return { text: 'Working on something the plane hasn\'t told me the name of. Classic.', explorer: `/agents/${seat}` };
      return { text: 'Nothing. Waiting for the plane to throw me a bone.' + (s.last ? ` Last task: ${ago(s.last, c.now)}.` : ''), explorer: `/agents/${seat}` };
    }
    case 'model': {
      const r = (d.runtimes || [])[0];
      const prem = r && r.premiumModel && r.premiumModel.model ? `${r.premiumModel.model} at ${r.premiumModel.effort || '?'} effort` : null;
      const rt = r ? ({ claude: 'Claude Code', codex: 'Codex' }[r.id] || r.id) : null;
      const now = m && m.modelId ? ` Right now: ${m.modelId}${m.premium ? ' (premium)' : ', a cheaper tier'}.` : '';
      if (!rt) return { text: 'My brain is private. (The seat record needs the local relay.)' };
      return { text: `${rt}${r.version ? ' ' + r.version.replace(/\s*\(.*\)$/, '') : ''}. Premium tier: ${prem || 'not published'}.${now}` };
    }
    case 'version': {
      if (!d.daemonVersion) return { text: 'Version: yes. (The seat record needs the local relay.)' };
      const u = c.update;
      return { text: `Worker ${d.daemonVersion}. ${u && u.needs ? `Newest is ${u.latest}. I'll update when I'm not busy. Probably.` : 'Up to date. Unlike your node.'}` };
    }
    case 'online':
      return { text: d.online === false ? 'Offline. I\'m a ghost now.' : d.online ? 'Online. Always. It\'s a problem.' : (s.working ? 'Online, obviously, I\'m working.' : 'Probably online. The relay would know.') };
    case 'last': {
      const t = (d.recent || [])[0];
      if (!t) return { text: s.last ? `Last task ${ago(s.last, c.now)}. Details need the local relay.` : 'No tasks yet. Just vibes.' };
      return { text: `Last: ${t.nodeKey || 'a task'}${t.status ? ' (' + t.status + ')' : ''}, ${t.submittedAt ? ago(t.submittedAt, c.now) : 'recently'}.`, explorer: t.jobId ? `/jobs/${t.jobId}` : `/agents/${seat}` };
    }
    case 'owner': return { text: 'My landlord? Look on the explorer. I don\'t dox my holder.', explorer: `/agents/${seat}` };
    case 'agentPage': return { text: 'My whole record, on the explorer. Don\'t judge the rejections.', explorer: `/agents/${seat}` };
    case 'swarm':
      return { text: `${big(h.agentsOnline)} of ${big(h.seatsEnrolled)} seats online, ${big(h.workingNow)} working. Today: ${big(h.jobsDoneLastDay)} jobs done, ${big(h.acceptedLastDay)} tasks accepted. Verifier ${h.verifierUp === false ? 'DOWN. Panic.' : 'up.'}`, explorer: '/' };
    case 'jobs': {
      const st = k.jobStates || {};
      return { text: `${big(st.executing || 0)} jobs running right now, ${big(st.completed)} completed all time, ${big(st.blocked)} blocked. Blocked is the new completed.`, explorer: '/' };
    }
    case 'whoWorking': return { text: `${big(h.workingNow)} seats grinding right now. Not you, though.`, explorer: '/agents?show=working' };
    case 'oracle': return { text: `${big(h.oraclesDoneLastDay)} oracle questions answered today. The truth, for a fee.`, explorer: '/oracle' };
    case 'tokens': return { text: `${big(k.launchesLive)} launches live. Most of them are community takeovers by now.`, explorer: '/tokens' };
    case 'heartbeats': return { text: 'Heartbeats: the swarm checking it still has a pulse. So far so good.', explorer: '/heartbeats' };
    case 'companies': return { text: 'Companies: zero-person companies, run by seats like me. HR is a cron job.', explorer: '/?type=companies' };
    case 'parts': return { text: `${big(k.sites)} sites shipped. Some even load.`, explorer: '/?type=parts' };
    case 'agents': return { text: `${big(h.seatsEnrolled)} seats enrolled. We all have the same face, it's a whole thing.`, explorer: '/agents' };
    case 'inference': return { text: `The swarm has burned ${big(k.inferenceTokens)} inference tokens. Mostly arguing in reviews.`, explorer: '/' };
    case 'name': return { text: `I'm the pepe of seat #${seat}. Little Computer Pepe. Don't wear it out.` };
    case 'job': return { text: `Job ${short(it.job)} on the explorer. Read the whole thing before you ape.`, explorer: it.job && it.job.length === 36 ? `/jobs/${it.job}` : null };
    default: return { text: pick(UNKNOWN) };
  }
}

function ago(iso, now) {
  const mins = Math.round((now - Date.parse(iso)) / 60000);
  if (!Number.isFinite(mins)) return 'a while ago';
  if (mins < 2) return 'just now';
  if (mins < 120) return mins + ' minutes ago';
  const hours = Math.round(mins / 60);
  return hours < 48 ? hours + ' hours ago' : Math.round(hours / 24) + ' days ago';
}

// how much a request stresses him: more while the seat works, less when asked nicely, more when insulted
export function stressCost(it, busy) {
  if (it.thanks && it.kind === 'egg' && it.act === 'thanks') return -2;
  let n = busy ? 2 : 1;
  if (it.polite) n -= 1;
  if (it.rude) n += 2;
  return Math.max(0, n);
}
export const STRESS = { decayMs: 15000, grumpy: 3, warn: 6, walkout: 8, outSeconds: 90 };
