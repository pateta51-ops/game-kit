import { afterEach, describe, expect, it } from 'vitest';
import { pushInOneTransition } from '../components/board-model/examples/movement.ts';
import type { Board } from '../components/board-model/index.ts';
import { applyAction, createGame, draftOf, seedRng, setInvariantChecking, type AnswerAction, type GameRules, type KernelState } from '../components/engine-core/index.ts';
import { gridMap, line } from '../components/grid-map/index.ts';

interface CorridorState extends KernelState {
  readonly positions: Readonly<Record<string, string>>;
  readonly destination: string;
  readonly remaining: number;
}
interface CorridorGame {
  readonly state: CorridorState;
  readonly action: AnswerAction;
  readonly task: { readonly kind: string; readonly answer?: readonly string[] };
  readonly prompt: NonNullable<CorridorState['prompt']>;
  readonly event: CorridorState['log'][number];
  readonly stamped: never;
  readonly options: { readonly seed: string };
  readonly rules: Record<string, never>;
  readonly content: null;
}

const grid = gridMap({ rows: 1, cols: 5 });
const board: Board = {
  spaces: Object.fromEntries(grid.spaces.map(id => [id, { id }])),
  order: grid.spaces,
  adjacency: grid.adjacency.orth,
};
const initial = { first: 'r0c0', second: 'r0c1', third: 'r0c2' };
const options = { seed: 'corridor' };
const game: GameRules<CorridorGame> = {
  blank({ seed }) {
    const [a, b, c, d] = seedRng(seed);
    return {
      rng: { a, b, c, d }, seq: 0, promptSeq: 0, stack: [], prompt: null, log: [], result: null,
      positions: { ...initial }, destination: initial.first, remaining: 2,
    };
  },
  contentHash: () => 'corridor',
  setup(ctx) { ctx.then({ kind: 'prompt' }); },
  handlers: {
    prompt(ctx) {
      const s = draftOf(ctx);
      const ids = s.remaining === 1 ? ['continue'] : ['shove', 'blocked', 'interrupt', 'corrupt'];
      ctx.ask({ min: 1, max: 1, options: ids.map(id => ({ id, enabled: true })) }, { kind: 'resolve' });
    },
    resolve(ctx, task) {
      const s = draftOf(ctx);
      const move = task.answer?.[0];
      const { plan, positions } = pushInOneTransition(board, s.positions, s.destination, {
        steps: s.remaining,
        next: space => line(grid, space, 'e', { length: 1, stopAtWall: true })[0],
        canPush: () => true,
        blocked: (_piece, _from, to) => move === 'blocked' && to === 'r0c4',
        stop: () => move === 'interrupt',
      });
      s.positions = move === 'corrupt' ? { ...s.positions, first: plan.destination } : { ...positions };
      s.destination = plan.destination;
      s.remaining = plan.remaining;
      if (plan.stop === 'interrupted') ctx.then({ kind: 'prompt' });
      else s.result = plan.stop;
    },
  },
  invariants(state) {
    const spaces = Object.values(state.positions);
    return spaces.length === Object.keys(initial).length && new Set(spaces).size === spaces.length &&
      spaces.every(space => Object.hasOwn(board.spaces, space)) ? [] :
      [{ id: 'corridor-occupancy', message: 'each piece must occupy a distinct board space' }];
  },
};
const answer = (state: CorridorState, id: string): AnswerAction => ({
  kind: 'answer', promptId: state.prompt?.id ?? -1, picks: [id],
});
const start = () => createGame(game, options, {}, null).state;

afterEach(() => setInvariantChecking(false));

describe('weighted board displacement in the kernel', () => {
  it('applies a full chain in one action and leaves the input snapshot intact', () => {
    setInvariantChecking(true);
    const state = start();
    const result = applyAction(game, state, answer(state, 'shove'), null);
    expect(result.state).toMatchObject({
      positions: { first: 'r0c2', second: 'r0c3', third: 'r0c4' }, result: 'complete',
    });
    expect(state.positions).toEqual(initial);
    expect(result.violations).toEqual([]);
  });

  it('does not apply any positions when a later link is blocked', () => {
    setInvariantChecking(true);
    const state = start();
    const result = applyAction(game, state, answer(state, 'blocked'), null);
    expect(result.state).toMatchObject({ positions: initial, result: 'blocked', remaining: 2 });
    expect(state.positions).toEqual(initial);
    expect(result.violations).toEqual([]);
  });

  it('applies a complete prefix before asking to continue the interrupted chain', () => {
    setInvariantChecking(true);
    const state = start();
    const prefix = applyAction(game, state, answer(state, 'interrupt'), null);
    expect(prefix.state).toMatchObject({
      positions: { first: 'r0c1', second: 'r0c2', third: 'r0c3' }, result: null, remaining: 1,
    });
    expect(prefix.violations).toEqual([]);
    const finished = applyAction(game, prefix.state, answer(prefix.state, 'continue'), null);
    expect(finished.state).toMatchObject({
      positions: { first: 'r0c2', second: 'r0c3', third: 'r0c4' }, result: 'complete', remaining: 0,
    });
    expect(finished.violations).toEqual([]);
  });

  it('detects a game applying only part of the simultaneous plan', () => {
    setInvariantChecking(true);
    const state = start();
    const result = applyAction(game, state, answer(state, 'corrupt'), null);
    expect(result.violations).toMatchObject([{ id: 'corridor-occupancy' }]);
    expect(state.positions).toEqual(initial);
  });
});
