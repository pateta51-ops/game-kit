// K541: a lasting effect whose end point is a named event the game defines (`until: 'event'`, `eventOver`).
import { describe, expect, it } from 'vitest';
import { addEffect, applyAction, boundary, cancelBatch, draftOf, effectsOf, EngineBugError, hashState, spendEffect, sourceLeft, sumEffects, would, type Ctx, type Duration, type GameRules } from './index.ts';
import { eventOver, waitingOn } from './timed.ts';
import { answer, HIT, startTimed, timedGame, type Timed, type TimedState } from './fake/timed.ts';

const play = (f: (ctx: Ctx<Timed>) => void, cfg: Parameters<typeof timedGame>[0] = {}, extra: Parameters<typeof timedGame>[1] = {}): TimedState =>
  startTimed(timedGame(cfg, { turn: f, ...extra }));
const alive = (s: TimedState): number[] => effectsOf(s).map((e) => e.id).sort((a, b) => a - b);
const combat = (instance?: string): Duration => ({ until: 'event', event: 'combatEnd', ...(instance === undefined ? {} : { instance }) });
const OK = { min: 1, max: 1, options: [{ id: 'ok', enabled: true }], player: 'p1' };

describe('K541: an effect lasting until a named event', () => {
  it('K541 "for this combat" survives a defeat trigger\'s nested batch and a prompt inside the combat, then ends when the combat\'s end event fires', () => {
    const seen: string[] = [];
    const DEFEAT = { kind: 'damage', keys: { player: 'p1', source: 'u1', target: 'u2' }, amount: 1 };
    const g = timedGame({
      happen: (ctx, o) => {
        draftOf(ctx).hp -= o.amount ?? 0;
        if (o.keys.source !== 'u1') return;
        addEffect(ctx, { kind: 'power', source: 'u1', value: 1, duration: combat('c1') });
        seen.push(`nested ${String(sumEffects(ctx.s, 'power'))}`);
      },
      triggersFor: (_s, o) => (o.keys.source === 'p1' ? [{ ability: 'defeat', source: 'u1', player: 'p2' }] : []),
      resolveTrigger: (ctx) => {
        seen.push(`trigger ${String(sumEffects(ctx.s, 'power'))}`);
        would(ctx, [DEFEAT]);
      },
    }, {
      turn: (ctx) => {
        addEffect(ctx, { kind: 'power', source: 'hero', value: 1, duration: combat('c1') });
        ctx.then({ kind: 'timing.triggers' }, { kind: 'mid' }, { kind: 'combatEnd' }, { kind: 'after' });
        would(ctx, [HIT]);
      },
      mid: (ctx) => ctx.ask(OK, { kind: 'answered' }),
      answered: (ctx) => { seen.push(`prompt ${String(sumEffects(ctx.s, 'power'))}`); },
      combatEnd: (ctx) => { seen.push(`ended ${eventOver(ctx, 'combatEnd', 'c1').join(',')}`); },
      after: (ctx) => { seen.push(`after ${String(sumEffects(ctx.s, 'power'))}`); },
    });
    const s0 = startTimed(g);
    expect(sumEffects(s0, 'power')).toBe(2);
    const s = applyAction(g, s0, answer(s0, 'ok'), null).state;
    expect(seen).toEqual(['trigger 1', 'nested 2', 'prompt 2', `ended ${String(effectsOf(s0)[0]?.id)},${String(effectsOf(s0)[1]?.id)}`, 'after 0']);
    expect(s.stack).toEqual([]);
  });

  it('K541 an effect of an outer combat is not ended by an inner one; an effect with no instance ends at any combat\'s end', () => {
    const steps: number[][] = [];
    play((ctx) => {
      const outer = addEffect(ctx, { kind: 'a', source: 'x', value: 1, duration: combat('c1') });
      const any = addEffect(ctx, { kind: 'b', source: 'x', value: 1, duration: combat() });
      const inner = addEffect(ctx, { kind: 'c', source: 'x', value: 1, duration: combat('c2') });
      steps.push([outer, any, inner]);
      steps.push(eventOver(ctx, 'combatEnd', 'c2'));
      steps.push(alive(ctx.s));
      steps.push(eventOver(ctx, 'combatEnd'));
      steps.push(eventOver(ctx, 'reveal', 'c1'));
      steps.push(eventOver(ctx, 'combatEnd', 'c1'));
      steps.push(alive(ctx.s));
    });
    const [[outer, any, inner]] = steps as [[number, number, number]];
    expect(steps.slice(1)).toEqual([[any, inner], [outer], [], [], [outer], []]);
  });

  it('K541 an effect added after the event fired waits for the next one', () => {
    const steps: number[][] = [];
    play((ctx) => {
      const first = addEffect(ctx, { kind: 'a', source: 'x', value: 1, duration: { until: 'event', event: 'reveal' } });
      steps.push(eventOver(ctx, 'reveal'));
      const later = addEffect(ctx, { kind: 'a', source: 'x', value: 1, duration: { until: 'event', event: 'reveal' } });
      steps.push(alive(ctx.s), [first, later]);
      steps.push(eventOver(ctx, 'reveal'), alive(ctx.s));
    });
    const [ended1, live, [first, later]] = steps as [number[], number[], [number, number]];
    expect(ended1).toEqual([first]);
    expect(live).toEqual([later]);
    expect(steps.slice(3)).toEqual([[later], []]);
  });

  it('K541 waitingOn lists the event names and instances live effects wait on, once each, and reads nothing else', () => {
    const steps: unknown[] = [];
    const s = play((ctx) => {
      steps.push(waitingOn(ctx.s));
      addEffect(ctx, { kind: 'a', source: 'x', value: 1, duration: combat('c1') });
      addEffect(ctx, { kind: 'a', source: 'x', value: 1, duration: combat('c1') });
      addEffect(ctx, { kind: 'a', source: 'x', value: 1, duration: { until: 'event', event: 'combatEnds' } });
      addEffect(ctx, { kind: 'a', source: 'x', value: 1, duration: combat('c2') });
      addEffect(ctx, { kind: 'a', source: 'x', value: 1, duration: { until: 'game' } });
      steps.push(waitingOn(ctx.s));
      eventOver(ctx, 'combatEnd', 'c2');
      steps.push(waitingOn(ctx.s));
    });
    expect(steps).toEqual([[], [{ event: 'combatEnd', instance: 'c1' }, { event: 'combatEnds' }, { event: 'combatEnd', instance: 'c2' }], [{ event: 'combatEnd', instance: 'c1' }, { event: 'combatEnds' }]]);
    expect(s.timing?.effects).toHaveLength(5);
  });

  it('K541 an event with no name is an engine bug', () => {
    play((ctx) => { expect(() => eventOver(ctx, '')).toThrow(EngineBugError); });
  });

  it('K541 the fixed kinds are unchanged: the event ends none of them, and boundaries, batch end, cancel, spend and source left end no event effect', () => {
    const steps: number[][] = [];
    play((ctx) => {
      const b = would(ctx, [HIT]);
      const fixed = [
        addEffect(ctx, { kind: 'f', source: 's', value: 1, duration: { until: 'endOfTurn' } }),
        addEffect(ctx, { kind: 'f', source: 's', value: 1, duration: { until: 'endOfRound' } }),
        addEffect(ctx, { kind: 'f', source: 's', value: 1, duration: { until: 'endOfPhase' } }),
        addEffect(ctx, { kind: 'f', source: 's', value: 1, duration: { until: 'turnBegins', player: 'p1' } }),
        addEffect(ctx, { kind: 'f', source: 's', value: 1, duration: { until: 'nextTurnBegins', player: 'p1' } }),
        addEffect(ctx, { kind: 'f', source: 's', value: 1, duration: { until: 'endOfBatch', batch: b, ifCancelled: 'expire' } }),
        addEffect(ctx, { kind: 'f', source: 's', value: 1, duration: { until: 'used', uses: 1 } }),
        addEffect(ctx, { kind: 'f', source: 's', value: 1, duration: { while: 'sourceInPlay' } }),
        addEffect(ctx, { kind: 'f', source: 's', value: 1, duration: { until: 'game' } }),
      ];
      const ev = addEffect(ctx, { kind: 'e', source: 's', value: 1, duration: { until: 'event', event: 'combatEnd' } });
      steps.push(eventOver(ctx, 'other'), eventOver(ctx, 'reveal', 'c1'));
      const evs = [ev, addEffect(ctx, { kind: 'e', source: 's', value: 1, duration: { until: 'event', event: 'combatEnd' } })];
      steps.push(eventOver(ctx, 'combatEnd'));
      const kept = addEffect(ctx, { kind: 'e', source: 's', value: 1, duration: { until: 'event', event: 'combatEnd' } });
      for (const kind of ['turnEnd', 'roundEnd', 'phaseEnd', 'turnBegin'] as const) boundary(ctx, { kind, player: 'p1' });
      boundary(ctx, { kind: 'turnBegin', player: 'p1' });
      cancelBatch(ctx, b);
      spendEffect(ctx, fixed[6] as number);
      sourceLeft(ctx, 's');
      steps.push(alive(ctx.s), fixed, evs, [kept]);
    });
    const [noScope, other, both, live, fixed, evs, kept] = steps;
    expect(noScope).toEqual([]);
    expect(other).toEqual([]);
    expect(both).toEqual(evs);
    expect(live).toEqual([...(fixed ?? []).slice(8), ...(kept ?? [])]);
  });

  it('K541 a game that fires an event with no effects keeps no effects key and hashes as one that never fired it', () => {
    const run = (g: GameRules<Timed>): string => {
      const s0 = startTimed(g);
      return hashState(applyAction(g, s0, answer(s0, 'hit'), null).state);
    };
    const fired = timedGame({ happen: (ctx, o) => { draftOf(ctx).hp -= o.amount ?? 0; eventOver(ctx, 'combatEnd', 'c1'); } });
    const s0 = startTimed(fired);
    expect(applyAction(fired, s0, answer(s0, 'hit'), null).state.timing).not.toHaveProperty('effects');
    expect(run(fired)).toBe(run(timedGame()));
  });

  it('K541 recipe: "this combat" only: an inner combat started inside an outer one counts only its own effect (`duration.instance === combat`); both end with their own end event', () => {
    const costs: number[] = [];
    const own = (s: TimedState, c: string): number => sumEffects(s, 'extra', (e) => 'instance' in e.duration && e.duration.instance === c);
    play((ctx) => {
      addEffect(ctx, { kind: 'extra', source: 'c1', value: 1, duration: { until: 'event', event: 'combatEnd', instance: 'c1' } });
      addEffect(ctx, { kind: 'extra', source: 'c2', value: 1, duration: { until: 'event', event: 'combatEnd', instance: 'c2' } });
      costs.push(sumEffects(ctx.s, 'extra'), own(ctx.s, 'c2'));
      eventOver(ctx, 'combatEnd', 'c2');
      costs.push(own(ctx.s, 'c1'));
      eventOver(ctx, 'combatEnd', 'c1');
      costs.push(sumEffects(ctx.s, 'extra'));
    });
    expect(costs).toEqual([2, 1, 1, 0]);
  });
});

type Op = { op: 'add'; event: string; instance?: string } | { op: 'addTurn' } | { op: 'fire'; event: string; instance?: string } | { op: 'turnEnd' } | { op: 'batch' } | { op: 'prompt' };
type Live = { id: number; event?: string; instance?: string };

function script(seed: number, n: number): Op[] {
  let x = seed;
  const r = (k: number): number => { x = (Math.imul(x, 1103515245) + 12345) >>> 0; return (x >>> 8) % k; };
  const pick = <T,>(xs: readonly T[]): T => xs[r(xs.length)] as T;
  const inst = (): string | undefined => pick([undefined, 'i1', 'i2']);
  const ops: Op[] = [];
  for (let i = 0; i < n; i++) {
    const k = r(6);
    const event = pick(['combatEnd', 'reveal']);
    const instance = inst();
    const scoped = instance === undefined ? {} : { instance };
    ops.push(k === 0 ? { op: 'add', event, ...scoped } : k === 1 ? { op: 'fire', event, ...scoped } : k === 2 ? { op: 'batch' } : k === 3 ? { op: 'prompt' } : k === 4 ? pick([{ op: 'addTurn' }, { op: 'add', event, ...scoped }] as Op[]) : pick([{ op: 'turnEnd' }, { op: 'fire', event, ...scoped }] as Op[]));
  }
  return ops;
}

describe('K541 comparison: random add, nested batch, prompt and fire against a plain model', () => {
  it('K541 200 random sequences: the live effects match the model after every step', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const ops = script(seed, 30);
      const ran: { op: Op; id?: number; live: number[] }[] = [];
      let i = 0;
      const step = (ctx: Ctx<Timed>): void => {
        const op = ops[i++];
        if (op === undefined) return;
        let id: number | undefined;
        if (op.op === 'add') id = addEffect(ctx, { kind: 'k', source: 's', value: 1, duration: { until: 'event', event: op.event, ...(op.instance === undefined ? {} : { instance: op.instance }) } });
        if (op.op === 'addTurn') id = addEffect(ctx, { kind: 'k', source: 's', value: 1, duration: { until: 'endOfTurn' } });
        if (op.op === 'fire') eventOver(ctx, op.event, op.instance);
        if (op.op === 'turnEnd') boundary(ctx, { kind: 'turnEnd' });
        ran.push({ op, ...(id === undefined ? {} : { id }), live: alive(ctx.s) });
        if (op.op === 'batch') { ctx.then({ kind: 'step' }); would(ctx, [HIT]); return; }
        if (op.op === 'prompt') { ctx.ask(OK, { kind: 'step' }); return; }
        ctx.then({ kind: 'step' });
      };
      const g = timedGame({ happen: (ctx) => { draftOf(ctx).hp -= 1; ctx.then({ kind: 'step' }); } }, { turn: step, step });
      let s = startTimed(g);
      while (s.prompt !== null) s = applyAction(g, s, answer(s, 'ok'), null).state;
      expect(i).toBeGreaterThan(ops.length);
      expect(s.stack).toEqual([]);
      let model: Live[] = [];
      for (const r of ran) {
        const o = r.op;
        if (o.op === 'add') model.push({ id: r.id as number, event: o.event, ...(o.instance === undefined ? {} : { instance: o.instance }) });
        if (o.op === 'addTurn') model.push({ id: r.id as number });
        if (o.op === 'fire') model = model.filter((m) => !(m.event === o.event && (m.instance === undefined || m.instance === o.instance)));
        if (o.op === 'turnEnd') model = model.filter((m) => m.event !== undefined);
        expect(r.live, `seed ${String(seed)} step ${String(ran.indexOf(r))}`).toEqual(model.map((m) => m.id));
      }
      expect(ran.length).toBe(ops.length);
    }
  });
});
