import { useSyncExternalStore } from 'react';
import { makeSaves } from '../../kit/saves/index.ts';
import { createSettingsStore, type SettingsSchema } from '../../kit/settings/index.ts';
import { createGameStore, type GameSnap } from '../../kit/game-store/index.ts';
import { defaultSetup, type Setup, type SetupSpec } from '../../kit/screens/index.ts';
import { CONTENT, GAME_DEF, STUB, type Stub, type StubState } from '../engine/api.ts';

export const SCHEMA = {
  storageKey: '{{id}}-settings',
  sections: [{ id: 'play', title: 'Play', settings: [{ kind: 'toggle', key: 'hints', label: 'Show hints', default: true }] }],
} as const satisfies SettingsSchema;
export const useSettings = createSettingsStore(SCHEMA);
export const saves = makeSaves({ game: STUB, content: CONTENT, database: '{{id}}', filePrefix: '{{id}}' });

export const SPEC: SetupSpec = { seats: { min: 1, max: 1, kinds: [{ value: 'human', label: 'Human' }], names: true } };
export const INITIAL: Setup = defaultSetup(SPEC);

let setup = INITIAL;
// the set-up reaches the rules through the seed: the first seat's name prefixes it
export const game = createGameStore(
  { ...GAME_DEF, start: (seed) => GAME_DEF.start(`${setup.seats[0]?.name ?? ''}${seed}`) },
  { seat: 'me', saves, saveName: () => '{{name}}', undo: 'free' },
);
export const useGame = (): GameSnap<Stub, StubState> => useSyncExternalStore(game.subscribe, game.get);
let running = false;
export const isRunning = (): boolean => running;
export const startGame = (x: Setup, seed = String(Date.now())): void => {
  setup = x;
  running = true;
  game.fresh(seed);
};
