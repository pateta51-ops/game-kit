import { create } from 'zustand';
import { makeSaves } from '../../kit/saves/index';
import { createSettingsStore, type SettingsSchema } from '../../kit/settings/index';
import type { SaveFile } from '../../kit/engine-core/index';
import { appendAction, CONTENT, createGame, GAME, greedyPicks, newHistory, RULES, viewOf, type History, type Ref, type RefState, type Seat } from '../engine/api';

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

interface Game {
  readonly history: History<Ref>;
  readonly state: RefState;
}
const me = (): Seat => useSettings.getState().values.seat;

// the other seat answers at once with the simple driver, from its own view only
function settle(g: Game): Game {
  let { history, state } = g;
  while (state.prompt !== null && state.prompt.seat !== me()) {
    const r = appendAction(GAME, history, state, { kind: 'answer', promptId: state.prompt.id, picks: greedyPicks(viewOf(state, state.prompt.seat)) }, CONTENT);
    if (!r.ok || r.state === null) throw new Error(r.error ?? 'refused');
    history = r.history;
    state = r.state;
  }
  return { history, state };
}

export const useGame = create<Game & { fresh: (seed: string) => void; answer: (picks: readonly string[], promptId?: number) => void; load: (save: SaveFile<Ref>) => string | void }>()((set, get) => ({
  ...settle({ history: newHistory<Ref>({ seed: 'start' }, RULES), state: createGame(GAME, { seed: 'start' }, RULES, CONTENT).state }),
  fresh: (seed) => set(settle({ history: newHistory<Ref>({ seed }, RULES), state: createGame(GAME, { seed }, RULES, CONTENT).state })),
  answer: (picks, promptId) => {
    const { history, state } = get();
    if (state.prompt === null || state.prompt.id !== promptId) return;
    const r = appendAction(GAME, history, state, { kind: 'answer', promptId, picks }, CONTENT);
    if (!r.ok || r.state === null) return;
    const g = settle({ history: r.history, state: r.state });
    set(g);
    void saves.writeAutosave(g.history, '{{name}}');
  },
  load: (save) => {
    const r = saves.restore({ name: '', save });
    if (!r.ok) return r.error;
    set(settle({ history: saves.historyOf(save), state: r.state }));
    return undefined;
  },
}));
