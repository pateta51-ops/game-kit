// The fake counter with a game-side leak: a module-level count of the games this thread has played changes the driver.
import type { Counter } from '../../engine-core/fake/counter.ts';
import { randomDriver, type SimGame } from '../index.ts';
import { simGame as base } from './game.ts';

let played = 0;
export const simGame: SimGame<Counter, { adds: number }> = {
  ...base,
  driver() {
    const first = played === 0;
    played += 1;
    return randomDriver<Counter>((a) => (first || a.picks[0] === 'add' ? 1 : 0));
  },
};
