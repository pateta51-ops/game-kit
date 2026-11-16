// Reference mini-game (kit K205; no real game's content). Two seats, a shuffled deck of numbers (0 is wild), hands of 3 kept
// hidden from the other seat. A turn: play a card (pick); a wild asks how much it is worth (amount); then you may draw (may).
// First to the target wins; a seat with no card to play ends the game: the higher score wins, a tie is a draw.
// Card effects are data run through card-language: one verb table gives each verb's handler and its words.
import { draftOf, hashValue, seedRng, type AnswerAction, type Ctx, type Draft, type GameRules, type KernelPrompt, type KernelState } from '../../kit/engine-core/index';
import { describeEffect, effectTasks, posInt, verbHandler, type VerbTable, type VerbTask } from '../../kit/card-language/index';

export type Seat = 0 | 1;
export type RefPrompt = KernelPrompt & { readonly kind: 'pick' | 'amount' | 'may'; readonly seat: Seat };
export interface RefTask { readonly kind: string; readonly answer?: readonly string[] }
export type RefStep = { readonly op: 'score'; readonly points: number } | { readonly op: 'wild'; readonly max: number };
export type RefEvent =
  | { readonly type: 'played'; readonly seat: Seat; readonly card: number; readonly points: number; readonly seq: number }
  | { readonly type: 'drew'; readonly seat: Seat; readonly reveal: true; readonly seq: number };
export interface RefState extends KernelState {
  readonly v: 1;
  readonly options: { readonly seed: string };
  readonly rules: { readonly target: number };
  readonly deck: readonly number[];
  readonly hands: readonly (readonly number[])[];
  readonly scores: readonly number[];
  readonly seat: Seat;
  readonly card: number;
  readonly stack: readonly (RefTask | VerbTask<RefStep>)[];
  readonly prompt: RefPrompt | null;
  readonly result: { readonly winner: Seat | null } | null;
  readonly log: readonly RefEvent[];
}
export interface Ref {
  readonly state: RefState;
  readonly action: AnswerAction;
  readonly task: RefTask | VerbTask<RefStep>;
  readonly prompt: RefPrompt;
  readonly event: RefEvent;
  readonly stamped: never;
  readonly content: { readonly deck: readonly number[]; readonly hand: number; readonly effects: Readonly<Record<string, readonly RefStep[]>> };
  readonly options: { readonly seed: string };
  readonly rules: { readonly target: number };
}

export const CONTENT: Ref['content'] = {
  deck: [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
  hand: 3,
  effects: { 0: [{ op: 'wild', max: 3 }], 1: [{ op: 'score', points: 1 }], 2: [{ op: 'score', points: 2 }], 3: [{ op: 'score', points: 3 }], 4: [{ op: 'score', points: 4 }], 5: [{ op: 'score', points: 5 }] },
};
export const RULES: Ref['rules'] = { target: 12 };

const other = (s: Seat): Seat => (s === 0 ? 1 : 0);
const setHand = (s: Draft<RefState>, seat: Seat, hand: readonly number[]): void => {
  s.hands = s.hands.map((h, i) => (i === seat ? [...hand] : h));
};
const draw = (ctx: Ctx<Ref>, seat: Seat): void => {
  const s = draftOf(ctx);
  const top = s.deck[0];
  if (top === undefined) return;
  s.deck = s.deck.slice(1);
  setHand(s, seat, [...(s.hands[seat] ?? []), top]);
  ctx.emit({ type: 'drew', seat, reveal: true });
};

const turn = (ctx: Ctx<Ref>): void => {
  const s = draftOf(ctx);
  if ((s.hands[s.seat] ?? []).length === 0) draw(ctx, s.seat);
  const hand = s.hands[s.seat] ?? [];
  if (hand.length === 0) {
    const [a = 0, b = 0] = s.scores;
    s.result = { winner: a === b ? null : a > b ? 0 : 1 };
    return;
  }
  ctx.ask({ kind: 'pick', seat: s.seat, min: 1, max: 1, options: hand.map((_, i) => ({ id: `h${String(i)}`, enabled: true })) }, { kind: 'played' });
};

const played = (ctx: Ctx<Ref>, task: RefTask): void => {
  const s = draftOf(ctx);
  const i = Number((task.answer?.[0] ?? 'h0').slice(1));
  const hand = s.hands[s.seat] ?? [];
  s.card = hand[i] ?? 0;
  setHand(s, s.seat, hand.filter((_, j) => j !== i));
  ctx.then(...effectTasks(ctx.content.effects[String(s.card)] ?? []), { kind: 'after' });
};

export const VERBS: VerbTable<Ref, RefStep> = {
  score: {
    fields: { points: posInt },
    run: (ctx, step) => {
      const s = draftOf(ctx);
      s.scores = s.scores.map((n, i) => (i === s.seat ? n + step.points : n));
      ctx.emit({ type: 'played', seat: s.seat, card: s.card, points: step.points });
    },
    text: (step) => `Score ${String(step.points)}.`,
  },
  wild: {
    fields: { max: posInt },
    run: (ctx, step) => {
      ctx.ask({ kind: 'amount', seat: draftOf(ctx).seat, min: 1, max: 1, options: Array.from({ length: step.max }, (_, i) => ({ id: String(i + 1), enabled: true })) }, { kind: 'worth' });
    },
    text: (step) => `Choose 1 to ${String(step.max)} and score that.`,
  },
};
export const cardText = (card: number): string => describeEffect(VERBS, CONTENT.effects[String(card)] ?? []);

const worth = (ctx: Ctx<Ref>, task: RefTask): void => ctx.then(...effectTasks<RefStep, undefined>([{ op: 'score', points: Number(task.answer?.[0] ?? 1) }]));

const after = (ctx: Ctx<Ref>): void => {
  const s = draftOf(ctx);
  if ((s.scores[s.seat] ?? 0) >= s.rules.target) {
    s.result = { winner: s.seat };
    return;
  }
  if (s.deck.length === 0) return ctx.then({ kind: 'next' });
  ctx.ask({ kind: 'may', seat: s.seat, min: 1, max: 1, options: [{ id: 'yes', enabled: (s.hands[s.seat] ?? []).length < 3, why: 'Your hand is full.' }, { id: 'no', enabled: true }] }, { kind: 'drawn' });
};

const drawn = (ctx: Ctx<Ref>, task: RefTask): void => {
  if (task.answer?.[0] === 'yes') draw(ctx, draftOf(ctx).seat);
  ctx.then({ kind: 'next' });
};

const next = (ctx: Ctx<Ref>): void => {
  const s = draftOf(ctx);
  s.seat = other(s.seat);
  ctx.then({ kind: 'turn' });
};

export const GAME: GameRules<Ref> = {
  handlers: { turn, played, worth, after, drawn, next, verb: verbHandler<Ref>(VERBS) },
  blank(options, rules, content): Draft<RefState> {
    const [a, b, c, d] = seedRng(options.seed);
    return { v: 1, options, rules, rng: { a, b, c, d }, deck: [...content.deck], hands: [[], []], scores: [0, 0], seat: 0, card: 0, stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [] };
  },
  setup(ctx) {
    const s = draftOf(ctx);
    const deck = ctx.rng.shuffle(s.deck, 'deal');
    const n = ctx.content.hand;
    s.hands = [deck.slice(0, n), deck.slice(n, 2 * n)];
    s.deck = deck.slice(2 * n);
    ctx.then({ kind: 'turn' });
  },
  contentHash: (content) => hashValue(content),
  invariants: (state, content) =>
    state.deck.length + state.hands.reduce((n, h) => n + h.length, 0) > content.deck.length ? [{ id: 'REF-01', message: 'more cards than the deck' }] : [],
  revealWords: () => 'A card was drawn',
};

/** What one seat sees: its own hand, the other hand's size, its own prompt only. Opponents decide from this alone. */
export interface RefView {
  readonly seat: Seat;
  readonly hand: readonly number[];
  readonly otherHand: number;
  readonly deck: number;
  readonly scores: readonly number[];
  readonly prompt: RefPrompt | null;
  readonly result: RefState['result'];
}
export const viewOf = (s: RefState, seat: Seat): RefView => ({
  seat,
  hand: s.hands[seat] ?? [],
  otherHand: (s.hands[other(seat)] ?? []).length,
  deck: s.deck.length,
  scores: s.scores,
  prompt: s.prompt?.seat === seat ? s.prompt : null,
  result: s.result,
});

/** The simple driver: from the view only. Highest card, the most for a wild, draw while the hand has room. */
export function greedyPicks(v: RefView): string[] {
  const p = v.prompt;
  if (p === null) throw new Error('not this seat to answer');
  if (p.kind === 'amount') return ['3'];
  if (p.kind === 'may') return [p.options.find((o) => o.id === 'yes')?.enabled === true ? 'yes' : 'no'];
  let best = 0;
  v.hand.forEach((c, i) => {
    if ((c === 0 ? 3 : c) > (v.hand[best] === 0 ? 3 : (v.hand[best] ?? 0))) best = i;
  });
  return [`h${String(best)}`];
}
