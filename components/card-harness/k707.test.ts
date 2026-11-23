import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProbe, expectNotFired, inventory, readRanLog, type RanNote, type RanRecord } from './index.ts';
import { inHook, ranRecordOf, recordRan, refuseConcurrent, type RanTask } from './ranLog.ts';

const routine = { kind: 'next-turn', options: [{ id: 'roll' }] };

describe('K707 expectNotFired prompt: unrelated', () => {
  it('by default a routine prompt open before and after the act still fails', () => {
    const t = { prompt: routine, s: { n: 1 }, events: [] };
    expect(() => expectNotFired(t, 'CL-1', () => undefined)).toThrow(/expectNotFired: a prompt is open/);
  });
  it('the same prompt open before the act passes with prompt: unrelated', () => {
    const t = { prompt: routine, s: { n: 1 }, events: [] };
    expect(() => expectNotFired(t, 'CL-1', () => undefined, undefined, { prompt: 'unrelated' })).not.toThrow();
  });
  it('a new prompt it cannot map fails even with prompt: unrelated', () => {
    const t: { prompt: object | null; s: object; events: never[] } = { prompt: null, s: { n: 1 }, events: [] };
    expect(() => expectNotFired(t, 'CL-1', () => void (t.prompt = { kind: 'pick', options: [] }), (s: { n: number }) => s.n, { prompt: 'unrelated' })).toThrow(/a prompt is open/);
  });
  it('a new prompt clauseOf maps to another clause passes; one mapped to the clause fails', () => {
    const clauseOf = (x: unknown): string | undefined => (x as { from?: string }).from;
    const t: { prompt: object | null; s: object; events: never[] } = { prompt: null, s: { n: 1 }, events: [] };
    expect(() => expectNotFired(t, 'CL-1', () => void (t.prompt = { kind: 'pick', from: 'CL-2' }), (s: { n: number }) => s.n, { prompt: 'unrelated', clauseOf })).not.toThrow();
    t.prompt = null;
    expect(() => expectNotFired(t, 'CL-1', () => void (t.prompt = { kind: 'pick', from: 'CL-1' }), (s: { n: number }) => s.n, { prompt: 'unrelated', clauseOf })).toThrow(/a prompt is open/);
  });
  it('an unchanged prompt that names the clause still fails, and without an act an unmapped prompt fails', () => {
    const named = { prompt: { kind: 'pick', card: 'CL-1', options: [] }, s: {}, events: [] };
    expect(() => expectNotFired(named, 'CL-1', () => undefined, undefined, { prompt: 'unrelated' })).toThrow(/a prompt is open/);
    expect(() => expectNotFired({ prompt: routine, s: {}, events: [] }, 'CL-1', undefined, undefined, { prompt: 'unrelated' })).toThrow(/a prompt is open/);
  });
});

describe('K707 run probe listen', () => {
  it('a listener hears every note beside trace, until stopped; trace keeps its own notes', () => {
    const p = createProbe<RanNote>();
    expect(p.listening).toBe(false);
    const heard: string[] = [];
    const stop = p.listen((d) => heard.push(d.id));
    expect(p.listening).toBe(true);
    p.note({ kind: 'op', id: 'a' });
    const { notes } = p.trace(() => p.note(() => ({ kind: 'op', id: 'b' })));
    stop();
    p.note({ kind: 'op', id: 'c' });
    expect(heard).toEqual(['a', 'b']);
    expect(notes.map((n) => n.id)).toEqual(['b']);
    expect(p.listening).toBe(false);
  });
});

const dir = mkdtempSync(join(tmpdir(), 'k707-'));
const log = join(dir, 'ran.jsonl');
const probe = createProbe<RanNote>();
describe('K707 recordRan writes passing tests only', () => {
  recordRan(probe, log);
  it('CL-1 resolves', () => {
    probe.note({ kind: 'op', id: 'gain' });
    probe.note({ kind: 'key', id: 'phase' });
    expect(1).toBe(1);
  });
  it.fails('CL-1 broken', () => {
    probe.note({ kind: 'op', id: 'lose' });
    expect(1).toBe(2);
  });
  it('CL-2 runs nothing', () => {
    expect(1).toBe(1);
  });
  describe('with setup hooks', () => {
    beforeEach(() => probe.note({ kind: 'op', id: 'setup' }));
    afterEach(() => probe.note({ kind: 'op', id: 'teardown' }));
    it('CL-3 body', () => {
      probe.note({ kind: 'op', id: 'body' });
      expect(1).toBe(1);
    });
  });
});
describe('K707 recordRan log', () => {
  it('holds one record: the passing test that ran pieces, with its notes sorted', () => {
    const recs = readRanLog(log);
    expect(recs.map((r) => [r.file, r.test, r.ran])).toEqual([
      ['components/card-harness/k707.test.ts', 'CL-1 resolves', ['key:phase', 'op:gain']],
      ['components/card-harness/k707.test.ts', 'CL-3 body', ['op:body']],
    ]);
    probe.note({ kind: 'op', id: 'after' });
    expect(readFileSync(log, 'utf8')).not.toContain('after');
  });
  it('a missing log throws, and records of another root are left out', () => {
    expect(() => readRanLog(join(dir, 'none.jsonl'))).toThrow(/run log .* is missing/);
    const other = join(dir, 'other.jsonl');
    writeFileSync(other, `${JSON.stringify({ file: 'a', test: 't', ran: ['op:x'], root: '/elsewhere' })}\n`);
    expect(existsSync(other)).toBe(true);
    expect(readRanLog(other)).toEqual([]);
  });
});

describe('K707 recorder guards', () => {
  const task = (state: string, more: Partial<RanTask> = {}): RanTask => ({ name: 'CL-1 x', file: { filepath: '/r/t.test.ts' }, result: { state }, ...more });
  const ran = new Set(['op:gain']);
  it('a plain failing or skipped test is not logged; a passing one is', () => {
    expect(ranRecordOf(task('fail'), ran, '/r')).toBeUndefined();
    expect(ranRecordOf(task('skip'), ran, '/r')).toBeUndefined();
    expect(ranRecordOf({ ...task('pass'), result: undefined }, ran, '/r')).toBeUndefined();
    expect(ranRecordOf(task('pass', { fails: true }), ran, '/r')).toBeUndefined();
    expect(ranRecordOf(task('pass'), ran, '/r')).toEqual({ file: 't.test.ts', test: 'CL-1 x', ran: ['op:gain'], root: '/r' });
  });
  it('a concurrent test is refused with a clear message', () => {
    expect(() => refuseConcurrent(task('run', { concurrent: true }))).toThrow('recordRan: "CL-1 x" is a concurrent test; the run log credits notes to one test at a time, so card tests must not run concurrently');
    expect(() => refuseConcurrent(task('run'))).not.toThrow();
  });
  it('notes made while a beforeEach or afterEach hook runs are setup', () => {
    expect(inHook({ ...task('run'), result: { state: 'run', hooks: { beforeEach: 'run' } } })).toBe(true);
    expect(inHook({ ...task('run'), result: { state: 'run', hooks: { afterEach: 'run' } } })).toBe(true);
    expect(inHook({ ...task('run'), result: { state: 'run', hooks: { beforeEach: 'pass' } } })).toBe(false);
  });
});

describe('K707 inventory counts a piece only when a full-resolve test ran it', () => {
  const tests = [{ path: 't.test.ts', text: "it('CL-1 resolves', () => { expect(run('gain')).toBe(1) }); it('CL-1 poor', () => { expectNotFired(sc, 'CL-1', () => sc.run({ op: 'lose' })) }); it('CL-1 idle', () => { scan('phase') })" }];
  const pieces = [{ kind: 'op', id: 'gain' }, { kind: 'op', id: 'lose' }, { kind: 'key', id: 'phase' }];
  const clauses = [{ id: 'CL-1', cards: [], conditional: true }];
  const rec = (test: string, ran: string[]): RanRecord => ({ file: 't.test.ts', test, ran, root: '/r' });
  it('without a run log the text cites every piece', () => {
    expect(inventory({ pieces, clauses, tests }).uncited).toEqual([]);
  });
  it('with it, a piece run only by a poor test or a test not counted is uncited', () => {
    const inv = inventory({ pieces, clauses, tests, ran: [rec('CL-1 resolves', ['op:gain']), rec('CL-1 poor', ['op:lose']), rec('CL-1 idle', ['key:phase'])] });
    expect(inv.uncited).toEqual(['op:lose', 'key:phase']);
    expect(inv.rows.find((r) => r.key === 'op:gain')?.direct).toEqual(['t.test.ts › CL-1 resolves']);
  });
  it('ranKinds limits the kinds judged; without depth any test not titled poor counts', () => {
    expect(inventory({ pieces, clauses, tests, ran: [rec('CL-1 resolves', ['op:gain'])], ranKinds: ['op'] }).uncited).toEqual(['op:lose']);
    expect(inventory({ pieces, tests, ran: [rec('CL-1 idle', ['key:phase']), rec('CL-1 poor', ['op:lose'])] }).uncited).toEqual(['op:gain', 'op:lose']);
  });
});
