// K111 (docs/patterns/timing-vocabulary.md): the replacement loop on one occurrence, window 2 of K93. XMage
// ContinuousEffects replacement loop (MIT, design: applied-set on the event, the affected player picks among several, a
// one-use effect removes itself) and Forge ReplacementLayer / ReplacementResult (GPL-3.0, idea only: ordering classes,
// result codes with `updated` = still happens with changed numbers). Written new.
import { EngineBugError } from './errors';
import { chooserOf, inBatch, occurrenceDraft, occurrenceOf, openWindow, promptOf, startTask, type Occurrence, type TimingConfig, type TimingTask } from './timing';
import type { Ctx, GameTypes, HandlerTable } from './types';

export type ReplaceResult = 'kept' | 'updated' | 'replaced' | 'prevented' | 'skipped';
/** A replacement effect the game offers; `cls` is the game's ordering class (lowest first). */
export interface Replacement {
  readonly id: number;
  readonly controller: string;
  readonly cls: number;
  readonly label: string;
}

/** Those not yet applied to `occ`, of the lowest class, by id. */
export function replacementCandidates(list: readonly Replacement[], occ: Occurrence): Replacement[] {
  const left = list.filter((r) => !occ.applied.includes(r.id));
  const cls = Math.min(...left.map((r) => r.cls));
  return left.filter((r) => r.cls === cls).sort((a, b) => a.id - b.id);
}

/** The occurrence stops: cancelled; its remaining window tasks and `timing.do` stay on the stack and skip it (the window closes, `current` clears). */
function end<G extends GameTypes>(ctx: Ctx<G>, id: number, result: ReplaceResult): void {
  const o = occurrenceDraft(ctx, id);
  o.state = 'cancelled';
  o.result = result;
  if (result === 'prevented' && o.amount !== undefined) o.amount = 0;
}

function apply<G extends GameTypes>(ctx: Ctx<G>, cfg: TimingConfig<G>, task: TimingTask, r: Replacement): void {
  const id = task.occ;
  const o = occurrenceDraft(ctx, id);
  o.applied = [...o.applied, r.id];
  ctx.then({ kind: 'timing.replace', batch: task.batch, occ: id } as TimingTask);
  let code = 'kept' as ReplaceResult;
  inBatch(ctx, task.batch, () => {
    code = cfg.applyReplacement?.(ctx, r, occurrenceOf(ctx.s, id) as Occurrence) ?? 'kept';
  });
  if (occurrenceOf(ctx.s, id)?.state !== 'pending') return;
  if (code === 'updated') occurrenceDraft(ctx, id).result = 'updated';
  else if (code !== 'kept') end(ctx, id, code);
}

export function replaceHandlers<G extends GameTypes>(cfg: TimingConfig<G>): HandlerTable<G> {
  const cands = (ctx: Ctx<G>, o: Occurrence) => replacementCandidates(cfg.replacementsFor?.(ctx.s, o) ?? [], o);
  return {
    'timing.instead': (ctx, t) => {
      const task = t as TimingTask;
      const o = startTask(ctx, task);
      if (o.state !== 'pending' || cfg.replacementsFor === undefined) return;
      openWindow(ctx, { timing: 'instead', kind: o.kind, batch: o.batch, occurrence: o.id });
      ctx.then({ kind: 'timing.replace', batch: task.batch, occ: task.occ } as TimingTask);
    },
    'timing.replace': (ctx, t) => {
      const task = t as TimingTask;
      const o = startTask(ctx, task);
      if (o.state !== 'pending') return;
      const c = cands(ctx, o);
      const one = c[0];
      if (one === undefined) {
        if (o.result === undefined) occurrenceDraft(ctx, o.id).result = 'kept';
      } else if (c.length === 1) apply(ctx, cfg, task, one);
      else {
        ctx.then({ kind: 'timing.replacePick', batch: task.batch, occ: task.occ } as TimingTask);
        const options = c.map((r) => ({ id: String(r.id), enabled: true }));
        ctx.ask(promptOf(cfg, { options, min: 1, max: 1 }, { why: 'replace', player: chooserOf(cfg, ctx.s, o), occurrence: o, replacements: c }));
      }
    },
    'timing.replacePick': (ctx, t) => {
      const task = t as TimingTask;
      const o = startTask(ctx, task);
      const r = cands(ctx, o).find((x) => String(x.id) === task.answer?.[0]);
      if (r === undefined) throw new EngineBugError(`replace: "${String(task.answer?.[0])}" is not a candidate`);
      apply(ctx, cfg, task, r);
    },
  };
}
