// The prompt checker (2026-10-28, the owner's wish: the plane's free check plus improvement proposals from what the swarm taught us).
// The visitor pastes a job body (JSON) or a plain prompt; the plane's free check answers through
// the server (selfhost/checkrelay.py: api.imd.fun lets no browser ask), and the proposals below run here, in the browser. They are
// written from what the official docs say and what was measured on the swarm; the sources stay in the private repository
// (docs/helpdesk-sources.md), none of it ships but these sentences.

export const ACTIONS = ['job.open', 'launch.open', 'job.continue', 'workflow.open', 'oracle.request'];
const DOCS = 'https://imd.fun/docs/';

// the visitor's text -> {action, input}: a whole {action, input}, a body (an object), or a plain prompt as the objective
export function parseBody(text, action) {
  const t = String(text || '').trim();
  if (t.startsWith('{')) {
    try {
      const o = JSON.parse(t);
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        if (o.input && typeof o.input === 'object' && ACTIONS.includes(o.action)) return { action: o.action, input: o.input, json: true };
        return { action, input: o, json: true };
      }
    } catch (e) { return { action, input: null, error: 'Not valid JSON: ' + e.message.replace(/^JSON\.parse: /, '') }; }
  }
  return { action, input: action === 'oracle.request' ? { question: t } : { objective: t }, json: false };
}

// a job named instead of a body (2026-10-28, owner: "check prompt should also work with explorer links or job ids"): its id, or
// the 8 characters the explorer shows of it alone (2026-10-29; the server finds the one job of its window they start)
export function jobIdIn(text) {
  const t = String(text || '').trim().toLowerCase();
  const m = /(?:^|explorer\.imd\.fun\/jobs\/|api\.imd\.fun\/jobs\/|#\/job\/|^job\s*)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#\s]|$)/.exec(t)
    || /^(?:job\s*)?#?([0-9a-f]{8})$/.exec(t);
  return m && t.length <= 160 ? m[1] : null;
}
const TEMPLATES = ['single', 'impl_tests', 'impl_tests_review', 'multi_contract', 'fuzz', 'research', 'audit'];
// the runnable skills (the docs, Skills, 2026-10-28): a job's first step named like one is the skill its prompt is checked with
const SKILLS = ['build-contract-project', 'scaffold-project', 'implement-contract', 'implement-and-test', 'refine-project', 'fix-findings',
  'implement-one-contract', 'write-foundry-tests', 'gas-and-size-report', 'build-website', 'frontend-for-contract', 'better-interface',
  'implement-component', 'integrate-project', 'adapt-contract-project', 'audit-imported-code', 'research-report', 'create-image',
  'create-video', 'create-audio', 'build-ponder-indexer', 'deploy-script', 'write-readme-and-docs', 'site-content-check', 'import-site',
  'adversarial-review', 'solidity-security-review'];
// the skill a job's steps start with: the first building step by time (the record's verdicts come alphabetically, a review first),
// else any step named like a skill
const skillOf = (k) => String(k || '').replace(/_/g, '-');
function firstSkill(d) {
  const steps = Array.isArray(d.steps) ? d.steps : [];
  const build = steps.find((x) => x && x.role === 'implement' && SKILLS.includes(skillOf(x.key)));
  if (build) return skillOf(build.key);
  return [...steps.map((x) => x && x.key), ...((d.help && d.help.verdicts) || []).map((v) => v.key)].map(skillOf).find((k) => SKILLS.includes(k)) || null;
}
// the body a job was most likely quoted with, from its record (/proxy/panels/job): the plane keeps the whole objective and its
// settings, not the steps' own objectives and criteria. complete: false when steps were sent (a shape), so the free check would
// judge a body that was never quoted
export function rebuildFromJob(d) {
  const h = d.help || {}, tpl = String(h.template || '');
  const action = h.launch ? 'launch.open' : h.parent ? 'job.continue' : 'job.open';
  const input = { objective: d.objective || '' };
  let complete = true;
  let guessed = null;
  if (tpl.startsWith('skill:')) input.skill = tpl.slice(6);
  else if (TEMPLATES.includes(tpl)) input.template = tpl;
  else {                                                                // shape:chain/dag/fan_out_join, goal: the steps are not public;
    complete = false;                                                   // the free check still reads the objective, with the skill of its
    const first = firstSkill(d);                                         // first step
    if (first && action !== 'launch.open') { input.skill = first; guessed = first; }
  }
  if (action === 'job.continue') input.parentJobId = h.parent;
  if (h.github) input.github = true;
  if (h.ipfs) input.ipfs = true;
  if (action === 'launch.open') { if (h.launchKind) input.onchain = h.launchKind === 'univ4_hook' ? true : h.launchKind; if (h.chainId) input.chainId = h.chainId; }
  return { action, input, complete, shape: complete ? null : tpl, guessed, checkable: complete || !!guessed || action === 'launch.open' };
}

// a posted job that ran (2026-10-29, owner: "if a job is posted and the free check errors with this job is completed it should skip
// the free check and do the follow-up job search instead, and if there's a continuation follow the path until the last one and then do
// the free plane check"). The quote of a continuation names its parent; once the job ran, the plane answers "continue from the project's
// newest job, <id>" to it, every time (measured 2026-10-29 on seven ended continuations). The versions after a job, oldest first:
export function laterVersions(d) {
  const vs = (d && d.help && d.help.versions) || [], i = vs.findIndex((v) => v.id === d.id);
  return i < 0 ? [] : vs.slice(i + 1);
}
// the quote's parent is no longer its project's newest job: the body cannot be checked again as it was quoted
export function staleParent(rebuilt, d) {
  const h = (d && d.help) || {};
  return rebuilt.action === 'job.continue' && !!h.head && rebuilt.input.parentJobId !== h.head;
}
// the plane's own words for that, from a check's blockers: {id, running}, or null
export function planeMoved(answer) {
  for (const b of answer && Array.isArray(answer.blockers) ? answer.blockers : []) {
    const t = String(b && typeof b === 'object' ? b.detail || b.message || '' : b);
    let m = /continue from the project's newest job,?\s*([0-9a-f]{8}-[0-9a-f-]{27})/i.exec(t);
    if (m) return { id: m[1].toLowerCase(), running: false };
    m = /job ([0-9a-f]{8}-[0-9a-f-]{27}) in this project is still running/i.exec(t);
    if (m) return { id: m[1].toLowerCase(), running: true };
  }
  return null;
}
// what the plane warns about besides blockers (2026-10-29, job 79ec8ee4: "offline", "beyond_plan" said why it stopped): its suggestions
// but the facts it assumed ("missing_fact", in nearly every answer)
export function warningsOf(answer) {
  return answer && Array.isArray(answer.suggestions) ? answer.suggestions.filter((x) => !(x && typeof x === 'object' && x.code === 'missing_fact')) : [];
}
// the body of a next version from a job: its prompt and settings with parentJobId set to it. A continuation names what it runs: the
// skill or template the job ran, else the skill of its first step (a parent that ran steps gets "name the skill this continuation runs")
export function nextFrom(d) {
  const rb = rebuildFromJob(d), h = d.help || {}, tpl = String(h.template || '');
  const input = { parentJobId: d.id, objective: rb.input.objective };
  const first = firstSkill(d);
  if (tpl.startsWith('skill:')) input.skill = tpl.slice(6);
  else if (TEMPLATES.includes(tpl)) input.template = tpl;
  else if (first) input.skill = first;
  if (h.github) input.github = true;
  if (h.ipfs) input.ipfs = true;
  const ended = ['completed', 'blocked'].includes(d.state) && !h.running;
  const why = !ended ? 'running' : !input.skill && !input.template ? 'skill' : null;
  return { action: 'job.continue', input, complete: rb.complete, shape: rb.shape, guessed: input.skill && !tpl.startsWith('skill:') ? input.skill : null,
    next: true, checkable: !why, why };
}

const lower = (v) => String(v || '').toLowerCase();
const stepsOf = (i) => (Array.isArray(i.steps) ? i.steps.filter((s) => s && typeof s === 'object') : []);
const criteriaOf = (i) => stepsOf(i).flatMap((s) => (Array.isArray(s.acceptanceCriteria) ? s.acceptanceCriteria.map(String) : []));
const allText = (i) => [i.objective, i.question, ...stepsOf(i).map((s) => s.objective), ...criteriaOf(i)].map(lower).join('\n');

// each rule: when(action, input, text) -> a proposal, in plain words, with the docs' section when the docs say it
export const RULES = [
  { id: 'what-to-build', when: (a, i) => (a === 'job.open') && i.objective && !i.skill && !i.template && !i.steps && !i.contracts,
    say: 'An objective alone is refused: say what to build with a skill, a template or steps.', href: DOCS + '#job-body' },
  { id: 'parent', when: (a, i) => a === 'job.continue' && !i.parentJobId,
    say: 'A job.continue names parentJobId: the project\'s newest job (project.head on the job). Only the wallet that paid the project can pay it.', href: DOCS + '#continue' },
  { id: 'title', when: (a, i) => ['job.open', 'launch.open', 'job.continue', 'workflow.open'].includes(a) && typeof i.objective === 'string' && i.objective.length > 40 && !/^[^.,:;\n]{2,60},\s/.test(i.objective),
    say: 'Start the objective with the project\'s name and a comma ("Little Computer Pepes, …"): the explorer shows its opening as the job\'s title, and a launch\'s repository is named from its first words.' },
  { id: 'chain', when: (a, i) => a === 'launch.open' && i.chainId == null,
    say: 'No chainId: the launch goes to Sepolia, the default. Name the chain (1 is Ethereum mainnet, 4663 Robinhood Chain).', href: DOCS + '#job-body' },
  { id: 'decide', when: (a, i, t) => /\b(?:ask me|let me know|check with me|confirm with me|if (?:you are |you're )?unsure|should i\b|tell me (?:which|what|whether))\b/.test(t),
    say: 'Decide, do not ask: a worker that needs a decision stops the job, and that is how most blocked jobs stop. Give the value, or write "decide, do not ask".' },
  { id: 'local', when: (a, i) => /\b127\.0\.0\.1\b|\blocalhost\b|\b0\.0\.0\.0\b|file:\/\/|\/Users\/|\/home\/[a-z]|\b192\.168\.|\b10\.\d+\.\d+\.\d+\b/i.test(JSON.stringify(i)),
    say: 'No local or private address anywhere in the body, not even as a "never": the free check refuses it. A private repository is refused too: workers clone without credentials.' },
  { id: 'byte', when: (a, i, t) => /byte[- ]for[- ]byte|byte[- ]identical|verbatim (?:output|copy)|exact output of/.test(t),
    say: 'State the outcome ("is not modified", "stays as it is"), not a byte-level comparison: the check reads that as asking for a command\'s output and refuses it.' },
  { id: 'references', when: (a, i) => Array.isArray(i.references) && i.references.some((r) => String(r).includes('://') || String(r).length > 64),
    say: 'references take short skill names (64 characters at most). A file a worker should fetch goes into the objective, as a URL pinned to a commit, "used unchanged".', href: DOCS + '#job-body' },
  { id: 'token', when: (a, i, t) => ['launch.open', 'workflow.open'].includes(a) && /\b(?:mint|minting|burn|burning|nft|card|cards)\b/.test(t) && !/\bno (?:new )?token\b/.test(t),
    say: 'Name the one token the project has (standard, name, symbol, supply rule), or say in one sentence that it makes none: words like mint and burn make the check infer a token launch.' },
  { id: 'pattern-label', when: (a, i, t) => /\b(?:every|all|each)\b[^.\n]{0,60}\b(?:buttons?|labels?|links?|titles?|tabs?)\b[^.\n]{0,40}\b(?:reads?|says?|named|labell?ed|shows?)\b/.test(t),
    say: 'List each old label with its new one instead of a pattern ("every … reads …"): a pattern is applied to every match it finds, by the builder and by the reviewers.' },
  { id: 'numbers', when: (a, i) => /\b(?:only (?:these|the following) numbers|allowed numbers|no other numbers?)\b/.test(criteriaOf(i).map(lower).join('\n')),
    say: 'Bind numbers to their source ("every number comes from …, written exactly as there; no other number appears") instead of listing each allowed one: a list is enforced literally.' },
  { id: 'hosting-github', when: (a, i) => !!i.ipfs && i.github !== false && stepsOf(i).length && stepsOf(i).every((s) => s.skill === 'site-content-check'),
    say: 'A check-only hosting job with github on cannot be continued later. Set "github": false, and host the next version with job.continue and "ipfs": true.', href: DOCS + '#continue' },
  { id: 'stand-alone', when: (a, i) => stepsOf(i).some((s) => /\b(?:previous step|step [1-6]|the step above|as above|other steps?)\b/.test(lower(s.objective))),
    say: 'Every step must stand alone with its own objective: a step that points at another step\'s specification stops when the worker cannot find it.' },
  { id: 'criteria', when: (a, i) => ['job.open', 'launch.open', 'job.continue'].includes(a) && stepsOf(i).some((s) => /build|website|frontend|site/.test(lower(s.skill)) && !(Array.isArray(s.acceptanceCriteria) && s.acceptanceCriteria.length)),
    say: 'State each wish as an acceptance criterion a check can test: a website step is otherwise verified for structure only (the files are in place), not for what the page does.' },
  { id: 'price', when: (a, i, t) => /\b(?:total|including (?:the )?fee|plus (?:a |the )?fee|\+ ?fee)\b/.test(t) && /\d/.test(t),
    say: 'Write a stated price as one charge for one action, not as parts that add up to it; keep a meme number exact and say it is deliberate.' },
  { id: 'size', when: (a, i) => String(i.objective || '').length > 8000 || stepsOf(i).length > 6 || stepsOf(i).some((s) => (s.acceptanceCriteria || []).length > 8 || (s.acceptanceCriteria || []).some((c) => String(c).length > 500)),
    say: 'Over a limit: the objective takes 8,000 characters, a job 6 steps, a step 8 acceptance criteria of 500 characters each.', href: DOCS + '#job-body' },
];

// the proposals for one {action, input}
export function lint(action, input) {
  if (!input || typeof input !== 'object') return [];
  const t = allText(input);
  return RULES.filter((r) => { try { return !!r.when(action, input, t); } catch (e) { return false; } }).map((r) => ({ id: r.id, text: r.say, href: r.href || null }));
}

// the plane's answer as lines: [{kind: 'ok'|'block'|'note'|'fact'|'plan', text}]
const said = (x) => {
  if (typeof x === 'string') return x;
  if (!x || typeof x !== 'object') return String(x);
  if (x.label && x.state) return `${x.label}: ${String(x.state).replace(/_/g, ' ')}${x.state === 'missing' && x.example ? ' (' + x.example + ')' : ''}`;   // a fact
  return [x.code || x.field || x.path, x.message || x.detail || x.why || x.text || x.reason].filter(Boolean).join(': ') || JSON.stringify(x);
};
export function planeLines(a) {
  if (!a || typeof a !== 'object') return [{ kind: 'block', text: 'No answer from the plane.' }];
  if (a.error && !a.blockers) return [{ kind: 'block', text: `The plane: ${said(a.error)}${a.detail ? ' (' + said(a.detail) + ')' : ''}` }];
  const out = [];
  const blockers = Array.isArray(a.blockers) ? a.blockers : [];
  const warned = warningsOf(a).length;                    // a quote would take it, and the order may still not do what it says
  out.push(blockers.length ? { kind: 'block', text: `${blockers.length} blocker${blockers.length > 1 ? 's' : ''}: the quote would refuse it.` }
    : warned ? { kind: 'warn', text: `No blockers: a quote would take it. But the plane warns about ${warned === 1 ? 'one thing' : warned + ' things'} below.` }
      : { kind: 'ok', text: 'No blockers: a quote would take it.' });
  for (const b of blockers) out.push({ kind: 'block', text: said(b) });
  if (a.kind) out.push({ kind: 'fact', text: `Kind: ${a.kind}.` });
  for (const p of Array.isArray(a.plan) ? a.plan : []) out.push({ kind: 'plan', text: `Step: ${p.title || p.short || said(p)}${p.skill ? ' (' + p.skill + ')' : ''}` });
  for (const s of Array.isArray(a.suggestions) ? a.suggestions : []) out.push({ kind: 'note', text: said(s) });
  for (const f of Array.isArray(a.facts) ? a.facts : []) out.push({ kind: 'fact', text: said(f) });
  if (a.project && a.project.summary) out.push({ kind: 'fact', text: `Project: ${said(a.project.summary)}` });
  for (const n of a.project && Array.isArray(a.project.next) ? a.project.next : []) out.push({ kind: 'plan', text: `Next: ${n.skill || ''}${n.why ? ', ' + n.why : ''}` });
  return out;
}

// the line above the field when a job filled it: whose body it is, and whether it is the original order or a proposal
export function fieldSource(job, rebuilt, r, checked) {
  const id = short(job.id), posted = r && r.from ? short(r.from.id) : id;
  const steps = rebuilt.guessed ? ` Its steps are not public, so the skill is that of its first building step (${rebuilt.guessed}).` : !rebuilt.complete && !rebuilt.next ? ' Its steps are not public: only the objective and settings are in it.' : '';
  if (!rebuilt.next) return `In the field: the original order of job ${id}, the job you posted, rebuilt from the plane's record (its objective and settings).${steps}${checked ? ' The plane checked it as it is.' : ''}`;
  const whose = r && r.from ? `job ${id}, the newest version of the job you posted (${posted}, continued ${r.n} time${r.n > 1 ? 's' : ''})` : `job ${id}, the job you posted`;
  return `In the field: a proposal, not an order that was placed: a next version of ${whose}, with ${id}'s prompt and settings again and parentJobId set to ${id}.` +
    `${r && r.from ? '' : ` ${id}'s own order ran and is not checked again.`}${steps} ${checked ? 'The plane checked this proposal; change it and press Check to try your own.' : 'The plane has not checked it yet: press Check, or change it first.'}`;
}

// the window: a select, the text, Check; the proposals at once, the plane's answer when it comes. A job named in it is checked by
// jobCheck (main.js: the record, the path to the newest version, the plane), the same check as Pepe's
const short = (id) => String(id || '').slice(0, 8);
const hhmm = (t) => { const d = new Date(t); return isNaN(d) ? '' : d.toISOString().slice(5, 16).replace('T', ' ') + ' UTC'; };
export class Checker {
  constructor(doc, { check, jobCheck, onPick, onClose, explorer = 'https://explorer.imd.fun/launch' } = {}) {
    this.doc = doc; this.check = check; this.jobCheck = jobCheck; this.onPick = onPick; this.onClose = onClose; this.explorer = explorer; this.el = null;
  }
  build() {
    const d = this.doc, el = (tag, props = {}, ...kids) => { const n = d.createElement(tag); Object.assign(n, props); n.append(...kids); return n; };
    this.select = el('select', { id: 'checker-action' }, ...ACTIONS.map((a) => el('option', { value: a, textContent: a })));
    this.text = el('textarea', { id: 'checker-text', rows: 10, spellcheck: false, placeholder: 'Paste the job body you would quote (JSON), or just the prompt.' });
    // what the field holds when a job filled it (owner, 2026-10-29: "its not 100% clear to the user what the upper part is … or is it the
    // proposal"): the job's original order, or a proposal for its next version; a line that says so once the visitor edits it
    this.src = el('p', { id: 'checker-source', className: 'checker-source', hidden: true });
    this.text.addEventListener('input', () => { if (!this.src.hidden && !this.src.dataset.edited) { this.src.dataset.edited = '1'; this.src.textContent = 'You changed the field. It started as: ' + this.src.textContent; } });
    this.out = el('div', { id: 'checker-out', className: 'checker-out' });
    this.go = el('button', { type: 'button', id: 'checker-go', textContent: 'Check' });
    const close = el('button', { type: 'button', id: 'checker-close', textContent: 'Close' });
    const card = el('article', { className: 'letter checker-card' },
      el('h2', { id: 'checker-head', textContent: 'Prompt check' }),
      el('p', { className: 'checker-lede', textContent: 'The plane\'s free check (nothing is charged, nothing is kept), then what we learned on the swarm. I\'m a frog, not IMD support.' }),
      this.src, el('label', { htmlFor: 'checker-action', textContent: 'Action ' }), this.select, this.text, el('div', { className: 'checker-buttons' }, this.go, close), this.out);
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-labelledby', 'checker-head');
    this.el = el('div', { id: 'checker-pop', className: 'letter-pop' }, card);
    this.el.hidden = true;
    this.go.addEventListener('click', () => this.run());
    close.addEventListener('click', () => this.close());
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
    this.doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.el && !this.el.hidden) this.close(); });   // also after a check took the focus
    this.doc.body.append(this.el);
  }
  open(job = null) { if (!this.el) this.build(); this.el.hidden = false; this.text.focus(); if (job) { this.text.value = job; this.run(); } }
  close() { if (this.el) this.el.hidden = true; if (this.onClose) this.onClose(); }
  show() { if (!this.el) this.build(); this.el.hidden = false; this.out.textContent = ''; }
  line(kind, text, href = null) {
    const p = this.doc.createElement('p'); p.className = 'checker-line checker-' + kind; p.textContent = text;
    if (href) { const a = this.doc.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'docs'; p.append(' ', a); }
    this.out.append(p);
  }
  head(text) { const h = this.doc.createElement('h3'); h.textContent = text; this.out.append(h); }
  form(rebuilt, said = null) {
    this.select.value = rebuilt.action; this.text.value = JSON.stringify(rebuilt.input, null, 1);
    this.src.hidden = !said; this.src.textContent = said || ''; delete this.src.dataset.edited;
  }
  // a posted job: how it ended, the path to it, and how its body was rebuilt
  jobLines(job, rebuilt, r = null) {
    this.head(`Job ${short(job.id)}`);
    if (r && r.from) this.line('fact', `Job ${short(r.from.id)}${r.from.state ? ' (' + r.from.state + ')' : ''} was continued ${r.n} time${r.n > 1 ? 's' : ''}: this is its project's newest version.`);
    if (r && r.stale && !r.from) this.line('fact', 'Nothing continued it: it is where its project stands. Its own order is not checked again (it ran).');
    const why = job.blockedReason ? ': ' + String(job.blockedReason).slice(0, 240) : '';
    this.line(job.state === 'blocked' ? 'block' : job.state === 'completed' ? 'ok' : 'fact', `It ${job.state === 'blocked' ? 'stopped' : 'is ' + job.state}${why}`);
    if (!rebuilt) return;
    const steps = rebuilt.complete ? '' : ` It ran as ${rebuilt.shape || 'steps'}; the steps' own objectives and criteria are not public` +
      (rebuilt.guessed ? `, so the plane reads the objective with the skill of its first step (${rebuilt.guessed}). For the whole check, paste the body you would quote.`
        : rebuilt.action === 'launch.open' ? ': the plane plans a launch from its objective.' : ', and no step names a skill: paste the body you quoted for the plane check.');
    this.line('fact', (rebuilt.next ? 'Checked as a next version from it: its prompt and settings again, continued from this job.' : 'Rebuilt from the job: its objective and settings, as the plane keeps them.') + steps);
  }
  // a check already run (2026-10-28, owner: "show free check results also in popup if theres a blocker on a prompt from a posted job
  // id / explorer link"): the window with the rebuilt body, the plane's answer and the proposals, without asking the plane again
  showResult(job, rebuilt, answer, r = null) {
    this.show();
    this.form(rebuilt, fieldSource(job, rebuilt, r, !!answer));
    this.jobLines(job, rebuilt, r);
    this.head('The plane');
    if (answer) for (const l of planeLines(answer)) this.line(l.kind, l.text);
    else this.line('fact', rebuilt.why === 'running' ? 'Not asked: something in its project is still running. Check it again when that has ended.'
      : rebuilt.checkable ? 'The plane could not be asked right now.' : 'Not asked: the rebuilt body does not say what to build.');
    this.head('From the swarm');
    const notes = lint(rebuilt.action, rebuilt.input);
    if (!notes.length) this.line('ok', 'Nothing from what we learned on the swarm.');
    for (const n of notes) this.line('note', n.text, n.href);
    this.go.focus();
  }
  // a job that ran and whose next version could not be checked (2026-10-29): the plane named a newer job, or gave no answer; the same
  // wallet's other jobs around then, to pick one for a follow-up (onPick: Pepe checks that one). Check takes a next version from it
  showPick(r) {
    this.show();
    const job = r.d, next = nextFrom(job);
    this.form(next, fieldSource(job, next, r, false));
    this.jobLines(job, null, r);
    this.line('fact', r.moved && r.moved.running ? `Not checked: a newer job of its project, ${short(r.moved.id)}, is still running.`
      : r.moved && r.moved.newest ? `Not checked: its project's newest job is ${short(r.moved.id)}.`
        : !next.checkable ? 'Not checked: no step of it names a skill. Paste the body you would quote.'
          : 'The plane gave no answer just now (checks are capped per minute). Check takes the body above: a next version from it.');
    this.picks(r);
  }
  // the same wallet's other jobs around it, to pick one for a follow-up
  picks(r) {
    const w = r.ctx && r.ctx.payer;
    this.head('Around the same time');
    if (!r.others.length) {
      this.line('fact', w && !w.busy ? `No other job from the same wallet within ${w.hours} hours.` : w ? 'The wallet\'s other jobs could not be read right now.' : 'No payer on the record: no other jobs to look at.');
      return;
    }
    this.line('fact', `The same wallet ordered ${r.others.length === 1 ? 'this job' : 'these jobs'} within ${w.hours} hours of it. Pick one and Pepe looks at it:`);
    const list = this.doc.createElement('div'); list.className = 'checker-picks';
    for (const o of r.others) {
      const b = this.doc.createElement('button'); b.type = 'button'; b.className = 'checker-pick'; b.dataset.id = o.id;
      b.textContent = [short(o.id), o.state || 'older', o.title || o.action, hhmm(o.at)].filter(Boolean).join(' · ');
      b.addEventListener('click', () => { b.classList.add('picked'); if (this.onPick) this.onPick(o.id); });
      list.append(b);
    }
    this.out.append(list);
  }
  // what jobCheck found, in the window
  showJobCheck(r) {
    if (!r || r.error) {
      this.show();
      return this.line('block', r && r.error === 'missing' ? 'No job with that id on the plane.' : r && r.error === 'short'
        ? 'No job of the last days starts with that id: paste the whole id or its explorer link.' : 'The job could not be read right now; try again in a minute.');
    }
    if (r.stale && !r.chk) return this.showPick(r);
    this.showResult(r.d, r.rb, r.chk, r);
    if (r.stale && r.others.length) this.picks(r);
  }
  async run() {
    this.out.textContent = '';
    const jid = jobIdIn(this.text.value);
    if (jid || this.src.hidden) { this.src.hidden = true; this.src.textContent = ''; }   // the visitor's own text: no line
    if (jid) {                                                 // a job named: the job check, its body rebuilt into the field
      if (!this.jobCheck) return this.line('block', 'This copy of the house cannot read a job (no server here): paste the body you quoted.');
      this.line('fact', 'Reading the job…');
      this.go.disabled = true;
      let r = null;
      try { r = await this.jobCheck(jid); } catch (e) { r = null; }
      this.go.disabled = false;
      return this.showJobCheck(r);
    }
    const body = parseBody(this.text.value, this.select.value);
    if (body.error) return this.line('block', body.error);
    if (body.json && body.action !== this.select.value) this.select.value = body.action;
    if (!this.text.value.trim()) return this.line('block', 'Paste a body or a prompt first.');
    const notes = lint(body.action, body.input);
    this.head('The plane');
    const wait = this.doc.createElement('p'); wait.className = 'checker-line checker-fact'; wait.textContent = 'Asking the plane…'; this.out.append(wait);
    this.head('From the swarm');
    if (!notes.length) this.line('ok', 'Nothing from what we learned on the swarm.');
    for (const n of notes) this.line('note', n.text, n.href);
    let lines;
    if (!this.check) lines = [{ kind: 'fact', text: 'This copy of the house cannot ask the plane (no server here): run the free check on the explorer.' }];
    else {
      this.go.disabled = true;
      try { lines = planeLines(await this.check(body.action, body.input)); } catch (e) { lines = [{ kind: 'block', text: 'The plane could not be asked: ' + (e.message || e) }]; }
      this.go.disabled = false;
      this.go.focus();
    }
    const frag = this.doc.createDocumentFragment();
    for (const l of lines) { const p = this.doc.createElement('p'); p.className = 'checker-line checker-' + l.kind; p.textContent = l.text; frag.append(p); }
    if (!this.check) { const a = this.doc.createElement('a'); a.href = this.explorer; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'explorer Launch'; const p = this.doc.createElement('p'); p.className = 'checker-line'; p.append(a); frag.append(p); }
    wait.replaceWith(frag);
    return { notes, lines };
  }
}
