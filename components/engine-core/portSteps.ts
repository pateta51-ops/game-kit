// K404: undo by step over an `EnginePort`, the shape of steps.ts. A step runs from one decision point (an open prompt
// `isDecision` accepts; default: any) to the next; answers at other prompts, or given by `extendPortStep`, fold into it.
// Undo replays the answers with `portAnswer` from the nearest kept state (at worst the start), so it lands on a decision point.
import { portAnswer, portResult, portSettle, type EnginePort, type PortAnswer, type PortTypes } from './port.ts';
import { canonicalJson } from './canonical.ts';
import { SOMETHING_REVEALED, type UndoMode } from './undo.ts';
import { CHECKPOINT_EVERY, KEEP_STEPS, type UndoStepOptions } from './steps.ts';

type AnyPort<G extends PortTypes> = EnginePort<G, never>;

export interface PortStepEntry<G extends PortTypes> {
  readonly start: number;
  readonly count: number;
  readonly reason: string | null;
  readonly before: G['state'] | null;
}

export interface PortStepOptions<G extends PortTypes> {
  readonly keep?: number;
  readonly every?: number;
  /** Is the open prompt a player's decision (a new step)? Default: every prompt. */
  readonly isDecision?: (s: G['state'], prompt: G['prompt']) => boolean;
  /** Why an answer cannot be undone in Safe mode; default as `undoStep`: a `reveal: true` event (`revealWords`), or, with `randomWords`, a moved rng. */
  readonly reason?: (before: G['state'], after: G['state'], events: readonly G['event'][]) => string | null;
}

export interface PortStepHistory<G extends PortTypes> {
  readonly base: G['state'];
  readonly baseCount: number;
  readonly answers: readonly PortAnswer[];
  readonly state: G['state'];
  readonly steps: readonly PortStepEntry<G>[];
  readonly redo: readonly (readonly PortAnswer[])[];
  readonly undoUsed: boolean;
  readonly peeked: boolean;
  readonly keep: number;
  readonly every: number;
  readonly isDecision?: PortStepOptions<G>['isDecision'];
  readonly reason?: PortStepOptions<G>['reason'];
}

export interface PortStepResult<G extends PortTypes> {
  readonly ok: boolean;
  readonly history: PortStepHistory<G>;
  readonly events: readonly G['event'][];
  readonly error: string | null;
}

export const newPortSteps = <G extends PortTypes>(state: G['state'], answers: readonly PortAnswer[] = [], o: PortStepOptions<G> = {}): PortStepHistory<G> => ({
  base: state,
  baseCount: answers.length,
  answers,
  state,
  steps: [],
  redo: [],
  undoUsed: false,
  peeked: false,
  keep: o.keep ?? KEEP_STEPS,
  every: o.every ?? CHECKPOINT_EVERY,
  ...(o.isDecision === undefined ? {} : { isDecision: o.isDecision }),
  ...(o.reason === undefined ? {} : { reason: o.reason }),
});

const refuse = <G extends PortTypes>(h: PortStepHistory<G>, error: string): PortStepResult<G> => ({ ok: false, history: h, events: [], error });

function capped<G extends PortTypes>(h: PortStepHistory<G>, steps: PortStepEntry<G>[]): PortStepEntry<G>[] {
  const i = steps.length - 1 - h.keep;
  const s = steps[i];
  if (s === undefined || s.before === null || (h.every > 0 && i % h.every === 0)) return steps;
  steps[i] = { ...s, before: null };
  return steps;
}

export function portStepReason<G extends PortTypes>(port: AnyPort<G>, before: G['state'], after: G['state'], events: readonly G['event'][]): string | null {
  const first = events.find((e) => (e as { reveal?: unknown } | null)?.reveal === true);
  if (first !== undefined) return port.revealWords?.(first) ?? SOMETHING_REVEALED;
  return port.randomWords === undefined || canonicalJson(port.rng?.(before)) === canonicalJson(port.rng?.(after)) ? null : port.randomWords;
}

const decides = <G extends PortTypes>(port: AnyPort<G>, h: PortStepHistory<G>): boolean => {
  const p = port.prompt(h.state);
  return p === null || h.isDecision === undefined || h.isDecision(h.state, p);
};

function play<G extends PortTypes>(port: AnyPort<G>, h: PortStepHistory<G>, answers: readonly PortAnswer[], join: boolean, redo: PortStepHistory<G>['redo']): PortStepResult<G> {
  if (portResult(port, h.state) !== null) return refuse(h, 'The game is over.');
  let state = h.state;
  let reason: string | null = null;
  const events: G['event'][] = [];
  try {
    for (const a of answers) {
      const r = portAnswer(port, state, a);
      reason ??= (h.reason ?? ((b, a, e) => portStepReason(port, b, a, e)))(state, r.state, r.events);
      state = r.state;
      for (const e of r.events) events.push(e);
    }
  } catch (e) {
    return refuse(h, String(e));
  }
  const all = [...h.answers, ...answers];
  const top = h.steps.at(-1);
  const next: PortStepHistory<G> =
    join && top === undefined
      ? { ...h, answers: all, state, base: state, baseCount: all.length, redo }
      : {
          ...h,
          answers: all,
          state,
          redo,
          steps:
            join && top !== undefined
              ? [...h.steps.slice(0, -1), { ...top, count: top.count + answers.length, reason: top.reason ?? reason }]
              : capped(h, [...h.steps, { start: h.answers.length, count: answers.length, reason, before: h.state }]),
        };
  return { ok: true, history: next, events, error: null };
}

/** An answer at the open prompt: a new step when `isDecision` says the prompt is a decision, else it joins the top step. */
export const addPortStep = <G extends PortTypes>(port: AnyPort<G>, h: PortStepHistory<G>, answer: PortAnswer): PortStepResult<G> =>
  play(port, h, [answer], !decides(port, h), []);

/** An answer the game gave for the player: it joins the top step (with no step yet, the start of the game). */
export const extendPortStep = <G extends PortTypes>(port: AnyPort<G>, h: PortStepHistory<G>, answer: PortAnswer): PortStepResult<G> =>
  play(port, h, [answer], true, []);

export function canUndoPortStep<G extends PortTypes>(
  port: AnyPort<G>,
  h: PortStepHistory<G>,
  mode: UndoMode,
  o: UndoStepOptions = {},
): { readonly ok: true; readonly peek: boolean } | { readonly ok: false; readonly reason: string } {
  if (portResult(port, h.state) !== null && o.afterGameOver !== true) return { ok: false, reason: 'The game is over: nothing can be undone.' };
  const top = h.steps.at(-1);
  if (top === undefined) return { ok: false, reason: 'Nothing to undo.' };
  if (top.reason !== null && mode === 'safe') return { ok: false, reason: top.reason };
  return { ok: true, peek: top.reason !== null };
}

export function undoPortStep<G extends PortTypes>(port: AnyPort<G>, h: PortStepHistory<G>, mode: UndoMode, o: UndoStepOptions = {}): PortStepResult<G> {
  const can = canUndoPortStep(port, h, mode, o);
  if (!can.ok) return refuse(h, can.reason);
  const index = h.steps.length - 1;
  const top = h.steps[index] as PortStepEntry<G>;
  let from = index;
  while (from >= 0 && h.steps[from]?.before === null) from -= 1;
  const anchor = h.steps[from];
  let state = anchor?.before ?? h.base;
  try {
    for (let i = anchor?.start ?? h.baseCount; i < top.start; i += 1) state = portAnswer(port, state, h.answers[i] as PortAnswer).state;
  } catch (e) {
    return refuse(h, `This history is damaged: ${String(e)}`);
  }
  return {
    ok: true,
    events: [],
    error: null,
    history: {
      ...h,
      state,
      answers: h.answers.slice(0, top.start),
      steps: h.steps.slice(0, index),
      redo: [...h.redo, h.answers.slice(top.start)],
      undoUsed: h.undoUsed || mode === 'free',
      peeked: h.peeked || can.peek,
    },
  };
}

export function redoPortStep<G extends PortTypes>(port: AnyPort<G>, h: PortStepHistory<G>): PortStepResult<G> {
  const next = h.redo.at(-1);
  return next === undefined ? refuse(h, 'Nothing to redo.') : play(port, h, next, false, h.redo.slice(0, -1));
}

export type ReplayedPortSteps<G extends PortTypes> =
  | { readonly ok: true; readonly history: PortStepHistory<G> }
  | { readonly ok: false; readonly failedAt: number | null; readonly error: string };

/** Rebuild a history from the seed and the answers; steps start where `starts` says, else at each decision point (`isDecision`). */
export function replayPortSteps<G extends PortTypes>(
  port: AnyPort<G>,
  seed: string | undefined,
  answers: readonly PortAnswer[],
  o: PortStepOptions<G> & { readonly starts?: readonly number[] } = {},
): ReplayedPortSteps<G> {
  let h: PortStepHistory<G>;
  try {
    h = newPortSteps<G>(portSettle(port, port.start(seed)).state, [], o);
  } catch (e) {
    return { ok: false, failedAt: null, error: String(e) };
  }
  const set = o.starts === undefined ? null : new Set(o.starts);
  for (const [index, answer] of answers.entries()) {
    const r = play(port, h, [answer], set === null ? !decides(port, h) : !set.has(index), []);
    if (!r.ok) return { ok: false, failedAt: index, error: r.error ?? '' };
    h = r.history;
  }
  return { ok: true, history: h };
}
