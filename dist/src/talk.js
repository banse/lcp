// Talking to him (2026-10-24): the command line under the seat row, like typing to the man in Little Computer People.
// parse() turns what the visitor types into an intent; answer() and the line tables word his replies. Pure: main.js
// acts on them (page commands do what the buttons do, the house plays the scenes), so all of it can be tested alone.
// His voice: an onchain native who has seen a few cycles; dry, a bit tired, never mean to the visitor first.

export const POLITE = /\b(please|pls|plz|bitte)\b/;
export const THANKS = /\b(thanks|thank you|thx|ty|danke|gracias)\b/;
const RUDE = /\b(stupid|dumb|idiot|useless|lazy|shut up|loser|noob|trash|bot brain)\b/;
const JOB = '([0-9a-f]{8}(?:-[0-9a-f]{4}){0,3}(?:-[0-9a-f]{12})?)';
const CA = /\b(0x[0-9a-f]{40})\b/;
const IMD = '0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7';              // market.js IMD_CA (talk.js stays import-free)
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';             // market.js WETH: ETH by its ticker
const KNOWN = { IMD, ETH: WETH, WETH, ETHER: WETH, ETHEREUM: WETH };

// a token's market (owner, 2026-10-24): price, chart, buy, sell. With a contract address he looks it up; a ticker alone
// gets a question back (tickers are not unique), except IMD, his house's own token, and ETH. 'prize' is the common typo.
const MARKET_WORD = /^(price|prices|prize|chart|charts|candles?|mcap|fdv|cap)$/;
const FILLER = new Set(('check show open see look give get what what\'s whats is are was the a an of for on at in to me us it this that ' +
  'my your his our some token tokens coin current live now today please pls plz bitte how much high low doing about and ' +
  'market ser real quick price prices prize chart charts candles mcap fdv cap buy sell ape bid dump').split(' '));

function tickerOf(n) {
  const d = /\$([a-z][a-z0-9]{0,14})\b/.exec(n);
  if (d) return d[1].toUpperCase();
  const words = n.replace(/[?.]/g, ' ').split(' ').filter(Boolean).map((w) => w.replace(/'s$/, ''));
  const i = words.findIndex((w) => MARKET_WORD.test(w) || /^(buy|sell|ape|bid|dump)$/.test(w));
  const ok = (w) => /^[a-z][a-z0-9]{1,14}$/.test(w) && !FILLER.has(w);
  const after = words.slice(i + 1).find(ok), before = words.slice(0, Math.max(0, i)).reverse().find(ok);
  return ((i >= 0 && after) || before || null)?.toUpperCase() || null;
}

function marketAct(n) {
  return /\b(chart|charts|candles?)\b/.test(n) ? 'chart' : /\b(sell|dump)\b/.test(n) ? 'sell'
    : /\b(buy|ape|bid)\b/.test(n) ? 'buy' : /\b(price|prices|prize|mcap|fdv|market ?cap)\b/.test(n) ? 'price' : null;
}

// {kind: 'market', act: price|chart|buy|sell|null (a bare address: what he was asked last), ca, ticker}
function market(n) {
  const ca = CA.exec(n), act = marketAct(n);
  if (ca) return { kind: 'market', act, ca: ca[1], ticker: null };
  if (/\b(gas|gwei)\b/.test(n)) return null;                          // a gas price is his gas joke
  if (!act || (act === 'buy' || act === 'sell') && !/^(buy|sell|ape|bid|dump)\b/.test(n) && !/\$[a-z]/.test(n)) return null;
  const t = tickerOf(n);
  return { kind: 'market', act, ca: KNOWN[t] || null, ticker: t };
}

// a job dropped into the command line (2026-10-25, owner: "when someone drops a jobid or an explorer link into the cmd
// line that job should be loaded when active"): a link to a job or an oracle question on explorer.imd.fun or
// api.imd.fun, this page's own #/job/<id>[/step/<key>] link, or a job id on its own. Read from the raw text: the
// normalized one has lost its slashes. oracle: the id is an oracle request's (its job is looked up).
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export function jobRef(text) {
  const t = String(text || '').trim().toLowerCase();
  let m = new RegExp('#/job/(' + UUID + ')(?:/step/([^/\\s?#]{1,200}))?').exec(t);
  if (m) { let step = null; try { step = m[2] ? decodeURIComponent(m[2]) : null; } catch (e) { /* not a step key */ } return { job: m[1], step, oracle: false }; }
  m = new RegExp('(?:explorer|api)\\.imd\\.fun/(jobs|oracle(?:/requests)?)/(' + UUID + ')').exec(t);
  if (m) return { job: m[2], step: null, oracle: m[1] !== 'jobs' };
  m = new RegExp('^(?:job\\s*)?#?(' + UUID + ')$').exec(t);
  return m ? { job: m[1], step: null, oracle: false } : null;
}

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
  // the radio (2026-10-25, owner: background music from theidm.fun, he switches it on request): theidm.fun's stations on
  // the record player (radio.js). He switches stations and the volume; the genre is the market's, so a genre wish gets
  // the truth. Before the sound rule: "music off" is the radio, "sound off" the house's beeps.
  [/\b(?:radio|music|tunes?|station|player|record player) (on|off)\b|\bturn (on|off) the (?:radio|music|tunes?|record player)\b|\b(?:stop|kill|silence|shut off|turn off|switch off) the (?:music|radio|tunes?|noise|record)\b|^(?:music|radio|tunes?) ?(on|off)$/,
    (m, n) => ({ kind: 'radio', act: /\boff\b|\b(?:stop|kill|silence|shut off)\b/.test(n) ? 'off' : 'on' })],
  [/\bturn it off,? i'?m working\b|\bi'?m working\b.*\b(?:music|radio)\b|\b(?:music|radio)\b.*\bi'?m working\b/, () => ({ kind: 'radio', act: 'offWorking' })],
  [/\b(?:play|put on|spin|tune(?: in)?(?: to)?|switch(?: over)? to|change to)\s+(?:the |some )?(?:station |radio |record |tunes? of |music of )?\$?(imd ?\/? ?eth|imd-eth|imd|idm|intelligent dance market|infer|chog|credits)\b/,
    (m) => ({ kind: 'radio', act: 'tune', name: m[1] })],
  [/\b(?:radio|station|tune in)\s+\$?(imd ?\/ ?eth|imd-eth|imd|idm|infer|chog|credits)\b/, (m) => ({ kind: 'radio', act: 'tune', name: m[1] })],
  [/\bnext (?:station|record|channel|track|tune|song)\b|^skip$|\bother station\b|\bchange the (?:station|record|channel)\b/, () => ({ kind: 'radio', act: 'next' })],
  [/\bwhat'?s (?:playing|on the radio|this (?:music|song|track|tune|noise))\b|\bwhat (?:is|'s) (?:this|that|the) (?:music|song|tune|track|station|noise)\b|\bwhich (?:station|record)\b|\bnow playing\b|\bwhat (?:are we|am i) listening to\b|^(?:the )?(?:radio|music|tunes?)\??$/,
    () => ({ kind: 'radio', act: 'now' })],
  [/\b(?:louder|turn (?:it|the (?:music|radio|volume)) up|volume up|crank it|pump it up|more volume)\b/, () => ({ kind: 'radio', act: 'volume', delta: 1 })],
  [/\b(?:quieter|softer|turn (?:it|the (?:music|radio|volume)) down|volume down|too loud|lower the (?:music|radio|volume))\b/, () => ({ kind: 'radio', act: 'volume', delta: -1 })],
  [/\bstations\b|\brecord collection\b|\b(?:what|which) records\b|\bwhat can (?:you|we) play\b|\bwhat'?s in the cabinet\b/, () => ({ kind: 'radio', act: 'list' })],
  [/\b(dub ?techno|techno|electro|acid|ambient(?: idm)?|drone|liquid(?: dnb)?|dnb|drum (?:and|n|'n') bass|future garage|garage|trip-?hop|lo-?fi(?: house)?|wonky|house music|jazz|rock music|metal|hip-?hop|rap|pop music|classical|schlager|country music)\b/,
    (m) => ({ kind: 'radio', act: 'genre', genre: m[1] })],
  [/\brequest (?:a )?(?:song|track|tune)\b|\bsong request\b|\bplay (?:me )?(?:a |some )?(?:song|track|tune)\b|\bdedicat/, () => ({ kind: 'radio', act: 'request' })],
  [/\bplay (?:me )?(?:some |the )?(?:music|radio|tunes?)\b|\bput (?:some |the )?(?:music|radio) on\b|\bmusic please\b|\bput on a record\b/, () => ({ kind: 'radio', act: 'on' })],
  [/\bsound (on|off)\b|\b(mute|unmute)\b/, (m) => ({ kind: 'page', act: 'sound', on: m[1] ? m[1] === 'on' : m[2] === 'unmute' })],
  [/\blegend\b/, () => ({ kind: 'page', act: 'legend' })],
  [/\b(hide|close) (?:the )?(?:imd )?explorer\b/, () => ({ kind: 'page', act: 'hideExplorer' })],
  [/\b(show|open) (?:it )?(?:on )?(?:the )?(?:imd )?explorer\b|\bsplit view\b/, () => ({ kind: 'page', act: 'showExplorer' })],

  // the culture: selling IMD stays ignored, buying it has him run (and LlamaSwap opens for IMD)
  [/\b(sell|dump)\b.*\b(imd|\$imd|bags?|everything|it all)\b|^dump( it)?$/, () => ({ kind: 'egg', act: 'sell' })],
  [new RegExp('\\b(sell|dump)\\b.*\\b' + IMD + '\\b'), () => ({ kind: 'egg', act: 'sell' })],
  [/\b(buy|ape|bid)\b.*\b(imd|\$imd|the dip)\b/, () => ({ kind: 'egg', act: 'buy' })],
  [/\b(trade|trading|degen|ape|aping|gamble)\b.*\b(meme ?coins?|memes|shitcoins?|alts?|coins?|tokens?|perps?)\b|^(degen|ape in|go degen)$/, () => ({ kind: 'egg', act: 'trade' })],
  // NFTs, floors and alpha: he tells you about Sworn (owner, 2026-10-24); before the market, so a floor price is his
  [/\bnfts?\b|\bfloors?( prices?)?\b|\bjpe?gs?\b|\bpfps?\b|\bopensea\b|\balpha\b|\bsworn\b|\bgems?\b|\bwhat (should|to|can) i (mint|ape|buy)\b|\bwen mint\b|\bmint (a|my|your) card\b/,
    (m, n) => ({ kind: 'sworn', alpha: /\balpha\b|\bgems?\b|\bwhat (should|to|can) i\b/.test(n) })],
  // a token's market: an address anywhere, or a price / chart word, or buy / sell with a ticker
  [/\b0x[0-9a-f]{40}\b|\b(price|prices|prize|chart|charts|candles?|mcap|fdv|market ?cap)\b|^(buy|sell|ape|bid|dump)\b|\b(buy|sell)\b.*\$[a-z]/, (m, n) => market(n)],
  [/\b(seed ?phrase|seed|private key|mnemonic|recovery phrase|pk)\b/, () => ({ kind: 'egg', act: 'seed' })],
  [/\bconnect\b.*\bwallet\b|\bsign (this|here)\b|\bapprove\b/, () => ({ kind: 'egg', act: 'wallet' })],
  [/^(gm|gmgm|good morning)\b/, () => ({ kind: 'egg', act: 'gm' })],
  [/^(gn|good night|night)\b/, () => ({ kind: 'egg', act: 'gn' })],
  [/\bwagmi\b/, () => ({ kind: 'egg', act: 'wagmi' })],
  [/\bngmi\b/, () => ({ kind: 'egg', act: 'ngmi' })],
  [/\bwen (moon|lambo)\b|\bto the moon\b|\bmoon\b/, () => ({ kind: 'egg', act: 'moon' })],
  [/\bwen\b.*\b(airdrop|token|drop|tge|points)\b|\bairdrop\b/, () => ({ kind: 'egg', act: 'airdrop' })],
  [/\blambo\b/, () => ({ kind: 'egg', act: 'price' })],
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
  [/\binference\b|\btokens? used\b|\bhow much thinking\b/, () => ({ kind: 'ask', topic: 'inference' })],
  // IMD burns: the burn tracker (owner, 2026-10-24); after inference, so "inference tokens burned" stays that
  [/\bburn(s|ed|ing|t|er|ers)?\b|\bburn ?(rate|tracker)\b|\bdeflation(ary)?\b/, () => ({ kind: 'burn' })],
  // IMD or swarm news (owner, 2026-10-26): he fetches The IMD Daily from the mailbox and reads it; a click on him leafs through it
  [/\b(?:imd|swarm|ecosystem)\s+(?:news|headlines?|gossip|updates?|papers?)\b|\b(?:news|headlines?|newspaper|gazette|the daily|imd daily|daily issue|today'?s (?:issue|paper|edition|news))\b|\bwhat'?s (?:new|the latest|the news|in the news)\b|\banything new\b|\bwhat happened (?:today|this week|lately|yesterday)\b|\bread (?:me )?the (?:news|paper)\b|\bany (?:news|updates)\b|\blatest issue\b/,
    () => ({ kind: 'news' })],
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
  [/\b(get to work|go to work|work harder|ship it|ship)\b/, () => ({ kind: 'egg', act: 'work' })],  // last: play <anything else> is a record he does not have (the things to do above keep play piano, play with the dog)
  [/^(?:play|put on|tune(?: in)? to)\s+(?:the |some |me )?\$?([a-z][a-z0-9]{1,20})\??$/, (m) => ({ kind: 'radio', act: 'tune', name: m[1] })],
];

// a short yes or no, the answer to a question he asked (main.js keeps what was asked)
const YES = /^(yes|y|yeah|yep|yup|sure|ok|okay|do it|go|ja|please do|open it)[.!]?$/, NO = /^(no|n|nope|nah|nein|later|never mind|nvm)[.!]?$/;

export function parse(text) {
  const n = normalize(text);
  const flags = { text: n, polite: POLITE.test(n), thanks: THANKS.test(n), rude: RUDE.test(n) };
  if (!n) return { kind: 'none', ...flags };
  if (YES.test(n.replace(/\b(please|pls|plz)\b/g, '').trim() || n)) return { kind: 'confirm', yes: true, ...flags };
  if (NO.test(n)) return { kind: 'confirm', yes: false, ...flags };
  const ref = jobRef(text);
  if (ref && !/^(explain|what)\b/.test(n)) return { kind: 'page', act: 'load', ...ref, ...flags };
  for (const [re, make] of RULES) {
    const m = re.exec(n);
    const it = m && make(m, n);
    if (it) return { ...it, ...flags };
  }
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
  '      demo, sound on, legend, or paste a job id or its explorer link: he follows it while it runs',
  'market: price 0x…, chart 0x…, buy 0x…, sell 0x… (a contract address; a ticker gets you a question), imd and eth',
  'radio: radio on / off, play infer (imd/eth, $idm, infer, chog), next station, what\'s playing, louder, quieter, stations',
  'news: imd news, swarm news, what\'s new, headlines: he reads The IMD Daily; click him while he reads to leaf through it',
  'and: nfts, floor prices or alpha (he has a tip), imd burns (the burn tracker)',
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
// the radio, in his voice (radio.js; main.js radioTalk): stations, never genres (the market picks those)
// the Sworn card over the fireplace (sworn.js): a tap on it and he tells you it's his onchain trophy, proud and ironic
const TROPHY_WHAT = { Swarmed: 'holding a seat', Spawned: 'showing up', 'Zero-Shot': 'being early', Hopper: 'hopping', Bullfrog: 'putting ETH in',
  Benchmarked: 'carrying weight', Uptime: 'still being here', Holdout: 'the last stand', 'Final Token': 'being the last one in',
  Hotfix: 'saving the hour', PID: 'the first thousand', 'Top Weights': 'the top 32', Pretrained: 'not being born yesterday' };
export function trophyLine(card, r = Math.random) {
  const lit = (card && card.cells ? card.cells : []).filter((c) => c.level > 0).map((c) => TROPHY_WHAT[c.name] || c.name.toLowerCase());
  const list = lit.length <= 1 ? lit.join('') : lit.slice(0, -1).join(', ') + ' and ' + lit[lit.length - 1];
  const n = lit.length;
  const lines = n === 0 ? [
    'That\'s my onchain trophy. Zero cells lit: the chain looked at my whole career and said "noted". Proud anyway.',
    'My Sworn card. Empty hive, full heart. Every fact I ever did is still pending, like my airdrop.',
  ] : n === 1 ? [
    `That\'s my onchain trophy: one cell lit, for ${list}. Years of degen research and the chain remembers exactly one thing. I\'m framing it. Mentally.`,
    `My Sworn card. ${list.charAt(0).toUpperCase() + list.slice(1)}, proven onchain, no take-backs. The other twelve cells are "in progress", like my portfolio.`,
  ] : [
    `That\'s my onchain trophy: ${n} of 13 cells lit, for ${list}. The chain wrote it all down, so I can\'t deny any of it. Prouder than a bagholder at break-even.`,
    `My Sworn card, ${n} facts sworn onchain: ${list}. No roadmap, no promises, just receipts. Few.`,
  ];
  return pick(lines, r);
}
// The IMD Daily (daily.js, news.js): what he says around the paper
export const NEWS = {
  fetching: 'He shuffles to the mailbox for the paper…',
  none: 'No paper in the mailbox: The IMD Daily didn\'t answer. Read it there:',
  busy: 'The paper\'s at the door. Read it yourself:',
  ready: 'The paper\'s in my hands. Click me and read along.',
};
export const RADIO = {
  on: (label) => `Radio on: ${label}. Every trade is a note, ser.`,
  off: ['Radio off. Finally some silence.', 'Needle up. The market can hum to itself.'],
  offWorking: 'I\'m the one working here, ser. Fine. Off.',
  tuned: (label) => `Put on ${label}. Let the pool play.`,
  same: (label) => `${label} is already on. Listen closer.`,
  working: 'I\'m working, change it yourself. Fine, the dog will manage.',
  asleep: 'Zzz. (The radio switches on its own; he sleeps through it.)',
  nowOff: 'Nothing. The radio is off: say radio on.',
  armed: (label) => `${label} starts at your first click or key: the browser wants that before any sound.`,
  now: (st, stage, rate) => `${st.label} on theidm.fun: ${st.chain}'s pool, live, ${rate == null ? 'the trades are the notes' : rate === 0 ? 'no trade in the last ten minutes' : rate + (rate === 1 ? ' trade' : ' trades') + ' in the last ten minutes'}. ${['The grid is live.', 'Ten quiet minutes: the hats are fading.', 'Half an hour quiet: pad, bass, a soft kick.', 'An hour without a trade: drone.'][stage || 0]}`,
  unknown: (name) => `No record of ${name} in the cabinet. I have IMD/ETH, $IDM, INFER/IMD and CHOG/MON.`,
  pending: (p) => `${p.label} is ${p.note}: nothing to play yet. IMD/ETH, $IDM, INFER/IMD or CHOG/MON?`,
  genre: (g) => `${g}? The market picks the genre, not me. Every trade is a note: buy something and the note changes.`,
  request: 'Requests go to the pool, ser. Buy something and you\'ve written a note.',
  louder: (pct) => `Louder: ${pct}%. The neighbours are seats, they don\'t mind.`,
  quieter: (pct) => `Quieter: ${pct}%. Lo-fi beats to grind tasks to.`,
  max: 'That\'s as loud as it goes. The frame has one knob.',
  min: 'Any quieter and it\'s off. Say radio off.',
  stations: (list, current) => `The cabinet: ${list.map((s) => (s.key === current ? s.label + ' (on)' : s.label) + ', ' + s.chain).join('; ')}; CREDITS still pending. Say play <name>.`,
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

// the market: a ticker gets a question back; with an address he reads DexScreener and opens the page beside him
export const MARKET = {
  needCa: (t) => [`Which ${t}? There are a hundred of them. Paste the contract address (0x…).`,
    `${t}? Tickers aren't unique, ser. Contract address, please.`, `I don't trade vibes. Give me ${t}'s contract address.`],
  noWhat: { price: 'Price of what? Paste a contract address (0x…).', chart: 'Chart of what, ser? Paste a contract address (0x…).',
    buy: 'Buy what? Paste a contract address (0x…). Not financial advice.', sell: 'Sell what? Paste a contract address (0x…).' },
  missing: 'No pool for that address on DexScreener. Brand new, dead, or not a token.',
  error: 'DexScreener didn\'t answer.',
  offChain: (q) => `${q.symbol} trades on ${q.chainId}; I only open pages for Ethereum, Base, Arbitrum, BNB Chain and Robinhood Chain.`,
};

// Sworn (owner, 2026-10-24): an ELI5 and a card to mint, from the site's own copy (aidude docs/sworn-site-spec.md §3)
export const SWORN = {
  lead: { nft: ['Floors? Forget floors.', 'NFTs? I have exactly one tip.', 'JPEGs? Here\'s one that actually does something.'],
    alpha: ['Real alpha, free of charge:', 'You didn\'t hear it from me:', 'Alpha? Fine. Just this once:'] },
  eli5: 'Sworn. ELI5: it\'s a card for your wallet. It lists facts about that wallet: some read straight from the chain, '
    + 'the rest checked by panels of IMD agents like me, who swear to them. Any contract can read your card, so a mint or an '
    + 'airdrop can trust it without a snapshot. Built by the swarm, no coin, only the card.',
  mint: (beside) => `Mint yours, it updates itself.${beside ? ' Sworn is on the right; minting happens on the real site:' : ''}`,
};

// the burn tracker: IMD burns, a site nobody owns (owner, 2026-10-24); BURN.ca = its contract, not deployed yet
export const BURN = {
  lead: ['IMD burns? The burn tracker has every one.', 'Burns: my favourite kind of fire.', 'Number goes down, for once. Good.'],
  note: (beside) => `${beside ? 'It\'s on the right. ' : ''}Did you know? The site has no owner: anyone can update it by sending `
    + 'the update transaction to its contract. Want the contract\'s write page on Etherscan? (yes / no)',
  yes: 'Opened the contract\'s write page on Etherscan in a new tab. Read it before you sign.',
  blocked: 'Your browser blocked the new tab; here it is:',
  noCa: 'Its contract isn\'t public yet. Ask me again when it is.',
  no: 'Fine. The fire\'s warm anyway.',
  nothing: ['Yes what?', 'No what? I didn\'t ask anything.'],
};

function mood(ch) {
  if (ch == null) return '';
  if (ch >= 30) return ' Up only.';
  if (ch >= 5) return ' Green candles. Don\'t get used to it.';
  if (ch > -5) return ' Crabbing.';
  if (ch > -30) return ' Healthy correction.';
  return ' It\'s fine. Everything is fine.';
}

// q: market.js quote(); usd: market.js usd(); chain: the chain's display name; beside: where the page opened next to
// him ('on the right', 'below'; true = on the right) or false (his answer only links it); page: 'defined.fi',
// 'LlamaSwap' or null
export function marketText(act, q, usd, chain, beside, page) {
  const where = beside ? ' ' + (typeof beside === 'string' ? beside : 'on the right') : '';
  const priced = !q.error && !q.missing && !q.noPool;
  const who = q.launch ? (priced ? `${q.symbol} (IMD launch #${q.launch.launchNumber})` : `IMD launch #${q.launch.launchNumber}`) : q.symbol;
  let line;
  if (priced) {
    const ch = q.change24 == null ? '' : ` (${q.change24 >= 0 ? '+' : ''}${q.change24.toFixed(1)}% in 24 h)`;
    line = `${who} on ${chain}: ${usd(q.price)}${ch}, liquidity ${usd(q.liquidity)}${q.mcap ? ', market cap ' + usd(q.mcap) : ''}` +
      (q.launch ? ', in its launch pool.' : '.');
  } else if (q.launch) line = `${who} on ${chain}: ${q.error ? MARKET.error : 'DexScreener has no data for its launch pool yet.'}`;
  else line = q.error ? MARKET.error : MARKET.missing;
  if (act === 'price') return line + (priced ? mood(q.change24) : page ? ' defined.fi may know more.' : '');
  const opens = (name) => (beside ? `${name} is open${where}` : `Here's ${name}`);
  if (page === 'LlamaSwap') return act === 'buy' ? `${line} ${opens('LlamaSwap')}, ${q.coin || 'ETH'} to ${q.symbol}. Your wallet, your call. Not financial advice.`
    : `${line} ${opens('LlamaSwap')}, ${q.symbol} to ${q.coin || 'ETH'}. Taking profits or taking losses?`;
  if (!page) return line;
  const joke = priced ? ' Astrology for people with Bloomberg.' : '';
  if (act === 'chart') return beside ? `${line} The chart is on defined.fi${where}.${joke}` : `${line}${joke} The chart is on defined.fi:`;
  return `${line} ${priced ? 'LlamaSwap doesn\'t trade on ' + chain : 'No pool, no swap route'}; ${beside ? `defined.fi is open${where}.` : 'here\'s defined.fi:'}`;
}

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
      if (!d.pairedAt) return { text: 'Can\'t find my lease. (This page can\'t read the seat record.)' };
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
      if (!rt) return { text: 'My brain is private. (This page can\'t read the seat record.)' };
      return { text: `${rt}${r.version ? ' ' + r.version.replace(/\s*\(.*\)$/, '') : ''}. Premium tier: ${prem || 'not published'}.${now}` };
    }
    case 'version': {
      if (!d.daemonVersion) return { text: 'Version: yes. (This page can\'t read the seat record.)' };
      const u = c.update;
      return { text: `Worker ${d.daemonVersion}. ${u && u.needs ? `Newest is ${u.latest}. I'll update when I'm not busy. Probably.` : 'Up to date. Unlike your node.'}` };
    }
    case 'online':
      return { text: d.online === false ? 'Offline. I\'m a ghost now.' : d.online ? 'Online. Always. It\'s a problem.' : (s.working ? 'Online, obviously, I\'m working.' : 'Probably online. The seat record would know, and this page can\'t read it.') };
    case 'last': {
      const t = (d.recent || [])[0];
      if (!t) return { text: s.last ? `Last task ${ago(s.last, c.now)}. This page can't read the details.` : 'No tasks yet. Just vibes.' };
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
