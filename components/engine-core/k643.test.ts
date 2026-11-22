// K643: cases of older engines restated on a fake game: replacement, prevention and windows. Each title starts with the
// case it restates (letter of the engine, number in its list). "today" in a title: the kit's present behaviour is
// pinned where the case's expectation is one of two legitimate readings.
import { describe, expect, it } from 'vitest';
import { applyAction, changeOccurrence, type Ctx, type GameRules, type Occurrence, type OccurrenceInput, type Replacement, type TimingConfig } from './index.ts';
import { add, answer, caseGame, startCases, type Cases, type CaseState } from './fake/casesK643.ts';

const go = (g: GameRules<Cases>, items: readonly OccurrenceInput[], n: Record<string, number> = {}) => {
  const s0 = startCases(g, { items, n });
  return applyAction(g, s0, answer(s0, 'go'), null);
};
const pick = (g: GameRules<Cases>, s: CaseState, id: string): CaseState => applyAction(g, s, answer(s, id), null).state;
const ids = (s: CaseState): string[] | undefined => s.prompt?.options.map((o) => o.id);
const rep = (id: number, label: string, controller = 'p2'): Replacement => ({ id, controller, cls: 0, label });
const DONE = { done: true };

describe('S B20: an effect with nothing to act on (K643)', () => {
  const ATTACK: OccurrenceInput = { kind: 'attack', keys: { player: 'p2', source: 'p1' } };
  const WALL = rep(201, 'Wall');
  const DECOY = rep(202, 'Decoy');
  const game = (cands: (s: CaseState) => readonly Replacement[]) =>
    caseGame({
      happen: (ctx) => {
        if ((ctx.s.n['hand'] ?? 0) > 0) add(ctx, 'hand', -1);
      },
      replacementsFor: (s, o) => (o.kind === 'attack' ? cands(s) : []),
      applyReplacement: (ctx, r) => {
        add(ctx, r.label === 'Wall' ? 'wall' : 'decoy', -1);
        add(ctx, 'discard');
        return 'skipped';
      },
      triggersFor: (_s, o) => (o.kind === 'attack' ? [{ ability: 'afterAttack', source: 'c1', player: 'p2' }] : []),
      resolveTrigger: (ctx) => add(ctx, 'afterFired'),
    });

  it('S B20 an attack that is an occurrence happens with an empty hand: its after-trigger fires', () => {
    const r = go(game(() => []), [ATTACK], { hand: 0 });
    expect(r.state.prompt).toBeNull();
    expect(r.events).toEqual([{ type: 'did', kind: 'attack', n: 1, seq: 1, batch: 1, occurrence: 2 }]);
    expect(r.state.n).toEqual({ hand: 0, afterFired: 1 });
    expect(r.state.result).toEqual(DONE);
  });

  it('S B20 a lone mandatory replacement of an attack with nothing to act on applies with no prompt and discards itself', () => {
    const r = go(game((s) => ((s.n['wall'] ?? 0) > 0 ? [WALL] : [])), [ATTACK], { hand: 0, wall: 1, decoy: 1 });
    expect(r.state.prompt).toBeNull();
    expect(r.state.n).toEqual({ hand: 0, wall: 0, decoy: 1, discard: 1 });
    expect(r.events).toEqual([]);
    expect(r.state.result).toEqual(DONE);
  });

  it('S B20 today: an optional replacement the game lists beside the mandatory one is offered (the kit asks which applies); leaving it out is the game\'s replacementsFor', () => {
    const g = game(() => [WALL, DECOY]);
    const s1 = go(g, [ATTACK], { hand: 0, wall: 1, decoy: 1 }).state;
    expect(s1.prompt).toMatchObject({ kind: 'timing.replace', seat: 'p2', min: 1, max: 1 });
    expect(ids(s1)).toEqual(['201', '202']);
    expect(pick(g, s1, '202').n).toEqual({ hand: 0, wall: 1, decoy: 0, discard: 1 });
  });

  it('S B20 today: a batch with no item makes no occurrence: no replacement applies and no after-trigger fires', () => {
    const r = go(game(() => [WALL]), [], { hand: 0, wall: 1 });
    expect(r.state.prompt).toBeNull();
    expect(r.state.n).toEqual({ hand: 0, wall: 1 });
    expect(r.state.timing?.occurrences).toEqual([]);
    expect(r.events).toEqual([]);
    expect(r.state.result).toEqual(DONE);
  });
});

const harm = (ctx: Ctx<Cases>, o: Occurrence): void => {
  if (o.kind === 'loseUnit') add(ctx, `units:${o.keys.player ?? ''}`, -(o.amount ?? 1));
  else add(ctx, `penalties:${o.keys.player ?? ''}`, o.amount ?? 1);
};
const ASK = (...names: string[]) => ({ min: 1, max: 1, options: names.map((id) => ({ id, enabled: true })), seat: 'p2' });

describe('I B9: a protection cancels one action of an attack, not the whole attack (K643)', () => {
  // one batch of two actions; the before-window of the first asks once; the protection is a replacement that skips the kinds it names
  const ITEMS: OccurrenceInput[] = [{ kind: 'loseUnit', keys: { player: 'p2', source: 'p1' } }, { kind: 'takePenalty', keys: { player: 'p2', source: 'p1' } }];
  const game = (names: readonly string[]) =>
    caseGame({
      happen: harm,
      before: (ctx, o) => {
        if (o.id === o.batch + 1) ctx.ask(ASK('guard', 'let'), { kind: 'guarded' });
      },
      replacementsFor: (s, o) => (s.n['guarded'] === 1 && names.includes(o.kind) ? [rep(301, 'Guard')] : []),
      applyReplacement: () => 'skipped',
    }, {
      guarded: (ctx, t) => {
        if (t.answer?.[0] === 'guard') add(ctx, 'guarded');
      },
    });
  const play = (names: readonly string[], choice: string): CaseState => {
    const g = game(names);
    const s1 = go(g, ITEMS, { 'units:p2': 1 }).state;
    expect(ids(s1)).toEqual(['guard', 'let']);
    const s2 = pick(g, s1, choice);
    expect(s2.prompt).toBeNull();
    expect(s2.result).toEqual(DONE);
    return s2;
  };

  it('I B9 a protection that names the loss ignores it: the unit stays, the penalty is still taken', () => {
    const s = play(['loseUnit'], 'guard');
    expect(s.n).toEqual({ 'units:p2': 1, guarded: 1, 'penalties:p2': 1 });
  });

  it('I B9 a protection that names only the penalty leaves the loss: the unit goes, no penalty', () => {
    expect(play(['takePenalty'], 'guard').n).toEqual({ 'units:p2': 0, guarded: 1 });
  });

  it('I B9 a protection that names both: neither happens', () => {
    expect(play(['loseUnit', 'takePenalty'], 'guard').n).toEqual({ 'units:p2': 1, guarded: 1 });
  });

  it('I B9 let it resolve: both happen', () => {
    expect(play(['loseUnit'], 'let').n).toEqual({ 'units:p2': 0, 'penalties:p2': 1 });
  });
});

describe('I B15: no protection, no prompt; several, one option each plus "let it resolve" (K643)', () => {
  const game = (guards: readonly string[]) =>
    caseGame({ happen: harm, preventions: () => guards.map((id) => ({ id, prevention: { prevents: 'loseUnit' } })) });
  const LOSE: OccurrenceInput = { kind: 'loseUnit', keys: { player: 'p2', source: 'p1' }, amount: 1 };

  it('I B15 no protection: no prompt, the unit is lost', () => {
    const s = go(game([]), [LOSE], { 'units:p2': 1 }).state;
    expect(s.prompt).toBeNull();
    expect(s.timing?.windows).toEqual([]);
    expect(s.n).toEqual({ 'units:p2': 0 });
    expect(s.result).toEqual(DONE);
  });

  it('I B15 one protection: it and "let it resolve"', () => {
    expect(ids(go(game(['a']), [LOSE], { 'units:p2': 1 }).state)).toEqual(['a', 'pass']);
  });

  it('I B15 two protections: one option each and "let it resolve", none preselected', () => {
    const g = game(['a', 'b']);
    const s1 = go(g, [LOSE], { 'units:p2': 1 }).state;
    expect(s1.prompt).toEqual({ id: s1.prompt?.id, kind: 'timing.prevent', seat: 'p2', min: 1, max: 1, options: [{ id: 'a', enabled: true }, { id: 'b', enabled: true }, { id: 'pass', enabled: true }] });
    expect(pick(g, s1, 'pass').n).toEqual({ 'units:p2': 0 });
    const kept = pick(g, s1, 'b');
    expect(kept.n).toEqual({ 'units:p2': 1 });
    expect(kept.result).toEqual(DONE);
  });

  it('I B15 an occurrence with no amount opens no prevention window: its protections are asked in the before window', () => {
    const NO_AMOUNT: OccurrenceInput = { kind: 'loseUnit', keys: { player: 'p2', source: 'p1' } };
    const s = go(game(['a', 'b']), [NO_AMOUNT], { 'units:p2': 1 }).state;
    expect(s.prompt).toBeNull();
    expect(s.n).toEqual({ 'units:p2': 0 });
    const g = caseGame({
      happen: harm,
      before: (ctx, o) => ctx.ask(ASK('a', 'b', 'let'), { kind: 'guarded', occ: o.id }),
      replacementsFor: (st) => (st.n['guarded'] === 1 ? [rep(302, 'Guard')] : []),
      applyReplacement: () => 'skipped',
    }, {
      guarded: (ctx, t) => {
        if (t.answer?.[0] !== 'let') add(ctx, 'guarded');
      },
    });
    const s1 = go(g, [NO_AMOUNT], { 'units:p2': 1 }).state;
    expect(s1.timing?.windows).toEqual([{ timing: 'before', kind: 'loseUnit', batch: 1, occurrence: 2 }]);
    expect(s1.prompt?.options).toEqual([{ id: 'a', enabled: true }, { id: 'b', enabled: true }, { id: 'let', enabled: true }]);
    expect(pick(g, s1, 'a').n).toEqual({ 'units:p2': 1, guarded: 1 });
    expect(pick(g, s1, 'let').n).toEqual({ 'units:p2': 0 });
  });
});

describe('I B16: an effect on all players gives its actor no protection window (K643)', () => {
  it('I B16 the actor holds a protection, is asked nothing and takes the penalty; each other player gets a window', () => {
    const g = caseGame({
      happen: harm,
      preventions: (_s, o) => (o.keys.player === o.keys.source ? [] : [{ id: `guard-${o.keys.player ?? ''}`, prevention: { prevents: 'takePenalty' } }]),
    });
    const s1 = go(g, ['p1', 'p2', 'p3'].map((player) => ({ kind: 'takePenalty', keys: { player, source: 'p1' }, amount: 1 })), {}).state;
    expect(s1.n).toEqual({ 'penalties:p1': 1 });
    expect(s1.prompt?.seat).toBe('p2');
    expect(ids(s1)).toEqual(['guard-p2', 'pass']);
    const s2 = pick(g, s1, 'pass');
    expect(s2.prompt?.seat).toBe('p3');
    expect(ids(s2)).toEqual(['guard-p3', 'pass']);
    const s3 = pick(g, s2, 'guard-p3');
    expect(s3.prompt).toBeNull();
    expect(s3.n).toEqual({ 'penalties:p1': 1, 'penalties:p2': 1 });
    expect(s3.result).toEqual(DONE);
  });
});

describe('I B17: a dependant reads the replaced amount (K643)', () => {
  // "move 1 gem from the shared pool onto a row card": the pool gives what the occurrence finally says
  const PLACE: OccurrenceInput = { kind: 'place', keys: { player: 'p1', target: 'row1', other: 'gem' }, amount: 1 };
  const game = (patch?: Parameters<typeof changeOccurrence>[2]) =>
    caseGame({
      happen: (ctx, o) => {
        add(ctx, 'pool', -(o.amount ?? 0));
        add(ctx, `${o.keys.target ?? ''}:${o.keys.other ?? ''}`, o.amount ?? 0);
      },
      replacementsFor: () => (patch === undefined ? [] : [rep(401, 'More', 'p1')]),
      applyReplacement: (ctx, _r, o) => {
        changeOccurrence(ctx, o.id, patch ?? {});
        return 'updated';
      },
    });

  it('I B17 no replacement: 1 leaves the pool of 3 and 1 is placed', () => {
    expect(go(game(), [PLACE], { pool: 3 }).state.n).toEqual({ pool: 2, 'row1:gem': 1 });
  });

  it('I B17 "place 2 instead": 2 leave the pool and 2 are placed; the event says 2', () => {
    const r = go(game({ amount: 2 }), [PLACE], { pool: 3 });
    expect(r.state.n).toEqual({ pool: 1, 'row1:gem': 2 });
    expect(r.events).toEqual([{ type: 'did', kind: 'place', n: 2, seq: 1, batch: 1, occurrence: 2 }]);
  });

  it('I B17 "place 1 wood instead": the pool gives 1 and the card holds 1 wood, no gem', () => {
    expect(go(game({ amount: 1, keys: { other: 'wood' } }), [PLACE], { pool: 3 }).state.n).toEqual({ pool: 2, 'row1:wood': 1 });
  });
});

const land = (ctx: Ctx<Cases>, o: Occurrence): void => add(ctx, o.keys.target ?? 'bag', o.amount ?? 1);

describe('I B18: a replacement limited by the reason of the event (K643)', () => {
  it('I B18 a gain by an effect goes onto the holder; a return from a leaving card and another player\'s gain do not', () => {
    const g = caseGame({
      happen: land,
      replacementsFor: (_s, o) => (o.kind === 'gain' && o.keys.source === 'effect' && o.keys.player === 'p1' ? [rep(501, 'Holder', 'p1')] : []),
      applyReplacement: (ctx, _r, o) => {
        changeOccurrence(ctx, o.id, { keys: { target: 'holder' } });
        return 'updated';
      },
    });
    const r = go(g, [
      { kind: 'gain', keys: { player: 'p1', source: 'effect', target: 'pool:p1' }, amount: 2 },
      { kind: 'gain', keys: { player: 'p1', source: 'return', target: 'pool:p1' }, amount: 1 },
      { kind: 'gain', keys: { player: 'p2', source: 'effect', target: 'pool:p2' }, amount: 1 },
    ]);
    expect(r.state.prompt).toBeNull();
    expect(r.state.n).toEqual({ holder: 2, 'pool:p1': 1, 'pool:p2': 1 });
    expect(r.events.map((e) => e.n)).toEqual([2, 1, 1]);
  });
});

describe('I B19: "instead of pile A" means A never held the card (K643)', () => {
  const game = (stays: boolean) =>
    caseGame({
      happen: (ctx) => add(ctx, 'discard'),
      replacementsFor: (_s, o) => (stays && o.kind === 'toDiscard' && o.keys.target === 'e' ? [rep(601, 'Stay', 'p1')] : []),
      applyReplacement: (ctx) => {
        ctx.then({ kind: 'toPlay' });
        return 'replaced';
      },
      triggersFor: (_s, o) => (o.kind === 'toDiscard' && o.keys.target === 'e' ? [{ ability: 'flip', source: 'stateCard', player: 'p1' }] : []),
      resolveTrigger: (ctx) => add(ctx, 'flipped'),
    }, { toPlay: (ctx) => add(ctx, 'play') });
  const E: OccurrenceInput = { kind: 'toDiscard', keys: { player: 'p1', target: 'e' } };

  it('I B19 without the replacement the card reaches the pile: the arrival event and what the arrival causes', () => {
    const r = go(game(false), [E]);
    expect(r.state.n).toEqual({ discard: 1, flipped: 1 });
    expect(r.events).toEqual([{ type: 'did', kind: 'toDiscard', n: 1, seq: 1, batch: 1, occurrence: 2 }]);
  });

  it('I B19 replaced: the card is in play, the pile never held it, no arrival event, nothing its arrival would cause', () => {
    const r = go(game(true), [E]);
    expect(r.state.n).toEqual({ play: 1 });
    expect(r.events).toEqual([]);
    expect(r.state.timing?.pending ?? []).toEqual([]);
    expect(r.state.result).toEqual(DONE);
  });
});

describe('W B25: "gains from origin X go to zone Z" touches only that origin (K643)', () => {
  const g = caseGame({
    happen: land,
    replacementsFor: (_s, o) => (o.kind === 'gain' && o.keys.source === 'rewardB' && o.keys.target === undefined ? [rep(701, 'Redirect', 'p1')] : []),
    applyReplacement: (ctx, _r, o) => {
      changeOccurrence(ctx, o.id, { keys: { target: 'hand' } });
      return 'updated';
    },
  });
  const gain = (source: string, target?: string): OccurrenceInput => ({ kind: 'gain', keys: { player: 'p1', source, ...(target === undefined ? {} : { target }) }, amount: 1 });

  it('W B25 a reward by B lands in the hand; a reward by A, a purchase and an effect gain land in the bag', () => {
    const s = go(g, [gain('rewardB'), gain('rewardA'), gain('purchase'), gain('effect')]).state;
    expect(s.prompt).toBeNull();
    expect(s.n).toEqual({ hand: 1, bag: 3 });
  });

  it('W B25 a destination named by the effect itself wins over the redirect', () => {
    expect(go(g, [gain('rewardB', 'bag')]).state.n).toEqual({ bag: 1 });
    expect(go(g, [gain('rewardB', 'board')]).state.n).toEqual({ board: 1 });
  });
});

describe('E B18: a replacement and the leaving of its own source; a capacity (K643)', () => {
  // K: "when one of your tools would be discarded, tuck it under K instead (at most 2)"
  const game = (cfg: Pick<TimingConfig<Cases>, 'replacementsFor'>) =>
    caseGame({
      happen: (ctx, o) => add(ctx, `discard:${o.keys.target ?? ''}`),
      applyReplacement: (ctx, _r, o) => {
        add(ctx, `tucked:${o.keys.target ?? ''}`);
        add(ctx, 'tucked');
        return 'replaced';
      },
      ...cfg,
    });
  const ITEMS = ['t1', 't2', 't3', 'k'].map((target): OccurrenceInput => ({ kind: 'toDiscard', keys: { player: 'p1', target } }));
  const K = rep(801, 'Keeper', 'p1');

  it('E B18 the game leaves the source and a full keeper out of replacementsFor: two tools tucked, the third and the keeper itself are discarded, no prompt', () => {
    const s = go(game({ replacementsFor: (st, o) => (o.keys.target !== 'k' && (st.n['tucked'] ?? 0) < 2 ? [K] : []) }), ITEMS).state;
    expect(s.prompt).toBeNull();
    expect(s.n).toEqual({ 'tucked:t1': 1, 'tucked:t2': 1, tucked: 2, 'discard:t3': 1, 'discard:k': 1 });
    expect(s.result).toEqual(DONE);
  });

  it('E B18 today: the kit knows neither a replacement\'s source nor a capacity: one the game always lists also replaces its own source\'s leaving', () => {
    const s = go(game({ replacementsFor: () => [K] }), ITEMS).state;
    expect(s.prompt).toBeNull();
    expect(s.n).toEqual({ 'tucked:t1': 1, 'tucked:t2': 1, 'tucked:t3': 1, 'tucked:k': 1, tucked: 4 });
  });
});
