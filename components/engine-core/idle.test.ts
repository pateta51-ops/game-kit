// K91 (netrunner change-in-game-state): does-nothing is checked apart from legality.
import { describe, expect, it } from 'vitest';
import { createGame, doesNothing, draftOf, idleProblems, markIdle, validateAction, type Ctx, type GameRules, type KernelOption } from './index.ts';
import { CONTENT, COUNTER, RULES, type Counter, type CounterState, type CounterTask } from './fake/counter.ts';

const game = (mark: (id: string) => string | undefined): GameRules<Counter> => ({
  ...COUNTER,
  handlers: {
    ...COUNTER.handlers,
    turn: (ctx: Ctx<Counter>) => {
      ctx.then({ kind: 'chosen' });
      const options: KernelOption[] = [
        { id: 'add', enabled: true },
        { id: 'wait', enabled: true },
        { id: 'skip', enabled: false, why: 'never' },
      ];
      ctx.ask({ min: 1, max: 1, options: markIdle(options, mark) });
    },
    chosen: (ctx: Ctx<Counter>, t: CounterTask) => {
      if (t.answer?.[0] === 'add') draftOf(ctx).counter += 1;
      ctx.then({ kind: 'turn' });
    },
  },
});
const view = (s: CounterState): unknown => ({ counter: s.counter, pile: s.pile, result: s.result });
const start = (g: GameRules<Counter>): CounterState => createGame(g, { seed: 'k91' }, RULES, CONTENT).state;

describe('does-nothing check (K91)', () => {
  it('an idle option stays legal and is probed as changing nothing', () => {
    const g = game((id) => (id === 'wait' ? 'Nothing to wait for' : undefined));
    const s = start(g);
    const p = s.prompt;
    expect(p?.options.find((o) => o.id === 'wait')?.idle).toBe('Nothing to wait for');
    expect(validateAction(s, { kind: 'answer', promptId: p?.id ?? 0, picks: ['wait'] }).ok).toBe(true);
    expect(doesNothing(g, s, ['wait'], CONTENT, view)).toBe(true);
    expect(doesNothing(g, s, ['add'], CONTENT, view)).toBe(false);
    expect(idleProblems(g, s, CONTENT, view)).toEqual([]);
  });

  it('reports an unmarked option that does nothing and a marked one that changes the game', () => {
    expect(idleProblems(game(() => undefined), start(game(() => undefined)), CONTENT, view)).toEqual(['"wait" changes nothing but is not marked idle']);
    const g = game((id) => (id === 'add' ? 'x' : id === 'wait' ? 'y' : undefined));
    expect(idleProblems(g, start(g), CONTENT, view)).toEqual(['"add" is marked idle (x) but changes the game']);
  });
});
