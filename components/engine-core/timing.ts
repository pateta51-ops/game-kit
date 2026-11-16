// K93 (docs/patterns/timing-vocabulary.md): batches of occurrences that can be cancelled, ignored or done instead
// (ArkhamHorror Would / CancelBatch / IgnoreBatch / Instead, no licence: idea only, written new), shared batch keys
// (XMage BatchEvent, MIT, design) and the prevention window declared as card data with remaining / prevented counters
// (netrunner prevention.clj, MIT, design). Opt-in: `state.timing` and `task.batch` appear only once a game calls `would`.
import { adopt, own } from './cow';
import { draftOf } from './ctx';
import type { Draft } from './draft';
import { EngineBugError } from './errors';
import { replaceHandlers, type Replacement, type ReplaceResult } from './replace';
import type { Ctx, EventInput, GameTypes, HandlerTable, KernelPrompt, KernelTask } from './types';

export type SharedKey = 'player' | 'source' | 'target';
export interface OccurrenceKeys {
  readonly player?: string;
  readonly source?: string;
  readonly target?: string;
}
export interface Occurrence {
  readonly id: number;
  readonly batch: number;
  readonly kind: string;
  readonly keys: OccurrenceKeys;
  readonly amount?: number;
  readonly unpreventable?: boolean;
  /** K111: replacement effects already applied to it. */
  readonly applied: readonly number[];
  readonly state: 'pending' | 'cancelled' | 'happened';
  /** How much prevention windows prevented in all. */
  readonly prevented?: number;
  /** K111: the last code of the replacement loop. */
  readonly result?: ReplaceResult;
  /** Its effect was ignored (`ignoreBatch`): the windows still run, `timing.do` does not do it. */
  readonly ignored?: boolean;
}
export interface Batch {
  readonly id: number;
  readonly shared: readonly SharedKey[];
}
export type WindowTiming = 'before' | 'instead' | 'prevention';
export interface Window {
  readonly timing: WindowTiming | 'after';
  readonly kind: string;
  readonly batch: number;
  readonly occurrence: number;
}
export interface PreventionWindow extends Window {
  readonly timing: 'prevention';
  readonly count: number;
  readonly remaining: number;
  readonly prevented: number;
  readonly unpreventable?: boolean;
}
export interface TimingState {
  readonly next: number;
  readonly current: number | null;
  readonly batches: readonly Batch[];
  readonly occurrences: readonly Occurrence[];
  readonly windows: readonly Window[];
}
/** Card data: what a prevention ability prevents, at most how much per use, how many uses. */
export interface Prevention {
  readonly prevents: string;
  readonly max?: number;
  readonly uses?: number;
}
/** A prevention the game offers in a window (in play, affordable); `used` counts its uses so far. */
export interface PreventionOffer {
  readonly id: string;
  readonly prevention: Prevention;
  readonly used?: number;
}
export interface OccurrenceInput {
  readonly kind: string;
  readonly keys?: OccurrenceKeys;
  readonly amount?: number;
  readonly unpreventable?: boolean;
}
export interface TimingPromptInfo {
  readonly why: 'prevent' | 'replace';
  readonly player: string;
  readonly occurrence: Occurrence;
  readonly window?: PreventionWindow;
  readonly replacements?: readonly Replacement[];
}
export interface TimingConfig<G extends GameTypes> {
  /** The effect itself, reading the occurrence's final numbers. */
  happen(ctx: Ctx<G>, occ: Occurrence): void;
  /** The event emitted when it happened (the kit adds `batch` and `occurrence`). */
  event?(occ: Occurrence): EventInput<G> | undefined;
  /** Window 1: players may answer, `cancelBatch`, `ignoreBatch` or `insteadOf`. Tasks it pushes join the batch. */
  before?(ctx: Ctx<G>, occ: Occurrence): void;
  /** Window 3 candidates; the kit keeps those whose `prevents` is the kind and uses are left. */
  preventions?(s: G['state'], occ: Occurrence, w: PreventionWindow): readonly PreventionOffer[];
  /** After the kit prevented `n` with `offer` (pay, count the use). */
  onPrevent?(ctx: Ctx<G>, offer: PreventionOffer, n: number): void;
  /** K111 window 2 candidates. */
  replacementsFor?(s: G['state'], occ: Occurrence): readonly Replacement[];
  /** K111: applies one (`changeOccurrence`, or pushes what happens instead) and says what it did. */
  applyReplacement?(ctx: Ctx<G>, r: Replacement, occ: Occurrence): ReplaceResult;
  /** Who answers the kit's prompts: the affected player (default `keys.player`). */
  chooser?(s: G['state'], occ: Occurrence): string;
  /** The game's prompt from the kit's options (default: those as they are). */
  prompt?(base: Pick<KernelPrompt, 'options' | 'min' | 'max'>, info: TimingPromptInfo): Omit<G['prompt'], 'id'>;
}

export const DEFAULT_ORDER: readonly WindowTiming[] = ['before', 'instead', 'prevention'];
/** The option that ends a prevention window. */
export const PASS = 'pass';

export interface TimingTask extends KernelTask {
  readonly batch: number;
  readonly occ: number;
}
type Timed = { readonly timing?: TimingState };

export const occurrenceOf = (s: Timed, id: number): Occurrence | undefined => s.timing?.occurrences.find((o) => o.id === id);
export const batchOf = (s: Timed, id: number): Batch | undefined => s.timing?.batches.find((b) => b.id === id);
/** The innermost open prevention window. */
export const preventionWindow = (s: Timed): PreventionWindow | undefined =>
  s.timing?.windows.findLast((w) => w.timing === 'prevention') as PreventionWindow | undefined;
/** The keys every occurrence of batch `b` shares (those it declared). */
export function sharedKeys(s: Timed, b: number): OccurrenceKeys {
  const first = s.timing?.occurrences.find((o) => o.batch === b);
  return Object.fromEntries((batchOf(s, b)?.shared ?? []).map((k) => [k, first?.keys[k]]));
}

/** The writable timing state (created on first use). */
export function timingOf<G extends GameTypes>(ctx: Ctx<G>): Draft<TimingState> {
  const s = draftOf(ctx) as Draft<Timed>;
  if (s.timing === undefined) s.timing = adopt({ next: 1, current: null, batches: [], occurrences: [], windows: [] });
  return own(s, 'timing') as Draft<TimingState>;
}

export function occurrenceDraft<G extends GameTypes>(ctx: Ctx<G>, id: number): Draft<Occurrence> {
  const list = own(timingOf(ctx), 'occurrences');
  const i = list.findIndex((o) => o.id === id);
  if (i < 0) throw new EngineBugError(`timing: no occurrence ${String(id)}`);
  return own(list, i);
}

/** Change an occurrence's numbers or keys (a replacement that updates it, K111). */
export function changeOccurrence<G extends GameTypes>(ctx: Ctx<G>, id: number, patch: { readonly amount?: number; readonly keys?: OccurrenceKeys }): void {
  const o = occurrenceDraft(ctx, id);
  if (patch.amount !== undefined) o.amount = patch.amount;
  if (patch.keys !== undefined) o.keys = { ...o.keys, ...patch.keys };
}

/** Runs `f`; tasks it pushed without a batch join batch `b`. */
export function inBatch<G extends GameTypes>(ctx: Ctx<G>, b: number, f: () => void): void {
  const s = draftOf(ctx);
  const before = new Set<object>(s.stack);
  f();
  const st = s.stack;
  for (let i = 0; i < st.length; i += 1) {
    const t = st[i];
    if (t !== undefined && t.batch === undefined && !before.has(t)) st[i] = { ...t, batch: b };
  }
}

/** Start one batch of occurrences ("when ... would"): each gets its windows (`order`) and then happens. Returns the batch id. */
export function would<G extends GameTypes>(
  ctx: Ctx<G>,
  items: readonly OccurrenceInput[],
  opts: { readonly shared?: readonly SharedKey[]; readonly order?: readonly WindowTiming[] } = {},
): number {
  const shared = opts.shared ?? [];
  for (const k of shared) if (new Set(items.map((o) => o.keys?.[k])).size > 1) throw new EngineBugError(`would: the batch shares "${k}" but its occurrences differ`);
  const t = timingOf(ctx);
  const b = t.next;
  t.next = b + 1 + items.length;
  own(t, 'batches').push({ id: b, shared: [...shared] });
  const occs = own(t, 'occurrences');
  const tasks: TimingTask[] = [];
  items.forEach((it, i) => {
    const id = b + 1 + i;
    occs.push({
      id, batch: b, kind: it.kind, keys: { ...it.keys },
      ...(it.amount === undefined ? {} : { amount: it.amount }),
      ...(it.unpreventable === true ? { unpreventable: true } : {}),
      applied: [], state: 'pending',
    });
    for (const w of opts.order ?? DEFAULT_ORDER) tasks.push({ kind: `timing.${w}`, batch: b, occ: id });
    tasks.push({ kind: 'timing.do', batch: b, occ: id });
  });
  ctx.then(...(tasks as unknown as G['task'][]));
  return b;
}

function markCancelled(t: Draft<TimingState>, keep: (o: Occurrence) => boolean): void {
  t.occurrences = t.occurrences.map((o) => (keep(o) || o.state !== 'pending' ? o : { ...o, state: 'cancelled' as const }));
}

/** Cancel batch `b`: its tasks leave the stack, its occurrences are cancelled, its windows close. */
export function cancelBatch<G extends GameTypes>(ctx: Ctx<G>, b: number): void {
  const s = draftOf(ctx);
  s.stack = s.stack.filter((t) => t.batch !== b);
  if (s.timing === undefined) return;
  const t = timingOf(ctx);
  markCancelled(t, (o) => o.batch !== b);
  t.windows = t.windows.filter((w) => w.batch !== b);
  if (t.current === b) t.current = null;
}

/** Ignore batch `b`: only its effect is dropped (`ignored`; `timing.do` then cancels the occurrence); its windows stay. Returns where the topmost effect task is, or -1. */
export function ignoreBatch<G extends GameTypes>(ctx: Ctx<G>, b: number): number {
  const s = draftOf(ctx);
  if (s.timing !== undefined) {
    const t = timingOf(ctx);
    t.occurrences = t.occurrences.map((o) => (o.batch === b && o.state === 'pending' ? { ...o, ignored: true } : o));
  }
  return s.stack.findLastIndex((t) => t.batch === b && t.kind === 'timing.do');
}

/** Instead of batch `b`'s effect, `tasks` happen (just before its first `timing.do`; tagged with `b`, so a later cancel removes them). */
export function insteadOf<G extends GameTypes>(ctx: Ctx<G>, b: number, ...tasks: readonly G['task'][]): void {
  const at = ignoreBatch(ctx, b);
  const tagged = tasks.map((t) => (t.batch === undefined ? { ...t, batch: b } : t));
  if (at < 0) {
    ctx.then(...tagged);
    return;
  }
  const s = draftOf(ctx);
  s.stack = [...s.stack.slice(0, at + 1), ...tagged.reverse(), ...s.stack.slice(at + 1)] as typeof s.stack;
}

/** Prevent up to `n` in the innermost prevention window; returns how much was prevented. */
export function prevent<G extends GameTypes>(ctx: Ctx<G>, n: number): number {
  const i = ctx.s.timing?.windows.findLastIndex((w) => w.timing === 'prevention') ?? -1;
  if (i < 0) throw new EngineBugError('prevent: no prevention window is open');
  const w = own(own(timingOf(ctx), 'windows'), i) as Draft<PreventionWindow>;
  if (w.unpreventable === true) throw new EngineBugError('prevent: the window is unpreventable');
  const k = Math.max(0, Math.min(n, w.remaining));
  w.remaining -= k;
  w.prevented += k;
  return k;
}

/** Drop occurrences that happened or were cancelled, and batches left empty; returns them (K95 collects from here). */
export function takeSettled<G extends GameTypes>(ctx: Ctx<G>): Occurrence[] {
  if (ctx.s.timing === undefined) return [];
  const t = timingOf(ctx);
  const done = t.occurrences.filter((o) => o.state !== 'pending');
  if (done.length === 0) return [];
  t.occurrences = t.occurrences.filter((o) => o.state === 'pending');
  t.batches = t.batches.filter((b) => t.occurrences.some((o) => o.batch === b.id));
  return done;
}

export const chooserOf = <G extends GameTypes>(cfg: TimingConfig<G>, s: G['state'], o: Occurrence): string => cfg.chooser?.(s, o) ?? o.keys.player ?? '';
export const promptOf = <G extends GameTypes>(cfg: TimingConfig<G>, base: Pick<KernelPrompt, 'options' | 'min' | 'max'>, info: TimingPromptInfo): Omit<G['prompt'], 'id'> =>
  cfg.prompt?.(base, info) ?? (base as Omit<G['prompt'], 'id'>);

export function startTask<G extends GameTypes>(ctx: Ctx<G>, task: TimingTask): Occurrence {
  const o = occurrenceOf(ctx.s, task.occ);
  if (o === undefined) throw new EngineBugError(`timing: no occurrence ${String(task.occ)}`);
  if (ctx.s.timing?.current !== task.batch) timingOf(ctx).current = task.batch;
  return o;
}

export function openWindow<G extends GameTypes>(ctx: Ctx<G>, w: Window): void {
  own(timingOf(ctx), 'windows').push(w);
  ctx.then({ kind: 'timing.close', batch: w.batch, occ: w.occurrence } as TimingTask);
}

const offers = <G extends GameTypes>(cfg: TimingConfig<G>, s: G['state'], o: Occurrence, w: PreventionWindow): readonly PreventionOffer[] =>
  (cfg.preventions?.(s, o, w) ?? []).filter((f) => f.prevention.prevents === o.kind && (f.prevention.uses === undefined || (f.used ?? 0) < f.prevention.uses));

/** The kit's task handlers; a game spreads them into its own table. */
export function timingHandlers<G extends GameTypes>(cfg: TimingConfig<G>): HandlerTable<G> {
  const re = (task: TimingTask, kind: string): G['task'] => ({ kind, batch: task.batch, occ: task.occ }) as TimingTask;
  return {
    ...replaceHandlers(cfg),
    'timing.before': (ctx, t) => {
      const task = t as TimingTask;
      const o = startTask(ctx, task);
      if (cfg.before === undefined || o.state !== 'pending') return;
      openWindow(ctx, { timing: 'before', kind: o.kind, batch: o.batch, occurrence: o.id });
      inBatch(ctx, o.batch, () => cfg.before?.(ctx, o));
    },
    'timing.prevention': (ctx, t) => {
      const task = t as TimingTask;
      const o = startTask(ctx, task);
      if (o.state !== 'pending' || cfg.preventions === undefined || o.amount === undefined || o.amount <= 0) return;
      const w: PreventionWindow = { timing: 'prevention', kind: o.kind, batch: o.batch, occurrence: o.id, count: o.amount, remaining: o.amount, prevented: 0, ...(o.unpreventable === true ? { unpreventable: true } : {}) };
      openWindow(ctx, w);
      ctx.then(re(task, 'timing.preventAsk'));
    },
    'timing.preventAsk': (ctx, t) => {
      const task = t as TimingTask;
      const o = startTask(ctx, task);
      const w = preventionWindow(ctx.s);
      if (w === undefined || w.occurrence !== o.id || w.remaining <= 0 || w.unpreventable === true) return;
      const fs = offers(cfg, ctx.s, o, w);
      if (fs.length === 0) return;
      ctx.then(re(task, 'timing.preventPick'));
      const options = [...fs.map((f) => ({ id: f.id, enabled: true })), { id: PASS, enabled: true }];
      ctx.ask(promptOf(cfg, { options, min: 1, max: 1 }, { why: 'prevent', player: chooserOf(cfg, ctx.s, o), occurrence: o, window: w }));
    },
    'timing.preventPick': (ctx, t) => {
      const task = t as TimingTask;
      const pick = task.answer?.[0];
      if (pick === undefined || pick === PASS) return;
      const o = startTask(ctx, task);
      const w = preventionWindow(ctx.s);
      const f = w === undefined ? undefined : offers(cfg, ctx.s, o, w).find((x) => x.id === pick);
      if (w === undefined || f === undefined) throw new EngineBugError(`prevent: "${pick}" is not offered`);
      ctx.then(re(task, 'timing.preventAsk'));
      const n = prevent(ctx, f.prevention.max ?? w.remaining);
      inBatch(ctx, task.batch, () => cfg.onPrevent?.(ctx, f, n));
    },
    'timing.close': (ctx, t) => {
      const task = t as TimingTask;
      const tm = timingOf(ctx);
      const i = tm.windows.findLastIndex((w) => w.occurrence === task.occ);
      const w = tm.windows[i];
      if (w === undefined) return;
      if (w.timing === 'prevention') {
        const p = w as PreventionWindow;
        const o = occurrenceDraft(ctx, task.occ);
        o.amount = p.remaining;
        if (p.prevented > 0) o.prevented = (o.prevented ?? 0) + p.prevented;
      }
      tm.windows = tm.windows.filter((_, j) => j !== i);
    },
    'timing.do': (ctx, t) => {
      const task = t as TimingTask;
      const o = startTask(ctx, task);
      if (o.state === 'pending') {
        if (o.ignored === true || (o.amount === 0 && (o.prevented ?? 0) > 0)) occurrenceDraft(ctx, o.id).state = 'cancelled';
        else {
          inBatch(ctx, o.batch, () => cfg.happen(ctx, o));
          occurrenceDraft(ctx, o.id).state = 'happened';
          const e = cfg.event?.(o);
          if (e !== undefined) ctx.emit({ ...e, batch: o.batch, occurrence: o.id });
        }
      }
      timingOf(ctx).current = null;
    },
  };
}
