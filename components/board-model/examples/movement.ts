import { createBoard, type Board } from '../index.ts';
import { displaceChain, reachableMoves, type ChainOptions } from '../movement.ts';

const lane: Board = {
  ...createBoard([{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
  adjacency: { a: ['b'], b: ['c'], c: [] },
};

export function directedExample(from: string) {
  return reachableMoves(lane, from, {
    points: 2,
    cost: start => start === 'a' ? 2 : 0,
    end: space => space !== 'b',
  });
}

export function pushInOneTransition(
  board: Board,
  positions: Readonly<Record<string, string>>,
  from: string,
  options: ChainOptions,
) {
  const occupants = new Map(Object.entries(positions).map(([piece, space]) => [space, piece] as const));
  const plan = displaceChain(board, from, occupants, options);
  // Moves include every piece in a complete result or interrupted prefix. Publish the whole batch.
  const moved = plan.moves.length > 0
    ? { ...positions, ...Object.fromEntries(plan.moves.map(({ piece, to }) => [piece, to])) }
    : positions;
  return { plan, positions: moved };
}
