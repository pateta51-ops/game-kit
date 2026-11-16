import { useSyncExternalStore } from 'react';
import { makeSaves } from '../../kit/saves/index.ts';
import { createSettingsStore, type SettingsSchema } from '../../kit/settings/index.ts';
import { autoAnswer } from '../../kit/prompt-host/index.ts';
import { createGameStore, type GameSnap } from '../../kit/game-store/index.ts';
import { CONTENT, GAME, REF, type Ref, type RefView, type Seat } from '../engine/api.ts';

export const SCHEMA = {
  storageKey: '{{id}}-settings',
  sections: [
    {
      id: 'play',
      title: 'Play',
      settings: [
        { kind: 'toggle', key: 'obvious', label: 'Answer obvious questions', default: true },
        { kind: 'choice', key: 'seat', label: 'You play', options: [{ value: 0, label: 'First' }, { value: 1, label: 'Second' }], default: 0 },
      ],
    },
  ],
} as const satisfies SettingsSchema;
export const useSettings = createSettingsStore(SCHEMA);
export const saves = makeSaves({ game: GAME, content: CONTENT, database: '{{id}}', filePrefix: '{{id}}' });
export const mySeat = (): Seat => String(useSettings.getState().values.seat) as Seat;

// the one game store: forced answers from the setting, the other seat answered by REF.opponent from its own view, autosave
export const game = createGameStore({ ...REF, forced: (p) => autoAnswer(p, useSettings.getState().values.obvious) }, { seat: mySeat, saves, saveName: () => '{{name}}', undo: 'free' });
export const useGame = <T = GameSnap<Ref, RefView>>(pick: (s: GameSnap<Ref, RefView>) => T = (s) => s as T): T => useSyncExternalStore(game.subscribe, () => pick(game.get()));
