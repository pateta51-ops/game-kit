import { describe, expect, it } from 'vitest';
import { draftOf, hashValue, seedRng, type AnswerAction, type Ctx, type GameRules, type KernelPrompt, type KernelState } from '../engine-core/index.ts';
import { botDriver, DriverRng, playOne, type Bot, type SimGame } from '../sim-pool/index.ts';
import { atTier, automaBot, automaLines, decideAutoma, drawAutoma, newAutomaDeck, type Automa, type AutomaDecision, type AutomaDeck, type AutomaTier } from './index.ts';

// A small fake game: five slots of values 0..5 (0 = empty); each turn the automa reveals a card and takes a slot or passes.
type Card = { readonly mode: 'big' | 'slot' | 'low'; readonly slot: number };
interface PickState extends KernelState {
  readonly options: { readonly seed: string };
  readonly turn: number;
  readonly score: number;
  readonly slots: readonly number[];
  readonly deck: AutomaDeck<Card>;
  readonly card: Card | null;
  readonly result: { readonly score: number } | null;
}
interface PickGame {
  readonly state: PickState;
  readonly action: AnswerAction;
  readonly task: { readonly kind: string; readonly answer?: readonly string[] };
  readonly prompt: KernelPrompt;
  readonly event: { readonly type: string; readonly seq: number };
  readonly stamped: string;
  readonly content: { readonly cards: readonly Card[]; readonly reshuffle: boolean };
  readonly options: { readonly seed: string };
  readonly rules: null;
}
type View = { readonly slots: readonly number[]; readonly card: Card | null };
type Knobs = { readonly big: number };

const turn = (ctx: Ctx<PickGame>): void => {
  const s = draftOf(ctx);
  if (s.turn >= 10) {
    s.result = { score: s.score };
    return;
  }
  s.turn += 1;
  s.slots = s.slots.map((v) => (v > 0 ? v : ctx.rng.int(2) * ctx.rng.int(6)));
  const { card, deck } = drawAutoma(s.deck, ctx.rng);
  s.deck = deck;
  s.card = card;
  ctx.then({ kind: 'chosen' });
  ctx.ask({ min: 1, max: 1, options: [...s.slots.map((v, i) => ({ id: `take:${String(i)}`, enabled: v > 0 })), { id: 'pass', enabled: true }] });
};

const PICK: GameRules<PickGame> = {
  handlers: {
    turn,
    chosen(ctx, task) {
      const s = draftOf(ctx);
      const p = task.answer?.[0] ?? 'pass';
      if (p !== 'pass') {
        const i = Number(p.slice(5));
        s.score += s.slots[i] ?? 0;
        s.slots = s.slots.map((v, j) => (j === i ? 0 : v));
      }
      ctx.then({ kind: 'turn' });
    },
  },
  blank(options, _rules, _content) {
    const [a, b, c, d] = seedRng(options.seed);
    return { options, rng: { a, b, c, d }, turn: 0, score: 0, slots: [0, 0, 0, 0, 0], deck: { draw: [], discard: [], reshuffle: true, shuffles: 0 }, card: null, stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [] };
  },
  setup(ctx) {
    draftOf(ctx).deck = newAutomaDeck(ctx.content.cards, ctx.rng, ctx.content.reshuffle);
    ctx.then({ kind: 'turn' });
  },
  contentHash: (c) => hashValue(c),
};

const slotOf = (a: AnswerAction): number => (a.picks[0]?.startsWith('take:') ? Number(a.picks[0].slice(5)) : -1);
const valueOf = (a: AnswerAction, v: View): number => v.slots[slotOf(a)] ?? 0;

const BASE: Automa<Card, View, AnswerAction, Knobs> = {
  cards: [{ mode: 'big', slot: 0 }, { mode: 'slot', slot: 2 }, { mode: 'low', slot: 0 }],
  reshuffle: true,
  knobs: { big: 4 },
  table: {
    rules: [
      { id: 'big', when: (v) => v.card?.mode === 'big', match: (a, v, k) => valueOf(a, v) >= k.big },
      { id: 'slot', when: (v) => v.card?.mode === 'slot', match: (a, v) => slotOf(a) === v.card?.slot, onMiss: 'fallback' },
      { id: 'low', when: (v) => v.card?.mode !== 'slot', match: (a, v) => slotOf(a) >= 0 && valueOf(a, v) <= 2, tieBreak: [(a) => -slotOf(a)] },
    ],
    tieBreak: [(a, v) => valueOf(a, v)],
    fallback: (a) => slotOf(a) >= 0,
  },
};

const view = (s: PickState): View => ({ slots: s.slots, card: s.card });

function sim(automa: Automa<Card, View, AnswerAction, Knobs>, seen: AutomaDecision<AnswerAction>[]): SimGame<PickGame> {
  const bot = automaBot('automa', automa);
  const spy: Bot<View, AnswerAction> = {
    name: bot.name,
    choose(v, answers, rng) {
      const a = bot.choose(v, answers, rng);
      expect(answers).toContain(a);
      seen.push(bot.last() as AutomaDecision<AnswerAction>);
      return a;
    },
  };
  return {
    rules: PICK,
    content: () => ({ cards: automa.cards, reshuffle: automa.reshuffle }),
    start: (spec) => ({ options: { seed: spec.seed }, rules: null }),
    driver: () => botDriver<PickGame, View>(spy, (s) => view(s)),
    summary: (s) => ({ shuffles: s.deck.shuffles }),
  };
}

const play = (automa: Automa<Card, View, AnswerAction, Knobs>, seen: AutomaDecision<AnswerAction>[] = []) => {
  const g = sim(automa, seen);
  const content = { cards: automa.cards, reshuffle: automa.reshuffle };
  return Array.from({ length: 100 }, (_, i) => playOne(g, content, { index: i, seed: `automa-${String(i)}`, driver: 'automa' }));
};

describe('automa (K272)', () => {
  it('K272: 100 seeded games through botDriver, always a legal answer, every fallback path hit', () => {
    const seen: AutomaDecision<AnswerAction>[] = [];
    const recs = play(BASE, seen);
    expect(recs.every((r) => r.error === undefined && r.result !== null)).toBe(true);
    expect(seen.some((d) => d.missed.length > 0)).toBe(true); // rule unavailable
    expect(seen.some((d) => d.missed.includes('big') && d.rule === 'low')).toBe(true); // next rule
    expect(seen.some((d) => d.missed.includes('slot') && d.rule === 'fallback')).toBe(true); // declared fallback
    expect(seen.some((d) => d.rule === 'any')).toBe(true);
    expect(seen.some((d) => d.ties.length > 1 && (d.ties[1] as number) < (d.ties[0] as number))).toBe(true); // tie-break
    expect(seen.some((d) => d.random)).toBe(true); // seeded random last tie-break
    expect(recs.every((r) => (r.summary as { shuffles: number }).shuffles > 0)).toBe(true); // deck reshuffle
  });

  it('K272: the same seed gives the same games', () => {
    expect(play(BASE).map((r) => r.hash)).toEqual(play(BASE).map((r) => r.hash));
  });

  it('K272: a deck without reshuffle runs out (card null), the table still answers', () => {
    const seen: AutomaDecision<AnswerAction>[] = [];
    const recs = play({ ...BASE, reshuffle: false }, seen);
    expect(recs.every((r) => r.error === undefined && (r.summary as { shuffles: number }).shuffles === 0)).toBe(true);
    const rng = { shuffle: <T,>(xs: readonly T[]) => [...xs] };
    const d = drawAutoma(drawAutoma(newAutomaDeck([1], rng, false), rng).deck, rng);
    expect(d).toEqual({ card: null, deck: { draw: [], discard: [1], reshuffle: false, shuffles: 0 } });
  });

  it('K272: a tier changes deck, table and knobs as data', () => {
    const hard: AutomaTier<Card, View, AnswerAction, Knobs> = {
      name: 'hard',
      cards: (c) => c.filter((x) => x.mode === 'big'),
      knobs: { big: 5 },
      table: (t) => ({ ...t, rules: t.rules.filter((r) => r.id !== 'low') }),
    };
    const a = atTier(BASE, hard);
    expect([a.cards.length, a.knobs.big, a.table.rules.length, atTier(BASE)]).toEqual([1, 5, 2, BASE]);
    const ans = (id: string): AnswerAction => ({ kind: 'answer', promptId: 1, picks: [id] });
    const v: View = { slots: [4, 4, 0, 1, 0], card: { mode: 'big', slot: 0 } };
    const d = decideAutoma(a.table, v, [ans('take:0'), ans('take:1'), ans('take:3'), ans('pass')], a.knobs, new DriverRng('k'));
    expect([d.rule, d.missed, d.ties, d.random]).toEqual(['fallback', ['big'], [3, 2], true]);
    expect(automaLines(d)).toEqual(['big: unavailable', 'fallback: 3 > 2 (random)']);
  });

  it('K272: README example (the README code)', () => {
    type View = { slots: number[]; card: { mode: 'big' | 'low' } | null }
    const value = (a: string, v: View) => (a.startsWith('take:') ? (v.slots[Number(a.slice(5))] ?? 0) : 0)
    const automa: Automa<{ mode: 'big' | 'low' }, View, string, { big: number }> = {
      cards: [{ mode: 'big' }, { mode: 'low' }], reshuffle: true, knobs: { big: 4 },
      table: { rules: [{ id: 'big', when: (v) => v.card?.mode === 'big', match: (a, v, k) => value(a, v) >= k.big }], tieBreak: [(a, v) => value(a, v)], fallback: (a) => a !== 'pass' },
    }
    const bot = automaBot('automa', automa) // game-store botOpponent(bot); sim-pool botDriver(bot, view)
    console.log(bot.choose({ slots: [5, 2], card: { mode: 'big' } }, ['take:0', 'take:1', 'pass'], new DriverRng('s|automa|1')), bot.reasons?.())
    expect(bot.last()?.answer).toBe('take:0');
    expect(bot.reasons?.()).toEqual(['big: 1']);
  });

  it('K272: a NaN tie-break counts as lowest, never empties the candidates', () => {
    const d = decideAutoma({ rules: [], tieBreak: [(a: string) => (a === 'x' ? 1 : NaN)] }, null, ['y', 'x', 'z'], null, new DriverRng('n'));
    const e = decideAutoma({ rules: [], tieBreak: [() => NaN] }, null, ['y', 'z'], null, new DriverRng('n'));
    expect([d.answer, d.ties, e.ties, e.random]).toEqual(['x', [3, 1], [2, 2], true]);
  });
});
