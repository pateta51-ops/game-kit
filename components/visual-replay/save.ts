import { applyAction, createGame, restoreSave, type GameRules, type GameTypes, type SaveFormat } from '../engine-core/kernel.ts';
import { createReplay, ReplayError, type ReplayAdapter } from './index.ts';

export function fromSave<G extends GameTypes, V>(
  game: GameRules<G>, content: G['content'], raw: unknown, view: (state: G['state']) => V, format?: SaveFormat,
  presentation: Pick<ReplayAdapter<G['state'], G['action'], G['event'], V>, 'boundary' | 'isStep' | 'visibleEvent'> = {},
) {
  const result = restoreSave(game, raw, content, format, { actionFailure: true });
  if (!result.ok) {
    const message = result.actionError && result.actionError !== result.error ? `${result.error} ${result.actionError}` : result.error;
    throw new ReplayError(message, result.failedAt);
  }
  const { options, rules, actions } = result.save;
  const { boundary, isStep, visibleEvent } = presentation;
  return createReplay({
    start: () => createGame(game, options, rules, content).state,
    apply: (state, action) => applyAction(game, state, action, content),
    view,
    ...(boundary && { boundary }), ...(isStep && { isStep }), ...(visibleEvent && { visibleEvent }),
  }, { actions });
}
