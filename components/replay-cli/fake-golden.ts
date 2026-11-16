import type { Counter } from '../engine-core/fake/counter';
import type { Driver, SimGame } from '../sim-pool/index';
import { simGame as base } from '../sim-pool/fake/game';
import type { GoldenSpec } from './golden';

const fixed = (name: string): Driver<Counter> => ({
  name,
  reasons: () => [],
  choose: (_s, answers) => answers[name === 'adds' ? 0 : answers.length - 1] as Counter['action'],
});

export const simGame: SimGame<Counter, { adds: number }> = { ...base, driver: (name) => fixed(name) };
export const goldens: GoldenSpec[] = [
  { name: 'g01-adds', driver: 'adds' },
  { name: 'g02-draws-long', driver: 'draws', settings: { target: 15 } },
];
export const few: GoldenSpec[] = [{ name: 'f01', driver: 'adds', seed: 'few' }];
