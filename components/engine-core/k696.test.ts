// K696: triggersFor sees the batch its occurrence settled with; K697: replacementsFor gets the game's content.
import { describe, expect, it } from 'vitest';
import { applyAction, changeOccurrence, createGame, draftOf, hashState, would, type Ctx, type OccurrenceInput, type PendingTrigger, type TimingConfig } from './index.ts';
import { answer, HIT, timedGame, type Timed, type TimedState } from './fake/timed.ts';

const gain = (n: number): OccurrenceInput => ({ kind: 'gain', keys: { player: 'p2' }, amount: n });
// The value resets to 1 when it reaches 6 (kept in `hp`).
const step = (ctx: Ctx<Timed>, t: PendingTrigger): void => {
  const s = draftOf(ctx);
  const v = s.hp + (t.occurrences[0]?.amount ?? 0);
  s.hp = v >= 6 ? 1 : v;
};
// Recipe (timing.md, "ask the order only when it matters"): the same code.
const end = (v: number, ns: readonly number[]) => ns.reduce((x, n) => (x + n >= 6 ? 1 : x + n), v);
const recipe: Partial<TimingConfig<Timed>> = {
  triggersFor: (s, _o, _content, batch) => {
    const ns = batch.map((x) => x.amount ?? 0);
    const order = end(s.hp, ns) === end(s.hp, [...ns].reverse()) ? 'silent' : 'interactive';
    return [{ ability: 'gain', source: 'v', player: 'p2', order }];
  },
};

const gains = (start: number, items: readonly OccurrenceInput[]) => {
  const g = timedGame({ happen: () => undefined, resolveTrigger: step, ...recipe }, {
    chosen: (ctx) => {
      draftOf(ctx).hp = start;
      ctx.then({ kind: 'timing.triggers' }, { kind: 'end' });
      would(ctx, items);
    },
  });
  const s0 = createGame(g, { seed: 'k696' }, { items }, null).state;
  return { g, s: applyAction(g, s0, answer(s0, 'hit'), null).state };
};
const pick = (g: ReturnType<typeof gains>['g'], s: TimedState, amount: number): TimedState => {
  const t = s.timing?.pending?.find((p) => p.occurrences[0]?.amount === amount);
  return applyAction(g, s, answer(s, String(t?.id)), null).state;
};

describe('triggersFor gets the batch (K696)', () => {
  it('K696 +2 and +1 from 4: the order changes the result, so the player is asked; +2 first gives 2, +1 first gives 1', () => {
    const { g, s } = gains(4, [gain(2), gain(1)]);
    expect(s.prompt).toMatchObject({ kind: 'timing.order', seat: 'p2', min: 1, max: 1 });
    expect(s.prompt?.options).toHaveLength(2);
    expect(pick(g, s, 2).result).toEqual({ hp: 2 });
    expect(pick(g, s, 1).result).toEqual({ hp: 1 });
  });

  it('K696 +1 and +1 from 1: every order gives 3, so nothing is asked', () => {
    const { s } = gains(1, [gain(1), gain(1)]);
    expect(s.prompt).toBeNull();
    expect(s.result).toEqual({ hp: 3 });
  });

  it('K696 the batch is the happened occurrences of that batch, in order, the same list for each', () => {
    const seen: number[][] = [];
    const g = timedGame({ happen: () => undefined, triggersFor: (_s, _o, _c, batch) => { seen.push(batch.map((x) => x.amount ?? 0)); return []; } }, {
      chosen: (ctx) => {
        ctx.then({ kind: 'timing.triggers' }, { kind: 'end' });
        would(ctx, [gain(2), gain(1), gain(5)]);
      },
    });
    const s0 = createGame(g, { seed: 'k696' }, { items: [] }, null).state;
    applyAction(g, s0, answer(s0, 'hit'), null);
    expect(seen).toEqual([[2, 1, 5], [2, 1, 5], [2, 1, 5]]);
  });
});

const twice: TimingConfig<Timed>['applyReplacement'] = (ctx, _r, o) => {
  changeOccurrence(ctx, o.id, { amount: (o.amount ?? 0) * 2 });
  return 'updated';
};
const double: Partial<TimingConfig<Timed>> = {
  replacementsFor: (_s, o, content) => (content?.cards?.[o.keys.source ?? '']?.doubles === true ? [{ id: 1, controller: 'p1', cls: 1, label: 'Double' }] : []),
  applyReplacement: twice,
};
const hitWith = (content: Timed['content']) => {
  const g = timedGame(double);
  const s0 = createGame(g, { seed: 'k697' }, { items: [HIT] }, content).state;
  return applyAction(g, s0, answer(s0, 'hit'), content).state;
};

describe('replacementsFor gets the content (K697)', () => {
  it('K697 the card data says the source doubles: the replacement applies, 3 damage becomes 6', () => {
    const s = hitWith({ triggers: {}, cards: { p1: { doubles: true } } });
    expect(s.result).toEqual({ hp: 4 });
  });

  it('K697 poor: the card data does not say so: nothing is offered and 3 damage stays 3', () => {
    const s = hitWith({ triggers: {}, cards: { p1: {} } });
    expect(s.prompt).toBeNull();
    expect(s.result).toEqual({ hp: 7 });
  });
});

describe('a game that ignores both arguments is unchanged (K696, K697)', () => {
  it('K696 K697 replacement, two interactive triggers and their order: the values recorded from the code before the change', () => {
    const g = timedGame({
      replacementsFor: (_s, o) => (o.keys.source === 'p1' ? [{ id: 1, controller: 'p1', cls: 1, label: 'Double' }] : []),
      applyReplacement: twice,
      triggersFor: (_s, o) => [{ ability: 'gain', source: `v${String(o.id)}`, player: 'p2', order: 'interactive' }],
      resolveTrigger: step,
    }, {
      chosen: (ctx) => {
        ctx.then({ kind: 'timing.triggers' }, { kind: 'end' });
        would(ctx, [{ ...HIT, amount: 1 }, gain(2), gain(1)]);
      },
    });
    const s0 = createGame(g, { seed: 'k696' }, { items: [] }, null).state;
    const s1 = applyAction(g, s0, answer(s0, 'hit'), null).state;
    const t = s1.timing?.pending?.[2];
    const s2 = applyAction(g, s1, answer(s1, String(t?.id)), null).state;
    const s3 = applyAction(g, s2, answer(s2, String(s2.timing?.pending?.[0]?.id)), null).state;
    expect([s1.hp, s1.prompt?.options.map((o) => o.id), s2.hp, s3.hp, s3.result, s3.log, hashState(s1), hashState(s3)]).toEqual([5, ['5', '6', '7'], 1, 5, { hp: 5 }, [
      { type: 'damaged', n: 2, target: 'u1', seq: 1, batch: 1, occurrence: 2 },
      { type: 'damaged', n: 2, target: '', seq: 2, batch: 1, occurrence: 3 },
      { type: 'damaged', n: 1, target: '', seq: 3, batch: 1, occurrence: 4 },
    ], '4370b3864ac5732d', '443368e78ee7b668']);
  });
});
