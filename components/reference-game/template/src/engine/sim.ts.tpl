// sim-pool and replay-cli module from the one game object: `simGame` (drivers `opponent`, from each seat's view only, and `random`) and `specs`.
import type { GoldenSpec } from '../../kit/replay-cli/golden.ts';
import { simGameOf } from '../../kit/game-store/sim.ts';
import { REF } from './rules.ts';

export const simGame = simGameOf(REF, { summary: (state) => ({ winner: state.result?.winner ?? null }), maxActions: 500 });

export const specs: readonly GoldenSpec[] = [
  { name: 'opponent-1', driver: 'opponent' },
  { name: 'random-1', driver: 'random' },
];
