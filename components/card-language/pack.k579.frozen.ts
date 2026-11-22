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
  /** The check's caps: answers tried in all (default 32) and tasks run per answer (default 2000). A cap hit is `unknown`. */
  readonly branches?: number;
  readonly tasks?: number;
  /** What counts as the game for the check (default: the state without the kernel's and the pack's bookkeeping). */
  readonly view?: (s: S) => unknown;
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
  readonly custom?: Readonly<Record<string, { run(ctx: Ctx<G>, step: PackStep, env: E): void; readonly resume?: (ctx: Ctx<G>, step: PackStep, env: E, answer: readonly string[]) => void; readonly payable?: (s: G['state'], step: PackStep, env: E) => boolean; text(step: PackStep): string }>>;
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

const CANNOT_KNOW = new Error('card-language pack: the dry run cannot know');
const stop = (): never => {
  throw CANNOT_KNOW;
};
let dry: string | null = null;
/** K529: is the pack's check running this handler on a copy? A game's custom verb that would read cards the seat cannot see throws or skips then. */
export const inDryRun = (): boolean => dry !== null;
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
export function cardPack<G extends GameTypes, E extends PackEnv = PackEnv>(cfg: PackConfig<G, E> = {}): { verbs: VerbTable<G, PackStep, E>; happen: (ctx: Ctx<G>, occ: Occurrence) => boolean; wouldChange: (s: G['state'], content: G['content'], steps: readonly (PackStep | Step)[], env: E) => Offered } {
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
  const due = (p: { readonly amount: Amount }, env: E): number => n(p.amount, env);
  const def = (op: string): { from?: string; to?: string; sel?: Sel; at?: At } => ({ ...DEF[op], ...cfg.zones?.[op as PackOp] });
  const zone = (s: PackState, name: string, seat: string): string => (s.zones[`${name}:${seat}`] !== undefined ? `${name}:${seat}` : name);
  const go = (ctx: Ctx<G>, steps: Eff, env: E): void => ctx.then(...(effectTasks(steps, env) as unknown as G['task'][]));
  const ask = (ctx: Ctx<G>, st: PackStep, env: E, kind: string, options: readonly KernelOption[], min: number, max: number): void => {
    const base = { kind, seat: env.seat, min, max, options };
    askVerb(ctx, (cfg.prompt?.(base, st, env) ?? base) as Omit<G['prompt'], 'id'>, st, env);
  };
  const resGet = (s: PackState, seat: string, key: string): number => (cfg.res ? cfg.res.get(s as unknown as G['state'], seat, key) : (s.res?.[seat]?.[key] ?? 0));
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
      if (l) l.res[p.res] = (l.res[p.res] ?? 0) + due(p, env);
      if (l && p.op === 'convert') l.res[p.into] = (l.res[p.into] ?? 0) - n(p.get, env);
      return had >= due(p, env);
    }
    if (p.op === 'seq') return p.steps.every((x) => payable(s, x, env, l));
    if (p.op === 'payThen') return p.cost.every((x) => payable(s, x, env, l));
    if (p.op === 'custom') return cfg.custom?.[p.name]?.payable?.(s as unknown as G['state'], p, env) ?? true;
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
  const view = (s: unknown): string => canonicalJson(P.view ? P.view(s as G['state']) : Object.fromEntries(Object.entries(s as object).filter(([k]) => !VIEW_SKIP.includes(k))));
  // K529: would these steps change the game? They run on a copy with the game's handlers; every prompt forks one run per answer tried.
  const wouldChange = (state: G['state'], content: G['content'], steps: Eff, env: E): Offered => {
    if (dry !== null) return 'unknown';
    if (!cfg.handlers) throw new EngineBugError('card-language pack: wouldChange needs cfg.handlers (() => RULES.handlers)');
    if (state.result !== null) return 'no';
    let left = 0;
    const table = Object.fromEntries(Object.entries(cfg.handlers()).map(([k, h]) => [k, (c: Ctx<G>, t: G['task']) => ((left -= 1) < 0 ? stop() : h(c, t))])) as HandlerTable<G>;
    const before = view(state);
    // One run to the next prompt: yes, no, unknown, or the copy with its prompt open.
    const seg = (s: Draft<KernelState>, first?: readonly G['task'][]): Offered | Draft<KernelState> => {
      left = P.tasks ?? 2000;
      const ctx = makeCtx<G>({}, s as Draft<G['state']>, content, []);
      (ctx as { rng: unknown }).rng = { nextUint32: stop, int: stop, shuffle: stop };
      try {
        if (first) ctx.then(...first);
        run(ctx, table);
      } catch (e) {
        if (e !== CANNOT_KNOW && !(e instanceof EngineBugError) && !(e instanceof GameOver)) throw e;
        if (!(e instanceof GameOver)) return view(s) === before ? 'unknown' : 'yes';
      }
      if (view(s) !== before) return 'yes';
      if (s.prompt === null) return 'no';
      return s.prompt.seat !== undefined && String(s.prompt.seat) !== env.seat ? 'unknown' : s;
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
      if (yes(seg(start, effectTasks(steps, env)))) return 'yes';
      const fork = (s: Draft<KernelState>, picks: readonly string[]): boolean => {
        const c = copyState(s);
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
          if ((tried += 1) > (P.branches ?? 32)) return 'unknown';
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
            if ((tried += 1) > (P.branches ?? 32)) return 'unknown';
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
  const why = (s: PackState, o: Eff, e: E, r: Offered): string => {
    if (r === 'unknown') return 'unknown';
    const unpaid = (x: Step): boolean => {
      const p = x as PackStep;
      return p.op === 'payThen' ? !canPay(s, p.cost, e) : (p.op === 'pay' || p.op === 'convert') && !payable(s, p, e);
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
    return cardsIn(s, z).flatMap((c, i) => {
      const seen = peek || canSee(s, env.seat, c);
      if (!seen) return f === undefined ? [`#${String(i)}`] : [];
      return f === undefined || f(s as unknown as G['state'], c, env) ? [c] : [];
    });
  };
  const unhide = (s: PackState, z: string, picks: readonly string[]): string[] => picks.map((p) => (p.startsWith('#') ? (cardsIn(s, z)[Number(p.slice(1))] ?? '') : p));
  const pickAsk = (ctx: Ctx<G>, st: PackStep, env: E, z: string, min: number, max: number, peek = false, kind = 'chooseCards', keep?: (id: string) => boolean): boolean => {
    const ids = eligible(S(ctx), st as { filter?: string }, env, z, peek).filter((id) => keep?.(id) ?? true);
    const hi = Math.min(max, ids.length);
    if (hi === 0) return false;
    ask(ctx, st, env, kind, ids.map((id) => ({ id, enabled: true })), Math.min(min, hi), hi);
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
      for (const c of ids) reveal(s, locate(s, c)?.zone ?? '', [c], who === 'all' ? 'all' : [e.seat]);
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
      send(ctx, 'refill', Math.min(Math.max(0, st.size - cardsIn(s, z).length), cardsIn(s, src).length), src, z, 'bottom', e);
    }),
    shuffle: flow({ zone: str }, (ctx, st: Extract<PackStep, { op: 'shuffle' }>, e) => shuffleZone(ctx, zone(S(ctx), st.zone, e.seat))),
    search: flow({ zone: str, filter: optional(str), count: optional(amount), to: optional(str), shuffle: optional(bool) }, (ctx, st: Extract<PackStep, { op: 'search' }>, e) => {
      const z = zone(S(ctx), st.zone, e.seat);
      if (!pickAsk(ctx, st, e, z, 0, n(st.count, e), true, 'search') && st.shuffle !== false) shuffleZone(ctx, z);
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
      const rs = st.options.map((o) => wouldChange(ctx.s, ctx.content, o, e));
      if (!rs.some(live)) return;
      ask(ctx, st, e, 'chooseOption', rs.map((r, i) => (live(r) || P.deadChoice !== 'bar' ? { id: String(i), enabled: true } : bar(String(i), why(S(ctx), st.options[i] ?? [], e, r)))), 1, 1);
    },
      (ctx, st: Extract<PackStep, { op: 'chooseOption' }>, e, a) => go(ctx, st.options[Number(a[0])] ?? [], e)),
    may: flow({ then: eff }, (ctx, st: Extract<PackStep, { op: 'may' }>, e) => {
      const r = dry !== null || (P.noChange ?? 'ask') === 'ask' ? 'yes' : wouldChange(ctx.s, ctx.content, st.then, e);
      if (!live(r) && P.noChange === 'skip') return;
      ask(ctx, st, e, 'may', [live(r) ? { id: 'yes', enabled: true } : bar('yes', why(S(ctx), st.then, e, r)), { id: 'no', enabled: true }], 1, 1);
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
      const seats = cfg.seats(ctx.s).filter((p) => !st.others || p !== e.seat);
      if (seats.length > 0) return ask(ctx, st, e, 'choosePlayer', seats.map((id) => ({ id, enabled: true })), 1, 1);
      const seat = cfg.noPlayer?.(ctx.s, e);
      if (seat !== undefined) go(ctx, st.then, { ...e, seat });
    }, (ctx, st: Extract<PackStep, { op: 'choosePlayer' }>, e, a) => go(ctx, st.then, { ...e, seat: a[0] ?? e.seat })),
    choosePayment: flow({ ways: effs, then: eff }, (ctx, st: Extract<PackStep, { op: 'choosePayment' }>, e) => {
      const s = S(ctx);
      const opts = st.ways.map((w, i) => (canPay(s, w, e) ? { id: String(i), enabled: true } : P.deadChoice === 'bar' ? bar(String(i), 'cannotPay') : { id: String(i), enabled: false, why: 'cannotPay' }));
      if (opts.some((o) => o.enabled)) ask(ctx, st, e, 'choosePayment', opts, 1, 1);
    }, (ctx, st: Extract<PackStep, { op: 'choosePayment' }>, e, a) => go(ctx, [{ op: 'payThen', cost: st.ways[Number(a[0])] ?? [], then: st.then } as Step], e)),
    orderEffects: flow({ effects: effs }, (ctx, st: Extract<PackStep, { op: 'orderEffects' }>, e) => {
      if (st.effects.length === 1) return go(ctx, st.effects[0] ?? [], e);
      ask(ctx, st, e, 'orderEffects', list(st.effects.length), st.effects.length, st.effects.length);
    }, (ctx, st: Extract<PackStep, { op: 'orderEffects' }>, e, a) => go(ctx, a.flatMap((i) => st.effects[Number(i)] ?? []), e)),
    gainResource: flow({ res: str, amount }, (ctx, st: Extract<PackStep, { op: 'gainResource' }>, e) => resSet(ctx, e.seat, st.res, resGet(S(ctx), e.seat, st.res) + n(st.amount, e))),
    pay: flow({ res: str, amount }, (ctx, st: Extract<PackStep, { op: 'pay' }>, e) => {
      const s = S(ctx);
      if (!payable(s, st, e)) return;
      resSet(ctx, e.seat, st.res, resGet(s, e.seat, st.res) - due(st, e));
    }),
    convert: flow({ res: str, amount, into: str, get: amount }, (ctx, st: Extract<PackStep, { op: 'convert' }>, e) => {
      const s = S(ctx);
      if (!payable(s, st, e)) return;
      resSet(ctx, e.seat, st.res, resGet(s, e.seat, st.res) - due(st, e));
      resSet(ctx, e.seat, st.into, resGet(S(ctx), e.seat, st.into) + n(st.get, e));
    }),
    adjust: flow({ key: str, by: int, min: optional(int), max: optional(int) }, (ctx, st: Extract<PackStep, { op: 'adjust' }>, e) =>
      resSet(ctx, e.seat, st.key, Math.min(st.max ?? Infinity, Math.max(st.min ?? -Infinity, resGet(S(ctx), e.seat, st.key) + st.by)))),
    seq: flow({ steps: eff }, (ctx, st: Extract<PackStep, { op: 'seq' }>, e) => go(ctx, st.steps, e)),
    if: flow({ test: str, then: eff, else: optional(eff) }, (ctx, st: Extract<PackStep, { op: 'if' }>, e) => {
      const t = cfg.tests?.[st.test];
      if (!t) throw new EngineBugError(`card-language pack: no test ${st.test}`);
      const branch = t(ctx.s, e) ? st.then : st.else;
      if (branch) go(ctx, branch, e);
    }),
    forEach: flow({ then: eff }, (ctx, st: Extract<PackStep, { op: 'forEach' }>, e) => ctx.then(...((e.cards ?? []).flatMap((c) => effectTasks(st.then, { ...e, cards: [c] })) as unknown as G['task'][]))),
    eachPlayer: flow({ then: eff }, (ctx, st: Extract<PackStep, { op: 'eachPlayer' }>, e) => {
      if (!cfg.seats) throw new EngineBugError('card-language pack: eachPlayer needs cfg.seats');
      const all = cfg.seats(ctx.s);
      const i = Math.max(0, all.indexOf(e.seat));
      ctx.then(...([...all.slice(i), ...all.slice(0, i)].flatMap((seat) => effectTasks(st.then, { ...e, seat })) as unknown as G['task'][]));
    }),
    repeat: flow({ times: amount, then: eff }, (ctx, st: Extract<PackStep, { op: 'repeat' }>, e) => go(ctx, Array.from({ length: n(st.times, e) }, () => st.then).flat(), e)),
    count: flow({ what: str, then: eff }, (ctx, st: Extract<PackStep, { op: 'count' }>, e) => {
      const c = cfg.counts?.[st.what];
      if (!c) throw new EngineBugError(`card-language pack: no count ${st.what}`);
      go(ctx, st.then, { ...e, n: c(ctx.s, e) });
    }),
    later: flow({ at: str, then: eff }, (ctx, st: Extract<PackStep, { op: 'later' }>, e) => {
      const s = S(ctx);
      s.later = [...(s.later ?? []), { at: st.at, steps: st.then, env: e }] as never;
    }),
    payThen: flow({ cost: eff, then: eff }, (ctx, st: Extract<PackStep, { op: 'payThen' }>, e) => {
      // Pays the cost, then (the same step again, env.paidFrom set) runs `then` only when no cost occurrence was cancelled.
      const s = S(ctx);
      const { paidFrom, owed, ...rest } = e;
      const occs = (s as unknown as KernelState).timing?.occurrences ?? [];
      // K529, a cost judged as a whole is paid one step at a time: a step that cannot pay when it is reached stops the cost, and `then` does not run.
      const next = (from: number, left: readonly Step[]): void => {
        const step = left[0];
        if (step === undefined || !payable(s, step, rest as E)) return;
        ctx.then(...(effectTasks([step], { ...rest, owed: left.slice(1) }) as unknown as G['task'][]), ...(effectTasks([st], { ...rest, paidFrom: from, owed: left.slice(1) }) as unknown as G['task'][]));
      };
      if (paidFrom !== undefined) {
        if (occs.some((o) => o.id >= paidFrom && o.state === 'cancelled')) return;
        if (P.cost === 'whole' && owed !== undefined && owed.length > 0) return next(paidFrom, owed);
        // K529: in the check the "if you do" part does not run, so it never counts on its own.
        if (dry === null) go(ctx, st.then, rest as E);
        return;
      }
      if (!canPay(s, st.cost, e)) return;
      if (P.cost === 'whole') return next((s as unknown as KernelState).timing?.next ?? 0, st.cost);
      ctx.then(...(effectTasks(st.cost, e) as unknown as G['task'][]), ...(effectTasks([st], { ...e, paidFrom: (s as unknown as KernelState).timing?.next ?? 0 }) as unknown as G['task'][]));
    }),
    custom: flow({ name: str, n: optional(amount) }, (ctx, st: Extract<PackStep, { op: 'custom' }>, e) => {
      const c = cfg.custom?.[st.name];
      if (!c) throw new EngineBugError(`card-language pack: no custom verb ${st.name}`);
      c.run(ctx, st, e);
    }, (ctx, st: Extract<PackStep, { op: 'custom' }>, e, a) => {
      const r = cfg.custom?.[st.name]?.resume;
      if (!r) throw new EngineBugError(`card-language pack: custom verb ${st.name} was answered but has no resume`);
      r(ctx, st, e, a);
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
        const r = cfg.reshuffle?.(s as unknown as G['state'], m.from, m.seat);
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
  return { verbs: verbs as unknown as VerbTable<G, PackStep, E>, happen, wouldChange };
}
