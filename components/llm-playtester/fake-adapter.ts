import type { GameAdapter } from './playtest.ts';

// A tiny game for tests: add 1 or 2 to a total; exactly 4 wins, more loses. `throwAt` makes choose throw at that total.
export function createAdapter(throwAt = -1): GameAdapter {
  let total = 0;
  const moves: number[] = [];
  return {
    name: 'fakeGame',
    rulesText: () => 'Add 1 or 2 each turn. Reach exactly 4 to win; more loses.',
    start: () => {
      total = 0;
      moves.length = 0;
    },
    view: () => `Total ${total}`,
    options: () => ['add 1', 'add 2'],
    choose: (i) => {
      if (total === throwAt) throw new Error('broken move');
      total += i + 1;
      moves.push(i);
    },
    done: () => (total < 4 ? null : { won: total === 4, summary: `total ${total}` }),
    replay: () => ({ moves }),
  };
}
export default createAdapter;
