import { describe, expect, expectTypeOf, it } from 'vitest';
import { DriverRng, type Driver } from '../sim-pool/index.ts';
import {
  PIPELINE,
  adviceProblems,
  cannotUseReport,
  decisionLines,
  decisionPart,
  decisionsAt,
  discardOrder,
  evaluate,
  fidelityProblems,
  forget,
  forgetTurn,
  handlerProblems,
  judge,
  loadProfile,
  lookAhead,
  newMemory,
  opponentDriver,
  pick,
  recalls,
  redact,
  remember,
  setPlan,
  viewLeaks,
  type Advice,
  type Candidate,
  type DecisionRecord,
  type HandlerRow,
  type Opponent,
  type Rand,
} from './index.ts';

// A tiny fake game: the opponent holds cards and money; the other hand is hidden.
interface State { money: number; mine: string[]; theirs: string[]; inPlay: string[] }
type View = { money: number; mine: string[]; theirs: number; inPlay: string[] };
const view = (s: State, _seat: string): View => ({ money: s.money, mine: s.mine, theirs: s.theirs.length, inPlay: s.inPlay });
const state: State = { money: 3, mine: ['bolt', 'gold', 'wall', 'odd'], theirs: ['secret-card'], inPlay: ['wall'] };
const v = redact(state, 'ai', view);

const never: Rand = { int: () => 0, chance: () => false };
const always: Rand = { int: () => 0, chance: () => true };
const DEFAULTS = { ...PIPELINE, aggression: 1, bluff: false };
const ADVICE: Record<string, Advice> = {
  bolt: { priority: 2, discard: 1 },
  gold: { when: ['main'], keep: 3 },
  wall: { nonStacking: true },
  odd: { cannotUse: 'needs a combo the opponent does not plan' },
  rich: { needs: [{ count: 'money', op: '>=', n: 5 }] },
};
const handlers: Record<string, HandlerRow<View, typeof DEFAULTS>> = {
  damage: { judge: (c) => 3 * c.profile.aggression },
  gain: { judge: () => 1, cost: (c) => c.view.money >= 2 },
  discard: { judge: () => ({ reason: 'not-worth' }) },
  pass: 'always',
  shuffle: 'never',
};
const make = (over: Partial<Opponent<View, typeof DEFAULTS>> = {}): Opponent<View, typeof DEFAULTS> => ({
  name: 'ai',
  profile: DEFAULTS,
  handlers,
  advice: (c) => ADVICE[c],
  memory: newMemory(),
  count: (n, w) => (n === 'money' ? w.money : 0),
  inPlay: (c, w) => w.inPlay.includes(c),
  ...over,
});
const C = (key: string, card?: string, verbs?: string[], pass?: boolean): Candidate => ({ key, ...(card ? { card } : {}), ...(verbs ? { verbs } : {}), ...(pass ? { pass } : {}) });

describe('opponent (K103, K115)', () => {
  it('redacted view hides the other hand; viewLeaks finds a leak', () => {
    expect(viewLeaks(v, ['secret-card'])).toEqual([]);
    expect(viewLeaks(state, ['secret-card'])).toEqual(['secret-card']);
  });

  it('pipeline: hint, timing, needs, stacking, verb, cost, drawback, missing logic', () => {
    const o = make();
    const j = (c: Candidate, t = 'main') => judge(o, v, c, never, t);
    expect(j(C('odd', 'odd', ['damage'])).reason).toBe('cannot-use');
    expect(j(C('gold', 'gold', ['gain']), 'combat').reason).toBe('wait-timing');
    expect(j(C('rich', 'rich', ['gain'])).reason).toBe('wait-need');
    expect(j(C('wall', 'wall', ['gain'])).reason).toBe('non-stacking');
    expect(j(C('bolt', 'bolt', ['damage']))).toMatchObject({ reason: 'will-play', cls: 'play', score: 5 });
    expect(j(C('x', 'x', ['damage', 'discard'])).reason).toBe('drawback');
    expect(j(C('x', 'x', ['damage', 'shuffle'])).reason).toBe('drawback');
    expect(j(C('x', 'x', ['shuffle'])).reason).toBe('cannot-use');
    expect(j(C('x', 'x', ['fly'])).reason).toBe('missing-logic');
    expect(judge(make(), redact({ ...state, money: 1 }, 'ai', view), C('gold', 'gold', ['gain']), never, 'main').reason).toBe('cant-afford');
  });

  it('runaway guard after runawayFree uses, by chance decay^n', () => {
    const o = make({ profile: { ...DEFAULTS, runawayFree: 2 } });
    o.memory.uses.bolt = 2;
    expect(judge(o, v, C('bolt', 'bolt', ['damage']), never).reason).toBe('runaway');
    expect(judge(o, v, C('bolt', 'bolt', ['damage']), always).reason).toBe('will-play');
  });

  it('pick: best play, pass when nothing plays, forced otherwise; counts uses; prune', () => {
    const o = make();
    const r = pick(o, v, [C('pass', undefined, ['pass'], true), C('bolt', 'bolt', ['damage']), C('gold', 'gold', ['gain'])], { rand: never, timing: 'main', step: 4, prompt: 9 });
    expect(r).toMatchObject({ index: 1, key: 'bolt', reason: 'will-play', step: 4 });
    expect(o.memory.uses.bolt).toBe(1);
    expect(pick(o, v, [C('odd', 'odd'), C('pass', undefined, [], true)], { rand: never }).key).toBe('pass');
    expect(pick(make({ handlers: {} }), v, [C('odd', 'odd'), C('b', 'b', ['fly'])], { rand: never })).toMatchObject({ forced: true });
    const p = make({ prune: [(js) => js.filter((x) => x.key === 'bolt').map((x) => x.key)] });
    expect(pick(p, v, [C('bolt', 'bolt', ['damage']), C('gold', 'gold', ['gain'])], { rand: never, timing: 'main' }).key).toBe('gold');
    expect(pick(o, v, [C('only')], { rand: never }).reason).toBe('only-option');
  });

  it('plan carried across prompts; a miss drops it and is recorded', () => {
    const o = make();
    setPlan(o.memory, [{ match: 'gold', note: 'buy then place' }, { match: 'space-3' }]);
    expect(pick(o, v, [C('bolt', 'bolt', ['damage']), C('gold', 'gold', ['gain'])], { rand: never, timing: 'main' }).reason).toBe('plan');
    const r = pick(o, v, [C('space-1'), C('space-2')], { rand: never });
    expect(r.planMiss).toBe('space-3');
    expect(o.memory.plan).toEqual([]);
    expect(decisionLines(r)[1]).toContain('space-3');
  });

  it('memory sets and end of turn', () => {
    const m = newMemory();
    remember(m, 'reserved', 'gold');
    remember(m, 'seen', 'x');
    expect(recalls(m, 'reserved', 'gold')).toBe(true);
    m.uses.gold = 3;
    forgetTurn(m, ['seen']);
    expect([recalls(m, 'reserved', 'gold'), recalls(m, 'seen', 'x'), m.uses]).toEqual([false, true, {}]);
    forget(m, 'seen', 'x');
    expect(recalls(m, 'seen', 'x')).toBe(false);
  });

  it('decision record: lines, log part, by step', () => {
    const r = pick(make({ score: () => ({ total: 1, lines: ['tempo 1 x 1 = 1'] }) }), v, [C('bolt', 'bolt', ['damage']), C('gold', 'gold', ['gain'])], { rand: never, timing: 'main', step: 2 });
    expect(decisionLines(r)).toEqual([
      'ai chose bolt (will-play) at main',
      'bolt: play will-play 6',
      '  priority 2',
      '  damage 3',
      '  tempo 1 x 1 = 1',
      'gold: play will-play 2',
      '  gain 1',
      '  tempo 1 x 1 = 1',
    ]);
    expect(decisionPart(r)).toEqual({ t: 'ref', ref: { type: 'decision', id: '2::ai' }, label: 'why' });
    expect(decisionsAt([r], 2)).toEqual([r]);
  });

  it('closed vocabularies: advice and profile', () => {
    expect(adviceProblems(ADVICE)).toEqual([]);
    expect(adviceProblems({ a: { logic: 'x', when: 'main', needs: [{ count: 'm', op: '!', n: 1 }] } })).toEqual(['a.logic: unknown key', 'a.when: not words', 'a.needs: not needs']);
    expect(loadProfile(DEFAULTS, { aggression: 2 }).aggression).toBe(2);
    expect(() => loadProfile(DEFAULTS, { aggresion: 2 }, 'reckless')).toThrow('reckless.aggresion: unknown key');
    expect(() => loadProfile(DEFAULTS, { bluff: 1 })).toThrow('not boolean');
    expect(discardOrder(['gold', 'wall', 'bolt'], (c) => ADVICE[c])).toEqual(['bolt', 'wall', 'gold']);
  });

  it('conformance and cannot-use report', () => {
    expect(handlerProblems(['damage', 'gain', 'discard', 'pass', 'shuffle'], handlers)).toEqual([]);
    expect(handlerProblems(['damage', 'fly'], { damage: 'always', old: 'never' })).toEqual(['fly: no opponent handler', 'old: handler for an unknown verb']);
    const r = pick(make({ handlers: {} }), v, [C('b', 'b', ['fly']), C('pass', undefined, [], true)], { rand: never });
    expect(cannotUseReport([{ id: 'odd', verbs: ['damage'] }, { id: 'b', verbs: ['fly', 'shuffle'] }, { id: 'bolt', verbs: ['damage'] }], (c) => ADVICE[c], handlers, [r])).toEqual([
      'odd: needs a combo the opponent does not plan',
      'b: no handler for fly; shuffle is never used',
      'b: missing-logic in 1 decision(s)',
    ]);
  });

  it('evaluator explain lines and copy fidelity', () => {
    const terms = { money: (w: View) => w.money, cards: (w: View) => w.mine.length };
    expect(evaluate(v, terms, { cards: 2 })).toEqual({ total: 11, lines: ['money 3 x 1 = 3', 'cards 4 x 2 = 8'] });
    expect(fidelityProblems(v, structuredClone(v), terms)).toEqual([]);
    expect(fidelityProblems(v, { ...v, money: 4 }, terms)).toEqual(['- money 3 x 1 = 3', '+ money 4 x 1 = 4']);
  });

  it('bounded look-ahead with caps and the repeat cut', () => {
    // add 1 or double; three moves deep from 1: double, double, double = 8 beats anything with +1.
    const search = { moves: () => ['inc', 'dbl'], apply: (n: number, m: string) => (m === 'inc' ? n + 1 : n * 2), score: (n: number) => n, key: (n: number) => String(n) };
    expect(lookAhead(3, search)).toMatchObject({ best: 'dbl', score: 24, cut: false });
    const capped = lookAhead(3, search, { nodes: 3 });
    expect(capped.cut).toBe(true);
    expect(capped.nodes).toBe(3);
    expect(lookAhead(5, { moves: () => ['noop'], apply: (n: number) => n, score: (n: number) => n }).score).toBe(5);
  });

  it('as a sim-pool driver', () => {
    const d = opponentDriver(make(), { view: (s: State) => redact(s, 'ai', view), candidates: (_w, answers: readonly string[]) => answers.map((a) => C(a, a, a === 'pass' ? ['pass'] : ['damage'])), timing: () => 'main' });
    expect(d.choose(state, ['pass', 'bolt'], never)).toBe('bolt');
    expect(d.reasons()[0]).toBe('ai chose bolt (will-play) at main');
  });

  it('K222: the driver passes the seat of the open prompt to view', () => {
    const seen: (string | number | undefined)[] = [];
    const d = opponentDriver(make(), { view: (s: State & { prompt: { id: number; seat?: string } }, seat?: string | number) => (seen.push(seat), redact(s, String(seat), view)), candidates: (_w, answers: readonly string[]) => answers.map((a) => C(a)) });
    d.choose({ ...state, prompt: { id: 1, seat: 'ai' } }, ['a'], never);
    d.choose({ ...state, prompt: { id: 2 } }, ['a'], never);
    expect(seen).toEqual(['ai', undefined]);
  });

  it('driver records carry step and prompt: own log ids, found by step', () => {
    const kept: DecisionRecord[] = [];
    const d = opponentDriver(make(), { view: (s: State & { prompt: { id: number } }) => redact(s, 'ai', view), candidates: (_w, answers: readonly string[]) => answers.map((a) => C(a)) }, (r) => kept.push(r));
    d.choose({ ...state, prompt: { id: 7 } }, ['a', 'b'], never);
    d.choose({ ...state, prompt: { id: 8 } }, ['a', 'b'], never);
    expect(kept.map((r) => [r.step, r.prompt])).toEqual([[0, 7], [1, 8]]);
    expect(decisionPart(kept[0] as DecisionRecord)).not.toEqual(decisionPart(kept[1] as DecisionRecord));
    expect(decisionsAt(kept, 1)).toEqual([kept[1]]);
  });

  it('same seeded DriverRng gives the same picks', () => {
    const run = () => {
      const o = make({ profile: { ...DEFAULTS, runawayFree: 0 } });
      return Array.from({ length: 20 }, (_, i) => pick(o, v, [C('bolt', 'bolt', ['damage']), C('gold', 'gold', ['gain'])], { rand: new DriverRng(`s|ai|${String(i)}`), timing: 'main' }).key);
    };
    const a = run();
    expect(run()).toEqual(a);
    expect(new Set(a).size).toBe(2);
  });

  it('plan step still goes through the checks; a failed one drops only that step', () => {
    const o = make();
    setPlan(o.memory, [{ match: 'odd' }, { match: 'gold' }]);
    const r = pick(o, v, [C('odd', 'odd', ['damage']), C('bolt', 'bolt', ['damage'])], { rand: never, timing: 'main' });
    expect(r).toMatchObject({ key: 'bolt', planMiss: 'odd' });
    expect(o.memory.plan).toEqual([{ match: 'gold' }]);
    expect(pick(o, redact({ ...state, money: 1 }, 'ai', view), [C('gold', 'gold', ['gain']), C('pass', undefined, [], true)], { rand: never, timing: 'main' })).toMatchObject({ key: 'pass', planMiss: 'gold' });
  });

  it('lookAhead leaves a frozen state unchanged; cached result does not depend on search order', () => {
    type S = { readonly n: number; readonly hist: readonly string[] };
    const freeze = <T>(x: T): T => {
      if (typeof x === 'object' && x !== null) for (const k of Object.values(x)) freeze(k);
      return Object.freeze(x);
    };
    const s = freeze<S>({ n: 3, hist: [] });
    const search = { moves: () => ['inc', 'dbl'], apply: (t: S, m: string): S => freeze({ n: m === 'inc' ? t.n + 1 : t.n * 2, hist: [...t.hist, m] }), score: (t: S) => t.n, key: (t: S) => String(t.n) };
    expect(lookAhead(s, search).score).toBe(24);
    expect(s).toEqual({ n: 3, hist: [] });
    const flip = { ...search, moves: () => ['dbl', 'inc'] };
    expect(lookAhead(s, flip).score).toBe(lookAhead(s, search).score);
    const same = { moves: () => ['a', 'b'], apply: (n: number, m: string) => (m === 'a' ? n : n + 1), score: (n: number) => n, key: (n: number) => String(n) };
    expect(lookAhead(1, same, { depth: 2 }).score).toBe(lookAhead(1, { ...same, moves: () => ['b', 'a'] }, { depth: 2 }).score);
  });

  it('opponentDriver satisfies sim-pool Driver', () => {
    type St = Parameters<Driver['choose']>[0];
    type Ans = Parameters<Driver['choose']>[1][number];
    const d = opponentDriver(make(), { view: (_s: St) => v, candidates: (_w, answers: readonly Ans[]) => answers.map((a) => C(a.kind === 'answer' ? a.picks.join() : a.verb)) });
    const drv: Driver = d;
    expectTypeOf(d).toMatchTypeOf<Driver>();
    expect(drv.name).toBe('ai');
  });
});
