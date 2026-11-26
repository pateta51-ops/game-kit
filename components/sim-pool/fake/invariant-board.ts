import { board, faults, type BoardGame } from '../../engine-core/fake/invariant-board.ts';
import { randomDriver, type SimGame } from '../index.ts';

export const simGame: SimGame<BoardGame> = {
  rules: { ...board, invariantPolicy: 'strict' },
  content: () => null,
  start: spec => ({ options: { seed: spec.seed }, rules: {} }),
  driver: () => randomDriver<BoardGame>(),
  answers: s => faults.map(pick => ({ kind: 'answer', promptId: s.prompt?.id ?? -1, picks: [pick] })),
};
