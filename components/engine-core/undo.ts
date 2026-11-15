// Undo is replay to an earlier action count. A history is the options, the rules, every action
// played and a cursor (how many are applied). Redo replays the undone actions until a new action is recorded.
// Safe (default): the cursor may not go back past the last action whose events show hidden information (`reveal`);
// the refusal says why (ported from Warp's Edge undo.ts: the reason of the revealing event, in the game's words).
// Free: any cursor; `undoUsed` is set. No undo once `result` is set.
import { applyAction, createGame } from './apply';
import type { GameRules, GameTypes } from './types';

export type UndoMode = 'safe' | 'free';

export interface History<G extends GameTypes> {
  readonly options: G['options'];
  readonly rules: G['rules'];
  readonly actions: readonly G['action'][];
  readonly cursor: number;
  readonly undoUsed: boolean;
}

export interface HistoryResult<G extends GameTypes> {
  readonly ok: boolean;
  readonly history: History<G>;
  /** The state at the cursor; null only when the history itself is invalid (see `error`). */
  readonly state: G['state'] | null;
  readonly error: string | null;
}

export const newHistory = <G extends GameTypes>(options: G['options'], rules: G['rules']): History<G> => ({
  options,
  rules,
  actions: [],
  cursor: 0,
  undoUsed: false,
});

export const SOMETHING_REVEALED = 'Something hidden was revealed';

/** Why the events of one action cannot be undone in Safe mode, or null when they revealed nothing. */
export function revealReason<G extends GameTypes>(game: GameRules<G>, events: readonly G['event'][]): string | null {
  const first = events.find((e) => (e).reveal === true);
  return first === undefined ? null : (game.revealWords?.(first) ?? SOMETHING_REVEALED);
}

interface Rebuilt<G extends GameTypes> {
  readonly state: G['state'];
  /** The cursor just after the last revealing action (0 when none: the setup draw is not undoable anyway). */
  readonly boundary: number;
  /** Why that action revealed something. */
  readonly reason: string | null;
}

function rebuild<G extends GameTypes>(game: GameRules<G>, h: History<G>, content: G['content']): Rebuilt<G> {
  if (!Number.isInteger(h.cursor) || h.cursor < 0 || h.cursor > h.actions.length) {
    throw new RangeError('Invalid history cursor.');
  }
  let state = createGame(game, h.options, h.rules, content).state;
  let boundary = 0;
  let reason: string | null = null;
  for (let at = 0; at < h.cursor; at += 1) {
    const r = applyAction(game, state, h.actions[at] as G['action'], content);
    state = r.state;
    const why = revealReason(game, r.events);
    if (why !== null) {
      boundary = at + 1;
      reason = why;
    }
  }
  return { state, boundary, reason };
}

/** `rebuild`, with an illegal history (a bad cursor, an action the engine refuses) reported instead of thrown. */
function tryRebuild<G extends GameTypes>(game: GameRules<G>, h: History<G>, content: G['content']): Rebuilt<G> | string {
  try {
    return rebuild(game, h, content);
  } catch (e) {
    return `This history is damaged: ${String(e)}`;
  }
}

/** The state at the cursor; null for an illegal history. */
export function stateAt<G extends GameTypes>(game: GameRules<G>, h: History<G>, content: G['content']): G['state'] | null {
  const r = tryRebuild(game, h, content);
  return typeof r === 'string' ? null : r.state;
}

const refuse = <G extends GameTypes>(h: History<G>, state: G['state'] | null, error: string): HistoryResult<G> => ({
  ok: false,
  history: h,
  state,
  error,
});

/** Move the cursor to `next` and rebuild there; refused (no change) when that history is illegal. */
function moveTo<G extends GameTypes>(game: GameRules<G>, h: History<G>, next: History<G>, content: G['content']): HistoryResult<G> {
  const r = tryRebuild(game, next, content);
  return typeof r === 'string' ? refuse(h, null, r) : { ok: true, history: next, state: r.state, error: null };
}

/** Why undo is refused at this point of the history, or null when it is allowed. */
function refusal<G extends GameTypes>(h: History<G>, r: Rebuilt<G>, mode: UndoMode): string | null {
  if (r.state.result !== null) return 'The game is over: nothing can be undone.';
  if (h.cursor === 0) return 'Nothing to undo.';
  if (mode === 'safe' && h.cursor <= r.boundary) return r.reason ?? SOMETHING_REVEALED;
  return null;
}

/** May the last action be undone in this mode? With the reason when not. */
export function canUndo<G extends GameTypes>(
  game: GameRules<G>,
  h: History<G>,
  mode: UndoMode,
  content: G['content'],
): { ok: true } | { ok: false; reason: string } {
  const r = tryRebuild(game, h, content);
  const why = typeof r === 'string' ? r : refusal(h, r, mode);
  return why === null ? { ok: true } : { ok: false, reason: why };
}

/** Undo one action. Refused (no state change) after game over, at the start, or in Safe mode at the last reveal. */
export function undo<G extends GameTypes>(game: GameRules<G>, h: History<G>, mode: UndoMode, content: G['content']): HistoryResult<G> {
  const r = tryRebuild(game, h, content);
  if (typeof r === 'string') return refuse(h, null, r);
  const why = refusal(h, r, mode);
  if (why !== null) return refuse(h, r.state, why);
  return moveTo(game, h, { ...h, cursor: h.cursor - 1, undoUsed: h.undoUsed || mode === 'free' }, content);
}

/** Redo one undone action (none after game over or when nothing was undone). */
export function redo<G extends GameTypes>(game: GameRules<G>, h: History<G>, content: G['content']): HistoryResult<G> {
  const r = tryRebuild(game, h, content);
  if (typeof r === 'string') return refuse(h, null, r);
  if (r.state.result !== null || h.cursor === h.actions.length) return refuse(h, r.state, 'Nothing to redo.');
  return moveTo(game, h, { ...h, cursor: h.cursor + 1 }, content);
}

/** Take an action at the cursor: the undone actions after it are dropped. Refused when the engine refuses it. */
export function recordAction<G extends GameTypes>(
  game: GameRules<G>,
  h: History<G>,
  action: G['action'],
  content: G['content'],
): HistoryResult<G> {
  const r = tryRebuild(game, h, content);
  if (typeof r === 'string') return refuse(h, null, r);
  try {
    const next: History<G> = { ...h, actions: [...h.actions.slice(0, h.cursor), action], cursor: h.cursor + 1 };
    return { ok: true, history: next, state: applyAction(game, r.state, action, content).state, error: null };
  } catch (e) {
    return refuse(h, r.state, String(e));
  }
}

/** `recordAction` without the rebuild: `state` is the state at `h.cursor` (the caller keeps it); also returns the events of the action. */
export function appendAction<G extends GameTypes>(
  game: GameRules<G>,
  h: History<G>,
  state: G['state'],
  action: G['action'],
  content: G['content'],
): HistoryResult<G> & { readonly events: readonly G['event'][] } {
  if (!Number.isInteger(h.cursor) || h.cursor < 0 || h.cursor > h.actions.length) {
    return { ...refuse(h, state, 'Invalid history cursor.'), events: [] };
  }
  try {
    const r = applyAction(game, state, action, content);
    const next: History<G> = { ...h, actions: [...h.actions.slice(0, h.cursor), action], cursor: h.cursor + 1 };
    return { ok: true, history: next, state: r.state, error: null, events: r.events };
  } catch (e) {
    return { ...refuse(h, state, String(e)), events: [] };
  }
}
