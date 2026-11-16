// Reference mini-game (kit K205, widened K234; no real game's content). Two seats, a shuffled deck of numbers (0 is wild)
// in card-zones, hands of 3 kept hidden from the other seat. A turn: play a card (pick) to the discard; its effect runs
// through card-language (a wild asks how much it is worth: an asking verb with resume); then you may draw (the pack's
// `may` and `draw`). First to the target wins; a seat with no card to play ends the game: the higher score wins, a tie
// is a draw. The game is one `defineGame` object the store, sims, replay-cli and the opponent read.
import { draftOf, hashValue, seedRng, timingHandlers, type AnswerAction, type Ctx, type Draft, type GameRules, type KernelPrompt, type KernelState } from '../../kit/engine-core/index.ts';
import { askVerb, describeEffect, effectTasks, posInt, verbHandler, type VerbTable, type VerbTask } from '../../kit/card-language/index.ts';
import { cardPack, type PackEnv, type PackState, type PackStep } from '../../kit/card-language/pack.ts';
import { cardsIn, moveCard, newZones, seatZone, viewOf as zonesOf, zoneProblems, type ZoneView } from '../../kit/card-zones/index.ts';
import { autoAnswer } from '../../kit/prompt-host/index.ts';
import { defineGame } from '../../kit/game-store/index.ts';

export type Seat = '0' | '1';
export const SEATS: readonly Seat[] = ['0', '1'];
export type RefPrompt = KernelPrompt & { readonly kind: 'pick' | 'amount' | 'may'; readonly seat: Seat };
export interface RefTask { readonly kind: string; readonly answer?: readonly string[] }
export type RefStep = { readonly op: 'score'; readonly points: number } | { readonly op: 'wild'; readonly max: number } | PackStep;
export type RefEvent =
  | { readonly type: 'played'; readonly seat: Seat; readonly card: number; readonly points: number; readonly seq: number }
  | { readonly type: 'drew'; readonly seat: Seat; readonly reveal: true; readonly seq: number };
export interface RefState extends KernelState, PackState {
  readonly v: 1;
  readonly options: { readonly seed: string };
  readonly rules: { readonly target: number };
  readonly scores: Readonly<Record<Seat, number>>;
  readonly seat: Seat;
  readonly card: string;
  readonly stack: readonly (RefTask | VerbTask<RefStep, PackEnv>)[];
  readonly prompt: RefPrompt | null;
  readonly result: { readonly winner: Seat | null } | null;
  readonly log: readonly RefEvent[];
}
export interface Ref {
  readonly state: RefState;
  readonly action: AnswerAction;
  readonly task: RefTask | VerbTask<RefStep, PackEnv>;
  readonly prompt: RefPrompt;
  readonly event: RefEvent;
  readonly stamped: never;
  readonly content: { readonly cards: Readonly<Record<string, number>>; readonly hand: number; readonly effects: Readonly<Record<string, readonly RefStep[]>> };
  readonly options: { readonly seed: string };
  readonly rules: { readonly target: number };
}

const values = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5];
export const CONTENT: Ref['content'] = {
  cards: Object.fromEntries(values.map((v, i) => [`c${String(i)}`, v])),
  hand: 3,
  effects: { 0: [{ op: 'wild', max: 3 }], 1: [{ op: 'score', points: 1 }], 2: [{ op: 'score', points: 2 }], 3: [{ op: 'score', points: 3 }], 4: [{ op: 'score', points: 4 }], 5: [{ op: 'score', points: 5 }] },
};
export const RULES: Ref['rules'] = { target: 12 };
const hand = (seat: Seat): string => seatZone('hand', seat);
const other = (s: Seat): Seat => (s === '0' ? '1' : '0');

const pack = cardPack<Ref>({
  moved: (ctx, m) => void (m.op === 'draw' && ctx.emit({ type: 'drew', seat: m.seat as Seat, reveal: true })),
  prompt: (base) => base as Omit<RefPrompt, 'id'>,
  table: () => VERBS,
});
const score = (ctx: Ctx<Ref>, points: number): void => {
  const s = draftOf(ctx);
  s.scores = { ...s.scores, [s.seat]: s.scores[s.seat] + points };
  ctx.emit({ type: 'played', seat: s.seat, card: ctx.content.cards[s.card] ?? 0, points });
};
export const VERBS: VerbTable<Ref, RefStep, PackEnv> = {
  ...pack.verbs,
  score: { fields: { points: posInt }, run: (ctx, step) => score(ctx, step.points), text: (step) => `Score ${String(step.points)}.` },
  wild: {
    fields: { max: posInt },
    run: (ctx, step, env) => askVerb(ctx, { kind: 'amount', seat: draftOf(ctx).seat, min: 1, max: 1, options: Array.from({ length: step.max }, (_, i) => ({ id: String(i + 1), enabled: true })) }, step, env),
    resume: (ctx, _step, _env, answer) => score(ctx, Number(answer[0] ?? 1)),
    text: (step) => `Choose 1 to ${String(step.max)} and score that.`,
  },
};
export const cardText = (value: number): string => describeEffect(VERBS, CONTENT.effects[String(value)] ?? []);
const DRAW: readonly RefStep[] = [{ op: 'may', then: [{ op: 'draw' }] }];

const turn = (ctx: Ctx<Ref>): void => {
  const s = draftOf(ctx);
  if (cardsIn(s, hand(s.seat)).length === 0 && cardsIn(s, 'deck').length > 0) {
    moveCard(s, cardsIn(s, 'deck')[0] ?? '', hand(s.seat), 'bottom');
    ctx.emit({ type: 'drew', seat: s.seat, reveal: true });
  }
  const cards = cardsIn(s, hand(s.seat));
  if (cards.length === 0) {
    const { 0: a, 1: b } = s.scores;
    s.result = { winner: a === b ? null : a > b ? '0' : '1' };
    return;
  }
  ctx.ask({ kind: 'pick', seat: s.seat, min: 1, max: 1, options: cards.map((id) => ({ id, enabled: true })) }, { kind: 'played' });
};

const played = (ctx: Ctx<Ref>, task: RefTask): void => {
  const s = draftOf(ctx);
  s.card = task.answer?.[0] ?? '';
  moveCard(s, s.card, 'discard');
  ctx.then(...effectTasks(ctx.content.effects[String(ctx.content.cards[s.card] ?? 0)] ?? [], { seat: s.seat, source: s.card }), { kind: 'after' });
};

const after = (ctx: Ctx<Ref>): void => {
  const s = draftOf(ctx);
  if (s.scores[s.seat] >= s.rules.target) {
    s.result = { winner: s.seat };
    return;
  }
  ctx.then(...(cardsIn(s, 'deck').length > 0 && cardsIn(s, hand(s.seat)).length < 3 ? effectTasks(DRAW, { seat: s.seat }) : []), { kind: 'next' });
};

const next = (ctx: Ctx<Ref>): void => {
  const s = draftOf(ctx);
  s.seat = other(s.seat);
  ctx.then({ kind: 'turn' });
};

export const GAME: GameRules<Ref> = {
  handlers: { turn, played, after, next, verb: verbHandler<Ref>(VERBS), ...timingHandlers<Ref>({ happen: (ctx, o) => void pack.happen(ctx, o) }) },
  blank(options, rules, content): Draft<RefState> {
    const [a, b, c, d] = seedRng(options.seed);
    const zones = newZones({ deck: { seen: 'count', cards: Object.keys(content.cards) }, [hand('0')]: { seen: 'owner', owner: '0' }, [hand('1')]: { seen: 'owner', owner: '1' }, discard: { seen: 'all' } });
    return { v: 1, options, rules, rng: { a, b, c, d }, zones: zones as Draft<RefState['zones']>, scores: { 0: 0, 1: 0 }, seat: '0', card: '', stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [] };
  },
  setup(ctx) {
    const s = draftOf(ctx);
    const deck = ctx.rng.shuffle(cardsIn(s, 'deck'), 'deal');
    const n = ctx.content.hand;
    s.zones = newZones({ deck: { seen: 'count', cards: deck.slice(2 * n) }, [hand('0')]: { seen: 'owner', owner: '0', cards: deck.slice(0, n) }, [hand('1')]: { seen: 'owner', owner: '1', cards: deck.slice(n, 2 * n) }, discard: { seen: 'all' } }) as Draft<RefState['zones']>;
    ctx.then({ kind: 'turn' });
  },
  contentHash: (content) => hashValue(content),
  invariants: (state, content) => zoneProblems(state, Object.keys(content.cards).length).map((message) => ({ id: 'REF-01', message })),
  revealWords: () => 'A card was drawn',
};

/** What one seat sees (card-zones `viewOf`: the other hand is backs), its scores and its own prompt. Opponents decide from this alone. */
export interface RefView {
  readonly seat: Seat;
  readonly zones: Readonly<Record<string, ZoneView>>;
  readonly hand: readonly string[];
  readonly scores: RefState['scores'];
  readonly prompt: RefPrompt | null;
  readonly result: RefState['result'];
}
export const viewOf = (s: RefState, seat: Seat): RefView => {
  const zones = zonesOf(s, seat);
  return { seat, zones, hand: (zones[hand(seat)]?.cards ?? []).filter((c): c is string => c !== null), scores: s.scores, prompt: s.prompt?.seat === seat ? s.prompt : null, result: s.result };
};
const worth = (id: string): number => {
  const v = CONTENT.cards[id] ?? 0;
  return v === 0 ? 3 : v;
};

/** The simple opponent: from the view only. Highest card, the most for a wild, always draw. */
export function greedyPicks(v: RefView, p: RefPrompt): string[] {
  if (p.kind === 'amount') return [p.options.at(-1)?.id ?? '1'];
  if (p.kind === 'may') return ['yes'];
  return [v.hand.reduce((best, c) => (worth(c) > worth(best) ? c : best), v.hand[0] ?? '')];
}

export const WORDS = { played: 'Seat {seat} scores {points}.', drew: 'Seat {seat} draws a card.' };
export const REF = defineGame<Ref, RefView, Seat>({
  rules: GAME,
  content: CONTENT,
  seats: SEATS,
  start: (seed) => ({ options: { seed }, rules: RULES }),
  view: viewOf,
  forced: (p) => autoAnswer(p, true),
  opponent: greedyPicks,
  words: WORDS,
});
