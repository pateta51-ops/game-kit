// K94: triggers once per item / per instance, silent / interactive / automatic order, revalidation, entered-after, simultaneously.
import { describe, expect, it } from 'vitest';
import { addEffect, applyAction, cancelBatch, createGame, sumEffects, createSave, draftOf, exportSave, importSave, EngineBugError, enteredPlay, simultaneously, would, type Ctx, type GameRules, type PendingTrigger, type TimingConfig, type TriggerCandidate } from './index.ts';
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
    expect(r.triggerCap).toMatchObject({ code: 'trigger-cap', cap: 5, processed: 5, remaining: 1 });
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

describe('held triggers (K292)', () => {
  const mark = (ctx: Ctx<Timed>, k: string): void => {
    const s = draftOf(ctx);
    s.used = { ...s.used, [k]: Object.keys(s.used).length + 1 };
  };
  // the running effect: the hit happens, stepB is the rest of the same effect, effectEnd releases held triggers
  const effect = (cands: readonly TriggerCandidate[], held: boolean, cfg: Partial<TimingConfig<Timed>> = {}, extra: GameRules<Timed>['handlers'] = {}): GameRules<Timed> =>
    timedGame({
      checkpoint: { checks: [] },
      triggersFor: (_s, o) => (o.kind === 'damage' ? cands : []),
      resolveTrigger: (ctx, p) => mark(ctx, p.ability),
      ...(held ? { held: (s: TimedState, t: PendingTrigger) => t.timing === 'after' && s.stack.some((x) => x.kind === 'effectEnd') } : {}),
      ...cfg,
    }, {
      chosen: (ctx) => {
        ctx.then({ kind: 'stepB' }, { kind: 'effectEnd' }, { kind: 'end' });
        would(ctx, [HIT]);
      },
      stepB: (ctx) => mark(ctx, 'B'),
      effectEnd: (ctx) => ctx.then({ kind: 'timing.triggers' }),
      ...extra,
    });
  const WA: TriggerCandidate[] = [{ ability: 'when', source: 'c1', player: 'p2', timing: 'when' }, { ability: 'after', source: 'c2', player: 'p2', timing: 'after' }];

  it('K292 without held every pending trigger fires at the checkpoint, before the rest of the effect', () => {
    expect(order(hit(effect(WA, false)).state)).toEqual(['after', 'when', 'B']);
  });

  it('K292 a when response interrupts the effect, a held after response waits until the effect ends', () => {
    const s = hit(effect(WA, true)).state;
    expect(order(s)).toEqual(['when', 'B', 'after']);
    expect(s.timing?.pending).toEqual([]);
    expect(s.result).toEqual({ hp: 7 });
  });

  it('K292 two held triggers released together go through the normal order prompt', () => {
    const two: TriggerCandidate[] = [{ ability: 'a1', source: 'c1', player: 'p2', timing: 'after', order: 'interactive' }, { ability: 'a2', source: 'c2', player: 'p2', timing: 'after', order: 'interactive' }];
    const g = effect(two, true);
    const r = hit(g).state;
    expect(order(r)).toEqual(['B']);
    expect(r.prompt?.kind).toBe('timing.order');
    expect(r.prompt?.options.map((o) => o.id)).toEqual(['3', '4']);
    expect(order(applyAction(g, r, answer(r, '4'), null).state)).toEqual(['B', 'a2', 'a1']);
  });

  it('K292 the cap drops only unheld triggers; the held one still resolves when released', () => {
    const three: TriggerCandidate[] = [{ ability: 'w1', source: 'c1', player: 'p2', timing: 'when' }, { ability: 'w2', source: 'c2', player: 'p2', timing: 'when' }, { ability: 'after', source: 'c3', player: 'p2', timing: 'after' }];
    const s = hit(effect(three, true, { triggerCap: 1, capped: (left) => ({ type: 'dropped', ability: left.map((p) => p.ability).join(','), why: 'cap' }) })).state;
    expect(order(s)).toEqual(['w1', 'B', 'after']);
    expect(s.log.filter((e) => e.type === 'dropped').map((e) => (e as { ability: string }).ability)).toEqual(['w2']);
  });

  it('K292 invalid drops a held trigger whose source left before it was released', () => {
    const s = hit(effect(WA, true, { invalid: (st, t) => (t.source === 'c2' && st.used['B'] !== undefined ? 'left play' : undefined), dropped: (p, why) => ({ type: 'dropped', ability: p.ability, why }) })).state;
    expect(order(s)).toEqual(['when', 'B']);
    expect(s.log.filter((e) => e.type === 'dropped').map((e) => (e as { ability: string }).ability)).toEqual(['after']);
    expect(s.timing?.pending).toEqual([]);
  });

  it('K292 with batchEndAfterTriggers the batch effect lasts until its held after-trigger has resolved', () => {
    const armor: Record<string, number> = {};
    const g = effect(WA, true, { batchEndAfterTriggers: true, resolveTrigger: (ctx, p) => { armor[p.ability] = sumEffects(ctx.s, 'armor'); mark(ctx, p.ability); } }, {
      chosen: (ctx) => {
        ctx.then({ kind: 'stepB' }, { kind: 'effectEnd' }, { kind: 'end' });
        const b = would(ctx, [HIT]);
        addEffect(ctx, { kind: 'armor', source: 'a', value: 1, duration: { until: 'endOfBatch', batch: b, ifCancelled: 'expire' } });
      },
    });
    const s = hit(g).state;
    expect(order(s)).toEqual(['when', 'B', 'after']);
    expect(armor).toEqual({ when: 1, after: 1 });
    expect(sumEffects(s, 'armor')).toBe(0);
  });

  it('K292 a save with a held trigger pending keeps it and releases it after load', () => {
    const g = effect(WA, true, {}, {
      stepB: (ctx) => {
        ctx.then({ kind: 'stepB2' });
        ctx.ask({ min: 1, max: 1, options: [{ id: 'go', enabled: true }], player: 'p1' });
      },
      stepB2: (ctx) => mark(ctx, 'B'),
    });
    const s0 = startTimed(g);
    const act = answer(s0, 'hit');
    const s1 = applyAction(g, s0, act, null).state;
    expect(s1.timing?.pending?.map((p) => p.ability)).toEqual(['after']);
    const back = importSave(g, exportSave(createSave(g, { options: { seed: 'k93' }, rules: { items: [HIT] }, actions: [act], undoUsed: false, savedAt: 't' }, null)), null);
    expect(back.ok && back.state).toEqual(s1);
    if (back.ok) expect(order(applyAction(g, back.state, answer(back.state, 'go'), null).state)).toEqual(['when', 'B', 'after']);
  });
});

describe('triggers read content (K296)', () => {
  it('K296 triggersFor, invalid and held get the game content', () => {
    const content = { triggers: { damage: [{ ability: 'fromContent', source: 'c1', player: 'p2' }] } };
    const seen: unknown[] = [];
    const g = game([], {
      triggersFor: (_s, o, c) => c?.triggers[o.kind] ?? [],
      invalid: (_s, _t, c) => (seen.push(c), undefined),
      held: (_s, _t, c) => (seen.push(c), false),
    });
    const s0 = createGame(g, { seed: 'k296' }, { items: [HIT] }, content).state;
    const s = applyAction(g, s0, answer(s0, 'hit'), content).state;
    expect(order(s)).toEqual(['fromContent@7:2']);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((c) => c === content)).toBe(true);
  });
});

describe('trigger cap diagnostics', () => {
  const candidates = ['one', 'two', 'three'].map((ability) => ({ ability, source: 'tile', player: 'p1' }));

  it('locates the drop after resuming a nested trigger choice', () => {
    const g = game(candidates, {
      triggerCap: 1,
      resolveTrigger(ctx) {
        ctx.ask({ min: 1, max: 1, options: [{ id: 'resume', enabled: true }] }, { kind: 'resume' });
      },
    }, { resume: () => undefined });
    const first = hit(g);
    expect(first.triggerCap).toBeUndefined();
    expect(first.state.prompt?.options.map((option) => option.id)).toEqual(['resume']);
    const resumed = applyAction(g, first.state, answer(first.state, 'resume'), null);
    expect(resumed.triggerCap).toMatchObject({ code: 'trigger-cap', cap: 1, processed: 1, remaining: 2 });
    expect(resumed.state.result).toEqual({ hp: 7 });
  });

  it('records dropped live work separately from terminal state and game events', () => {
    const capped = hit(game(candidates, { triggerCap: 2 }));
    expect(capped.triggerCap).toMatchObject({ code: 'trigger-cap', cap: 2, processed: 2, remaining: 1, batch: 1 });
    expect(capped.state.result).toEqual({ hp: 7 });
    expect(capped.events.map((e) => e.type)).toEqual(['damaged']);
    expect(hit(game(candidates, { triggerCap: 3 }))).not.toHaveProperty('triggerCap');
  });
});
