// `makeCtx`, the context a task handler works with (ported from Warp's Edge core/ctx.ts). `then`, `ask` and `emit` are
// the only ways a handler schedules work, opens a prompt or records what happened; `ctx.rng` the only randomness. `ask`:
// the handler first pushes the resume task, then asks; `applyAction` writes the answer into the top task of the stack.
//
// `s` is typed as the readonly state. Engine code that writes takes the working draft with `draftOf(ctx)` (the same
// object, typed as a `Draft`) and writes below the top level only through the copy-on-write barrier of cow.ts.
import { own } from './cow';
import type { Draft } from './draft';
import { EngineBugError } from './errors';
import { takePromptSeq, takeSeq } from './ids';
import { nextUint32, randomInt, shuffleInPlace, type RngState } from './rng';
import type { Ctx, CtxRng, EventInput, GameRules, GameTypes, KernelEvent, KernelState, KernelTask } from './types';

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

class StateRng implements CtxRng {
  constructor(private readonly s: Work) {}
  nextUint32(): number {
    return withRng(this.s, nextUint32);
  }
  int(max: number): number {
    return withRng(this.s, (w) => randomInt(w, max));
  }
  shuffle<T>(xs: readonly T[]): T[] {
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
  constructor(
    readonly s: G['state'],
    readonly content: G['content'],
    private readonly events: G['event'][],
    private readonly stamp: ((s: G['state']) => object) | undefined,
  ) {
    this.rng = new StateRng(s as Work);
  }

  // `then(a, b, c)` runs a, then b, then c: push c, b, a (the stack is last in, first out). Once the game
  // is over nothing more is scheduled.
  then(...tasks: readonly G['task'][]): void {
    const s = this.s as Work;
    if (s.result !== null) return;
    for (let i = tasks.length - 1; i >= 0; i -= 1) s.stack.push(tasks[i] as Draft<KernelTask>);
  }

  // open exactly one prompt and return; the runner stops while `prompt` is set and the answer resumes the task on
  // top of the stack.
  ask(input: Omit<G['prompt'], 'id'>): void {
    const s = this.s as Work;
    if (s.result !== null) return;
    if (s.prompt !== null) {
      throw new EngineBugError(`ask: prompt ${s.prompt.id} is still open (a handler opened a second prompt)`);
    }
    s.prompt = { ...input, id: takePromptSeq(s) } as Work['prompt'];
  }

  // stamped with the next sequence number and the game's stamp fields; recorded in the action's events and in
  // the state's capped log.
  emit(input: EventInput<G>): void {
    const s = this.s as Work;
    const stamped = { ...input, seq: takeSeq(s), ...this.stamp?.(this.s) } as KernelEvent;
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
