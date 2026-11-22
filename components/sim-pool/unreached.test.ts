import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../engine-core/fake/counter.ts';
import { checked, simGame } from './fake/coverage.ts';
import { fuzz, fuzzMain, playOne, provenClauses, wholeGame } from './index.ts';

const module = new URL('./fake/coverage.ts', import.meta.url).href;
const hooked = new URL('./fake/checked.ts', import.meta.url).href;
const ALL = ['add', 'draw', 'noop', 'never'];
const full = { path: 'tests/never.test.ts', text: "it('never full resolve', () => {\n  expect(play('never')).toBe(1);\n});\n" };
const passed = (status = 'passed') => ({ testResults: [{ name: '/repo/tests/never.test.ts', assertionResults: [{ title: 'never full resolve', status }] }] });

describe('K651 unreached list', () => {
  it('fails a clause no game resolved that the list does not hold', async () => {
    const run = await fuzz(module, { games: 4, prefix: 'u' });
    const w = wholeGame(run, { clauses: ALL, unreached: [], proof: {} });
    expect(w.neverResolved).toEqual(['never']);
    expect(w.failures).toEqual(['never resolved: never']);
  });

  it('passes a listed clause proven by a passing counted full-resolve test', async () => {
    const run = await fuzz(module, { games: 4, prefix: 'u' });
    const proof = provenClauses(ALL, [full], passed());
    expect(proof).toEqual({ never: ['tests/never.test.ts › never full resolve'] });
    const w = wholeGame(run, { clauses: ALL, unreached: [{ clause: 'never', why: 'no game deals it' }], proof });
    expect(w.failures).toEqual([]);
    expect(w.proven).toEqual([{ clause: 'never', tests: ['tests/never.test.ts › never full resolve'] }]);
  });

  it('fails a listed clause without proof: a file that only names it, a test that asserts nothing, a failed test', async () => {
    const run = await fuzz(module, { games: 4, prefix: 'u' });
    const names = { path: 'tests/never.test.ts', text: "// never is covered by hand\nit('never full resolve', () => {\n  play('never');\n});\n" };
    for (const proof of [provenClauses(ALL, [names], passed()), provenClauses(ALL, [full], passed('failed')), provenClauses(ALL, [full], { testResults: [] }), {}]) {
      expect(proof).toEqual({});
      expect(wholeGame(run, { clauses: ALL, unreached: [{ clause: 'never' }], proof }).failures).toEqual(['unreached with no counted full-resolve test: never']);
    }
  });

  it('fails a listed clause that resolved in the run as stale', async () => {
    const run = await fuzz(module, { games: 4, prefix: 'u' });
    const proof = provenClauses(ALL, [full], passed());
    const w = wholeGame(run, { clauses: ALL, unreached: [{ clause: 'never' }, { clause: 'add' }], proof });
    expect(w.stale).toEqual(['add']);
    expect(w.failures).toEqual(['stale unreached entry (resolved in a game): add']);
  });

  it('without an unreached list the report is as before', async () => {
    const run = await fuzz(module, { games: 4, prefix: 'u' });
    expect(wholeGame(run, { clauses: ALL }).failures).toEqual(['never resolved: never']);
  });
});

describe('K651 did-something hook', () => {
  it('counts a resolve only when the hook says the effect changed something', async () => {
    const spec = { index: 0, seed: 'h', driver: 'random' };
    expect(playOne(simGame, CONTENT, spec).resolved).toContain('noop');
    const r = playOne(checked, CONTENT, spec);
    expect(r.resolved).not.toContain('noop');
    expect(r.resolved?.length).toBeGreaterThan(0);
    expect(r.noOp).toEqual(['noop']);
    const w = wholeGame(await fuzz(hooked, { games: 4, prefix: 'u', workers: 2 }), { clauses: ['add', 'draw', 'noop'] });
    expect(w.noOp).toEqual(['noop']);
    expect(w.failures).toEqual(['never resolved: noop']);
  });
});

describe('K651 coverage rounds', () => {
  const steer = (_seed: string, _driver: string, unreached: readonly string[]) => (unreached.includes('rare') ? { steer: 'rare' } : {});
  const whole = { clauses: [...ALL, 'rare'], unreached: [{ clause: 'never' }], proof: { never: ['tests/never.test.ts › never full resolve'] } };

  it('steers toward unreached clauses and stops when a round adds nothing', async () => {
    const lines: string[] = [];
    expect(await fuzzMain(['--games', '2', '--prefix', 'c'], module, { whole: { ...whole, rounds: { games: 3, settings: steer } } }, (l) => void lines.push(l))).toBe(0);
    expect(lines).toContain('  coverage round 1: 3 games, +1 clause(s), 1 unreached');
    expect(lines).toContain('  coverage round 2: 3 games, +0 clause(s), 1 unreached');
    expect(lines).toContain('  coverage: stopped after 2 round(s), the last added nothing');
    const off: string[] = [];
    expect(await fuzzMain(['--games', '2', '--prefix', 'c'], module, { whole }, (l) => void off.push(l))).toBe(1);
    expect(off.at(-1)).toBe('never resolved: rare');
  });

  it('stops at the round cap', async () => {
    const lines: string[] = [];
    expect(await fuzzMain(['--games', '2', '--prefix', 'c'], module, { whole: { ...whole, rounds: { games: 3, max: 1, settings: steer } } }, (l) => void lines.push(l))).toBe(0);
    expect(lines).toContain('  coverage: stopped at the round cap of 1');
    expect(lines.filter((l) => l.startsWith('  coverage round'))).toHaveLength(1);
  });
});

describe('K651 findings file', () => {
  it('writes each failure with its seed and settings, and --finding replays that seed to the same failure', async () => {
    const findings = join(mkdtempSync(join(tmpdir(), 'k651-')), 'findings.json');
    const settings = (seed: string) => (seed === 'x-1' ? { crash: true } : {});
    expect(await fuzzMain(['--games', '3', '--prefix', 'x'], module, { settings, whole: { findings } }, () => undefined)).toBe(1);
    const file = JSON.parse(readFileSync(findings, 'utf8')) as { seed: string; kind: string; step: number; messages: string[]; settings: unknown }[];
    expect(file.map((f) => [f.seed, f.kind, f.settings])).toEqual([['x-1', 'exception', { crash: true }]]);
    const lines: string[] = [];
    expect(await fuzzMain(['--finding', 'x-1'], module, { whole: { findings } }, (l) => void lines.push(l))).toBe(1);
    expect(lines).toContain(`exception seed x-1 step ${String(file[0]?.step)} (random)`);
    expect(lines).toContain(`  ${String(file[0]?.messages[0])}`);
    expect(lines.at(-1)).toBe('finding x-1: the same failure again');
    expect(await fuzzMain(['--finding', 'nope'], module, { whole: { findings } }, (l) => void lines.push(l))).toBe(2);
    expect(lines.at(-1)).toBe(`no finding with seed nope in ${findings}`);
  });
});

describe('K651 README recipe', () => {
  it('runs: proof from a passing counted test, rounds, findings file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'k651-recipe-'));
    mkdirSync(join(dir, 'tests'));
    mkdirSync(join(dir, '.cache'));
    writeFileSync(join(dir, 'tests', 'never.test.ts'), full.text);
    writeFileSync(join(dir, '.cache', 'tests.json'), JSON.stringify({ testResults: [{ name: join(dir, 'tests', 'never.test.ts'), assertionResults: [{ title: 'never full resolve', status: 'passed' }] }] }));
    const md = readFileSync(new URL('./README.md', import.meta.url), 'utf8');
    const code = (/## Unreached list[^\n]*\n[\s\S]*?```ts\r?\n([\s\S]*?)```/.exec(md)?.[1] ?? '')
      .replaceAll(/(['"])\.\.\/kit\//g, '$1../')
      .replace("'.cache/tests.json'", JSON.stringify(join(dir, '.cache', 'tests.json')))
      .replace("testFiles('.'", `testFiles(${JSON.stringify(dir)}`)
      .replace("'tests/whole-game/findings.json'", JSON.stringify(join(dir, 'findings.json')))
      .replace('process.argv.slice(2)', "['--games', '2', '--prefix', 'c']");
    expect(code).toContain('provenClauses(');
    const file = new URL('./.k651-recipe.ts', import.meta.url);
    writeFileSync(file, code);
    const was = process.exitCode;
    try {
      await import(pathToFileURL(file.pathname.replace(/^\/([A-Za-z]:)/, '$1')).href);
      expect(process.exitCode).toBe(0);
      expect(JSON.parse(readFileSync(join(dir, 'findings.json'), 'utf8'))).toEqual([]);
    } finally {
      process.exitCode = was;
      rmSync(file, { force: true });
    }
  });
});
