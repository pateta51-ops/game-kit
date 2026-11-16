// K96: continuous effects with typed durations; K112: layered recompute.
import { describe, expect, it } from 'vitest';
import { addEffect, anyEffect, applyAction, hashState, type GameRules, bindEffect, boundary, cancelBatch, draftOf, effectsOf, EngineBugError, expireEffects, layered, removeEffect, sourceLeft, stampActive, sumEffects, spendEffect, would, type ContinuousEffect, type Ctx, type EffectsConfig } from './index.ts';
import { answer, HIT, SHIELD, startTimed, timedGame, type Timed, type TimedState } from './fake/timed.ts';

const play = (f: (ctx: Ctx<Timed>) => void, cfg: Parameters<typeof timedGame>[0] = {}, extra: Parameters<typeof timedGame>[1] = {}): TimedState =>
  startTimed(timedGame(cfg, { turn: f, ...extra }));
const kinds = (s: TimedState): string[] => effectsOf(s).map((e) => `${e.kind}:${String(e.value)}`);
const ended = (s: TimedState): number[] => (s.timing?.effects ?? []).filter((e) => e.ended === true).map((e) => e.id);

describe('continuous effects (K96)', () => {
  it('a game that adds no effect has no effects key, even when it uses batches', () => {
    const g = timedGame();
    const s0 = startTimed(g);
    const r = applyAction(g, s0, answer(s0, 'hit'), null);
    expect(r.state.timing).not.toHaveProperty('effects');
    expect(r.state.stack).toEqual([]);
  });

  it('effects are read at use: effectsOf, sumEffects, anyEffect, with the condition table and blanked sources', () => {
    const cfg: EffectsConfig<TimedState> = { conditions: { hurt: (s) => s.hp < 10 }, blanked: (s) => (s.hp < 9 ? ['blank'] : []) };
    const seen: unknown[] = [];
    play((ctx) => {
      addEffect(ctx, { kind: 'power', source: 'a', value: 2, duration: { until: 'game' } });
      addEffect(ctx, { kind: 'power', source: 'b', value: 1, when: 'hurt', duration: { until: 'game' } });
      addEffect(ctx, { kind: 'power', source: 'blank', value: 5, duration: { until: 'game' } });
      addEffect(ctx, { kind: 'cannot', source: 'a', value: 'attack', target: 'u1', duration: { until: 'game' } });
      seen.push(sumEffects(ctx.s, 'power', undefined, cfg), anyEffect(ctx.s, 'cannot', (e) => e.target === 'u2', cfg));
      draftOf(ctx).hp = 9;
      seen.push(sumEffects(ctx.s, 'power', undefined, cfg));
      draftOf(ctx).hp = 8;
      seen.push(sumEffects(ctx.s, 'power', undefined, cfg), anyEffect(ctx.s, 'cannot', (e) => e.target === 'u1', cfg));
      expect(() => effectsOf(ctx.s, 'power')).toThrow(EngineBugError);
    });
    expect(seen).toEqual([7, false, 8, 3, true]);
  });

  it('boundaries mark the durations they end; expireEffects removes them; nextTurnBegins needs two of that player\'s turn starts', () => {
    const steps: string[][] = [];
    const s = play((ctx) => {
      addEffect(ctx, { kind: 'turn', source: 'x', value: 1, duration: { until: 'endOfTurn' } });
      addEffect(ctx, { kind: 'round', source: 'x', value: 1, duration: { until: 'endOfRound' } });
      addEffect(ctx, { kind: 'phase', source: 'x', value: 'combat', duration: { until: 'endOfPhase', phase: 'combat' } });
      addEffect(ctx, { kind: 'begins', source: 'x', value: 'p1', duration: { until: 'turnBegins', player: 'p1' } });
      addEffect(ctx, { kind: 'next', source: 'x', value: 'p1', duration: { until: 'nextTurnBegins', player: 'p1' } });
      addEffect(ctx, { kind: 'game', source: 'x', value: 1, duration: { until: 'game' } });
      boundary(ctx, { kind: 'phaseEnd', phase: 'draw' });
      boundary(ctx, { kind: 'turnBegin', player: 'p2' });
      steps.push(kinds(ctx.s));
      boundary(ctx, { kind: 'turnEnd' });
      boundary(ctx, { kind: 'phaseEnd', phase: 'combat' });
      steps.push(kinds(ctx.s));
      boundary(ctx, { kind: 'turnBegin', player: 'p1' });
      steps.push(kinds(ctx.s));
      boundary(ctx, { kind: 'roundEnd' });
      boundary(ctx, { kind: 'turnBegin', player: 'p1' });
      steps.push(kinds(ctx.s));
      expect(expireEffects(ctx).map((e) => e.kind)).toEqual(['turn', 'round', 'phase', 'begins', 'next']);
    });
    expect(steps).toEqual([
      ['turn:1', 'round:1', 'phase:combat', 'begins:p1', 'next:p1', 'game:1'],
      ['round:1', 'begins:p1', 'next:p1', 'game:1'],
      ['round:1', 'next:p1', 'game:1'],
      ['game:1'],
    ]);
    expect(s.timing?.effects).toEqual([{ id: 6, kind: 'game', source: 'x', value: 1, duration: { until: 'game' }, stamp: 6 }]);
  });

  it('used effects count down; static effects leave with their source; removeEffect ends one', () => {
    const s = play((ctx) => {
      const u = addEffect(ctx, { kind: 'shield', source: 'a', value: 1, duration: { until: 'used', uses: 2 } });
      addEffect(ctx, { kind: 'aura', source: 'a', value: 1, duration: { while: 'sourceInPlay' } });
      addEffect(ctx, { kind: 'lasting', source: 'a', value: 1, duration: { until: 'game' } });
      const r = addEffect(ctx, { kind: 'gone', source: 'b', value: 1, duration: { until: 'game' } });
      spendEffect(ctx, u);
      expect(effectsOf(ctx.s, 'shield')[0]?.duration).toEqual({ until: 'used', uses: 1 });
      spendEffect(ctx, u);
      sourceLeft(ctx, 'a');
      removeEffect(ctx, r);
      expect(() => spendEffect(ctx, r + 1)).not.toThrow();
      expect(() => { addEffect(ctx, { kind: 'g', source: 'c', value: 1, duration: { until: 'game' } }); spendEffect(ctx, 5); }).toThrow(EngineBugError);
    });
    expect(kinds(s)).toEqual(['lasting:1', 'g:1']);
    expect(ended(s)).toEqual([1, 2, 4]);
  });

  it('endOfBatch: the effect lasts through the batch and its follow-ups, then ends', () => {
    const during: number[] = [];
    const s = play((ctx) => {
      const b = would(ctx, [HIT, HIT]);
      addEffect(ctx, { kind: 'armor', source: 'a', value: 1, duration: { until: 'endOfBatch', batch: b, ifCancelled: 'expire' } });
    }, { happen: (ctx, o) => { draftOf(ctx).hp -= (o.amount ?? 0) - sumEffects(ctx.s, 'armor'); ctx.then({ kind: 'check' }); } }, {
      check: (ctx) => { during.push(sumEffects(ctx.s, 'armor')); },
    });
    expect(s.hp).toBe(6);
    expect(during).toEqual([1, 1]);
    expect(ended(s)).toEqual([4]);
    expect(s.stack).toEqual([]);
  });

  it('endOfBatch with a cancelled batch: expire ends it, wait keeps it waiting until bindEffect', () => {
    const cancel = (ifCancelled: 'expire' | 'wait'): TimedState => play((ctx) => {
      const b = would(ctx, [HIT]);
      addEffect(ctx, { kind: 'armor', source: 'a', value: 1, duration: { until: 'endOfBatch', batch: b, ifCancelled } });
    }, { before: (ctx, o) => cancelBatch(ctx, o.batch) });
    expect(ended(cancel('expire'))).toEqual([3]);
    const w = cancel('wait');
    expect(ended(w)).toEqual([]);
    expect(w.timing?.effects?.[0]?.waiting).toBe(true);
    expect(sumEffects(w, 'armor')).toBe(0);
    const s = play((ctx) => {
      const b = would(ctx, [HIT]);
      const id = addEffect(ctx, { kind: 'armor', source: 'a', value: 1, duration: { until: 'endOfBatch', batch: b, ifCancelled: 'wait' } });
      cancelBatch(ctx, b);
      const b2 = would(ctx, [HIT]);
      bindEffect(ctx, id, b2);
      expect(sumEffects(ctx.s, 'armor')).toBe(1);
    }, { happen: (ctx, o) => { draftOf(ctx).hp -= (o.amount ?? 0) - sumEffects(ctx.s, 'armor'); } });
    expect(s.hp).toBe(8);
    expect(ended(s)).toEqual([3]);
  });
});

describe('K96 review fixes', () => {
  it('a game with no effects hashes as on main before K96 (state and events)', () => {
    const run = (g: GameRules<Timed>, picks: string[]): string => {
      let s = startTimed(g, { items: [HIT, HIT] });
      const ev: unknown[] = [];
      for (const p of picks) {
        const r = applyAction(g, s, answer(s, p), null);
        s = r.state;
        ev.push(...r.events);
      }
      return `${hashState(s)} ${hashState(ev)}`;
    };
    expect(run(timedGame(), ['hit'])).toBe('24f65ef8f2e9f3d3 4cec116d8221e7e3');
    expect(run(timedGame({ preventions: () => [{ id: 'shield', prevention: SHIELD }] }), ['hit', 'shield', 'pass', 'pass'])).toBe('2fcadfd17d7b1923 fa36172e9f12eb75');
  });

  it('the batch end goes under the follow-ups even when happen cancels another batch below them', () => {
    const during: number[] = [];
    const s = play((ctx) => {
      const b2 = would(ctx, [HIT]);
      const b1 = would(ctx, [HIT]);
      addEffect(ctx, { kind: 'armor', source: 'a', value: 1, duration: { until: 'endOfBatch', batch: b1, ifCancelled: 'expire' } });
      draftOf(ctx).used = { b1, b2 };
    }, { happen: (ctx, o) => { if (o.batch === ctx.s.used['b1']) { cancelBatch(ctx, ctx.s.used['b2'] ?? 0); ctx.then({ kind: 'check' }); } } }, {
      check: (ctx) => { during.push(sumEffects(ctx.s, 'armor')); },
    });
    expect(during).toEqual([1]);
    expect(ended(s)).toEqual([5]);
  });

  it('an endOfBatch effect added in a follow-up lasts to the batch end; added after it, or after a cancel, it ends at once', () => {
    const during: number[] = [];
    const s = play((ctx) => {
      addEffect(ctx, { kind: 'x', source: 'z', value: 1, duration: { until: 'game' } });
      ctx.then({ kind: 'late', occ: 2 });
      const b = would(ctx, [HIT]);
      expect(b).toBe(2);
      const c = would(ctx, [HIT]);
      cancelBatch(ctx, c);
      expect(addEffect(ctx, { kind: 'armor', source: 'c', value: 1, duration: { until: 'endOfBatch', batch: c, ifCancelled: 'wait' } })).toBe(6);
      expect(anyEffect(ctx.s, 'armor')).toBe(false);
    }, { happen: (ctx, o) => { ctx.then({ kind: 'add', occ: o.batch }, { kind: 'check' }); } }, {
      add: (ctx, t) => { addEffect(ctx, { kind: 'armor', source: 'f', value: 1, duration: { until: 'endOfBatch', batch: t.occ ?? 0, ifCancelled: 'expire' } }); },
      check: (ctx) => { during.push(sumEffects(ctx.s, 'armor')); },
      late: (ctx, t) => { addEffect(ctx, { kind: 'armor', source: 'l', value: 1, duration: { until: 'endOfBatch', batch: t.occ ?? 0, ifCancelled: 'expire' } }); during.push(sumEffects(ctx.s, 'armor')); },
    });
    expect(during).toEqual([1, 0]);
    expect(ended(s)).toEqual([6, 7, 8]);
    expect(s.stack).toEqual([]);
  });

  it('cfg.batchEndAfterTriggers: the effect lasts through the batch after-triggers (default: it ends before them)', () => {
    const seen = (after: boolean): { during: number[]; s: TimedState } => {
      const during: number[] = [];
      const s = play((ctx) => {
        ctx.then({ kind: 'timing.triggers' });
        const b = would(ctx, [HIT]);
        addEffect(ctx, { kind: 'armor', source: 'a', value: 1, duration: { until: 'endOfBatch', batch: b, ifCancelled: 'expire' } });
      }, { triggersFor: () => [{ ability: 'react', source: 'c', player: 'p2' }], resolveTrigger: (ctx) => { during.push(sumEffects(ctx.s, 'armor')); }, ...(after ? { batchEndAfterTriggers: true } : {}) });
      return { during, s };
    };
    expect(seen(false).during).toEqual([0]);
    const a = seen(true);
    expect(a.during).toEqual([1]);
    expect(ended(a.s)).toEqual([3]);
  });

  it('sourceLeft in the middle of a batch: later occurrences no longer see the static effect', () => {
    const s = play((ctx) => {
      addEffect(ctx, { kind: 'armor', source: 'a', value: 1, duration: { while: 'sourceInPlay' } });
      would(ctx, [HIT, HIT]);
    }, { happen: (ctx, o) => { draftOf(ctx).hp -= (o.amount ?? 0) - sumEffects(ctx.s, 'armor'); sourceLeft(ctx, 'a'); } });
    expect(s.hp).toBe(5);
    expect(ended(s)).toEqual([1]);
  });

  it('stampActive does not re-stamp an effect already stamped', () => {
    const cfg = { conditions: { hurt: (s: TimedState) => s.hp < 10 } };
    const s = play((ctx) => {
      addEffect(ctx, { kind: 'p', source: 'a', value: 1, when: 'hurt', duration: { until: 'game' } });
      draftOf(ctx).hp = 9;
      stampActive(ctx, cfg);
      stampActive(ctx, cfg);
      draftOf(ctx).hp = 10;
      stampActive(ctx, cfg);
      draftOf(ctx).hp = 9;
      stampActive(ctx, cfg);
    });
    expect(s.timing?.effects?.[0]?.stamp).toBe(2);
    expect(s.timing?.next).toBe(3);
  });
});

describe('layered recompute (K112)', () => {
  const apply = (v: number, e: ContinuousEffect): number => (e.kind === 'set' ? Number(e.value) : e.kind === 'double' ? v * 2 : v + Number(e.value));
  const cfg = { layers: ['set', 'modify'], apply, conditions: { hurt: (s: TimedState) => s.hp < 10 } };

  it('applies layer by layer in the game\'s order, by timestamp within a layer', () => {
    const v: number[] = [];
    play((ctx) => {
      addEffect(ctx, { kind: 'add', source: 'a', value: 1, layer: 'modify', duration: { until: 'game' } });
      addEffect(ctx, { kind: 'double', source: 'b', value: 0, layer: 'modify', duration: { until: 'game' } });
      addEffect(ctx, { kind: 'set', source: 'c', value: 5, layer: 'set', duration: { until: 'game' } });
      addEffect(ctx, { kind: 'loose', source: 'd', value: 100, duration: { until: 'game' } });
      v.push(layered(ctx.s, 0, cfg));
      addEffect(ctx, { kind: 'x', source: 'e', value: 1, layer: 'nowhere', duration: { until: 'game' } });
      expect(() => layered(ctx.s, 0, cfg)).toThrow(EngineBugError);
    });
    expect(v).toEqual([12]);
  });

  it('a conditional effect gets its timestamp when it first becomes active, not when it was added', () => {
    const v: number[] = [];
    play((ctx) => {
      addEffect(ctx, { kind: 'double', source: 'a', value: 0, layer: 'modify', when: 'hurt', duration: { until: 'game' } });
      addEffect(ctx, { kind: 'add', source: 'b', value: 1, layer: 'modify', duration: { until: 'game' } });
      stampActive(ctx, cfg);
      expect(ctx.s.timing?.effects?.[0]?.stamp).toBeUndefined();
      v.push(layered(ctx.s, 3, cfg));
      draftOf(ctx).hp = 9;
      stampActive(ctx, cfg);
      expect(ctx.s.timing?.effects?.[0]?.stamp).toBe(3);
      v.push(layered(ctx.s, 3, cfg));
    });
    expect(v).toEqual([4, 8]);
  });

  it('an `after` dependency waits for those kinds in its layer; a cycle falls back to timestamp order', () => {
    const v: number[] = [];
    play((ctx) => {
      addEffect(ctx, { kind: 'double', source: 'a', value: 0, layer: 'modify', after: ['add'], duration: { until: 'game' } });
      addEffect(ctx, { kind: 'add', source: 'b', value: 1, layer: 'modify', duration: { until: 'game' } });
      v.push(layered(ctx.s, 3, cfg));
      addEffect(ctx, { kind: 'add', source: 'c', value: 1, layer: 'modify', after: ['double'], duration: { until: 'game' } });
      v.push(layered(ctx.s, 3, cfg));
      v.push(layered(ctx.s, 3, cfg, (e) => e.source !== 'b'));
    });
    expect(v).toEqual([8, 9, 7]);
  });
});
