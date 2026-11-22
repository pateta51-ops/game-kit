import { describe, expect, it } from 'vitest';
import { applyAction, createGame, enumerateAnswers, hashState, type KernelPrompt } from '../engine-core/index.ts';
import { cardPack, inDryRun, type OfferPolicy, type PackEnv, type PackStep } from './pack.ts';
import { cardPack as frozenPack } from './pack.k579.frozen.ts';
import { changed, DRAW, GAIN, marked, NOTHING, offerGame, pay, viewOf, type Eff, type G, type S } from './offerGame.ts';

// K583: random small effects on the made-up game (fixed seeds, no clock). `rnd` is a plain generator kept in the test.
const rng = (seed: number) => {
  let x = seed;
  const rnd = (n: number): number => {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    return (x >>> 8) % n;
  };
  return { rnd, of: <T,>(xs: readonly T[]): T => xs[rnd(xs.length)] as T };
};
const A: PackEnv = { seat: 'a', source: 'p1' };
const custom = (name: string): PackStep => ({ op: 'custom', name });
const has = (e: Eff, f: (st: PackStep) => boolean): boolean => e.some((st) => f(st) || Object.values(st).some((v) => Array.isArray(v) && typeof v[0] === 'object' && (Array.isArray(v[0]) ? (v as Eff[]).some((o) => has(o, f)) : has(v as Eff, f))));

// (a) Nothing changed by default: the pack as it is against the frozen copy of the pack as K579 left it, with no K583 setting.
describe('card-language offer policy (K583): with no new setting the pack answers as the pack K579 left', () => {
  // The declared changes of an old answer, each a named predicate over the effect (never a seed or an index) with the one way the check's answer may move
  // (`moves(K579 answer, answer now)`; a K579 answer starting `throws` is a throw into the caller). `reasonOnly`: the answer stays, a bar reason changes.
  const HIDDEN = ['hand:b', 'deck', 'deck:b'];
  const to = (from: readonly string[], now: readonly string[]) => (a: string, b: string): boolean => from.includes(a) && now.includes(b);
  const FIXES: Readonly<Record<string, { readonly on: (e: Eff, p: OfferPolicy<S>) => boolean; readonly moves?: (then: string, now: string) => boolean; readonly reasonOnly?: true }>> = {
    // Point 2: an effect that ends the game is a yes under a view without `result`.
    endsGameUnderAViewWithoutResult: { on: (e, p) => p.view !== undefined && has(e, (st) => st.op === 'custom' && st.name === 'win'), moves: to(['no', 'unknown'], ['yes']) },
    // Point 3: a handler that throws outside the kernel's errors no longer throws into the real action.
    handlerThrows: { on: (e) => has(e, (st) => st.op === 'custom' && ['boom', 'back', 'pairs'].includes(st.name)), moves: (a, b) => a.startsWith('throws') && (b === 'unknown' || b === 'yes') },
    // Point 4: a card picked blind from any hidden zone is not shown to a game test, count, filter or custom verb.
    readsABlindPick: { on: (e) => has(e, (st) => st.op === 'chooseCards' && HIDDEN.includes(st.zone) && has(st.then as Eff, (x) => ['if', 'count', 'custom', 'chooseCards', 'search'].includes(x.op))), moves: to(['yes', 'no'], ['unknown']) },
    // Point 5: looking at a card the seat already sees, or revealing one all see, is no change in the check.
    looksAtASeenCard: { on: (e) => has(e, (st) => (st.op === 'lookAt' || st.op === 'reveal') && st.cards === 'all' && st.from !== 'deck'), moves: to(['yes'], ['no', 'unknown']) },
    // Point 5: the bar reason of an unpayable cost inside a seq or a may is cannotPay (was noChange).
    barReasonOfANestedCost: { on: (e) => has(e, (st) => (st.op === 'seq' || st.op === 'may') && has((st.op === 'seq' ? st.steps : st.then) as Eff, (x) => ['payThen', 'pay', 'convert'].includes(x.op))), reasonOnly: true },
    // Review: readying when no card was ever marked (an empty marks record) is no change (an effect that also marks a card is not named).
    readiesWithNoMark: { on: (e) => has(e, (st) => st.op === 'ready') && !has(e, (st) => st.op === 'exhaust' || st.op === 'flip'), moves: to(['yes'], ['no', 'unknown']) },
    // Review: a shuffle of fewer than two cards draws nothing and changes nothing.
    shufflesFewerThanTwo: { on: (e) => has(e, (st) => st.op === 'shuffle' || st.op === 'search'), moves: to(['unknown'], ['no', 'yes']) },
  };
  // K641, declared for every input: an option over a card the seat cannot see now carries `unseen: true`; nothing else of a prompt may differ.
  const seen = (x: string): string => x.replace(/("id":"#\d+","enabled":true),"unseen":true/g, '$1');
  const reasonless = (x: string): string => x.replaceAll('"cannotPay"', '"noChange"');
  const POLICIES: readonly OfferPolicy<S>[] = [
    {},
    { noChange: 'skip', deadChoice: 'bar' },
    { noChange: 'bar', deadChoice: 'skip', cost: 'whole', fewer: 'exact', unknown: 'skip', view: ({ zones, res, marks }) => ({ zones, res, marks }) },
  ];
  const games = POLICIES.map((offer) => ({ offer, now: offerGame(cardPack<G>, { offer }), then: offerGame(frozenPack<G>, { offer }) }));
  const gen = (seed: number) => {
    const { rnd, of } = rng(seed);
    const leaf = (): PackStep => of<() => PackStep>([
      () => GAIN, () => NOTHING, () => NOTHING, () => DRAW, () => pay(1), () => pay(9), () => custom('nothing'), () => custom('lone'), () => custom('order'), () => custom('roll'),
      () => custom('win'), () => custom('boom'), () => custom('back'), () => custom('pairs'), () => custom('nest'), () => custom('attempt'), () => custom('spend'),
      () => ({ op: 'adjust', key: 'gold', by: -1 }), () => ({ op: 'adjust', key: 'gold', by: 1, max: 3 }), () => ({ op: 'gainResource', res: 'gold', amount: 'X' }),
      () => ({ op: 'discard', cards: 'chosen' }), () => ({ op: 'move', cards: 'chosen', to: 'discard' }), () => ({ op: 'exhaust' }), () => ({ op: 'ready' }), () => ({ op: 'shuffle', zone: of(['deck', 'aside', 'play']) }),
      () => ({ op: 'lookAt', cards: 'all', from: of(['hand', 'play', 'deck']) }), () => ({ op: 'reveal', cards: 'all', from: of(['hand', 'play']) }), () => ({ op: 'lookAt', count: 1 }),
      () => ({ op: 'if', test: of(['two', 'h2', 'poor', 'rich', 'b3', 'ends']), then: [of([GAIN, DRAW, NOTHING])] }),
      () => ({ op: 'later', at: 'end', then: [GAIN] }), () => ({ op: 'search', zone: 'deck', filter: 'even' }), () => ({ op: 'search', zone: 'aside' }),
    ])();
    const eff = (depth: number): PackStep[] => Array.from({ length: 1 + rnd(2) }, () => step(depth));
    const cost = (): PackStep[] => Array.from({ length: 1 + rnd(2) }, () => of<() => PackStep>([() => pay(1), () => pay(2), () => pay(9), () => custom('have'), () => custom('nothing'), () => ({ op: 'discard', count: 1 }), () => ({ op: 'exhaust' }), () => ({ op: 'mill', count: 1 })])());
    const step = (depth: number): PackStep => (depth === 0 || rnd(4) === 0 ? leaf() : of<() => PackStep>([
      () => ({ op: 'may', then: eff(depth - 1) }),
      () => ({ op: 'chooseOption', options: [eff(depth - 1), eff(depth - 1)] }),
      () => ({ op: 'chooseCards', zone: of(['hand', 'hand', 'hand:b', 'aside', 'deck']), min: rnd(3), max: 2 + rnd(2), then: eff(depth - 1) }),
      () => ({ op: 'chooseCards', zone: of(['hand', 'hand:b']), min: rnd(2), max: 1, then: eff(depth - 1) }),
      () => ({ op: 'orderEffects', effects: Array.from({ length: 2 + rnd(2) }, () => eff(depth - 1)) }),
      () => ({ op: 'chooseNumber', max: 2, then: eff(depth - 1) }),
      () => ({ op: 'seq', steps: [{ op: 'scout', count: 2 }, ...eff(depth - 1)] }),
      () => ({ op: 'if', test: of(['two', 'h2', 'poor', 'b3']), then: eff(depth - 1) }),
      () => ({ op: 'payThen', cost: cost(), then: eff(depth - 1) }),
      () => ({ op: 'choosePayment', ways: [cost(), cost()], then: eff(depth - 1) }),
      () => ({ op: 'eachPlayer', then: eff(depth - 1) }),
      () => ({ op: 'choosePlayer', then: eff(depth - 1) }),
      () => ({ op: 'forEach', then: eff(depth - 1) }),
      () => ({ op: 'count', what: 'held', then: eff(depth - 1) }),
    ])());
    return eff;
  };
  const safe = (f: () => string): string => {
    try {
      return f();
    } catch (e) {
      return `throws ${String(e)}`;
    }
  };
  const show = (p: KernelPrompt | null): string => (p === null ? 'no prompt' : `${String(p.kind)} ${String(p.seat)} ${String(p.min)}-${String(p.max)} ${JSON.stringify(p.options)}`);
  type Game = ReturnType<typeof offerGame>;
  // What a game sees of the offer: the check's answer, and what an optional effect and a choice of it open (the state and the prompt).
  const offers = (g: Game, e: Eff): string[] => [
    safe(() => g.check(e)),
    ...[[{ op: 'may', then: e }], [{ op: 'chooseOption', options: [e, [NOTHING]] }]].map((w) => safe(() => {
      const { s } = g.play(w as Eff, [], undefined, true);
      return `${hashState({ ...s, prompt: null })} ${show(s.prompt)}`;
    })),
  ];
  // A whole real run: every prompt answered with its first legal answer, and every prompt it opened.
  const run = (g: Game, effect: Eff): string => safe(() => {
    const content = { effect };
    let { state } = createGame(g.RULES, { seed: 's' }, {}, content);
    let asked = '';
    for (let i = 0; i < 12 && state.prompt !== null; i += 1) {
      asked += `${seen(show(state.prompt))}
`;
      const [first] = enumerateAnswers(state);
      if (first === undefined) break;
      state = applyAction(g.RULES, state, first, content).state;
    }
    return `${hashState({ ...state, prompt: null })} ${asked}${seen(show(state.prompt))}`;
  });
  it('K583 2,400 random effects over 4 seeds, 3 policies: the check and the offers are equal, or differ only the way a named fix declares; a real run with no policy is equal on every input', () => {
    const fixed: Record<string, number> = Object.fromEntries(Object.keys(FIXES).map((k) => [k, 0]));
    let same = 0;
    let strict = 0;
    for (const seed of [583, 5831, 5832, 5833]) {
      const eff = gen(seed);
      for (let i = 0; i < 600; i += 1) {
        const e = eff(2);
        const [plain] = games;
        if (plain === undefined) throw new Error('no game');
        if (run(plain.now, e) !== run(plain.then, e)) throw new Error(`a real run with no policy differs: ${JSON.stringify(e)}`);
        for (const g of games) {
          const now = offers(g.now, e).map(seen);
          const then = offers(g.then, e);
          const why = Object.keys(FIXES).filter((k) => FIXES[k]?.on(e, g.offer));
          if (why.every((k) => FIXES[k]?.reasonOnly)) strict += 1;
          if (now.join('\n') === then.join('\n')) {
            same += 1;
            continue;
          }
          const [a = '', b = ''] = [then[0], now[0]];
          // The answer moved: only the way a fix that names this effect declares. The answer stayed: only a bar reason may differ, and only for the fix that says so.
          const by = a !== b ? why.filter((k) => FIXES[k]?.moves?.(a, b)) : now.map(reasonless).join('\n') === then.map(reasonless).join('\n') ? why.filter((k) => FIXES[k]?.reasonOnly) : [];
          if (by.length === 0) throw new Error(`policy ${JSON.stringify(g.offer)}: now ${now.join(' | ')}, K579 ${then.join(' | ')}: ${JSON.stringify(e)}`);
          for (const k of by) fixed[k] = (fixed[k] ?? 0) + 1;
        }
      }
    }
    // Pairs of effect and policy whose answer no fix may move: compared with no exclusion.
    expect(strict).toBeGreaterThan(2000);
    expect(same).toBeGreaterThan(5500);
    for (const k of Object.keys(FIXES)) expect([k, (fixed[k] ?? 0) > 0]).toEqual([k, true]);
    expect(inDryRun()).toBe(false);
  }, 240000);
});

// (b) paid = effect against brute force: pay the cost for real, play every legal answer, and ask whether anything but the cost changed.
// As K579's test: a pick set once, in option order; every order for an ordered prompt, scout and orderEffects; nothing random, hidden or of another seat.
describe('card-language offer policy (K583): under paid = effect the check agrees with playing every answer', () => {
  const { rnd, of } = rng(583);
  const leaf = (): PackStep => of<() => PackStep>([
    () => GAIN, () => NOTHING, () => NOTHING, () => DRAW, () => pay(1), () => pay(9),
    () => custom('nothing'), () => custom('lone'), () => custom('order'), () => ({ op: 'ready' }),
    () => ({ op: 'adjust', key: 'gold', by: -1 }), () => ({ op: 'adjust', key: 'gold', by: 1, max: 3 }),
    () => ({ op: 'gainResource', res: 'gold', amount: 'X' }), () => ({ op: 'discard', cards: 'chosen' }),
    () => ({ op: 'if', test: of(['two', 'h2', 'poor', 'rich']), then: [of([GAIN, DRAW, NOTHING])] }),
  ])();
  const eff = (depth: number): PackStep[] => Array.from({ length: 1 + rnd(2) }, () => step(depth));
  const cost = (): PackStep[] => Array.from({ length: 1 + rnd(2) }, () => of<() => PackStep>([() => pay(1), () => pay(1), () => pay(2), () => pay(9), () => custom('have'), () => custom('nothing'), () => ({ op: 'discard', count: 1 }), () => ({ op: 'exhaust' })])());
  const step = (depth: number): PackStep => (depth === 0 || rnd(4) === 0 ? leaf() : of<() => PackStep>([
    () => ({ op: 'may', then: eff(depth - 1) }),
    () => ({ op: 'chooseOption', options: [eff(depth - 1), eff(depth - 1)] }),
    () => ({ op: 'chooseCards', zone: 'hand', min: rnd(3), max: 2 + rnd(2), then: eff(depth - 1) }),
    () => ({ op: 'chooseCards', zone: 'hand', min: rnd(2), max: 1, then: eff(depth - 1) }),
    () => ({ op: 'orderEffects', effects: Array.from({ length: 2 + rnd(2) }, () => eff(depth - 1)) }),
    () => ({ op: 'chooseNumber', max: 2, then: eff(depth - 1) }),
    () => ({ op: 'seq', steps: [{ op: 'scout', count: 2 }, ...eff(depth - 1)] }),
    () => ({ op: 'if', test: of(['two', 'h2', 'poor']), then: eff(depth - 1) }),
    () => ({ op: 'payThen', cost: cost(), then: eff(depth - 1) }),
    () => ({ op: 'payThen', cost: cost(), then: eff(depth - 1) }),
    () => ({ op: 'payThen', cost: cost(), then: eff(depth - 1) }),
  ])());
  const wide = offerGame(cardPack<G>, { offer: { paid: 'effect', branches: 100000 } });
  const narrow = offerGame(cardPack<G>, { offer: { paid: 'effect', branches: 3 } });
  const byCost = offerGame(cardPack<G>, { offer: { branches: 100000 } });
  const SEEN: Eff = [{ op: 'lookAt', count: 2 }];
  const base = viewOf(createGame(wide.RULES, { seed: 's' }, {}, { effect: SEEN }).state);
  const truth = (effect: Eff): boolean | undefined => {
    const content = { effect: [...SEEN, custom('start'), ...marked(effect)] };
    let left = 1500;
    const any = (s: S): boolean | undefined => {
      if ((left -= 1) < 0) return undefined;
      if (changed(s, base)) return true;
      const p = s.prompt;
      if (p === null) return false;
      const ordered = p.ordered === true || p.kind === 'orderCards' || p.kind === 'orderEffects';
      for (const a of enumerateAnswers({ ...s, prompt: { ...p, ordered } })) {
        const r = any(applyAction(wide.RULES, s, a, content).state);
        if (r !== false) return r;
      }
      return false;
    };
    return any(createGame(wide.RULES, { seed: 's' }, {}, content).state);
  };
  it('K583 600 random effects with paid effects: yes and no match brute force; a small budget answers the same or unknown; the setting changes answers both ways', () => {
    const seen = { yes: 0, no: 0, unknown: 0, paidOnly: 0, effectOnly: 0 };
    for (let i = 0; i < 600; i += 1) {
      const effect = eff(3);
      const t = truth(effect);
      if (t === undefined) continue;
      const want = t ? 'yes' : 'no';
      const got = wide.check(effect, A, SEEN);
      if (got !== want) throw new Error(`check ${got}, brute force ${want}: ${JSON.stringify(effect)}`);
      const small = narrow.check(effect, A, SEEN);
      if (small !== want && small !== 'unknown') throw new Error(`budget 3: check ${small}, brute force ${want}: ${JSON.stringify(effect)}`);
      seen[want] += 1;
      if (small === 'unknown') seen.unknown += 1;
      const old = byCost.check(effect, A, SEEN);
      if (old === 'yes' && want === 'no') seen.paidOnly += 1;
      if (old === 'no' && want === 'yes') seen.effectOnly += 1;
    }
    expect(seen.yes).toBeGreaterThan(120);
    expect(seen.no).toBeGreaterThan(80);
    expect(seen.unknown).toBeGreaterThan(20);
    expect(seen.paidOnly).toBeGreaterThan(5);
    expect(seen.effectOnly).toBeGreaterThan(0);
    expect(inDryRun()).toBe(false);
  }, 240000);
});
