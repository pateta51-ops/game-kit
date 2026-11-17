// K287: an `alone` option (Back, Pass) is answered on its own, whatever min/max say.
import { describe, expect, it } from 'vitest';
import { enumerateAnswers, firstPicks, makeCtx, onlyOne, outcomePicks, randomPicks, run, validateAction, type HandlerTable, type KernelPrompt } from './index.ts';
import { bareState, CONTENT, COUNTER, type Counter, type CounterState } from './fake/counter.ts';

const opts = [{ id: 'a', enabled: true }, { id: 'b', enabled: true }, { id: 'c', enabled: true }, { id: 'd', enabled: true }, { id: 'back', enabled: true, alone: true as const }];
const at = (p: Omit<KernelPrompt, 'id'>): CounterState => ({ ...bareState(), prompt: { id: 1, ...p } });
const s = at({ min: 3, max: 3, options: opts });
const ok = (st: CounterState, picks: string[]) => validateAction(st, { kind: 'answer', promptId: 1, picks });

describe('K287 alone options', () => {
  it('K287: Back alone is legal; Back plus 2 is not; 3 actions are; 2 are not', () => {
    expect(ok(s, ['back']).ok).toBe(true);
    const r = ok(s, ['back', 'a', 'b']);
    expect(r.ok ? '' : r.error).toMatch(/^NOT_LEGAL/);
    expect(ok(s, ['a', 'b', 'c']).ok).toBe(true);
    expect(ok(s, ['a', 'b']).ok).toBe(false);
    expect(ok(s, ['a', 'b', 'c', 'back']).ok).toBe(false);
  });

  it('K287: the answers list holds Back once, every answer validates', () => {
    const all = enumerateAnswers(s).map((a) => a.picks);
    expect(all.filter((p) => p.includes('back'))).toEqual([['back']]);
    expect(all).toHaveLength(5);
    for (const a of enumerateAnswers(s)) expect(validateAction(s, a).ok).toBe(true);
  });

  it('K287: default, outcome and random answers skip Back unless only Back can be answered', () => {
    expect(firstPicks(s)).toEqual(['a', 'b', 'c']);
    expect(outcomePicks(at({ min: 3, max: 3, options: opts.map((o) => ({ ...o, outcome: 'good' as const })) }))).toEqual(['a', 'b', 'c']);
    for (let i = 0; i < 10; i += 1) expect(ok(s, randomPicks(s, String(i))).ok).toBe(true);
    const lone = at({ min: 3, max: 3, options: [{ id: 'a', enabled: true }, { id: 'back', enabled: true, alone: true }] });
    expect(firstPicks(lone)).toEqual(['back']);
    expect(outcomePicks(lone)).toEqual(['back']);
    expect(randomPicks(lone, 'x')).toEqual(['back']);
    expect(enumerateAnswers(lone).map((a) => a.picks)).toEqual([['back']]);
    expect(onlyOne(lone.prompt as KernelPrompt)?.taken).toBe('back');
    expect(onlyOne(s.prompt as KernelPrompt)).toBeNull();
  });

  it('K287: a prompt with only Back enabled is still answerable at ask time', () => {
    const table: HandlerTable<Counter> = { asks: (ctx) => ctx.ask({ min: 3, max: 3, options: [{ id: 'a', enabled: false }, { id: 'back', enabled: true, alone: true }] }, { kind: 'r' }), r: () => undefined };
    const st = bareState();
    const ctx = makeCtx<Counter>(COUNTER, st, CONTENT, []);
    ctx.then({ kind: 'asks' });
    expect(() => run(ctx, table)).not.toThrow();
    expect(st.prompt?.options.map((o) => o.id)).toContain('back');
  });
});
