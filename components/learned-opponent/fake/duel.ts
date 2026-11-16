// A toy competitive game for the tests. Cards 1-10 shuffled, four dealt to each of two seats (hidden); prizes 1-4 shuffled,
// one shown per round. The leader plays a card face up, then the other seat; the higher card takes the prize. Four rounds.
import { applyAction, draftOf, hashValue, seedRng, type AnswerAction, type Ctx, type GameRules, type KernelPrompt, type KernelState, type KernelTask } from '../../engine-core/index';
import { bySeat, DriverRng, legalAnswers, randomDriver, type Driver, type SimGame } from '../../sim-pool/index';
import { Inputs, behind, blank, deal, learnedDriver, present, readWeights, relative, setValue, thermo, withTrace, type Model } from '../index';

export interface DuelState extends KernelState {
  readonly options: { readonly seed: string };
  readonly rules: object;
  readonly hands: readonly (readonly number[])[];
  readonly prizes: readonly number[];
  readonly round: number;
  readonly lead: number;
  readonly actor: number;
  readonly table: readonly (number | null)[];
  readonly played: readonly number[];
  readonly scores: readonly number[];
  readonly prompt: KernelPrompt | null;
  readonly result: { readonly scores: readonly number[] } | null;
}

export interface Duel {
  readonly state: DuelState;
  readonly action: AnswerAction;
  readonly task: KernelTask & { readonly answer?: readonly string[] };
  readonly prompt: KernelPrompt;
  readonly event: never;
  readonly stamped: string;
  readonly content: object;
  readonly options: { readonly seed: string };
  readonly rules: object;
}

const CARDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const PRIZES = [1, 2, 3, 4];

const ask = (ctx: Ctx<Duel>, hand: readonly number[]): void => {
  ctx.ask({ min: 1, max: 1, seat: ctx.s.actor, options: hand.map((c) => ({ id: String(c), enabled: true })) }, { kind: 'play' });
};

export const DUEL: GameRules<Duel> = {
  handlers: {
    round(ctx) {
      const s = draftOf(ctx);
      if (s.round >= PRIZES.length) {
        s.result = { scores: [...s.scores] };
        return;
      }
      s.actor = s.lead;
      s.table = [null, null];
      ask(ctx, s.hands[s.actor] as number[]);
    },
    play(ctx, task) {
      const s = draftOf(ctx);
      const card = Number(task.answer?.[0]);
      const me = s.actor;
      s.hands = s.hands.map((h, i) => (i === me ? h.filter((c) => c !== card) : h));
      s.table = s.table.map((t, i) => (i === me ? card : t));
      s.played = [...s.played, card];
      if (s.table[1 - me] === null) {
        s.actor = 1 - me;
        ask(ctx, s.hands[s.actor] as number[]);
        return;
      }
      const a = s.table[0] as number;
      const b = s.table[1] as number;
      const prize = s.prizes[s.round] as number;
      s.scores = s.scores.map((v, i) => v + ((i === 0 ? a > b : b > a) ? prize : 0));
      s.round += 1;
      s.lead = 1 - s.lead;
      ctx.then({ kind: 'round' });
    },
  },
  blank: (options, rules) => {
    const [a, b, c, d] = seedRng(options.seed);
    return { options, rules, rng: { a, b, c, d }, hands: [[], []], prizes: [], round: 0, lead: 0, actor: 0, table: [null, null], played: [], scores: [0, 0], stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [] };
  },
  setup(ctx) {
    const s = draftOf(ctx);
    const deck = ctx.rng.shuffle(CARDS);
    s.hands = [deck.slice(0, 4), deck.slice(4, 8)];
    s.prizes = ctx.rng.shuffle(PRIZES);
    ctx.then({ kind: 'round' });
  },
  contentHash: () => 'duel',
};

/** The seat's view: its own hand, the opponent's hand size, the prizes shown so far, everything public. */
export interface DuelView {
  readonly hand: readonly number[];
  readonly other: number;
  readonly shown: readonly number[];
  readonly pub: Omit<DuelState, 'hands' | 'prizes' | 'rng'>;
}

export const INPUTS = new Inputs();
const HAND = INPUTS.presence('hand', CARDS);
const OPP = INPUTS.presence('table', CARDS);
const PRIZE = INPUTS.thermo('prize', 4);
const ROUND = INPUTS.thermo('round', 4);
const LEAD = INPUTS.value('lead');
const OVER = INPUTS.value('over');
const SEATS = INPUTS.perSeat(2, (p) => ({ score: INPUTS.thermo(`${p}score`, 10), behind: INPUTS.thermo(`${p}behind`, 10) }));

export function encodeEnd(scores: readonly number[], seat: number): Float32Array {
  const x = blank(INPUTS);
  setValue(x, OVER, 1);
  const rel = relative(scores, seat);
  const b = behind(rel);
  SEATS.forEach((s, i) => {
    thermo(x, s.score, rel[i] as number);
    thermo(x, s.behind, b[i] as number);
  });
  return x;
}

export const MODEL: Model<DuelState, AnswerAction, DuelView> = {
  view: (s, seat) => {
    const { hands, prizes, rng: _r, ...pub } = s;
    const prompt = s.prompt && s.actor !== seat ? { ...s.prompt, options: [] } : s.prompt;
    return { hand: hands[seat] as number[], other: (hands[1 - seat] as number[]).length, shown: prizes.slice(0, Math.min(s.round + 1, prizes.length)), pub: { ...pub, prompt } };
  },
  sample(v, seat, rng) {
    const [opp = [], rest = []] = deal(CARDS.filter((c) => !v.hand.includes(c) && !v.pub.played.includes(c)), [v.other], rng);
    void rest;
    const [later = []] = deal(PRIZES.filter((p) => !v.shown.includes(p)), [], rng);
    const [a, b, c, d] = seedRng(String(rng.nextUint32()));
    const hands = seat === 0 ? [v.hand, opp] : [opp, v.hand];
    const p = v.pub.prompt;
    const prompt = p && v.pub.actor !== seat ? { ...p, options: (hands[v.pub.actor] as number[]).map((c) => ({ id: String(c), enabled: true })) } : p;
    return { ...v.pub, prompt, rng: { a, b, c, d }, hands, prizes: [...v.shown, ...later] };
  },
  legal: (s) => legalAnswers(s.prompt as KernelPrompt, new DriverRng('legal')),
  apply: (s, a) => applyAction(DUEL, s, a, {}).state,
  over: (s) => s.result?.scores ?? null,
  horizon: (from, now) => now.round !== from.round,
  encode(v, seat) {
    const x = blank(INPUTS);
    present(x, HAND, v.hand);
    const t = v.pub.table[1 - seat];
    if (t !== null && t !== undefined) present(x, OPP, [t]);
    thermo(x, PRIZE, v.shown[v.pub.round] ?? 0);
    thermo(x, ROUND, v.pub.round);
    setValue(x, LEAD, v.pub.lead === seat ? 1 : -1);
    setValue(x, OVER, v.pub.result ? 1 : -1);
    const rel = relative(v.pub.scores, seat);
    const b = behind(rel);
    SEATS.forEach((s, i) => {
      thermo(x, s.score, rel[i] as number);
      thermo(x, s.behind, b[i] as number);
    });
    return x;
  },
  hash: (s) => hashValue({ h: s.hands, p: s.prizes, r: s.round, sc: s.scores, t: s.table, a: s.actor }),
};

const base: SimGame<Duel> = {
  rules: DUEL,
  content: () => ({}),
  start: (spec) => ({ options: { seed: spec.seed }, rules: {} }),
  driver(name, spec): Driver<Duel> {
    const random = randomDriver<Duel>();
    if (name === 'random') return random;
    const learned = learnedDriver<Duel, DuelView>(MODEL, readWeights(String(spec.settings?.weights), INPUTS.names), { epsilon: Number(spec.settings?.epsilon ?? 0), samples: 3 });
    if (name === 'learned') return learned;
    const seat = Number(spec.settings?.seat ?? 0);
    return bySeat<Duel>({ [seat]: learned }, random);
  },
};

export const simGame = withTrace(base, MODEL);
