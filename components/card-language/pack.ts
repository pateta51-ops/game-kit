// K232 (GAPS-4 B3, owner decision 3a, 16 Nov 2026): the standard verb pack on card-zones. Verbs written by two or more
// of STCC, Imperium, Rome, Unstoppable, Jarl, EBR, or needed by Radiance. Every card-moving verb goes through timing's
// `would` (one occurrence per card, kind = the verb); asking verbs use `askVerb` and resume from the answer, so a save in
// the middle of an effect resumes. Words: default templates with slots, the game overrides them (`words`).
import { bar, canonicalJson, closeDraft, copyState, draftOf, EngineBugError, GameOver, makeCtx, openDraft, own, run, would, type Ctx, type Draft, type GameTypes, type HandlerTable, type KernelOption, type KernelPrompt, type KernelState, type Occurrence } from '../engine-core/index.ts';
import { canSee, cardsIn, locate, moveCard, reveal, shuffleZone, type At, type Zone, type Zoned } from '../card-zones/index.ts';
import { askVerb, bool, describeEffect, effectOf, effectTasks, int, oneOf, optional, posInt, str, type AnyVerbTable, type Field, type Step, type Verb, type VerbTable } from './index.ts';

/** A number, or `'X'`: the env's `n` (set by `count` and `chooseNumber`). */
export type Amount = number | 'X';
/** Which cards: `chosen` (env.cards), `source` (env.source), `top` (top `count` of `from`, read when it happens), `pick` (the seat picks `count` in `from`), `all` of `from`. */
export type Sel = 'chosen' | 'source' | 'top' | 'pick' | 'all';
type Eff = readonly (PackStep | Step)[];
interface Cards {
  readonly cards?: Sel;
  readonly count?: Amount;
  readonly from?: string;
  readonly filter?: string;
}
type Mover<K extends string> = K extends string ? Cards & { readonly op: K; readonly to?: string; readonly at?: At } : never;
type Looker<K extends string> = K extends string ? Cards & { readonly op: K; readonly then?: Eff } : never;
type Marker<K extends string> = K extends string ? Cards & { readonly op: K } : never;
export type MoveOp = 'draw' | 'discard' | 'mill' | 'move' | 'putIntoPlay' | 'setAside' | 'recall' | 'gain' | 'destroy' | 'detach';
export type PackStep =
  | Mover<MoveOp>
  | (Cards & { readonly op: 'attach'; readonly host?: 'chosen' | 'source' })
  | { readonly op: 'refill'; readonly zone: string; readonly from: string; readonly size: number }
  | { readonly op: 'shuffle'; readonly zone: string }
  | { readonly op: 'search'; readonly zone: string; readonly filter?: string; readonly count?: Amount; readonly to?: string; readonly shuffle?: boolean }
  | Looker<'reveal' | 'lookAt'>
  | { readonly op: 'scout'; readonly from?: string; readonly count: Amount }
  | Marker<'flip' | 'exhaust' | 'ready'>
  | { readonly op: 'chooseCards'; readonly zone: string; readonly min?: number; readonly max: Amount; readonly filter?: string; readonly then: Eff }
  | { readonly op: 'chooseOption'; readonly options: readonly Eff[] }
  | { readonly op: 'may'; readonly then: Eff }
  | { readonly op: 'chooseNumber'; readonly min?: number; readonly max: Amount; readonly then: Eff }
  | (Cards & { readonly op: 'chooseDestination'; readonly to: readonly string[]; readonly at?: At })
  | { readonly op: 'choosePlayer'; readonly others?: boolean; readonly then: Eff }
  | { readonly op: 'choosePayment'; readonly ways: readonly Eff[]; readonly then: Eff }
  | { readonly op: 'orderEffects'; readonly effects: readonly Eff[] }
  | { readonly op: 'gainResource'; readonly res: string; readonly amount: Amount }
  | { readonly op: 'pay'; readonly res: string; readonly amount: Amount }
  | { readonly op: 'convert'; readonly res: string; readonly amount: Amount; readonly into: string; readonly get: Amount }
  | { readonly op: 'adjust'; readonly key: string; readonly by: number; readonly min?: number; readonly max?: number }
  | { readonly op: 'seq'; readonly steps: Eff }
  | { readonly op: 'if'; readonly test: string; readonly then: Eff; readonly else?: Eff }
  | { readonly op: 'forEach'; readonly then: Eff }
  | { readonly op: 'eachPlayer'; readonly then: Eff }
  | { readonly op: 'repeat'; readonly times: Amount; readonly then: Eff }
  | { readonly op: 'count'; readonly what: string; readonly then: Eff }
  | { readonly op: 'later'; readonly at: string; readonly then: Eff }
  | { readonly op: 'payThen'; readonly cost: Eff; readonly then: Eff }
  | { readonly op: 'custom'; readonly name: string; readonly n?: Amount };
export type PackOp = PackStep['op'];

/** The env the pack reads: the acting seat, the source card, the chosen cards, the computed number. A game's env extends it. */
export interface PackEnv {
  readonly seat: string;
  readonly source?: string;
  readonly cards?: readonly string[];
  readonly n?: number;
  /** Set by the pack while a `payThen` cost runs: the first occurrence id of the cost (a cancelled one means unpaid). */
  readonly paidFrom?: number;
  /** K529, set by the pack while a cost judged as a whole is paid: the cost steps still to pay after this one. */
  readonly owed?: readonly Step[];
}
/** A move waiting for its occurrence (`cardMoves`, keyed by occurrence id). */
export interface PendingMove {
  readonly op: string;
  readonly seat: string;
  readonly from: string;
  readonly to: string;
  readonly at: At;
  readonly top?: true;
  /** A reshuffle: every card of `from` into `to`, then `to` is shuffled. */
  readonly all?: true;
  /** A draw retried after a reshuffle: it does not reshuffle again. */
  readonly again?: true;
}
/** State the pack adds (all optional, absent until used): pending moves, card marks (`flipped`, `exhausted`), delayed effects, default resource store. */
export interface PackState extends Zoned {
  readonly cardMoves?: Readonly<Record<string, PendingMove>>;
  readonly marks?: Readonly<Record<string, readonly string[]>>;
  readonly later?: readonly { readonly at: string; readonly steps: Eff; readonly env: unknown }[];
  readonly res?: Readonly<Record<string, Readonly<Record<string, number>>>>;
}
export interface Moved {
  readonly op: string;
  readonly card: string;
  readonly from: string;
  readonly to: string;
  readonly seat: string;
}
type Words = string | ((step: never) => string);
/** K529: what the would-change-nothing check answers. `unknown`: hidden information, a random draw, a cap hit, or a step the engine cannot run. */
export type Offered = 'yes' | 'no' | 'unknown';
/** K583: why a check answered `unknown`: a handler threw (`error` holds it), cards the seat cannot see, another seat's choice, a random draw, a cap hit (`budget`), or the check was called inside itself. With several, the first of this list. */
export type OfferReason = 'error' | 'hidden' | 'otherSeat' | 'random' | 'budget' | 'nested';
/** K583: the check's answer with its reason (`pack.judge`). */
export interface OfferCheck {
  readonly answer: Offered;
  /** K605: a game's `decide` may return its own reason (any string). */
  readonly reason?: OfferReason | SkipReason | (string & {});
  readonly error?: unknown;
}
/** K605: why a step changed nothing: a false condition, a cost that cannot be paid, no card it may take, an empty zone, or none of these. K597: `short`, a step that did less than its number; `gameOver`, the game ended before the step (resolves only). */
export type SkipReason = 'condition' | 'cannotPay' | 'noTarget' | 'emptyZone' | 'noChange' | 'short' | 'gameOver';
/** K597: how much of an effect would resolve: every top-level step on some line of play (`full`), some step but never all (`part`), none (`none`), or `unknown`. */
export type Resolved = 'full' | 'part' | 'none' | 'unknown';
/** K597: `pack.resolves`'s answer; `skipped`: the steps the best line does not resolve, each with its reason (`error` holds what a handler threw). */
export interface ResolveCheck {
  readonly answer: Resolved;
  readonly skipped: readonly { readonly step: number; readonly reason: SkipReason | OfferReason; readonly error?: unknown }[];
  readonly reason?: OfferReason;
  readonly error?: unknown;
}
/** K529: when an effect is offered; set once per game from its rulings. Every default is the pack's behaviour before the policy existed. */
export interface OfferPolicy<S = unknown> {
  /** `may` (and an optional trigger) whose effect would change nothing: `ask` anyway (default), `skip` (not offered), `bar` (asked, yes barred with the code `noChange`). */
  readonly noChange?: 'ask' | 'skip' | 'bar';
  /** A cost of several steps (`payThen`, a `choosePayment` way): `parts` (default: each step judged alone on the state as it is) or `whole` (resources summed, card-taking steps matched to distinct cards). */
  readonly cost?: 'parts' | 'whole';
  /** `chooseCards` with fewer cards than its `min`: `cap` (default: asks for what is there) or `exact` (not offered, `then` does not run). */
  readonly fewer?: 'cap' | 'exact';
  /** `chooseOption` and `choosePayment` options that are dead: `today` (default), `skip` (no live option: not offered), `bar` (each dead option barred with a code; no live option: not offered). */
  readonly deadChoice?: 'today' | 'skip' | 'bar';
  /** What an `unknown` result counts as: `offer` (default) or `skip`. */
  readonly unknown?: 'offer' | 'skip';
  /** K583, a paid effect (`payThen`, a `choosePayment` way) in the check: `cost` (default: judged on its cost alone, `then` is not run) or `effect` (a payable cost is able; the cost is paid on the copy, `then` runs, and only what `then` changes counts). */
  readonly paid?: 'cost' | 'effect';
  /** K583: `true` throws every error a handler throws inside the check (default: the check answers `unknown` with the reason `error`). For tests of card data. */
  readonly strict?: boolean;
  /** The check's caps: answers tried in all (default 32) and tasks run per answer (default 2000). A cap hit is `unknown`. */
  readonly branches?: number;
  readonly tasks?: number;
  /** What counts as the game for the check (default: the state without the kernel's and the pack's bookkeeping). */
  readonly view?: (s: S) => unknown;
  /** K605: the game decides the check's answer: gets the check (a `no` with its reason) and returns the answer used by `judge`, `wouldChange` and the policy. */
  readonly decide?: (s: S, steps: readonly (PackStep | Step)[], env: PackEnv, check: OfferCheck) => OfferCheck;
  /** K605: the reason on a barred option: `code` (default: `cannotPay` or `noChange`, as before) or `why` (the reason of `judge(..., { why: true })`). With `decide` set, a reason it returns is used under both. */
  readonly barReason?: 'code' | 'why';
}
export interface PackConfig<G extends GameTypes, E extends PackEnv = PackEnv> {
  /** Default zones per verb (names; `hand` means `hand:<seat>` when that zone exists). */
  readonly zones?: Partial<Record<PackOp, { readonly from?: string; readonly to?: string }>>;
  /** Draw from an empty `deck`: the zone shuffled into it (the game's rule), or undefined to stop. Default: stop. */
  readonly reshuffle?: (s: G['state'], deck: string, seat: string) => string | undefined;
  readonly filters?: Readonly<Record<string, (s: G['state'], card: string, env: E) => boolean>>;
  readonly tests?: Readonly<Record<string, (s: G['state'], env: E) => boolean>>;
  readonly counts?: Readonly<Record<string, (s: G['state'], env: E) => number>>;
  /** Seats in turn order (choosePlayer, eachPlayer). */
  readonly seats?: (s: G['state']) => readonly string[];
  /** choosePlayer with no seat to offer: the seat `then` runs with, or undefined to skip it (default skip). */
  readonly noPlayer?: (s: G['state'], env: E) => string | undefined;
  /** Resources and counters; default `state.res[seat][key]`. */
  readonly res?: { get(s: G['state'], seat: string, key: string): number; set(ctx: Ctx<G>, seat: string, key: string, n: number): void };
  /** K583: the amount a `pay` or `convert` step asks for now (a tax, a discount); default the printed amount. Read by the can-pay check, the whole-cost sum, the payment and `costed`. */
  readonly due?: (s: G['state'], step: PackStep, env: E, printed: number) => number;
  readonly custom?: Readonly<Record<string, { run(ctx: Ctx<G>, step: PackStep, env: E): void; readonly resume?: (ctx: Ctx<G>, step: PackStep, env: E, answer: readonly string[]) => void; readonly payable?: (s: G['state'], step: PackStep, env: E) => boolean; text(step: PackStep): string; readonly viewSafe?: boolean }>>;
  /** The game's words per verb: a template (`{slot}`, `{slot:noun}` for "2 nouns") or a function of the step. */
  readonly words?: Partial<Record<PackOp, Words>>;
  /** Words for a zone, resource, test, count or `later` moment name in a template (default the name). */
  readonly word?: (kind: 'zone' | 'res' | 'test' | 'what' | 'at' | 'key', name: string) => string;
  /** The game's prompt from the pack's (`kind` is the verb's question, `seat` the chooser). */
  readonly prompt?: (base: Omit<KernelPrompt, 'id'>, step: PackStep, env: E) => Omit<G['prompt'], 'id'>;
  /** Called after each card moved (for the log). */
  readonly moved?: (ctx: Ctx<G>, m: Moved) => void;
  /** The game's whole verb table, for nested effects (default the pack). */
  readonly table?: () => AnyVerbTable;
  /** K529: the offer policy (default: none, the pack as before). */
  readonly offer?: OfferPolicy<G['state']>;
  /** K529: the game's handler table (`() => RULES.handlers`); the check runs the effect on a copy with it. Needed by `wouldChange`, `noChange` and `deadChoice`. */
  readonly handlers?: () => HandlerTable<G>;
}

const FIXED = 'card-language:due-read';
const STEP = 'card-language:step';
const PAID = 'card-language:paid';
const SAME_ENV: readonly string[] = ['seq', 'may', 'if', 'chooseOption', 'choosePayment', 'orderEffects', 'repeat', 'payThen'];
class Stop extends Error {
  readonly reason: OfferReason;
  constructor(reason: OfferReason) {
    super('card-language pack: the dry run cannot know');
    this.reason = reason;
  }
}
const stop = (reason: OfferReason = 'hidden'): never => {
  throw new Stop(reason);
};
const CHANGED = new Error('card-language pack: the dry run saw a change');
let dry: string | null = null;
/** K529: is the pack's check running this handler on a copy? */
export const inDryRun = (): boolean => dry !== null;
/** K583: the seat the check judges for, or null outside the check. */
export const dryRunSeat = (): string | null => dry;
/** K583: a game test, count, filter or custom verb calls this before it reads cards the acting seat cannot see: inside the check that answer is `unknown` (reason `hidden`); in the real run it does nothing. */
export const cannotKnow = (): void => {
  if (dry !== null) stop('hidden');
};
// Distinct cards for card-taking cost steps: each need lists the cards that could pay it (augmenting paths, not first fit).
const matched = (need: readonly (readonly string[])[]): boolean => {
  const by = new Map<string, number>();
  const place = (i: number, seen: Set<string>): boolean => (need[i] ?? []).some((c) => {
    if (seen.has(c)) return false;
    seen.add(c);
    const j = by.get(c);
    if (j !== undefined && !place(j, seen)) return false;
    by.set(c, i);
    return true;
  });
  return need.every((_, i) => place(i, new Set()));
};
// What a cost judged as a whole has taken so far: resources, top cards per zone, and per pool (`move`, `exhaust`, `ready`) the cards each step could use.
interface Ledger { readonly res: Record<string, number>; readonly top: Record<string, number>; readonly need: Record<string, string[][]> }

const SELS: readonly Sel[] = ['chosen', 'source', 'top', 'pick', 'all'];
const DEF: Record<string, { from?: string; to?: string; sel?: Sel; at?: At }> = {
  draw: { from: 'deck', to: 'hand', sel: 'top', at: 'bottom' }, discard: { from: 'hand', to: 'discard', sel: 'pick' }, mill: { from: 'deck', to: 'discard', sel: 'top' },
  move: { from: 'deck', to: 'discard', sel: 'top' }, putIntoPlay: { from: 'hand', to: 'play', sel: 'pick' }, setAside: { from: 'hand', to: 'aside', sel: 'source' },
  recall: { from: 'aside', to: 'hand', sel: 'all' }, gain: { from: 'market', to: 'discard', sel: 'pick' }, destroy: { from: 'play', to: 'discard', sel: 'pick' },
  detach: { to: 'discard', sel: 'chosen' }, attach: { from: 'hand', sel: 'source' }, reveal: { from: 'deck', sel: 'top' }, lookAt: { from: 'deck', sel: 'top' },
  scout: { from: 'deck' }, flip: { from: 'play', sel: 'source' }, exhaust: { from: 'play', sel: 'source' }, ready: { from: 'play', sel: 'source' },
  chooseDestination: { from: 'hand', sel: 'source' }, search: { to: 'hand' },
};
export const PACK_WORDS: Readonly<Record<PackOp, string>> = {
  draw: 'Draw {count:card}.', discard: 'Discard {what}.', mill: 'Put {what} into {to}.', move: 'Put {what} on the {at} of {to}.',
  putIntoPlay: 'Put {what} into play.', setAside: 'Set {what} aside.', recall: 'Return {what} to {to}.', gain: 'Gain {what}.',
  destroy: 'Destroy {what}.', detach: 'Detach {what}.', attach: 'Attach {what} to {host}.', refill: 'Refill {zone} to {size:card} from {from}.',
  shuffle: 'Shuffle {zone}.', search: 'Search {zone} for {count:card} and put {count:it} into {to}.', reveal: 'Reveal {what}. {then}', lookAt: 'Look at {what}. {then}',
  scout: 'Look at the top {count:card} of {from} and put them back in any order.', flip: 'Flip {what}.', exhaust: 'Exhaust {what}.', ready: 'Ready {what}.',
  chooseCards: 'Choose {max:card} in {zone}. {then}', chooseOption: 'Choose one: {options}', may: 'You may: {then}', chooseNumber: 'Choose a number from {min} to {max}. {then}',
  chooseDestination: 'Put {what} into {to}.', choosePlayer: 'Choose a player. {then}', choosePayment: 'Pay {ways} {then}', orderEffects: 'In any order: {effects}',
  gainResource: 'Gain {amount} {res}.', pay: 'Pay {amount} {res}.', convert: 'Pay {amount} {res} to gain {get} {into}.', adjust: 'Move {key} by {by}.',
  seq: '{steps}', if: 'If {test}: {then} {else}', forEach: 'For each of them: {then}', eachPlayer: 'Each player: {then}', repeat: 'Do this {times} times: {then}',
  count: 'X is {what}. {then}', later: '{at}: {then}', payThen: '{cost} If you do: {then}', custom: '{name}',
};

const amount: Field = (v) => (v === 'X' || posInt(v) === null ? null : 'a positive integer or X');
const at: Field = (v) => (v === 'top' || v === 'bottom' || (typeof v === 'number' && Number.isInteger(v) && v >= 0) ? null : 'top, bottom or an index');
const names: Field = (v) => (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && x !== '') ? null : 'a non-empty list of names');
const plural = (n: unknown, w: string): string => (w === 'it' ? (n === 1 ? 'it' : 'them') : `${String(n)} ${w}${n === 1 ? '' : 's'}`);
const isEff = (v: unknown): v is Eff => Array.isArray(v) && typeof v[0] === 'object' && v[0] !== null && 'op' in v[0];

/** Is `mark` on the card (`flipped`, `exhausted`)? */
export const hasMark = (s: PackState, id: string, mark: string): boolean => s.marks?.[id]?.includes(mark) ?? false;

/** Runs the delayed effects waiting for `at` (the game calls it at that moment: end of turn, next upkeep...). */
export function runLater<G extends GameTypes>(ctx: Ctx<G>, at: string): void {
  const s = draftOf(ctx) as unknown as Draft<PackState>;
  const due = (s.later ?? []).filter((l) => l.at === at);
  if (due.length === 0) return;
  s.later = (s.later ?? []).filter((l) => l.at !== at);
  ctx.then(...(due.flatMap((l) => effectTasks(l.steps, l.env)) as unknown as G['task'][]));
}

/** The pack: `verbs` (spread into the game's table), `happen` (call it first in timing's `cfg.happen`; true when the occurrence was a pack move). */
export function cardPack<G extends GameTypes, E extends PackEnv = PackEnv>(cfg: PackConfig<G, E> = {}): { verbs: VerbTable<G, PackStep, E>; happen: (ctx: Ctx<G>, occ: Occurrence) => boolean; wouldChange: (s: G['state'], content: G['content'], steps: readonly (PackStep | Step)[], env: E) => Offered; judge: (s: G['state'], content: G['content'], steps: readonly (PackStep | Step)[], env: E, opts?: { readonly why?: boolean }) => OfferCheck; resolves: (s: G['state'], content: G['content'], steps: readonly (PackStep | Step)[], env: E) => ResolveCheck; costed: <T extends readonly (PackStep | Step)[]>(s: G['state'], steps: T, env: E) => T } {
  const P: OfferPolicy<G['state']> = cfg.offer ?? {};
  const checks = (P.noChange ?? 'ask') !== 'ask' || (P.deadChoice ?? 'today') !== 'today';
  if (checks && !cfg.handlers) throw new EngineBugError('card-language pack: offer.noChange and offer.deadChoice need cfg.handlers (() => RULES.handlers)');
  type V = Verb<G, never, E>;
  const S = (ctx: Ctx<G>): Draft<PackState> => draftOf(ctx) as unknown as Draft<PackState>;
  const table = (): AnyVerbTable => cfg.table?.() ?? (verbs);
  const eff = effectOf(table);
  const effs: Field = (v) => (Array.isArray(v) && v.length > 0 ? (v.map(eff).find((x) => x !== null) ?? null) : 'a non-empty list of effects');
  const need = (env: E | undefined): E => {
    if (env === undefined) throw new EngineBugError('card-language pack: a verb ran with no env (pass { seat })');
    return env;
  };
  const n = (a: Amount | undefined, env: E, d = 1): number => (a === undefined ? d : a === 'X' ? (env.n ?? 0) : a);
  // K529 seam: the one place a cost amount is read (judged in `payable`, taken in `pay` and `convert`).
  // K583: `cfg.due` gives the amount asked for now.
  // An amount written `X` is the number the effect computed: `due` is not called for it. A result that is not a whole number of 0 or more is the game's bug.
  // K583: a cost step `payThen` read at its start carries the key FIXED (a step field a game does not write; it survives a saved state), and is not read again.
  const due = (s: PackState, p: { readonly amount: Amount }, env: E): number => {
    const printed = n(p.amount, env);
    if (!cfg.due || p.amount === 'X' || (p as Record<string, unknown>)[FIXED] === true) return printed;
    const d = cfg.due(ro(s) as unknown as G['state'], p as PackStep, env, printed);
    if (!Number.isInteger(d) || d < 0) throw new EngineBugError(`card-language pack: due gave ${String(d)} for a cost of ${String(printed)} (a whole number, 0 or more, is needed)`);
    return d;
  };
  // K583: the steps with each cost amount as `cfg.due` gives it (for labels); the same object when nothing differs.
  const costed = <T extends Eff>(s: G['state'], steps: T, env: E, mark = false): T => {
    const all = (xs: Eff): Eff => {
      const ys = xs.map(one);
      return ys.every((y, i) => y === xs[i]) ? xs : ys;
    };
    const one = (x: PackStep | Step): PackStep | Step => {
      const p = x as PackStep;
      let out: object = x;
      if ((p.op === 'pay' || p.op === 'convert') && p.amount !== 'X') {
        const d = due(s as unknown as PackState, p, env);
        if (mark) out = { ...p, amount: d, [FIXED]: true };
        else if (d !== n(p.amount, env)) out = { ...p, amount: d };
      }
      // K583: a cost is read at its start only through steps that keep its env; a step under one that changes the env (another seat, other cards) is read when it is paid.
      if (mark && !SAME_ENV.includes(p.op)) return out as PackStep | Step;
      for (const [k, v] of Object.entries(x) as [string, unknown][]) {
        const w: unknown = isEff(v) ? all(v) : Array.isArray(v) && v.every(isEff) ? v.map(all) : v;
        if (isEff(v) ? w !== v : Array.isArray(w) && w.some((e, i) => e !== (v as unknown[])[i])) out = { ...out, [k]: w };
      }
      return out as PackStep | Step;
    };
    return (cfg.due ? all(steps) : steps) as T;
  };
  const def = (op: string): { from?: string; to?: string; sel?: Sel; at?: At } => ({ ...DEF[op], ...cfg.zones?.[op as PackOp] });
  const zone = (s: PackState, name: string, seat: string): string => (s.zones[`${name}:${seat}`] !== undefined ? `${name}:${seat}` : name);
  const go = (ctx: Ctx<G>, steps: Eff, env: E): void => ctx.then(...(effectTasks(steps, env) as unknown as G['task'][]));
  const ask = (ctx: Ctx<G>, st: PackStep, env: E, kind: string, options: readonly KernelOption[], min: number, max: number): void => {
    const base = { kind, seat: env.seat, min, max, options };
    askVerb(ctx, (cfg.prompt?.(base, st, env) ?? base) as Omit<G['prompt'], 'id'>, st, env);
  };
  const resGet = (s: PackState, seat: string, key: string): number => (cfg.res ? cfg.res.get(ro(s) as unknown as G['state'], seat, key) : (s.res?.[seat]?.[key] ?? 0));
  const resSet = (ctx: Ctx<G>, seat: string, key: string, v: number): void => {
    if (cfg.res) return cfg.res.set(ctx, seat, key, v);
    const s = S(ctx);
    if (s.res === undefined) s.res = {};
    const all = own(s, 'res') as Record<string, Record<string, number>>;
    if (all[seat] === undefined) all[seat] = { [key]: v };
    else own(all, seat)[key] = v;
  };
  // Can this cost step be paid in full now? Resources, the cards a moving or marking step names (exhausting an exhausted card cannot pay), nested steps, the game's custom check.
  // K529: with a ledger `l` (cost judged as a whole) what earlier steps of the same cost took is counted.
  const payable = (s: PackState, st: Step, env: E, l?: Ledger): boolean => {
    const p = st as PackStep;
    if (p.op === 'pay' || p.op === 'convert') {
      const had = resGet(s, env.seat, p.res) - (l?.res[p.res] ?? 0);
      if (l) l.res[p.res] = (l.res[p.res] ?? 0) + due(s, p, env);
      if (l && p.op === 'convert') l.res[p.into] = (l.res[p.into] ?? 0) - n(p.get, env);
      return had >= due(s, p, env);
    }
    if (p.op === 'seq') return p.steps.every((x) => payable(s, x, env, l));
    if (p.op === 'payThen') return p.cost.every((x) => payable(s, x, env, l));
    if (p.op === 'custom') {
      const f = cfg.custom?.[p.name]?.payable;
      return f ? f(ro(s) as unknown as G['state'], p, env) : true;
    }
    if (!('cards' in fieldsOf(p.op))) return true;
    const c = p as Cards & { op: string; to?: string };
    const d = def(c.op);
    const from = zone(s, c.from ?? d.from ?? 'hand', env.seat);
    const sel = c.cards ?? d.sel ?? 'chosen';
    const k = n(c.count, env);
    const ok = (id: string): boolean => locate(s, id) !== undefined && (c.op !== 'exhaust' || !hasMark(s, id, 'exhausted')) && (c.op !== 'ready' || hasMark(s, id, 'exhausted'));
    // A moving step takes its card for good; two exhausts (or two readies) need two cards; an exhausted card may still leave.
    const moves = 'to' in fieldsOf(p.op) || p.op === 'attach';
    const pool = moves ? 'move' : p.op === 'exhaust' || p.op === 'ready' ? p.op : undefined;
    const put = (ids: string[]): void => {
      if (l && pool !== undefined) (l.need[pool] ??= []).push(ids);
    };
    if (sel === 'source') {
      if (env.source !== undefined) put([env.source]);
      return env.source !== undefined && ok(env.source);
    }
    if (sel === 'chosen') {
      for (const id of env.cards ?? []) put([id]);
      return (env.cards ?? []).length > 0 && (env.cards ?? []).every(ok);
    }
    if (sel === 'top') {
      const t = (moves ? l?.top[from] : undefined) ?? 0;
      if (l && moves) l.top[from] = t + k;
      return cardsIn(s, from).length >= k + t;
    }
    if (sel === 'all') return true;
    const can = eligible(s, c, env, from, false).filter((id) => id.startsWith('#') || ok(id));
    for (let i = 0; i < k; i += 1) put(can.map((id) => (id.startsWith('#') ? from + id : id)));
    return can.length >= k;
  };
  const whole = (s: PackState, cost: Eff, env: E, l: Ledger = { res: {}, top: {}, need: {} }): boolean => cost.every((x) => payable(s, x, env, l)) && Object.values(l.need).every(matched);
  const canPay = (s: PackState, cost: Eff, env: E): boolean => (P.cost === 'whole' ? whole(s, cost, env) : cost.every((x) => payable(s, x, env)));
  const VIEW_SKIP = ['stack', 'prompt', 'seq', 'promptSeq', 'log', 'timing', 'cardMoves', 'rng', 'forced'];
  // K583: an empty `marks` record (left by a marking verb that marked nothing, or unmarked the last card) is the same game as none.
  const unmarked = (s: unknown): unknown => ((s as PackState).marks !== undefined && Object.keys((s as PackState).marks ?? {}).length === 0 ? { ...(s as object), marks: undefined } : s);
  const view = (s: unknown): string => canonicalJson(P.view ? P.view(unmarked(s) as G['state']) : Object.fromEntries(Object.entries(unmarked(s) as object).filter(([k]) => !VIEW_SKIP.includes(k))));
  // K583, paid = effect: the branch the check is running. `base` is the game it compares with (moved past each cost paid); `cost` counts the costs being paid, while nothing is compared.
  // `sees`: the cards the judged seat saw when the outermost cost began; `hidden`: a cost has since shown it a card, so no game code runs any more (the answer must not tell the card).
  // K597, resolves: `done` the top-level steps this line resolved, `next` the step running, `mark` the view when it began, `whys` each step's reason read when it began.
  // A top-level `payThen` is two parts: its cost (index i) and its `then` (i + 0.5); `paid` is the view when its cost ended.
  // `costs`: the view when each cost now being paid began; `part`: parts that did not resolve in full (a shortfall, or a cost or its effect that changed nothing), with the reason; `half`: the parts that changed but are in `part`.
  type Line = { base: string; cost: number; sees: readonly string[] | null; hidden: boolean; done: readonly number[]; next: number; mark: string; whys: Readonly<Record<number, SkipReason | OfferReason>>; paid: string | null; costs: readonly string[]; part: Readonly<Record<number, SkipReason | OfferReason>>; half: readonly number[]; over: readonly number[] };
  const J0 = (): Line => ({ base: '', cost: 0, sees: null, hidden: false, done: [], next: 0, mark: '', whys: {}, paid: null, costs: [], part: {}, half: [], over: [] });
  let J: Line = J0();
  // K597: set while `resolves` runs the search: each line runs to its end, and `line` gets it (true: a line resolved every step, stop).
  let R: { readonly line: (j: Line, reason?: OfferReason, error?: unknown) => boolean; readonly cap: () => void; readonly steps: Eff; readonly env: E } | null = null;
  const unitsOf = (steps: Eff, i: number): number[] => ((steps[i] as PackStep | undefined)?.op === 'payThen' ? [i, i + 0.5] : [i]);
  // K597: the part running now (a top-level payThen: its cost until the cost ended, then its effect); `partly` notes it did not resolve in full (the first reason kept); `credit` adds the parts that changed.
  const unitNow = (): number => (R !== null && (R.steps[J.next] as PackStep | undefined)?.op === 'payThen' && J.paid !== null ? J.next + 0.5 : J.next);
  const partly = (r: SkipReason | OfferReason): void => {
    const u = unitNow();
    if (R !== null && dry !== null && !(u in J.part)) J.part = { ...J.part, [u]: r };
  };
  const credit = (got: readonly number[]): void => {
    const fresh = got.filter((u) => !J.done.includes(u) && !J.half.includes(u));
    J.done = [...J.done, ...fresh.filter((u) => !(u in J.part))];
    J.half = [...J.half, ...fresh.filter((u) => u in J.part)];
  };
  const seenBy = (s: PackState, seat: string): string[] => Object.values(s.zones).flatMap((zn) => zn.cards).filter((c) => canSee(s, seat, c));
  // K583: in the check, has a cost shown the judged seat a card since it began? Noted the moment it is shown (read before each task and each game hook).
  const hid = (s: PackState): boolean => {
    if (dry === null) return false;
    if (!J.hidden && fresh(s).length > 0) J.hidden = true;
    return J.hidden;
  };
  // K597: the cards that came into the judged seat's view during the line and that it did not see before.
  const fresh = (s: PackState): string[] => (dry === null || J.sees === null ? [] : seenBy(s, dry).filter((c) => !(J.sees ?? []).includes(c)));
  // K597: the state game code reads (tests, counts, filters, `payable`, `due`, `res.get`, `seats`, `noPlayer`, `reshuffle`). In resolves a read-only view that stops (hidden)
  // only when a read yields a card that came into view: an array element, an object key or a string holding its id (a log line); `length` passes. Elsewhere the hard stop of K583.
  // K597 fourth look: on an object whose own keys or values hold such a card, any keyed read (but an array's `length` and inherited methods), `in`, own-key check or key listing stops.
  // Never on the key asked alone: asking for a key that names a new card would stop only in the worlds where that card is new. An array's indexes are not ids; writes by a `viewSafe` verb stop the same way.
  // `rw`: a `viewSafe` custom verb or row runs on it, its writes go to the state (a view handed back is stored as what it views).
  const ro = <T>(s: T, rw = false): T => {
    if (R === null) return hid(s as unknown as PackState) ? stop() : s;
    const f = fresh(s as unknown as PackState);
    if (f.length === 0) return s;
    // K597 fifth look: a card id as a whole token (the string, or bounded by characters that are not letters, digits, `_` or `-`): `p1` does not hold the card `1`.
    const idc = (ch: string | undefined): boolean => ch !== undefined && /[\w-]/.test(ch);
    const has = (v: string, c: string): boolean => {
      for (let i = v.indexOf(c); i >= 0; i = v.indexOf(c, i + 1)) if (!idc(v[i - 1]) && !idc(v[i + c.length])) return true;
      return false;
    };
    const bad = (v: unknown): boolean => typeof v === 'string' && f.some((c) => has(v, c));
    const PX = new WeakMap<object, object>();
    const TG = new WeakMap<object, object>();
    const un = (v: unknown): unknown => {
      if (typeof v !== 'object' || v === null) return v;
      const t = TG.get(v);
      if (t !== undefined) return t;
      if (!Object.isFrozen(v)) for (const k of Reflect.ownKeys(v)) {
        const x: unknown = Reflect.get(v, k);
        const y = un(x);
        if (y !== x) Reflect.set(v, k, y);
      }
      return v;
    };
    const px = (o: unknown): unknown => {
      if (typeof o !== 'object' || o === null) return o;
      const t = o;
      const old = PX.get(t);
      if (old !== undefined) return old;
      const dirty = (): boolean => Reflect.ownKeys(t).some((x) => (!Array.isArray(t) && bad(x)) || bad(Reflect.get(t, x)));
      const p = new Proxy(Array.isArray(o) ? [] : {}, {
        get: (_, k) => {
          if (((Object.hasOwn(t, k) || !(k in t)) && !(Array.isArray(t) && k === 'length') && dirty())) stop();
          return px(Reflect.get(t, k));
        },
        has: (_, k) => (dirty() ? stop() : Reflect.has(t, k)),
        ownKeys: () => (dirty() ? stop() : Reflect.ownKeys(t)),
        getOwnPropertyDescriptor: (_, k) => {
          if (dirty()) stop();
          const d = Reflect.getOwnPropertyDescriptor(t, k);
          if (d === undefined) return undefined;
          return Array.isArray(t) && k === 'length' ? { value: t.length, writable: true, enumerable: false, configurable: false } : 'value' in d ? { ...d, value: px(d.value), configurable: true } : { ...d, configurable: true };
        },
        getPrototypeOf: () => Reflect.getPrototypeOf(t),
        set: (_, k, v) => rw && (dirty() ? stop() : Reflect.set(t, k, un(v))),
        deleteProperty: (_, k) => rw && (dirty() ? stop() : Reflect.deleteProperty(t, k)),
        defineProperty: (_, k, d) => rw && (dirty() ? stop() : Reflect.defineProperty(t, k, 'value' in d ? { ...d, value: un(d.value) } : d)),
      });
      PX.set(t, p);
      TG.set(p, t);
      return p;
    };
    return px(s) as T;
  };
  // K597 fourth look: a `viewSafe` custom verb or game row runs, after a card came into view, with `ctx.s` the guarded view (resolves only).
  const onView = (ctx: Ctx<G>, f: () => void): void => {
    const was = ctx.s;
    (ctx as { s: unknown }).s = ro(was, true);
    try {
      f();
    } finally {
      (ctx as { s: unknown }).s = was;
    }
  };
  const safeRow = (t: G['task']): boolean => String((t as { kind?: unknown }).kind) === 'verb' && (table() as Record<string, { viewSafe?: unknown }>)[String((t as unknown as { step?: { op?: unknown } }).step?.op)]?.viewSafe === true;
  // A task that runs game code: a verb that is not the pack's own row, or any task kind but `verb` and engine-core's `timing.*`.
  const gameTask = (t: G['task']): boolean => {
    const k = String((t as { kind?: unknown }).kind);
    if (k !== 'verb') return !k.startsWith('timing.');
    const op = String((t as unknown as { step?: { op?: unknown } }).step?.op);
    const mine = (verbs as Record<string, unknown>)[op];
    return mine === undefined || (table() as Record<string, unknown>)[op] !== mine;
  };
  const REASONS: readonly OfferReason[] = ['error', 'hidden', 'otherSeat', 'random', 'budget', 'nested'];
  // K529: would these steps change the game? They run on a copy with the game's handlers; every prompt forks one run per answer tried.
  const check = (state: G['state'], content: G['content'], steps: Eff, env: E): OfferCheck => checked(state, content, steps, env)[0];
  const checked = (state: G['state'], content: G['content'], steps: Eff, env: E, r: typeof R = null): [OfferCheck, ReadonlySet<OfferReason>] => {
    const whys = new Set<OfferReason>();
    let error: unknown;
    const note = (r: OfferReason): 'unknown' => {
      whys.add(r);
      return 'unknown';
    };
    const was = R;
    R = r;
    let answer: Offered;
    try {
      answer = judged(state, content, steps, env, note, (e) => void (error ??= e));
    } finally {
      R = was;
    }
    const reason = REASONS.find((r) => whys.has(r));
    return [answer !== 'unknown' || reason === undefined ? { answer } : { answer, reason, ...(reason === 'error' ? { error } : {}) }, whys];
  };
  // K605: a `no` with its reason (`why`), read on the state as it is, as the check's seat; the game's `decide` gets that answer.
  const judge = (state: G['state'], content: G['content'], steps: Eff, env: E, opts?: { readonly why?: boolean }): OfferCheck => {
    const c = check(state, content, steps, env);
    const w = c.answer === 'no' && dry === null && (opts?.why === true || P.decide) ? { answer: c.answer, reason: aside(env, () => first(state as unknown as PackState, steps, env)) } : c;
    // K605: `decide` is game code: run as the check of the seat (`cannotKnow` there is unknown/hidden), not asked once the check met a hidden card, and a throw is unknown/error.
    const d = P.decide;
    if (!d || (c.answer === 'unknown' && (c.reason === 'hidden' || c.reason === 'nested'))) return opts?.why === true ? w : c;
    try {
      return aside(env, () => d(state, steps, env, w));
    } catch (e) {
      if (e instanceof Stop) return { answer: 'unknown', reason: e.reason };
      if (P.strict === true) throw e;
      return { answer: 'unknown', reason: 'error', error: e };
    }
  };
  // K597: how much of the effect would resolve, on the same search: each line of play runs to its end, step by step.
  const resolves = (state: G['state'], content: G['content'], steps: Eff, env: E): ResolveCheck => {
    type L = { done: readonly number[]; half: readonly number[]; over: readonly number[]; part: Line['part']; next: number; whys: Line['whys']; reason?: OfferReason; error?: unknown };
    const units = steps.flatMap((_, i) => unitsOf(steps, i));
    const lines: L[] = [];
    let capped = false;
    const [c, whys] = checked(state, content, steps, env, { steps, env, cap: () => void (capped = true), line: (j, reason, error) => (lines.push({ done: j.done, half: j.half, over: j.over, part: j.part, next: j.next, whys: j.whys, ...(reason === undefined ? {} : { reason, error }) }), reason === undefined && j.done.length + j.over.length === units.length) });
    // Unknown only when the known part does not fix the answer: a line stopped early may still resolve the parts from where it stopped; a cap hit leaves every line open.
    // K597: a part that changed but did not resolve in full (`half`) makes the line part at most.
    const G3: readonly Resolved[] = ['none', 'part', 'full'];
    const g = (l: L): number => (l.done.length + l.over.length === units.length ? 2 : l.done.length + l.half.length > 0 ? 1 : 0);
    const most = Math.max(0, ...lines.map(g));
    const could = capped || whys.has('nested') ? 2 : Math.max(most, ...lines.filter((l) => l.reason !== undefined).map((l) => (l.half.some((u) => u in l.part) ? 1 : g({ ...l, done: [...l.done, ...units.filter((u) => u >= l.next && !l.done.includes(u))] }))));
    const answer: Resolved = c.answer === 'yes' ? 'full' : most === could ? (G3[most] ?? 'none') : 'unknown';
    // An unknown answer is reported from the lines left open (they make it unknown), never from a closed line such as a declined `may`.
    const best = (answer === 'unknown' && lines.some((l) => l.reason !== undefined) ? lines.filter((l) => l.reason !== undefined) : lines).reduce<L | undefined>((b, l) => (b === undefined || g(l) > g(b) || (g(l) === g(b) && (l.done.length > b.done.length || (l.done.length === b.done.length && b.reason !== undefined && l.reason === undefined))) ? l : b), undefined);
    const skipped = answer === 'full' ? [...new Set((best?.over ?? []).map(Math.floor))].map((step) => ({ step, reason: 'gameOver' as const })) : steps.flatMap((_, i) => {
      const u = unitsOf(steps, i).find((x) => !(best?.done ?? []).includes(x));
      if (u === undefined) return [];
      if (best?.reason !== undefined && i >= best.next) return [{ step: i, reason: best.reason, ...(best.reason === 'error' ? { error: best.error } : {}) }];
      return [{ step: i, reason: capped && answer === 'unknown' ? 'budget' as const : best === undefined ? (c.answer === 'unknown' ? (c.reason as OfferReason) : 'noChange' as const) : best.half.includes(u) ? (best.part[u] ?? 'short') : (best.whys[u] ?? 'noChange') }];
    });
    return { answer, skipped, ...(answer === 'unknown' && c.reason !== undefined ? { reason: c.reason as OfferReason, ...(c.reason === 'error' ? { error: c.error } : {}) } : {}) };
  };
  // K605: why a step changes nothing, read when it begins (the first reason of a list of steps, else noChange).
  const first = (s: PackState, xs: Eff, env: E): SkipReason | OfferReason => {
    for (const x of xs) {
      const r = whyNot(s, x, env);
      if (r !== 'noChange') return r;
    }
    return 'noChange';
  };
  const whyNot = (s: PackState, x: Step, env: E): SkipReason | OfferReason => {
    try {
      const p = x as PackStep;
      if (p.op === 'if') {
        const t = cfg.tests?.[p.test];
        if (!t) return 'error';
        blind(s, env);
        const b = t(ro(s) as unknown as G['state'], env) ? p.then : p.else;
        return b === undefined ? 'condition' : first(s, b, env);
      }
      if (p.op === 'payThen') return canPay(s, p.cost, env) ? first(s, p.then, env) : 'cannotPay';
      if (p.op === 'choosePayment') return p.ways.some((w) => canPay(s, w, env)) ? first(s, p.then, env) : 'cannotPay';
      if (p.op === 'pay' || p.op === 'convert') return payable(s, p, env) ? 'noChange' : 'cannotPay';
      if (p.op === 'seq') return first(s, p.steps, env);
      if (p.op === 'may') return first(s, p.then, env);
      if (p.op === 'chooseOption') return p.options.map((o) => first(s, o, env)).find((r) => r !== 'noChange') ?? 'noChange';
      if (p.op === 'chooseCards' || p.op === 'search') {
        const z = zone(s, p.zone, env.seat);
        if (cardsIn(s, z).length === 0) return 'emptyZone';
        if (eligible(s, p, env, z, p.op === 'search').length === 0) return 'noTarget';
        return p.op === 'chooseCards' ? first(s, p.then, env) : 'noChange';
      }
      if (!('cards' in fieldsOf(p.op))) return 'noChange';
      const c = p as Cards & { op: string };
      const d = def(c.op);
      const sel = c.cards ?? d.sel ?? 'chosen';
      if (sel === 'source') return env.source === undefined || locate(s, env.source) === undefined ? 'noTarget' : 'noChange';
      if (sel === 'chosen') return (env.cards ?? []).length === 0 ? 'noTarget' : 'noChange';
      const from = zone(s, c.from ?? d.from ?? 'hand', env.seat);
      if (cardsIn(s, from).length === 0) return 'emptyZone';
      return sel === 'pick' && eligible(s, c, env, from, false).length === 0 ? 'noTarget' : 'noChange';
    } catch (e) {
      return e instanceof Stop ? e.reason : 'error';
    }
  };
  // Runs `f` as the check of `env.seat` (hidden cards stay hidden), outside a check.
  const aside = <T>(env: E, f: () => T): T => {
    const was = [dry, J] as const;
    dry = env.seat;
    J = J0();
    try {
      return f();
    } finally {
      [dry, J] = was;
    }
  };
  const wouldChange = (state: G['state'], content: G['content'], steps: Eff, env: E): Offered => judge(state, content, steps, env).answer;
  const judged = (state: G['state'], content: G['content'], steps: Eff, env: E, note: (r: OfferReason) => 'unknown', threw: (e: unknown) => void): Offered => {
    if (dry !== null) return note('nested');
    if (!cfg.handlers) throw new EngineBugError('card-language pack: wouldChange needs cfg.handlers (() => RULES.handlers)');
    if (state.result !== null) return 'no';
    let left = 0;
    const table = Object.fromEntries(Object.entries(cfg.handlers()).map(([k, h]) => [k, (c: Ctx<G>, t: G['task']) => ((left -= 1) < 0 ? stop('budget') : hid(c.s as unknown as PackState) && gameTask(t) ? (R !== null && safeRow(t) ? onView(c, () => h(c, t)) : stop()) : h(c, t))])) as HandlerTable<G>;
    const before = view(state);
    const F = R;
    // K597: a marker after each top-level step (and one before the first): the step resolved when the view changed while it ran.
    if (F) (table as Record<string, unknown>)[STEP] = (c: Ctx<G>, t: { i: number }): void => {
      const v = view(c.s);
      if (t.i >= 0 && (steps[t.i] as PackStep).op === 'payThen') credit([...(J.paid !== null && J.paid !== J.mark ? [t.i] : []), ...(J.paid !== null && v !== J.paid ? [t.i + 0.5] : [])]);
      else if (t.i >= 0 && v !== J.mark) credit([t.i]);
      J.mark = v;
      J.paid = null;
      J.next = t.i + 1;
      const st = steps[t.i + 1];
      if (st !== undefined) J.whys = { ...J.whys, [t.i + 1]: whyNot(c.s as unknown as PackState, st, env) };
    };
    // K597: a line that stops inside a top-level payThen's effect keeps its cost part (that part ended); the part running is open, since the rest of it may undo what it changed.
    const sofar = (): void => {
      const i = J.next;
      if (i < steps.length && unitNow() === i + 0.5) credit(J.paid !== J.mark ? [i] : []);
    };
    // K597: after the effect of a cost that is not a top-level payThen: the cost and its effect are two parts, so the step resolves in full only when both changed the game.
    if (F) (table as Record<string, unknown>)[PAID] = (c: Ctx<G>, t: { from: string; cost: boolean; why: SkipReason | OfferReason }): void => {
      if (!t.cost || view(c.s) === t.from) partly(t.cost ? t.why : 'noChange');
    };
    const at = new WeakMap<object, typeof J>();
    const random = (): never => stop('random');
    // One run to the next prompt: yes, no, unknown, or the copy with its prompt open.
    const seg = (s: Draft<KernelState>, first?: readonly G['task'][]): Offered | Draft<KernelState> => {
      left = P.tasks ?? 2000;
      // K597: in resolves the guard is on from the start: once the seat sees a card it did not see before, no game code runs.
      J = { ...(at.get(s) ?? { ...J0(), base: before, mark: before, sees: F ? seenBy(state as unknown as PackState, env.seat) : null }) };
      const ctx = makeCtx<G>({}, s as Draft<G['state']>, content, []);
      (ctx as { rng: unknown }).rng = { nextUint32: random, int: random, shuffle: random };
      const moved = (): boolean => s.result !== null || (J.cost === 0 && view(s) !== J.base);
      try {
        if (first) ctx.then(...first);
        run(ctx, table);
      } catch (e) {
        if (e === CHANGED) return 'yes';
        if (!(e instanceof GameOver)) {
          // K583: any throw of a handler in a branch nobody chose is unknown (the error kept), never a crash of the real action; `strict` throws it.
          if (P.strict === true && !(e instanceof Stop)) throw e;
          if (!F && moved()) return 'yes';
          if (!(e instanceof Stop)) threw(e);
          if (F) sofar();
          F?.line(J, e instanceof Stop ? e.reason : 'error', e instanceof Stop ? undefined : e);
          return note(e instanceof Stop ? e.reason : 'error');
        }
      }
      if (F) {
        if (s.result !== null && J.next < steps.length) {
          const us = unitsOf(steps, J.next);
          J.done = [...J.done, ...us.filter((u) => !J.done.includes(u))];
          J.half = J.half.filter((u) => !us.includes(u));
          const later = steps.flatMap((_, i) => (i > J.next ? unitsOf(steps, i) : []));
          J.whys = { ...J.whys, ...Object.fromEntries(later.map((u) => [u, 'gameOver'])) };
          J.over = later;
        }
        if (s.result !== null || s.prompt === null) return F.line(J) ? 'yes' : 'no';
        at.set(s, J);
        if (s.prompt.seat === undefined || String(s.prompt.seat) === env.seat) return s;
        sofar();
        F.line(J, 'otherSeat');
        return note('otherSeat');
      }
      // K583: an effect that ends the game is a change under every view.
      if (moved()) return 'yes';
      if (s.prompt === null) return 'no';
      at.set(s, J);
      return s.prompt.seat !== undefined && String(s.prompt.seat) !== env.seat ? note('otherSeat') : s;
    };
    const start = copyState(state) as Draft<KernelState>;
    start.stack = [];
    start.prompt = null;
    const open: Draft<KernelState>[] = [];
    let unknown = false;
    let tried = 0;
    const yes = (r: Offered | Draft<KernelState>): boolean => {
      if (r === 'unknown') unknown = true;
      else if (typeof r === 'object') open.push(r);
      return r === 'yes';
    };
    dry = env.seat;
    const prev = openDraft(start, true);
    try {
      const mk = (i: number): G['task'] => ({ kind: STEP, i }) as unknown as G['task'];
      if (yes(seg(start, F ? [mk(-1), ...steps.flatMap((st, i) => [...(effectTasks([st], env) as unknown as G['task'][]), mk(i)])] : effectTasks(steps, env)))) return 'yes';
      const fork = (s: Draft<KernelState>, picks: readonly string[]): boolean => {
        const c = copyState(s);
        const j = at.get(s);
        if (j) at.set(c, j);
        c.prompt = null;
        const { prompt: _bound, ...task } = c.stack.pop() ?? { kind: '' };
        c.stack.push({ ...task, answer: [...picks] });
        return yes(seg(c));
      };
      // K579: the quick answers first, as before; `rest` keeps each prompt with what was tried, for the pick sets still left.
      const rest: [Draft<KernelState>, readonly (readonly string[])[]][] = [];
      for (let s = open.shift(); s !== undefined; s = open.shift()) {
        const p = s.prompt;
        if (p === null) continue;
        const on = p.options.filter((o) => o.enabled && o.alone !== true).map((o) => o.id);
        const answers = [...(p.min === 0 ? [[]] : []), ...(p.min <= 1 && p.max >= 1 ? on.map((id) => [id]) : p.min > 1 && on.length >= p.min ? [on.slice(0, p.min)] : [])];
        rest.push([s, answers]);
        for (const picks of answers) {
          if ((tried += 1) > (P.branches ?? 32)) return (F?.cap(), note('budget'));
          if (fork(s, picks)) return 'yes';
        }
      }
      // K579: then every other legal answer (each set of size min..max, every order when the order matters, each option answered alone), and all answers under those. Out of budget with some left: unknown, never no.
      for (let r = rest.shift(); r !== undefined; r = rest.shift()) {
        const [s, done] = r;
        const p = s.prompt;
        if (p === null) continue;
        const had = new Set(done.map((a) => a.join('\n')));
        const on = p.options.filter((o) => o.enabled && o.alone !== true).map((o) => o.id);
        const ordered = p.ordered === true || ['scout', 'orderEffects'].includes((s.stack[s.stack.length - 1] as { step?: { op?: string } } | undefined)?.step?.op ?? '');
        const sets = function* (from: number, acc: readonly string[]): Generator<readonly string[]> {
          if (acc.length >= p.min) yield acc;
          if (acc.length >= p.max || acc.length + on.length - (ordered ? acc.length : from) < p.min) return;
          for (let i = ordered ? 0 : from; i < on.length; i += 1) if (!acc.includes(on[i] ?? '')) yield* sets(i + 1, [...acc, on[i] ?? '']);
        };
        const lone = p.options.filter((o) => o.enabled && o.alone === true).map((o) => [o.id]);
        for (const all of [sets(0, []), lone]) {
          for (const picks of all) {
            if (had.has(picks.join('\n'))) continue;
            if ((tried += 1) > (P.branches ?? 32)) return (F?.cap(), note('budget'));
            if (fork(s, picks)) return 'yes';
            rest.push(...open.splice(0).map((o): [Draft<KernelState>, readonly (readonly string[])[]] => [o, []]));
          }
        }
      }
      return unknown ? 'unknown' : 'no';
    } finally {
      dry = null;
      closeDraft(prev);
    }
  };
  const live = (r: Offered): boolean => r === 'yes' || (r === 'unknown' && P.unknown !== 'skip');
  // K605: the check behind a bar; its reason is used under `barReason: 'why'`, or when the game's `decide` gave one.
  const barCheck = (s: G['state'], content: G['content'], o: Eff, e: E): OfferCheck => judge(s, content, o, e, P.barReason === 'why' ? { why: true } : undefined);
  const why = (s: PackState, o: Eff, e: E, c: OfferCheck): string => {
    const r = c.answer;
    if (r === 'unknown') return 'unknown';
    if (c.reason !== undefined && (P.barReason === 'why' || P.decide)) return c.reason;
    const unpaid = (x: Step): boolean => {
      const p = x as PackStep;
      // K583: a cost inside a seq or a may counts too.
      return p.op === 'payThen' ? !canPay(s, p.cost, e) : p.op === 'seq' ? p.steps.some(unpaid) : p.op === 'may' ? p.then.some(unpaid) : (p.op === 'pay' || p.op === 'convert') && !payable(s, p, e);
    };
    return o.some(unpaid) ? 'cannotPay' : 'noChange';
  };
  const fieldsOf = (op: string): object => (verbs as Record<string, { fields: object }>)[op]?.fields ?? {};
  // Cards the seat may pick in `z`: ids it sees (or all when `peek`), `#i` for a hidden one (no id leaks); a filter applies to seen cards only.
  const eligible = (s: PackState, st: { filter?: string }, env: E, z: string, peek: boolean): string[] => {
    const f = st.filter === undefined ? undefined : cfg.filters?.[st.filter];
    if (st.filter !== undefined && f === undefined) throw new EngineBugError(`card-language pack: no filter ${st.filter}`);
    const judge = dry;
    if (judge !== null && f !== undefined && cardsIn(s, z).some((c) => (peek || canSee(s, env.seat, c)) && !canSee(s, judge, c))) stop();
    if (f !== undefined) blind(s, env);
    const v = f === undefined ? s : ro(s);
    const nu = f === undefined ? [] : fresh(s);
    return cardsIn(s, z).flatMap((c, i) => {
      const seen = peek || canSee(s, env.seat, c);
      if (!seen) return f === undefined ? [`#${String(i)}`] : [];
      if (nu.includes(c)) stop();
      return f === undefined || f(v as unknown as G['state'], c, env) ? [c] : [];
    });
  };
  // K583: in the check a card picked blind stays unknown to the game: its tests, counts, filters and custom verbs are not run with it.
  const blind = (s: PackState, env: E): void => {
    const judge = dry;
    const nu = R === null ? [] : fresh(s);
    if (judge !== null && ((R === null && hid(s)) || [...(env.cards ?? []), ...(env.source === undefined ? [] : [env.source])].some((c) => nu.includes(c)) || (env.cards ?? []).some((c) => locate(s, c) !== undefined && !canSee(s, judge, c)))) stop();
  };
  const unhide = (s: PackState, z: string, picks: readonly string[]): string[] => picks.map((p) => (p.startsWith('#') ? (cardsIn(s, z)[Number(p.slice(1))] ?? '') : p));
  const pickAsk = (ctx: Ctx<G>, st: PackStep, env: E, z: string, min: number, max: number, peek = false, kind = 'chooseCards', keep?: (id: string) => boolean): boolean => {
    const ids = eligible(S(ctx), st as { filter?: string }, env, z, peek).filter((id) => keep?.(id) ?? true);
    const hi = Math.min(max, ids.length);
    if (ids.length > 0 && ids.length < min) partly('short');
    if (hi === 0) return false;
    // K641: an option over a card the seat cannot see is `unseen`, so a lone one is asked, never taken for the player.
    ask(ctx, st, env, kind, ids.map((id) => ({ id, enabled: true, ...(id.startsWith('#') ? { unseen: true as const } : {}) })), Math.min(min, hi), hi);
    return true;
  };
  const prune = (s: Draft<PackState>): void => {
    if (s.cardMoves === undefined) return;
    const live = new Set(((s as unknown as KernelState).timing?.occurrences ?? []).filter((o) => o.state === 'pending').map((o) => String(o.id)));
    for (const k of Object.keys(s.cardMoves)) if (!live.has(k)) delete (own(s, 'cardMoves') as Record<string, unknown>)[k];
  };
  // One `would` batch, one occurrence per card (kind = the verb, keys: player = seat, target = card, source = env.source).
  const send = (ctx: Ctx<G>, op: string, cards: readonly string[] | number, from: string, to: string, at: At, env: E, extra: Partial<PendingMove> = {}): void => {
    const s = S(ctx);
    prune(s);
    const items = typeof cards === 'number'
      ? Array.from({ length: cards }, () => ({ kind: op, keys: { player: env.seat, ...(env.source === undefined ? {} : { source: env.source }) } }))
      : cards.map((c) => ({ kind: op, keys: { player: env.seat, target: c, ...(env.source === undefined ? {} : { source: env.source }) } }));
    if (items.length === 0) return;
    const b = would(ctx, items);
    if (s.cardMoves === undefined) s.cardMoves = {};
    const m = own(s, 'cardMoves') as Record<string, PendingMove>;
    items.forEach((_, i) => {
      const c = typeof cards === 'number' ? undefined : cards[i];
      m[String(b + 1 + i)] = { op, seat: env.seat, from: c === undefined ? from : (locate(s, c)?.zone ?? from), to, at, ...(c === undefined ? { top: true as const } : {}), ...extra };
    });
  };
  // The cards a step names: ids, a number (top n, read when it happens), or undefined when it asked (resume re-runs it as `chosen`).
  const select = (ctx: Ctx<G>, st: Cards & { op: string }, env: E): readonly string[] | number | undefined => {
    const s = S(ctx);
    const d = def(st.op);
    const from = zone(s, st.from ?? d.from ?? 'hand', env.seat);
    const sel = st.cards ?? d.sel ?? 'chosen';
    if (sel === 'source') return env.source === undefined ? [] : [env.source];
    if (sel === 'chosen') return env.cards ?? [];
    if (sel === 'all') return [...cardsIn(s, from)];
    if (sel === 'top') return n(st.count, env);
    const c = n(st.count, env);
    // K529, a cost judged as a whole: only picks that leave this step's other picks and the steps still owed payable (a card the seat cannot see is never judged).
    const owed = P.cost === 'whole' ? env.owed : undefined;
    const keep = owed && ((id: string): boolean => {
      if (id.startsWith('#')) return true;
      const l: Ledger = { res: {}, top: {}, need: {} };
      payable(s, { ...st, cards: 'chosen' } as Step, { ...env, cards: [id] }, l);
      return (c < 2 || payable(s, { ...st, count: c - 1 } as Step, env, l)) && whole(s, owed, env, l);
    });
    return pickAsk(ctx, st as PackStep, env, from, c, c, false, 'chooseCards', keep) ? undefined : [];
  };
  const picked = (ctx: Ctx<G>, st: Cards & { op: string }, env: E, a: readonly string[]): void => {
    const s = S(ctx);
    const from = zone(s, st.from ?? def(st.op).from ?? 'hand', env.seat);
    go(ctx, [{ ...st, cards: 'chosen' } as Step], { ...env, cards: unhide(s, from, a) });
  };
  const topOf = (s: PackState, st: Cards & { op: string }, env: E, k: readonly string[] | number): readonly string[] =>
    typeof k === 'number' ? cardsIn(s, zone(s, st.from ?? def(st.op).from ?? 'deck', env.seat)).slice(0, k) : k;
  const mover = (op: MoveOp): V => ({
    fields: { cards: optional(oneOf(SELS)), count: optional(amount), from: optional(str), filter: optional(str), to: optional(str), at: optional(at) },
    run: (ctx, step, env) => {
      const st = step as Mover<MoveOp>;
      const e = need(env);
      const k = select(ctx, st, e);
      if (k === undefined) return;
      const s = S(ctx);
      const d = def(op);
      // K597: a step that does some but less than its number resolves in part (a draw that would reshuffle does not; nothing at all is no change).
      const has = cardsIn(s, zone(s, st.from ?? d.from ?? 'deck', e.seat)).length;
      if (typeof k === 'number' && has > 0 && has < k && (op !== 'draw' || cfg.reshuffle === undefined)) partly('short');
      send(ctx, op, typeof k === 'number' ? Math.min(k, op === 'draw' ? k : cardsIn(s, zone(s, st.from ?? d.from ?? 'deck', e.seat)).length) : k,
        zone(s, st.from ?? d.from ?? 'deck', e.seat), zone(s, st.to ?? d.to ?? 'discard', e.seat), st.at ?? d.at ?? 'top', e);
    },
    resume: (ctx, step, env, a) => picked(ctx, step, need(env), a),
    text: null,
  });
  const looker = (who: 'all' | 'seat'): V => ({
    fields: { cards: optional(oneOf(SELS)), count: optional(amount), from: optional(str), filter: optional(str), then: optional(eff) },
    run: (ctx, step, env) => {
      const st = step as Looker<'reveal'>;
      const e = need(env);
      const k = select(ctx, st, e);
      if (k === undefined) return;
      const s = S(ctx);
      const ids = topOf(s, st, e, k);
      for (const c of ids) {
        const zn = locate(s, c)?.zone ?? '';
        // K583: in the check, looking at a card the seat already sees (or revealing one all see) is no change.
        if (dry !== null && (who === 'all' ? s.zones[zn]?.seen === 'all' : canSee(s, e.seat, c))) continue;
        reveal(s, zn, [c], who === 'all' ? 'all' : [e.seat]);
      }
      if (st.then) go(ctx, st.then, { ...e, cards: ids });
    },
    resume: (ctx, step, env, a) => picked(ctx, step, need(env), a),
    text: null,
  });
  const marker = (f: (marks: readonly string[]) => readonly string[]): V => ({
    fields: { cards: optional(oneOf(SELS)), count: optional(amount), from: optional(str), filter: optional(str) },
    run: (ctx, step, env) => {
      const st = step as Marker<'flip'>;
      const e = need(env);
      const k = select(ctx, st, e);
      if (k === undefined) return;
      const s = S(ctx);
      for (const c of topOf(s, st, e, k)) {
        if (s.marks === undefined) s.marks = {};
        const marks = own(s, 'marks') as Record<string, readonly string[]>;
        const next = f(marks[c] ?? []);
        if (next.length === 0) delete marks[c];
        else marks[c] = next;
      }
    },
    resume: (ctx, step, env, a) => picked(ctx, step, need(env), a),
    text: null,
  });
  const flow = <F extends object>(fields: F, run: (ctx: Ctx<G>, st: never, env: E) => void, resume?: (ctx: Ctx<G>, st: never, env: E, a: readonly string[]) => void): V =>
    ({ fields, run: (ctx: Ctx<G>, st: never, env: E | undefined) => run(ctx, st, need(env)), ...(resume ? { resume: (ctx: Ctx<G>, st: never, env: E | undefined, a: readonly string[]) => resume(ctx, st, need(env), a) } : {}), text: null }) as unknown as V;
  // K583: in the check a shuffle of fewer than two cards (none of them shown to a seat) changes nothing and draws nothing.
  const mix = (ctx: Ctx<G>, z: string): void => {
    if (dry !== null && cardsIn(S(ctx), z).length < 2 && S(ctx).zones[z]?.shown === undefined) return;
    shuffleZone(ctx, z);
  };
  const list = (k: number): KernelOption[] => Array.from({ length: k }, (_, i) => ({ id: String(i), enabled: true }));

  const verbs = {
    draw: mover('draw'), discard: mover('discard'), mill: mover('mill'), move: mover('move'), putIntoPlay: mover('putIntoPlay'), setAside: mover('setAside'),
    recall: mover('recall'), gain: mover('gain'), destroy: mover('destroy'), detach: mover('detach'),
    attach: {
      fields: { cards: optional(oneOf(SELS)), count: optional(amount), from: optional(str), filter: optional(str), host: optional(oneOf(['chosen', 'source'])) },
      run: (ctx, step, env) => {
        const st = step as Extract<PackStep, { op: 'attach' }>;
        const e = need(env);
        const host = st.host === 'chosen' ? e.cards?.[0] : e.source;
        const k = select(ctx, st, e);
        if (k === undefined || host === undefined) return;
        const s = S(ctx);
        const z = `attached:${host}`;
        if (s.zones[z] === undefined) (own(s, 'zones') as Record<string, unknown>)[z] = { cards: [], seen: 'all' };
        send(ctx, 'attach', topOf(s, st, e, k).filter((c) => c !== host), '', z, 'bottom', e);
      },
      resume: (ctx, step, env, a) => picked(ctx, step, need(env), a),
      text: null,
    },
    refill: flow({ zone: str, from: str, size: posInt }, (ctx, st: Extract<PackStep, { op: 'refill' }>, e) => {
      const s = S(ctx);
      const z = zone(s, st.zone, e.seat);
      const src = zone(s, st.from, e.seat);
      if (cardsIn(s, src).length > 0 && cardsIn(s, src).length < st.size - cardsIn(s, z).length) partly('short');
      send(ctx, 'refill', Math.min(Math.max(0, st.size - cardsIn(s, z).length), cardsIn(s, src).length), src, z, 'bottom', e);
    }),
    shuffle: flow({ zone: str }, (ctx, st: Extract<PackStep, { op: 'shuffle' }>, e) => mix(ctx, zone(S(ctx), st.zone, e.seat))),
    search: flow({ zone: str, filter: optional(str), count: optional(amount), to: optional(str), shuffle: optional(bool) }, (ctx, st: Extract<PackStep, { op: 'search' }>, e) => {
      const z = zone(S(ctx), st.zone, e.seat);
      if (!pickAsk(ctx, st, e, z, 0, n(st.count, e), true, 'search') && st.shuffle !== false) mix(ctx, z);
    }, (ctx, st: Extract<PackStep, { op: 'search' }>, e, a) => {
      const s = S(ctx);
      const z = zone(s, st.zone, e.seat);
      send(ctx, 'search', a, z, zone(s, st.to ?? 'hand', e.seat), 'bottom', e);
      if (st.shuffle !== false) go(ctx, [{ op: 'shuffle', zone: st.zone } as Step], e);
    }),
    reveal: looker('all'), lookAt: looker('seat'),
    scout: flow({ from: optional(str), count: amount }, (ctx, st: Extract<PackStep, { op: 'scout' }>, e) => {
      const s = S(ctx);
      const z = zone(s, st.from ?? 'deck', e.seat);
      const ids = cardsIn(s, z).slice(0, n(st.count, e));
      if (ids.length === 0) return;
      reveal(s, z, ids, [e.seat]);
      if (ids.length > 1) ask(ctx, st, e, 'orderCards', ids.map((id) => ({ id, enabled: true })), ids.length, ids.length);
    }, (ctx, st: Extract<PackStep, { op: 'scout' }>, e, a) => {
      const s = S(ctx);
      const z = zone(s, st.from ?? 'deck', e.seat);
      const zs = own(s, 'zones') as Record<string, Draft<Zone>>;
      (own<Draft<Zone>, 'cards'>(own(zs, z), 'cards')).splice(0, a.length, ...a);
    }),
    flip: marker((m) => (m.includes('flipped') ? m.filter((x) => x !== 'flipped') : [...m, 'flipped'])),
    exhaust: marker((m) => (m.includes('exhausted') ? m : [...m, 'exhausted'])),
    ready: marker((m) => m.filter((x) => x !== 'exhausted')),
    chooseCards: flow({ zone: str, min: optional(int), max: amount, filter: optional(str), then: eff }, (ctx, st: Extract<PackStep, { op: 'chooseCards' }>, e) => {
      const max = n(st.max, e);
      if (P.fewer === 'exact' && eligible(S(ctx), st, e, zone(S(ctx), st.zone, e.seat), false).length < (st.min ?? max)) return;
      if (!pickAsk(ctx, st, e, zone(S(ctx), st.zone, e.seat), st.min ?? max, max)) go(ctx, st.then, { ...e, cards: [] });
    }, (ctx, st: Extract<PackStep, { op: 'chooseCards' }>, e, a) => {
      const s = S(ctx);
      go(ctx, st.then, { ...e, cards: unhide(s, zone(s, st.zone, e.seat), a) });
    }),
    chooseOption: flow({ options: effs }, (ctx, st: Extract<PackStep, { op: 'chooseOption' }>, e) => {
      if (dry !== null || (P.deadChoice ?? 'today') === 'today') return ask(ctx, st, e, 'chooseOption', list(st.options.length), 1, 1);
      const cs = st.options.map((o) => barCheck(ctx.s, ctx.content, o, e));
      if (!cs.some((c) => live(c.answer))) return;
      ask(ctx, st, e, 'chooseOption', cs.map((c, i) => (live(c.answer) || P.deadChoice !== 'bar' ? { id: String(i), enabled: true } : bar(String(i), why(S(ctx), st.options[i] ?? [], e, c)))), 1, 1);
    },
      (ctx, st: Extract<PackStep, { op: 'chooseOption' }>, e, a) => go(ctx, st.options[Number(a[0])] ?? [], e)),
    may: flow({ then: eff }, (ctx, st: Extract<PackStep, { op: 'may' }>, e) => {
      const c: OfferCheck = dry !== null || (P.noChange ?? 'ask') === 'ask' ? { answer: 'yes' } : barCheck(ctx.s, ctx.content, st.then, e);
      const r = c.answer;
      if (!live(r) && P.noChange === 'skip') return;
      ask(ctx, st, e, 'may', [live(r) ? { id: 'yes', enabled: true } : bar('yes', why(S(ctx), st.then, e, c)), { id: 'no', enabled: true }], 1, 1);
    },
      (ctx, st: Extract<PackStep, { op: 'may' }>, e, a) => void (a[0] === 'yes' && go(ctx, st.then, e))),
    chooseNumber: flow({ min: optional(int), max: amount, then: eff }, (ctx, st: Extract<PackStep, { op: 'chooseNumber' }>, e) => {
      const lo = st.min ?? 0;
      const hi = n(st.max, e);
      if (hi <= lo) return go(ctx, st.then, { ...e, n: Math.max(lo, hi) });
      ask(ctx, st, e, 'chooseNumber', Array.from({ length: hi - lo + 1 }, (_, i) => ({ id: String(lo + i), enabled: true })), 1, 1);
    }, (ctx, st: Extract<PackStep, { op: 'chooseNumber' }>, e, a) => go(ctx, st.then, { ...e, n: Number(a[0]) })),
    chooseDestination: {
      fields: { cards: optional(oneOf(SELS)), count: optional(amount), from: optional(str), filter: optional(str), to: names, at: optional(at) },
      run: (ctx, step, env) => {
        const st = step as Extract<PackStep, { op: 'chooseDestination' }>;
        const e = need(env);
        const k = select(ctx, st, e);
        if (k === undefined) return;
        const ids = topOf(S(ctx), st, e, k);
        if (ids.length === 0) return;
        ask(ctx, { ...st, cards: 'chosen' }, { ...e, cards: ids }, 'chooseDestination', st.to.map((id) => ({ id, enabled: true })), 1, 1);
      },
      resume: (ctx, step, env, a) => {
        const st = step as Extract<PackStep, { op: 'chooseDestination' }>;
        const e = need(env);
        if (st.cards !== 'chosen' || !st.to.includes(a[0] ?? '')) return picked(ctx, st, e, a);
        const s = S(ctx);
        send(ctx, 'chooseDestination', e.cards ?? [], '', zone(s, a[0] ?? '', e.seat), st.at ?? 'top', e);
      },
      text: null,
    },
    choosePlayer: flow({ others: optional(bool), then: eff }, (ctx, st: Extract<PackStep, { op: 'choosePlayer' }>, e) => {
      if (!cfg.seats) throw new EngineBugError('card-language pack: choosePlayer needs cfg.seats');
      const seats = cfg.seats(ro(ctx.s)).filter((p) => !st.others || p !== e.seat);
      if (seats.length > 0) return ask(ctx, st, e, 'choosePlayer', seats.map((id) => ({ id, enabled: true })), 1, 1);
      const seat = cfg.noPlayer?.(ro(ctx.s), e);
      if (seat !== undefined) go(ctx, st.then, { ...e, seat });
    }, (ctx, st: Extract<PackStep, { op: 'choosePlayer' }>, e, a) => go(ctx, st.then, { ...e, seat: a[0] ?? e.seat })),
    choosePayment: flow({ ways: effs, then: eff }, (ctx, st: Extract<PackStep, { op: 'choosePayment' }>, e) => {
      const s = S(ctx);
      // K583, paid = effect: a payable way whose effect would change nothing is dead for `deadChoice`.
      const cs = st.ways.map((w): OfferCheck | null => (!canPay(s, w, e) ? null : dry !== null || P.paid !== 'effect' || (P.deadChoice ?? 'today') === 'today' ? { answer: 'yes' } : barCheck(ctx.s, ctx.content, [{ op: 'payThen', cost: w, then: st.then } as Step], e)));
      if (!cs.some((c) => c !== null && live(c.answer))) return;
      const opts = cs.map((c, i) => (c === null ? (P.deadChoice === 'bar' ? bar(String(i), 'cannotPay') : { id: String(i), enabled: false, why: 'cannotPay' }) : live(c.answer) || P.deadChoice !== 'bar' ? { id: String(i), enabled: true } : bar(String(i), c.answer === 'unknown' ? 'unknown' : c.reason !== undefined && (P.barReason === 'why' || P.decide) ? c.reason : 'noChange')));
      ask(ctx, st, e, 'choosePayment', opts, 1, 1);
    }, (ctx, st: Extract<PackStep, { op: 'choosePayment' }>, e, a) => go(ctx, [{ op: 'payThen', cost: st.ways[Number(a[0])] ?? [], then: st.then } as Step], e)),
    orderEffects: flow({ effects: effs }, (ctx, st: Extract<PackStep, { op: 'orderEffects' }>, e) => {
      if (st.effects.length === 1) return go(ctx, st.effects[0] ?? [], e);
      ask(ctx, st, e, 'orderEffects', list(st.effects.length), st.effects.length, st.effects.length);
    }, (ctx, st: Extract<PackStep, { op: 'orderEffects' }>, e, a) => go(ctx, a.flatMap((i) => st.effects[Number(i)] ?? []), e)),
    gainResource: flow({ res: str, amount }, (ctx, st: Extract<PackStep, { op: 'gainResource' }>, e) => resSet(ctx, e.seat, st.res, resGet(S(ctx), e.seat, st.res) + n(st.amount, e))),
    pay: flow({ res: str, amount }, (ctx, st: Extract<PackStep, { op: 'pay' }>, e) => {
      const s = S(ctx);
      if (!payable(s, st, e)) return;
      resSet(ctx, e.seat, st.res, resGet(s, e.seat, st.res) - due(s, st, e));
    }),
    convert: flow({ res: str, amount, into: str, get: amount }, (ctx, st: Extract<PackStep, { op: 'convert' }>, e) => {
      const s = S(ctx);
      if (!payable(s, st, e)) return;
      resSet(ctx, e.seat, st.res, resGet(s, e.seat, st.res) - due(s, st, e));
      resSet(ctx, e.seat, st.into, resGet(S(ctx), e.seat, st.into) + n(st.get, e));
    }),
    adjust: flow({ key: str, by: int, min: optional(int), max: optional(int) }, (ctx, st: Extract<PackStep, { op: 'adjust' }>, e) => {
      const was = resGet(S(ctx), e.seat, st.key);
      const to = Math.min(st.max ?? Infinity, Math.max(st.min ?? -Infinity, was + st.by));
      if (st.by > 0 ? to > was && to < was + st.by : to < was && to > was + st.by) partly('short');
      resSet(ctx, e.seat, st.key, to);
    }),
    seq: flow({ steps: eff }, (ctx, st: Extract<PackStep, { op: 'seq' }>, e) => go(ctx, st.steps, e)),
    if: flow({ test: str, then: eff, else: optional(eff) }, (ctx, st: Extract<PackStep, { op: 'if' }>, e) => {
      const t = cfg.tests?.[st.test];
      if (!t) throw new EngineBugError(`card-language pack: no test ${st.test}`);
      blind(S(ctx), e);
      const branch = t(ro(ctx.s), e) ? st.then : st.else;
      if (branch) go(ctx, branch, e);
    }),
    forEach: flow({ then: eff }, (ctx, st: Extract<PackStep, { op: 'forEach' }>, e) => ctx.then(...((e.cards ?? []).flatMap((c) => effectTasks(st.then, { ...e, cards: [c] })) as unknown as G['task'][]))),
    eachPlayer: flow({ then: eff }, (ctx, st: Extract<PackStep, { op: 'eachPlayer' }>, e) => {
      if (!cfg.seats) throw new EngineBugError('card-language pack: eachPlayer needs cfg.seats');
      const all = cfg.seats(ro(ctx.s));
      const i = Math.max(0, all.indexOf(e.seat));
      ctx.then(...([...all.slice(i), ...all.slice(0, i)].flatMap((seat) => effectTasks(st.then, { ...e, seat })) as unknown as G['task'][]));
    }),
    repeat: flow({ times: amount, then: eff }, (ctx, st: Extract<PackStep, { op: 'repeat' }>, e) => go(ctx, Array.from({ length: n(st.times, e) }, () => st.then).flat(), e)),
    count: flow({ what: str, then: eff }, (ctx, st: Extract<PackStep, { op: 'count' }>, e) => {
      const c = cfg.counts?.[st.what];
      if (!c) throw new EngineBugError(`card-language pack: no count ${st.what}`);
      blind(S(ctx), e);
      go(ctx, st.then, { ...e, n: c(ro(ctx.s), e) });
    }),
    later: flow({ at: str, then: eff }, (ctx, st: Extract<PackStep, { op: 'later' }>, e) => {
      const s = S(ctx);
      s.later = [...(s.later ?? []), { at: st.at, steps: st.then, env: e }] as never;
    }),
    payThen: flow({ cost: eff, then: eff }, (ctx, st: Extract<PackStep, { op: 'payThen' }>, e) => {
      // Pays the cost, then (the same step again, env.paidFrom set) runs `then` only when no cost occurrence was cancelled.
      const s = S(ctx);
      // K583: under cost = parts a game env's own `owed` stays (as before K529); under whole the field is the pack's.
      const { paidFrom, ...all } = e;
      const { owed, ...bare } = all;
      const rest = P.cost === 'whole' ? bare : all;
      const occs = (s as unknown as KernelState).timing?.occurrences ?? [];
      // K583, paid = effect in the check: what a cost changed is not counted; the game is compared from where the cost ended.
      const fx = dry !== null && (P.paid === 'effect' || R !== null);
      // K597, resolves: a cost that is not a top-level payThen gives a marker run after its effect (the two parts compared there); a cost that stopped part paid is cannotPay.
      const nested = (ok: boolean): G['task'] | undefined => {
        if (R === null || dry === null) return undefined;
        const start = J.costs[J.costs.length - 1];
        J.costs = J.costs.slice(0, -1);
        if (J.costs.length === 0 && J.paid === null && (R.steps[J.next] as PackStep | undefined)?.op === 'payThen') return undefined;
        const v = view(s);
        if (!ok) {
          if (v !== start) partly('cannotPay');
          return undefined;
        }
        return { kind: PAID, from: v, cost: v !== start, why: whyNot(s, { op: 'seq', steps: st.then } as Step, rest as E) } as unknown as G['task'];
      };
      const costEnds = (ok = false): G['task'] | undefined => {
        const m = nested(ok);
        if (!fx || (J.cost -= 1) !== 0) return m;
        J.base = view(s);
        // K597: the first cost to end in a top-level step; for a top-level payThen, its `then` part's reason is read now.
        if (R === null || J.paid !== null) return m;
        J.paid = J.base;
        const top = R.steps[J.next] as PackStep | undefined;
        // A top-level payThen whose cost stopped part paid (judged as a whole) or was cancelled: its effect part is cannotPay.
        if (top?.op === 'payThen') J.whys = { ...J.whys, [J.next + 0.5]: ok ?whyNot(s, { op: 'seq', steps: top.then } as Step, R.env) : 'cannotPay' };
        return m;
      };
      // K583: every amount of the cost is read from `cfg.due` here, before anything is paid, so the cost is paid as it was judged.
      const paying = rest;
      // K529, a cost judged as a whole is paid one step at a time: a step that cannot pay when it is reached stops the cost, and `then` does not run.
      const next = (from: number, left: readonly Step[]): void => {
        const step = left[0];
        if (step === undefined || !payable(s, step, paying as E)) return void costEnds();
        ctx.then(...(effectTasks([step], { ...paying, owed: left.slice(1) }) as unknown as G['task'][]), ...(effectTasks([st], { ...rest, paidFrom: from, owed: left.slice(1) }) as unknown as G['task'][]));
      };
      if (paidFrom !== undefined) {
        if (occs.some((o) => o.id >= paidFrom && o.state === 'cancelled')) return void costEnds();
        if (P.cost === 'whole' && owed !== undefined && owed.length > 0) return next(paidFrom, owed);
        const m = costEnds(true);
        // K529: in the check the "if you do" part does not run, so it never counts on its own (K583: it runs under paid = effect).
        if (dry === null || fx) ctx.then(...(effectTasks(st.then, rest) as unknown as G['task'][]), ...(m ? [m] : []));
        return;
      }
      const cost = costed(ctx.s, st.cost, e, true);
      if (!canPay(s, cost, e)) return;
      if (fx) {
        if (R === null && J.cost === 0 && view(s) !== J.base) throw CHANGED;
        if (J.cost === 0 && R === null) J.sees = seenBy(s, dry ?? '');
        J.cost += 1;
      }
      if (R !== null && dry !== null) J.costs = [...J.costs, view(s)];
      if (P.cost === 'whole') return next((s as unknown as KernelState).timing?.next ?? 0, cost);
      ctx.then(...(effectTasks(cost, e) as unknown as G['task'][]), ...(effectTasks([st], { ...e, paidFrom: (s as unknown as KernelState).timing?.next ?? 0 }) as unknown as G['task'][]));
    }),
    custom: flow({ name: str, n: optional(amount) }, (ctx, st: Extract<PackStep, { op: 'custom' }>, e) => {
      const c = cfg.custom?.[st.name];
      if (!c) throw new EngineBugError(`card-language pack: no custom verb ${st.name}`);
      blind(S(ctx), e);
      if (!hid(S(ctx))) c.run(ctx, st, e);
      else if (R !== null && c.viewSafe === true) onView(ctx, () => c.run(ctx, st, e));
      else stop();
    }, (ctx, st: Extract<PackStep, { op: 'custom' }>, e, a) => {
      const r = cfg.custom?.[st.name]?.resume;
      if (!r) throw new EngineBugError(`card-language pack: custom verb ${st.name} was answered but has no resume`);
      if (!hid(S(ctx))) r(ctx, st, e, a);
      else if (R !== null && cfg.custom?.[st.name]?.viewSafe === true) onView(ctx, () => r(ctx, st, e, a));
      else stop();
    }),
  } as Record<PackOp, V>;

  // Words: the game's template or function, else the pack's; `{what}` names the cards, zones and names go through `cfg.word`.
  const word = cfg.word ?? ((_k: string, v: string) => v);
  const slot = (st: Record<string, unknown>, key: string, noun?: string): string => {
    const op = st.op as string;
    const d = def(op);
    const v = key === 'from' || key === 'to' ? (st[key] ?? d[key]) : st[key];
    if (noun !== undefined) return plural(v ?? (key === 'count' ? 1 : v), noun);
    if (key === 'what') {
      if (op === 'count') return word('what', String(st.what));
      const from = word('zone', (st.from as string | undefined) ?? d.from ?? 'deck');
      const c = st.count ?? 1;
      return { source: 'this card', chosen: c === 1 && (st.cards ?? d.sel) === 'chosen' && op !== 'chooseDestination' ? 'it' : 'them', all: `all cards in ${from}`, top: `the top ${plural(c, 'card')} of ${from}`, pick: `${plural(c, 'card')} from ${from}` }[(st.cards ?? d.sel ?? 'chosen') as Sel];
    }
    if (key === 'host') return st.host === 'chosen' ? 'the chosen card' : 'this card';
    if (v === undefined) return '';
    if (isEff(v)) return (key === 'else' ? 'Otherwise: ' : '') + describeEffect(table(), v as never);
    if (Array.isArray(v)) return v.map((x) => (isEff(x) ? describeEffect(table(), x as never) : word('zone', String(x)))).join(key === 'effects' ? ' ' : ' or ');
    if (typeof v === 'string' && ['from', 'to', 'zone'].includes(key)) return word('zone', v);
    if (typeof v === 'string' && ['res', 'into', 'test', 'at', 'key'].includes(key)) return word(key === 'into' ? 'res' : (key as 'res'), v);
    return typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v);
  };
  for (const op of Object.keys(verbs) as PackOp[]) {
    const w = cfg.words?.[op];
    const text = (st: PackStep): string => {
      if (typeof w === 'function') return (w as (s: PackStep) => string)(st);
      if (st.op === 'custom' && w === undefined) {
        const c = cfg.custom?.[st.name];
        if (c) return c.text(st);
      }
      return (w ?? PACK_WORDS[op]).replace(/\{(\w+)(?::(\w+))?\}/g, (_, k: string, noun?: string) => slot(st as unknown as Record<string, unknown>, k, noun)).replace(/\s+/g, ' ').trim();
    };
    (verbs as Record<string, unknown>)[op] = { ...verbs[op], text };
  }

  const happen = (ctx: Ctx<G>, occ: Occurrence): boolean => {
    const s = S(ctx);
    const m = s.cardMoves?.[String(occ.id)];
    if (m === undefined) return false;
    delete (own(s, 'cardMoves') as Record<string, unknown>)[String(occ.id)];
    let id = occ.keys.target;
    if (m.top) {
      if (cardsIn(s, m.from).length === 0 && m.op === 'draw' && !m.again) {
        // The reshuffle is its own `would` occurrence (kind `reshuffle`); the draw is tried once more after it.
        const r = cfg.reshuffle?.(ro(s) as unknown as G['state'], m.from, m.seat);
        if (r !== undefined && cardsIn(s, r).length > 0) {
          const env = { seat: m.seat } as E;
          send(ctx, 'draw', 1, m.from, m.to, m.at, env, { again: true });
          send(ctx, 'reshuffle', 1, r, m.from, 'top', env, { all: true });
        }
        return true;
      }
      if (m.all) {
        for (const c of [...cardsIn(s, m.from)]) moveCard(s, c, m.to);
        shuffleZone(ctx, m.to);
        return true;
      }
      id = cardsIn(s, m.from)[0];
    } else if (id !== undefined && m.from !== '' && locate(s, id)?.zone !== m.from) return true; // it left meanwhile: nothing moves
    if (id === undefined || locate(s, id) === undefined) return true;
    const from = moveCard(s, id, m.to, m.at);
    cfg.moved?.(ctx, { op: m.op, card: id, from, to: m.to, seat: m.seat });
    return true;
  };
  return { verbs: verbs as unknown as VerbTable<G, PackStep, E>, happen, wouldChange, judge, resolves, costed };
}
