// K223 (GAPS D1): zones as data, moves through the copy-on-write barrier, shuffle by ctx.rng, the per-seat view.
import { afterEach, describe, expect, it } from 'vitest';
import { applyActionWith, createGame, draftOf, hashState, isCurrent, newObjectTrack, refOf, lastKnown, setCowChecks, setStateFreezing, type Ctx } from '../engine-core/index';
import { CONTENT, COUNTER, type Counter, type CounterState } from '../engine-core/fake/counter';
import { canSee, cardsIn, draw, hiddenFrom, locate, moveCard, newZones, place, reveal, seatZone, shuffleZone, viewOf, zoneProblems, type Zoned } from './index';

const DECK = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
const zones = () =>
  newZones({
    deck: { seen: 'count', cards: DECK },
    [seatZone('hand', 'a')]: { seen: 'owner', owner: 'a' },
    [seatZone('hand', 'b')]: { seen: 'owner', owner: 'b' },
    discard: { seen: 'all' },
    market: { seen: 'top' },
    box: { seen: 'none', cards: ['x1'] },
  });
const fresh = (): Zoned => ({ zones: zones() });

describe('moves', () => {
  it('draw takes from the top in order; move puts at top, bottom or index; every card stays in one place', () => {
    const s = fresh();
    expect(draw(s, 'deck', 'hand:a', 2)).toEqual(['c1', 'c2']);
    expect(cardsIn(s, 'hand:a')).toEqual(['c1', 'c2']);
    expect(moveCard(s, 'c1', 'discard')).toBe('hand:a');
    moveCard(s, 'c3', 'discard', 'bottom');
    moveCard(s, 'c4', 'discard', 1);
    expect(cardsIn(s, 'discard')).toEqual(['c1', 'c4', 'c3']);
    expect(locate(s, 'c4')).toEqual({ zone: 'discard', index: 1 });
    expect(draw(s, 'deck', 'hand:b', 9)).toEqual(['c5', 'c6']);
    place(s, 't1', 'market');
    expect(zoneProblems(s, 8)).toEqual([]);
    expect(() => place(s, 't1', 'market')).toThrow();
    expect(() => moveCard(s, 'nope', 'market')).toThrow();
    expect(() => moveCard(s, 'c1', 'nowhere')).toThrow();
    expect(zoneProblems({ zones: { a: { seen: 'all', cards: ['q'] }, b: { seen: 'all', cards: ['q'] } } })).toEqual(['q in a and b']);
  });
});

describe('the view of a seat', () => {
  it('owner, all, top, count and none; a reveal lasts until the card leaves', () => {
    const s = fresh();
    draw(s, 'deck', 'hand:a', 2);
    draw(s, 'deck', 'market', 2, 'top');
    const b = viewOf(s, 'b');
    expect(b['hand:a']).toEqual({ count: 2, owner: 'a' });
    expect(viewOf(s, 'a')['hand:a']?.cards).toEqual(['c1', 'c2']);
    expect(b['market']?.cards).toEqual(['c4', null]);
    expect(b['deck']).toEqual({ count: 2 });
    expect(b['box']).toBeUndefined();
    reveal(s, 'hand:a', ['c2'], ['b']);
    expect(viewOf(s, 'b')['hand:a']?.cards).toEqual([null, 'c2']);
    expect(canSee(s, 'b', 'c2')).toBe(true);
    moveCard(s, 'c2', 'hand:a', 'bottom');
    expect(canSee(s, 'b', 'c2')).toBe(false);
    expect(s.zones['hand:a']?.shown).toBeUndefined();
    expect(hiddenFrom(s, 'b').sort()).toEqual(['c1', 'c2', 'c3', 'c5', 'c6', 'x1']);
  });
});

describe('reveals and hidden sizes', () => {
  it('reveal to all; a none zone shows only revealed cards, never its size; a top zone shows a revealed card below the top', () => {
    const s = fresh();
    moveCard(s, 'c1', 'box');
    expect(viewOf(s, 'a')['box']).toBeUndefined();
    reveal(s, 'box', ['x1'], 'all');
    expect(viewOf(s, 'b')['box']).toEqual({ cards: ['x1'] });
    expect(JSON.stringify(viewOf(s, 'b')['box'])).not.toContain('2');
    draw(s, 'deck', 'market', 2, 'top');
    reveal(s, 'market', ['c2'], ['a']);
    expect(viewOf(s, 'a')['market']?.cards).toEqual(['c3', 'c2']);
    expect(viewOf(s, 'b')['market']?.cards).toEqual(['c3', null]);
  });

  it('shuffleZone forgets reveals', () => {
    const base = createGame(COUNTER, { seed: 'k223r' }, { target: 1000 }, CONTENT).state;
    const s0 = { ...base, zones: zones() };
    reveal(s0, 'deck', ['c4'], 'all');
    const table = { ...COUNTER.handlers, chosen: (ctx: Ctx<Counter>) => { shuffleZone(ctx, 'deck'); } };
    const r = applyActionWith(COUNTER, s0, { kind: 'answer', promptId: s0.prompt?.id ?? -1, picks: ['add'] }, CONTENT, table).state as unknown as Zoned;
    expect(s0.zones['deck']?.shown).toEqual({ c4: ['*'] });
    expect(r.zones['deck']?.shown).toBeUndefined();
    expect(canSee(r, 'a', 'c4')).toBe(false);
  });
});

describe('object references (engine-core objref)', () => {
  it('a move makes old references stale and keeps the snapshot', () => {
    const s = { zones: zones(), objRefs: newObjectTrack<unknown>() };
    const r0 = refOf(s, 'c1');
    draw(s, 'deck', 'hand:a');
    expect(isCurrent(s, r0)).toBe(false);
    expect(lastKnown(s, r0)).toEqual({ id: 'c1', zcc: 0, zone: 'deck', obj: 'c1' });
    moveCard(s, 'c1', 'discard', 'top', { power: 2 });
    expect(lastKnown(s, { id: 'c1', zcc: 1 })?.obj).toEqual({ power: 2 });
  });
});

describe('inside an action (copy on write, ctx.rng)', () => {
  afterEach(() => {
    setCowChecks(false);
    setStateFreezing(false);
  });
  type T = CounterState & Zoned;
  const run = (seed: string) => {
    const base = createGame(COUNTER, { seed }, { target: 1000 }, CONTENT).state;
    const s0 = { ...base, zones: zones() } as T;
    const chosen = COUNTER.handlers['chosen'];
    const table = {
      ...COUNTER.handlers,
      chosen: (ctx: Ctx<Counter>, task: Counter['task']) => {
        shuffleZone(ctx, 'deck');
        const s = draftOf(ctx) as unknown as Zoned;
        draw(s, 'deck', 'hand:a', 2);
        draw(s, 'deck', 'discard');
        chosen?.(ctx, task);
      },
    };
    const r = applyActionWith(COUNTER, s0, { kind: 'answer', promptId: s0.prompt?.id ?? -1, picks: ['add'] }, CONTENT, table).state as T;
    return { s0, r };
  };

  it('writes through the barrier, leaves the input alone and replays the same from the seed', () => {
    setCowChecks(true);
    setStateFreezing(true);
    const { s0, r } = run('k223');
    expect(s0.zones).toEqual(zones());
    expect(zoneProblems(r, 7)).toEqual([]);
    expect(hashState(run('k223').r)).toBe(hashState(r));
    expect(JSON.parse(JSON.stringify(r)) as T).toEqual(r);
  });

  it('K223 view-only rule: a hidden card never reaches another seat, by id, order or rng', () => {
    const seeds = ['s1', 's2', 's3', 's4', 's5'].map((x) => run(x).r);
    for (const r of seeds) {
      const json = JSON.stringify(viewOf(r, 'b'));
      for (const id of hiddenFrom(r, 'b')) expect(json).not.toContain(`"${id}"`);
      for (const w of Object.values(r.rng)) expect(json).not.toContain(String(w));
    }
    // whatever b cannot see differs between seeds; b's view differs only in the public discard
    const strip = (r: T) => ({ ...viewOf(r, 'b'), discard: null });
    for (const r of seeds) expect(strip(r)).toEqual(strip(seeds[0]!));
    expect(new Set(seeds.map((r) => JSON.stringify(cardsIn(r, 'hand:a')))).size).toBeGreaterThan(1);
  });
});
