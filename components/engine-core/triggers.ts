// K94 (docs/patterns/timing-vocabulary.md): triggers collected from happened occurrences, once per item or once per
// instance, ordered silent / interactive / automatic by a priority table, revalidated before each resolves; and
// `simultaneously` (apply all, capture follow-ups, then resolve). netrunner engine.clj queue-event, create-instances,
// trigger-event-simult and the priority table (MIT, design); ArkhamHorror / MarvelChampions Simultaneously and
// captureQueueT (no licence: idea only). Written new.
import { draftOf } from './ctx.ts';
import { triggersOver } from './durations.ts';
import { EngineBugError } from './errors.ts';
import { timingOf, type Occurrence, type TimingConfig } from './timing.ts';
import type { Ctx, GameTypes, HandlerTable, KernelPrompt, KernelTask } from './types.ts';

export type TriggerOrder = 'silent' | 'interactive' | { readonly auto: string };
/** What the game's `triggersFor` returns: an ability of `source`, controlled by `player`, that answers the occurrence. */
export interface TriggerCandidate {
  readonly ability: string;
  readonly source: string;
  readonly player: string;
  /** `perItem` (default): one trigger per occurrence; `perInstance`: one for all occurrences of the batch ("one or more"). */
  readonly once?: 'perItem' | 'perInstance';
  /** Default `{ auto: 'default' }`. */
  readonly order?: TriggerOrder;
  /** K292: the game's timing word ("when" interrupts, "after" waits), copied onto the pending trigger for `cfg.held`. */
  readonly timing?: 'when' | 'after';
}
export interface PendingTrigger {
  readonly id: number;
  readonly ability: string;
  readonly source: string;
  readonly player: string;
  readonly batch: number;
  /** The occurrences it answers, as they happened. */
  readonly occurrences: readonly Occurrence[];
  readonly once: 'perItem' | 'perInstance';
  readonly order: TriggerOrder;
  readonly timing?: 'when' | 'after';
}
export interface TriggerPromptInfo {
  readonly player: string;
  readonly triggers: readonly PendingTrigger[];
}
/** Triggers resolved in one chain (follow-ups included) before the kit stops it (`cfg.triggerCap`). */
export const TRIGGER_CAP = 200;
/** netrunner's automatic order: losses before gains before draws; lower resolves first. */
export const DEFAULT_PRIORITY: Readonly<Record<string, number>> = { loseActions: 1, gainActions: 2, loseResources: 4, gainResources: 6, draw: 8, default: 10, last: 999 };

interface TriggerTask extends KernelTask {
  readonly trigger?: PendingTrigger;
  readonly player?: string;
}

export const pendingTriggers = (s: { readonly timing?: { readonly pending?: readonly PendingTrigger[] } }): readonly PendingTrigger[] => s.timing?.pending ?? [];
/** K292: the pending triggers `cfg.held` does not hold back (all of them without `held`). */
export const liveTriggers = <G extends GameTypes>(cfg: TimingConfig<G>, s: G['state']): readonly PendingTrigger[] => pendingTriggers(s).filter((p) => cfg.held?.(s, p) !== true);

/** A card entered play: occurrences that already happened (not yet collected) do not trigger its abilities. */
export function enteredPlay<G extends GameTypes>(ctx: Ctx<G>, source: string): void {
  if (!ctx.s.timing?.occurrences.some((o) => o.state === 'happened')) return;
  const t = timingOf(ctx);
  t.occurrences = t.occurrences.map((o) => (o.state === 'happened' && !(o.enteredAfter ?? []).includes(source) ? { ...o, enteredAfter: [...(o.enteredAfter ?? []), source] } : o));
}

/** Turn settled occurrences into pending triggers (`cfg.triggersFor`); returns the new ones. */
export function collectTriggers<G extends GameTypes>(ctx: Ctx<G>, cfg: TimingConfig<G>): PendingTrigger[] {
  const out: PendingTrigger[] = [];
  const all = ctx.s.timing?.occurrences ?? [];
  const open = new Set(all.filter((o) => o.state === 'pending').map((o) => o.batch));
  if (!all.some((o) => o.state !== 'pending' && !open.has(o.batch))) return out;
  const t = timingOf(ctx);
  const happened = all.filter((o) => o.state === 'happened' && !open.has(o.batch));
  t.occurrences = t.occurrences.filter((o) => open.has(o.batch));
  t.batches = t.batches.filter((b) => open.has(b.id));
  if (cfg.triggersFor === undefined) return out;
  for (const o of happened) {
    for (const c of cfg.triggersFor(ctx.s, o)) {
      if ((o.enteredAfter ?? []).includes(c.source)) continue;
      const once: PendingTrigger['once'] = c.once ?? 'perItem';
      const same = once === 'perInstance' ? out.findIndex((p) => p.once === once && p.batch === o.batch && p.ability === c.ability && p.source === c.source && p.player === c.player) : -1;
      const p = out[same];
      if (p !== undefined) out[same] = { ...p, occurrences: [...p.occurrences, o] };
      else {
        out.push({ id: t.next, ability: c.ability, source: c.source, player: c.player, batch: o.batch, occurrences: [o], once, order: c.order ?? { auto: 'default' }, ...(c.timing === undefined ? {} : { timing: c.timing }) });
        t.next += 1;
      }
    }
  }
  if (out.length > 0) (t as { pending?: PendingTrigger[] }).pending = [...pendingTriggers(ctx.s), ...out];
  return out;
}

const rank = (o: TriggerOrder, table: Readonly<Record<string, number>>): number => table[typeof o === 'object' ? o.auto : 'default'] ?? table['default'] ?? 10;

/** The player whose triggers resolve next (active player first, then turn order), and that player's triggers. */
function nextGroup<G extends GameTypes>(cfg: TimingConfig<G>, s: G['state'], all: readonly PendingTrigger[]): readonly PendingTrigger[] {
  const order = cfg.turnOrder?.(s) ?? [];
  const at = (p: string): number => {
    const i = order.indexOf(p);
    return i < 0 ? order.length : i;
  };
  const first = [...all].sort((a, b) => at(a.player) - at(b.player) || a.id - b.id)[0];
  return first === undefined ? [] : all.filter((p) => p.player === first.player);
}

function fire<G extends GameTypes>(ctx: Ctx<G>, id: number, hook: boolean): void {
  const t = timingOf(ctx);
  const p = (t.pending ?? []).find((x) => x.id === id);
  if (p === undefined) throw new EngineBugError(`triggers: no pending trigger ${String(id)}`);
  t.pending = (t.pending ?? []).filter((x) => x.id !== id);
  t.fired = (t.fired ?? 0) + 1;
  ctx.then({ kind: 'timing.fire', trigger: p, batch: p.batch } as TriggerTask, ...(hook ? [{ kind: 'timing.afterTrigger', trigger: p } as TriggerTask] : []), { kind: 'timing.triggers' });
}

export function triggerHandlers<G extends GameTypes>(cfg: TimingConfig<G>): HandlerTable<G> {
  return {
    /** The after-window: collect, then resolve the pending triggers one by one (re-collecting after each). */
    'timing.triggers': (ctx) => {
      const s = draftOf(ctx);
      const g = s.stack.findLastIndex((x) => x.kind === 'timing.groupEnd');
      if (g >= 0) {
        s.stack[g] = { ...(s.stack[g] as KernelTask), triggers: true } as unknown as typeof s.stack[number];
        return;
      }
      collectTriggers(ctx, cfg);
      const mine = nextGroup(cfg, ctx.s, liveTriggers(cfg, ctx.s));
      const fired = ctx.s.timing?.fired;
      if (mine.length === 0) {
        triggersOver(ctx, pendingTriggers(ctx.s).map((p) => p.batch));
        if (fired !== undefined) delete timingOf(ctx).fired;
        return;
      }
      if ((fired ?? 0) >= (cfg.triggerCap ?? TRIGGER_CAP)) {
        const left = liveTriggers(cfg, ctx.s);
        const t = timingOf(ctx);
        t.pending = pendingTriggers(ctx.s).filter((p) => !left.includes(p)) as never;
        delete t.fired;
        triggersOver(ctx, pendingTriggers(ctx.s).map((p) => p.batch));
        const e = cfg.capped?.(left);
        if (e !== undefined) ctx.emit(e);
        return;
      }
      const loud = mine.filter((p) => p.order !== 'silent');
      if (loud.length > 1 && loud.some((p) => p.order === 'interactive')) {
        const player = (mine[0] as PendingTrigger).player;
        ctx.then({ kind: 'timing.triggerPick', player } as TriggerTask);
        const base: Pick<KernelPrompt, 'options' | 'min' | 'max'> = { options: mine.map((p) => ({ id: String(p.id), enabled: true })), min: 1, max: 1 };
        ctx.ask(cfg.orderPrompt?.(base, { player, triggers: mine }) ?? ({ ...base, kind: 'timing.order', seat: player } as Omit<G['prompt'], 'id'>));
        return;
      }
      const table = cfg.priority ?? DEFAULT_PRIORITY;
      const next = [...mine].sort((a, b) => rank(a.order, table) - rank(b.order, table) || (a.ability < b.ability ? -1 : a.ability > b.ability ? 1 : a.id - b.id))[0] as PendingTrigger;
      fire(ctx, next.id, cfg.afterTrigger !== undefined || cfg.checkpoint !== undefined);
    },
    'timing.triggerPick': (ctx, t) => {
      fire(ctx, Number(t.answer?.[0]), cfg.afterTrigger !== undefined || cfg.checkpoint !== undefined);
    },
    'timing.fire': (ctx, t) => {
      const p = (t as TriggerTask).trigger as PendingTrigger;
      const why = cfg.invalid?.(ctx.s, p);
      if (why === undefined) cfg.resolveTrigger?.(ctx, p);
      else {
        const e = cfg.dropped?.(p, why);
        if (e !== undefined) ctx.emit(e);
      }
    },
    'timing.afterTrigger': (ctx, t) => {
      if (cfg.checkpoint !== undefined) ctx.then({ kind: 'timing.checkpoint' });
      cfg.afterTrigger?.(ctx, (t as TriggerTask).trigger as PendingTrigger);
    },
    'timing.groupEnd': (ctx, t) => {
      const g = t as { triggers?: boolean; checkpoint?: boolean };
      ctx.then(...(g.checkpoint === true ? [{ kind: 'timing.checkpoint' }] : []), ...(g.triggers === true ? [{ kind: 'timing.triggers' }] : []));
    },
  };
}

/**
 * Run each task's handler on an empty stack (no checkpoint between them), keep what each pushed, then put all those
 * follow-ups in front of the rest: member 1's first. A member that asks is an engine bug. With the kit's timing handlers
 * in `table`, a `timing.triggers` among the follow-ups waits until the whole group has landed.
 */
export function simultaneously<G extends GameTypes>(ctx: Ctx<G>, table: HandlerTable<G>, tasks: readonly G['task'][]): void {
  const s = draftOf(ctx);
  const rest = s.stack;
  const ups: (typeof rest)[] = [];
  for (const t of tasks) {
    s.stack = [];
    const h = table[t.kind];
    if (h === undefined) throw new EngineBugError(`simultaneously: no handler for task kind "${t.kind}"`);
    h(ctx, t);
    if (s.prompt !== null) throw new EngineBugError(`simultaneously: "${t.kind}" asked a prompt; choices go in its follow-ups`);
    ups.push(s.stack);
    if (s.result !== null) return;
  }
  const end = table['timing.groupEnd'] === undefined ? [] : [{ kind: 'timing.groupEnd' } as (typeof rest)[number]];
  s.stack = [...rest, ...end, ...ups.reverse().flat()];
}
