// `validateAction`, `applyAction` and `createGame` (ported from Warp's Edge core/apply.ts). At any moment the
// state holds an open prompt or the game is over, and every action answers that prompt. The answer is checked against
// the open prompt: its id, the option ids, the number of picks (min..max) and repeats. A disabled option is NOT_LEGAL;
// any other bad answer BAD_CHOICE.
//
// `validateAction` never throws: it says why an answer is refused. `applyAction` throws an `IllegalActionError` for an
// answer `validateAction` refuses (the UI only sends valid ones), and an `EngineBugError` only when an internal invariant
// breaks (a runaway task loop, a corrupt state).
import { closeDraft, copyList, copyMode, openDraft } from './cow';
import { copyState, freezeState, isFreezing } from './copy';
import { makeCtx } from './ctx';
import type { Draft } from './draft';
import { EngineBugError, IllegalActionError } from './errors';
import { GameOver } from './gameOver';
import { run } from './runner';
import type { ApplyResult, Ctx, GameRules, GameTypes, HandlerTable, KernelEvent, KernelState, KernelTask } from './types';

/** The verdict of `validateAction`: `error` is "CODE: message". */
export type ValidationResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

const OK: ValidationResult = { ok: true };
const no = (code: string, message: string): ValidationResult => ({ ok: false, error: `${code}: ${message}` });

/** "Reveal marks": an action whose result emitted a revealing event cannot be undone in Safe mode. */
export const isRevealing = (events: readonly KernelEvent[]): boolean => events.some((e) => e.reveal === true);

let checking = false;

/** Dev and test builds check the game's invariants after every action: `applyAction` then fills `violations`. Off by default. */
export function setInvariantChecking(on: boolean): void {
  checking = on;
}

/** Is invariant checking on? */
export const isChecking = (): boolean => checking;

/**
 * `validateAction`: is this action an acceptable answer to the open prompt? Every legality check lives in the
 * prompt's options (disabled options stay listed with a reason), so the content is not read.
 */
export function validateAction<G extends GameTypes>(state: G['state'], action: G['action']): ValidationResult {
  if (state.result !== null) return no('GAME_OVER', 'The game is over.');
  if ((action as { kind?: unknown }).kind !== 'answer') {
    return no('BAD_ACTION', 'Every action answers the open prompt.');
  }
  const prompt = state.prompt;
  if (prompt === null) return no('NO_PROMPT', 'No prompt is open.');
  if (action.promptId !== prompt.id) return no('WRONG_PROMPT', 'That prompt is not open.');
  const picks = action.picks as unknown;
  if (!Array.isArray(picks) || picks.some((id) => typeof id !== 'string')) {
    return no('BAD_CHOICE', 'Answer with a list of option ids.');
  }
  const chosen = picks as string[];
  if (chosen.length < prompt.min || chosen.length > prompt.max) {
    const range =
      prompt.min === prompt.max ? String(prompt.min) : `${String(prompt.min)} to ${String(prompt.max)}`;
    return no('BAD_CHOICE', `Choose ${range} option(s), not ${String(chosen.length)}.`);
  }
  if (new Set(chosen).size !== chosen.length) return no('BAD_CHOICE', 'Each option can be chosen only once.');
  for (const id of chosen) {
    const option = prompt.options.find((o) => o.id === id);
    if (option === undefined) return no('BAD_CHOICE', `"${id}" is not an option of this prompt.`);
    if (!option.enabled) {
      return no('NOT_LEGAL', `"${id}" cannot be chosen${option.why === undefined ? '' : `: ${option.why}`}.`);
    }
  }
  return OK;
}

/**
 * The working state of a copy-on-write action: the top level copied (same keys, same order), the task stack copied (every
 * action pushes and pops it; its tasks are never changed in place), everything else shared.
 */
function shallowState(state: KernelState): Draft<KernelState> {
  const out = { ...state } as Draft<KernelState>;
  out.stack = copyList(state.stack) as Draft<KernelTask>[];
  return out;
}

const violationsOf = <G extends GameTypes>(
  game: GameRules<G>,
  state: G['state'],
  content: G['content'],
  events: readonly G['event'][],
  prev?: G['state'],
): ApplyResult<G>['violations'] => (checking ? (game.invariants?.(state, content, events, prev) ?? []) : []);

/** `applyAction` with the handler table of the caller: the kernel's own tests run small synthetic tables. */
export function applyActionWith<G extends GameTypes>(
  game: GameRules<G>,
  state: G['state'],
  action: G['action'],
  content: G['content'],
  table: HandlerTable<G>,
): ApplyResult<G> {
  const check = validateAction<G>(state, action);
  if (!check.ok) throw new IllegalActionError(check.error);
  const events: G['event'][] = [];
  // Copy on write (cow.ts): the working state shares every container with the input until a handler writes to it
  // through the barrier. With freezing on the input is frozen first (already so for every state the engine returned), so
  // a write that misses the barrier throws instead of changing the input.
  const full = copyMode() === 'full';
  if (!full && isFreezing()) freezeState(state);
  const next = full ? (copyState(state) as Draft<KernelState>) : shallowState(state);
  const prev = openDraft(next, full);
  try {
    const ctx = makeCtx(game, next as Draft<G['state']>, content, events);
    // the prompt closes and its resume task runs with the answer
    if (next.prompt === null) throw new Error('unreachable: validated with a prompt open');
    const promptId = next.prompt.id;
    next.prompt = null;
    const resume = next.stack.pop();
    if (resume === undefined) {
      throw new EngineBugError(`prompt ${String(promptId)} was open with no resume task on the stack`);
    }
    next.stack.push({ ...resume, answer: [...action.picks] });
    try {
      run(ctx, table);
    } catch (e) {
      // a rule that ended the game stopped the procedure; the state is the one at that instant
      if (!(e instanceof GameOver)) throw e;
    }
  } finally {
    closeDraft(prev);
  }
  const result = freezeState(next) as G['state'];
  return { state: result, events, violations: violationsOf(game, result, content, events, state) };
}

/** `applyAction(game, state, action, content)`: the public entry point, over the game's handlers. */
export function applyAction<G extends GameTypes>(
  game: GameRules<G>,
  state: G['state'],
  action: G['action'],
  content: G['content'],
): ApplyResult<G> {
  return applyActionWith(game, state, action, content, game.handlers);
}

/** Run the stack of `s` (a state being built) until a prompt opens or the game ends, and freeze it. */
function settle<G extends GameTypes>(
  game: GameRules<G>,
  s: Draft<G['state']>,
  content: G['content'],
  first?: (ctx: Ctx<G>) => void,
): ApplyResult<G> {
  const events: G['event'][] = [];
  const ctx = makeCtx(game, s, content, events);
  try {
    first?.(ctx);
    run(ctx, game.handlers);
  } catch (e) {
    if (!(e instanceof GameOver)) throw e;
  }
  const state = freezeState(s) as G['state'];
  return { state, events, violations: violationsOf(game, state, content, events) };
}

/** A new game: the game's blank state, its setup, and the stack run to the first prompt. */
export function createGame<G extends GameTypes>(
  game: GameRules<G>,
  options: G['options'],
  rules: G['rules'],
  content: G['content'],
): ApplyResult<G> {
  return settle(game, game.blank(options, rules, content), content, (ctx) => game.setup?.(ctx));
}

/**
 * Run the task stack of a state the caller built (scenario fixtures) until a prompt opens or the game ends. Not for
 * play: a game advances only through `applyAction`.
 */
export function advance<G extends GameTypes>(game: GameRules<G>, state: G['state'], content: G['content']): ApplyResult<G> {
  return settle(game, structuredClone(state) as Draft<G['state']>, content);
}
