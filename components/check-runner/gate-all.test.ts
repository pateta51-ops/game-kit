// gate-all: every item gated once, at most `jobs` at a time, rows in the given order; the known-failing list; a real run.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { gateAll, report, rowOf, type Row } from './gate-all';

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
