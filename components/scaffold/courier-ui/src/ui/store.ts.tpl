import { useSyncExternalStore } from 'react';
import { makeSaves } from '../../kit/saves/index.ts';
import { createSettingsStore, type SettingsSchema } from '../../kit/settings/index.ts';
import { createGameStore, type GameSnap } from '../../kit/game-store/index.ts';
import { defaultSetup, type Setup, type SetupSpec } from '../../kit/screens/index.ts';
import { CONFIG, CONTENT, COURIER, GAME_DEF, startCourier, type Courier, type CourierView } from '../engine/api.ts';
import { title } from './text.ts';

export const SCHEMA = {
  storageKey: '{{id}}-settings',
  sections: [{ id: 'play', title: 'Play', settings: [{ kind: 'toggle', key: 'hints', label: 'Show route instructions', default: true }] }],
} as const satisfies SettingsSchema;
export const useSettings = createSettingsStore(SCHEMA);
export const saves = makeSaves({ game: COURIER, content: CONTENT, database: '{{id}}', filePrefix: '{{id}}' });
export const SPEC: SetupSpec = {
  seats: { min: 1, max: 1, kinds: [{ value: 'human', label: 'Human' }] },
  extra: [{ key: 'allowance', label: 'Movement allowance', options: CONFIG.allowances.map(value => ({ value: String(value), label: `${String(value)} moves` })) }],
};
export const INITIAL: Setup = defaultSetup(SPEC);
let allowance = Number(INITIAL['allowance']);
export const game = createGameStore(
  { ...GAME_DEF, start: seed => startCourier(seed, allowance) },
  { seat: 'courier', saves, saveName: () => title, undo: 'free' },
);
export const useGame = (): GameSnap<Courier, CourierView> => useSyncExternalStore(game.subscribe, game.get);
let running = false;
export const isRunning = (): boolean => running;
export const loadGame = (save: Parameters<typeof game.load>[0]): string | undefined => {
  const error = game.load(save);
  if (error !== null) return error;
  running = true;
  return undefined;
};
export const startGame = (setup: Setup, seed = String(Date.now())): void => {
  const next = Number(setup['allowance']);
  startCourier(seed, next);
  allowance = next;
  running = true;
  game.fresh(seed);
};
