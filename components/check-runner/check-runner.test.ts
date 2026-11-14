// Check runner: the chain parser, the drift check (full and --pr), and a real run over a temporary package.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkScripts, coverageProblems, DEFAULT_CONFIG, type Config } from './check-runner';

const CHECK = 'npm run lint && npm run test && npm run size';
const cfg: Config = { ...DEFAULT_CONFIG, first: ['test'], lanes: [['lint'], ['size']], extra: ['gate'] };

describe('checkScripts', () => {
  it('reads the scripts of an npm run chain, and refuses anything else', () => {
    expect(checkScripts(CHECK)).toEqual(['lint', 'test', 'size']);
    expect(() => checkScripts('npm run a && tsc')).toThrow(/not "npm run <script>"/);
  });
});

describe('coverageProblems', () => {
  it('fails when the lanes drift from the check chain, in both directions, and on duplicates', () => {
    expect(coverageProblems(CHECK, { ...cfg, lanes: [['lint', 'size'], ['gate']] })).toEqual([]);
    expect(coverageProblems(CHECK, cfg)).toEqual(['gate is a CI check but in no lane']);
    expect(coverageProblems(CHECK, { ...cfg, lanes: [['lint', 'size', 'gate', 'extra2']] })).toEqual([
      'extra2 is in a lane but neither in "npm run check" nor in extra',
    ]);
    expect(coverageProblems(CHECK, { ...cfg, lanes: [['lint', 'lint', 'size', 'gate']] })).toEqual([
      'lint is in more than one lane (or in first and a lane)',
    ]);
  });

  it('checks the --pr subset against the package scripts and the chain', () => {
    const scripts = { lint: 'x', size: 'x', test: 'x' };
    const pr = { ...cfg, pr: { first: [], lanes: [['lint'], ['size']] } };
    expect(coverageProblems(CHECK, pr, scripts)).toEqual([]);
    const bad = { ...cfg, pr: { first: [], lanes: [['lint'], ['nope']] } };
    expect(coverageProblems(CHECK, bad, scripts)).toEqual([
      'nope is in the --pr lanes but is no package.json script',
      'nope is in the --pr lanes but neither in "npm run check" nor in extra',
    ]);
  });
});

describe('a real run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'check-runner-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const tsx = join(dirname(createRequire(import.meta.url).resolve('tsx/package.json')), 'dist/cli.mjs');
  const script = resolve(import.meta.dirname, 'check-runner.ts');
  const run = (scripts: Record<string, string>, config: Partial<Config>, args: string[] = []) => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts }));
    writeFileSync(join(dir, 'check-runner.config.json'), JSON.stringify(config));
    return spawnSync(process.execPath, [tsx, script, ...args], { cwd: dir, encoding: 'utf8' });
  };
  const ok = 'node -e "process.exit(0)"';
  const ko = 'node -e "process.exit(3)"';

  it('passes when every check passes, runs every check after a failure, and fails on drift', () => {
    const scripts = { check: 'npm run a && npm run b', a: ok, b: ok };
    const good = run(scripts, { first: ['a'], lanes: [['b']] });
    expect(good.status).toBe(0);
    expect(good.stdout).toMatch(/2 of 2 passed/);
    expect(good.stdout).toMatch(/checks added up/);
    const failing = run({ ...scripts, a: ko }, { first: ['a'], lanes: [['b']] });
    expect(failing.status).toBe(1);
    expect(failing.stdout).toMatch(/npm run b: passed/);
    expect(failing.stderr).toMatch(/failed: a/);
    const drift = run(scripts, { first: ['a'], lanes: [] });
    expect(drift.status).toBe(1);
    expect(drift.stderr).toMatch(/b is a CI check but in no lane/);
  });

  it('--pr runs only the pr subset', () => {
    const scripts = { check: 'npm run a && npm run b', a: ok, b: ko };
    const r = run(scripts, { first: [], lanes: [['a', 'b']], pr: { first: [], lanes: [['a']] } }, ['--pr']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/1 of 1 passed/);
  });

  it('kills a check that passes its timeout together with the child it started, and fails', () => {
    writeFileSync(join(dir, 'sleeper.js'), "const c = require('child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });\nrequire('fs').writeFileSync('child.pid', String(c.pid));\nsetInterval(() => {}, 1000);\n");
    const r = run({ check: 'npm run s', s: 'node sleeper.js' }, { first: [], lanes: [['s']], timeoutMinutes: 0.03, graceSeconds: 1 });
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/passed the .* min limit/);
    const pid = Number(readFileSync(join(dir, 'child.pid'), 'utf8'));
    const alive = (): boolean => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    const end = Date.now() + 5000;
    while (alive() && Date.now() < end) spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 200)']);
    expect(alive()).toBe(false);
  });
});
