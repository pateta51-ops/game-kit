import { describe, expect, it } from 'vitest';
import { blocked, type KernelPrompt } from '../engine-core/index.ts';
import { cardsIn } from '../card-zones/index.ts';
import { EngineBugError } from '../engine-core/index.ts';
import { cardPack, inDryRun, type OfferPolicy, type PackStep } from './pack.ts';
import { DRAW, GAIN, gen, gold, has, offerGame, shortOf, truth, type Eff, type G, type S } from './offerGame.ts';

// K598: in a choice, an option that resolves in full bars the options that resolve only in part (`offer.prefer: 'full'`).
const game = (offer: OfferPolicy<S> = {}, deck?: readonly string[]) => offerGame(cardPack<G>, { offer, ...(deck ? { deck } : {}) });
const FULL: OfferPolicy<S> = { prefer: 'full' };
const RICH: PackStep = { op: 'if', test: 'rich', then: [GAIN] };
const PART: Eff = [GAIN, RICH];
const NONE: Eff = [RICH];
const HIDDEN: Eff = [{ op: 'search', zone: 'deck', filter: 'even' }];
const WIN: Eff = [{ op: 'custom', name: 'win' }];
const choice = (...options: Eff[]): Eff => [{ op: 'chooseOption', options }];
const barred = (p: KernelPrompt | null | undefined) => blocked(p ?? null).map((b) => [b.id, b.reason, b.missing]);
const ask = (offer: OfferPolicy<S>, e: Eff, deck?: readonly string[]) => game(offer, deck).play(e, [], undefined, true).s.prompt;

describe('card-language prefer full (K598): prior-art cases restated on the made-up game', () => {
  it('K598 a full option bars every option that resolves only in part (draw 3 from a deck of 2 beside draw 2), reason partial', () => {
    const { s, prompts } = game(FULL).play(choice([{ op: 'draw', count: 3 }], [{ op: 'draw', count: 2 }]), [['1']]);
    expect([barred(prompts[0]), cardsIn(s, 'hand:a').length]).toEqual([[['0', 'partial', undefined]], 4]);
    expect(barred(ask(FULL, choice(PART, [DRAW], PART)))).toEqual([['0', 'partial', undefined], ['2', 'partial', undefined]]);
  });
  it('K598 with no full option a part one bars each none one (reason none); poor: part beside part, or unknown beside none, all open', () => {
    expect(barred(ask(FULL, choice(PART, [DRAW, { op: 'gain', from: 'aside' }], NONE)))).toEqual([['2', 'none', undefined]]);
    expect(barred(ask(FULL, choice(HIDDEN, PART, NONE)))).toEqual([['2', 'none', undefined]]);
    const p = ask(FULL, choice(PART, [DRAW, { op: 'gain', from: 'aside' }]));
    expect([p?.options.length, barred(p), barred(ask(FULL, choice(HIDDEN, NONE)))]).toEqual([2, [], []]);
    const d = ask({ prefer: 'full', deadChoice: 'bar' }, choice(NONE, PART));
    expect([barred(d), d?.options.filter((o) => o.enabled).map((o) => o.id)]).toEqual([[['0', 'noChange', undefined]], ['1']]);
  });
  it('K598 an option is graded by its whole step tree: seq, payThen, may and a nested choice grade as the same steps written flat', () => {
    const SEQ: Eff = [{ op: 'seq', steps: PART }];
    const PAID: Eff = [{ op: 'payThen', cost: [{ op: 'pay', res: 'gold', amount: 1 }], then: PART }];
    const MAY: Eff = [{ op: 'may', then: PART }];
    const INNER: Eff = [{ op: 'chooseOption', options: [PART, PART] }];
    for (const o of [SEQ, PAID, MAY, INNER, [{ op: 'seq', steps: [GAIN, { op: 'seq', steps: [RICH] }] }] as Eff]) {
      expect([o, barred(ask(FULL, choice(o, [GAIN])))]).toEqual([o, [['0', 'partial', undefined]]]);
      expect([o, barred(ask(FULL, choice(o, PART)))]).toEqual([o, []]);
    }
    expect(barred(ask(FULL, choice(PART, [GAIN])))).toEqual([['0', 'partial', undefined]]);
    expect(barred(ask({ prefer: 'full', barReason: 'why' }, choice(SEQ, [GAIN])))).toEqual([['0', 'partial', 'condition']]);
    // resolves itself keeps top-level parts: the seq counts as resolved there; pack.grade is the option grading.
    const g = game(FULL);
    const { s, content } = g.at();
    const env = { seat: 'a', source: 'p1' };
    expect([g.pack.resolves(s, content, SEQ, env).answer, g.pack.grade(s, content, SEQ, env).answer, g.pack.grade(s, content, PART, env).answer]).toEqual(['full', 'part', 'part']);
  });
  it('K598 fullIgnores: the listed skip reasons do not count against full; poor: the default [] grades as before', () => {
    const MAYNONE: Eff = [{ op: 'may', then: NONE }];
    const at = (fullIgnores: OfferPolicy<S>['fullIgnores'], ...o: Eff[]) => barred(ask({ prefer: 'full', barReason: 'why', ...(fullIgnores ? { fullIgnores } : {}) }, choice(...o)));
    expect([at(undefined, PART, [GAIN]), at([], PART, [GAIN]), at(['condition'], PART, [GAIN])]).toEqual([[['0', 'partial', 'condition']], [['0', 'partial', 'condition']], []]);
    expect([at(undefined, MAYNONE, PART), at(['declined'], MAYNONE, PART), at(['condition'], MAYNONE, PART)]).toEqual([[['0', 'none', 'condition']], [['1', 'partial', 'condition']], []]);
    expect(at(['condition'], [{ op: 'seq', steps: [GAIN, RICH] }], [{ op: 'draw', count: 3 }])).toEqual([['1', 'partial', 'short']]);
  });
  it('K598 a forced choice where no option resolves at all is skipped; poor: one part option, or the default policy, still asks', () => {
    const { s } = game(FULL).play(choice(NONE, [{ op: 'discard', cards: 'pick', from: 'play', filter: 'even' }]));
    expect([s.prompt, gold(s)]).toEqual([null, 3]);
    expect(ask(FULL, choice(NONE, PART))?.kind).toBe('chooseOption');
    expect(ask({}, choice(NONE, NONE))?.kind).toBe('chooseOption');
  });
  it('K598 an unknown option is never barred and never bars: beside a full option only the part one is barred; beside part alone, all open; with none, still asked', () => {
    expect(barred(ask(FULL, choice(HIDDEN, PART, [DRAW])))).toEqual([['1', 'partial', undefined]]);
    expect(barred(ask(FULL, choice(HIDDEN, PART)))).toEqual([]);
    expect(ask(FULL, choice(HIDDEN, NONE))?.kind).toBe('chooseOption');
  });
  it('K598 an option that wins the game counts as full and bars a part one', () => {
    expect(barred(ask(FULL, choice(PART, WIN)))).toEqual([['0', 'partial', undefined]]);
  });
  it('K598 a win inside a nested step forgives only what the end cut off: [seq [if rich: gain, win]] grades part as [if rich: gain, win] does; [seq [win, gain]] is full', () => {
    const g = game(FULL);
    const { s, content } = g.at();
    const env = { seat: 'a', source: 'p1' };
    const gr = (o: Eff) => g.pack.grade(s, content, o, env).answer;
    expect([gr([{ op: 'seq', steps: [RICH, ...WIN] }]), gr([RICH, ...WIN]), gr([{ op: 'seq', steps: [...WIN, GAIN] }]), gr([{ op: 'seq', steps: [GAIN, { op: 'seq', steps: [...WIN, RICH] }] }])]).toEqual(['part', 'part', 'full', 'full']);
    expect(barred(ask(FULL, choice([{ op: 'seq', steps: [RICH, ...WIN] }], [GAIN])))).toEqual([['0', 'partial', undefined]]);
  });
  it('K598 deadChoice bar comes first: a lone false if is barred noChange before fullIgnores could grade it full (pinned)', () => {
    const p = ask({ prefer: 'full', deadChoice: 'bar', fullIgnores: ['condition'] }, choice(NONE, PART));
    expect(barred(p)).toEqual([['0', 'noChange', undefined]]);
    expect(barred(ask({ prefer: 'full', fullIgnores: ['condition'] }, choice(NONE, [{ op: 'draw', count: 3 }])))).toEqual([['1', 'partial', undefined]]);
  });
  it('K598 beside a full option only full ones stay enabled: a none option is barred too (none); under deadChoice bar it keeps noChange', () => {
    expect(barred(ask(FULL, choice(NONE, PART, [DRAW])))).toEqual([['0', 'none', undefined], ['1', 'partial', undefined]]);
    expect(barred(ask({ prefer: 'full', deadChoice: 'bar' }, choice(NONE, PART, [DRAW])))).toEqual([['0', 'noChange', undefined], ['1', 'partial', undefined]]);
  });
  it('K598 an empty option ("keep it") is full and bars a part one; under deadChoice bar it is barred first, so prefer never leaves nothing enabled', () => {
    expect(barred(ask(FULL, choice([], PART)))).toEqual([['1', 'partial', undefined]]);
    const p = ask({ prefer: 'full', deadChoice: 'bar' }, choice([], PART));
    expect([barred(p), p?.options.filter((o) => o.enabled).map((o) => o.id)]).toEqual([[['0', 'noChange', undefined]], ['1']]);
  });
  it('K598 a repeated choice (it may take the same option twice): each pick is judged when it opens; after draw 2 empties the deck no option is full, the part one opens and bars the none one', () => {
    const { s, prompts } = game(FULL).play([{ op: 'repeat', times: 2, then: choice([{ op: 'draw', count: 2 }], PART) }], [['0'], ['1']]);
    expect([prompts.map(barred), cardsIn(s, 'hand:a').length, gold(s)]).toEqual([[[['1', 'partial', undefined]], [['0', 'none', undefined]]], 4, 4]);
  });
  it('K598 forcedSkip noFull: a choice handed to another seat with no full option is skipped; poor: the default, the own seat, or an unknown option still asks', () => {
    const other = (offer: OfferPolicy<S>, ...options: Eff[]) => game(offer).play([{ op: 'choosePlayer', others: true, then: choice(...options) }], [['b']], undefined, true).s.prompt;
    const NO_FULL: OfferPolicy<S> = { prefer: 'full', forcedSkip: 'noFull' };
    expect(other(NO_FULL, PART, NONE)).toBeNull();
    expect(other(FULL, PART, NONE)?.kind).toBe('chooseOption');
    expect(ask(NO_FULL, choice(PART, NONE))?.kind).toBe('chooseOption');
    expect(other(NO_FULL, PART, [{ op: 'custom', name: 'roll' }])?.kind).toBe('chooseOption');
    expect(barred(other(NO_FULL, PART, [GAIN]))).toEqual([['0', 'partial', undefined]]);
  });
  it('K598 forcedSkip noFull: eachPlayer and a choosePlayer with no seat to ask (cfg.noPlayer) hand the choice on with env.actor; poor: under nothing it is asked', () => {
    const NO_FULL: OfferPolicy<S> = { prefer: 'full', forcedSkip: 'noFull' };
    const each = (offer: OfferPolicy<S>) => game(offer).play([{ op: 'eachPlayer', then: choice(PART, NONE) }], [['0']], undefined, true);
    const e = each(NO_FULL);
    expect([e.prompts.map((p) => p.seat), e.s.prompt, each(FULL).s.prompt?.seat]).toEqual([['a'], null, 'b']);
    const none = (offer: OfferPolicy<S>) => offerGame(cardPack<G>, { offer, cfg: { seats: () => ['a'], noPlayer: () => 'b' } }).play([{ op: 'choosePlayer', others: true, then: choice(PART, NONE) }], [], undefined, true).s.prompt;
    expect([none(NO_FULL), none(FULL)?.seat]).toEqual([null, 'b']);
  });
  it('K598 prefer full needs cfg.handlers: the pack throws at build without it', () => {
    expect(() => cardPack<G>({ offer: { prefer: 'full' } })).toThrow(EngineBugError);
    expect(() => cardPack<G>({ offer: { prefer: 'full' } })).toThrow(/prefer/);
    expect(() => cardPack<G>({ offer: { prefer: 'any' } })).not.toThrow();
  });
  it('K598 with barReason why a barred option carries its skipped steps\' reasons in missing', () => {
    expect(barred(ask({ prefer: 'full', barReason: 'why' }, choice(PART, [DRAW], [{ op: 'draw', count: 3 }])))).toEqual([['0', 'partial', 'condition'], ['2', 'partial', 'short']]);
  });
  it('K598 the default (and prefer any) bars nothing: a part option is offered beside a full one', () => {
    for (const offer of [{}, { prefer: 'any' }] as OfferPolicy<S>[]) expect(barred(ask(offer, choice(PART, [DRAW])))).toEqual([]);
  });
  it('K598 the bar is the seat\'s own: an option reading a drawn card is unknown and open whatever the deck order', () => {
    const DREW2: Eff = [DRAW, { op: 'if', test: 'drew2', then: [GAIN] }];
    for (const deck of [['d1', 'd2'], ['d2', 'd1']]) expect(barred(ask(FULL, choice(DREW2, PART, [GAIN]), deck))).toEqual([['1', 'partial', undefined]]);
  });
  it('K598 the README recipe runs', () => {
    // README recipe (K598) starts
    const offer: OfferPolicy<S> = { prefer: 'full', barReason: 'why' };
    const p = offerGame(cardPack<G>, { offer }).play([{ op: 'chooseOption', options: [[GAIN, RICH], [DRAW]] }], [], undefined, true).s.prompt;
    const out = blocked(p).map((b) => `${b.id} ${b.reason} ${String(b.missing)}`);
    // out: ['0 partial condition']
    // README recipe ends
    expect(out).toEqual(['0 partial condition']);
  });
  it('K598 the README recipe for a game that counts a false condition and a declined may as full runs', () => {
    // README recipe (K598, fullIgnores) starts
    const offer: OfferPolicy<S> = { prefer: 'full', fullIgnores: ['condition', 'declined'] };
    const options = [[{ op: 'may', then: [RICH] }], [GAIN, RICH], [{ op: 'draw', count: 3 }]] as PackStep[][];
    const p = offerGame(cardPack<G>, { offer }).play([{ op: 'chooseOption', options }], [], undefined, true).s.prompt;
    const out = blocked(p).map((b) => `${b.id} ${b.reason}`);
    // out: ['2 partial']: the may and the false if are full, the short draw is not
    // README recipe ends
    expect(out).toEqual(['2 partial']);
  });
});

// K598 interface row: on random small choices the barred set equals what exhaustive real play of each option gives (full,
// part or none; an option the check answers unknown is open), and is the same in every hidden world.
describe('card-language prefer full (K598): agrees with playing every answer', () => {
  const WORLDS = [['d1', 'd2'], ['d2', 'd1'], ['d3', 'd4']].flatMap((deck) => [['b1', 'b2', 'b3'], ['b4', 'b5', 'b6']].map((b) => offerGame(cardPack<G>, { offer: { prefer: 'full', branches: 3000 }, deck, b, marks: true })));
  it('K598 600 random choices: barred set from real play of every answer, unknown open, the same in every hidden world', () => {
    const n = { choices: 0, barred: 0, skipped: 0, open: 0, unknown: 0, deeper: 0 };
    for (const seed of [598, 5981, 5982]) {
      const eff = gen(seed, true);
      for (let i = 0; i < 200; i += 1) {
        const options = Array.from({ length: 2 + (i % 2) }, () => eff(1));
        // Declared (K583, as in K597's comparison): looking at a card the seat already sees is no change in the check; a real run records it.
        if (options.some((o) => has(o, (st) => (st.op === 'lookAt' || st.op === 'reveal') && st.cards === 'all' && st.from !== 'deck'))) continue;
        const shown = WORLDS.map((g) => {
          const p = g.play(choice(...options), [], undefined, true).s.prompt;
          return p === null ? 'skip' : JSON.stringify(blocked(p).map((b) => [b.id, b.reason]));
        });
        if (shown.some((x) => x !== shown[0])) throw new Error(`barred differs between hidden worlds: ${shown.join()}: ${JSON.stringify(options)}`);
        const [w] = WORLDS;
        if (w === undefined) throw new Error('no world');
        const { s, content } = w.at();
        const rs = options.map((o) => w.pack.resolves(s, content, o, { seat: 'a', source: 'p1' }).answer);
        const ts = options.map((o, k) => {
          if (rs[k] === 'unknown') return 'unknown';
          const all = WORLDS.flatMap((g) => ['s', 't'].map((sd) => truth(g, o, sd)));
          if (all.some((t) => t === undefined)) return undefined;
          if (all.some((t) => t !== rs[k] && !shortOf(o, { answer: rs[k] ?? '' }, t))) throw new Error(`resolves ${String(rs[k])}, real play ${all.join()}: ${JSON.stringify(o)}`);
          return rs[k];
        });
        if (ts.some((t) => t === undefined)) continue;
        n.choices += 1;
        n.unknown += ts.includes('unknown') ? 1 : 0;
        // K598 second review: the bars read pack.grade (the whole step tree): full only where resolves is; where both are known, never above resolves and none exactly where resolves is (the tree may know more or less than the top-level parts, so unknown may differ).
        const rank = ['none', 'part', 'full'];
        const gs = options.map((o, k) => {
          const x = w.pack.grade(s, content, o, { seat: 'a', source: 'p1' }).answer;
          if ((x === 'full' && ts[k] !== 'full') || (x !== 'unknown' && ts[k] !== 'unknown' && ((x === 'none') !== (ts[k] === 'none') || rank.indexOf(x) > rank.indexOf(ts[k] ?? '')))) throw new Error(`grade ${x}, resolves ${String(ts[k])}: ${JSON.stringify(o)}`);
          n.deeper += x !== ts[k] ? 1 : 0;
          return x;
        });
        const want = gs.every((t) => t === 'none') ? 'skip' : JSON.stringify(gs.flatMap((t, k) => (gs.includes('full') && t === 'part' ? [[String(k), 'partial']] : (gs.includes('full') || gs.includes('part')) && t === 'none' ? [[String(k), 'none']] : [])));
        expect([options, shown[0]]).toEqual([options, want]);
        n[want === 'skip' ? 'skipped' : want === '[]' ? 'open' : 'barred'] += 1;
      }
    }
    console.log(`K598 comparison: ${JSON.stringify(n)}`);
    expect(n.choices).toBeGreaterThan(300);
    expect(n.barred).toBeGreaterThan(20);
    expect(n.skipped).toBeGreaterThan(5);
    expect(n.open).toBeGreaterThan(20);
    expect(n.unknown).toBeGreaterThan(20);
    expect(n.deeper).toBeGreaterThan(5);
    expect(inDryRun()).toBe(false);
  }, 240000);
});

// K598 second review: with fullIgnores the bars are still the seat's own (the same in every hidden world).
describe('card-language prefer full (K598): fullIgnores keeps hidden worlds apart', () => {
  it('K598 fullIgnores: 200 random choices give the same bars in every hidden world', () => {
    const offer: OfferPolicy<S> = { prefer: 'full', fullIgnores: ['condition', 'declined', 'emptyZone', 'noTarget'], barReason: 'why' };
    const worlds = [['d1', 'd2'], ['d2', 'd1'], ['d3', 'd4']].flatMap((deck) => [['b1', 'b2', 'b3'], ['b4', 'b5', 'b6']].map((b) => offerGame(cardPack<G>, { offer, deck, b, marks: true })));
    const eff = gen(5984, true);
    let barred = 0;
    for (let i = 0; i < 200; i += 1) {
      const options = Array.from({ length: 2 + (i % 2) }, () => eff(1));
      const shown = worlds.map((g) => {
        const p = g.play(choice(...options), [], undefined, true).s.prompt;
        return p === null ? 'skip' : JSON.stringify(blocked(p).map((b) => [b.id, b.reason, b.missing]));
      });
      expect([options, shown.filter((x) => x !== shown[0])]).toEqual([options, []]);
      barred += shown[0] !== 'skip' && shown[0] !== '[]' ? 1 : 0;
    }
    expect(barred).toBeGreaterThan(20);
  }, 240000);
});

// K598 review: every combination of prefer, deadChoice and forcedSkip on random choices (own seat and another seat's):
// a choice never opens with nothing enabled, and it is skipped exactly when a rule says so.
describe('card-language prefer full (K598): never a choice with nothing enabled', () => {
  it('K598 random choices under every prefer x deadChoice x forcedSkip: at least one enabled option, or skipped by rule', () => {
    const n = { asked: 0, skipped: 0, barred: 0 };
    const IGN: readonly (readonly ('condition' | 'declined')[])[] = [[], ['condition', 'declined']];
    const pol = (['any', 'full'] as const).flatMap((prefer) => (['today', 'skip', 'bar'] as const).flatMap((deadChoice) => (['nothing', 'noFull'] as const).flatMap((forcedSkip) => (prefer === 'full' ? IGN : IGN.slice(0, 1)).map((fullIgnores): OfferPolicy<S> => ({ prefer, deadChoice, forcedSkip, fullIgnores })))));
    for (const offer of pol) {
      const g = game(offer);
      const { s, content } = g.at();
      const eff = gen(5983, true);
      for (let i = 0; i < 60; i += 1) {
        const options = Array.from({ length: 1 + (i % 3) }, (_, k) => (k === 1 && i % 4 === 0 ? [] : eff(1)));
        const forced = i % 2 === 1;
        const p = forced ? g.play([{ op: 'choosePlayer', others: true, then: choice(...options) }], [['b']], undefined, true).s.prompt : g.play(choice(...options), [], undefined, true).s.prompt;
        const env = forced ? { seat: 'b', source: 'p1', actor: 'a' } : { seat: 'a', source: 'p1' };
        const live = options.map((o) => offer.deadChoice === 'today' || g.pack.wouldChange(s, content, o, env) !== 'no');
        const on = live.map((l) => l || offer.deadChoice !== 'bar');
        const rs = options.map((o, k) => (on[k] === true ? g.pack.grade(s, content, o, env).answer : undefined));
        const skip = !live.some(Boolean) || (offer.prefer === 'full' && (offer.forcedSkip === 'noFull' && forced ? !rs.some((r) => r === 'full' || r === 'unknown') : rs.every((r) => r === undefined || r === 'none')));
        expect([options, p === null]).toEqual([options, skip]);
        if (p !== null) expect([options, p.options.some((o) => o.enabled)]).toEqual([options, true]);
        // K598 second review: a none option is barred beside a part one, under prefer full only.
        if (p !== null && offer.prefer === 'full' && !rs.includes('full') && rs.includes('part')) expect([options, p.options.filter((_, k) => rs[k] === 'none').every((o) => !o.enabled)]).toEqual([options, true]);
        n[p === null ? 'skipped' : 'asked'] += 1;
        n.barred += p?.options.some((o) => !o.enabled) === true ? 1 : 0;
      }
    }
    expect(n.asked).toBeGreaterThan(400);
    expect(n.skipped).toBeGreaterThan(30);
    expect(n.barred).toBeGreaterThan(50);
  }, 240000);
});
