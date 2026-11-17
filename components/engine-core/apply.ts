// `validateAction`, `applyAction` and `createGame` (ported from Warp's Edge core/apply.ts). At any moment the
// state holds an open prompt or the game is over, and every action answers that prompt. The answer is checked against
// the open prompt: its id, the option ids, the number of picks (min..max) and repeats. A disabled option is NOT_LEGAL;
// any other bad answer BAD_CHOICE.
//
// `validateAction` never throws: it says why an answer is refused. `applyAction` throws an `IllegalActionError` for an
// answer `validateAction` refuses (the UI only sends valid ones), and an `EngineBugError` only when an internal invariant
// breaks (a runaway task loop, a corrupt state).
import './single.ts';
import { closeDraft, copyList, copyMode, openDraft } from './cow.ts';
import { copyState, freezeState, isFreezing } from './copy.ts';
import { makeCtx } from './ctx.ts';
import { applyDebug, KERNEL_VERBS } from './debug.ts';
import type { Draft } from './draft.ts';
import { EngineBugError, IllegalActionError } from './errors.ts';
import { GameOver } from './gameOver.ts';
import { run } from './runner.ts';
import type { AnswerAction, ApplyResult, Ctx, GameRules, GameTypes, HandlerTable, KernelEvent, KernelState, KernelTask } from './types.ts';

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

const validWords = (w: unknown): boolean =>
  typeof w === 'object' && w !== null && (['a', 'b', 'c', 'd'] as const).every((k) => {
    const v = (w as Record<string, unknown>)[k];
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 4294967295;
  });

/**
 * `validateAction`: is this action an acceptable answer to the open prompt? Every legality check lives in the
 * prompt's options (disabled options stay listed with a reason), so the content is not read.
 */
/** `game` is needed for a debug edit (K100): without it, or when the game has not opted in or lacks the verb, the edit is refused as `applyAction` refuses it. */
export function validateAction<G extends GameTypes>(state: G['state'], input: G['action'], game?: GameRules<G>): ValidationResult {
  const action = input as AnswerAction;
  if (state.result !== null) return no('GAME_OVER', 'The game is over.');
  const d = action as { kind?: unknown; verb?: unknown; args?: unknown };
  if (d.kind === 'debug') {
    if (typeof d.verb !== 'string' || !(d.args === undefined || (typeof d.args === 'object' && d.args !== null && !Array.isArray(d.args))))
      return no('BAD_ACTION', 'A debug edit needs a verb and args as an object.');
    if (game?.debug === undefined) return no('DEBUG_REFUSED', 'this game takes no debug edits');
    if (!(KERNEL_VERBS as readonly string[]).includes(d.verb) && game.debug[d.verb] === undefined) return no('DEBUG_REFUSED', `no debug verb "${d.verb}"`);
    return OK;
  }
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
  if (chosen.some((id) => prompt.options.find((o) => o.id === id)?.alone === true)) {
    if (chosen.length !== 1) return no('NOT_LEGAL', 'That option must be chosen on its own.');
  } else if (chosen.length < prompt.min || chosen.length > prompt.max) {
    const range =
      prompt.min === prompt.max ? String(prompt.min) : `${String(prompt.min)} to ${String(prompt.max)}`;
    return no('BAD_CHOICE', `Choose ${range} option(s), not ${String(chosen.length)}.`);
  }
  if (new Set(chosen).size !== chosen.length) return no('BAD_CHOICE', 'Each option can be chosen only once.');
  for (const id of chosen) {
    const option = prompt.options.find((o) => o.id === id);
    if (option === undefined) return no('BAD_CHOICE', `"${id}" is not an option of this prompt.`);
    if (!option.enabled) {
      return no('NOT_LEGAL', `"${id}" cannot be chosen${option.reason === undefined ? '' : ` (${option.reason})`}${option.why === undefined ? '' : `: ${option.why}`}.`);
    }
  }
  const rs = (action as { reseed?: unknown }).reseed;
  if (rs !== undefined && !validWords(rs)) return no('BAD_RESEED', 'reseed needs four unsigned 32-bit integers a, b, c, d.');
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
  const check = validateAction<G>(state, action, game);
  if (!check.ok) throw new IllegalActionError(check.error);
  if (action.kind === 'debug') return applyDebug(game, state, action, content, table);
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
    if (action.kind === 'answer' && action.reseed !== undefined) next.rng = { a: action.reseed.a, b: action.reseed.b, c: action.reseed.c, d: action.reseed.d };
    next.prompt = null;
    const resume = next.stack.pop();
    if (resume === undefined) {
      throw new EngineBugError(`prompt ${String(promptId)} was open with no resume task on the stack`);
    }
    // K222: the task bound to the prompt must be on top; with no task bound to it (old form, a save before K222) the top resumes, whatever stale tag it carries
    if (resume.prompt !== promptId && next.stack.some((t) => t.prompt === promptId))
      throw new EngineBugError(`prompt ${String(promptId)}: the task on top ("${resume.kind}") is not the one bound to it`);
    const { prompt: _bound, ...task } = resume;
    next.stack.push({ ...task, answer: [...action.picks] });
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
