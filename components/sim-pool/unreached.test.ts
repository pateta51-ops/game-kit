import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { traceAbilities } from '../card-harness/trace.ts';
import { CONTENT } from '../engine-core/fake/counter.ts';
import { checked, perAction, simGame } from './fake/coverage.ts';
import { fuzz, fuzzMain, playOne, provenClauses, wholeGame } from './index.ts';
import { proveResolved, recordable } from './prove.ts';

const module = new URL('./fake/coverage.ts', import.meta.url).href;
const hooked = new URL('./fake/checked.ts', import.meta.url).href;
const ALL = ['add', 'draw', 'noop', 'never'];
const proof = { proven: { never: ['tests/never.test.ts › never full resolve'] }, problems: [] };
const log = join(mkdtempSync(join(tmpdir(), 'k651-proof-')), 'proof.jsonl');
const IDS = ['never', 'fx', 'nm', 'ge', 'iff', 'looked'];
const traceOf = (...ids: string[]) => {
  const t = traceAbilities(Object.fromEntries(IDS.map((id) => [id, { effects: [] as unknown[] }])));
  for (const id of ids) void t.registry[id]?.effects;
  return t;
};

// These tests run first and write the proof log the next block reads: only `never` resolves in a test that passes.
describe('K651 proof recorder', () => {
  it('never full resolve', () => {
    proveResolved(log, traceOf('never'), 'never');
  });
  it.fails('fx full resolve under it.fails', () => {
    proveResolved(log, traceOf('fx'), 'fx');
    throw new Error('an it.fails test passes when its body fails');
  });
  it('nm full resolve: expect with no matcher', () => {
    expect(traceOf('nm'));
  });
  it('ge full resolve: a bound that always holds', () => {
    expect(traceOf('ge').resolved.size).toBeGreaterThanOrEqual(0);
  });
  it('iff full resolve: an expect inside if', () => {
    const t = traceOf();
    if (t.resolved.has('iff')) expect(t.resolved.has('iff')).toBe(true);
  });
  it('looked full resolve: a clause that never ran is refused', () => {
    expect(() => proveResolved(log, traceOf(), 'looked')).toThrow('Not resolved: looked (never looked up)');
  });
});

describe('K651 proof from what ran', () => {
  it('proves only the clause that resolved in a passing test of this run; it.fails and tests that cannot fail prove nothing', () => {
    const p = provenClauses({ log, root: process.cwd(), clauses: IDS });
    expect(p.problems).toEqual([]);
    expect(Object.keys(p.proven)).toEqual(['never']);
    expect(p.proven.never).toEqual(['components/sim-pool/unreached.test.ts › K651 proof recorder > never full resolve']);
  });

  it('records only a passing test that is not it.fails', () => {
    expect(recordable({ result: { state: 'pass' } })).toBe(true);
    expect(recordable({ fails: true, result: { state: 'pass' } })).toBe(false);
    expect(recordable({ result: { state: 'fail' } })).toBe(false);
    expect(recordable({})).toBe(false);
  });

  it('refuses a log from another root (no suffix match), one older than its test or a source, and a missing log', () => {
    const root = mkdtempSync(join(tmpdir(), 'k651-root-'));
    mkdirSync(join(root, 'tests'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'tests', 'a.test.ts'), '');
    writeFileSync(join(root, 'src', 'engine.ts'), '');
    const old = new Date(Date.now() - 60_000);
    utimesSync(join(root, 'tests', 'a.test.ts'), old, old);
    utimesSync(join(root, 'src', 'engine.ts'), old, old);
    const at = Date.now() - 30_000;
    const rec = (r: Record<string, unknown>) => JSON.stringify({ clause: 'never', file: 'tests/a.test.ts', test: 'never full resolve', root: root.replace(/\\/g, '/'), at, ...r });
    const file = join(root, 'proof.jsonl');
    const read = (line: string, sources?: string[]) => (writeFileSync(file, `${line}\n`), provenClauses({ log: file, root, clauses: ['never'], sources }));
    expect(read(rec({}), ['src'])).toEqual({ proven: { never: ['tests/a.test.ts › never full resolve'] }, problems: [] });
    expect(read(rec({ root: `/elsewhere/${root.replace(/\\/g, '/')}` })).problems).toEqual([`proof log ${file}: never was recorded under /elsewhere/${root.replace(/\\/g, '/')}, not this project ${root.replace(/\\/g, '/')}`]);
    expect(read(rec({ at: Date.now() - 90_000 })).problems).toEqual([`proof log ${file}: never was recorded before its test or a source changed: run the card tests again`]);
    utimesSync(join(root, 'src', 'engine.ts'), new Date(), new Date());
    const late = read(rec({}), ['src']);
    expect(late.proven).toEqual({});
    expect(late.problems).toEqual([`proof log ${file}: never was recorded before its test or a source changed: run the card tests again`]);
    expect(provenClauses({ log: join(root, 'none.jsonl'), root, clauses: ['never'] }).problems).toEqual([`proof log ${join(root, 'none.jsonl')} is missing: run the card tests first`]);
  });
});

describe('K651 unreached list', () => {
  it('fails a clause no game resolved that the list does not hold', async () => {
    const run = await fuzz(module, { games: 4, prefix: 'u' });
    const w = wholeGame(run, { clauses: ALL, unreached: [], proof });
    expect(w.neverResolved).toEqual(['never']);
    expect(w.failures).toEqual(['never resolved: never']);
  });

  it('passes a listed clause proven by a passing full-resolve test of this run', async () => {
    const run = await fuzz(module, { games: 4, prefix: 'u' });
    const w = wholeGame(run, { clauses: ALL, unreached: [{ clause: 'never', why: 'no game deals it' }], proof });
    expect(w.failures).toEqual([]);
    expect(w.proven).toEqual([{ clause: 'never', tests: ['tests/never.test.ts › never full resolve'] }]);
  });

  it('fails a listed clause without proof, and fails on every proof problem', async () => {
    const run = await fuzz(module, { games: 4, prefix: 'u' });
    expect(wholeGame(run, { clauses: ALL, unreached: [{ clause: 'never' }], proof: { proven: {}, problems: [] } }).failures).toEqual(['unreached with no counted full-resolve test: never']);
    expect(wholeGame(run, { clauses: ALL, unreached: [{ clause: 'never' }] }).failures).toEqual(['unreached with no counted full-resolve test: never']);
    expect(wholeGame(run, { clauses: ALL, unreached: [{ clause: 'never' }], proof: { ...proof, problems: ['proof log p: stale'] } }).failures).toEqual(['proof log p: stale']);
  });

  it('fails a listed clause that resolved in the run as stale', async () => {
    const run = await fuzz(module, { games: 4, prefix: 'u' });
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
  it('counts a resolve only when the hook says its own effect changed something', async () => {
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

  it('without effect entries it judges the whole action: a no-op beside a move counts (the documented limit)', () => {
    const r = playOne(perAction, CONTENT, { index: 0, seed: 'h', driver: 'random' });
    expect(r.resolved).toContain('noop');
    expect(r.noOp).toBeUndefined();
  });
});

describe('K651 coverage rounds', () => {
  const steer = (_seed: string, _driver: string, unreached: readonly string[]) => (unreached.includes('rare') ? { steer: 'rare' } : {});
  const whole = { clauses: [...ALL, 'rare'], unreached: [{ clause: 'never' }], proof };

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
  it('runs: proof from the log of this run, rounds, findings file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'k651-recipe-'));
    mkdirSync(join(dir, 'tests'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'tests', 'never.test.ts'), '');
    writeFileSync(join(dir, 'src', 'engine.ts'), '');
    const old = new Date(Date.now() - 60_000);
    utimesSync(join(dir, 'tests', 'never.test.ts'), old, old);
    utimesSync(join(dir, 'src', 'engine.ts'), old, old);
    const root = dir.replace(/\\/g, '/');
    writeFileSync(join(dir, 'proof.jsonl'), `${JSON.stringify({ clause: 'never', file: 'tests/never.test.ts', test: 'never full resolve', root, at: Date.now() })}\n`);
    const md = readFileSync(new URL('./README.md', import.meta.url), 'utf8');
    const code = (/## Unreached list[^\n]*\n[\s\S]*?```ts\r?\n([\s\S]*?)```/.exec(md)?.[1] ?? '')
      .replaceAll(/(['"])\.\.\/kit\//g, '$1../')
      .replaceAll("'.cache/proof.jsonl'", JSON.stringify(join(dir, 'proof.jsonl')))
      .replace('root: process.cwd()', `root: ${JSON.stringify(root)}`)
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
