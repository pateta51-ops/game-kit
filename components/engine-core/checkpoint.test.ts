// K95: the checkpoint after every timing.do and trigger, steps in order, recompute until stable with a cap, state checks.
import { describe, expect, it } from 'vitest';
import { addEffect, applyAction, boundary, draftOf, EngineBugError, hashValue, simultaneously, would, type CheckpointConfig, type Ctx, type GameRules, type TimingConfig } from './index.ts';
import { answer, HIT, SHIELD, startTimed, timedGame, type Timed, type TimedState } from './fake/timed.ts';

const TWO = [HIT, { ...HIT, keys: { ...HIT.keys, target: 'u2' } }];
const note = (ctx: Ctx<Timed>, k: string): void => {
  const s = draftOf(ctx);
  s.used = { ...s.used, [`${String(Object.keys(s.used).length).padStart(2, '0')} ${k}`]: s.hp };
};
const trace = (s: TimedState): string[] => Object.keys(s.used).sort().map((k) => k.slice(3));
function game(cp: CheckpointConfig<Timed>, cfg: Partial<TimingConfig<Timed>> = {}, extra: GameRules<Timed>['handlers'] = {}): GameRules<Timed> {
  return timedGame({ checkpoint: cp, ...cfg }, extra);
}
const hit = (g: GameRules<Timed>, items = [HIT]) => {
  const s0 = startTimed(g, { items });
  return applyAction(g, s0, answer(s0, 'hit'), null);
};

describe('checkpoint (K95)', () => {
  it('K95 runs after every timing.do: collect, expire, derive, the checks in order, then the after-window', () => {
    let derives = 0;
    const g = game({
      derive: (ctx) => {
        derives += 1;
        if (ctx.s.timing?.occurrences.some((o) => o.state === 'happened')) note(ctx, 'uncollected');
        if (ctx.s.timing?.effects?.length) note(ctx, 'unexpired');
      },
      derived: (s) => s.hp,
      checks: [{ name: 'win', run: (ctx) => note(ctx, 'win') }, { name: 'limit', run: (ctx) => note(ctx, 'limit') }],
    }, {
      triggersFor: () => [{ ability: 't', source: 'c', player: 'p2', once: 'perInstance' }],
      resolveTrigger: (ctx) => note(ctx, 'trigger'),
    }, {
      chosen: (ctx) => {
        ctx.then({ kind: 'end' });
        addEffect(ctx, { kind: 'k', source: 'c', value: 1, duration: { until: 'endOfTurn' } });
        boundary(ctx, { kind: 'turnEnd' });
        would(ctx, ctx.s.rules.items);
      },
    });
    const s = hit(g, TWO).state;
    expect(trace(s)).toEqual(['uncollected', 'win', 'limit', 'win', 'limit', 'trigger', 'win', 'limit']); // occurrence 1 waits until its batch settles
    expect(derives).toBe(3);
    expect(s.hp).toBe(4);
    expect(s.timing?.effects).toEqual([]);
  });

  it('K95 recompute repeats derive until the derived values stop changing', () => {
    let passes = 0;
    const g = game({
      derive: (ctx) => {
        passes += 1;
        const s = draftOf(ctx);
        if ((s.used['total'] ?? 0) < 3) s.used = { ...s.used, total: (s.used['total'] ?? 0) + 1 };
      },
      derived: (s) => s.used,
    });
    expect(hit(g).state.used['total']).toBe(3);
    expect(passes).toBe(4);
  });

  it('K95 recompute past the cap is an engine bug naming the keys still moving', () => {
    const g = game({
      derive: (ctx) => {
        const s = draftOf(ctx);
        s.used = { ...s.used, moving: (s.used['moving'] ?? 0) + 1, still: 1 };
      },
      derived: (s) => s.used,
      recomputeCap: 4,
    });
    expect(() => hit(g)).toThrow(EngineBugError);
    expect(() => hit(g)).toThrow(/after 4 passes: moving$/);
  });

  it('K95 a state check that asks: after the answer the checkpoint goes back to step 1', () => {
    let derives = 0;
    const g = game({
      derive: () => {
        derives += 1;
      },
      derived: (s) => s.hp,
      checks: [{
        name: 'overLimit',
        run: (ctx) => {
          if (ctx.s.hp >= 8) return;
          ctx.then({ kind: 'heal' }, { kind: 'heal' });
          ctx.ask({ min: 1, max: 1, options: [{ id: 'trash', enabled: true }], player: 'p2' });
        },
      }, { name: 'after', run: (ctx) => note(ctx, 'after') }],
    });
    const r = hit(g);
    expect(r.state.prompt?.player).toBe('p2');
    expect(derives).toBe(1);
    const s = applyAction(g, r.state, answer(r.state, 'trash'), null).state;
    expect(s.hp).toBe(9);
    expect(derives).toBe(2);
    expect(trace(s)).toEqual(['after']);
    expect(s.result).toEqual({ hp: 9 });
  });

  it('K95 a check that returns true restarts the checkpoint; one that holds goes on to the next', () => {
    const g = game({
      checks: [{
        name: 'heal',
        run: (ctx) => {
          if (ctx.s.hp >= 9) return false;
          draftOf(ctx).hp += 1;
          return true;
        },
      }, { name: 'next', run: (ctx) => note(ctx, 'next') }],
    });
    const s = hit(g).state;
    expect(s.hp).toBe(9);
    expect(trace(s)).toEqual(['next']);
  });

  it('K95 each trigger resolution ends with its own checkpoint, after cfg.afterTrigger', () => {
    const g = game({ checks: [{ name: 'c', run: (ctx) => note(ctx, 'check') }] }, {
      triggersFor: () => [{ ability: 'a', source: 'c1', player: 'p2' }, { ability: 'b', source: 'c2', player: 'p2' }],
      resolveTrigger: (ctx, p) => note(ctx, p.ability),
      afterTrigger: (ctx, p) => note(ctx, `after ${p.ability}`),
    });
    expect(trace(hit(g).state)).toEqual(['check', 'a', 'after a', 'check', 'b', 'after b', 'check']);
  });

  it('K95 no checkpoint between the members of a simultaneous group; one after the group', () => {
    const g: GameRules<Timed> = game({ checks: [{ name: 'c', run: (ctx) => note(ctx, 'check') }] }, {
      happen: (ctx, o) => {
        draftOf(ctx).hp -= o.amount ?? 0;
        note(ctx, `do ${String(o.id)}`);
      },
    }, {
      chosen: (ctx) => {
        ctx.then({ kind: 'end' });
        simultaneously(ctx, g.handlers, [{ kind: 'one' }, { kind: 'two' }]);
      },
      one: (ctx) => {
        would(ctx, [HIT], { order: [] });
      },
      two: (ctx) => {
        would(ctx, [HIT], { order: [] });
      },
    });
    expect(trace(hit(g).state)).toEqual(['do 2', 'do 4', 'check']);
  });
  it('K95 a checkpoint the game pushes after a top-level action that never calls would', () => {
    const g = game({ checks: [{ name: 'c', run: (ctx) => note(ctx, 'check') }] }, {}, {
      chosen: (ctx) => {
        draftOf(ctx).hp -= 1;
        ctx.then({ kind: 'timing.checkpoint' }, { kind: 'end' });
      },
    });
    const s = hit(g).state;
    expect(trace(s)).toEqual(['check']);
    expect(s.result).toEqual({ hp: 9 });
    expect(s).not.toHaveProperty('timing');
  });

  it('K95 a game without cfg.checkpoint replays byte for byte as before K95', () => {
    const out: unknown[] = [];
    const g1 = timedGame({ preventions: () => [{ id: 's', prevention: SHIELD }] });
    let s = startTimed(g1);
    for (const p of ['hit', 's', 'pass']) s = applyAction(g1, s, answer(s, p), null).state;
    out.push(s);
    const g2 = timedGame({ triggersFor: (_s, o) => [{ ability: 'x', source: 'c', player: 'p2', once: o.id === 2 ? 'perItem' : 'perInstance' }], resolveTrigger: (ctx: Ctx<Timed>) => { draftOf(ctx).hp += 1; }, afterTrigger: () => undefined },
      { chosen: (ctx) => { ctx.then({ kind: 'timing.triggers' }, { kind: 'end' }); addEffect(ctx, { kind: 'k', source: 'c', value: 1, duration: { until: 'endOfTurn' } }); boundary(ctx, { kind: 'turnEnd' }); would(ctx, [HIT, HIT]); } });
    const t = startTimed(g2);
    out.push(applyAction(g2, t, answer(t, 'hit'), null).state);
    expect(hashValue(out)).toBe('931c3890a65efd7c');
  });
});
