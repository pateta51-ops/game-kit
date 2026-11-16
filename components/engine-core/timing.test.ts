// K93: batches with cancel, ignore and instead; shared keys; the prevention window as card data.
import { afterEach, describe, expect, it } from 'vitest';
import { advance, applyAction, cancelBatch, createGame, draftOf, EngineBugError, ignoreBatch, insteadOf, prevent, setCowChecks, setStateFreezing, sharedKeys, would, type Ctx, type PreventionOffer } from './index.ts';
import { CONTENT, COUNTER, playGame, RULES } from './fake/counter.ts';
import { answer, HIT, SHIELD, startTimed, timedGame, WARD, type Timed, type TimedState } from './fake/timed.ts';

const hit = (g: ReturnType<typeof timedGame>, s0 = startTimed(g)) => applyAction(g, s0, answer(s0, 'hit'), null);
const offersOf = (s: TimedState): PreventionOffer[] => [
  { id: 'shield', prevention: SHIELD },
  { id: 'ward', prevention: WARD, used: s.used['ward'] ?? 0 },
  { id: 'card-draw', prevention: { prevents: 'draw' } },
];
const countUse = (ctx: Ctx<Timed>, f: PreventionOffer): void => {
  const s = draftOf(ctx);
  s.used = { ...s.used, [f.id]: (s.used[f.id] ?? 0) + 1 };
};

describe('batches (K93)', () => {
  afterEach(() => {
    setCowChecks(false);
    setStateFreezing(false);
  });

  it('a game that never starts a batch has no timing state and replays as before', () => {
    expect(createGame(COUNTER, { seed: 'k93' }, RULES, CONTENT).state).not.toHaveProperty('timing');
    const a = playGame('k93');
    expect(a.state).not.toHaveProperty('timing');
    expect(playGame('k93').state).toEqual(a.state);
  });

  it('without windows asked, the occurrence happens and its event carries batch and occurrence', () => {
    const r = hit(timedGame());
    expect(r.state.hp).toBe(7);
    expect(r.events).toEqual([{ type: 'damaged', n: 3, target: 'u1', seq: 1, batch: 1, occurrence: 2 }]);
    expect(r.state.timing).toMatchObject({ next: 3, current: null, windows: [], occurrences: [{ id: 2, state: 'happened' }] });
  });

  it('cancelBatch in the before window: the effect, its windows and its tasks are gone, current cleared (Arkham bug)', () => {
    const g = timedGame({
      before: (ctx, o) => {
        ctx.then({ kind: 'answered', occ: o.id });
        ctx.ask({ min: 1, max: 1, options: [{ id: 'cancel', enabled: true }, { id: 'allow', enabled: true }], player: 'p2' });
      },
    }, {
      answered: (ctx, t) => {
        if (t.answer?.[0] === 'cancel') cancelBatch(ctx, 1);
      },
    });
    const s1 = hit(g).state;
    expect(s1.prompt?.player).toBe('p2');
    expect(s1.timing?.windows).toEqual([{ timing: 'before', kind: 'damage', batch: 1, occurrence: 2 }]);
    expect(s1.stack.at(-1)).toEqual({ kind: 'answered', occ: 2, batch: 1 });
    const c = applyAction(g, s1, answer(s1, 'cancel'), null).state;
    expect(c.hp).toBe(10);
    expect(c.result).toEqual({ hp: 10 });
    expect(c.timing).toMatchObject({ current: null, windows: [], occurrences: [{ state: 'cancelled' }] });
    expect(applyAction(g, s1, answer(s1, 'allow'), null).state.hp).toBe(7);
  });

  it('ignoreBatch drops only the effect: the prevention window still opens, timing.do cancels and clears current', () => {
    const g = timedGame({ before: (ctx) => void ignoreBatch(ctx, 1), preventions: (st) => offersOf(st), onPrevent: countUse });
    const s1 = hit(g).state;
    expect(s1.timing?.windows).toMatchObject([{ timing: 'prevention', occurrence: 2, remaining: 3 }]);
    expect(s1.timing?.occurrences[0]).toMatchObject({ ignored: true, state: 'pending' });
    expect(s1.stack.some((t) => t.kind === 'timing.do')).toBe(true);
    const r = applyAction(g, s1, answer(s1, 'pass'), null);
    expect(r.state.hp).toBe(10);
    expect(r.events).toEqual([]);
    expect(r.state.timing).toMatchObject({ current: null, windows: [], occurrences: [{ state: 'cancelled' }] });
  });

  it('several occurrences in one batch: each gets its windows in order; one cancel removes all', () => {
    const g = timedGame({ preventions: (st) => offersOf(st), onPrevent: countUse });
    const two = { items: [HIT, { ...HIT, keys: { player: 'p2', target: 'u2' }, amount: 2 }] };
    const s1 = hit(g, startTimed(g, two)).state;
    expect(s1.timing?.windows).toMatchObject([{ occurrence: 2 }]);
    const s2 = applyAction(g, s1, answer(s1, 'pass'), null).state;
    expect(s2.hp).toBe(7);
    expect(s2.timing?.windows).toMatchObject([{ occurrence: 3, remaining: 2 }]);
    const s3 = applyAction(g, s2, answer(s2, 'shield'), null).state;
    expect(s3.hp).toBe(7);
    expect(s3.timing?.occurrences.map((o) => o.state)).toEqual(['happened', 'cancelled']);
    const c = timedGame({ before: (ctx) => cancelBatch(ctx, 1) });
    const r = hit(c, startTimed(c, two)).state;
    expect(r.hp).toBe(10);
    expect(r.timing?.occurrences.map((o) => o.state)).toEqual(['cancelled', 'cancelled']);
  });

  it('insteadOf: other tasks happen in the effect’s place, tagged with the batch', () => {
    let tagged: unknown;
    const g = timedGame({ before: (ctx) => insteadOf(ctx, 1, { kind: 'heal' }, { kind: 'peek' }) }, {
      peek: (ctx) => {
        tagged = ctx.s.stack.find((t) => t.kind === 'heal');
      },
      heal: (ctx, t) => {
        draftOf(ctx).hp += 1;
        ctx.emit({ type: 'healed', n: 1, batch: t.batch ?? 0 });
      },
    });
    const r = hit(g);
    expect(r.state.hp).toBe(11);
    expect(r.events).toEqual([{ type: 'healed', n: 1, batch: 1, seq: 1 }]);
    expect(tagged).toBeUndefined();
  });

  it('a later cancel removes the instead tasks too', () => {
    const g = timedGame({
      before: (ctx) => {
        insteadOf(ctx, 1, { kind: 'heal' });
        expect(ctx.s.stack.some((t) => t.kind === 'heal' && t.batch === 1)).toBe(true);
        cancelBatch(ctx, 1);
      },
    });
    expect(hit(g).state.hp).toBe(10);
  });

  it('shared keys: declared keys must match and read once; differing ones are an engine bug', () => {
    const g = timedGame();
    const two = { items: [HIT, { ...HIT, amount: 1 }], shared: ['target', 'player'] as const };
    const r = hit(g, startTimed(g, two)).state;
    expect(r.hp).toBe(6);
    expect(sharedKeys(r, 1)).toEqual({ target: 'u1', player: 'p2' });
    const bad = startTimed(g, { items: [HIT, { ...HIT, keys: { target: 'u2' } }], shared: ['target'] });
    expect(() => applyAction(g, bad, answer(bad, 'hit'), null)).toThrow(EngineBugError);
  });
});

describe('prevention window (K93)', () => {
  const g = timedGame({ preventions: (s) => offersOf(s), onPrevent: countUse });

  it('offers the matching, unused preventions to the affected player with remaining / prevented counters', () => {
    const s1 = hit(g).state;
    expect(s1.prompt?.player).toBe('p2');
    expect(s1.prompt?.options.map((o) => o.id)).toEqual(['shield', 'ward', 'pass']);
    expect(s1.timing?.windows).toEqual([{ timing: 'prevention', kind: 'damage', batch: 1, occurrence: 2, count: 3, remaining: 3, prevented: 0 }]);
    const s2 = applyAction(g, s1, answer(s1, 'shield'), null).state;
    expect(s2.timing?.windows[0]).toMatchObject({ remaining: 1, prevented: 2 });
    expect(s2.used).toEqual({ shield: 1 });
    const done = applyAction(g, s2, answer(s2, 'pass'), null);
    expect(done.state.hp).toBe(9);
    expect(done.state.timing?.occurrences[0]).toMatchObject({ amount: 1, prevented: 2, state: 'happened' });
    expect(done.state.timing?.windows).toEqual([]);
  });

  it('a use-limited prevention is not offered again; all prevented: nothing happens', () => {
    const s1 = hit(g).state;
    const r = applyAction(g, s1, answer(s1, 'ward'), null);
    expect(r.state.prompt).toBeNull();
    expect(r.state.hp).toBe(10);
    expect(r.events).toEqual([]);
    expect(r.state.timing?.occurrences[0]).toMatchObject({ amount: 0, prevented: 3, state: 'cancelled' });
    const again = hit(g, { ...startTimed(g), used: { ward: 1 } }).state;
    expect(again.prompt?.options.map((o) => o.id)).toEqual(['shield', 'pass']);
  });

  it('nested prevention windows: a prevention whose cost deals damage opens an inner window; prevent works on the innermost', () => {
    const n = timedGame({
      preventions: (st) => offersOf(st),
      onPrevent: (ctx, f) => {
        countUse(ctx, f);
        if (f.id === 'shield') would(ctx, [{ kind: 'damage', keys: { player: 'p1', target: 'u9' }, amount: 1 }]);
      },
    });
    const s1 = hit(n).state;
    const s2 = applyAction(n, s1, answer(s1, 'shield'), null).state;
    expect(s2.prompt?.player).toBe('p1');
    expect(s2.timing?.windows).toMatchObject([{ occurrence: 2, remaining: 1, prevented: 2 }, { occurrence: 4, remaining: 1 }]);
    const s3 = applyAction(n, s2, answer(s2, 'ward'), null).state;
    expect(s3.timing?.windows).toMatchObject([{ occurrence: 2, remaining: 1, prevented: 2 }]);
    expect(s3.timing?.occurrences.find((o) => o.id === 4)).toMatchObject({ amount: 0, prevented: 1, state: 'cancelled' });
    expect(s3.prompt?.player).toBe('p2');
    expect(s3.prompt?.options.map((o) => o.id)).toEqual(['shield', 'pass']);
  });

  it('prevent on an unpreventable window is an engine bug', () => {
    const z = timedGame({}, { zap: (ctx) => void prevent(ctx, 1) });
    const s0 = startTimed(z);
    const w = { timing: 'prevention' as const, kind: 'damage', batch: 1, occurrence: 2, count: 3, remaining: 3, prevented: 0 };
    const at = (unpreventable: boolean) => ({ ...s0, prompt: null, stack: [{ kind: 'zap' }], timing: { next: 3, current: 1, batches: [], occurrences: [], windows: [{ ...w, ...(unpreventable ? { unpreventable } : {}) }] } });
    expect(() => advance(z, at(true), null)).toThrow(EngineBugError);
    expect(advance(z, at(false), null).state.timing?.windows[0]).toMatchObject({ remaining: 2, prevented: 1 });
  });

  it('unpreventable: no window prompt; prevent outside a window is an engine bug', () => {
    const r = hit(g, startTimed(g, { items: [{ ...HIT, unpreventable: true }] }));
    expect(r.state.hp).toBe(7);
    const outside = timedGame({ before: (ctx) => void prevent(ctx, 1) });
    expect(() => hit(outside)).toThrow(EngineBugError);
  });

  it('copy on write: the input state is unchanged and replay is the same with freezing on', () => {
    setCowChecks(true);
    setStateFreezing(true);
    const s0 = startTimed(g);
    const before = JSON.stringify(s0);
    const s1 = hit(g, s0).state;
    const s2 = applyAction(g, s1, answer(s1, 'shield'), null).state;
    expect(JSON.stringify(s0)).toBe(before);
    setCowChecks(false);
    setStateFreezing(false);
    const t1 = hit(g, startTimed(g)).state;
    expect(applyAction(g, t1, answer(t1, 'shield'), null).state).toEqual(s2);
  });
});
