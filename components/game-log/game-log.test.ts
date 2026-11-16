import { describe, expect, it } from 'vitest';
import { appendLog, blocks, groupBox, refFocus, refsOf, rowFocus, delta, exportText, num, previewAt, rewindLog, stepOf, plainLine, ref, text, wordingProblems, type Narrator, type TypedEvent } from './index';

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
  it('undo to a line, preview, export', () => {
    const log = appendLog(appendLog([], evs.slice(1, 2), table, 1), evs.slice(2, 3), table, 2);
    expect(rewindLog(log, 1)).toEqual({ log: [log[0]], step: 1 });
    expect(rewindLog(log, 0, true)?.log).toEqual([log[0]]);
    expect(rewindLog(log, 9)).toBeUndefined();
    expect(stepOf(log, 1)).toBe(2);
    expect(previewAt(log, 0)).toEqual({ rows: [log[0]], step: 1 });
    expect(exportText(log)).toBe('1 mechanic:   Ann loses 2 health <bad> (card:c1)\n2 mechanic:   Ann loses 1 health <bad> (card:c1)\n');
  });
  it('map refs and group boxes (K122)', () => {
    const row = { kind: 'action' as const, parts: [ref('piece', 'p1'), text(' moves to '), { t: 'list' as const, items: [[ref('space', 's2')], [ref('card', 'c1')]] }], cause: { type: 'card', id: 'c9' } };
    expect(refsOf(row).map((r) => r.id)).toEqual(['p1', 's2', 'c1']);
    expect(refsOf(row, true).map((r) => r.id)).toEqual(['p1', 's2', 'c1', 'c9']);
    const types = ['space', 'piece'];
    expect(rowFocus(row, types).highlight.map((r) => r.id)).toEqual(['p1', 's2']);
    expect(rowFocus(row, types).scrollTo).toBeUndefined();
    expect(rowFocus(row, types, 'click').scrollTo?.id).toBe('p1');
    expect(refFocus({ type: 'card', id: 'c1' }, types, 'click')).toEqual({ highlight: [] });
    expect(refFocus({ type: 'space', id: 's2' }, types, 'click')).toEqual({ highlight: [{ type: 'space', id: 's2' }], scrollTo: { type: 'space', id: 's2' } });
    const log = appendLog([], [{ seq: 1, type: 'hurt', who: 'a', n: 1 }], table, 1);
    const box = groupBox(blocks(log)[0] ?? []);
    expect(box.id).toBe('g1');
    expect(box.members.length).toBe(1);
    expect(box.header).toBeUndefined();
  });
  it('wording rules', () => {
    expect(wordingProblems({ kind: 'action', parts: [text('ok '), delta(2)] })).toEqual([]);
    expect(wordingProblems({ kind: 'action', parts: [] })).toEqual(['no parts']);
    expect(wordingProblems({ kind: 'action', parts: [text('a '), text(' b'), delta(0), num(NaN)] }).sort()).toEqual(['delta of 0', 'line has stray spaces', 'line shows a raw value', 'number is not finite']);
    expect(wordingProblems({ kind: 'action', parts: [text('x undefined')] })).toEqual(['line shows a raw value']);
    expect(wordingProblems({ kind: 'action', parts: [{ t: 'ref', ref: { type: '', id: 'a' } }] })).toEqual(['ref without type or id']);
  });
});
