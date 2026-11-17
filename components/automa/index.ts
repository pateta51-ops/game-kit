// K272 (T8, G05): an official solo automa: a seeded card deck kept as plain data in the game state, a priority table of
// rules over the legal answers with declared tie-breaks (last one seeded random), and difficulty tiers as data. Ordered
// tie-break picking ported from STCC src/engine/bot/choices.ts (`pickBy`), the empty-deck reshuffle from
// src/engine/bot/deck.ts (`botRefillDeck`); the rest written new.
import type { Bot } from '../sim-pool/index.ts';

/** The automa deck, plain data: lives in the game state, so undo, saves and replays keep it. A drawn card goes to `discard`. */
export interface AutomaDeck<C> {
  draw: C[];
  discard: C[];
  readonly reshuffle: boolean;
  readonly shuffles: number;
}

/** Engine-core's `ctx.rng` (or anything with its `shuffle`). */
export interface ShuffleRng {
  shuffle<T>(xs: readonly T[], name?: string): T[];
}

/** A new deck of `cards`, shuffled with the game's rng. */
export function newAutomaDeck<C>(cards: readonly C[], rng: ShuffleRng, reshuffle = true): AutomaDeck<C> {
  return { draw: rng.shuffle(cards, 'automa'), discard: [], reshuffle, shuffles: 0 };
}

/** Draws the top card (to `discard`); an empty deck reshuffles the discard pile when `reshuffle`, else `card` is null. */
export function drawAutoma<C>(deck: AutomaDeck<C>, rng: ShuffleRng): { card: C | null; deck: AutomaDeck<C> } {
  let d = deck;
  if (d.draw.length === 0 && d.reshuffle && d.discard.length > 0)
    d = { ...d, draw: rng.shuffle(d.discard, 'automa'), discard: [], shuffles: d.shuffles + 1 };
  const [card, ...rest] = d.draw;
  if (card === undefined) return { card: null, deck: d };
  return { card, deck: { ...d, draw: rest, discard: [...d.discard, card] } };
}

/** A tie-break criterion: higher wins. */
export type TieBreak<V, A, K> = (answer: A, view: V, knobs: K) => number;

export interface AutomaRule<V, A, K> {
  readonly id: string;
  /** The rule applies now (default: always). */
  when?(view: V, knobs: K): boolean;
  /** The answers this rule's action takes. None among the legal answers: the rule is unavailable. */
  match(answer: A, view: V, knobs: K): boolean;
  /** Unavailable: go on to the next rule (default) or straight to the table's fallback. */
  readonly onMiss?: 'next' | 'fallback';
  /** Replaces the table's tie-breaks for this rule. */
  readonly tieBreak?: readonly TieBreak<V, A, K>[];
}

export interface AutomaTable<V, A, K> {
  readonly rules: readonly AutomaRule<V, A, K>[];
  readonly tieBreak: readonly TieBreak<V, A, K>[];
  /** The declared fallback; when it matches nothing, every legal answer is a candidate (rule `any`). */
  fallback?(answer: A, view: V, knobs: K): boolean;
}

export interface AutomaDecision<A> {
  readonly answer: A;
  /** The rule id that chose, `fallback` or `any`. */
  readonly rule: string;
  /** Rules that applied but were unavailable, in order. */
  readonly missed: readonly string[];
  /** Candidates left after each tie-break, starting with the rule's candidates. */
  readonly ties: readonly number[];
  readonly random: boolean;
}

/** Walks the table over the legal `answers`; always returns one of them (throws only when there are none). */
export function decideAutoma<V, A, K>(table: AutomaTable<V, A, K>, view: V, answers: readonly A[], knobs: K, rng: { int(n: number): number }): AutomaDecision<A> {
  if (answers.length === 0) throw new Error('decideAutoma: no legal answers');
  const missed: string[] = [];
  const settle = (rule: string, cands: readonly A[], tbs: readonly TieBreak<V, A, K>[]): AutomaDecision<A> => {
    let left = cands;
    const ties = [left.length];
    for (const tb of tbs) {
      if (left.length < 2) break;
      const sc = left.map((a) => tb(a, view, knobs)).map((x) => (Number.isNaN(x) ? -Infinity : x));
      const top = Math.max(...sc);
      left = left.filter((_, i) => sc[i] === top);
      ties.push(left.length);
    }
    const random = left.length > 1;
    return { answer: left[random ? rng.int(left.length) : 0] as A, rule, missed, ties, random };
  };
  for (const r of table.rules) {
    if (r.when && !r.when(view, knobs)) continue;
    const c = answers.filter((a) => r.match(a, view, knobs));
    if (c.length > 0) return settle(r.id, c, r.tieBreak ?? table.tieBreak);
    missed.push(r.id);
    if (r.onMiss === 'fallback') break;
  }
  const f = table.fallback ? answers.filter((a) => table.fallback?.(a, view, knobs) === true) : [];
  return f.length > 0 ? settle('fallback', f, table.tieBreak) : settle('any', answers, table.tieBreak);
}

/** Plain lines for a log or a test: what was unavailable, which rule chose, how the ties went. */
export function automaLines(d: AutomaDecision<unknown>): string[] {
  return [...d.missed.map((m) => `${m}: unavailable`), `${d.rule}: ${d.ties.join(' > ')}${d.random ? ' (random)' : ''}`];
}

/** An automa: deck contents, priority table and numeric knobs, all supplied by the game. */
export interface Automa<C, V, A, K> {
  readonly cards: readonly C[];
  readonly reshuffle: boolean;
  readonly table: AutomaTable<V, A, K>;
  readonly knobs: K;
}

/** A difficulty tier as data: changes the deck, the table and/or the knobs. */
export interface AutomaTier<C, V, A, K> {
  readonly name: string;
  readonly cards?: (cards: readonly C[]) => readonly C[];
  readonly table?: (table: AutomaTable<V, A, K>) => AutomaTable<V, A, K>;
  readonly knobs?: Partial<K>;
  readonly reshuffle?: boolean;
}

export function atTier<C, V, A, K>(base: Automa<C, V, A, K>, tier?: AutomaTier<C, V, A, K>): Automa<C, V, A, K> {
  if (!tier) return base;
  return {
    cards: tier.cards ? tier.cards(base.cards) : base.cards,
    reshuffle: tier.reshuffle ?? base.reshuffle,
    table: tier.table ? tier.table(base.table) : base.table,
    knobs: { ...base.knobs, ...tier.knobs },
  };
}

export type AutomaBot<V, A> = Bot<V, A> & { last(): AutomaDecision<A> | null };

/** The automa's table as a sim-pool `Bot`: plugs into game-store `botOpponent` and sim-pool `botDriver` as is. */
export function automaBot<V, A, K>(name: string, automa: Pick<Automa<unknown, V, A, K>, 'table' | 'knobs'>): AutomaBot<V, A> {
  let last: AutomaDecision<A> | null = null;
  return {
    name,
    choose(view, answers, rng) {
      last = decideAutoma(automa.table, view, answers, automa.knobs, rng);
      return last.answer;
    },
    reasons: () => (last ? automaLines(last) : []),
    last: () => last,
  };
}
