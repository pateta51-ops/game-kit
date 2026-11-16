// gate-all: every item gated once, at most `jobs` at a time, rows in the given order; the known-failing list; a real run.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { gate, gateAll, report, rowOf, type Row } from './gate-all';

describe('gate-all', () => {
  it('gates every item once, at most `jobs` at a time, rows in the given order', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const seen: string[] = [];
    let running = 0;
    let most = 0;
    const run = async (id: string): Promise<Row> => {
      seen.push(id);
      most = Math.max(most, ++running);
      await new Promise((r) => setTimeout(r, (ids.length - ids.indexOf(id)) * 5)); // the first ends last
      running--;
      return rowOf(id, id === 'c' ? 1 : 0, `gate: ${id} ${id === 'c' ? 'FAILED' : 'OK'}.\n\n`);
    };
    const rows = await gateAll(ids, 2, run);
    expect([...seen].sort()).toEqual(ids);
    expect(most).toBe(2);
    expect(rows.map((r) => [r.id, r.ok, r.last])).toEqual([
      ['a', true, 'gate: a OK.'],
      ['b', true, 'gate: b OK.'],
      ['c', false, 'gate: c FAILED.'],
      ['d', true, 'gate: d OK.'],
      ['e', true, 'gate: e OK.'],
    ]);
    expect((await gateAll(ids, 99, run)).map((r) => r.id)).toEqual(ids);
    expect(most).toBe(5);
    expect(rowOf('p', null, '').last).toBe('exit null');
  });

  it('a known failure is reported but not unexpected; a known item that passes is flagged; any other failure is unexpected', () => {
    const rows = [rowOf('a', 0, 'ok'), rowOf('b', 1, 'bad | b'), rowOf('c', 0, 'ok'), rowOf('d', 2, 'bad d')];
    const rep = report(rows, { b: 'map missing', c: 'old reason' }, 'Packs');
    expect(rep.lines).toEqual([
      'a: passes; ok',
      'b: fails, known: map missing; bad | b',
      'c: passes (remove it from the known-failing list); ok',
      'd: FAILS (unexpected); bad d',
    ]);
    expect(rep.head).toBe('Packs: 2 of 4 pass, 1 fail for a known reason, 1 unexpected.');
    expect(rep.unexpected.map((r) => r.id)).toEqual(['d']);
    expect(rep.fixed.map((r) => r.id)).toEqual(['c']);
    expect(rep.table).toContain('| b | fails, known: map missing | bad \\| b |');
    expect(report(rows).unexpected.map((r) => r.id)).toEqual(['b', 'd']);
  });
});

describe('gate-all options (K71)', () => {
  it('counts error codes with a pattern and adds the column; no pattern, no column', () => {
    const codes = '^\\s*error (E_[A-Z_]+)';
    const rows = [rowOf('a', 0, 'ok', codes), rowOf('b', 1, 'error E_ONE x\n  error E_TWO y\nerror E_ONE z\nbad', codes)];
    expect(rows[1]?.codes).toEqual({ E_ONE: 2, E_TWO: 1 });
    const rep = report(rows);
    expect(rep.lines).toEqual(['a: passes; -; ok', 'b: FAILS (unexpected); E_ONE x2, E_TWO x1; bad']);
    expect(rep.table).toContain('| Item | Result | Error codes | Last line |\n| --- | --- | --- | --- |\n| a | passes | - | ok |');
    expect(rowOf('a', 0, 'error E_ONE').codes).toBeUndefined();
    expect(report([rowOf('a', 0, 'ok')]).table).toContain('| Item | Result | Last line |');
  });

  it('gate() stops a gate that passes its timeout, with the child it started, and the row fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-timeout-'));
    writeFileSync(join(dir, 'sleeper.js'), "const c = require('child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });\nrequire('fs').writeFileSync(process.argv[2], String(c.pid));\nconsole.log('started');\nsetInterval(() => {}, 1000);\n");
    const row = await gate([process.execPath, join(dir, 'sleeper.js'), join(dir, '{id}.pid')], 'x', { timeoutMinutes: 0.03, graceSeconds: 1 });
    expect(row.ok).toBe(false);
    expect(row.last).toMatch(/x passed the 0.03 min limit; stopped/);
    const pid = Number(readFileSync(join(dir, 'x.pid'), 'utf8'));
    const alive = (): boolean => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    const end = Date.now() + 5000;
    while (alive() && Date.now() < end) await new Promise((r) => setTimeout(r, 200));
    expect(alive()).toBe(false);
    rmSync(dir, { recursive: true, force: true });
    expect((await gate([process.execPath, '-e', 'console.log(1)'], 'y', { timeoutMinutes: 1 })).ok).toBe(true);
  }, 20_000);
});

describe('gate-all, a real run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-all-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const tsx = join(dirname(createRequire(import.meta.url).resolve('tsx/package.json')), 'dist/cli.mjs');
  writeFileSync(join(dir, 'gate.js'), "const id = process.argv[2];\nconsole.log('gate ' + id);\nprocess.exit(id === 'b' ? 1 : 0);\n");
  const run = (known: Record<string, string>) => {
    writeFileSync(join(dir, 'gate-all.config.json'), JSON.stringify({ command: [process.execPath, 'gate.js', '{id}'], items: ['a', 'b', 'c'], known }));
    return spawnSync(process.execPath, [tsx, resolve(import.meta.dirname, 'gate-all.ts'), '--jobs', '2'], { cwd: dir, encoding: 'utf8' });
  };

  it('is red on an unlisted failure, and not red when the failure is listed', () => {
    const red = run({});
    expect(red.status).toBe(1);
    expect(red.stdout).toMatch(/a: passes; gate a\nb: FAILS \(unexpected\); gate b\nc: passes; gate c\n/);
    const known = run({ b: 'known reason', c: 'fixed since' });
    expect(known.status).toBe(0);
    expect(known.stdout).toMatch(/b: fails, known: known reason; gate b/);
    expect(known.stdout).toMatch(/::notice::gate-all: c now pass/);
    expect(known.stdout).toMatch(/2 of 3 pass, 1 fail for a known reason, 0 unexpected/);
  });
});
