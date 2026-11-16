import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { codeVersion, gitShort, formatBands, fuzz, fuzzMain, runResumable, sourceHash, type Band, type SanityBands } from './index';

const module = new URL('./fake/faulty.ts', import.meta.url).href;
const good = new URL('./fake/game.ts', import.meta.url).href;
const dir = mkdtempSync(path.join(tmpdir(), 'sim-fuzz-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('the invariant run', () => {
  it('reports a violation as seed plus step, and replays the game to that step', async () => {
    const run = await fuzz(module, { games: 4, prefix: 'bad' });
    expect(run.findings.map((f) => [f.kind, f.seed, f.step])).toEqual([0, 1, 2, 3].map((i) => ['violation', `bad-${String(i)}`, 2]));
    expect(run.findings[0]?.messages).toEqual(['F-01: turn 3 was reached']);
    const before = await fuzz(module, { seed: 'bad-1', until: 1 });
    expect(before.findings).toEqual([]);
    expect(before.records[0]?.actions).toBe(1);
    const at = await fuzz(module, { seed: 'bad-1', until: 2 });
    expect(at.findings).toEqual([run.findings[1]]);
    expect(at.records[0]?.hash).toBe(run.records[1]?.hash);
  });

  it('stops at the same step on worker threads', async () => {
    const one = await fuzz(good, { games: 4, until: 3 });
    expect(one.records.map((r) => r.actions)).toEqual([3, 3, 3, 3]);
    expect((await fuzz(good, { games: 4, until: 3, workers: 2 })).records).toEqual(one.records);
  });
});

describe('the fuzz command', () => {
  it('exits 0 on clean games', async () => {
    const lines: string[] = [];
    expect(await fuzzMain(['--games', '5'], good, {}, (l) => void lines.push(l))).toBe(0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^5 game\(s\), \d+ actions checked: exceptions 0, invariant violations 0, runaway guards 0, never ended 0$/);
  });

  it('names exceptions, violations, runaway guards and games that never end, and exits 1', async () => {
    const steps = { bad: 2, loop: 0, long: 40, word: 0, drv: 2 };
    for (const [prefix, kind] of [['bad', 'violation'], ['loop', 'runaway'], ['long', 'endless'], ['word', 'exception'], ['drv', 'exception']] as const) {
      const run = await fuzz(module, { games: 2, prefix });
      expect(run.findings.map((f) => [f.kind, f.step])).toEqual([[kind, steps[prefix]], [kind, steps[prefix]]]);
      const f = run.findings[0];
      // the printed replay shows the same finding
      expect((await fuzz(module, { seed: f?.seed, until: f?.step })).findings).toEqual([f]);
      const lines: string[] = [];
      expect(await fuzzMain(['--seed', `${prefix}-0`, '--until', String(steps[prefix])], module, {}, (l) => void lines.push(l))).toBe(1);
      expect(lines).toContain(`${kind} seed ${prefix}-0 step ${String(steps[prefix])} (random)`);
    }
    expect((await fuzz(good, { seed: 'boom' })).findings.map((f) => f.kind)).toEqual(['exception']);
    const lines: string[] = [];
    expect(await fuzzMain(['--prefix', 'long', '--games', '2', '--workers', '2'], module, {}, (l) => void lines.push(l))).toBe(1);
    expect(lines).toContain('endless seed long-0 step 40 (random)');
    expect(lines).toContain('  replay: --seed long-0 --driver random --until 40');
    expect(lines.at(-1)).toMatch(/never ended 2$/);
  });

  it('replays one seed to a step, and refuses bad arguments', async () => {
    const lines: string[] = [];
    expect(await fuzzMain(['--seed', 'bad-0', '--until', '1'], module, {}, (l) => void lines.push(l))).toBe(0);
    expect(lines[0]).toMatch(/^seed bad-0: step 1, result null, actions hash /);
    expect(await fuzzMain(['--until', '1'], module, {}, () => undefined)).toBe(2);
    expect(await fuzzMain(['--games', 'x'], module, {}, () => undefined)).toBe(2);
    expect(await fuzzMain(['--nope', '1'], module, {}, () => undefined)).toBe(2);
    for (const flag of ['--games', '--workers', '--prefix']) expect(await fuzzMain(['--seed', 'bad-0', flag, '2'], module, {}, () => undefined)).toBe(2);
    await expect(runResumable({ module: good, specs: [{ index: 0, seed: 's0', driver: 'random' }], until: 1 }, 1, path.join(dir, 'cut.jsonl'), 'x')).rejects.toThrow(/until/);
  });
});

describe('sanity bands', () => {
  const bands: SanityBands = (records): Band[] => [
    { id: 'B1', text: 'every game ends', target: '0 not ended', actual: String(records.filter((r) => r.result === null).length), pass: records.every((r) => r.result !== null) },
    { id: 'B2', text: 'no game adds', target: '0 adds', actual: 'some', pass: false },
  ];

  it('a failing band is an error; a skipped one is printed as INFO and not counted', async () => {
    const list = bands((await fuzz(good, { games: 3 })).records);
    expect(formatBands(list)).toEqual({
      lines: ['B1 PASS  every game ends: target 0 not ended; actual 0', 'B2 FAIL  no game adds: target 0 adds; actual some'],
      failed: 1,
    });
    const skipped = formatBands(list, ['B2']);
    expect(skipped.failed).toBe(0);
    expect(skipped.lines[1]).toBe('B2 INFO  no game adds: target 0 adds; actual some');
    expect(() => formatBands(list, ['B9'])).toThrow(/no such band/);
  });
});

describe('the code version', () => {
  it('works without git, sees an edit, and a resumed sweep refuses another version', async () => {
    mkdirSync(path.join(dir, 'src', 'engine'), { recursive: true });
    writeFileSync(path.join(dir, 'src', 'engine', 'a.ts'), 'one');
    writeFileSync(path.join(dir, 'sim.ts'), 'sim');
    const sources = ['src/engine', 'sim.ts', 'missing'];
    const v1 = codeVersion(sources, dir);
    expect(v1).toMatch(/^[0-9a-z]+\.[0-9a-f]{10}$/);
    expect(codeVersion(sources, dir)).toBe(v1);
    expect(sourceHash(['src/engine'], dir)).not.toBe(sourceHash(sources, dir));
    writeFileSync(path.join(dir, 'sim.ts'), 'a\nb\n');
    const lf = sourceHash(sources, dir);
    writeFileSync(path.join(dir, 'sim.ts'), 'a\r\nb\r\n');
    expect(sourceHash(sources, dir)).toBe(lf);
    mkdirSync(path.join(dir, 'src', 'engine', 'node_modules'));
    writeFileSync(path.join(dir, 'src', 'engine', 'node_modules', 'x.js'), 'x');
    mkdirSync(path.join(dir, 'src', 'engine', '.cache'));
    writeFileSync(path.join(dir, 'src', 'engine', '.cache', 'y'), 'y');
    expect(sourceHash(sources, dir)).toBe(lf);
    mkdirSync(path.join(dir, 'sub'));
    expect(gitShort(path.join(dir, 'sub'))).toBe('nogit');
    expect(gitShort(path.join(process.cwd(), 'components'))).toBe('nogit');
    const specs = [{ index: 0, seed: 's0', driver: 'random' }];
    const file = path.join(dir, 'sweep.jsonl');
    await runResumable({ module: good, specs }, 1, file, `code=${v1}`);
    writeFileSync(path.join(dir, 'src', 'engine', 'a.ts'), 'two');
    const v2 = codeVersion(sources, dir);
    expect(v2).not.toBe(v1);
    await expect(runResumable({ module: good, specs }, 1, file, `code=${v2}`)).rejects.toThrow(/other settings/);
  });
});
