// K89 (marvel-champions-digital-game `preview.ts`, AGPL-3.0; idea only, written new): what an answer would do, by
// running it on the real engine and throwing the state away. The probe stops at hidden information (a task that emits a
// revealing event or draws randomness): it returns what happened before that task, never what the task found.
import { applyActionWith, validateAction } from './apply';
import { canonicalJson } from './canonical';
import type { Ctx, GameRules, GameTypes, HandlerTable } from './types';

export type PreviewStop = 'complete' | 'choice' | 'hiddenInformation' | 'rejected';

export interface PreviewOptions<G extends GameTypes> {
  /** The numbers to compare, by name (read on the state before, and after each task). */
  readonly count?: (s: G['state']) => Readonly<Record<string, number>>;
  /** Is the prompt open after the answer a nested choice of this action (stop `choice`) rather than the next decision? */
  readonly nested?: (s: G['state']) => boolean;
}

export interface Preview<G extends GameTypes> {
  readonly stop: PreviewStop;
  readonly error?: string;
  readonly events: readonly G['event'][];
  readonly numbers: Readonly<Record<string, { readonly before: number; readonly after: number }>>;
}

const STOP = new Error('preview: hidden information');

const pair = (a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): Preview<GameTypes>['numbers'] =>
  Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => [k, { before: a[k] ?? 0, after: b[k] ?? 0 }]));

/** Answers the open prompt with `picks` on a throwaway copy; the input state is not changed. */
export function preview<G extends GameTypes>(
  game: GameRules<G>,
  state: G['state'],
  picks: readonly string[],
  content: G['content'],
  opts: PreviewOptions<G> = {},
): Preview<G> {
  const count = opts.count ?? (() => ({}));
  const before = count(state);
  const action = { kind: 'answer', promptId: state.prompt?.id ?? -1, picks } as G['action'];
  const v = validateAction(state, action);
  if (!v.ok) return { stop: 'rejected', error: v.error, events: [], numbers: pair(before, before) };
  const rng = canonicalJson(state.rng);
  const seen: G['event'][] = [];
  let last = before;
  let next = state.seq;
  const hides = (s: G['state'], evs: readonly G['event'][]): boolean => canonicalJson(s.rng) !== rng || evs.some((e) => e.reveal === true);
  const table: HandlerTable<G> = Object.fromEntries(
    Object.entries(game.handlers).map(([k, h]) => [
      k,
      (ctx: Ctx<G>, t: G['task']) => {
        h(ctx, t);
        const fresh = ctx.s.log.filter((e) => e.seq >= next) as G['event'][];
        next = ctx.s.seq;
        if (hides(ctx.s, fresh)) throw STOP;
        seen.push(...fresh);
        last = count(ctx.s);
      },
    ]),
  );
  try {
    const r = applyActionWith(game, state, action, content, table);
    if (hides(r.state, r.events)) return { stop: 'hiddenInformation', events: seen, numbers: pair(before, last) };
    const stop = r.state.prompt !== null && opts.nested?.(r.state) === true ? 'choice' : 'complete';
    return { stop, events: r.events, numbers: pair(before, count(r.state)) };
  } catch (e) {
    if (e !== STOP) throw e;
    return { stop: 'hiddenInformation', events: seen, numbers: pair(before, last) };
  }
}
