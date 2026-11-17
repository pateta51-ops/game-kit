// Reference card game (kit K205, K234, K276; no real game's content). Two seats with life; a turn (turn-flow) is phases
// draw (you may draw 2), main (play a card) and end (strike 1). Cards: Jab and Blow hit, Rally boosts hits until end of
// turn (a duration), Ward stays in play and replaces damage to you (a replacement), Mend stays in play and, when you
// take damage, you may heal 1 (a card-declared trigger). State checks after each action: a seat at 0 life loses, a hand
// over 4 sheds its last card. An automa seat flips a mode card each turn. After the last round the higher life wins.
import { addEffect, draftOf, hashValue, seedRng, sumEffects, timingHandlers, would, type AnswerAction, type Ctx, type Draft, type GameRules, type KernelPrompt, type KernelState, type StateCheck, type TimingConfig } from '../../kit/engine-core/index.ts';
import { describeEffect, effectTasks, posInt, verbHandler, type VerbTable, type VerbTask } from '../../kit/card-language/index.ts';
import { cardPack, type PackEnv, type PackState, type PackStep } from '../../kit/card-language/pack.ts';
import { cardTriggers, type When } from '../../kit/card-language/when.ts';
import { cardsIn, locate, moveCard, newZones, seatZone, viewOf as zonesOf, zoneProblems, type ZoneView } from '../../kit/card-zones/index.ts';
import { flowHandlers, startFlow, type FlowConfig, type FlowState } from '../../kit/turn-flow/index.ts';
import { drawAutoma, newAutomaDeck, type AutomaDeck } from '../../kit/automa/index.ts';

export type Seat = '0' | '1';
export const SEATS: readonly Seat[] = ['0', '1'];
export type Level = 'easy' | 'normal' | 'hard';
export type Mode = 'rush' | 'guard';
export const MODES: readonly Mode[] = ['rush', 'guard'];
export type RefPrompt = KernelPrompt & { readonly kind: 'pick' | 'may'; readonly seat: Seat };
export interface RefTask { readonly kind: string; readonly answer?: readonly string[] }
export type RefStep = { readonly op: 'hit'; readonly n: number } | { readonly op: 'heal'; readonly n: number } | { readonly op: 'boost'; readonly n: number } | PackStep;
export type RefEvent =
  | { readonly type: 'played'; readonly seat: Seat; readonly card: string; readonly seq: number }
  | { readonly type: 'hurt'; readonly seat: string; readonly n: number; readonly seq: number; readonly batch?: number; readonly occurrence?: number }
  | { readonly type: 'healed' | 'warded' | 'shed'; readonly seat: string; readonly seq: number }
  | { readonly type: 'flip'; readonly seat: Seat; readonly mode: Mode; readonly seq: number }
  | { readonly type: 'drew'; readonly seat: Seat; readonly reveal: true; readonly seq: number };
export interface CardDef { readonly name: string; readonly effect: readonly RefStep[]; readonly stay?: true; readonly when?: readonly When<RefStep>[]; readonly text?: string }
export interface RefState extends KernelState, PackState {
  readonly v: 1;
  readonly options: Ref['options'];
  readonly rules: Ref['rules'];
  readonly life: Readonly<Record<Seat, number>>;
  readonly mode: Mode | null;
  readonly automa: AutomaDeck<Mode> | null;
  readonly flow?: FlowState;
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
  readonly content: { readonly cards: Readonly<Record<string, string>>; readonly defs: Readonly<Record<string, CardDef>>; readonly hand: number };
  readonly options: { readonly seed: string; readonly level: Level; readonly bots: readonly Seat[]; readonly scenario: string };
  readonly rules: { readonly life: Readonly<Record<Seat, number>>; readonly rounds: number };
}

const DEFS: Record<string, CardDef> = {
  jab: { name: 'Jab', effect: [{ op: 'hit', n: 2 }] },
  blow: { name: 'Blow', effect: [{ op: 'hit', n: 3 }] },
  rally: { name: 'Rally', effect: [{ op: 'boost', n: 2 }] },
  ward: { name: 'Ward', effect: [], stay: true, text: 'If you would take damage, instead discard this.' },
  mend: { name: 'Mend', effect: [], stay: true, when: [{ on: 'damage', if: 'mine', optional: true, then: [{ op: 'heal', n: 1 }] }] },
};
const list = ['jab', 'blow', 'rally', 'ward', 'mend'].flatMap((d, i) => Array<string>([6, 4, 4, 3, 3][i] ?? 0).fill(d));
export const CONTENT: Ref['content'] = { cards: Object.fromEntries(list.map((d, i) => [`c${String(i)}`, d])), defs: DEFS, hand: 3 };
export const LIMIT = 4;
export const defOf = (id: string): CardDef | undefined => CONTENT.defs[CONTENT.cards[id] ?? ''];
const hand = (seat: string): string => seatZone('hand', seat);
export const other = (s: string): Seat => (s === '0' ? '1' : '0');

const pack = cardPack<Ref>({
  moved: (ctx, m) => void (m.op === 'draw' && ctx.emit({ type: 'drew', seat: m.seat as Seat, reveal: true })),
  prompt: (base) => base as Omit<RefPrompt, 'id'>,
  table: () => VERBS,
});
const life = (ctx: Ctx<Ref>, seat: string, n: number): void => {
  const s = draftOf(ctx);
  s.life = { ...s.life, [seat]: s.life[seat as Seat] + n };
};
export const VERBS: VerbTable<Ref, RefStep, PackEnv> = {
  ...pack.verbs,
  hit: {
    fields: { n: posInt },
    run: (ctx, step, env) => void would(ctx, [{ kind: 'damage', keys: { player: other(env?.seat ?? '') }, amount: step.n + sumEffects(ctx.s, 'boost', (e) => e.target === env?.seat) }]),
    text: (step) => `Deal ${String(step.n)} damage.`,
  },
  heal: {
    fields: { n: posInt },
    run: (ctx, step, env) => {
      life(ctx, env?.seat ?? '', step.n);
      ctx.emit({ type: 'healed', seat: env?.seat ?? '' });
    },
    text: (step) => `Heal ${String(step.n)}.`,
  },
  boost: {
    fields: { n: posInt },
    run: (ctx, step, env) => void addEffect(ctx, { kind: 'boost', source: env?.source ?? '', target: env?.seat ?? '', value: step.n, duration: { until: 'endOfTurn' } }),
    text: (step) => `Until end of turn, your hits deal ${String(step.n)} more.`,
  },
};
export const cardText = (d: string): string => {
  const c = CONTENT.defs[d];
  if (c === undefined) return '';
  const w = (c.when ?? []).map((x) => `When you take damage, ${x.optional === true ? 'you may: ' : ''}${describeEffect(VERBS, x.then)}`);
  return [describeEffect(VERBS, c.effect), c.stay === true ? 'Stays in play.' : '', c.text ?? '', ...w].filter((x) => x !== '').join(' ');
};
const DRAW: readonly RefStep[] = [{ op: 'may', then: [{ op: 'draw', count: 2 }] }];

const FLOW: FlowConfig<Ref> = {
  phases: [{ id: 'draw' }, { id: 'main' }, { id: 'end' }],
  seats: () => SEATS,
  step(ctx, pos) {
    const s = draftOf(ctx);
    const seat = pos.seat as Seat;
    if (pos.phase === 'draw') {
      if (s.options.bots.includes(seat) && s.automa !== null) {
        const r = drawAutoma(s.automa as AutomaDeck<Mode>, ctx.rng);
        s.automa = r.deck;
        s.mode = r.card;
        if (r.card !== null) ctx.emit({ type: 'flip', seat, mode: r.card });
      }
      if (cardsIn(s, 'deck').length > 0) ctx.then(...effectTasks(DRAW, { seat }));
    } else if (pos.phase === 'main') {
      const cards = cardsIn(s, hand(seat));
      if (cards.length > 0) ctx.ask({ kind: 'pick', seat, min: 1, max: 1, options: cards.map((id) => ({ id, enabled: true })) }, { kind: 'played' });
    } else ctx.then(...effectTasks([{ op: 'hit', n: 1 }], { seat }), ...(pos.round >= s.rules.rounds && seat === '1' ? [{ kind: 'final' }] : []));
  },
};

const played = (ctx: Ctx<Ref>, task: RefTask): void => {
  const s = draftOf(ctx);
  const seat = (s.flow?.seat ?? '0') as Seat;
  const id = task.answer?.[0] ?? '';
  const d = defOf(id);
  moveCard(s, id, d?.stay === true ? seatZone('play', seat) : 'discard');
  ctx.emit({ type: 'played', seat, card: d?.name ?? '' });
  ctx.then(...effectTasks(d?.effect ?? [], { seat, source: id }));
};
const final = (ctx: Ctx<Ref>): void => {
  const s = draftOf(ctx);
  const { 0: a, 1: b } = s.life;
  s.result = { winner: a === b ? null : a > b ? '0' : '1' };
};

export const CHECKS: readonly StateCheck<Ref>[] = [
  {
    name: 'life',
    run(ctx) {
      const s = draftOf(ctx);
      const out = SEATS.filter((x) => s.life[x] <= 0);
      if (out.length === 0 || s.result !== null) return false;
      s.result = { winner: out.length === 2 ? null : other(out[0] ?? '0') };
      return true;
    },
  },
  {
    name: 'hand',
    run(ctx) {
      const s = draftOf(ctx);
      const seat = SEATS.find((x) => cardsIn(s, hand(x)).length > LIMIT);
      if (seat === undefined) return false;
      moveCard(s, cardsIn(s, hand(seat)).at(-1) ?? '', 'discard');
      ctx.emit({ type: 'shed', seat });
      return true;
    },
  },
];
const wardOf = (s: RefState, seat: string): string | undefined => cardsIn(s, seatZone('play', seat)).find((c) => CONTENT.cards[c] === 'ward');
export const TIMING: TimingConfig<Ref> = {
  happen: (ctx, o) => void (pack.happen(ctx, o) || (o.kind === 'damage' && life(ctx, o.keys.player ?? '', -(o.amount ?? 0)))),
  event: (o) => (o.kind === 'damage' ? { type: 'hurt', seat: o.keys.player ?? '', n: o.amount ?? 0 } : undefined),
  replacementsFor: (s, o) => {
    const w = o.kind === 'damage' ? wardOf(s, o.keys.player ?? '') : undefined;
    return w === undefined ? [] : [{ id: Number(w.slice(1)), controller: o.keys.player ?? '', cls: 1, label: 'Ward' }];
  },
  applyReplacement: (ctx, r) => {
    moveCard(draftOf(ctx), `c${String(r.id)}`, 'discard');
    ctx.emit({ type: 'warded', seat: r.controller });
    return 'replaced';
  },
  ...cardTriggers<Ref>({ pool: DEFS, player: (s, c) => locate(s, c)?.zone.split(':')[1] ?? '', defOf: (_s, c) => CONTENT.cards[c] ?? '', tests: { mine: (_s, env, o) => o.keys.player === env.seat }, table: VERBS }),
  checkpoint: { checks: CHECKS },
};

const zonesFor = (deck: readonly string[], h0: readonly string[] = [], h1: readonly string[] = []) =>
  newZones({ deck: { seen: 'count', cards: deck }, [hand('0')]: { seen: 'owner', owner: '0', cards: h0 }, [hand('1')]: { seen: 'owner', owner: '1', cards: h1 }, 'play:0': { seen: 'all' }, 'play:1': { seen: 'all' }, discard: { seen: 'all' } });
export const GAME: GameRules<Ref> = {
  handlers: { ...flowHandlers(FLOW), played, final, verb: verbHandler<Ref>(VERBS), ...timingHandlers<Ref>(TIMING) },
  blank(options, rules, content): Draft<RefState> {
    const [a, b, c, d] = seedRng(options.seed);
    return { v: 1, options, rules, rng: { a, b, c, d }, zones: zonesFor(Object.keys(content.cards)) as Draft<RefState['zones']>, life: rules.life, mode: null, automa: null, stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [] } as unknown as Draft<RefState>;
  },
  setup(ctx) {
    const s = draftOf(ctx);
    const deck = ctx.rng.shuffle(cardsIn(s, 'deck'), 'deal');
    const n = ctx.content.hand;
    s.zones = zonesFor(deck.slice(2 * n), deck.slice(0, n), deck.slice(n, 2 * n)) as Draft<RefState['zones']>;
    s.automa = newAutomaDeck(MODES, ctx.rng);
    startFlow(ctx);
  },
  contentHash: (content) => hashValue(content),
  invariants: (state, content) => zoneProblems(state, Object.keys(content.cards).length).map((message) => ({ id: 'REF-01', message })),
  revealWords: () => 'A card was drawn',
};

/** What one seat sees (card-zones `viewOf`: the other hand is backs), life, the automa's flipped mode and its own prompt. Opponents decide from this alone. */
export interface RefView {
  readonly seat: Seat;
  readonly level: Level;
  readonly zones: Readonly<Record<string, ZoneView>>;
  readonly hand: readonly string[];
  readonly life: RefState['life'];
  readonly mode: Mode | null;
  readonly prompt: RefPrompt | null;
  readonly result: RefState['result'];
}
export const viewOf = (s: RefState, seat: Seat): RefView => {
  const zones = zonesOf(s, seat);
  return { seat, level: s.options.level, zones, hand: (zones[hand(seat)]?.cards ?? []).filter((c): c is string => c !== null), life: s.life, mode: s.mode, prompt: s.prompt?.seat === seat ? s.prompt : null, result: s.result };
};

export const WORDS = { played: 'Seat {seat} plays {card}.', hurt: 'Seat {seat} takes {n} damage.', healed: 'Seat {seat} heals.', warded: 'Seat {seat} discards a Ward instead.', shed: 'Seat {seat} sheds a card.', flip: 'The automa flips {mode}.', drew: 'Seat {seat} draws a card.' };
