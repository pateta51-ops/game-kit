// K95 (docs/patterns/timing-vocabulary.md): one checkpoint after every action, its steps in rulebook order (collect
// triggers, expire durations, recompute derived values until stable, the game's state checks, then the after-window),
// and the recompute pass with a cap. netrunner engine.clj checkpoint and checkpoint.clj fake-checkpoint (MIT, design).
// Written new. Opt-in: nothing runs unless the game passes `cfg.checkpoint`.
import { canonicalJson } from './canonical.ts';
import { draftOf } from './ctx.ts';
import { expireEffects, stampActive, type EffectsConfig } from './durations.ts';
import { EngineBugError } from './errors.ts';
import type { TimingConfig } from './timing.ts';
import { collectTriggers, liveTriggers } from './triggers.ts';
import type { Ctx, GameTypes, HandlerTable, KernelTask } from './types.ts';

/** One state check (win/loss, uniqueness, limits, empty zones). Returns true when it changed something; asking or pushing tasks counts too. */
export interface StateCheck<G extends GameTypes> {
  readonly name: string;
  /** K703: run only when no occurrence is pending (the whole batch, and any batch it is nested in, has happened); between occurrences it is skipped as if it held. Default: every checkpoint. */
  readonly afterBatch?: boolean;
  run(ctx: Ctx<G>): boolean | void;
}
export interface CheckpointConfig<G extends GameTypes> {
  /** Step 3: writes the derived values (blanked cards, "treated as", totals). */
  derive?(ctx: Ctx<G>): void;
  /** The derived values compared between passes (default: the whole state). */
  derived?(s: G['state']): unknown;
  /** Step 4, in rulebook order. */
  readonly checks?: readonly StateCheck<G>[];
  /** For `stampActive` before derive (K112). */
  readonly effects?: EffectsConfig<G['state']>;
  /** Default `RECOMPUTE_CAP`. */
  readonly recomputeCap?: number;
}
export const RECOMPUTE_CAP = 10;

const parts = (v: unknown): Map<string, string> =>
  new Map(v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.entries(v).map(([k, x]) => [k, canonicalJson(x)]) : [['(value)', canonicalJson(v)]]);
const same = (a: Map<string, string>, b: Map<string, string>): boolean => a.size === b.size && [...a].every(([k, x]) => b.get(k) === x);

/** Step 3: run `derive` until the derived values stop changing; more than the cap is an engine bug naming the keys still moving. */
export function recompute<G extends GameTypes>(ctx: Ctx<G>, cp: CheckpointConfig<G>): number {
  if (cp.derive === undefined) return 0;
  const read = (): Map<string, string> => parts(cp.derived === undefined ? ctx.s : cp.derived(ctx.s));
  const cap = cp.recomputeCap ?? RECOMPUTE_CAP;
  let prev = read();
  for (let i = 1; i <= cap; i += 1) {
    cp.derive(ctx);
    const cur = read();
    if (same(prev, cur)) return i;
    if (i === cap) {
      const moving = [...new Set([...prev.keys(), ...cur.keys()])].filter((k) => prev.get(k) !== cur.get(k));
      throw new EngineBugError(`checkpoint: derived values still change after ${String(cap)} passes: ${moving.join(', ')}`);
    }
    prev = cur;
  }
  return cap;
}

interface CheckTask extends KernelTask {
  readonly at: number;
}

export function checkpointHandlers<G extends GameTypes>(cfg: TimingConfig<G>): HandlerTable<G> {
  const cp = cfg.checkpoint;
  if (cp === undefined) return {};
  return {
    'timing.checkpoint': (ctx) => {
      const s = draftOf(ctx);
      const g = s.stack.findLastIndex((x) => x.kind === 'timing.groupEnd');
      if (g >= 0) {
        s.stack[g] = { ...(s.stack[g] as KernelTask), checkpoint: true } as unknown as typeof s.stack[number];
        return;
      }
      collectTriggers(ctx, cfg);
      expireEffects(ctx);
      stampActive(ctx, cp.effects);
      recompute(ctx, cp);
      ctx.then({ kind: 'timing.check', at: 0 } as CheckTask);
    },
    'timing.check': (ctx, t) => {
      const at = (t as CheckTask).at;
      const c = cp.checks?.[at];
      if (c === undefined) {
        if (liveTriggers(cfg, ctx.s, ctx.content).length > 0 && !ctx.s.stack.some((x) => x.kind === 'timing.triggers')) ctx.then({ kind: 'timing.triggers' });
        return;
      }
      if (c.afterBatch === true && ctx.s.timing?.occurrences.some((o) => o.state === 'pending') === true) {
        ctx.then({ kind: 'timing.check', at: at + 1 } as CheckTask);
        return;
      }
      const n = ctx.s.stack.length;
      const changed = c.run(ctx) === true;
      const st = draftOf(ctx).stack;
      st.splice(n, 0, (changed || ctx.s.prompt !== null || st.length > n ? { kind: 'timing.checkpoint' } : { kind: 'timing.check', at: at + 1 }) as never);
    },
  };
}
