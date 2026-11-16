// K100: debug edits as engine actions.
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, debugVerbs, draftOf, hashState, replay, validateAction, type AnswerAction, type DebugAction, type GameRules } from './index';
import { CONTENT, COUNTER, RULES, type Counter, type CounterState } from './fake/counter';

type Dbg = Omit<Counter, 'action'> & { readonly action: AnswerAction | DebugAction };
const G: GameRules<Dbg> = {
  ...(COUNTER as unknown as GameRules<Dbg>),
  debug: {
    summon: (ctx, args) => {
      if (typeof args['card'] !== 'number') return 'summon needs a card number';
      const s = draftOf(ctx);
      s.pile = [args['card'], ...s.pile];
      ctx.emit({ type: 'added', n: 0 });
      return undefined;
    },
    loop: (ctx) => {
      ctx.then({ kind: 'turn' });
      return undefined;
    },
  },
};
const start = (): CounterState => createGame(G, { seed: 'k100' }, RULES, CONTENT).state;
const dbg = (verb: string, args?: Record<string, unknown>): DebugAction => (args === undefined ? { kind: 'debug', verb } : { kind: 'debug', verb, args });
const answer = (s: CounterState, pick: string): AnswerAction => ({ kind: 'answer', promptId: s.prompt?.id ?? -1, picks: [pick] });

describe('debug edits (K100)', () => {
  it('set clamps, keeps the waiting prompt, emits nothing, and replays', () => {
    const s = start();
    const r = applyAction(G, s, dbg('set', { path: ['counter'], value: 99, max: 10 }), CONTENT);
    expect(r.state.counter).toBe(10);
    expect(r.state.prompt).toEqual(s.prompt);
    expect(r.events).toEqual([]);
    const actions = [dbg('set', { path: ['marks', 'added'], value: 1 }), dbg('set', { path: ['counter'], value: 4 }), answer(r.state, 'add')];
    expect(() => applyAction(G, s, actions[0] as DebugAction, CONTENT)).toThrow(/not a number/);
    const two = [actions[1] as DebugAction, answer(r.state, 'add')];
    const a = replay(G, { seed: 'k100' }, RULES, two, CONTENT);
    expect(a.ok).toBe(true);
    expect(a.hash).toBe(replay(G, { seed: 'k100' }, RULES, two, CONTENT).hash);
    expect(a.state?.counter).toBeGreaterThan(4);
  });

  it('a refused edit changes nothing', () => {
    const s = start();
    const h = hashState(s);
    for (const [a, m] of [
      [dbg('set', { path: ['rng', 'a'], value: 1 }), /kernel/],
      [dbg('set', { path: ['nope', 'x'], value: 1 }), /no object/],
      [dbg('summon', { card: 'x' }), /summon needs a card number/],
      [dbg('loop'), /cannot schedule tasks/],
      [dbg('fly'), /no debug verb/],
      [dbg('force', { values: [-1] }), /whole numbers/],
    ] as const) expect(() => applyAction(G, s, a, CONTENT)).toThrow(m);
    expect(hashState(s)).toBe(h);
    expect(validateAction(s, { kind: 'debug', verb: 1 } as never)).toMatchObject({ ok: false });
    expect(validateAction(s, dbg('fly'), G)).toEqual({ ok: false, error: 'DEBUG_REFUSED: no debug verb "fly"' });
    expect(validateAction(s, dbg('summon', { card: 9 }), G)).toEqual({ ok: true });
    expect(validateAction(s, dbg('close'))).toEqual({ ok: false, error: 'DEBUG_REFUSED: this game takes no debug edits' });
  });

  it('a game that has not opted in refuses debug edits', () => {
    const s = createGame(COUNTER, { seed: 'k100' }, RULES, CONTENT).state;
    expect(() => applyAction(COUNTER, s, dbg('set', { path: ['counter'], value: 1 }) as never, CONTENT)).toThrow(/takes no debug edits/);
    expect(debugVerbs(COUNTER)).toEqual([]);
    expect(debugVerbs(G)).toEqual(['set', 'force', 'close', 'summon', 'loop']);
  });

  it('force sets the next named roll and leaves the rng words alone', () => {
    const s = start();
    const f = applyAction(G, s, dbg('force', { values: [1, 0], name: 'add' }), CONTENT).state;
    expect(f.forced).toEqual([{ value: 1, name: 'add' }, { value: 0, name: 'add' }]);
    const a = applyAction(G, f, answer(f, 'add'), CONTENT);
    expect(a.events[0]).toMatchObject({ type: 'added', n: 2 });
    expect(a.state.rng).toEqual(f.rng);
    const b = applyAction(G, a.state, answer(a.state, 'add'), CONTENT).state;
    expect(b.counter).toBe(3);
    expect('forced' in b).toBe(false);
  });

  it('a game verb marks its events debug; close drops a stuck prompt', () => {
    const s = start();
    const r = applyAction(G, s, dbg('summon', { card: 9 }), CONTENT);
    expect(r.state.pile[0]).toBe(9);
    expect(r.events).toEqual([expect.objectContaining({ type: 'added', debug: true })]);
    const c = applyAction(G, s, dbg('close'), CONTENT).state;
    expect(c.prompt).toBeNull();
    expect(c.stack).toHaveLength(s.stack.length - 1);
    expect(() => applyAction(G, c, dbg('close'), CONTENT)).toThrow(/no prompt is open/);
  });
});
