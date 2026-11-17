// K267 (audit G02/T7): triggers declared on card data (`when`), compiled onto engine-core's K94 trigger model (the
// after-window: occurrences that happened; once per item or per instance; priority / ability key / id order; `invalid`
// drops one whose source left). Shape from STCC `TriggeredOperation` (`trigger: { event, who, filter }` + steps,
// src/engine/types/cardlang.ts) and Radiance's planned ability (`on: { event, timing, filter }`, `cond`, `steps`).
import type { Ctx, GameTypes, Occurrence, PendingTrigger, TriggerCandidate, TriggerOrder } from '../engine-core/index.ts';
import { locate, type Zoned } from '../card-zones/index.ts';
import { EngineBugError } from '../engine-core/index.ts';
import { effectTasks, validateEffect, type AnyVerbTable, type Step } from './index.ts';

/** One trigger of a card: on an occurrence of kind `on` that happened, if the game's test `if` holds, run `then`. */
export interface When<S extends Step = Step> {
  readonly on: string;
  readonly if?: string;
  readonly then: readonly S[];
  /** The controller may decline: runs as the pack's `may` step (the table must hold `may`). */
  readonly optional?: boolean;
  readonly once?: 'perItem' | 'perInstance';
  readonly order?: TriggerOrder;
}
export interface WhenCard<S extends Step = Step> {
  readonly when?: readonly When<S>[];
}
export interface WhenConfig<G extends GameTypes, E> {
  /** Card data by card (definition) id. */
  readonly pool: Readonly<Record<string, WhenCard>>;
  /** The controller of a card. */
  readonly player: (s: G['state'], card: string) => string;
  /** The definition id of a card (default the card id). */
  readonly defOf?: (s: G['state'], card: string) => string;
  /** Where a card's triggers are live (default: card-zones zone `play` or `play:<seat>`). */
  readonly active?: (s: G['state'], card: string) => boolean;
  /** The cards to look at (default every card of every zone that is `active`). */
  readonly sources?: (s: G['state']) => readonly string[];
  /** The env the steps run with (default `{ seat: player, source: card }`). */
  readonly env?: (s: G['state'], card: string, player: string) => E;
  /** The game's tests named by `if`. */
  readonly tests?: Readonly<Record<string, (s: G['state'], env: E, occ: Occurrence) => boolean>>;
  /** The game's verb table: needed when an entry is `optional` (it must hold `may`). */
  readonly table?: AnyVerbTable;
}

const inPlay = (s: unknown, card: string): boolean => {
  const z = locate(s as Zoned, card)?.zone;
  return z === 'play' || (z?.startsWith('play:') ?? false);
};

/** Spread into engine-core's `TimingConfig`: `triggersFor`, `invalid` (source no longer active) and `resolveTrigger` (pushes `then` as verb tasks). */
export function cardTriggers<G extends GameTypes, E = { seat: string; source: string }>(cfg: WhenConfig<G, E>): {
  triggersFor(s: G['state'], o: Occurrence): readonly TriggerCandidate[];
  invalid(s: G['state'], t: PendingTrigger): string | undefined;
  resolveTrigger(ctx: Ctx<G>, t: PendingTrigger): void;
} {
  for (const [d, c] of Object.entries(cfg.pool))
    for (const w of c.when ?? []) {
      if (w.if !== undefined && !Object.hasOwn(cfg.tests ?? {}, w.if)) throw new EngineBugError(`cardTriggers: ${d} names test ${w.if}, not in tests`);
      if (w.optional === true && !Object.hasOwn(cfg.table ?? {}, 'may')) throw new EngineBugError(`cardTriggers: ${d} is optional but the table has no may`);
    }
  const active = cfg.active ?? inPlay;
  const def = cfg.defOf ?? ((_s, c) => c);
  const env = cfg.env ?? ((_s, card, seat) => ({ seat, source: card }) as E);
  const sources = cfg.sources ?? ((s) => Object.values((s as unknown as Zoned).zones).flatMap((z) => z.cards).filter((c) => active(s, c)));
  const entry = (s: G['state'], t: PendingTrigger): When | undefined => cfg.pool[def(s, t.source)]?.when?.[Number(t.ability.slice(t.ability.lastIndexOf('#') + 1))];
  return {
    triggersFor: (s, o) =>
      sources(s).flatMap((card) => {
        const d = def(s, card);
        const player = cfg.player(s, card);
        return (cfg.pool[d]?.when ?? []).flatMap((w, i): TriggerCandidate[] => {
          if (w.on !== o.kind) return [];
          if (w.if !== undefined && !(cfg.tests?.[w.if] as NonNullable<typeof cfg.tests>[string])(s, env(s, card, player), o)) return [];
          return [{ ability: `${d}#${String(i).padStart(4, '0')}`, source: card, player, ...(w.once ? { once: w.once } : {}), ...(w.order ? { order: w.order } : {}) }];
        });
      }),
    invalid: (s, t) => (active(s, t.source) ? undefined : 'left play'),
    resolveTrigger: (ctx, t) => {
      const w = entry(ctx.s, t);
      if (w === undefined) throw new EngineBugError(`cardTriggers: no when entry for ${t.ability}`);
      ctx.then(...(effectTasks(w.optional === true ? [{ op: 'may', then: w.then } as Step] : w.then, env(ctx.s, t.source, t.player)) as unknown as G['task'][]));
    },
  };
}

const KEYS = ['on', 'if', 'then', 'optional', 'once', 'order'];

/** The problems of a card's `when` list: unknown keys, `on` not in `kinds` (when given), `if` not in `tests` (when given), invalid `then`. [] when valid. */
export function validateWhen(table: AnyVerbTable, when: unknown, opts: { readonly kinds?: readonly string[]; readonly tests?: readonly string[] } = {}): string[] {
  if (!Array.isArray(when) || when.length === 0) return ['when must be a non-empty list'];
  return when.flatMap((w: unknown, i) => {
    const at = `when[${String(i)}]`;
    if (typeof w !== 'object' || w === null || Array.isArray(w)) return [`${at}: must be an object`];
    const o = w as Record<string, unknown>;
    const out = Object.keys(o).filter((k) => !KEYS.includes(k)).map((k) => `${at}.${k}: unknown key`);
    if (typeof o.on !== 'string' || o.on === '') out.push(`${at}.on: must be an event kind`);
    else if (opts.kinds && !opts.kinds.includes(o.on)) out.push(`${at}.on: unknown event kind ${JSON.stringify(o.on)}`);
    if (o.if !== undefined && (typeof o.if !== 'string' || (opts.tests && !opts.tests.includes(o.if)))) out.push(`${at}.if: unknown test ${JSON.stringify(o.if)}`);
    if (o.optional !== undefined && typeof o.optional !== 'boolean') out.push(`${at}.optional: must be true or false`);
    if (o.optional === true && !Object.hasOwn(table, 'may')) out.push(`${at}.optional: the verb table has no may`);
    if (o.once !== undefined && o.once !== 'perItem' && o.once !== 'perInstance') out.push(`${at}.once: must be perItem or perInstance`);
    const r = o.order;
    if (r !== undefined && r !== 'silent' && r !== 'interactive' && !(typeof r === 'object' && r !== null && typeof (r as { auto?: unknown }).auto === 'string' && Object.keys(r).length === 1)) out.push(`${at}.order: must be silent, interactive or { auto }`);
    out.push(...validateEffect(table, o.then).map((p) => `${at}.then${p.startsWith('[') ? '' : ': '}${p}`));
    return out;
  });
}
