// K94: triggers once per item / per instance, silent / interactive / automatic order, revalidation, entered-after, simultaneously.
import { describe, expect, it } from 'vitest';
import { applyAction, cancelBatch, createSave, draftOf, exportSave, importSave, EngineBugError, enteredPlay, simultaneously, would, type Ctx, type GameRules, type PendingTrigger, type TimingConfig, type TriggerCandidate } from './index.ts';
import { answer, HIT, startTimed, timedGame, type Timed, type TimedState } from './fake/timed.ts';

const record = (ctx: Ctx<Timed>, p: PendingTrigger): void => {
  const s = draftOf(ctx);
  s.used = { ...s.used, [`${p.ability}@${String(s.hp)}:${p.occurrences.map((o) => o.id).join(',')}`]: Object.keys(s.used).length + 1 };
};
const order = (s: TimedState): string[] => Object.entries(s.used).sort((a, b) => a[1] - b[1]).map(([k]) => k);
const TWO = [HIT, { ...HIT, keys: { ...HIT.keys, target: 'u2' } }];

function game(cands: readonly TriggerCandidate[], cfg: Partial<TimingConfig<Timed>> = {}, extra: GameRules<Timed>['handlers'] = {}): GameRules<Timed> {
  const g: GameRules<Timed> = timedGame({ triggersFor: () => cands, resolveTrigger: record, ...cfg }, {
    chosen: (ctx) => {
      ctx.then({ kind: 'timing.triggers' }, { kind: 'end' });
      would(ctx, ctx.s.rules.items);
    },
    ...extra,
  });
  return g;
}
const hit = (g: GameRules<Timed>, items = [HIT]) => {
  const s0 = startTimed(g, { items });
  return applyAction(g, s0, answer(s0, 'hit'), null);
};

describe('triggers (K94)', () => {
  it('a timed game with no triggersFor collects nothing and gains no pending list', () => {
    const s = hit(timedGame({}, { chosen: (ctx) => { ctx.then({ kind: 'timing.triggers' }, { kind: 'end' }); would(ctx, [HIT]); } })).state;
    expect(s.hp).toBe(7);
    expect(s.timing).not.toHaveProperty('pending');
  });

  it('K94 perItem gives one trigger per occurrence, perInstance one for the whole batch', () => {
    const s = hit(game([{ ability: 'each', source: 'c1', player: 'p2' }, { ability: 'any', source: 'c2', player: 'p2', once: 'perInstance' }]), TWO).state;
    expect(s.hp).toBe(4);
    expect(order(s)).toEqual(['any@4:2,3', 'each@4:2', 'each@4:3']);
    expect(s.timing?.pending).toEqual([]);
    expect(s.result).toEqual({ hp: 4 });
  });

  it('K94 automatic order follows the priority table, then the ability key', () => {
    const s = hit(game([
      { ability: 'zDraw', source: 'c1', player: 'p2', order: { auto: 'draw' } },
      { ability: 'gain', source: 'c2', player: 'p2', order: { auto: 'gainResources' } },
      { ability: 'b', source: 'c3', player: 'p2', order: 'silent' },
      { ability: 'a', source: 'c4', player: 'p2', order: { auto: 'last' } },
      { ability: 'lose', source: 'c5', player: 'p2', order: { auto: 'loseActions' } },
    ])).state;
    expect(order(s).map((k) => k.split('@')[0])).toEqual(['lose', 'gain', 'zDraw', 'b', 'a']);
  });

  it('K94 interactive: the player picks the order while more than one is not silent', () => {
    const g = game([
      { ability: 'x', source: 'c1', player: 'p2', order: 'interactive' },
      { ability: 'y', source: 'c2', player: 'p2' },
      { ability: 'q', source: 'c3', player: 'p2', order: 'silent' },
    ], { orderPrompt: (base, info) => ({ ...base, player: info.player }) });
    const s1 = hit(g).state;
    expect(s1.prompt).toMatchObject({ player: 'p2', options: [{ id: '3' }, { id: '4' }, { id: '5' }] });
    const s2 = applyAction(g, s1, answer(s1, '4'), null).state;
    expect(s2.prompt).toBeNull();
    expect(order(s2).map((k) => k.split('@')[0])).toEqual(['y', 'q', 'x']);
  });

  it('K94 one interactive and only silent others: no prompt', () => {
    const s = hit(game([{ ability: 'x', source: 'c1', player: 'p2', order: 'interactive' }, { ability: 'q', source: 'c3', player: 'p2', order: 'silent' }])).state;
    expect(s.prompt).toBeNull();
    expect(Object.keys(s.used)).toHaveLength(2);
  });

  it('K94 the active player resolves first, then turn order', () => {
    const s = hit(game([{ ability: 'theirs', source: 'c1', player: 'p2' }, { ability: 'mine', source: 'c2', player: 'p1' }], { turnOrder: () => ['p1', 'p2'] })).state;
    expect(order(s).map((k) => k.split('@')[0])).toEqual(['mine', 'theirs']);
  });

  it('K94 revalidation: a trigger whose source left is dropped with an event', () => {
    const r = hit(game([{ ability: 'gone', source: 'c1', player: 'p2' }], { invalid: () => 'left play', dropped: (p, why) => ({ type: 'dropped', ability: p.ability, why }) }));
    expect(r.state.used).toEqual({});
    expect(r.events.at(-1)).toMatchObject({ type: 'dropped', ability: 'gone', why: 'left play' });
  });

  it('K94 a card that entered play after the occurrence does not answer it', () => {
    const g = game([{ ability: 'old', source: 'c1', player: 'p2' }, { ability: 'new', source: 'c9', player: 'p2' }], {}, {
      chosen: (ctx) => {
        ctx.then({ kind: 'enter' }, { kind: 'timing.triggers' }, { kind: 'end' });
        would(ctx, [HIT]);
      },
      enter: (ctx) => enteredPlay(ctx, 'c9'),
    });
    expect(Object.keys(hit(g).state.used)).toEqual(['old@7:2']);
  });

  it('K94 simultaneously: every member lands before any trigger resolves; follow-ups in member order', () => {
    const extra: GameRules<Timed>['handlers'] = {
      chosen: (ctx) => {
        ctx.then({ kind: 'end' });
        simultaneously(ctx, g.handlers, [{ kind: 'one', occ: 3 }, { kind: 'one', occ: 1 }]);
      },
      one: (ctx, t) => {
        ctx.then({ kind: 'timing.triggers' });
        would(ctx, [{ ...HIT, amount: t.occ ?? 0 }]);
      },
    };
    const g = game([{ ability: 'hurt', source: 'c1', player: 'p2' }], {}, extra);
    const r = hit(g);
    expect(r.events.map((e) => (e.type === 'damaged' ? e.n : -1))).toEqual([3, 1]);
    expect(order(r.state)).toEqual(['hurt@6:2', 'hurt@6:4']);
  });

  it('K94 simultaneously: a member that asks is an engine bug', () => {
    const g: GameRules<Timed> = game([], {}, {
      chosen: (ctx) => simultaneously(ctx, g.handlers, [{ kind: 'turn' }]),
    });
    expect(() => hit(g)).toThrow(EngineBugError);
  });

  it('K94 cancelBatch drops the pending triggers of the batch (timing-vocabulary cancel)', () => {
    const s = hit(game([{ ability: 'a', source: 'c1', player: 'p2' }, { ability: 'b', source: 'c2', player: 'p2' }], {
      resolveTrigger: (ctx, p) => {
        record(ctx, p);
        cancelBatch(ctx, p.batch);
      },
    })).state;
    expect(order(s)).toEqual(['a@7:2']);
    expect(s.timing?.pending).toEqual([]);
  });

  it('K94 collects only from fully settled batches: a perInstance trigger is not split', () => {
    const g = game([{ ability: 'any', source: 'c2', player: 'p2', once: 'perInstance' }], {
      before: (ctx, o) => {
        if (o.id === 3) ctx.then({ kind: 'timing.triggers' });
      },
    });
    expect(order(hit(g, TWO).state)).toEqual(['any@4:2,3']);
  });

  it('K94 nested follow-ups join the queue; the active player resolves first again; afterTrigger runs after each and its follow-ups', () => {
    const after: string[] = [];
    const g = game([], {
      turnOrder: () => ['p1', 'p2'],
      triggersFor: (_s, o) => (o.id === 2 ? [{ ability: 'a', source: 'c1', player: 'p2' }, { ability: 'b', source: 'c2', player: 'p2' }] : [{ ability: 'mine', source: 'c3', player: 'p1' }]),
      resolveTrigger: (ctx, p) => {
        record(ctx, p);
        if (p.ability === 'a') would(ctx, [HIT]);
      },
      afterTrigger: (ctx, p) => {
        after.push(`${p.ability}@${String(ctx.s.hp)}`);
      },
    });
    const s = hit(g).state;
    expect(order(s)).toEqual(['a@7:2', 'mine@4:6', 'b@4:2']);
    expect(after).toEqual(['a@4', 'mine@4', 'b@4']);
    expect(s.timing).not.toHaveProperty('fired');
  });

  it('K94 a trigger loop stops at the cap with an event; the queue is emptied', () => {
    const r = hit(game([{ ability: 'loop', source: 'c1', player: 'p2' }], {
      triggerCap: 5,
      resolveTrigger: (ctx, p) => {
        record(ctx, p);
        would(ctx, [HIT]);
      },
      capped: (left) => ({ type: 'dropped', ability: 'cap', why: String(left.length) }),
    }));
    expect(Object.keys(r.state.used)).toHaveLength(5);
    expect(r.events.at(-1)).toMatchObject({ type: 'dropped', ability: 'cap', why: '1' });
    expect(r.state.timing?.pending).toEqual([]);
    expect(r.state.timing).not.toHaveProperty('fired');
    expect(r.state.result).not.toBeNull();
  });

  it('K94 a save with triggers queued at the order prompt restores to the same state', () => {
    const g = game([{ ability: 'x', source: 'c1', player: 'p2', order: 'interactive' }, { ability: 'y', source: 'c2', player: 'p2' }]);
    const s0 = startTimed(g, { items: [HIT] });
    const act = answer(s0, 'hit');
    const s1 = applyAction(g, s0, act, null).state;
    expect(s1.timing?.pending).toHaveLength(2);
    const back = importSave(g, exportSave(createSave(g, { options: { seed: 'k93' }, rules: { items: [HIT] }, actions: [act], undoUsed: false, savedAt: 't' }, null)), null);
    expect(back.ok && back.state).toEqual(s1);
    if (back.ok) expect(order(applyAction(g, back.state, answer(back.state, '3'), null).state).map((k) => k.split('@')[0])).toEqual(['x', 'y']);
  });
});
