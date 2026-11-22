// K546: objectives with progress on the timed fake game. Restated cases of three games (component.json sources):
// progress capped at its target, a goal of several parts met when every part is, a goal completed once, a threshold
// reached is reported once, a second threshold ends it the other way, met when what it has reaches what it needs.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyAction, createSave, would, EngineBugError, exportSave, hashState, importSave, newHistory, recordAction, replay, undo, type Ctx, type GameRules } from './index.ts';
import { advanceObjective, failObjective, markStep, objectiveDone, objectiveFailed, objectiveProgress, objectivesCheck, objectivesOf, objectivesRoundEnd, reportObjectives, startObjectives, type ObjectiveDef, type ObjectiveReport } from './timed.ts';
import { answer, HIT, startTimed, timedGame, type Timed, type TimedState } from './fake/timed.ts';

const play = (f: (ctx: Ctx<Timed>) => void): TimedState => startTimed(timedGame({}, { turn: f }));
const MISSION: ObjectiveDef = { id: 'm', kind: 'count', target: 3 };
const CLEAR: ObjectiveDef = { id: 'c', kind: 'count', target: 2, fail: { failures: 3 } };
const GOAL: ObjectiveDef = { id: 'g', kind: 'steps', steps: ['research', 'military', 'influence'] };

describe('K546 objectives', () => {
  it('K546 count: have is capped at need; advancing past the target stays done and changes nothing', () => {
    const out: unknown[] = [];
    const s = play((ctx) => {
      startObjectives(ctx, [MISSION]);
      out.push(advanceObjective(ctx, 'm', 2).have, objectiveDone(ctx.s, 'm'));
      out.push(advanceObjective(ctx, 'm', 5), objectiveDone(ctx.s, 'm'));
      const before = hashState(ctx.s);
      out.push(advanceObjective(ctx, 'm', 1).have, hashState(ctx.s) === before);
    });
    expect(out).toEqual([2, false, { id: 'm', have: 3, need: 3, steps: [], failures: 0, outcome: 'done' }, true, 3, true]);
    expect(objectiveProgress(s, 'm').have).toBe(3);
  });

  it('K546 a goal of several parts: unordered steps are done only when every step is marked, in any order', () => {
    const out: unknown[] = [];
    play((ctx) => {
      startObjectives(ctx, [GOAL]);
      out.push(markStep(ctx, 'g', 'influence'), markStep(ctx, 'g', 'research'), objectiveDone(ctx.s, 'g'), objectiveProgress(ctx.s, 'g'));
      out.push(markStep(ctx, 'g', 'research'), markStep(ctx, 'g', 'military'), objectiveDone(ctx.s, 'g'), markStep(ctx, 'g', 'research'));
    });
    expect(out).toEqual([
      { marked: true }, { marked: true }, false, { id: 'g', have: 2, need: 3, steps: ['influence', 'research'], failures: 0, outcome: 'open' },
      { marked: false, why: 'already' }, { marked: true }, true, { marked: false, why: 'closed' },
    ]);
  });

  it('K546 ordered steps: only the next step is taken; an out-of-order step changes nothing', () => {
    const out: unknown[] = [];
    play((ctx) => {
      startObjectives(ctx, [{ id: 'o', kind: 'steps', steps: ['a', 'b'], ordered: true }]);
      out.push(markStep(ctx, 'o', 'b'), objectiveProgress(ctx.s, 'o').steps, markStep(ctx, 'o', 'a'), markStep(ctx, 'o', 'b'), objectiveDone(ctx.s, 'o'));
    });
    expect(out).toEqual([{ marked: false, why: 'order' }, [], { marked: true }, { marked: true }, true]);
  });

  it('K546 failures: reaching fail.failures fail it; a failed objective takes no progress', () => {
    const out: unknown[] = [];
    play((ctx) => {
      startObjectives(ctx, [CLEAR]);
      advanceObjective(ctx, 'c');
      out.push(failObjective(ctx, 'c', 2).outcome, failObjective(ctx, 'c').outcome, objectiveFailed(ctx.s, 'c'));
      out.push(advanceObjective(ctx, 'c', 5).have, objectiveDone(ctx.s, 'c'), failObjective(ctx, 'c').failures);
    });
    expect(out).toEqual(['open', 'failed', true, 1, false, 3]);
  });

  it('K546 a deadline: open objectives whose fail.round has come fail at that round end; done and later ones do not', () => {
    const out: unknown[] = [];
    play((ctx) => {
      startObjectives(ctx, [{ ...MISSION, fail: { round: 2 } }, { id: 'later', kind: 'count', target: 1, fail: { round: 3 } }, { id: 'won', kind: 'count', target: 1, fail: { round: 1 } }]);
      advanceObjective(ctx, 'won');
      out.push(objectivesRoundEnd(ctx, 1), objectivesRoundEnd(ctx, 2), objectivesOf(ctx.s).map((p) => p.outcome), objectivesRoundEnd(ctx, 2));
    });
    expect(out).toEqual([[], ['m'], ['failed', 'open', 'done'], []]);
  });

  it('K546 owner seat: objectivesOf filters by owner; progress carries it', () => {
    const s = play((ctx) => startObjectives(ctx, [{ ...MISSION, owner: 'p1' }, { ...GOAL, owner: 'p2' }, CLEAR]));
    expect(objectivesOf(s, 'p1').map((p) => [p.id, p.owner])).toEqual([['m', 'p1']]);
    expect(objectivesOf(s).map((p) => p.id)).toEqual(['m', 'g', 'c']);
  });

  it('K546 bad input is an engine bug and changes nothing', () => {
    const errs: unknown[] = [];
    const s = play((ctx) => {
      startObjectives(ctx, [MISSION, GOAL, CLEAR]);
      const tries = [
        () => startObjectives(ctx, [MISSION]),
        () => startObjectives(ctx, [{ id: 'z', kind: 'count', target: 0 }]),
        () => startObjectives(ctx, [{ id: 'z', kind: 'steps', steps: ['a', 'a'] }]),
        () => advanceObjective(ctx, 'm', 0),
        () => advanceObjective(ctx, 'm', 1.5),
        () => advanceObjective(ctx, 'g'),
        () => markStep(ctx, 'm', 'a'),
        () => markStep(ctx, 'g', 'nope'),
        () => failObjective(ctx, 'm'),
        () => objectiveProgress(ctx.s, 'missing'),
        ...[NaN, 0, -1, 1.5].flatMap((n) => [() => advanceObjective(ctx, 'm', n), () => failObjective(ctx, 'c', n)]),
        () => startObjectives(ctx, [{ id: 'z', kind: 'count', target: 1, fail: {} }]),
        () => startObjectives(ctx, [{ id: 'z', kind: 'count', target: 1, fail: { round: 1.5 } }]),
        () => startObjectives(ctx, [{ id: 'z', kind: 'count', target: 1, fail: { round: NaN } }]),
        () => startObjectives(ctx, [{ id: 'z', kind: 'count', target: 1, fail: { round: -1 } }]),
        () => objectivesRoundEnd(ctx, NaN),
        () => objectivesRoundEnd(ctx, 2.5),
        () => objectivesRoundEnd(ctx, -1),
      ];
      for (const t of tries) { try { t(); errs.push('no error'); } catch (e) { errs.push(e instanceof EngineBugError); } }
    });
    expect(errs).toEqual(Array(25).fill(true));
    expect(objectivesOf(s).map((p) => [p.id, p.have, p.failures])).toEqual([['m', 0, 0], ['g', 0, 0], ['c', 0, 0]]);
  });

  it('K546 a game that uses no objectives keeps no objectives key and hashes as before', () => {
    const reads = timedGame({ happen: (ctx) => { void objectivesOf(ctx.s); void reportObjectives(ctx); }, checkpoint: { checks: [objectivesCheck(() => {})] } });
    const plain = timedGame({ happen: () => {}, checkpoint: { checks: [] } });
    const run = (g: GameRules<Timed>): TimedState => { const s0 = startTimed(g); return applyAction(g, s0, answer(s0, 'hit'), null).state; };
    expect(run(reads)).not.toHaveProperty('objectives');
    expect(hashState(run(reads))).toBe(hashState(run(plain)));
  });

  it('K546 the state check reports done once: later checkpoints and advances past the target do not report it again', () => {
    const seen: ObjectiveReport[] = [];
    const g = timedGame({
      happen: (ctx) => { advanceObjective(ctx, 'c'); advanceObjective(ctx, 'c'); },
      checkpoint: { checks: [objectivesCheck((_ctx, r) => { seen.push(r); })] },
    }, { turn: (ctx) => { startObjectives(ctx, [CLEAR, { ...MISSION, fail: { failures: 1 } }]); failObjective(ctx, 'm'); ctx.then({ kind: 'chosen' }); ctx.ask({ min: 1, max: 1, options: [{ id: 'hit', enabled: true }] }); } });
    const s0 = startTimed(g, { items: [HIT, HIT, HIT] });
    const s = applyAction(g, s0, answer(s0, 'hit'), null).state;
    expect(seen).toEqual([{ id: 'c', outcome: 'done' }, { id: 'm', outcome: 'failed' }]);
    expect(objectiveProgress(s, 'c')).toMatchObject({ have: 2, outcome: 'done' });
  });

  it('K546 a report fires once across a save and load: the loaded state does not report it again', () => {
    const seen: ObjectiveReport[] = [];
    const g = timedGame({
      happen: (ctx) => { advanceObjective(ctx, 'm', 3); },
      checkpoint: { checks: [objectivesCheck((_ctx, r) => { seen.push(r); })] },
    }, { turn: (ctx) => { startObjectives(ctx, [MISSION]); ctx.then({ kind: 'chosen' }); ctx.ask({ min: 1, max: 1, options: [{ id: 'hit', enabled: true }] }); }, end: (ctx) => ctx.ask({ min: 1, max: 1, options: [{ id: 'again', enabled: true }] }, { kind: 'again' }), again: (ctx) => { ctx.then({ kind: 'fin' }); would(ctx, [HIT]); }, fin: () => {} });
    const s0 = startTimed(g);
    const s1 = applyAction(g, s0, answer(s0, 'hit'), null).state;
    expect(seen).toEqual([{ id: 'm', outcome: 'done' }]);
    const loaded = JSON.parse(JSON.stringify(s1)) as TimedState;
    expect(hashState(loaded)).toBe(hashState(s1));
    const s2 = applyAction(g, loaded, answer(loaded, 'again'), null).state;
    expect(s2.log.filter((e) => e.type === 'damaged')).toHaveLength(2);
    expect(seen).toEqual([{ id: 'm', outcome: 'done' }]);
    expect(objectiveProgress(s2, 'm')).toMatchObject({ have: 3, outcome: 'done' });
  });

  it('K546 objectives are plain state: a save restores them, replay gives the same hash, undo takes the advance back', () => {
    const g = timedGame({ happen: (ctx) => { advanceObjective(ctx, 'm'); markStep(ctx, 'g', 'military'); } }, { turn: (ctx) => { startObjectives(ctx, [MISSION, GOAL]); ctx.then({ kind: 'chosen' }); ctx.ask({ min: 1, max: 1, options: [{ id: 'hit', enabled: true }] }); }, end: (ctx) => ctx.ask({ min: 1, max: 1, options: [{ id: 'fin', enabled: true }] }, { kind: 'fin' }), fin: () => {} });
    const s0 = startTimed(g);
    const act = answer(s0, 'hit');
    const s1 = applyAction(g, s0, act, null).state;
    expect(objectivesOf(s1).map((p) => p.have)).toEqual([1, 1]);
    const save = createSave(g, { options: { seed: 'k93' }, rules: { items: s0.rules.items }, actions: [act], undoUsed: false, savedAt: '2026-01-01' }, null);
    const back = importSave(g, exportSave(save), null);
    expect(back.ok && hashState(back.state)).toBe(hashState(s1));
    expect(back.ok && objectivesOf(back.state)).toEqual(objectivesOf(s1));
    expect(replay(g, { seed: 'k93' }, s0.rules, [act], null).hash).toBe(hashState(s1));
    const u = undo(g, recordAction(g, newHistory<Timed>({ seed: 'k93' }, s0.rules), act, null).history, 'free', null);
    expect(u.ok && u.state !== null && objectivesOf(u.state).map((p) => p.have)).toEqual([0, 0]);
  });
});

describe('K546 README recipe "Objectives" runs', () => {
  it('the README block is this test', () => {
    const out: unknown[] = [];
    play((ctx) => {
      // recipe:start
      startObjectives(ctx, [{ id: 'reach', kind: 'count', target: 3, fail: { round: 5 } }, { id: 'escape', kind: 'steps', steps: ['key', 'door'], ordered: true, owner: 'p1' }]);
      const two = advanceObjective(ctx, 'reach', 2); // { id: 'reach', have: 2, need: 3, steps: [], failures: 0, outcome: 'open' }
      const early = markStep(ctx, 'escape', 'door'); // { marked: false, why: 'order' }: the key comes first
      markStep(ctx, 'escape', 'key'); markStep(ctx, 'escape', 'door'); // escape is done
      const fired = reportObjectives(ctx); // [{ id: 'escape', outcome: 'done' }], once; objectivesCheck(react) does this in the checkpoint
      const late = objectivesRoundEnd(ctx, 5); // ['reach']: not done by the end of round 5
      const mine = objectivesOf(ctx.s, 'p1').map((p) => p.outcome); // ['done']
      // recipe:end
      out.push(two, early, fired, late, mine, reportObjectives(ctx), reportObjectives(ctx));
    });
    expect(out).toEqual([{ id: 'reach', have: 2, need: 3, steps: [], failures: 0, outcome: 'open' }, { marked: false, why: 'order' }, [{ id: 'escape', outcome: 'done' }], ['reach'], ['done'], [{ id: 'reach', outcome: 'failed' }], []]);
    const src = readFileSync(fileURLToPath(import.meta.url), 'utf8').replaceAll('\r', '');
    const block = /\/\/ recipe:start\n([\s\S]*?)\s*\/\/ recipe:end/.exec(src)?.[1] ?? 'none';
    const readme = readFileSync(new URL('README.md', import.meta.url), 'utf8').replaceAll('\r', '');
    const lines = block.split('\n').map((l) => l.trim());
    expect(lines.length).toBe(7);
    expect(/## Objectives \(K546\)[\s\S]*?```ts\n([\s\S]*?)```/.exec(readme)?.[1]?.trim().split('\n').map((l) => l.trim())).toEqual(lines);
  });
});

type Op = { op: 'advance'; id: string; n: number } | { op: 'step'; id: string; step: string } | { op: 'fail'; id: string; n: number } | { op: 'round'; r: number };
const DEFS: ObjectiveDef[] = [
  { id: 'n', kind: 'count', target: 4, fail: { failures: 2, round: 6 } },
  { id: 'u', kind: 'steps', steps: ['a', 'b', 'c'], fail: { failures: 3 } },
  { id: 'o', kind: 'steps', steps: ['a', 'b', 'c'], ordered: true, fail: { round: 4 } },
  { id: 'p', kind: 'count', target: 2 },
];

function script(seed: number, n: number): Op[] {
  let x = seed;
  const r = (k: number): number => { x = (Math.imul(x, 1103515245) + 12345) >>> 0; return (x >>> 8) % k; };
  const ops: Op[] = [];
  for (let i = 0; i < n; i++) {
    const k = r(6);
    ops.push(k <= 1 ? { op: 'advance', id: r(2) === 0 ? 'n' : 'p', n: 1 + r(3) } : k <= 3 ? { op: 'step', id: r(2) === 0 ? 'u' : 'o', step: ['a', 'b', 'c'][r(3)] as string } : k === 4 ? { op: 'fail', id: r(2) === 0 ? 'n' : 'u', n: 1 + r(2) } : { op: 'round', r: 1 + r(7) });
  }
  return ops;
}

describe('K546 comparison: random advance, step, fail and round-end sequences against a plain model (stays)', () => {
  it('K546 300 random sequences: progress, done, failed and the reports match the model after every step', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const m = new Map(DEFS.map((d) => [d.id, { have: 0, steps: [] as string[], failures: 0, done: false, failed: false, told: false }]));
      const need = (d: ObjectiveDef): number => (d.kind === 'count' ? d.target : d.steps.length);
      play((ctx) => {
        startObjectives(ctx, DEFS);
        script(seed, 30).forEach((o, i) => {
          const at = `seed ${String(seed)} step ${String(i)}`;
          if (o.op === 'round') {
            const late = DEFS.filter((d) => { const v = m.get(d.id)!; return !v.done && !v.failed && d.fail?.round !== undefined && d.fail.round <= o.r; }).map((d) => d.id);
            for (const id of late) m.get(id)!.failed = true;
            expect(objectivesRoundEnd(ctx, o.r), at).toEqual(late);
          } else {
            const d = DEFS.find((x) => x.id === o.id)!;
            const v = m.get(o.id)!;
            const open = !v.done && !v.failed;
            if (o.op === 'advance') { if (open) v.have = Math.min(v.have + o.n, need(d)); advanceObjective(ctx, o.id, o.n); }
            if (o.op === 'fail') { if (open) v.failures += o.n; failObjective(ctx, o.id, o.n); }
            if (o.op === 'step') {
              const why = !open ? 'closed' : v.steps.includes(o.step) ? 'already' : d.kind === 'steps' && d.ordered === true && d.steps[v.steps.length] !== o.step ? 'order' : null;
              if (why === null) v.steps.push(o.step);
              expect(markStep(ctx, o.id, o.step), at).toEqual(why === null ? { marked: true } : { marked: false, why });
            }
            if (open) {
              if ((d.kind === 'count' ? v.have : v.steps.length) >= need(d)) v.done = true;
              else if (d.fail?.failures !== undefined && v.failures >= d.fail.failures) v.failed = true;
            }
          }
          const want = DEFS.filter((d) => { const v = m.get(d.id)!; return (v.done || v.failed) && !v.told; }).map((d) => ({ id: d.id, outcome: m.get(d.id)!.done ? 'done' : 'failed' }));
          for (const w of want) m.get(w.id)!.told = true;
          expect(reportObjectives(ctx), at).toEqual(want);
          for (const d of DEFS) {
            const v = m.get(d.id)!;
            expect(objectiveProgress(ctx.s, d.id), `${at} ${d.id}`).toEqual({ id: d.id, have: d.kind === 'count' ? v.have : v.steps.length, need: need(d), steps: v.steps, failures: v.failures, outcome: v.done ? 'done' : v.failed ? 'failed' : 'open' });
            expect([objectiveDone(ctx.s, d.id), objectiveFailed(ctx.s, d.id)], `${at} ${d.id}`).toEqual([v.done, v.failed]);
          }
        });
      });
    }
  });
});
