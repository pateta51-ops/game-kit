import { describe, expect, it } from 'vitest';
import { appendLog, blocks, delta, num, plainLine, ref, text, wordingProblems, type Narrator, type TypedEvent } from './index';

type Ev = (TypedEvent & { type: 'hurt'; who: string; n: number }) | (TypedEvent & { type: 'tick' }) | (TypedEvent & { type: 'boom' });
const table: Narrator<Ev> = {
  hurt: (e) => ({ kind: 'mechanic', parts: [ref('player', e.who, 'Ann'), text(' loses '), num(e.n), text(' health')], cause: { type: 'card', id: 'c1' }, tone: 'bad', group: { id: 'g1', role: 'member' } }),
  boom: () => { throw new Error('x'); },
};
const evs: Ev[] = [{ seq: 1, type: 'tick' }, { seq: 2, type: 'hurt', who: 'a', n: 2 }, { seq: 3, type: 'hurt', who: 'a', n: 1 }, { seq: 4, type: 'boom' }];

describe('game-log', () => {
  it('writes rows only for events in the table; silence is the default', () => {
    const log = appendLog([], evs, table, 7);
    expect(log.map((r) => [r.id, r.seq, r.step, r.kind])).toEqual([[0, 2, 7, 'mechanic'], [1, 3, 7, 'mechanic'], [2, 4, 7, 'problem']]);
    expect(plainLine(log[0]!)).toBe('Ann loses 2 health');
    expect(log[0]!.cause).toEqual({ type: 'card', id: 'c1' });
  });
  it('is append-only: the old log is not changed and ids continue', () => {
    const a = appendLog([], evs.slice(0, 2), table, 1);
    const b = appendLog(a, evs.slice(2, 3), table, 2);
    expect(a).toHaveLength(1);
    expect(b.map((r) => r.id)).toEqual([0, 1]);
    expect(b[0]).toBe(a[0]);
  });
  it('groups a run sharing an id into one block', () => {
    const log = appendLog([], evs.slice(1), table, 1);
    expect(blocks(log).map((b) => b.length)).toEqual([2, 1]);
  });
  it('a narration may return several rows', () => {
    const t: Narrator<Ev> = { tick: () => [{ kind: 'notice', parts: [text('a')] }, { kind: 'notice', parts: [text('b')] }] };
    expect(appendLog([], evs, t, 0).map((r) => r.id)).toEqual([0, 1]);
  });
  it('wording rules', () => {
    expect(wordingProblems({ kind: 'action', parts: [text('ok '), delta(2)] })).toEqual([]);
    expect(wordingProblems({ kind: 'action', parts: [] })).toEqual(['no parts']);
    expect(wordingProblems({ kind: 'action', parts: [text('a '), text(' b'), delta(0), num(NaN)] }).sort()).toEqual(['delta of 0', 'line has stray spaces', 'line shows a raw value', 'number is not finite']);
    expect(wordingProblems({ kind: 'action', parts: [text('x undefined')] })).toEqual(['line shows a raw value']);
    expect(wordingProblems({ kind: 'action', parts: [{ t: 'ref', ref: { type: '', id: 'a' } }] })).toEqual(['ref without type or id']);
  });
});
