import { describe, expect, it } from 'vitest';
import { CONTENT, COUNTER, RULES, type Counter } from '../engine-core/fake/counter';
import { IllegalTransitionError } from '../state-machines/machine';
import {
  actionsBefore,
  bareNumbers,
  closeTutorial,
  leaveTutorial,
  lockAt,
  lockedStep,
  lockPrompt,
  parseScript,
  playFree,
  playScript,
  refusal,
  scriptDoc,
  startRun,
  startTutorial,
  stepAt,
  stepBack,
  stepDone,
  stepHeadings,
  tutorialCheck,
  writeDoc,
  type TutorialGame,
  type TutorialScript,
} from './index';

const GAME: TutorialGame<Counter> = {
  rules: COUNTER,
  content: CONTENT,
  gameRules: RULES,
  options: (seed) => ({ seed }),
  optionWords: (_s, id) => (id === 'add' ? 'Add' : id === 'draw' ? 'Draw' : id),
};

// seed "tut": the pile is 6 3 5 2 1 4 and every add adds 1; the counter reaches 16 on the fifth answer and wins
const SCRIPT: TutorialScript = {
  seed: 'tut',
  title: 'counter',
  steps: [
    { id: 'intro', narration: 'Reach the target.', targets: ['counter'], do: { kind: 'next' } },
    { id: 'add', narration: 'Add one or two.', targets: ['option:add'], do: { kind: 'move', choose: ['add'] }, expect: [{ type: 'added', n: 1 }], items: ['adding'] },
    { id: 'draw', narration: 'Draw the top card.', targets: [], do: { kind: 'move', choose: ['draw'] }, expect: [{ type: 'drawn', card: 6 }], items: ['drawing'] },
    { id: 'auto', narration: 'The game plays on.', targets: [], do: { kind: 'auto', moves: [['add'], ['draw']] }, expect: [{ type: 'added' }, { type: 'drawn', card: 3 }] },
    { id: 'last', narration: 'Draw again.', targets: [], do: { kind: 'move', choose: ['draw'] }, expect: [{ type: 'drawn' }] },
    { id: 'won', narration: 'You won.', targets: [], do: { kind: 'next' } },
  ],
  end: { kind: 'won' },
};

const withStep = (i: number, patch: object): TutorialScript => ({ ...SCRIPT, steps: SCRIPT.steps.map((s, k) => (k === i ? { ...s, ...patch } : s)) });

describe('script', () => {
  it('parses a script, fills targets, refuses duplicates and bad shapes', () => {
    const ok = parseScript({ seed: 's', steps: [{ id: 'a', narration: 'x', do: { kind: 'next' } }] });
    expect(ok.ok && ok.value.steps[0]?.targets).toEqual([]);
    const dup = parseScript({ seed: 's', steps: [{ id: 'a', narration: 'x', do: { kind: 'next' } }, { id: 'a', narration: 'y', do: { kind: 'next' } }] });
    expect(dup).toEqual({ ok: false, problems: ['steps: duplicate step id a'] });
    const bad = parseScript({ seed: 's', steps: [{ id: 'a', narration: 'x', do: { kind: 'jump' } }] });
    expect(bad.ok).toBe(false);
  });

  it('counts actions per step and finds the step of a game', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => actionsBefore(SCRIPT, i))).toEqual([0, 0, 1, 2, 4, 5]);
    expect([0, 1, 2, 3, 4, 5].map((n) => stepAt(SCRIPT, n))).toEqual([0, 2, 3, null, 4, 5]);
  });

  it('finds bare numbers outside tokens', () => {
    expect(bareNumbers('Draw {{hand}} cards, then 2 more.')).toEqual(['2']);
  });
});

describe('play', () => {
  it('plays the script to its end', () => {
    const r = playScript(GAME, SCRIPT, { items: ['adding', 'drawing'], evidence: { adding: ['added'], drawing: ['drawn'] }, requireEnd: true, noBareNumbers: true });
    expect(r.problems).toEqual([]);
    expect(r.stepsPlayed).toBe(6);
    expect(r.run.actions.map((a) => a.picks[0])).toEqual(['add', 'draw', 'add', 'draw', 'draw']);
    expect(r.run.state.result).toEqual({ kind: 'won' });
  });

  it('names the step, what it expected and what happened', () => {
    const other = playScript(GAME, SCRIPT, { seed: 'other' });
    expect(other.ok).toBe(false);
    expect(other.failures[0]?.code).toBe('MISSING_EVENT');
    const p = (s: TutorialScript) => playScript(GAME, s).problems[0];
    expect(p(withStep(1, { do: { kind: 'move', choose: ['jump'] } }))).toMatch(/^step 2 \(add\) NO_SUCH_OPTION: expected an answer jump; instead jump is not offered/);
    expect(p(withStep(1, { do: { kind: 'move', choose: ['skip'] } }))).toMatch(/DISABLED_OPTION.*disabled \(never\)/);
    expect(p(withStep(1, { do: { kind: 'move', choose: ['add', 'draw'] } }))).toMatch(/ILLEGAL/);
    expect(p(withStep(5, { do: { kind: 'move', choose: ['add'] } }))).toMatch(/NO_PROMPT.*the game is over/);
    expect(p(withStep(3, { do: { kind: 'auto', moves: [['add'], ['jump']] } }))).toMatch(/step 4 \(auto#2\) NO_SUCH_OPTION/);
    expect(p(withStep(1, { do: { kind: 'move', prompt: 'pick', choose: ['add'] } }))).toMatch(/WRONG_PROMPT/);
    expect(p({ ...SCRIPT, end: { kind: 'lost' } })).toMatch(/^END: the game ended/);
    expect(p({ ...SCRIPT, steps: SCRIPT.steps.slice(0, 3) })).toMatch(/^NOT_OVER/);
  });

  it('keeps going when asked, and checks coverage, evidence and bare numbers', () => {
    const r = playScript(GAME, withStep(1, { expect: [{ type: 'drawn' }], narration: 'Add 1.' }), { stopOnFailure: false, items: ['adding', 'scoring'], evidence: { adding: ['added'] }, noBareNumbers: true });
    expect(r.failures.map((f) => f.code)).toEqual(['MISSING_EVENT']);
    expect(r.problems.slice(1)).toEqual([
      'UNCOVERED: no step teaches scoring',
      'UNTESTED: step 2 (add) teaches adding but expects none of added',
      'UNTESTED: step 3 (draw) teaches drawing but expects none of (no events listed)',
      'BARE_NUMBER: step 2 (add) narrates 1 outside a token',
    ]);
  });

  it('refuses Next while another seat decides, and uses the game\'s option refs', () => {
    expect(playScript({ ...GAME, human: () => false }, SCRIPT).problems[0]).toMatch(/WRONG_SEAT/);
    const refs: TutorialGame<Counter> = { ...GAME, findOption: (_s, ref) => ({ plus: 'add', top: 'draw' })[ref] };
    const s = { ...SCRIPT, steps: SCRIPT.steps.map((x) => (x.do.kind === 'move' ? { ...x, do: { kind: 'move' as const, choose: x.do.choose.map((c) => (c === 'add' ? 'plus' : 'top')) } } : x.do.kind === 'auto' ? { ...x, do: { kind: 'auto' as const, moves: [['plus'], ['top']] } } : x)) };
    expect(playScript(refs, s).problems).toEqual([]);
  });
});

describe('lock', () => {
  it('locks a move step to its answer', () => {
    const state = startRun(GAME, SCRIPT.seed).state;
    const lock = lockAt(GAME, SCRIPT, 1, state);
    const id = state.prompt?.id ?? 0;
    expect([lock.phase, lock.stepNo, lock.total, lock.waitFor, lock.asks]).toEqual(['guided', 2, 6, 'move', 'Add']);
    expect(lock.answer).toEqual(['add']);
    expect(lock.option('add')).toEqual({ enabled: true });
    expect(lock.option('draw')).toEqual({ enabled: false, why: 'The tutorial asks for Add.' });
    expect(lock.button('next').enabled).toBe(false);
    expect(lock.button('undo')).toEqual({ enabled: false, why: 'Undo is off in the tutorial.' });
    expect(lock.button('menu').enabled).toBe(true);
    expect(lock.accepts({ kind: 'answer', promptId: id, picks: ['add'] })).toBe(true);
    expect(lock.accepts({ kind: 'answer', promptId: id, picks: ['draw'] })).toBe(false);
    expect(lock.accepts({ kind: 'answer', promptId: id + 1, picks: ['add'] })).toBe(false);
    expect(refusal(lock, { kind: 'answer', promptId: id, picks: ['draw'] })).toBe('The tutorial asks for Add.');
    expect(refusal(lock, { kind: 'answer', promptId: id, picks: ['add'] })).toBeNull();
    const p = lockPrompt(state.prompt as NonNullable<Counter['state']['prompt']>, lock);
    expect(p.options.map((o) => [o.id, o.enabled])).toEqual([['add', true], ['draw', false], ['skip', false]]);
  });

  it('opens Next on a Next or auto step, refuses answers there, and frees everything after the last step', () => {
    const state = startRun(GAME, SCRIPT.seed).state;
    const next = lockAt(GAME, SCRIPT, 0, state);
    expect([next.button('next').enabled, next.option('add').enabled, next.asks]).toEqual([true, false, 'Next']);
    const auto = lockAt(GAME, withStep(0, { do: { kind: 'auto', moves: [['add']] } }), 0, state);
    expect([auto.button('next').enabled, auto.answer, auto.accepts({ kind: 'answer', promptId: state.prompt?.id ?? 0, picks: ['add'] })]).toEqual([true, ['add'], false]);
    const over = lockAt(GAME, SCRIPT, 6, state);
    expect([over.phase, over.option('draw').enabled, over.button('next').enabled, over.button('undo').enabled, over.accepts({ kind: 'answer', promptId: 0, picks: [] })]).toEqual(['over', true, false, false, true]);
  });

  it('reports a script that no longer fits, and keeps order when the game says so', () => {
    const state = startRun(GAME, SCRIPT.seed).state;
    const broken = lockAt(GAME, withStep(1, { do: { kind: 'move', choose: ['jump'] } }), 1, state);
    expect(broken.problem?.code).toBe('NO_SUCH_OPTION');
    expect(broken.option('add').enabled).toBe(false);
    const two = withStep(1, { do: { kind: 'move', choose: ['draw', 'add'] }, asks: 'both' });
    const id = state.prompt?.id ?? 0;
    expect(lockAt(GAME, two, 1, state).accepts({ kind: 'answer', promptId: id, picks: ['add', 'draw'] })).toBe(true);
    expect(lockAt({ ...GAME, ordered: () => true }, two, 1, state).accepts({ kind: 'answer', promptId: id, picks: ['add', 'draw'] })).toBe(false);
    expect(lockAt(GAME, two, 1, state).asks).toBe('both');
  });
});

describe('machine', () => {
  it('walks the steps to closing and closed', () => {
    let s = startTutorial();
    expect(s).toEqual({ phase: 'guided', step: 0 });
    for (let i = 0; i < 5; i += 1) s = stepDone(s, SCRIPT);
    expect(s).toEqual({ phase: 'guided', step: 5 });
    expect(lockedStep(s, SCRIPT)).toBe(5);
    s = stepDone(s, SCRIPT);
    expect(s).toEqual({ phase: 'closing', step: 5 });
    expect(lockedStep(s, SCRIPT)).toBe(6);
    expect(playFree(s)).toEqual(s);
    expect(stepBack(s)).toEqual({ phase: 'guided', step: 5 });
    expect(stepBack({ phase: 'guided', step: 0 })).toEqual({ phase: 'guided', step: 0 });
    expect(closeTutorial(s).phase).toBe('closed');
    expect(leaveTutorial(startTutorial()).phase).toBe('closed');
    expect(() => closeTutorial(startTutorial())).toThrow(IllegalTransitionError);
  });
});

describe('check and document', () => {
  const io = () => {
    const out: string[] = [];
    const err: string[] = [];
    const files = new Map<string, string>();
    return { out, err, files, io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l), exists: (p: string) => files.has(p), read: (p: string) => files.get(p) ?? '', write: (p: string, t: string) => files.set(p, t) } };
  };

  it('exits 0 with a summary, 1 with every problem', () => {
    const a = io();
    expect(tutorialCheck(GAME, SCRIPT, { items: ['adding', 'drawing'] }, a.io)).toBe(0);
    expect(a.out).toEqual(['tutorial:check: counter on seed tut: 6 steps, 5 answers, 2 of 2 items, ended {"kind":"won"}: OK']);
    const b = io();
    expect(tutorialCheck(GAME, SCRIPT, { seed: 'other' }, b.io)).toBe(1);
    expect(b.err[0]).toMatch(/^tutorial:check: counter on seed other: 1 problem\(s\); \d of 6 steps played$/);
    expect(b.err[1]).toMatch(/^ {2}step \d \(\w+\) /);
    const c = io();
    expect(tutorialCheck({ ...GAME, rules: { ...COUNTER, setup: () => { throw new Error('boom'); } } }, SCRIPT, {}, c.io)).toBe(1);
    expect(c.err).toEqual(['tutorial:check: counter: the engine threw while playing the script: boom']);
  });

  it('writes the readable script with names, headings and items, and checks it is up to date', () => {
    const headings = stepHeadings(GAME, SCRIPT, (s) => (s.result === null ? `Turn ${String(s.turn)}` : 'Game over'));
    expect(headings).toEqual(['Turn 1', 'Turn 1', 'Turn 2', 'Turn 3', 'Turn 5', 'Game over']);
    const text = scriptDoc(SCRIPT, { title: 'Counter', source: 'fake content', intro: ['- Target 12.'], names: (id) => (id === 'add' ? 'Add' : undefined), heading: (i) => headings[i], items: { adding: 'adding to the counter', drawing: 'drawing a card', scoring: 'scoring' } });
    expect(text).toContain('# Tutorial script: Counter\n\nGenerated from the script (fake content); do not edit by hand. 6 steps, seed `tut`.\n\n- Target 12.\n\nThe game ends: kind "won".');
    expect(text).toContain('- [x] adding adding to the counter: steps 2\n- [x] drawing drawing a card: steps 3\n- [ ] scoring scoring\n');
    expect(text).toContain('## Turn 1\n\n### 1. intro [Next]\n\n> Reach the target.\n\n- **The player:** Next (the step only explains)\n- **Highlight:** `counter`\n\n### 2. add (adding)');
    expect(text).toContain('- **The player:** Add (`add`)\n- **Highlight:** `option:add`\n- **Then:** `added` (n 1)');
    expect(text).toContain('### 4. auto [auto-played]\n\n> The game plays on.\n\n- **The player:** Next: the game plays 2 scripted answers by itself');
    expect(text.endsWith('- **The player:** Next (the step only explains)\n')).toBe(true);
    const f = io();
    expect(writeDoc(f.io, 'SCRIPT.md', text, true)).toBe(1);
    expect(writeDoc(f.io, 'SCRIPT.md', text, false)).toBe(0);
    expect(writeDoc(f.io, 'SCRIPT.md', text, true)).toBe(0);
    expect(f.out).toEqual(['tutorial:doc: wrote SCRIPT.md', 'tutorial:doc: SCRIPT.md is up to date']);
  });
});
