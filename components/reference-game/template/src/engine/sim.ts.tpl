// sim-pool and replay-cli module from the one game object: `simGame` (drivers `opponent`, from each seat's view only, `random`, and `automa`, the same Bot the store plays) and `specs`.
import type { GoldenSpec } from '../../kit/replay-cli/golden.ts';
import { botDriverOf, simGameOf } from '../../kit/game-store/sim.ts';
import { BOTS } from './automa.ts';
import { REF } from './game.ts';

export const automaDriver = botDriverOf(REF, BOTS.normal);
export const simGame = simGameOf(REF, { drivers: { automa: automaDriver }, summary: (state) => ({ winner: state.result?.winner ?? null }), maxActions: 500 });

export const specs: readonly GoldenSpec[] = [
  { name: 'opponent-1', driver: 'opponent' },
  { name: 'random-1', driver: 'random' },
  { name: 'automa-1', driver: 'automa' },
];
