// A rule-based opponent (K103, K115). Ideas from chiriboga (GPL-3.0), Forge (GPL-3.0), boardgame.io (MIT) and XMage (MIT); written new.
import { ref, type Part } from '../game-log/index.ts';

/** The random numbers a decision may draw (sim-pool's `DriverRng` fits); never the game's `state.rng`. */
export interface Rand {
  int(n: number): number;
  chance(p: number): boolean;
}

declare const SEAT: unique symbol;
/** What one seat may know. Only `redact` makes one, so an opponent typed on it cannot read the full state. */
export type Redacted<V> = V & { readonly [SEAT]: true };
export const redact = <S, V, K extends string | number = string>(state: S, seat: K, view: (s: S, seat: K) => V): Redacted<V> => view(state, seat) as Redacted<V>;
/** A10: the secrets (hidden card ids, names) found in a view: an exact string value, an exact key name, or an id as a whole word inside a string ("card:42" holds "42"; "c10" does not hold "c1"). `opts.numbers`: secret numbers, matched as exact number values (only those the game marks). `opts.keys`: key names the view must not hold, listed as `key:<name>` (e.g. `['rng']`; opt-in, since `stack` may be a real zone). A test expects none. */
export function viewLeaks(view: unknown, secrets: readonly string[], opts: { numbers?: readonly number[]; keys?: readonly string[] } = {}): string[] {
  const strs: string[] = [];
  const nums = new Set<number>();
  const keys = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === 'string') strs.push(v);
    else if (typeof v === 'number') nums.add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v !== null && typeof v === 'object') for (const [k, x] of Object.entries(v)) { keys.add(k); strs.push(k); walk(x); }
  };
  walk(view);
  const word = (t: string, x: string) => new RegExp(`(?<![A-Za-z0-9_])${x.replace(/\W/g, '\\$&')}(?![A-Za-z0-9_])`).test(t);
  const out = secrets.filter((x) => x !== '' && strs.some((t) => t === x || word(t, x)));
  for (const n of opts.numbers ?? []) if (nums.has(n)) out.push(String(n));
  for (const k of opts.keys ?? []) if (keys.has(k)) out.push(`key:${k}`);
  return out;
}

/** Closed reason vocabulary in three classes (Forge `AiPlayDecision`). */
export const REASONS = {
  'will-play': 'play',
  plan: 'play',
  'only-option': 'play',
  'wait-timing': 'later',
  'wait-need': 'later',
  'cannot-use': 'never',
  'missing-logic': 'never',
  runaway: 'never',
  'cant-afford': 'never',
  'no-target': 'never',
  drawback: 'never',
  'not-worth': 'never',
  'non-stacking': 'never',
  pruned: 'never',
} as const;
export type Reason = keyof typeof REASONS;
export type ReasonClass = 'play' | 'later' | 'never';

/** Per-card advice beside the effect records; closed keys. */
export interface Need {
  readonly count: string;
  readonly op: '>=' | '<=' | '=' | '>' | '<';
  readonly n: number;
}
export interface Advice {
  /** Timing words when the card is worth playing; others give `wait-timing`. */
  readonly when?: readonly string[];
  /** Counts the game evaluates (`count`); a failed one gives `wait-need`. */
  readonly needs?: readonly Need[];
  /** The effect is bad for its target: handlers aim it at the other side. */
  readonly curse?: boolean;
  /** No second copy while one is in play (`inPlay`). */
  readonly nonStacking?: boolean;
  /** Discard or sacrifice order: higher goes first. */
  readonly discard?: number;
  /** Added to the score. */
  readonly priority?: number;
  /** Value of keeping the card in hand. */
  readonly keep?: number;
  /** Why the opponent cannot play it well; it never plays it. */
  readonly cannotUse?: string;
}
const ADVICE: Record<string, string> = { when: 'words', needs: 'needs', curse: 'boolean', nonStacking: 'boolean', discard: 'number', priority: 'number', keep: 'number', cannotUse: 'string' };
const OPS = ['>=', '<=', '=', '>', '<'];

/** Unknown keys and wrong types in an advice table (card id to advice). */
export function adviceProblems(table: Readonly<Record<string, unknown>>): string[] {
  const out: string[] = [];
  for (const [card, a] of Object.entries(table)) {
    if (typeof a !== 'object' || a === null) {
      out.push(`${card}: not an object`);
      continue;
    }
    for (const [k, v] of Object.entries(a as Record<string, unknown>)) {
      const t = ADVICE[k];
      const ok =
        t === 'words' ? Array.isArray(v) && v.every((w) => typeof w === 'string')
        : t === 'needs' ? Array.isArray(v) && v.every((n: unknown) => typeof n === 'object' && n !== null && typeof (n as Need).count === 'string' && OPS.includes((n as Need).op) && typeof (n as Need).n === 'number')
        : t !== undefined && typeof v === t;
      if (!ok) out.push(`${card}.${k}: ${t === undefined ? 'unknown key' : `not ${t}`}`);
    }
  }
  return out;
}

/** Cards in discard or sacrifice order: highest `discard`, then lowest `keep`. */
export const discardOrder = (cards: readonly string[], advice: (card: string) => Advice | undefined): string[] =>
  [...cards].sort((a, b) => (advice(b)?.discard ?? 0) - (advice(a)?.discard ?? 0) || (advice(a)?.keep ?? 0) - (advice(b)?.keep ?? 0));

/** Behaviour values only; difficulty and personality are data (Forge `.ai` files). */
export type Profile = Readonly<Record<string, number | boolean>>;
export const PIPELINE = { runawayFree: 10, runawayDecay: 0.95 };
/** The defaults with the file's values; an unknown key or another type throws. */
export function loadProfile<P extends Profile>(defaults: P, data: Readonly<Record<string, unknown>>, name = 'profile'): P {
  for (const [k, v] of Object.entries(data))
    if (!(k in defaults) || typeof v !== typeof defaults[k]) throw new Error(`${name}.${k}: ${k in defaults ? `not ${typeof defaults[k]}` : 'unknown key'}`);
  return { ...defaults, ...data };
}

/** Memory across prompts: named sets (held for later, reserved for a cost, seen...), uses per card, the plan. Plain JSON. */
export interface PlanStep {
  readonly match: string;
  readonly note?: string;
}
export interface Memory {
  sets: Record<string, string[]>;
  uses: Record<string, number>;
  plan: PlanStep[];
}
export const newMemory = (): Memory => ({ sets: {}, uses: {}, plan: [] });
export const remember = (m: Memory, set: string, id: string): void => {
  const s = (m.sets[set] ??= []);
  if (!s.includes(id)) s.push(id);
};
export const recalls = (m: Memory, set: string, id: string): boolean => m.sets[set]?.includes(id) ?? false;
export const forget = (m: Memory, set: string, id?: string): void => {
  if (id === undefined) delete m.sets[set];
  else m.sets[set] = (m.sets[set] ?? []).filter((x) => x !== id);
};
/** End of turn: uses and plan cleared, every set but `keep`. */
export function forgetTurn(m: Memory, keep: readonly string[] = []): void {
  for (const k of Object.keys(m.sets)) if (!keep.includes(k)) delete m.sets[k];
  m.uses = {};
  m.plan = [];
}
export const setPlan = (m: Memory, steps: readonly PlanStep[]): void => {
  m.plan = [...steps];
};

/** One legal option: `key` is stable across prompts (the plan matches it); `verbs` are the card's effect verbs, main first. */
export interface Candidate {
  readonly key: string;
  readonly card?: string;
  readonly verbs?: readonly string[];
  /** Taken when nothing is worth playing. */
  readonly pass?: boolean;
}

/** Explain lines: one per term (Forge evaluator, boardgame.io objectives). */
export interface Evaluation {
  readonly total: number;
  readonly lines: readonly string[];
}
export type Terms<V> = Readonly<Record<string, (view: V) => number>>;
export function evaluate<V>(view: V, terms: Terms<V>, weights: Readonly<Record<string, number>> = {}): Evaluation {
  let total = 0;
  const lines = Object.entries(terms).map(([k, f]) => {
    const v = f(view);
    const w = weights[k] ?? 1;
    total += v * w;
    return `${k} ${String(v)} x ${String(w)} = ${String(v * w)}`;
  });
  return { total, lines };
}
/** Copy-fidelity: the lines that differ between a state and its copy (empty when the copy scores the same). */
export function fidelityProblems<V>(original: V, copy: V, terms: Terms<V>, weights?: Readonly<Record<string, number>>): string[] {
  const a = evaluate(original, terms, weights).lines;
  const b = evaluate(copy, terms, weights).lines;
  return a.flatMap((l, i) => (l === b[i] ? [] : [`- ${l}`, `+ ${b[i] ?? ''}`]));
}

export interface Ctx<V, P extends Profile> {
  readonly view: Redacted<V>;
  readonly cand: Candidate;
  readonly advice: Advice;
  readonly profile: P;
  readonly memory: Memory;
  readonly rand: Rand;
  readonly timing: string;
  readonly verb: string;
  /** A chained sub-effect (not the main verb): a refusal is a `drawback`. */
  readonly sub: boolean;
}
export interface Verdict {
  readonly reason: Reason;
  readonly score?: number;
  readonly lines?: readonly string[];
}
/** The opponent's handler for one effect verb; a number from `judge` is a score with `will-play`. */
export interface VerbHandler<V, P extends Profile> {
  judge?(ctx: Ctx<V, P>): Verdict | number;
  /** False: `cant-afford`. */
  cost?(ctx: Ctx<V, P>): boolean;
}
export type HandlerRow<V, P extends Profile> = VerbHandler<V, P> | 'always' | 'never';

export interface Opponent<V, P extends Profile> {
  readonly name: string;
  readonly profile: P;
  readonly handlers: Readonly<Record<string, HandlerRow<V, P>>>;
  advice(card: string): Advice | undefined;
  readonly memory: Memory;
  count?(name: string, view: Redacted<V>): number;
  inPlay?(card: string, view: Redacted<V>): boolean;
  /** The candidate's own score beside the verbs' (an evaluator, a look-ahead). */
  score?(cand: Candidate, view: Redacted<V>): Evaluation | number;
  /** Pruning passes: keys to drop before the choice. */
  readonly prune?: readonly ((judged: readonly Judged[], view: Redacted<V>) => readonly string[])[];
}

export interface Judged {
  readonly key: string;
  readonly reason: Reason;
  readonly cls: ReasonClass;
  readonly score: number;
  readonly lines: readonly string[];
}
const out = (key: string, reason: Reason, score: number, lines: readonly string[]): Judged => ({ key, reason, cls: REASONS[reason], score, lines });
const NEED: Record<Need['op'], (a: number, b: number) => boolean> = { '>=': (a, b) => a >= b, '<=': (a, b) => a <= b, '=': (a, b) => a === b, '>': (a, b) => a > b, '<': (a, b) => a < b };

/** The fixed pipeline (Forge `SpellAbilityAi`): hint, timing, needs, stacking, runaway guard, each verb's logic and cost (subs: drawback), score. */
export function judge<V, P extends Profile>(o: Opponent<V, P>, view: Redacted<V>, cand: Candidate, rand: Rand, timing = ''): Judged {
  const advice = (cand.card === undefined ? undefined : o.advice(cand.card)) ?? {};
  const k = cand.key;
  if (advice.cannotUse !== undefined) return out(k, 'cannot-use', 0, [advice.cannotUse]);
  if (advice.when && !advice.when.includes(timing)) return out(k, 'wait-timing', 0, [`when ${advice.when.join('|')}, now ${timing}`]);
  for (const n of advice.needs ?? []) {
    const v = o.count?.(n.count, view) ?? 0;
    if (!NEED[n.op](v, n.n)) return out(k, 'wait-need', 0, [`${n.count} ${String(v)} ${n.op} ${String(n.n)} fails`]);
  }
  if (advice.nonStacking && cand.card !== undefined && o.inPlay?.(cand.card, view)) return out(k, 'non-stacking', 0, []);
  const used = cand.card === undefined ? 0 : (o.memory.uses[cand.card] ?? 0);
  const free = (o.profile.runawayFree as number | undefined) ?? PIPELINE.runawayFree;
  if (used >= free && !rand.chance(((o.profile.runawayDecay as number | undefined) ?? PIPELINE.runawayDecay) ** used)) return out(k, 'runaway', 0, [`used ${String(used)} times`]);
  let score = advice.priority ?? 0;
  const lines: string[] = advice.priority ? [`priority ${String(advice.priority)}`] : [];
  for (const [i, verb] of (cand.verbs ?? []).entries()) {
    const row = o.handlers[verb];
    const sub = i > 0;
    if (row === undefined) return out(k, 'missing-logic', 0, [`no handler for ${verb}`]);
    if (row === 'never') return out(k, sub ? 'drawback' : 'cannot-use', 0, [`${verb}: never`]);
    if (row === 'always') continue;
    const ctx: Ctx<V, P> = { view, cand, advice, profile: o.profile, memory: o.memory, rand, timing, verb, sub };
    const v = row.judge?.(ctx) ?? 0;
    const d: Verdict = typeof v === 'number' ? { reason: 'will-play', score: v } : v;
    if (REASONS[d.reason] !== 'play') return out(k, sub && REASONS[d.reason] === 'never' ? 'drawback' : d.reason, 0, [`${verb}: ${d.reason}`, ...(d.lines ?? [])]);
    if (row.cost && !row.cost(ctx)) return out(k, 'cant-afford', 0, [`${verb}: cost`]);
    score += d.score ?? 0;
    lines.push(`${verb} ${String(d.score ?? 0)}`, ...(d.lines ?? []));
  }
  const e = o.score?.(cand, view);
  if (typeof e === 'number') {
    score += e;
    lines.push(`score ${String(e)}`);
  } else if (e) {
    score += e.total;
    lines.push(...e.lines);
  }
  return out(k, 'will-play', score, lines);
}

/** Why the opponent chose what it chose; the game keeps these by step and opens one from a log line. */
export interface DecisionRecord {
  readonly opponent: string;
  readonly step?: number;
  readonly prompt?: number;
  readonly timing: string;
  readonly index: number;
  readonly key: string;
  readonly reason: Reason;
  /** Nothing was worth playing and no pass was offered: the best of the rest was taken. */
  readonly forced?: boolean;
  /** The plan step that matched no option (the plan was dropped). */
  readonly planMiss?: string;
  readonly candidates: readonly Judged[];
}

export interface PickOptions {
  readonly rand: Rand;
  readonly timing?: string;
  readonly step?: number;
  readonly prompt?: number;
}

/** Picks an index among the legal options (chiriboga's seam): plan first, then the best `play`, then a pass, then the best of the rest. */
export function pick<V, P extends Profile>(o: Opponent<V, P>, view: Redacted<V>, cands: readonly Candidate[], opts: PickOptions): DecisionRecord {
  if (cands.length === 0) throw new Error(`${o.name}: no options`);
  const timing = opts.timing ?? '';
  const base = { opponent: o.name, timing, ...(opts.step === undefined ? {} : { step: opts.step }), ...(opts.prompt === undefined ? {} : { prompt: opts.prompt }) };
  const done = (index: number, reason: Reason, candidates: readonly Judged[], extra: object = {}): DecisionRecord => {
    const c = cands[index] as Candidate;
    if (c.card !== undefined) o.memory.uses[c.card] = (o.memory.uses[c.card] ?? 0) + 1;
    return { ...base, index, key: c.key, reason, candidates, ...extra };
  };
  if (cands.length === 1) return done(0, 'only-option', []);
  let planMiss: string | undefined;
  const step = o.memory.plan[0];
  if (step) {
    const i = cands.findIndex((c) => c.key === step.match);
    const j = i >= 0 ? judge(o, view, cands[i] as Candidate, opts.rand, timing) : undefined;
    if (j?.cls === 'play') {
      o.memory.plan.shift();
      return done(i, 'plan', [out(step.match, 'plan', j.score, [...(step.note === undefined ? [] : [step.note]), ...j.lines])]);
    }
    planMiss = step.match;
    if (j) o.memory.plan.shift();
    else o.memory.plan = [];
  }
  let judged = cands.map((c) => judge(o, view, c, opts.rand, timing));
  for (const p of o.prune ?? []) {
    const drop = p(judged, view);
    judged = judged.map((j) => (drop.includes(j.key) && j.cls === 'play' ? out(j.key, 'pruned', j.score, j.lines) : j));
  }
  const miss = planMiss === undefined ? {} : { planMiss };
  const best = (f: (j: Judged, i: number) => boolean): number => {
    let at = -1;
    judged.forEach((j, i) => {
      if (f(j, i) && (at < 0 || j.score > (judged[at] as Judged).score)) at = i;
    });
    return at;
  };
  const play = best((j) => j.cls === 'play');
  if (play >= 0) return done(play, (judged[play] as Judged).reason, judged, miss);
  const pass = cands.findIndex((c) => c.pass);
  if (pass >= 0) return done(pass, (judged[pass] as Judged).reason, judged, miss);
  const any = best(() => true);
  return done(any, (judged[any] as Judged).reason, judged, { ...miss, forced: true });
}

/** The record as plain lines, for a decision table or a golden. */
export function decisionLines(r: DecisionRecord): string[] {
  const head = `${r.opponent} chose ${r.key} (${r.reason}${r.forced ? ', forced' : ''})${r.timing ? ` at ${r.timing}` : ''}`;
  return [
    head,
    ...(r.planMiss === undefined ? [] : [`plan step ${r.planMiss} matched no option; plan dropped`]),
    ...r.candidates.flatMap((j) => [`${j.key}: ${j.cls} ${j.reason} ${String(j.score)}`, ...j.lines.map((l) => `  ${l}`)]),
  ];
}
/** A log part that opens the record: the game resolves `ref('decision', id)` to its stored record. */
export const decisionPart = (r: DecisionRecord, label = 'why'): Part => ref('decision', `${String(r.step ?? '')}:${String(r.prompt ?? '')}:${r.opponent}`, label);
export const decisionsAt = (records: readonly DecisionRecord[], step: number): DecisionRecord[] => records.filter((r) => r.step === step);

/** Conformance: every effect verb has a row (a handler, `always` or `never`), and no row names an unknown verb. */
export function handlerProblems(verbs: readonly string[], handlers: Readonly<Record<string, unknown>>): string[] {
  return [...verbs.filter((v) => !(v in handlers)).map((v) => `${v}: no opponent handler`), ...Object.keys(handlers).filter((v) => !verbs.includes(v)).map((v) => `${v}: handler for an unknown verb`)];
}

/** The cards the opponent cannot play well: `cannotUse` advice, verbs with no handler or `never`, and `missing-logic` seen in records. */
export function cannotUseReport(
  cards: readonly { readonly id: string; readonly verbs: readonly string[] }[],
  advice: (card: string) => Advice | undefined,
  handlers: Readonly<Record<string, unknown>>,
  records: readonly DecisionRecord[] = [],
): string[] {
  const seen = new Map<string, number>();
  for (const r of records) for (const j of r.candidates) if (j.reason === 'missing-logic') seen.set(j.key, (seen.get(j.key) ?? 0) + 1);
  return [
    ...cards.flatMap((c) => {
      const why = [advice(c.id)?.cannotUse, ...c.verbs.map((v) => (!(v in handlers) ? `no handler for ${v}` : handlers[v] === 'never' ? `${v} is never used` : undefined))].filter((x) => x !== undefined);
      return why.length ? [`${c.id}: ${why.join('; ')}`] : [];
    }),
    ...[...seen].map(([k, n]) => `${k}: missing-logic in ${String(n)} decision(s)`),
  ];
}

export interface Search<S> {
  /** The opponent's own moves from a state; none when its turn is over. */
  moves(s: S): readonly string[];
  apply(s: S, move: string): S | undefined;
  score(s: S): number;
  /** A state key for the cache. */
  key?(s: S): string;
}
export interface LookAhead {
  readonly best: string | undefined;
  readonly score: number;
  readonly nodes: number;
  readonly cut: boolean;
}
/** Bounded look-ahead over the opponent's own moves (Forge depth 3, XMage node cap); the same move again without gain is cut. */
export function lookAhead<S>(s: S, search: Search<S>, caps: { readonly depth?: number; readonly nodes?: number } = {}): LookAhead {
  const depth = caps.depth ?? 3;
  const cap = caps.nodes ?? 5000;
  const cache = new Map<string, number>();
  let nodes = 0;
  let cut = false;
  const value = (st: S, d: number, last: string | undefined, here: number): number => {
    const ck = search.key ? `${search.key(st)}@${String(d)}@${last ?? ''}` : undefined;
    const hit = ck === undefined ? undefined : cache.get(ck);
    if (hit !== undefined) return hit;
    let v = here;
    if (d > 0)
      for (const m of search.moves(st)) {
        if (nodes >= cap) {
          cut = true;
          break;
        }
        const next = search.apply(st, m);
        if (next === undefined) continue;
        nodes += 1;
        const sc = search.score(next);
        if (m === last && sc <= here) continue;
        v = Math.max(v, value(next, d - 1, m, sc));
      }
    if (ck !== undefined) cache.set(ck, v);
    return v;
  };
  let best: string | undefined;
  let top = -Infinity;
  for (const m of search.moves(s)) {
    if (nodes >= cap) {
      cut = true;
      break;
    }
    const next = search.apply(s, m);
    if (next === undefined) continue;
    nodes += 1;
    const v = value(next, depth - 1, m, search.score(next));
    if (v > top) {
      top = v;
      best = m;
    }
  }
  return { best, score: best === undefined ? search.score(s) : top, nodes, cut };
}

/** A sim-pool `Driver`: candidates line up with the legal answers; `reasons()` is the last record's lines. */
export function opponentDriver<St, A, V, P extends Profile>(
  o: Opponent<V, P>,
  game: {
    /** K222: `seat` is the open prompt's (`prompt.seat`), when it has one. */
    view(state: St, seat?: string | number): Redacted<V>;
    candidates(view: Redacted<V>, answers: readonly A[]): readonly Candidate[];
    timing?(view: Redacted<V>): string;
    /** The undo step the record belongs to; default: this driver's count of choices. */
    step?(state: St): number;
  },
  keep?: (r: DecisionRecord) => void,
): { readonly name: string; choose(state: St, answers: readonly A[], rand: Rand): A; reasons(): string[]; last(): DecisionRecord | undefined } {
  let last: DecisionRecord | undefined;
  let n = 0;
  return {
    name: o.name,
    choose(state, answers, rand) {
      const open = (state as { prompt?: { id?: unknown; seat?: string | number } | null }).prompt;
      const view = game.view(state, open?.seat);
      const t = game.timing?.(view);
      const prompt = open?.id;
      const opts = { rand, step: game.step?.(state) ?? n, ...(typeof prompt === 'number' ? { prompt } : {}) };
      n += 1;
      last = pick(o, view, game.candidates(view, answers), t === undefined ? opts : { ...opts, timing: t });
      keep?.(last);
      return answers[last.index] as A;
    },
    reasons: () => (last ? decisionLines(last) : []),
    last: () => last,
  };
}
