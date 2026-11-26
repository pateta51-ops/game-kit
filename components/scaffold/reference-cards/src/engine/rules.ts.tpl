// Reference card game (kit K205, K234, K276; no real game's content). Two seats with life; a turn (turn-flow) is phases
// draw (you may draw 2), main (play a card) and end (strike 1). Cards: Jab and Blow hit, Rally boosts hits until end of
// turn (a duration), Ward stays in play and replaces damage to you (a replacement), Mend stays in play and, when you
// take damage, you may heal 1 (a card-declared trigger). State checks after each action: a seat at 0 life loses, a hand
// over 4 sheds its last card. An automa seat flips a mode card each turn. After the last round the higher life wins.
// This synchronous schema parser validates JSON records; it performs no engine I/O.
// eslint-disable-next-line no-restricted-imports -- content-pack requires a zod schema; this is the sole external engine import.
import { z } from 'zod';
import { CARD_RECORDS } from './card-config.ts';
import { addEffect, draftOf, hashValue, seedRng, stateInvariants, sumEffects, timingHandlers, would, type AnswerAction, type Ctx, type Draft, type GameRules, type KernelPrompt, type KernelState, type StateCheck, type TimingConfig } from '../../kit/engine-core/index.ts';
import { describeEffect, effectTasks, posInt, validateEffect, verbHandler, type VerbTable, type VerbTask } from '../../kit/card-language/index.ts';
import { cardPack, inDryRun, type PackEnv, type PackState, type PackStep } from '../../kit/card-language/pack.ts';
import { cardTriggers, validateWhen, type When } from '../../kit/card-language/when.ts';
import { loadText } from '../../kit/content-pack/index.ts';
import { createProbe } from '../../kit/card-harness/probe.ts';
import type { RuntimeCardNote } from '../../kit/card-harness/runtime.ts';
import { cardsIn, locate, moveCard, newZones, seatZone, viewOf as zonesOf, zoneProblems, type ZoneView } from '../../kit/card-zones/index.ts';
import { flowHandlers, startFlow, type FlowConfig, type FlowState } from '../../kit/turn-flow/index.ts';
import { drawAutoma, newAutomaDeck, type AutomaDeck } from '../../kit/automa/index.ts';

export type Seat = '0' | '1';
export const SEATS: readonly Seat[] = ['0', '1'];
export type Level = 'easy' | 'normal' | 'hard';
export type Mode = 'rush' | 'guard';
export const MODES: readonly Mode[] = ['rush', 'guard'];
export type RefPrompt = KernelPrompt & { readonly kind: 'pick' | 'may'; readonly seat: Seat };
export interface RefTask { readonly kind: string; readonly answer?: readonly string[]; readonly line?: string }
export type RefStep = { readonly op: 'hit'; readonly n: number } | { readonly op: 'heal'; readonly n: number } | { readonly op: 'boost'; readonly n: number } | PackStep;
export type RefEvent =
  | { readonly type: 'played'; readonly seat: Seat; readonly card: string; readonly seq: number }
  | { readonly type: 'hurt'; readonly seat: string; readonly n: number; readonly seq: number; readonly batch?: number; readonly occurrence?: number }
  | { readonly type: 'healed' | 'warded' | 'shed'; readonly seat: string; readonly seq: number }
  | { readonly type: 'flip'; readonly seat: Seat; readonly mode: Mode; readonly seq: number }
  | { readonly type: 'drew'; readonly seat: Seat; readonly reveal: true; readonly seq: number };
export interface CardDef { readonly name: string; readonly effect: readonly RefStep[]; readonly stay?: true; readonly when?: readonly When<RefStep>[]; readonly text?: string }
export interface CardRecord extends CardDef { readonly id: string; readonly line: string; readonly copies: number }
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
  readonly content: { readonly cards: Readonly<Record<string, string>>; readonly defs: Readonly<Record<string, CardRecord>>; readonly hand: number };
  readonly options: { readonly seed: string; readonly level: Level; readonly bots: readonly Seat[]; readonly scenario: string };
  readonly rules: { readonly life: Readonly<Record<Seat, number>>; readonly rounds: number };
}

export const BASE_CARDS = CARD_RECORDS;
export const LIMIT = 4;
export const defOf = (id: string, content = CONTENT): CardRecord | undefined => content.defs[content.cards[id] ?? ''];
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
export function loadContent(records: readonly unknown[] = BASE_CARDS): Ref['content'] {
  const loaded = loadText({
    kinds: { card: { schema: z.strictObject({
      id: z.string().min(1), line: z.string().min(1), copies: z.number().int().positive().max(100),
      name: z.string().min(1), effect: z.array(z.unknown()), stay: z.literal(true).optional(),
      when: z.array(z.unknown()).optional(), text: z.string().optional(),
    }) } },
    verbs: VERBS,
    check: (_kind, record) => {
      const card = record as CardRecord;
      // Ward/Mend have no immediate effect: their replacement/trigger runs later.
      return [
        ...(card.effect.length === 0 ? [] : validateEffect(VERBS, card.effect).map(problem => `effect: ${problem}`)),
        ...(card.when === undefined ? [] : validateWhen(VERBS, card.when, { kinds: ['damage'], tests: ['mine'] })),
      ];
    },
  }, { card: { json: JSON.stringify(records) } });
  if (!loaded.ok) throw new Error(loaded.problems.join('\n'));
  const cards = loaded.pack.records.card as readonly CardRecord[];
  const instances = cards.flatMap(card => Array<string>(card.copies).fill(card.id));
  return { cards: Object.fromEntries(instances.map((id, i) => [`c${String(i)}`, id])), defs: Object.fromEntries(cards.map(card => [card.id, card])), hand: 3 };
}
export const CONTENT = loadContent();
export const CARD_PROBE = createProbe<RuntimeCardNote>();
export const cardObservation = (state: RefState) => ({
  life0: state.life[0], life1: state.life[1],
  boost0: sumEffects(state, 'boost', effect => effect.target === '0'),
  boost1: sumEffects(state, 'boost', effect => effect.target === '1'),
  warded: state.log.filter(event => event.type === 'warded').length,
  healed: state.log.filter(event => event.type === 'healed').length,
  ...Object.fromEntries(Object.entries(state.zones).flatMap(([zone, value]) => value.cards.map(card => [`zone:${card}`, zone]))),
});
const clauseNote = (kind: string, id: string | undefined, state: RefState): void => {
  if (id !== undefined && !inDryRun()) CARD_PROBE.note(() => ({ kind, id, observation: cardObservation(state) }));
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
  const d = defOf(id, ctx.content);
  if (d === undefined) throw new Error(`Unknown played card ${id}`);
  moveCard(s, id, d.stay === true ? seatZone('play', seat) : 'discard');
  ctx.emit({ type: 'played', seat, card: d.name });
  if (d.effect.length) ctx.then({ kind: 'clause-begin', line: d.line }, ...effectTasks(d.effect, { seat, source: id, line: d.line }), { kind: 'clause-end', line: d.line });
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
const wardOf = (s: RefState, seat: string, content: Ref['content']): string | undefined => cardsIn(s, seatZone('play', seat)).find((c) => content.cards[c] === 'ward');
const timingFor = (content: Ref['content'], limits: Pick<TimingConfig<Ref>, 'triggerCap'> = {}): TimingConfig<Ref> => ({
  ...limits,
  happen: (ctx, o) => void (pack.happen(ctx, o) || (o.kind === 'damage' && life(ctx, o.keys.player ?? '', -(o.amount ?? 0)))),
  event: (o) => (o.kind === 'damage' ? { type: 'hurt', seat: o.keys.player ?? '', n: o.amount ?? 0 } : undefined),
  replacementsFor: (s, o) => {
    if (o.kind === 'damage') clauseNote('clause-attempt', content.defs.ward?.line, s);
    const w = o.kind === 'damage' ? wardOf(s, o.keys.player ?? '', content) : undefined;
    return w === undefined ? [] : [{ id: Number(w.slice(1)), controller: o.keys.player ?? '', cls: 1, label: 'Ward' }];
  },
  applyReplacement: (ctx, r) => {
    const line = defOf(`c${String(r.id)}`, ctx.content)?.line;
    clauseNote('clause-begin', line, ctx.s);
    moveCard(draftOf(ctx), `c${String(r.id)}`, 'discard');
    ctx.emit({ type: 'warded', seat: r.controller });
    clauseNote('clause', line, ctx.s);
    clauseNote('clause-end', line, ctx.s);
    return 'replaced';
  },
  ...cardTriggers<Ref>({ pool: content.defs, player: (s, c) => locate(s, c)?.zone.split(':')[1] ?? '', defOf: (_s, c) => content.cards[c] ?? '',
    env: (_s, source, seat) => ({ seat, source, line: defOf(source, content)?.line, triggered: true }),
    tests: { mine: (_s, env, o) => o.keys.player === env.seat }, table: VERBS }),
  checkpoint: { checks: CHECKS },
});
export const TIMING = timingFor(CONTENT);

const zonesFor = (deck: readonly string[], h0: readonly string[] = [], h1: readonly string[] = []) =>
  newZones({ deck: { seen: 'count', cards: deck }, [hand('0')]: { seen: 'owner', owner: '0', cards: h0 }, [hand('1')]: { seen: 'owner', owner: '1', cards: h1 }, 'play:0': { seen: 'all' }, 'play:1': { seen: 'all' }, discard: { seen: 'all' } });
const physicalCards = stateInvariants<RefState, Ref['content']>({ zones: { cards: {
  locations: state => Object.fromEntries(Object.entries(state.zones).map(([id, zone]) => [id, zone.cards])),
  expected: (_state, content) => Object.keys(content.cards),
} } });
const runVerb = verbHandler<Ref>(VERBS);
export function referenceRules(content = CONTENT, limits: Pick<TimingConfig<Ref>, 'triggerCap'> = {}): GameRules<Ref> {
  return {
  handlers: {
    ...flowHandlers(FLOW), played, final, ...timingHandlers<Ref>(content === CONTENT && limits.triggerCap === undefined ? TIMING : timingFor(content, limits)),
    verb(ctx, task) {
      const current = task as VerbTask<RefStep, PackEnv & { readonly line?: string; readonly triggered?: boolean }>;
      const { line, triggered } = current.env ?? {};
      const healing = triggered === true && current.step.op === 'heal';
      if (triggered) clauseNote('clause-attempt', line, ctx.s);
      if (healing) clauseNote('clause-begin', line, ctx.s);
      runVerb(ctx, task);
      if (!triggered || healing) clauseNote('clause', line, ctx.s);
      if (healing) clauseNote('clause-end', line, ctx.s);
    },
    'clause-begin'(ctx, task) {
      if ('line' in task && task.line !== undefined && !inDryRun()) CARD_PROBE.note({ kind: 'clause-begin', id: task.line, observation: cardObservation(ctx.s) });
    },
    'clause-end'(ctx, task) {
      if ('line' in task && task.line !== undefined && !inDryRun()) CARD_PROBE.note({ kind: 'clause-end', id: task.line, observation: cardObservation(ctx.s) });
    },
  },
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
  invariantPolicy: 'strict',
  invariants: (state, data, events, prev) => [...zoneProblems(state, Object.keys(data.cards).length).map((message) => ({ id: 'REF-01', message })), ...physicalCards(state, data, events, prev)],
  revealWords: () => 'A card was drawn',
  };
}
export const GAME = referenceRules();

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
