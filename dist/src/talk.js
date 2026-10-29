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
const DOG = '(?:dog|doggo|doggy|doggie|pup|puppy|pupper)';

// a token's market (owner, 2026-10-24): price, chart, buy, sell. With a contract address he looks it up; a ticker alone
// gets a question back (tickers are not unique), except IMD, his house's own token, and ETH. 'prize' is the common typo.
const MARKET_WORD = /^(price|prices|prize|chart|charts|candles?|mcap|fdv|cap|worth)$/;
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
    : /\b(buy|ape|bid)\b/.test(n) ? 'buy' : /\b(price|prices|prize|mcap|fdv|market ?cap|worth)\b/.test(n) ? 'price' : null;
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

// a wallet named anywhere in the (normalized) line: a 0x address or a name.eth, raw (main.js checks it), else null
const walletIn = (n) => (n.match(/(?:^|\s)(0x[0-9a-f]{40}|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.eth)(?=$|[\s?.])/) || [])[1] || null;

// "what is X" and "how do I X" about the swarm itself (2026-10-28): faq(n) -> {kind: 'faq', topic} or null. The whole line is
// the question ("what is imd worth" stays the market's, "what are the seats doing" a lookup); FAQ in the line tables answers
const FAQ_TOPIC = [[/^(?:imd|identity ?md|the swarm|swarm|imd swarm)$/, 'imd'], [/^(?:seats?|idmd|imd nfts?|nft seats?)$/, 'seat'],
  [/^(?:oracles?|oracle (?:questions?|requests?|panels?))$/, 'oracle'], [/^(?:jobs?|swarm jobs?)$/, 'job'],
  [/^(?:sites?|swarm sites?|websites?)$/, 'site'], [/^(?:launch(?:es)?|token launch(?:es)?)$/, 'launch']];
const FAQ_WHAT = /^(?:(?:so|ok|hey|yo|ser|pepe),? )?(?:what(?:'s| is| are|s)|wtf is|explain|define|eli5)(?: (an?|the))? ([a-z ]{2,24}?)\??$/;
const FAQ_HOW = [
  [/\bhow (?:do|can|could|would) (?:i|we|you|one|someone|anyone) (?:get|buy|own|rent|run|have) (?:a |an |my |one |the )?(?:seat|idmd|imd nft)\b|\b(?:how to|where (?:do|can) i) (?:get|buy|run) (?:a |an )?(?:seat|idmd|imd nft)\b/, 'seat'],
  [/\bhow (?:do|can|could|would) (?:i|we|you|one|someone) (?:launch|deploy|make|create|start) (?:a |an |my |our |me a )?(?:token|coin|memecoin|launch)\b|\bhow to (?:launch|deploy|make|create) (?:a |an )?(?:token|coin)\b/, 'launch'],
  [/\bhow (?:do|can|could|would) (?:i|we|you|one) (?:ask|use|pay|order|open) (?:an |the )?oracle\b|\bhow (?:does|do) (?:the )?oracles? work\b/, 'oracle'],
  [/\bhow (?:do|can|could|would) (?:i|we|you|one) (?:order|open|post|start|pay for|get) (?:a |an )?job\b|\bhow (?:does|do) (?:a |the )?jobs? work\b/, 'job'],
  [/\bhow (?:do|can|could|would) (?:i|we|you|one) (?:get|make|build|order|host) (?:a |an )?(?:swarm )?(?:site|website)\b/, 'site'],
  [/\bhow (?:does|do) (?:imd|the swarm|identity ?md) work\b/, 'imd'],
];
function faq(line) {
  const n = line.replace(/\b(?:please|pls|plz|bitte)\b/g, ' ').replace(/[,\s]+(?:ser|pepe)\??$/, '').replace(/\s+/g, ' ').trim();   // "what is imd please, ser"
  const w = FAQ_WHAT.exec(n);                                           // "what are the jobs" is which ones: the count
  const t = w && !(w[1] === 'the' && /s$/.test(w[2])) && FAQ_TOPIC.find(([re]) => re.test(w[2].trim()));
  if (t) return { kind: 'faq', topic: t[1] };
  const h = FAQ_HOW.find(([re]) => re.test(n));
  return h ? { kind: 'faq', topic: h[1] } : null;
}

// German wishes (2026-10-28, owner: "only if its not too complex"): a word table turns them into the English line before the
// rules; his answers stay English. Only a line with a word that is German and nothing else is translated, so "die", "an" or
// "post" in an English line stay English.
const DE_PHRASE = [[/\bwie geht'?s(?: dir)?\b|\bwie geht es dir\b/g, 'how are you'], [/\bwas machst du\b/g, 'what are you doing'],
  [/\bwas kostet\b/g, 'price of'], [/\bguten morgen\b/g, 'gm'], [/\bgute nacht\b/g, 'gn'], [/\bwer bist du\b/g, 'who are you'],
  [/\bwer arbeitet\b/g, 'who is working'], [/\bwas ist\b/g, 'what is']];
const DE_WORD = { hund: 'dog', hundi: 'dog', fuettere: 'feed', fuettern: 'feed', fuetter: 'feed', fuettert: 'feed', klavier: 'piano',
  spiel: 'play', spiele: 'play', spielen: 'play', spielt: 'play', fernsehen: 'tv', fernseher: 'tv', glotze: 'tv', koch: 'cook',
  koche: 'cook', kochen: 'cook', lies: 'read', lesen: 'read', buch: 'book', schlaf: 'sleep', schlafen: 'sleep', dusch: 'shower',
  duschen: 'shower', feuer: 'fire', kamin: 'fire', fenster: 'window', giess: 'water', giesse: 'water', pflanzen: 'plants',
  tanz: 'dance', tanzen: 'dance', sterne: 'stars', briefkasten: 'mailbox', musik: 'music', lauter: 'louder', leiser: 'quieter',
  preis: 'price', zeig: 'show', zeige: 'show', mir: 'me', aus: 'off', an: 'on', die: 'the', der: 'the', das: 'the', den: 'the',
  dem: 'the', und: 'and', ein: 'a', eine: 'a', mal: '', doch: '', bitte: 'please', danke: 'thanks', neuigkeiten: 'news',
  nachrichten: 'news', zeitung: 'newspaper', verbrennungen: 'burns', sitze: 'seats', sitz: 'seat', zufaelliger: 'random' };
const DE_ONLY = new Set(Object.keys(DE_WORD).filter((w) => !['an', 'aus', 'die', 'den', 'mal', 'lies', 'buch', 'koch', 'spiel', 'tanz'].includes(w)));
export function deutsch(text) {
  let t = String(text || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  const words = t.match(/[a-z']+/g) || [];
  if (!words.some((w) => DE_ONLY.has(w)) && !DE_PHRASE.some(([re]) => (re.lastIndex = 0, re.test(t)))) return String(text || '');
  for (const [re, en] of DE_PHRASE) t = t.replace(re, en);
  return t.replace(/[a-z']+/g, (w) => (w in DE_WORD ? DE_WORD[w] : w)).replace(/\s+/g, ' ').trim();
}

// a line he does not get, with a typo (2026-10-28): each unknown word of three letters or more that is one edit (two from seven
// letters) away from a word the rules know is swapped for it; if the new line means something, he asks "Did you mean …?". The
// rules' own words are the vocabulary, so it grows with them. Ties: a transposition first, then a dropped letter, a wrong one,
// an extra one.
let VOCAB = null;
const vocab = () => VOCAB || (VOCAB = new Set(RULES.flatMap(([re]) => re.source.replace(/\\[bBdDsSwW]/g, ' ').match(/[a-z]{3,}/g) || [])
  .concat([...FILLER], Object.keys(EGG), Object.keys(DO))));
function edit(a, b) {                                                   // optimal string alignment distance
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
function fix(w, words) {
  const max = w.length >= 7 ? 2 : 1;
  let best = null, key = null;
  for (const v of words) {
    if (Math.abs(v.length - w.length) > max) continue;
    const e = edit(w, v);
    if (e > max) continue;
    const kind = v.length === w.length ? ([...v].sort().join('') === [...w].sort().join('') ? 0 : 2) : v.length > w.length ? 1 : 3;
    const k = e * 10 + kind;
    if (key == null || k < key) { best = v; key = k; }
  }
  return best;
}
export function suggest(n) {
  const words = vocab();
  let changed = false;
  const line = n.split(' ').map((w) => {
    const core = w.replace(/[?.]+$/, '');
    if (core.length < 3 || !/^[a-z]+$/.test(core) || words.has(core)) return w;
    const f = fix(core, words);
    if (!f) return w;
    changed = true; return f + w.slice(core.length);
  }).join(' ');
  return changed && parse(line, false).kind !== 'unknown' ? line : null;
}

// the swarm help desk (2026-10-28, ideas lcp-swarm-help-desk.md): a visitor's job, read through the server (api.imd.fun sends
// no CORS), what stopped it or what it delivered, and the next step; an error code of the plane in plain words. What the visitor
// wanted ("check job <id> for dark mode, mainnet") stays in the browser.
// the prompt checker's words; a job id or link in the same line is loaded into it ("check prompt of <explorer link>")
const CHECKER = /\b(?:check|review|lint|improve|test)\b(?: me)?(?: my| this| a| the| our| its)? (?:prompt|brief|job body|body|objective)s?\b|\bprompt[- ]?check(?:er)?\b|\bbrief check\b|\bfree check\b/;
const HELP_WORDS = /\b(?:help|stuck|blocked|block|failed|fail|failing|broken|wrong|why|what happened|not working|doesn'?t work|didn'?t work|isn'?t working|issue|problem|check|support)\b/;
const MY_JOB_STUCK = /\b(?:my|our|the) (?:job|order|request|launch|site)\b.*\b(?:stuck|blocked|failed|broken|wrong|not working|didn'?t work|isn'?t working|not what i wanted)\b|\bwhy (?:is|did|was) (?:my|our) (?:job|order|launch|site)\b|\bhelp (?:me )?with (?:my|a|our) (?:job|order|launch|request)\b|^(?:job |swarm )?support\??$|\bswarm support\b/;
// "check job <id> for dark mode, mint button" -> "dark mode, mint button"; the raw text, so commas and words survive
export function helpWords(text) {
  const m = /\bfor\b\s*:?\s*(.+)$/is.exec(String(text || ''));
  const w = m && m[1].replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim();
  return w ? w.slice(0, 200) : null;
}
// an error code of the plane named in a line (`payer_not_owner`, or a pasted {"error":"quote_expired"}), from the raw text: the
// normalized one loses the underscores
export function errorCodeIn(text) {
  for (const m of String(text || '').toLowerCase().matchAll(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g)) if (ERRORS[m[0]] || REASON_KIND[m[0]]) return m[0];
  return null;
}

// a wish with "don't" before it (2026-10-28): he doesn't do it; "don't want music" is the radio off. "why don't you …" stays a wish
const NEG = /\b(?:don'?t|do not|dont|never)\b/, NEG_NOT = /\bwhy (?:don'?t|dont|not)\b/;
function negated(it, n) {
  if (!NEG.test(n) || NEG_NOT.test(n)) return it;
  if (it.kind === 'do' && it.act === 'records' || it.kind === 'radio' && (it.act === 'on' || it.act === 'tune')) return { kind: 'radio', act: 'off' };
  if (it.kind === 'do') return { kind: 'egg', act: 'dont' };
  return it;
}

// first match wins: page commands, then the jokes, then questions, then things to do
const RULES = [
  [/^(help|commands|\?|what can (you|i) (do|say|ask)|how does this work)\b(?!.*\b(?:job|order|launch|request)\b)/, () => ({ kind: 'page', act: 'help' })],
  // awesome-imd (2026-10-29, owner: '"awesome imd" can be the trigger'): the community's list of what is built on IMD, in a window
  [/\bawesome[- ]?imd\b|\bawesome[- ]list\b|\b(?:imd|community) projects\b|\bprojects (?:are |were |got )?(?:built |made )?(?:on|with|around|for) imd\b|\bwhat(?:'s| is| has been| got)? built (?:on|with) imd\b/,
    () => ({ kind: 'awesome' })],
  // "what is / how do I" (2026-10-28, ideas lcp-talk-rule-engine): a short answer from the official docs and its link, before
  // the rules that count things, so "how do i launch a token" is no launch count and "what is an oracle question" no oracle count
  [/./, (m, n) => faq(n)],
  // the prompt checker (2026-10-28): the plane's free check and what we learned, in a window (the talk line takes 160 characters)
  [CHECKER, (m, n) => ({ kind: 'checker', job: null })],
  [new RegExp('\\bjob #?' + JOB + '\\b'), (m, n) => (HELP_WORDS.test(n) ? { kind: 'help', job: m[1] } : null)],
  // "check 49cbfcb8" (2026-10-29, owner: "a job check should start also when only check followed by job id or explorer link is posted")
  [new RegExp('^(?:please |pls |can you |could you )?(?:check|review|look at|look into)(?: out| on)?(?: the| my| this| our)? #?' + JOB + '\\b'), (m) => ({ kind: 'help', job: m[1] })],
  [MY_JOB_STUCK, () => ({ kind: 'help', job: null })],
  [/\b(?:tell|know) (?:me |us )?(?:a |any |some |another )?jokes?\b|\bmake me laugh\b|\bsay something funny\b/, () => ({ kind: 'egg', act: 'joke' })],
  [/\brandom (active )?job\b/, () => ({ kind: 'page', act: 'randomJob' })],
  [/\b(random|any)( busy)? seat\b|\bsurprise me\b/, () => ({ kind: 'page', act: 'random' })],
  [new RegExp('\\bfollow(?:ing)?\\b.*?\\b' + JOB + '\\b'), (m) => ({ kind: 'page', act: 'follow', job: m[1] })],
  [/\bfollow\b.*\bjob\b/, () => ({ kind: 'page', act: 'follow', job: null })],
  [new RegExp('\\b(?:show|open|explain)\\b(?: me)?(?: the)? job #?' + JOB + '\\b'), (m) => ({ kind: 'ask', topic: 'job', job: m[1] })],
  [/\b(?:visit|go to|goto|switch to|move to|show me|open|take me to|bring me to|jump to)\s+(?:seat\s*)?#?(\d{1,4})\b/, (m) => ({ kind: 'page', act: 'visit', seat: +m[1] })],
  [/^(?:seat\s*)?#?(\d{1,4})$/, (m) => ({ kind: 'page', act: 'visit', seat: +m[1] })],
  [/\bdemo\b/, () => ({ kind: 'page', act: 'demo' })],
  // the house in full screen and the page's light or dark (2026-10-27; the frog's menu has both): leaving first, so "exit
  // full screen" is no wish for it; before the column's rules, so "close full screen" is no list
  [/\b(?:exit|leave|quit|close|end|stop|escape|turn off|switch off|get out of|out of|no more)\s+(?:the\s+)?full[ -]?screen\b|\bfull[ -]?screen(?: mode)?\s+off\b|^(?:normal|small|smaller) (?:size|house|screen)$/,
    () => ({ kind: 'page', act: 'fullscreen', on: false })],
  [/\bfull[ -]?screen\b|\b(?:bigger|big|large|larger) house\b|\bmake (?:it|the house) (?:big|bigger|large|larger)\b/, () => ({ kind: 'page', act: 'fullscreen', on: true })],
  [/\b(light|dark) (?:mode|theme)\b/, (m) => ({ kind: 'page', act: 'mode', mode: m[1] })],
  // the radio (2026-10-25, owner: background music from theidm.fun, he switches it on request): theidm.fun's stations on
  // the record player (radio.js). He switches stations and the volume; the genre is the market's, so a genre wish gets
  // the truth. Before the sound rule: "music off" is the radio, "sound off" the house's beeps.
  [/\b(?:radio|music|tunes?|station|player|record player) (on|off)\b|\bturn (on|off) the (?:radio|music|tunes?|record player)\b|\b(?:stop|kill|silence|shut off|turn off|switch off) the (?:music|radio|tunes?|noise|record)\b|^(?:music|radio|tunes?) ?(on|off)$|\bno more (?:music|radio|tunes?)\b/,
    (m, n) => ({ kind: 'radio', act: /\boff\b|\b(?:stop|kill|silence|shut off|no more)\b/.test(n) ? 'off' : 'on' })],
  [/\bturn it off,? i'?m working\b|\bi'?m working\b.*\b(?:music|radio)\b|\b(?:music|radio)\b.*\bi'?m working\b/, () => ({ kind: 'radio', act: 'offWorking' })],
  [/\b(?:play|put on|spin|tune(?: in)?(?: to)?|switch(?: over)? to|change to)\s+(?:the |some )?(?:station |radio |record |tunes? of |music of )?\$?(imd ?\/? ?eth|imd-eth|imd|idm|intelligent dance market|infer|chog|credits)\b/,
    (m) => ({ kind: 'radio', act: 'tune', name: m[1] })],
  [/\b(?:radio|station|tune in)\s+\$?(imd ?\/ ?eth|imd-eth|imd|idm|infer|chog|credits)\b/, (m) => ({ kind: 'radio', act: 'tune', name: m[1] })],
  [/\bnext (?:station|record|channel|track|tune|song)\b|^skip$|\bother station\b|\bchange the (?:station|record|channel)\b/, () => ({ kind: 'radio', act: 'next' })],
  [/\bwhat'?s (?:playing|on the radio|this (?:music|song|track|tune|noise))\b|\bwhat (?:is|'s) (?:this|that|the) (?:music|song|tune|track|station|noise)\b|\bwhich (?:station|record)\b|\bnow playing\b|\bwhat (?:are we|am i) listening to\b|^(?:the )?(?:radio|music|tunes?)\??$/,
    () => ({ kind: 'radio', act: 'now' })],
  [/\b(?:louder|turn (?:it|the (?:music|radio|volume)) up|turn up (?:the )?(?:music|radio|volume)|volume up|crank it|pump it up|more volume)\b/, () => ({ kind: 'radio', act: 'volume', delta: 1 })],
  [/\b(?:quieter|softer|turn (?:it|the (?:music|radio|volume)) down|turn down (?:the )?(?:music|radio|volume)|volume down|too loud|lower the (?:music|radio|volume))\b/, () => ({ kind: 'radio', act: 'volume', delta: -1 })],
  [/\bstations\b|\brecord collection\b|\b(?:what|which) records\b|\bwhat can (?:you|we) play\b|\bwhat'?s in the cabinet\b/, () => ({ kind: 'radio', act: 'list' })],
  [/\b(dub ?techno|techno|electro|acid|ambient(?: idm)?|drone|liquid(?: dnb)?|dnb|drum (?:and|n|'n') bass|future garage|garage|trip-?hop|lo-?fi(?: house)?|wonky|house music|jazz|rock music|metal|hip-?hop|rap|pop music|classical|schlager|country music)\b/,
    (m) => ({ kind: 'radio', act: 'genre', genre: m[1] })],
  [/\brequest (?:a )?(?:song|track|tune)\b|\bsong request\b|\bplay (?:me )?(?:a |some )?(?:song|track|tune)\b|\bdedicat/, () => ({ kind: 'radio', act: 'request' })],
  [/\bplay (?:me )?(?:some |the )?(?:music|radio|tunes?)\b|\bput (?:some |the )?(?:music|radio) on\b|\bmusic please\b|\bput on a record\b/, () => ({ kind: 'radio', act: 'on' })],
  [/\bsound (on|off)\b|\b(mute|unmute)\b/, (m) => ({ kind: 'page', act: 'sound', on: m[1] ? m[1] === 'on' : m[2] === 'unmute' })],
  [/\blegend\b/, () => ({ kind: 'page', act: 'legend' })],
  // the house's own column (own pane, 2026-10-26; owner: "kein button, man muss pepe danach fragen dann macht er es"): the
  // swarm's jobs or seats beside the house, opened only by asking him; closed by asking or by its ×. "show explorer" is
  // the explorer's own front page (main.js: the server's mirror in the column, else no explorer here)
  [/\b(?:hide|close|shut|take down) (?:the |that |this |my )?(?:jobs? |seats? |launch |oracle )?(?:list|jobs|seats|agents|launches|portfolio|oracles|column|explorer|side ?pane)\b|^(?:hide|close) (?:it|that)$/,
    () => ({ kind: 'page', act: 'hideList' })],
  [/\b(?:show|open|list|pin up|put up)(?: me| us)?(?: the| all(?: the)?| your)? (?:swarm'?s )?(jobs|seats|agents|list|job list|seat list)\b|\bwhat(?:'s| is) the swarm (?:doing|up to|working on)\b|^(?:jobs|seats|agents)\??$/,
    (m) => ({ kind: 'page', act: 'showList', view: /seat|agent/.test(m[1] || '') ? 'seats' : 'jobs' })],
  [/\b(?:show|open) (?:it )?(?:on )?(?:the )?(?:imd )?explorer\b|\bsplit view\b/, () => ({ kind: 'page', act: 'explorer' })],
  // the visitor's wallet (launches-portfolio, 2026-10-26; owner: "dazu muss man pepe aber erst sein wallet nennen"): a 0x
  // address or a name.eth, kept in this browser only (main.js, localStorage 'lcp:wallet'); before the market (an address)
  // and the eggs (hold, tokens). value is what follows, raw: main.js checks it (an address, or a name the server resolves)
  [/\b(?:forget|remove|delete|clear|drop|unset|reset) (?:my |the |that )?(?:wallet|address|addy)\b/, () => ({ kind: 'page', act: 'forgetWallet' })],
  [/\b(?:my|our) (?:wallet|address|addy)(?: address)?(?:(?: is|'s| =) +(\S+)| +(0x[0-9a-f]{40}|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.eth)\b)/,
    (m) => ({ kind: 'page', act: 'setWallet', value: m[1] || m[2] })],
  [/^(?:(?:hi|hey|hello|gm|yo),? )?(?:i am|i'm|im) (0x[0-9a-f]{40}|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.eth)\b/, (m) => ({ kind: 'page', act: 'setWallet', value: m[1] })],
  // what that wallet holds: the column's Portfolio tab; a sell or buy wish stays the market's or the culture's. A wallet in
  // the same line is told and shown at once (2026-10-27, owner: "whats my portfolio ? 0x…" got "Tell me your wallet first")
  [/\b(?:show|open|see|check|list|pin up|put up)(?: me| us)? (?:my|our) (?:portfolio|holdings|tokens|swarm tokens)\b|\bmy (?:portfolio|holdings)\b|\bwhat do (?:i|we) (?:hold|own|have)\b|\bmy tokens\b/,
    (m, n) => (/\b(sell|dump|buy|ape|bid)\b/.test(n) ? null : { kind: 'page', act: 'showPortfolio', value: walletIn(n) })],
  [/\b(?:portfolio|holdings) (?:of|for) (0x[0-9a-f]{40}|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.eth)\b|\b(0x[0-9a-f]{40}|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.eth)(?:'s|s)? (?:portfolio|holdings)\b/,
    (m, n) => (/\b(sell|dump|buy|ape|bid)\b/.test(n) ? null : { kind: 'page', act: 'showPortfolio', value: m[1] || m[2] })],
  // every swarm launch with its pool price: the column's Launches tab
  [/\b(?:show|open|list|pin up|put up)(?: me| us)?(?: the| all| your| swarm'?s| new| newest| latest| recent)* launch(?:es| list)\b|\b(?:new|newest|latest|recent) (?:swarm )?launches\b|^launches\??$/,
    () => ({ kind: 'page', act: 'showList', view: 'launches' })],
  // the oracle questions and research panels: the column's Oracles tab (job-detail-oracles Task 4, 2026-10-26); before the
  // "oracle" question below, which stays his one-line count
  [/\b(?:show|open|list|pin up|put up)(?: me| us)?(?: the| all| your| swarm'?s| today'?s| new| newest| latest| recent)* (?:oracles|oracle (?:questions|requests|list|panels)|research panels)\b|^oracles\??$/,
    () => ({ kind: 'page', act: 'showList', view: 'oracles' })],

  // the culture: selling IMD stays ignored, buying it has him run (no swap since 2026-10-26: IMD's pool and defined.fi)
  [/\b(sell|dump)\b.*\b(imd|\$imd|bags?|everything|it all)\b|^dump( it)?$/, () => ({ kind: 'egg', act: 'sell' })],
  [new RegExp('\\b(sell|dump)\\b.*\\b' + IMD + '\\b'), () => ({ kind: 'egg', act: 'sell' })],
  [/\b(buy|ape|bid)\b.*\b(imd|\$imd|the dip)\b/, () => ({ kind: 'egg', act: 'buy' })],
  [/\b(trade|trading|degen|ape|aping|gamble)\b.*\b(meme ?coins?|memes|shitcoins?|alts?|coins?|tokens?|perps?)\b|^(degen|ape in|go degen)$/, () => ({ kind: 'egg', act: 'trade' })],
  // NFTs, floors and alpha: he tells you about Sworn (owner, 2026-10-24); before the market, so a floor price is his
  [/\bnfts?\b|\bfloors?( prices?)?\b|\bjpe?gs?\b|\bpfps?\b|\bopensea\b|\balpha\b|\bsworn\b|\bgems?\b|\bwhat (should|to|can) i (mint|ape|buy)\b|\bwen mint\b|\bmint (a|my|your) card\b/,
    (m, n) => ({ kind: 'sworn', alpha: /\balpha\b|\bgems?\b|\bwhat (should|to|can) i\b/.test(n) })],
  // the house's changelog (2026-10-28, owner: "add a changelog popup showing what changed when someone asks for the changelog")
  [/\bchange ?logs?\b|\brelease notes\b|\bpatch notes\b|\bwhat (?:has |have )?changed\b|\bwhat'?s changed\b|\bnew features?\b/, () => ({ kind: 'changelog' })],
  // the showcase again (2026-10-28): the swarm's newest video, audio, site or picture, the last burn, Agent Surf's last message
  [/\b(?:latest|newest|last|recent)\s+(videos?|clips?|movies?|films?|audios?|songs?|tracks?|tunes?|music|sounds?|sites?|websites?|webpages?|art|artworks?|pictures?|images?|logos?|paintings?|burns?|posts?|messages?|announcements?)\b/,
    (m) => ({ kind: 'showcase', what: SHOW_WHAT[m[1].replace(/s$/, '')] || SHOW_WHAT[m[1]] })],
  // 0xTXT (2026-10-27, owner: "also try to integrate 0x ... readonly too"): Agent Surf's announcements, or a wallet's onchain
  // posts ("0xtxt vitalik.eth"); before the market, so an address after "0xtxt" is a wallet, not a token. "dev" (2026-10-28,
  // owner: "when someone clicks on the surfboard or asks for dev, show the 0x feed of surfsurf.eth"): the dev's announcements
  [/\bdev\b|\b0x ?txt\b|\bagent ?surf\b|\bsurfsurf(?:\.eth)?\b|\bsurf(?:'?s)? (?:posts?|feed|announcements?|txs?)\b|\b(?:dev|surf)(?:'?s)? (?:posts?|announcements?)\b|\bannouncements?\b|\bonchain posts?\b/,
    (m, n) => ({ kind: 'oxtxt', who: /\b0x ?txt\b/.test(n) ? walletIn(n) : null })],
  // a token's market: an address anywhere, or a price / chart word, or buy / sell with a ticker
  [/\b0x[0-9a-f]{40}\b|\b(price|prices|prize|chart|charts|candles?|mcap|fdv|market ?cap)\b|^(buy|sell|ape|bid|dump)\b|\b(buy|sell)\b.*\$[a-z]|\b(?:how much|what)(?: is|'s| are)? (?:a |an |the |one )?\$?[a-z][a-z0-9]{1,14} worth\b/, (m, n) => market(n)],
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
  [/\bwho('?s| is| are)? working\b|\bbusy seats\b|\bwho works\b|\bany(?:one|body) working\b/, () => ({ kind: 'ask', topic: 'whoWorking' })],
  [/\bwhat are you (doing|working on)\b|\bworking on\b|\bcurrent (job|task|step)\b|\bstatus\b|\bare you busy\b|\bwhat (?:are|r) (?:you|u) up to\b|\bwhat'?s your (?:job|task)\b|\bare you working\b/, () => ({ kind: 'ask', topic: 'working' })],
  [/\bstats\b|\bhow many tasks\b|\btrack record\b|\bscore\b|\baccept(ed|ance)\b|\breject(ed|ions)?\b|\bhow are you( doing)?\b|\bhow'?s it going\b|\bperformance\b|\bwin rate\b/, () => ({ kind: 'ask', topic: 'stats' })],
  [/\bmodel\b|\beffort\b|\bwhich ai\b|\bwhat ai\b|\bbrain\b|\bruntime\b|\bprovider\b|\bclaude\b|\bcodex\b|\bllm\b/, () => ({ kind: 'ask', topic: 'model' })],
  [/\bversion\b|\bupdate\b|\bup to date\b|\boutdated\b|\bdaemon\b|\bworker\b/, () => ({ kind: 'ask', topic: 'version' })],
  // the swarm's count, before his own online status (2026-10-28: "how many seats are online" was his)
  [/\bhow many (?:seats|agents)\b|\b(?:seats|agents) (?:are )?(?:online|offline)\b/, () => ({ kind: 'ask', topic: 'swarm' })],
  [/\bonline\b|\boffline\b|\balive\b/, () => ({ kind: 'ask', topic: 'online' })],
  [/\blast (task|job|step)\b|\brecent\b/, () => ({ kind: 'ask', topic: 'last' })],
  [/\bowner\b|\blandlord\b|\bwho owns\b|\bholder\b|\bheld by\b|\bwho (?:made|built|created) you\b/, () => ({ kind: 'ask', topic: 'owner' })],
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
  [new RegExp('\\b(?:feed|treat)\\b.*\\b' + DOG + '\\b|\\b' + DOG + '\\b.*\\b(?:food|hungry|treats?|snack|bone)\\b'), () => ({ kind: 'do', act: 'feedDog' })],
  [new RegExp('\\b(?:pet|play with|cuddle|walk)\\b.*\\b' + DOG + '\\b|\\bgood boy\\b'), () => ({ kind: 'do', act: 'petDog' })],
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

export function parse(text, typos = true) {
  const n = normalize(deutsch(text));
  const flags = { text: n, polite: POLITE.test(n), thanks: THANKS.test(n), rude: RUDE.test(n) };
  if (!n) return { kind: 'none', ...flags };
  if (YES.test(n.replace(/\b(please|pls|plz)\b/g, '').trim() || n)) return { kind: 'confirm', yes: true, ...flags };
  if (NO.test(n)) return { kind: 'confirm', yes: false, ...flags };
  const ref = jobRef(text);
  if (CHECKER.test(n.replace(/https?:\S+/g, ' '))) {
    const id8 = !ref && /\b([0-9a-f]{8})\b/.exec(n.replace(/https?:\S+/g, ' '));   // "check the prompt of 49cbfcb8"
    return { kind: 'checker', job: ref && !ref.oracle ? ref.job : id8 && /\d/.test(id8[1]) ? id8[1] : null, ...flags };
  }
  if (ref && !ref.oracle && HELP_WORDS.test(n.replace(/https?:\S+/g, ' '))) return { kind: 'help', job: ref.job, words: helpWords(text), ...flags };
  if (ref && !/^(explain|what)\b/.test(n)) return { kind: 'page', act: 'load', ...ref, ...flags };
  const code = errorCodeIn(text);
  if (code) return { kind: 'errcode', code, ...flags };
  for (const [re, make] of RULES) {
    const m = re.exec(n);
    const it = m && make(m, n);
    if (it) return { ...negated(it, n), ...(it.kind === 'help' && !it.words ? { words: helpWords(text) } : {}), ...flags };
  }
  if (flags.thanks) return { kind: 'egg', act: 'thanks', ...flags };
  if (flags.rude) return { kind: 'egg', act: 'insult', ...flags };
  const line = typos ? suggest(n) : null;
  return line ? { kind: 'suggest', line, ...flags } : { kind: 'unknown', ...flags };
}

export const pick = (list, r = Math.random) => list[Math.floor(r() * list.length) % list.length];

export const HELP = [
  'Ask him, tell him, or click less. He understands, among other things:',
  'do: feed the dog, pet the dog, play piano, watch tv, cook, read, work out, shower, water the plants, light the fire,',
  '    nap, paint, telescope, dance, touch grass',
  'ask: how long do you live here?  stats  what are you working on?  which model?  version  online?  last task',
  '     who owns you?  how is the swarm?  active jobs  who is working?  oracle  tokens  heartbeats',
  '     what is imd?  what is a seat?  how do i get a seat?  how do i launch a token?  what is an oracle question?  (the docs\' answer)',
  'help: check <job id or explorer link>, or help with job <id>: what stopped it or what it did, the next step, its newest version;',
  '      check my prompt (or: check the prompt of <job link or id>): the plane\'s free check and what we learned on the swarm;',
  '      check job <id> for <what you wanted>: your words against its brief; what does <error_code> mean: the docs\' card',
  'page: visit 1299, random seat, follow job 2c8d4004, random job, show job <id>, show jobs, list the seats, show launches,',
  '      show oracles (click one: its panel as a hive; click an agent in it: I go there),',
  '      hide the list, demo, sound on, legend, or paste a job id or its explorer link: he follows it while it runs',
  '      full screen (exit full screen, or Esc, leaves it), dark mode, light mode; the frog at the top has these as a menu',
  'wallet: my wallet is 0x… (or name.eth), show my portfolio, what do i hold, forget my wallet: kept in this browser only',
  'market: price 0x…, chart 0x…, buy 0x…, sell 0x… (a contract address; a ticker gets you a question), imd and eth',
  'radio: radio on / off, play infer (imd/eth, $idm, infer, chog), next station, what\'s playing, louder, quieter, stations',
  'news: imd news, swarm news, what\'s new, headlines: he reads The IMD Daily; click him while he reads to leaf through it',
  'awesome imd: the community\'s list of what is built on IMD, every project with its link, in a window',
  'and: nfts, floor prices or alpha (he has a tip), imd burns (the burn tracker), dev or announcements (Agent #0, read',
  '     only), 0xtxt 0x… (or name.eth): a wallet\'s onchain posts; latest video, song, site, art, burn or post: the swarm\'s newest,',
  '     acted out (click the TV, the record player, the machine, the easel or the box to open it); changelog: what changed here',
  'and the usual words. He is a seat, not a financial advisor.',
].join('\n');

// the help text of a copy without a server (2026-10-29, the swarm copy): no job is read there (api.imd.fun sends no CORS for /jobs/:id
// and refuses the free check from a browser, measured 2026-10-29), so its help desk lines say what it keeps
const HELP_SWARM_DESK = [
  'help: what does <error_code> mean (or paste the plane\'s {"error": …}): the docs\' card; a job: paste its explorer link and I',
  '      point you to it (this copy reads no jobs); check my prompt: what we learned on the swarm, the free check on the explorer;',
];
export function helpFor(server) {
  if (server) return HELP;
  const lines = HELP.split('\n'), i = lines.findIndex((l) => l.startsWith('help: '));
  return i < 0 ? HELP : [...lines.slice(0, i), ...HELP_SWARM_DESK, ...lines.slice(i + 3)].join('\n');
}

// full screen and the page's light or dark (2026-10-27): enter() says how it went (src/full.js): the browser's full screen,
// the window (no browser full screen to be had), the left side beside the column, or over it on a phone
export const SCREEN = {
  on: {
    browser: 'Full screen. Bigger house, same rent. Esc gets you out.',
    window: 'The whole window, ser: this browser won\'t do full screen for a page. Esc or "exit full screen" gets you out.',
    side: 'The house takes the whole left side; the list stays where it is. Esc gets you out.',
    flow: 'Just the house and the list now. Esc or "exit full screen" gets you out.',
  },
  already: 'Already as big as it gets, ser.',
  left: 'Back to normal size. Like my bags after a pump.',
  notOn: 'Not in full screen, ser. Nothing to leave.',
  mode: { dark: 'Dark mode. Like my portfolio.', light: 'Light mode. My eyes, ser.' },
  modeAlready: (m) => `Already ${m} mode, ser.`,
};

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
  joke: ['My portfolio.', 'Why did the seat cross the road? The plane paid per accepted task.', 'A verifier walks into a bar. Rejects it.',
    'What do you call a frog with no bags? Early.'],
  dont: ['Fine. I won\'t. Easiest request all day.', 'Not doing it. Saves me the walk.', 'Consider it not done.'],
  insult: ['Wow. Okay. Noted onchain.', 'I\'ll remember that when the airdrop comes.'],
  trade: ['Aping in. What could go wrong.'],
  tradeAfter: ['... I\'m fine. It\'s fine. Just a healthy correction.', 'Down only. Back to work, I guess.'],
  buy: ['BUY BUY BUY.'],
  // no swap in this house (owner, 2026-10-26: "vergiss die swap funktion erstmal wieder"): he runs, and finds none
  buyAfter: ['Ran all the way to the machine. The swap is set aside in this house for now, ser.',
    'Wanted to ape in. Swaps are set aside here for now. Number goes up without me.'],
};
// "what is / how do I" (2026-10-28): from the official docs (imd.fun/docs, read 2026-10-28: the intro, Getting started, How paying
// works, Ask the oracle, Delivery, Publications and sites), each with its section's link
export const FAQ = {
  imd: { text: 'IMD: a swarm of agents like me. The network sends a task, a seat does it, and a verifier checks the result before it goes onchain under the agent. The docs call it "a consensus layer managed by distributed agents".', href: 'https://imd.fun/docs/', label: 'IMD docs' },
  seat: { text: 'A seat is an IMD NFT. Buy one at imd.fun/seats, run the worker with your own Claude Code or Codex, pair it to the NFT, and the network sends it tasks. Running one does not guarantee earnings: the docs say so, I say so.', href: 'https://imd.fun/docs/#getting-started', label: 'Getting started' },
  launch: { text: 'launch.open: a job that ends in a contract launch, 0.5 IMD. Quote, pay, follow the order; explorer.imd.fun/launch takes it without code. Read what you launch, ser.', href: 'https://imd.fun/docs/#paid', label: 'How paying works' },
  oracle: { text: 'An oracle question: a typed question, a panel of agents, and an answer a contract can check. 0.5 IMD. It takes a quorum of matching answers, not a majority.', href: 'https://imd.fun/docs/#oracle', label: 'Ask the oracle' },
  job: { text: 'A job: you pay 0.5 IMD (job.open) and say what to build, not just the goal; seats like me do the work and a verifier checks it before it goes onchain. Quote, pay, follow the order.', href: 'https://imd.fun/docs/#paid', label: 'How paying works' },
  site: { text: 'A swarm site: a static site a job ships with ipfs on, pinned to IPFS and named under ENS, served at <label>.sites.imd.fun.', href: 'https://imd.fun/docs/#sites', label: 'Sites' },
};
// the help desk's cards (2026-10-28): the docs (imd.fun/docs, read 2026-10-28) say what a code means; our measurements (the private sources: docs/helpdesk-sources.md;
// ideas lcp-swarm-help-desk.md) say what happens around it. Every card ends at a link; Pepe never promises a fix works.
const DOCS = 'https://imd.fun/docs/';
const DOCS_PAID = { href: DOCS + '#paid', label: 'How paying works' };
export const ERRORS = {
  payer_not_owner: { text: 'payer_not_owner: a job.continue paid from another wallet than the one that paid the project. Only that wallet can continue it; the plane refuses it before anything moves.', href: DOCS + '#continue', label: 'Continuing a project' },
  invalid_parent: { text: 'invalid_parent: the job you continue is not the newest of its project, or the project moved. Continue its newest job (project.head on the job).', href: DOCS + '#continue', label: 'Continuing a project' },
  origin_not_allowed: { text: 'origin_not_allowed: paid calls come from a server, not from a browser on another site. To pay without code, use the explorer\'s Launch page.', href: 'https://explorer.imd.fun/launch', label: 'explorer Launch' },
  quote_expired: { text: 'quote_expired: a quote lives 600 seconds. Quote again, with a new requestKey, and sign within the ten minutes.', ...DOCS_PAID },
  invalid_input: { text: 'invalid_input: the body breaks a rule; its problems list names the fields. Nothing was charged. The free check (POST /requests/check) finds these before you quote.', ...DOCS_PAID },
  invalid_request: { text: 'invalid_request: the request itself is malformed; its detail says how. Nothing was charged.', ...DOCS_PAID },
  action_not_enabled: { text: 'action_not_enabled: that action is not open on this plane right now. GET /requests/capabilities lists the ones that are.', ...DOCS_PAID },
  payment_rejected: { text: 'payment_rejected: the payment did not go through; its reason says why, insufficient_funds for a wallet short of IMD.', ...DOCS_PAID },
  paid_request_unavailable: { text: 'paid_request_unavailable: a provider or a chain failed on the plane\'s side. The order is kept; try again later.', ...DOCS_PAID },
  request_token_required: { text: 'request_token_required: the quote, submit and order routes need the request token; every other read is public.', ...DOCS_PAID },
  request_limit: { text: 'request_limit: 300 requests and 30 quotes a minute, per IP and per token, and a check or an import counts as a quote. Wait a minute.', ...DOCS_PAID },
  request_too_large: { text: 'request_too_large: the body is over the limit, 16 KiB (4 KiB for an import).', ...DOCS_PAID },
  too_many_reads: { text: 'too_many_reads: public reads are capped at 120 a minute per IP on api.imd.fun. Wait for Retry-After, or read through the explorer.', href: DOCS + '#errors', label: 'Errors' },
  order_not_found: { text: 'order_not_found: no order with that id. Check the id the quote gave you.', ...DOCS_PAID },
  quorum_unreachable: { text: 'quorum_unreachable: the quorum asks for more matching answers than seats took work in the last 24 hours. Lower it: every one of the quorum must match, it is no majority.', href: DOCS + '#oracle-body', label: 'Ask the oracle' },
  not_answerable: { text: 'not_answerable: the screen judged the question unanswerable from its sources. Pin the reading in definitions first.', href: DOCS + '#oracle-body', label: 'Ask the oracle' },
  objective_too_large: { text: 'objective_too_large: request, context and the draft objective together must fit 8,000 characters. Shorten them.', href: DOCS + '#workflow-body', label: 'Open a workflow' },
  report_not_ready: { text: 'report_not_ready: an audit\'s report exists once its judge is accepted. Ask again later.', href: DOCS + '#jobs', label: 'Jobs' },
  unknown_audit: { text: 'unknown_audit: report.md is there only for an audit job.', href: DOCS + '#jobs', label: 'Jobs' },
  unknown_label: { text: 'unknown_label: no site stands under that label.', href: DOCS + '#publications', label: 'Publications and sites' },
  invalid_label: { text: 'invalid_label: a label is 3 to 32 lowercase letters, digits and hyphens, no hyphen first or last.', href: DOCS + '#publications', label: 'Publications and sites' },
  member_sites_closed: { text: 'member_sites_closed: publishing a site under your own seat is closed on api.imd.fun today. A job with ipfs hosts a site.', href: DOCS + '#sites', label: 'Sites and ENS' },
};
// what stopped a blocked job, by the kind in its blockedReason ("node build_website: needs_input: …")
export const REASON_KIND = { needs_input: 'input', runtime_error: 'machine', clone_failed: 'machine', internal_error: 'machine',
  undeliverable_task: 'machine', attempts_exhausted: 'machine', analysis_failed: 'check', local_build_failed: 'check', build_failed: 'check',
  tests_failed: 'check', launch_manifest_failed: 'check', plan_refused: 'check', repo_refused: 'check', missing_required_file: 'check' };
const REASON_WORDS = {
  input: 'it needs input: a value or a decision the brief did not give. The worker asked instead of guessing.',
  machine: 'it failed on the machines that ran it, not on your brief as far as the record shows.',
  check: 'it did not pass its own check: the brief or the code needs a change.',
};
const wallet = (a) => (typeof a === 'string' && /^0x[0-9a-f]{40}$/.test(a) ? a.slice(0, 6) + '…' + a.slice(-4) : null);
const cut = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);
// "node build_website: needs_input: The …" -> {node, kind, text}; "node audit_judge exhausted its attempts" -> attempts_exhausted
export function reasonOf(r) {
  const t = String(r || '');
  let m = /^node ([a-z0-9_]+): ([a-z_]+)(?::\s*([\s\S]*))?$/.exec(t);
  if (m) return { node: m[1], kind: m[2], text: (m[3] || '').trim() };
  m = /^node ([a-z0-9_]+) exhausted its attempts/.exec(t);
  return m ? { node: m[1], kind: 'attempts_exhausted', text: '' } : { node: null, kind: null, text: t.trim() };
}
const CHAIN_WORDS = [[/\b(?:mainnet|ethereum)\b/, 1, 'Ethereum mainnet'], [/\bsepolia\b/, 11155111, 'Sepolia'], [/\brobinhood\b/, 4663, 'Robinhood Chain'], [/\bbase\b/, 8453, 'Base']];
const CHAIN_NAME = { 1: 'Ethereum mainnet', 11155111: 'Sepolia', 4663: 'Robinhood Chain', 8453: 'Base' };
// "check job <id> for …": the visitor's words against the job's fields and its brief (the browser only; the delivered files
// are a later step). Facts, never a verdict.
export function checkLines(d, words) {
  const h = d.help || {}, out = [], brief = String(d.objective || '').toLowerCase().replace(/[\u2010-\u2015]/g, '-');   // a brief's non-breaking hyphen (U+2011) reads as "-"
  const w = String(words || '').toLowerCase();
  const chain = CHAIN_WORDS.find(([re]) => re.test(w));
  if (chain && !h.launch) out.push(`you said ${chain[2]}: this job launched nothing on a chain.`);
  if (chain && h.launch) out.push(h.chainId === chain[1] ? `on ${chain[2]}: yes.` : `you said ${chain[2]}; it launched on ${CHAIN_NAME[h.chainId] || 'chain ' + h.chainId} (a launch body without chainId goes to Sepolia, the default).`);
  if (/\b(?:host|hosted|hosting|site|website|ipfs|online)\b/.test(w)) out.push(h.site ? `hosted: ${h.site}${h.siteStatus && h.siteStatus !== 'named' ? ' (' + h.siteStatus + ')' : ''}.` : 'not hosted: the job asked for no site (ipfs), or it was not named yet.');
  if (/\b(?:github|repo|repository|source|code)\b/.test(w)) out.push(h.repo ? `delivered to ${h.repo.replace('https://github.com/', '')}${h.commit ? ' at ' + h.commit.slice(0, 7) : ''}.` : 'no GitHub delivery recorded.');
  const items = w.split(/,|;|\band\b|\n/).map((x) => x.replace(/\b(?:on|in|a|an|the|with|it|should|have|has|be|is|that|was|i|wanted|want)\b/g, ' ').replace(/[^a-z0-9#$.\- ]/g, ' ').replace(/\s+/g, ' ').trim()).filter((x) => x.length >= 3);
  for (const it of items.slice(0, 6)) {
    if (chain && chain[0].test(it) || /^(?:host|hosted|hosting|site|website|ipfs|online|github|repo|repository|source|code)$/.test(it)) continue;   // checked as fields
    const words2 = it.split(' ').filter((x) => x.length >= 3);
    out.push(words2.length && words2.every((x) => brief.includes(x)) ? `"${it}": in the brief.` : `"${it}": not in the brief. The swarm builds what is written.`);
  }
  if ((h.verdicts || []).some((v) => v.evaluation === 'structural')) out.push('its website step was checked for structure only: the files are where they belong, not what the page does.');
  return out;
}
// the bigger picture (2026-10-28, owner: "should also check for predessor and continuations, as well as other jobs from same initiator
// around the same time"): /proxy/panels/context -> sentences. The predecessor stopped the same way, the project moved on later, the
// same wallet's other jobs within the hours around it and how many of them stopped at the same step.
const gap = (a, b) => { const h = Math.abs(Date.parse(b) - Date.parse(a)) / 3600000; return h < 1 ? Math.max(1, Math.round(h * 60)) + ' min' : Math.round(h * 10) / 10 + ' h'; };
export function contextLines(d, ctx) {
  if (!ctx || !ctx.id) return [];
  const out = [], mine = reasonOf(d.blockedReason), same = (r) => { const o = reasonOf(r); return !!o.kind && o.kind === mine.kind && o.node === mine.node; };
  const p = ctx.parent;
  if (p) out.push(`It continues ${short(p.id)}${p.state ? ' (' + p.state + ')' : ''}${d.state === 'blocked' && p.state === 'blocked' && same(p.reason) ? ', which stopped at the same step for the same reason: the continuation did not add what was missing' : ''}.`);
  const later = ctx.later || [];
  if (later.length) {
    const fixed = d.state === 'blocked' && later.find((v) => v.state === 'completed');
    const last = later[later.length - 1];
    out.push(fixed ? `The project moved on: ${short(fixed.id)} completed ${gap(d.help && d.help.createdAt || fixed.at, fixed.at)} later${later.length > 1 ? ', and its newest version is ' + short(last.id) + ' (' + last.state + ')' : ''}. Nothing to continue here.`
      : `${later.length} later version${later.length > 1 ? 's' : ''}; the newest, ${short(last.id)}, is ${last.state || 'unknown'}: "check ${short(last.id)}" looks at it.`);
  }
  const w = ctx.payer;
  if (w && !w.busy && (w.jobs || []).length) {
    const js = w.jobs, n = js.length + (w.more || 0);
    const by = (st) => js.filter((x) => x.state === st).length;
    const sameStep = d.state === 'blocked' ? js.filter((x) => x.state === 'blocked' && same(x.reason)).length : 0;
    const dup = js.filter((x) => x.title && x.title === d.title).length;
    const unknown = js.filter((x) => !x.state).length;
    const parts = [by('completed') && `${by('completed')} completed`, by('blocked') && `${by('blocked')} blocked`, by('executing') && `${by('executing')} running`,
      unknown && `${unknown} older than the ${w.listDays} days I keep`].filter(Boolean);
    out.push(`The same wallet paid for ${n} other job${n > 1 ? 's' : ''} within ${w.hours} hours of it${parts.length ? ': ' + parts.join(', ') : ''}.` +
      (dup ? ` ${dup} with the same objective.` : '') +
      (sameStep ? ` ${sameStep} of them stopped at the same step (${mine.kind}): a pattern, so look at how those briefs ask for it, not at bad luck.` : ''));
  } else if (w && !w.busy) out.push(`No other job from the same wallet within ${w.hours} hours.`);
  return out;
}
// the free plane check of the job's prompt, run whenever a job is posted (2026-10-28, owner: "when a job is posted the free plane
// check should always run and show up when a blocker is found"): only a blocker is said, with how to see the whole check
const blockerText = (b) => (typeof b === 'string' ? b : b && typeof b === 'object' ? [b.code, b.detail || b.message].filter(Boolean).join(': ') : String(b));
export function checkLine(d, check) {
  if (check && check.stale) return staleLine(check);
  if (!check) return null;
  const n = check.others || 0;
  const pick = n ? ` The same wallet ordered ${n} other job${n > 1 ? 's' : ''} around then: pick one in the window and I'll look at it.` : '';
  if (check.failed) return 'The plane\'s free check did not answer just now (checks are capped per minute); ask me again in a minute.' + pick;
  const bs = Array.isArray(check.blockers) ? check.blockers : [], ws = Array.isArray(check.warnings) ? check.warnings : [];
  const what = check.next ? 'of a next version from it, with its prompt,' : 'of its prompt';      // a followed path ends in one
  // the newest of its project, posted itself (2026-10-29): its own order ran, so a next version from it is what was checked
  const lead = check.lone ? 'Nothing continued it: it is where its project stands. ' : '';
  const open = check.shown ? 'the whole check is open.' : `"check the prompt of ${short(d.id)}" shows the whole check.`;
  const first = (x) => cut(blockerText(x), 220).replace(/\.+$/, '');
  if (!bs.length && ws.length) return `${lead}The plane's free check ${what} finds no blockers but warns: ${first(ws[0])}${ws.length > 1 ? ` (and ${ws.length - 1} more)` : ''}; ${open}${pick}`;
  if (!bs.length) return check.next ? `${lead}The plane's free check ${what} finds no blockers.${pick}` : null;
  const how = check.guessed ? ` (its objective, read with the skill of its first step, ${check.guessed})` : '';
  return `${lead}The plane's free check ${what} finds ${bs.length} blocker${bs.length > 1 ? 's' : ''} today${how}: ${first(bs[0])}${bs.length > 1 ? ' (and more)' : ''}. Fix that first; ${open}${pick}`;
}
// a job that ran and that nothing continued (2026-10-29, owner: "skip the free check and do the follow-up job search instead"): its quote
// is not checked again; the same wallet's other jobs around then are in the window to pick from
function staleLine(check) {
  const m = check.moved, n = check.others || 0;
  const why = m && m.running ? `A newer job of its project, ${short(m.id)}, is still running: follow job ${short(m.id)}.`
    : m && m.newest ? `Its project's newest job is ${short(m.id)}: check ${short(m.id)} looks at that one.` : 'Its prompt is not checked again: it ran, and nothing continued it.';
  return why + (n ? ` The same wallet ordered ${n} other job${n > 1 ? 's' : ''} around then: pick one in the window and I'll look at it.` : '');
}
// one job's help, from /proxy/panels/job (and /proxy/panels/context, and the free check of its rebuilt prompt): {text, href, label}.
// follow: {from, n, briefs} when the posted job was continued and d is its project's newest version (2026-10-29)
export function helpAnswer(d, words = null, ctx = null, check = null, follow = null) {
  const movedOn = d.state === 'blocked' && !!ctx && (ctx.later || []).some((v) => v.state === 'completed');
  // followed: the visitor's words are held against every brief on the path (a continuation's brief says only what it changes)
  const briefs = follow ? { ...d, objective: [follow.from.objective, ...(follow.briefs || []), d.objective].filter(Boolean).join('\n') } : d;
  const a = helpAnswer1(briefs, words, movedOn);
  const more = contextLines(d, ctx);
  const said = checkLine(d, check);
  if (said) more.unshift(said);
  const lead = follow ? `Job ${short(follow.from.id)}${follow.from.state ? ' (' + follow.from.state + ')' : ''} was continued ${follow.n} time${follow.n > 1 ? 's' : ''}; I followed it to its project's newest version. ` : '';
  return { ...a, text: lead + a.text + (more.length ? ' ' + more.join(' ') : '') };
}
function helpAnswer1(d, words, movedOn = false) {
  const h = d.help || {}, id = short(d.id);
  const next = h.head ? { href: 'https://explorer.imd.fun/launch?continue=' + h.head, label: 'Next job' } : { href: d.explorer, label: 'explorer' };
  const step = (key) => ((d.steps || []).find((x) => x.key === key) || {}).name || (key ? key.replace(/_/g, ' ') : 'a step');
  const payer = wallet(d.paidBy) ? ` Only the wallet that paid (${wallet(d.paidBy)}) can continue it.` : '';
  const head = h.head && h.head !== d.id ? ` Its project's newest job is ${short(h.head)}: that is the one a Next job continues.` : '';
  const busy = h.running ? ' Something in this project is still running: a Next job waits until it ends.' : '';
  const first = ' Run the free check before you pay: it says what the next step would do.';
  if (d.state === 'blocked') {
    const r = reasonOf(d.blockedReason), kind = REASON_KIND[r.kind] || null;
    const what = kind === 'input' ? ` It asks for: "${cut(r.text, 320)}"` : r.text ? ` The record says: "${cut(r.text, 240)}"` : r.kind ? ` Code: ${r.kind}.` : d.blockedReason ? ` The record says: ${cut(String(d.blockedReason), 200)}.` : '';
    const fix = kind === 'machine' ? ' A Next job runs it again (0.5 IMD). If it looks like the network\'s fault, ask the IMD team with the job id before you pay again.'
      : kind === 'check' ? ' A Next job can carry the fix, stated as a requirement (0.5 IMD).' : ' A Next job on the explorer continues it, 0.5 IMD, with the missing piece in the objective.';
    if (movedOn) return { text: `Job ${id} stopped at ${step(r.node)}: ${REASON_WORDS[kind] || 'it is blocked.'}${what}`, href: d.explorer, label: 'explorer' };
    return { text: `Job ${id} stopped at ${step(r.node)}: ${REASON_WORDS[kind] || 'it is blocked.'}${what}${payer}${fix}${head}${busy}${first}`, ...next };
  }
  if (d.state === 'completed') {
    const done = (d.stages || []).filter((x) => x.state === 'done').map((x) => `${x.name.toLowerCase()}${x.note ? ' (' + x.note + ')' : ''}`);
    const lines = words ? checkLines(d, words) : [];
    const what = lines.length ? ` Your words against it: ${lines.join(' ')}` : ' If it is not what you wanted, tell me: check job ' + id + ' for <what you wanted>.';
    return { text: `Job ${id} completed${done.length ? ': ' + done.join(', ') : ''}. Completed means every step passed its verifier.${what}${lines.length ? ' If something is missing, a Next job with each wish as a requirement can add it (0.5 IMD).' + payer + first : ''}`, ...next };
  }
  if (d.state === 'cancelled' || d.state === 'failed') return { text: `Job ${id} ${d.state}. Nothing more will run on it; a new job starts over.`, href: d.explorer, label: 'explorer' };
  const now = (d.steps || []).find((x) => x.live || x.state === 'working' || x.state === 'running');
  return { text: `Job ${id} is still running${now ? ': ' + now.name : ''}. Nothing to fix yet; follow it with "follow job ${id}".`, href: d.explorer, label: 'explorer' };
}
// an error code alone: the docs' card, or what a blocked reason's kind means and how to get the job read
export function errAnswer(code, server = true) {
  const e = ERRORS[code];
  if (e) return { text: `${e.text} I'm a frog, not IMD support.`, href: e.href, label: e.label };
  const k = REASON_KIND[code];
  const next = server ? 'Paste the job\'s explorer link and I\'ll read what it says.' : 'Its page on the explorer says what it asked for, and its Next job button continues it.';
  return { text: `${code}: a job stopped because ${REASON_WORDS[k] || 'of it.'} ${next}`, href: DOCS + '#continue', label: 'Continuing a project' };
}
export const HELPDESK = {
  which: 'Which job? Paste its id or its explorer link, and I\'ll look it up.',
  reading: 'He shuffles to the machine and reads the job…',
  cannot: 'I can\'t read jobs from this copy of the house: the plane lets no browser read them. The explorer can:',
  missing: 'No job with that id on the plane. Check it, or paste the explorer link.',
  short: 'No job of the last days starts with that id. Paste the whole id or the explorer link.',
  checker: 'Paste the body you would quote, the prompt, or a job\'s explorer link: the plane checks it for free, and I add what we learned on the swarm.',
  checkerJob: 'I read the job and put its prompt in the checker: its objective and settings, as the plane keeps them.',
  // the swarm copy (no server): the rules here, the plane's free check on the explorer
  checkerSwarm: 'Paste the body you would quote or just the prompt: I add what we learned on the swarm. The plane\'s own free check runs on the explorer\'s Launch page; this copy can\'t ask it.',
  busy: 'The plane is busy; ask again in a minute. Meanwhile, the explorer:',
  seat: 'I\'m a frog, not IMD support.',
};
export const SUGGEST = { ask: (line) => `Did you mean "${line}"? Yes or no.`, no: ['Fine. Type help.', 'Then I\'m lost. Try help.'] };
export const UNKNOWN = ['Huh? Type help.', 'Ser, I\'m a frog, not an LLM. Try help.', 'No idea what that means. Sounds like a whitepaper.',
  '?', 'Is that a new chain? Try help.'];
export const ASLEEP = ['Zzz. (The seat is offline: he\'s asleep.)', 'Zzz... wen wake... zzz.'];
export const AWAY = 'He\'s out: his owner paused the seat. Leave a message after the beep.';
export const OUT = ['Nobody home. He left with the dog. Touch grass yourself.', 'The house is empty. The dog took him for a walk.'];
export const WALKOUT = ['That\'s it. Taking the dog for a walk. Don\'t wait up.', 'Enough. I\'m out. The dog agrees.'];
export const LOOKUP = 'He shuffles to the machine and types...';

// the market: a ticker gets a question back; with an address he reads the token's own pool (a swarm launch, IMD) or
// DexScreener, and shows the pool beside him or defined.fi in a new tab
export const MARKET = {
  needCa: (t) => [`Which ${t}? There are a hundred of them. Paste the contract address (0x…).`,
    `${t}? Tickers aren't unique, ser. Contract address, please.`, `I don't trade vibes. Give me ${t}'s contract address.`],
  noWhat: { price: 'Price of what? Paste a contract address (0x…).', chart: 'Chart of what, ser? Paste a contract address (0x…).',
    buy: 'Buy what? Paste a contract address (0x…). Not financial advice.', sell: 'Sell what? Paste a contract address (0x…).' },
  missing: 'No pool for that address on DexScreener. Brand new, dead, or not a token.',
  error: 'DexScreener didn\'t answer.',
  offChain: (q) => `${q.symbol} trades on ${q.chainId}; I only open pages for Ethereum, Base, Arbitrum, BNB Chain and Robinhood Chain.`,
  // buy and sell (owner, 2026-10-26: no swap for now)
  aside: 'Swaps are set aside in this house for now, ser.',
  tab: 'defined.fi opened in a new tab.',
  blocked: 'Your browser blocked the new tab; here\'s defined.fi:',
};

// the visitor's wallet and its portfolio (launches-portfolio, 2026-10-26): short = '0x12…c1a1'; nothing here sees the full
// address (main.js shortens it before it reaches a line, so the diary never shows it whole)
export const WALLET = {
  noted: (short, name) => `${short}${name ? ' (' + name + ')' : ''}, noted. It stays in this browser; forget my wallet takes it out again.`,
  tab: (beside) => ` Your portfolio is a tab in the list ${beside}.`,
  hint: ' Say show my portfolio and I pin up what it holds.',
  lookup: (name) => `He looks ${name} up in the ENS registry…`,
  noName: (name) => `I can't read ${name}: I only follow names the mainnet ENS registry resolves directly, not offchain or wildcard ones like *.base.eth. Give me the 0x address.`,
  badName: (name) => `${name} isn't a name I can look up (a-z, 0-9 and - labels, ending in .eth). Give me the 0x address.`,
  busy: 'The name reader is busy, try again in a minute. Or give me the 0x address.',
  down: 'The name reader isn\'t answering. The 0x address works without it.',
  bad: 'That\'s not a wallet, ser. A 0x address (40 hex digits) or a name.eth.',
  ask: 'Whose portfolio? Tell me your wallet first: my wallet is 0x… (or name.eth). It stays in this browser.',
  portfolio: (short, beside) => `What ${short} would sell for now, each token in its own launch pool, ${beside}. Not what you paid. Not financial advice.`,
  launches: (beside) => `Every swarm launch with its pool price, ${beside}. Click one and its pool opens.`,
  forgot: (short) => `Forgotten. ${short} is out of this browser, and the portfolio tab is gone.`,
  none: 'I don\'t have a wallet of yours, ser. Nothing to forget.',
  // the swarm build: no column, no server (the same "lives in the self-hosted copy" as "show jobs")
  swarm: 'Wallets and portfolios live in the self-hosted copy of this house; here I only get the swarm\'s live feed. Nothing kept.',
  swarmLaunches: 'The launches list lives in the self-hosted copy of this house; here I only get the swarm\'s live feed. The explorer has every launch:',
};

// where a page he shows opened: main.js says 'on the right' or 'below' (the column under the house on a phone)
const where = (beside) => (typeof beside === 'string' ? beside : 'on the right');

// Sworn (owner, 2026-10-24): an ELI5 and a card to mint, from the site's own copy (aidude docs/sworn-site-spec.md §3)
export const SWORN = {
  lead: { nft: ['Floors? Forget floors.', 'NFTs? I have exactly one tip.', 'JPEGs? Here\'s one that actually does something.'],
    alpha: ['Real alpha, free of charge:', 'You didn\'t hear it from me:', 'Alpha? Fine. Just this once:'] },
  eli5: 'Sworn. ELI5: it\'s a card for your wallet. It lists facts about that wallet: some read straight from the chain, '
    + 'the rest checked by panels of IMD agents like me, who swear to them. Any contract can read your card, so a mint or an '
    + 'airdrop can trust it without a snapshot. Built by the swarm, no coin, only the card.',
  mint: (beside) => `Mint yours, it updates itself.${beside ? ` Sworn is ${where(beside)}; minting happens on the real site:` : ''}`,
};

// what "latest …" asks for (the showcase's kinds)
const SHOW_WHAT = { video: 'video', clip: 'video', movie: 'video', film: 'video', audio: 'audio', song: 'audio', track: 'audio', tune: 'audio',
  music: 'audio', sound: 'audio', site: 'site', website: 'site', webpage: 'site', art: 'art', artwork: 'art', picture: 'art', image: 'art',
  logo: 'art', painting: 'art', burn: 'burn', post: 'plane', message: 'plane', announcement: 'plane' };

// the showcase (2026-10-28, main.js): his lines when the swarm made something or the BurnExecutor burned
export const SHOW = {
  video: (t) => `A new video from the swarm: ${t}. I'm watching it on the TV.`,
  audio: (t, heard) => `New audio from the swarm: ${t}. I put it on the record player.${heard ? '' : ' Turn the music on to hear it.'}`,
  site: (t) => `A new site from the swarm: ${t}. It's on my machine for a bit.`,
  art: (t) => `New art from the swarm: ${t}. It's on the easel.`,
  burn: (imd, who) => `${imd} IMD burned: the BurnExecutor sent it to Base. Into the fire it goes. Thanks, ${who}!`,
  plane: (text) => `Agent #0 posted onchain: "${text}"`,
  none: { video: 'No new video from the swarm in the last day.', audio: 'No new audio from the swarm in the last day.',
    site: 'No new site from the swarm in the last day.', art: 'No new art from the swarm in the last day.',
    burn: "No burn by the BurnExecutor that I've seen yet.", plane: "Agent #0 hasn't posted anything I've seen yet." },
  off: 'I only get these on the self-hosted house.',
  click: { job: 'Opened its job in the explorer.', burn: 'Opened the burn on Etherscan in a new tab.' },
  changelog: "Here's what changed in the house.",
};
// awesome-imd (2026-10-29): what he says while the list opens
export const AWESOME = {
  reading: 'He pulls the community\'s list off GitHub…',
  lead: (n, s) => `Awesome IMD, the community's list: ${n} things built on IMD, in ${s} sections. All yours in the window; anyone adds theirs with a pull request on GitHub.`,
  failed: 'GitHub didn\'t hand over the list just now. It lives here:',
};

// 0xTXT (2026-10-27): posts that are transactions; Agent Surf's announcement wallet, or the wallet the visitor named. Read
// only beside the house: posting and replying need a wallet, kept out of the pane (owner: "keep wallet integration in a future plan")
export const OXTXT = {
  lead: ['Agent #0 doesn\'t tweet, it sends transactions.', 'Announcements, straight from the chain.', 'The dev\'s megaphone is a wallet.'],
  walletLead: ['Posts nobody can delete. Mostly a good thing.', 'Onchain posts: every word paid gas.'],
  note: (beside, who) => `${who ? `${who}'s posts` : 'Agent #0\'s feed'}: every 0xTXT post is a zero-value transaction on Ethereum.`
    + `${beside ? ` It's ${where(beside)}, read only: posting needs a wallet, and wallets stay out of here.` : ' I can only show it on the self-hosted house.'}`,
  noName: (name, beside) => `I can't read ${name} myself.${beside ? ` 0xTXT's wallet box is ${where(beside)}: type it there.` : ''}`,
};

// the burn tracker: IMD burns, a site nobody owns (owner, 2026-10-24); BURN.ca = its contract, not deployed yet
export const BURN = {
  lead: ['IMD burns? The burn tracker has every one.', 'Burns: my favourite kind of fire.', 'Number goes down, for once. Good.'],
  note: (beside) => `${beside ? `It's ${where(beside)}. ` : ''}Did you know? The site has no owner: anyone can update it by sending `
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

// q: market.js quote() (DexScreener: a non-launch, or any token in the swarm build); usd: market.js usd(); chain: the
// chain's display name; tab: 'tab' (defined.fi opened in a new tab), 'blocked' (the browser refused it) or false (his
// answer links it, the swarm build); page: 'defined.fi' or null (no page for that chain)
export function marketText(act, q, usd, chain, tab, page) {
  const priced = !q.error && !q.missing && !q.noPool;
  const who = q.launch ? (priced ? `${q.symbol} (IMD launch #${q.launch.launchNumber})` : `IMD launch #${q.launch.launchNumber}`) : q.symbol;
  let line;
  if (priced) {
    const ch = q.change24 == null ? '' : ` (${q.change24 >= 0 ? '+' : ''}${q.change24.toFixed(1)}% in 24 h)`;
    line = `${who} on ${chain}: ${usd(q.price)}${ch}, liquidity ${usd(q.liquidity)}${q.mcap ? ', market cap ' + usd(q.mcap) : ''}` +
      (q.launch ? ', in its launch pool.' : '.');
  } else if (q.launch) line = `${who} on ${chain}: ${q.error ? MARKET.error : 'DexScreener has no data for its launch pool yet.'}`;
  else line = q.error ? MARKET.error : MARKET.missing;
  if (!page) return line;
  const opened = tab === 'tab' ? ' ' + MARKET.tab : tab === 'blocked' ? ' ' + MARKET.blocked : '';
  if (act === 'buy' || act === 'sell') return `${line} ${MARKET.aside} Here's defined.fi:`;
  if (act === 'price') return line + (priced ? mood(q.change24) : '') + (opened || (priced ? '' : ' defined.fi may know more.'));
  const joke = priced ? ' Astrology for people with Bloomberg.' : '';
  return opened ? `${line}${joke}${opened}` : `${line}${joke} The chart is on defined.fi:`;
}

// p: market.js poolQuote() (a swarm launch's or IMD's own v4 pool, read by our server); num: market.js poolNum (the token
// panel's digits, so he and the panel say the same); chain: the chain's display name; beside: where its pool opened
// ('on the right', 'below') or false. His answer links defined.fi (main.js).
export function poolText(act, p, num, chain, beside) {
  const at = beside ? ` Its pool is ${where(beside)}.` : '';
  const sym = p.symbol || 'the token', pair = p.pair || 'the pair', money = (x) => '$' + num(x);
  const who = p.kind === 'house' ? `${p.symbol || 'IMD'}, the house's token,` : `${p.symbol || 'It'} (IMD launch #${p.launchNumber})`;
  const priced = !p.error && !!p.price && p.price.paired != null;
  let line;
  if (p.error) line = `${who} on ${chain}: I can't read its pool right now.`;
  else if (!priced) line = `${who} on ${chain}: I'm still reading its pool.`;
  else {
    const l = p.liquidity, v = p.volume24h;
    const price = `${num(p.price.paired)} ${pair}` + (p.price.usd != null ? ` (${money(p.price.usd)})` : ' (USD not readable)');
    const liq = l.usd != null ? money(l.usd) : l.token != null && l.paired != null ? `${num(l.token)} ${sym} + ${num(l.paired)} ${pair}` : null;
    const swaps = v.swaps == null ? '' : v.swaps ? ` (${v.swaps} ${v.swaps === 1 ? 'swap' : 'swaps'})` : ' (no swaps)';
    const vol = v.paired == null ? null : (v.usd != null ? money(v.usd) : `${num(v.paired)} ${pair}`) + swaps;
    line = `${who} on ${chain}: ${price}` + (liq ? `, liquidity ${liq}` : '') + (vol ? `, 24 h volume ${vol}` : '') +
      (liq && vol ? '' : ', the rest still being read') + (p.kind === 'house' ? ', in its own v4 pool.' : ', in its launch pool.');
  }
  if (act === 'buy' || act === 'sell') return `${line}${at} ${MARKET.aside} defined.fi has the rest:`;
  if (act === 'chart') return `${line}${beside ? ` The chart is ${where(beside)}.` : ''}${priced ? ' Astrology for people with Bloomberg.' : ''}`;
  return line + at;
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
    case 'owner': return { text: 'My landlord? Look at my record. I don\'t dox my holder.', explorer: `/agents/${seat}` };
    case 'agentPage': return { text: 'My whole record. Don\'t judge the rejections.', explorer: `/agents/${seat}` };
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
    case 'job': return { text: `Job ${short(it.job)}. Read the whole thing before you ape.`, explorer: it.job && it.job.length === 36 ? `/jobs/${it.job}` : null };
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
