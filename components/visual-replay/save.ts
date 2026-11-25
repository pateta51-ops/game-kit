import { applyAction, createGame, replay, restoreSave, type GameRules, type GameTypes, type SaveFormat } from '../engine-core/kernel.ts';
import { createReplay, ReplayError, type ReplayAdapter } from './index.ts';

export function fromSave<G extends GameTypes, V>(game: GameRules<G>, content: G['content'], raw: unknown, view: (state: G['state']) => V, format?: SaveFormat, presentation: Pick<ReplayAdapter<G['state'], G['action'], G['event'], V>, 'boundary' | 'isStep'> = {}) {
  const result = restoreSave(game, raw, content, format);
  if (!result.ok) {
    if (raw && typeof raw === 'object' && 'actions' in raw && 'options' in raw && 'rules' in raw && Array.isArray(raw.actions)) {
      const input = raw as { options: G['options']; rules: G['rules']; actions: G['action'][] };
      const check = replay(game, input.options, input.rules, input.actions, content);
      if (check.failedAt !== null) throw new ReplayError(`${result.error} ${check.error ?? ''}`, check.failedAt);
    }
    throw new ReplayError(result.error);
  }
  const { options, rules, actions } = result.save;
  return createReplay({ start: () => createGame(game, options, rules, content).state, apply: (state, action) => applyAction(game, state, action, content), view, ...presentation }, { actions });
}
