// Undo by step (ported from Imperium's ui/store/history.ts), beside the per-action undo of undo.ts. A step is one
// decision of the player plus the answers the settings gave after it, so one Undo takes back what one click did. The
// newest `keep` steps hold the state before them, older ones only every `every`-th; a missing one is replayed from the
// nearest before it. Nothing here is stored by the kit: a game that wants the same steps after a reload stores where they
// start (`h.steps.map((s) => s.start)`) and calls `replaySteps`.
import { applyAction, createGame } from './apply.ts';
import type { GameRules, GameTypes, LocatedTriggerCap } from './types.ts';
import { randomReason, revealReason, type UndoMode } from './undo.ts';

export interface Step<G extends GameTypes> {
  /** Index in `actions` of the player's decision. */
  readonly start: number;
  /** The decision and the answers that joined it. */
  readonly count: number;
  /** Why the step cannot be undone in Safe mode (its first revealing event), or null. */
  readonly reason: string | null;
  /** The state before the step; null once let go. */
  readonly before: G['state'] | null;
}

export interface StepHistory<G extends GameTypes> {
  /** Undo never goes before this state, reached after `baseCount` actions. */
  readonly base: G['state'];
  readonly baseCount: number;
  /** Every action applied to reach `state`. */
  readonly actions: readonly G['action'][];
  readonly state: G['state'];
  /** The first truncation on the current action history. */
  readonly triggerCap?: LocatedTriggerCap;
  readonly steps: readonly Step<G>[];
  /** The steps taken back, the next one to redo last. */
  readonly redo: readonly (readonly G['action'][])[];
  /** A Free undo was made. */
  readonly undoUsed: boolean;
  /** A Free undo took back a step that revealed something. */
  readonly peeked: boolean;
  readonly keep: number;
  readonly every: number;
}

export interface StepOptions {
  /** How many of the newest steps keep their state (default 60). */
  readonly keep?: number;
  /** Older steps keep theirs every this many (default 20; 0: none). */
  readonly every?: number;
}

export interface StepResult<G extends GameTypes> {
  readonly ok: boolean;
  /** Unchanged when refused. */
  readonly history: StepHistory<G>;
  readonly events: readonly G['event'][];
  readonly error: string | null;
}

export const KEEP_STEPS = 60;
export const CHECKPOINT_EVERY = 20;

/** A history that starts at `state`, reached by `actions`. */
export const newSteps = <G extends GameTypes>(state: G['state'], actions: readonly G['action'][] = [], o: StepOptions = {}): StepHistory<G> => ({
  base: state,
  baseCount: actions.length,
  actions,
  state,
  steps: [],
  redo: [],
  undoUsed: false,
  peeked: false,
  keep: o.keep ?? KEEP_STEPS,
  every: o.every ?? CHECKPOINT_EVERY,
});

const refuse = <G extends GameTypes>(h: StepHistory<G>, error: string): StepResult<G> => ({ ok: false, history: h, events: [], error });

function capped<G extends GameTypes>(h: StepHistory<G>, steps: Step<G>[]): Step<G>[] {
  const i = steps.length - 1 - h.keep;
  const s = steps[i];
  if (s === undefined || s.before === null || (h.every > 0 && i % h.every === 0)) return steps;
  steps[i] = { ...s, before: null };
  return steps;
}

function play<G extends GameTypes>(
  game: GameRules<G>,
  h: StepHistory<G>,
  actions: readonly G['action'][],
  content: G['content'],
  join: boolean,
  redo: StepHistory<G>['redo'],
): StepResult<G> {
  let state = h.state;
  let reason: string | null = null;
  let triggerCap = h.triggerCap;
  const events: G['event'][] = [];
  try {
    for (const [index, a] of actions.entries()) {
      const r = applyAction(game, state, a, content);
      if (r.triggerCap !== undefined) triggerCap ??= { ...r.triggerCap, actionIndex: h.actions.length + index };
      reason ??= revealReason(game, r.events) ?? randomReason(game, state, r.state);
      state = r.state;
      for (const e of r.events) events.push(e);
    }
  } catch (e) {
    return refuse(h, String(e));
  }
  const all = [...h.actions, ...actions];
  const top = h.steps.at(-1);
  const next: StepHistory<G> =
    join && top === undefined
      ? { ...h, actions: all, state, base: state, baseCount: all.length, redo }
      : {
          ...h,
          actions: all,
          state,
          redo,
          steps:
            join && top !== undefined
              ? [...h.steps.slice(0, -1), { ...top, count: top.count + actions.length, reason: top.reason ?? reason }]
              : capped(h, [...h.steps, { start: h.actions.length, count: actions.length, reason, before: h.state }]),
        };
  return { ok: true, history: triggerCap === undefined ? next : { ...next, triggerCap }, events, error: null };
}

/** A decision of the player: a new step. The steps to redo are forgotten. Refused when the engine refuses the action. */
export const addStep = <G extends GameTypes>(game: GameRules<G>, h: StepHistory<G>, action: G['action'], content: G['content']): StepResult<G> =>
  play(game, h, [action], content, false, []);

/** An answer the settings gave: it joins the top step (with no step yet, the start of the game). */
export const extendStep = <G extends GameTypes>(game: GameRules<G>, h: StepHistory<G>, action: G['action'], content: G['content']): StepResult<G> =>
  play(game, h, [action], content, true, []);

export interface UndoStepOptions {
  /** Allow undo once `result` is set (default: refused, as `undo`). */
  readonly afterGameOver?: boolean;
}

/** May the top step be undone in this mode? `peek`: it revealed something (Free only). */
export function canUndoStep<G extends GameTypes>(
  h: StepHistory<G>,
  mode: UndoMode,
  o: UndoStepOptions = {},
): { readonly ok: true; readonly peek: boolean } | { readonly ok: false; readonly reason: string } {
  if (h.state.result !== null && o.afterGameOver !== true) return { ok: false, reason: 'The game is over: nothing can be undone.' };
  const top = h.steps.at(-1);
  if (top === undefined) return { ok: false, reason: 'Nothing to undo.' };
  if (top.reason !== null && mode === 'safe') return { ok: false, reason: top.reason };
  return { ok: true, peek: top.reason !== null };
}

/** Take the top step back: the state before it, its actions onto the redo list. */
export function undoStep<G extends GameTypes>(
  game: GameRules<G>,
  h: StepHistory<G>,
  mode: UndoMode,
  content: G['content'],
  o: UndoStepOptions = {},
): StepResult<G> {
  const can = canUndoStep(h, mode, o);
  if (!can.ok) return refuse(h, can.reason);
  const index = h.steps.length - 1;
  const top = h.steps[index] as Step<G>;
  let from = index;
  while (from >= 0 && h.steps[from]?.before === null) from -= 1;
  const anchor = h.steps[from];
  let state = anchor?.before ?? h.base;
  try {
    for (let i = anchor?.start ?? h.baseCount; i < top.start; i += 1) state = applyAction(game, state, h.actions[i] as G['action'], content).state;
  } catch (e) {
    return refuse(h, `This history is damaged: ${String(e)}`);
  }
  const { triggerCap, ...retained } = h;
  return {
    ok: true,
    events: [],
    error: null,
    history: {
      ...retained,
      ...(triggerCap !== undefined && (triggerCap.actionIndex === null || triggerCap.actionIndex < top.start) ? { triggerCap } : {}),
      state,
      actions: h.actions.slice(0, top.start),
      steps: h.steps.slice(0, index),
      redo: [...h.redo, h.actions.slice(top.start)],
      undoUsed: h.undoUsed || mode === 'free',
      peeked: h.peeked || can.peek,
    },
  };
}

/** Play the step taken back last again. */
export function redoStep<G extends GameTypes>(game: GameRules<G>, h: StepHistory<G>, content: G['content']): StepResult<G> {
  const next = h.redo.at(-1);
  return next === undefined ? refuse(h, 'Nothing to redo.') : play(game, h, next, content, false, h.redo.slice(0, -1));
}

export type ReplayedSteps<G extends GameTypes> =
  | { readonly ok: true; readonly history: StepHistory<G> }
  | { readonly ok: false; readonly failedAt: number | null; readonly error: string };

/**
 * Rebuild a history from a recorded game. `starts`: the indexes where steps start, or a function saying whether the
 * action at `index`, answering the open prompt of `state`, was the player's (false: the settings', it joins the step).
 */
export function replaySteps<G extends GameTypes>(
  game: GameRules<G>,
  options: G['options'],
  rules: G['rules'],
  actions: readonly G['action'][],
  content: G['content'],
  starts: readonly number[] | ((state: G['state'], action: G['action'], index: number) => boolean),
  o: StepOptions = {},
): ReplayedSteps<G> {
  let h: StepHistory<G>;
  try {
    const first = createGame(game, options, rules, content);
    h = newSteps<G>(first.state, [], o);
    if (first.triggerCap !== undefined) h = { ...h, triggerCap: { ...first.triggerCap, actionIndex: null } };
  } catch (e) {
    return { ok: false, failedAt: null, error: String(e) };
  }
  const set = typeof starts === 'function' ? null : new Set(starts);
  for (const [index, action] of actions.entries()) {
    const start = set === null ? (starts as (state: G['state'], action: G['action'], index: number) => boolean)(h.state, action, index) : set.has(index);
    const r = play(game, h, [action], content, !start, []);
    if (!r.ok) return { ok: false, failedAt: index, error: r.error ?? '' };
    h = r.history;
  }
  return { ok: true, history: h };
}
