import { describe, expect, it } from 'vitest';
import { applyAction, createGame, enumerateAnswers, hashState } from '../engine-core/index.ts';
import { cardPack, inDryRun, type OfferPolicy, type PackEnv, type PackStep } from './pack.ts';
import { DRAW, GAIN, gen, NOTHING, offerGame, pay, type Eff, type G, type S } from './offerGame.ts';
import { pinned } from './k597.pin.ts';

// K597: how much of an effect would resolve (in full, in part, not at all, unknown), each skipped step with its reason.
// K605: the reasons of a `no` from `judge` (opt-in), and a game hook that decides the answer.
const A: PackEnv = { seat: 'a', source: 'p1' };
const game = (offer: OfferPolicy<S> = {}, deck?: readonly string[]) => offerGame(cardPack<G>, { offer, ...(deck ? { deck } : {}) });
const resolves = (steps: Eff, g = game()) => {
  const { s, content } = g.at();
  const h = hashState(s);
  const r = g.pack.resolves(s, content, steps, A);
  expect(hashState(s)).toBe(h);
  return r;
};
const RICH: PackStep = { op: 'if', test: 'rich', then: [GAIN] };
const FULL_ADJUST: PackStep = { op: 'adjust', key: 'gold', by: 1, max: 3 };

describe('card-language resolves (K597): prior-art cases restated on the made-up game', () => {
  it('K597 an effect every step of which resolves is full, with nothing skipped', () => {
    expect(resolves([GAIN, DRAW])).toEqual({ answer: 'full', skipped: [] });
  });
  it('K597 a draw whose second step gains from an empty zone is part, the skipped step reported with emptyZone', () => {
    expect(resolves([DRAW, { op: 'gain', from: 'aside' }])).toEqual({ answer: 'part', skipped: [{ step: 1, reason: 'emptyZone' }] });
  });
  it('K597 a find with a match in hand is full; with no match anywhere and nothing hidden it is none (noTarget), and stays legal for the game to decide', () => {
    expect(resolves([{ op: 'discard', cards: 'pick', filter: 'even' }]).answer).toBe('full');
    expect(resolves([{ op: 'discard', cards: 'pick', from: 'play', filter: 'even' }])).toEqual({ answer: 'none', skipped: [{ step: 0, reason: 'noTarget' }] });
  });
  it('K597 a find that may reach a hidden pile is unknown (hidden), whatever the pile holds', () => {
    for (const deck of [['d1', 'd2'], ['d1', 'd3']]) expect(resolves([GAIN, { op: 'search', zone: 'deck', filter: 'even' }], game({}, deck))).toEqual({ answer: 'unknown', reason: 'hidden', skipped: [{ step: 1, reason: 'hidden' }] });
  });
  it('K597 a mill, then "you may discard a card" from an empty zone: part, the optional step skipped with the reason of its body', () => {
    expect(resolves([{ op: 'mill', count: 1 }, { op: 'may', then: [{ op: 'discard', cards: 'pick', from: 'aside' }] }])).toEqual({ answer: 'part', skipped: [{ step: 1, reason: 'emptyZone' }] });
  });
  it('K597 two plays of one card: a gain is full, a gain under a false condition is none (condition)', () => {
    expect(resolves([GAIN]).answer).toBe('full');
    expect(resolves([RICH])).toEqual({ answer: 'none', skipped: [{ step: 0, reason: 'condition' }] });
  });
  it('K597 a cost that cannot be paid: none (cannotPay); paid, its effect runs and the step resolves', () => {
    expect(resolves([{ op: 'payThen', cost: [pay(9)], then: [GAIN] }])).toEqual({ answer: 'none', skipped: [{ step: 0, reason: 'cannotPay' }] });
    expect(resolves([{ op: 'payThen', cost: [pay(1)], then: [DRAW] }]).answer).toBe('full');
  });
  it('K597 every answer is tried, not the first one enabled: choosing h2 makes the gain happen', () => {
    expect(resolves([{ op: 'chooseCards', zone: 'hand', min: 1, max: 1, then: [{ op: 'if', test: 'h2', then: [GAIN] }] }]).answer).toBe('full');
    expect(resolves([{ op: 'chooseOption', options: [[NOTHING], [GAIN]] }]).answer).toBe('full');
  });
  it('K597 one line resolves the first step, another the second, none both: part, the step skipped on the best line reported', () => {
    expect(resolves([{ op: 'may', then: [NOTHING] }, GAIN])).toEqual({ answer: 'part', skipped: [{ step: 0, reason: 'emptyZone' }] });
    expect(resolves([{ op: 'chooseOption', options: [[pay(1)], [{ op: 'gainResource', res: 'gold', amount: 1 }]] }, { op: 'if', test: 'poor', then: [GAIN] }]).answer).toBe('full');
  });
  it('K597 a draw from an empty deck: emptyZone; a gain that changes nothing: noChange', () => {
    expect(resolves([DRAW], game({}, []))).toEqual({ answer: 'none', skipped: [{ step: 0, reason: 'emptyZone' }] });
    expect(resolves([FULL_ADJUST])).toEqual({ answer: 'none', skipped: [{ step: 0, reason: 'noChange' }] });
  });
  it('K597 a handler that throws: unknown with the reason error and what it threw; a step resolved before it is known', () => {
    const r = resolves([GAIN, { op: 'custom', name: 'boom' }]);
    expect([r.answer, r.reason, String(r.error), r.skipped.map((k) => [k.step, k.reason])]).toEqual(['unknown', 'error', 'TypeError: boom', [[1, 'error']]]);
  });
  it('K597 an effect that ends the game resolves its step; a random draw and another seat\'s choice are unknown', () => {
    expect(resolves([{ op: 'custom', name: 'win' }]).answer).toBe('full');
    expect(resolves([{ op: 'custom', name: 'roll' }])).toMatchObject({ answer: 'unknown', reason: 'random' });
    expect(resolves([{ op: 'choosePlayer', others: true, then: [{ op: 'may', then: [GAIN] }] }])).toMatchObject({ answer: 'unknown', reason: 'otherSeat' });
  });
  it('K597 the check of nested calls and the dry-run flag are left as they were', () => {
    resolves([GAIN, { op: 'custom', name: 'nest' }]);
    expect(inDryRun()).toBe(false);
  });
});

describe('card-language judge reasons (K605)', () => {
  const judge = (steps: Eff, offer: OfferPolicy<S> = {}, deck?: readonly string[]) => {
    const g = game(offer, deck);
    const { s, content } = g.at();
    return g.pack.judge(s, content, steps, A, { why: true });
  };
  it('K605 each reason of a no: condition, cannotPay, noTarget, emptyZone, noChange', () => {
    expect(judge([RICH])).toEqual({ answer: 'no', reason: 'condition' });
    expect(judge([{ op: 'payThen', cost: [pay(9)], then: [GAIN] }])).toEqual({ answer: 'no', reason: 'cannotPay' });
    expect(judge([pay(9)])).toEqual({ answer: 'no', reason: 'cannotPay' });
    expect(judge([{ op: 'discard', cards: 'pick', from: 'play', filter: 'even' }])).toEqual({ answer: 'no', reason: 'noTarget' });
    expect(judge([{ op: 'chooseCards', zone: 'aside', max: 1, then: [{ op: 'discard', cards: 'chosen' }] }])).toEqual({ answer: 'no', reason: 'emptyZone' });
    expect(judge([DRAW], {}, [])).toEqual({ answer: 'no', reason: 'emptyZone' });
    expect(judge([FULL_ADJUST])).toEqual({ answer: 'no', reason: 'noChange' });
  });
  it('K605 the reasons of an unknown are as before: hidden, error; a yes carries none', () => {
    expect(judge([{ op: 'search', zone: 'deck', filter: 'even' }])).toEqual({ answer: 'unknown', reason: 'hidden' });
    expect(judge([{ op: 'custom', name: 'boom' }])).toMatchObject({ answer: 'unknown', reason: 'error' });
    expect(judge([GAIN])).toEqual({ answer: 'yes' });
  });
  it('K605 without `why` a no carries no reason (as before)', () => {
    const g = game();
    const { s, content } = g.at();
    expect(g.pack.judge(s, content, [RICH], A)).toEqual({ answer: 'no' });
  });
  it('K605 a game hook decides the answer: wouldChange and the offer of a may read it', () => {
    const offer: OfferPolicy<S> = { noChange: 'skip', decide: (_s, _steps, _env, c) => (c.answer === 'no' && c.reason === 'condition' ? { answer: 'yes' } : c) };
    const g = game(offer);
    expect(g.check([RICH])).toBe('yes');
    expect(g.check([FULL_ADJUST])).toBe('no');
    expect(g.play([{ op: 'may', then: [RICH] }], [], undefined, true).s.prompt?.kind).toBe('may');
    expect(g.play([{ op: 'may', then: [FULL_ADJUST] }]).s.prompt).toBeNull();
  });
});

describe('card-language wouldChange (K597): unchanged', () => {
  it('K597 judge and wouldChange answer 1,800 random effects under 3 policies exactly as main did before K597', () => {
    expect(pinned()).toEqual({ hash: 'c210199b3bde6953', count: 1800 });
  }, 240000);
});

describe('card-language resolves (K597): the README recipe runs', () => {
  it('K597 recipe: read how much resolves and why each step is skipped', () => {
    const g = game();
    const { s: state, content } = g.at();
    const pack = g.pack;
    const out: string[] = [];
    // README recipe (K597, K605) starts
    const r = pack.resolves(state, content, [DRAW, { op: 'gain', from: 'aside' }], { seat: 'a' });
    if (r.answer === 'part') for (const k of r.skipped) out.push(`step ${String(k.step)} skipped: ${k.reason}`);
    const why = pack.judge(state, content, [{ op: 'if', test: 'rich', then: [GAIN] }], { seat: 'a' }, { why: true });
    out.push(`${why.answer} ${String(why.reason)}`);
    // README recipe ends
    expect(out).toEqual(['step 1 skipped: emptyZone', 'no condition']);
  });
});

// K597 interface row: the three-way answer against exhaustive real play of every answer. A line of play resolves a top-level
// step when the game's view changed while it ran (or it ended the game); a top-level payThen is two parts, its cost and its
// effect. Full: some line resolves every part; part: some line resolves one, none all; none: no line resolves any.
// Without hidden information the answer is never unknown. With it, the effect is played in every hidden world (the acting
// seat's deck, the other seat's hand, the seed): a known answer must hold in every world, and an unknown one means worlds
// disagree, or a declared case (another seat's choice, a handler error, game code reading a card the seat cannot see, K583).
describe('card-language resolves (K597): agrees with playing every answer', () => {
  const has = (e: Eff, f: (st: PackStep) => boolean): boolean => e.some((st) => f(st) || Object.values(st).some((v) => Array.isArray(v) && typeof v[0] === 'object' && (Array.isArray(v[0]) ? (v as Eff[]).some((o) => has(o, f)) : has(v as Eff, f))));
  // Declared: in the check, looking at a card the seat already sees (or revealing one all see) is no change (K583); a real run records it.
  const looksAtASeenCard = (e: Eff): boolean => has(e, (st) => (st.op === 'lookAt' || st.op === 'reveal') && st.cards === 'all' && st.from !== 'deck');
  const HIDDEN = ['hand:b', 'deck', 'deck:b'];
  // Declared (K583's guard, kept by resolves): once a cost begins, a card it or its effect shows the seat stops the game code after it.
  const SHOWS = ['scout', 'draw', 'mill', 'lookAt', 'reveal', 'search', 'discard'];
  const CODE = ['custom', 'if', 'count', 'chooseCards', 'search'];
  const showsAfterACost = (e: Eff): boolean => has(e, (st) => (st.op === 'payThen' || st.op === 'choosePayment') && has([st], (x) => SHOWS.includes(x.op))) && has(e, (x) => CODE.includes(x.op));
  const secret = (e: Eff): boolean => has(e, (st) => (st.op === 'custom' && ['roll', 'boom', 'back', 'pairs', 'nest'].includes(st.name)) || ['shuffle', 'search', 'mill', 'choosePlayer', 'eachPlayer'].includes(st.op) || (st.op === 'chooseCards' && HIDDEN.includes(st.zone)) || (st.op === 'lookAt' && st.cards !== 'all')) || showsAfterACost(e);
  // Declared (K583): game code that reads a card the seat cannot see is unknown whatever the card is, so worlds may agree.
  const readsUnseen = (e: Eff): boolean => showsAfterACost(e) || has(e, (st) => (st.op === 'chooseCards' && HIDDEN.includes(st.zone) && has(st.then as Eff, (x) => CODE.includes(x.op))) || (st.op === 'search' && st.filter !== undefined));
  const WORLDS = [['d1', 'd2'], ['d2', 'd1'], ['d3', 'd4']].flatMap((deck) => [['b1', 'b2', 'b3'], ['b4', 'b5', 'b6']].map((b) => ({ deck, b, g: offerGame(cardPack<G>, { offer: { branches: 100000 }, deck, b }) })));
  const [base] = WORLDS;
  if (base === undefined) throw new Error('no world');
  const truth = (g: typeof base.g, effect: Eff, seed: string): string | undefined => {
    const top = (st: PackStep): PackStep => (st.op === 'payThen' ? { ...st, then: [{ op: 'custom', name: 'paid' }, ...st.then] } : st);
    const content = { effect: [{ op: 'custom', name: 'step' } as PackStep, ...effect.flatMap((st, i): PackStep[] => [top(st), { op: 'custom', name: 'step', n: i + 1 }])] };
    const units = effect.reduce((n, st) => n + (st.op === 'payThen' ? 2 : 1), 0);
    let left = 3000;
    let best = 0;
    const walk = (s: S): boolean => {
      if ((left -= 1) < 0) return false;
      const t = s.steps;
      if (s.result !== null) {
        const i = t?.next ?? 0;
        const now = (effect[i]?.op === 'payThen' ? [i, i + 0.5] : [i]).filter((u) => !(t?.done ?? []).includes(u));
        best = Math.max(best, (t?.done.length ?? 0) + now.length);
        return true;
      }
      const p = s.prompt;
      if (p === null) return (best = Math.max(best, t?.done.length ?? 0)), true;
      const ordered = p.ordered === true || p.kind === 'orderCards' || p.kind === 'orderEffects';
      for (const a of enumerateAnswers({ ...s, prompt: { ...p, ordered } })) if (!walk(applyAction(g.RULES, s, a, content).state)) return false;
      return true;
    };
    try {
      if (!walk(createGame(g.RULES, { seed }, {}, content).state)) return undefined;
    } catch {
      return undefined;
    }
    return best === units ? 'full' : best > 0 ? 'part' : 'none';
  };
  it('K597 1,200 random effects: full, part and none match brute force in every hidden world; unknown only where worlds disagree or a declared case', () => {
    const seen: Record<string, number> = { full: 0, part: 0, none: 0, unknown: 0, plain: 0, everyWorld: 0, disagree: 0, declared: 0 };
    const add = (k: string): void => void (seen[k] = (seen[k] ?? 0) + 1);
    for (const seed of [597, 5972]) {
      const eff = gen(seed);
      for (let i = 0; i < 600; i += 1) {
        const e = eff(2);
        if (looksAtASeenCard(e)) continue;
        const rs = WORLDS.map((w) => {
          const { s, content } = w.g.at();
          return w.g.pack.resolves(s, content, e, A);
        });
        const r = rs[0];
        if (r === undefined) throw new Error('no answer');
        add(r.answer);
        // The answer is the seat's own: the same in every hidden world.
        if (rs.some((x) => x.answer !== r.answer)) throw new Error(`answers differ between hidden worlds: ${rs.map((y) => y.answer).join()}: ${JSON.stringify(e)}`);
        if (r.answer === 'full' ? r.skipped.length !== 0 : r.skipped.length === 0) throw new Error(`skipped ${JSON.stringify(r.skipped)} with ${r.answer}`);
        if (!secret(e)) {
          if (r.answer === 'unknown') throw new Error(`unknown (${String(r.reason)}) with nothing hidden: ${JSON.stringify(e)}`);
          const t = truth(base.g, e, 's');
          if (t !== undefined && t !== r.answer) throw new Error(`resolves ${r.answer}, brute force ${t}: ${JSON.stringify(e)}`);
          if (t !== undefined) add('plain');
          continue;
        }
        const ts = WORLDS.flatMap((w) => ['s', 't'].map((sd) => truth(w.g, e, sd)));
        if (ts.some((t) => t === undefined)) continue;
        if (r.answer !== 'unknown') {
          if (ts.some((t) => t !== r.answer)) throw new Error(`resolves ${r.answer}, worlds ${ts.join()}: ${JSON.stringify(e)}`);
          add('everyWorld');
        } else if (new Set(ts).size > 1) add('disagree');
        else if (['otherSeat', 'error', 'nested'].includes(r.reason ?? '') || (r.reason === 'hidden' && readsUnseen(e))) add('declared');
        else throw new Error(`unknown (${String(r.reason)}) but every world gives ${String(ts[0])}: ${JSON.stringify(e)}`);
      }
    }
    console.log(JSON.stringify(seen));
    expect(seen.plain).toBeGreaterThan(300);
    expect(seen.everyWorld).toBeGreaterThan(50);
    expect(seen.disagree).toBeGreaterThan(20);
    expect(seen.part).toBeGreaterThan(60);
    expect(seen.none).toBeGreaterThan(150);
    expect(inDryRun()).toBe(false);
  }, 240000);
});
