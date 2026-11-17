// `makeCtx`, the context a task handler works with (ported from Warp's Edge core/ctx.ts). `then`, `ask` and `emit` are
// the only ways a handler schedules work, opens a prompt or records what happened; `ctx.rng` the only randomness. `ask`:
// the handler first pushes the resume task, then asks; `applyAction` writes the answer into the top task of the stack.
//
// `s` is typed as the readonly state. Engine code that writes takes the working draft with `draftOf(ctx)` (the same
// object, typed as a `Draft`) and writes below the top level only through the copy-on-write barrier of cow.ts.
import { currentCause } from './cause.ts';
import { own } from './cow.ts';
import type { Draft } from './draft.ts';
import { EngineBugError } from './errors.ts';
import { takePromptSeq, takeSeq } from './ids.ts';
import { nextUint32, randomInt, shuffleInPlace, type RngState } from './rng.ts';
import type { Ctx, CtxRng, EventInput, GameRules, GameTypes, KernelEvent, KernelState, KernelTask } from './types.ts';

/** The working state of `ctx` as a writable draft (the same object; typed readonly). */
export const draftOf = <G extends GameTypes>(ctx: Ctx<G>): Draft<G['state']> => ctx.s as Draft<G['state']>;

/** The most events the state's own log keeps (capped; the UI keeps the full log from `ApplyResult.events`). */
export const LOG_CAP = 200;

type Work = Draft<KernelState>;

/** Runs `f` over the state's rng words, owned by this action, and writes them back. */
function withRng<T>(s: Work, f: (words: RngState) => T): T {
  const r = own(s, 'rng');
  const words: RngState = [r.a, r.b, r.c, r.d];
  const out = f(words);
  r.a = words[0];
  r.b = words[1];
  r.c = words[2];
  r.d = words[3];
  return out;
}

type Override = (arg: never) => unknown;
let overrides: Readonly<Record<string, Override>> | null = null;
/** Test only (boardgame.io MockRandom): a named `ctx.rng.int(max, name)` or `shuffle(xs, name)` returns `f(max | xs)` and leaves the rng alone; unnamed or unlisted calls stay seeded. `null` clears. */
export function setRngOverrides(o: Readonly<Record<string, (arg: never) => unknown>> | null): void {
  overrides = o;
}
const over = (name: string | undefined): Override | undefined => (name === undefined ? undefined : overrides?.[name]);

class StateRng implements CtxRng {
  private readonly s: Work;
  constructor(s: Work) {
    this.s = s;
  }
  nextUint32(): number {
    return withRng(this.s, nextUint32);
  }
  int(max: number, name?: string): number {
    const o = over(name);
    if (o) return o(max as never) as number;
    const f = this.s.forced?.[0];
    if (f !== undefined && (f.name === undefined || f.name === name)) {
      const rest = this.s.forced?.slice(1) ?? [];
      if (rest.length > 0) this.s.forced = rest;
      else delete this.s.forced;
      return Math.max(0, Math.min(max - 1, f.value));
    }
    return withRng(this.s, (w) => randomInt(w, max));
  }
  shuffle<T>(xs: readonly T[], name?: string): T[] {
    const o = over(name);
    if (o) return o(xs as never) as T[];
    const out = xs.slice();
    withRng(this.s, (w) => shuffleInPlace(w, out));
    return out;
  }
}

/**
 * The context as a class, so building one (every `applyAction`, and every read-only query) creates no closures. Same
 * behaviour as the closures it would otherwise need.
 */
class RunCtx<G extends GameTypes> implements Ctx<G> {
  readonly rng: CtxRng;
  /** K100: set while a debug edit runs; its events carry `debug: true`. */
  debug = false;
  /** K222: the stack depth when the running handler started (-1 outside the runner). */
  base = -1;
  readonly s: G['state'];
  readonly content: G['content'];
  readonly events: G['event'][];
  private readonly stamp: ((s: G['state']) => object) | undefined;
  constructor(
    s: G['state'],
    content: G['content'],
    events: G['event'][],
    stamp: ((s: G['state']) => object) | undefined,
  ) {
    this.s = s;
    this.content = content;
    this.events = events;
    this.stamp = stamp;
    this.rng = new StateRng(s as Work);
  }

  // `then(a, b, c)` runs a, then b, then c: push c, b, a (the stack is last in, first out). Once the game
  // is over nothing more is scheduled.
  then(...tasks: readonly G['task'][]): void {
    const s = this.s as Work;
    if (s.result !== null) return;
    if (s.prompt !== null && !this.debug) throw new EngineBugError(`then: prompt ${String(s.prompt.id)} is open (its answer would resume this task instead)`);
    for (let i = tasks.length - 1; i >= 0; i -= 1) s.stack.push(tasks[i] as Draft<KernelTask>);
  }

  // open exactly one prompt and return; the runner stops while `prompt` is set and the answer resumes the task on
  // top of the stack.
  ask(input: Omit<G['prompt'], 'id'>, resume?: G['task']): void {
    const s = this.s as Work;
    if (s.result !== null) return;
    if (s.prompt !== null) {
      throw new EngineBugError(`ask: prompt ${s.prompt.id} is still open (a handler opened a second prompt)`);
    }
    const on = input.options.filter((o) => o.enabled && o.alone !== true).length;
    if (input.max < input.min || (on < input.min && !input.options.some((o) => o.enabled && o.alone === true))) {
      const named = [input.kind === undefined ? '' : `kind "${input.kind}"`, input.seat === undefined ? '' : `seat ${String(input.seat)}`, (s.stack.at(-1) ?? resume) === undefined ? '' : `resuming "${String((resume ?? s.stack.at(-1))?.kind)}"`].filter((x) => x !== '').join(', ');
      const off = input.options.filter((o) => !o.enabled).map((o) => `${o.id}${o.why === undefined ? '' : ` (${o.why})`}`).join('; ');
      const why = input.max < input.min ? `max ${String(input.max)} is below min ${String(input.min)}` : `it needs at least ${String(input.min)} pick(s) but only ${String(on)} of ${String(input.options.length)} option(s) are enabled${off === '' ? '' : `; disabled: ${off}`}`;
      throw new EngineBugError(`ask: prompt ${String(s.promptSeq)}${named === '' ? '' : ` (${named})`} cannot be answered: ${why}. Give the player a legal option, or skip the prompt when there is none.`);
    }
    if (resume !== undefined) s.stack.push(resume as Draft<KernelTask>);
    const top = s.stack.length - 1;
    if (top < 0 || (resume === undefined && s.stack.length <= this.base)) throw new EngineBugError('ask: no resume task (pass it: ctx.ask(prompt, resume), or push it first)');
    const id = takePromptSeq(s);
    if (resume !== undefined) s.stack[top] = { ...resume, prompt: id } as Draft<KernelTask>;
    s.prompt = { ...input, id } as Work['prompt'];
  }

  // stamped with the next sequence number and the game's stamp fields; recorded in the action's events and in
  // the state's capped log.
  emit(input: EventInput<G>): void {
    const s = this.s as Work;
    const c = currentCause(this);
    const given = (input as { cause?: unknown }).cause;
    const stamped = { ...input, ...(given === undefined ? (c !== undefined ? { cause: c } : {}) : {}), seq: takeSeq(s), ...this.stamp?.(this.s), ...(this.debug ? { debug: true } : {}) } as KernelEvent;
    this.events.push(stamped);
    const kept = s.log.length >= LOG_CAP ? s.log.slice(s.log.length - LOG_CAP + 1) : s.log;
    s.log = [...kept, stamped] as typeof s.log;
  }
}

/** Build the context for one run over `s` (the working copy inside `applyAction`); events are collected in `events`. */
export function makeCtx<G extends GameTypes>(
  game: Pick<GameRules<G>, 'stamp'>,
  s: Draft<G['state']>,
  content: G['content'],
  events: G['event'][],
): Ctx<G> {
  return new RunCtx<G>(s, content, events, game.stamp?.bind(game));
}

/**
 * A context over `s` for reading only (a pure query that needs a context): nothing may
 * be scheduled, asked or emitted through it (the events go nowhere).
 */
export function readCtx<G extends GameTypes>(
  game: Pick<GameRules<G>, 'stamp'>,
  s: G['state'],
  content: G['content'],
): Ctx<G> {
  return new RunCtx<G>(s, content, [], game.stamp?.bind(game));
}

/** The events emitted so far through a context `makeCtx` built (the full list, not the capped state log). */
export const ctxEvents = <G extends GameTypes>(ctx: Ctx<G>): readonly G['event'][] => (ctx as RunCtx<G>).events;

/** K222: the stack depth when a handler starts (the runner sets it). */
export function setHandlerBase<G extends GameTypes>(ctx: Ctx<G>, n: number): void {
  (ctx as RunCtx<G>).base = n;
}

/** K100: mark the events `ctx` emits as debug edits (true) or play (false). */
export function setCtxDebug<G extends GameTypes>(ctx: Ctx<G>, on: boolean): void {
  (ctx as RunCtx<G>).debug = on;
}
