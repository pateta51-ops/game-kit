// K542: statuses (a named lasting effect on an object) on the timed fake game; the stun cases restate Warp's Edge
// src/engine/combat/stun.ts (6790200): a stun given, it blocks an action, it ends at the named point.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyAction, boundary, createSave, effectsOf, EngineBugError, eventOver, expireEffects, exportSave, hashState, importSave, newHistory, recordAction, replay, undo, type Ctx, type EffectsConfig } from './index.ts';
import { giveStatus, hasStatus, removeStatus, statusCount, statusesOf, statusLeft, type StatusTable } from './timed.ts';
import { answer, startTimed, timedGame, type Timed, type TimedState } from './fake/timed.ts';

const T: StatusTable = {
  stunned: { token: 'stun', ends: { until: 'endOfTurn' } },
  stealth: { token: 'stealth', ends: { until: 'event', event: 'entersCombat' } },
  wound: { token: 'wound', stacks: true, ends: 'removed', endsOnLeave: true },
  notInCombat: { token: 'out', ends: 'removed' },
};
const play = (f: (ctx: Ctx<Timed>) => void): TimedState => startTimed(timedGame({}, { turn: f }));
const ask = (ctx: Ctx<Timed>, next: string): void =>
  ctx.ask({ min: 1, max: 1, options: [{ id: 'act', enabled: !hasStatus(ctx.s, 'u1', 'stunned') }, { id: 'pass', enabled: true }], player: 'p1' }, { kind: next });
const enabled = (s: TimedState): boolean | undefined => s.prompt?.options.find((o) => o.id === 'act')?.enabled;

describe('K542 statuses', () => {
  it('K542 stun (stun.ts): a stunned unit cannot take the action; the stun ends at the end of the turn and the action is offered again', () => {
    const g = timedGame({}, {
      turn: (ctx) => { giveStatus(ctx, T, 'u1', 'stunned', { source: 'laser' }); ask(ctx, 'endTurn'); },
      endTurn: (ctx) => { boundary(ctx, { kind: 'turnEnd' }); ask(ctx, 'done'); },
      done: () => {},
    });
    const s0 = startTimed(g);
    expect(enabled(s0)).toBe(false);
    expect(statusesOf(s0, T, 'u1')).toEqual([{ name: 'stunned', token: 'stun', count: 1 }]);
    expect(s0.timing?.effects?.[0]).toMatchObject({ kind: 'status', source: 'laser', target: 'u1', value: 'stunned' });
    const s1 = applyAction(g, s0, answer(s0, 'pass'), null).state;
    expect(enabled(s1)).toBe(true);
    expect(hasStatus(s1, 'u1', 'stunned')).toBe(false);
  });

  it('K542 stun: giving it again does nothing and says so; another unit is not stunned', () => {
    const out: unknown[] = [];
    const s = play((ctx) => { out.push(giveStatus(ctx, T, 'u1', 'stunned'), giveStatus(ctx, T, 'u1', 'stunned')); });
    expect(out).toEqual([{ given: true, id: 1, count: 1 }, { given: false, why: 'already', count: 1 }]);
    expect(s.timing?.effects).toHaveLength(1);
    expect([statusCount(s, 'u1', 'stunned'), hasStatus(s, 'u2', 'stunned')]).toEqual([1, false]);
  });

  it('K542 stealth ends when its unit enters combat (a named event with the unit as instance), not when another unit does', () => {
    const seen: boolean[] = [];
    play((ctx) => {
      giveStatus(ctx, T, 'u1', 'stealth', { instance: 'u1' });
      giveStatus(ctx, T, 'u2', 'stealth', { instance: 'u2' });
      boundary(ctx, { kind: 'turnEnd' });
      eventOver(ctx, 'entersCombat', 'u2');
      seen.push(hasStatus(ctx.s, 'u1', 'stealth'), hasStatus(ctx.s, 'u2', 'stealth'));
      eventOver(ctx, 'entersCombat', 'u1');
      seen.push(hasStatus(ctx.s, 'u1', 'stealth'));
    });
    expect(seen).toEqual([true, false, false]);
  });

  it('K542 a wound stacks: each give adds one; removing takes the oldest first; leaving play ends them (endsOnLeave)', () => {
    const out: unknown[] = [];
    play((ctx) => {
      out.push([1, 2, 3].map(() => giveStatus(ctx, T, 'u1', 'wound').given));
      giveStatus(ctx, T, 'u1', 'notInCombat');
      out.push(statusCount(ctx.s, 'u1', 'wound'), removeStatus(ctx, 'u1', 'wound', 1), statusesOf(ctx.s, T, 'u1'));
      out.push(statusLeft(ctx, T, 'u1'), statusesOf(ctx.s, T, 'u1'));
    });
    expect(out).toEqual([[true, true, true], 3, 1, [{ name: 'wound', token: 'wound', count: 2 }, { name: 'notInCombat', token: 'out', count: 1 }], ['wound'], [{ name: 'notInCombat', token: 'out', count: 1 }]]);
  });

  it('K542 "not in combat" lasts until removed by hand: turn ends, events and leaving play do not end it', () => {
    const out: unknown[] = [];
    play((ctx) => {
      giveStatus(ctx, T, 'u1', 'notInCombat');
      boundary(ctx, { kind: 'turnEnd' });
      boundary(ctx, { kind: 'roundEnd' });
      eventOver(ctx, 'entersCombat');
      statusLeft(ctx, T, 'u1');
      out.push(hasStatus(ctx.s, 'u1', 'notInCombat'), removeStatus(ctx, 'u1', 'notInCombat'), hasStatus(ctx.s, 'u1', 'notInCombat'), removeStatus(ctx, 'u1', 'notInCombat'));
    });
    expect(out).toEqual([true, 1, false, 0]);
  });

  it('K542 removeStatus takes the oldest stack first; each stack ends on its own end', () => {
    const out: unknown[] = [];
    const heal = (instance: string): { ends: { until: 'event'; event: string; instance: string } } => ({ ends: { until: 'event', event: 'heal', instance } });
    play((ctx) => {
      giveStatus(ctx, T, 'u1', 'wound', heal('a'));
      giveStatus(ctx, T, 'u1', 'wound', heal('b'));
      giveStatus(ctx, T, 'u1', 'wound', heal('c'));
      eventOver(ctx, 'heal', 'c');
      out.push(statusCount(ctx.s, 'u1', 'wound'), removeStatus(ctx, 'u1', 'wound', 1));
      eventOver(ctx, 'heal', 'a');
      out.push(statusCount(ctx.s, 'u1', 'wound'));
      eventOver(ctx, 'heal', 'b');
      out.push(statusCount(ctx.s, 'u1', 'wound'));
    });
    expect(out).toEqual([2, 1, 1, 0]);
  });

  it('K542 removeStatus with n below 1, NaN or not whole is an engine bug and removes nothing', () => {
    const out: number[] = [];
    play((ctx) => {
      for (let i = 0; i < 3; i++) giveStatus(ctx, T, 'u1', 'wound');
      for (const n of [-1, 0, NaN, 1.5]) expect(() => removeStatus(ctx, 'u1', 'wound', n), String(n)).toThrow(EngineBugError);
      out.push(statusCount(ctx.s, 'u1', 'wound'), removeStatus(ctx, 'u1', 'wound', 2), statusCount(ctx.s, 'u1', 'wound'));
    });
    expect(out).toEqual([3, 2, 1]);
  });

  it('K542 reads take the game EffectsConfig: a blanked source or a false `when` hides the status, as in effectsOf', () => {
    const out: unknown[] = [];
    const s = play((ctx) => {
      giveStatus(ctx, T, 'u6', 'stunned');
      giveStatus(ctx, T, 'u7', 'stunned', { when: 'inCombat' });
      out.push(giveStatus(ctx, T, 'u6', 'stunned').given);
    });
    const blanked = { blanked: () => ['u6'] };
    const cond = (v: boolean) => ({ conditions: { inCombat: () => v } });
    const agree = (obj: string, cfg: EffectsConfig<TimedState>): [boolean, boolean] => [hasStatus(s, obj, 'stunned', cfg), effectsOf(s, 'status', (e) => e.target === obj, cfg).length > 0];
    expect(out).toEqual([false]);
    expect([agree('u6', blanked), agree('u6', {}), agree('u7', cond(false)), agree('u7', cond(true))]).toEqual([[false, false], [true, true], [false, false], [true, true]]);
    expect([statusesOf(s, T, 'u6', blanked), statusCount(s, 'u7', 'stunned', cond(false))]).toEqual([[], 0]);
    expect(() => hasStatus(s, 'u7', 'stunned')).toThrow(EngineBugError);
  });

  it('K542 a status not in the table is an engine bug', () => {
    play((ctx) => { expect(() => giveStatus(ctx, T, 'u1', 'frozen')).toThrow(EngineBugError); });
  });

  it('K542 a game that only reads statuses keeps no effects key and hashes as one that never heard of them', () => {
    const reads = timedGame({ happen: (ctx) => { void statusesOf(ctx.s, T, "u1"); void hasStatus(ctx.s, "u1", "stunned"); } });
    const plain = timedGame({ happen: () => {} });
    const run = (g: typeof plain): TimedState => { const s0 = startTimed(g); return applyAction(g, s0, answer(s0, 'hit'), null).state; };
    expect(run(reads).timing).not.toHaveProperty('effects');
    expect(hashState(run(reads))).toBe(hashState(run(plain)));
  });

  it('K542 statuses are plain state: a save restores them, replay gives the same hash, undo takes the give back', () => {
    const g = timedGame({ happen: (ctx) => { giveStatus(ctx, T, 'u1', 'wound'); giveStatus(ctx, T, 'u1', 'stealth', { instance: 'u1' }); } }, { end: (ctx) => ask(ctx, 'fin'), fin: () => {} });
    const s0 = startTimed(g);
    const act = answer(s0, 'hit');
    const s1 = applyAction(g, s0, act, null).state;
    expect(statusesOf(s1, T, 'u1')).toHaveLength(2);
    const save = createSave(g, { options: { seed: 'k93' }, rules: { items: s0.rules.items }, actions: [act], undoUsed: false, savedAt: '2026-01-01' }, null);
    const back = importSave(g, exportSave(save), null);
    expect(back.ok && hashState(back.state)).toBe(hashState(s1));
    expect(back.ok && statusesOf(back.state, T, 'u1')).toEqual(statusesOf(s1, T, 'u1'));
    expect(replay(g, { seed: 'k93' }, s0.rules, [act], null).hash).toBe(hashState(s1));
    const h = recordAction(g, newHistory<Timed>({ seed: 'k93' }, s0.rules), act, null).history;
    const u = undo(g, h, 'free', null);
    expect(u.error).toBe(null);
    expect(u.ok && u.state !== null && statusesOf(u.state, T, 'u1')).toEqual([]);
  });
});

describe('K542 README recipe "Statuses" runs', () => {
  it('the README block is this test', () => {
    const out: unknown[] = [];
    play((ctx) => {
      // recipe:start
      const STATUSES: StatusTable = { stunned: { token: 'stun', ends: { until: 'endOfTurn' } }, wound: { token: 'wound', stacks: true, ends: 'removed', endsOnLeave: true } };
      const first = giveStatus(ctx, STATUSES, 'u1', 'stunned'); // { given: true, id, count: 1 }
      const again = giveStatus(ctx, STATUSES, 'u1', 'stunned'); // { given: false, why: 'already', count: 1 }: it does not stack
      const act = { id: 'act', enabled: !hasStatus(ctx.s, 'u1', 'stunned') }; // a stunned unit cannot act
      giveStatus(ctx, STATUSES, 'u1', 'wound'); giveStatus(ctx, STATUSES, 'u1', 'wound'); // stacks: statusCount 2
      const tokens = statusesOf(ctx.s, STATUSES, 'u1'); // [{ name: 'stunned', token: 'stun', count: 1 }, { name: 'wound', token: 'wound', count: 2 }]
      boundary(ctx, { kind: 'turnEnd' }); // the stun ends with the turn
      statusLeft(ctx, STATUSES, 'u1'); // the unit left play: its wounds go (endsOnLeave)
      // recipe:end
      out.push(first, again, act, tokens, statusesOf(ctx.s, STATUSES, 'u1'));
    });
    expect(out).toEqual([{ given: true, id: 1, count: 1 }, { given: false, why: 'already', count: 1 }, { id: 'act', enabled: false }, [{ name: 'stunned', token: 'stun', count: 1 }, { name: 'wound', token: 'wound', count: 2 }], []]);
    const src = readFileSync(fileURLToPath(import.meta.url), 'utf8').replaceAll('\r', '');
    const block = /\/\/ recipe:start\n([\s\S]*?)\s*\/\/ recipe:end/.exec(src)?.[1] ?? 'none';
    const readme = readFileSync(new URL('README.md', import.meta.url), 'utf8').replaceAll('\r', '');
    const lines = block.split('\n').map((l) => l.trim());
    expect(lines.length).toBe(8);
    expect(/## Statuses \(K542\)[\s\S]*?```ts\n([\s\S]*?)```/.exec(readme)?.[1]?.trim().split('\n').map((l) => l.trim())).toEqual(lines);
  });
});

type Op = { op: 'give'; obj: string; name: string } | { op: 'remove'; obj: string; name: string; n?: number } | { op: 'turnEnd' } | { op: 'enters'; obj: string } | { op: 'leave'; obj: string } | { op: 'expire' };
const OBJS = ['u1', 'u2', 'c1'];
const NAMES = Object.keys(T);

function script(seed: number, n: number): Op[] {
  let x = seed;
  const r = (k: number): number => { x = (Math.imul(x, 1103515245) + 12345) >>> 0; return (x >>> 8) % k; };
  const pick = <V,>(xs: readonly V[]): V => xs[r(xs.length)] as V;
  const ops: Op[] = [];
  for (let i = 0; i < n; i++) {
    const k = r(8);
    const obj = pick(OBJS);
    const name = pick(NAMES);
    ops.push(k <= 2 ? { op: 'give', obj, name } : k === 3 ? { op: 'remove', obj, name, ...(r(2) === 0 ? {} : { n: 1 + r(2) }) } : k === 4 ? { op: 'turnEnd' } : k === 5 ? { op: 'enters', obj } : k === 6 ? { op: 'leave', obj } : { op: 'expire' });
  }
  return ops;
}

describe('K542 comparison: random give, remove, expire and leave-play sequences against a plain model (stays)', () => {
  it('K542 300 random sequences: every object\'s statuses, counts and give results match the model after every step', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const ops = script(seed, 40);
      let model: { obj: string; name: string; id: number }[] = [];
      const view = (obj: string): { name: string; token: string; count: number }[] => {
        const out: { name: string; token: string; count: number }[] = [];
        for (const m of model.filter((e) => e.obj === obj)) {
          const v = out.find((o) => o.name === m.name);
          if (v === undefined) out.push({ name: m.name, token: (T[m.name] as { token: string }).token, count: 1 }); else v.count += 1;
        }
        return out;
      };
      play((ctx) => {
        ops.forEach((o, i) => {
          const at = `seed ${String(seed)} step ${String(i)}`;
          if (o.op === 'give') {
            const had = model.some((m) => m.obj === o.obj && m.name === o.name);
            const res = giveStatus(ctx, T, o.obj, o.name, { instance: o.obj });
            const stacks = o.name === 'wound';
            expect(res.given, at).toBe(stacks || !had);
            if (res.given) model.push({ obj: o.obj, name: o.name, id: res.id });
          }
          if (o.op === 'remove') {
            const mine = model.filter((m) => m.obj === o.obj && m.name === o.name).slice(0, o.n ?? Infinity);
            expect(removeStatus(ctx, o.obj, o.name, o.n), at).toBe(mine.length);
            model = model.filter((m) => !mine.includes(m));
          }
          if (o.op === 'turnEnd') { boundary(ctx, { kind: 'turnEnd' }); model = model.filter((m) => m.name !== 'stunned'); }
          if (o.op === 'enters') { eventOver(ctx, 'entersCombat', o.obj); model = model.filter((m) => !(m.name === 'stealth' && m.obj === o.obj)); }
          if (o.op === 'leave') { statusLeft(ctx, T, o.obj); model = model.filter((m) => !(m.name === 'wound' && m.obj === o.obj)); }
          if (o.op === 'expire') expireEffects(ctx);
          for (const obj of OBJS) {
            expect(statusesOf(ctx.s, T, obj), `${at} ${obj}`).toEqual(view(obj));
            expect(effectsOf(ctx.s, 'status', (e) => e.target === obj).map((e) => e.id), `${at} ${obj} ids`).toEqual(model.filter((m) => m.obj === obj).map((m) => m.id));
            for (const name of NAMES) expect(statusCount(ctx.s, obj, name), `${at} ${obj} ${name}`).toBe(model.filter((m) => m.obj === obj && m.name === name).length);
          }
        });
      });
    }
  });
});
