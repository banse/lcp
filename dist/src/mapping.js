// What the seat works on, and what he does for it. feed.js puts each task into one category; each theme maps the
// categories to the activities it can show. Both themes start with the owner's mapping of 2026-10-24, and either
// can change on its own.

// legend wording for each category, in the order the legend lists them
export const CATEGORIES = {
  token: 'Token launch work: any step of a launch that makes a token (custom token, v4 hook, coin)',
  website: 'Websites: building or reviewing a site or a contract\'s front end',
  other: 'Everything else: contracts-only launches, plain jobs',
  research: 'Research reports',
  video: 'Video',
  audio: 'Audio and music',
  image: 'Images and logos',
  oracle: 'Oracle questions, or a seat on an oracle panel',
  review: 'Reviews and audits: the audit specialists and judge of a launch, code reviews, site checks, design critique',
  tests: 'Tests: Foundry tests, gas and size reports',
  assemble: 'Putting it together or fixing it: a launch\'s manifest, joining steps, fixing findings, refining, deploy scripts',
  docs: 'Docs: READMEs and documentation',
  fuzz: 'Fuzz runs',
  planning: 'Planning a workflow',
  indexer: 'Data indexers (Ponder)',
};

// how the diary names a task of each category
export const CATEGORY_SAY = {
  token: 'token launch work', website: 'a website', other: 'a task', research: 'a research task',
  video: 'a video task', audio: 'an audio task', image: 'an image task', oracle: 'an oracle question',
  review: 'a review', tests: 'tests', assemble: 'assembly work', docs: 'docs', fuzz: 'a fuzz run', planning: 'planning',
  indexer: 'an indexer',
};

const OWNER_2026_10_24 = {
  token: 'computer', website: 'cook', other: 'cook', research: 'book', video: 'tv', audio: 'piano', image: 'easel',
  oracle: 'telescope',
};

// A look that has no activity for a category (the parked LCP look has none for the seven added on 2026-10-24) shows it
// like the launch the task belongs to: token launch work, or not (House.activityFor).
export const MAPPINGS = {
  pixel: { ...OWNER_2026_10_24 },
  imd: { ...OWNER_2026_10_24, review: 'magnifier', tests: 'lab', assemble: 'workbench', docs: 'typewriter', fuzz: 'pinball',
    planning: 'whiteboard', indexer: 'cabinet' },     // the owner took these proposals on 2026-10-24
};

export const ACTIVITIES = ['computer', 'cook', 'book', 'tv', 'piano', 'easel', 'telescope', 'magnifier', 'lab', 'workbench',
  'typewriter', 'pinball', 'whiteboard', 'cabinet'];

// The plaque on the tree (owner, 2026-10-26: "a small house plaque with the acceptance rate and what his expertise is,
// the jobs he does more compared to other agents"). His expertise is the category where his share of his newest tasks
// exceeds the swarm's share the most (at least two tasks of it); the swarm's share is SWARM_MIX, measured 2026-10-26
// 01:55 UTC over the 20 newest tasks of the 160 seats with the most attempts (3,200 tasks, through the local relay).
export const SWARM_MIX = { oracle: 0.562, review: 0.215, other: 0.076, assemble: 0.032, image: 0.032, website: 0.032, tests: 0.029,
  token: 0.017, research: 0.004, video: 0.002, audio: 0.002, docs: 0.002, fuzz: 0.002, planning: 0.002, indexer: 0.002 };
// the trade on the plaque (owner, 2026-10-26: not the kind of job, the profession it makes him)
export const PLAQUE_JOB = { token: 'Tokensmith', website: 'Webmaster', other: 'Handyman', research: 'Researcher', video: 'Filmmaker', audio: 'Musician',
  image: 'Illustrator', oracle: 'Seer', review: 'Auditor', tests: 'Tester', assemble: 'Mechanic', docs: 'Scribe', fuzz: 'Fuzzer',
  planning: 'Planner', indexer: 'Archivist' };
export const PLAQUE_WORD = { token: 'tokens', website: 'sites', other: 'odd jobs', research: 'research', video: 'video', audio: 'audio',
  image: 'images', oracle: 'oracles', review: 'audits', tests: 'tests', assemble: 'fixing', docs: 'docs', fuzz: 'fuzzing',
  planning: 'planning', indexer: 'indexers' };
// counts: {category: n} of his newest tasks -> {category, word, n, share, ratio} or null (fewer than two of any kind)
export function expertise(counts) {
  const total = Object.values(counts || {}).reduce((a, b) => a + b, 0);
  if (!total) return null;
  let best = null;
  for (const [k, n] of Object.entries(counts)) {
    if (n < 2) continue;
    const share = n / total, ratio = share / (SWARM_MIX[k] || 0.002);
    if (!best || ratio > best.ratio || (ratio === best.ratio && n > best.n)) best = { category: k, word: PLAQUE_WORD[k] || k, job: PLAQUE_JOB[k] || k, n, share, ratio };
  }
  return best;
}
