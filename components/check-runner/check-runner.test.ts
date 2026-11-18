// Check runner: the chain parser, the drift check (full and --pr), and a real run over a temporary package.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { homedir } from 'node:os';
import { checkScripts, coverageProblems, DEFAULT_CONFIG, envOf, type Config } from './check-runner.ts';

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

describe('options (K71)', () => {
  it('a `last` script counts as a lane; `own` scripts of the pr plan need not be in the chain', () => {
    expect(coverageProblems(CHECK, { ...cfg, extra: [], lanes: [['lint']], last: ['size'] })).toEqual([]);
    expect(coverageProblems(CHECK, { ...cfg, extra: [], lanes: [['lint', 'size']], last: ['size'] })).toEqual(['size is in more than one lane (or in first and a lane)']);
    const scripts = { lint: 'x', 'test:ci': 'x' };
    expect(coverageProblems(CHECK, { ...cfg, pr: { first: [], lanes: [['lint'], ['test:ci']], own: ['test:ci'] } }, scripts)).toEqual([]);
    expect(coverageProblems(CHECK, { ...cfg, pr: { first: [], lanes: [['lint'], ['gone']], own: ['gone'] } }, scripts)).toEqual(['gone is in the --pr lanes but is no package.json script']);
  });

  it('envOf: `*` for every script, the script\'s own over it, `~/` under the home folder, the rest of the process kept', () => {
    const env = { '*': { K71_A: 'all', K71_B: 'all' }, t: { K71_B: 'own', K71_C: '~/cache/x' } };
    expect(envOf(env, 't')).toMatchObject({ K71_A: 'all', K71_B: 'own', K71_C: join(homedir(), 'cache/x') });
    expect(envOf(env, 'u')['K71_B']).toBe('all');
    expect(envOf(env, 'u')['K71_C']).toBeUndefined();
    expect(envOf(undefined, 't')).toEqual({ ...process.env });
  });
});

describe('a real run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'check-runner-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const script = resolve(import.meta.dirname, 'check-runner.ts');
  const run = (scripts: Record<string, string>, config: Partial<Config>, args: string[] = []) => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts }));
    writeFileSync(join(dir, 'check-runner.config.json'), JSON.stringify(config));
    return spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: 'utf8' });
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

  it('env reaches only its script; `last` runs after the lanes, also in --pr with its own script', () => {
    writeFileSync(join(dir, 'env.js'), "console.log('seen=' + process.env.K71_X);\n");
    writeFileSync(join(dir, 'mark.js'), "require('fs').writeFileSync('lane.done', '1');\n");
    writeFileSync(join(dir, 'after.js'), "process.exit(require('fs').existsSync('lane.done') ? 0 : 4);\n");
    const scripts = { check: 'npm run a && npm run b && npm run z', a: 'node env.js', b: 'node env.js && node mark.js', z: 'node after.js', p: 'node after.js' };
    const config = { first: ['a'], lanes: [['b']], last: ['z'], env: { b: { K71_X: 'lane' } }, pr: { first: [], lanes: [['b']], last: ['p'], own: ['p'] } };
    const r = run(scripts, config);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/then z alone/);
    expect(r.stdout).toMatch(/npm run a: passed[^]*?seen=undefined/);
    expect(r.stdout).toMatch(/npm run b: passed[^]*?seen=lane/);
    expect(r.stdout).toMatch(/3 of 3 passed/);
    rmSync(join(dir, 'lane.done'));
    const pr = run(scripts, config, ['--pr']);
    expect(pr.status).toBe(0);
    expect(pr.stdout).toMatch(/2 of 2 passed/);
    rmSync(join(dir, 'lane.done'));
    const early = run({ ...scripts, b: 'node env.js' }, config);
    expect(early.status).toBe(1);
    expect(early.stderr).toMatch(/failed: z/);
  }, 30_000);

  it('--pr runs only the pr subset', () => {
    const scripts = { check: 'npm run a && npm run b', a: ok, b: ko };
    const r = run(scripts, { first: [], lanes: [['a', 'b']], pr: { first: [], lanes: [['a']] } }, ['--pr']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/1 of 1 passed/);
  });

  it('--fail-fast stops at the first failing check, stops the ones running, and repeats its output; --keep-going runs all', () => {
    writeFileSync(join(dir, 'slow.js'), 'setInterval(() => {}, 1000);\n');
    writeFileSync(join(dir, 'boom.js'), "console.log('boom-a');\nprocess.exit(3);\n");
    const scripts = { check: 'npm run a && npm run b && npm run c', a: 'node boom.js', b: ok, c: 'node slow.js' };
    const config = { first: [], lanes: [['a', 'b'], ['c']], graceSeconds: 1 };
    const r = run(scripts, config, ['--fail-fast']);
    expect(r.status).toBe(1);
    expect(r.stdout).not.toMatch(/npm run b:/);
    expect(r.stdout).toMatch(/npm run c: stopped/);
    expect(r.stdout).toMatch(/0 of 2 passed/);
    expect(r.stdout).toMatch(/FAILED: npm run a \(exit 3\) - its output again ===\n[^]*boom-a/);
    expect(r.stderr).toMatch(/failed: a \(/);
    const first = run({ ...scripts, c: ok }, { first: ['a'], lanes: [['b'], ['c']], failFast: true });
    expect(first.status).toBe(1);
    expect(first.stdout).toMatch(/0 of 1 passed/);
    const all = run({ ...scripts, c: ok }, { ...config, failFast: true }, ['--keep-going']);
    expect(all.status).toBe(1);
    expect(all.stdout).toMatch(/2 of 3 passed/);
    expect(all.stdout).not.toMatch(/its output again/);
  }, 30_000);

  it('K138 stream: lines arrive prefixed [lane] (laneNames, else the first script), no whole logs, a failure repeated; off by default', () => {
    writeFileSync(join(dir, 'say.js'), "console.log('out-' + process.argv[2]);\nconsole.error('err-' + process.argv[2]);\nprocess.exitCode = Number(process.argv[3] ?? 0);\n");
    const scripts = { check: 'npm run a && npm run b && npm run c && npm run d', a: 'node say.js a', b: 'node say.js b', c: 'node say.js c', d: 'node say.js d 3' };
    const config = { first: ['a'], lanes: [['b', 'c'], ['d']], laneNames: ['gates'], stream: true, npmSilent: true };
    const r = run(scripts, config);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/^\[a\] > a$/m);
    expect(r.stdout).toMatch(/^\[a\] out-a$/m);
    expect(r.stdout).toMatch(/^\[a\] err-a$/m);
    expect(r.stdout).toMatch(/^\[a\] < a ok in [\d.]+s$/m);
    expect(r.stdout.indexOf('[a] > a')).toBeLessThan(r.stdout.indexOf('[a] < a ok'));
    expect(r.stdout).toMatch(/^\[gates\] > b$/m);
    expect(r.stdout).toMatch(/^\[gates\] out-c$/m);
    expect(r.stdout).toMatch(/^\[gates\] err-c$/m);
    expect(r.stdout).toMatch(/^\[gates\] < c ok in/m);
    expect(r.stdout).toMatch(/^\[d\] < d FAILED \(exit 3\) in/m);
    expect(r.stdout).not.toMatch(/::group::|::error::/);
    expect(r.stdout).toMatch(/3 of 4 passed/);
    expect(r.stdout).toMatch(/FAILED: npm run d \(exit 3\) - its output again ===\n[^]*out-d/);
    const plain = run(scripts, { ...config, stream: false });
    expect(plain.stdout).not.toMatch(/^\[/m);
    expect(plain.stdout).toMatch(/::group::npm run a: passed/);
  }, 30_000);

  it('K138 stream: a line split across chunks is printed whole, stdout and stderr each on their own lines', () => {
    writeFileSync(join(dir, 'split.js'), "process.stdout.write('par');\nsetTimeout(() => process.stderr.write('ERR\\n'), 300);\nsetTimeout(() => process.stdout.write('tial\\nend'), 600);\n");
    const r = run({ check: 'npm run a', a: 'node split.js' }, { first: [], lanes: [['a']], stream: true, npmSilent: true });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^\[a\] > a\n\[a\] ERR\n\[a\] partial\n\[a\] end\n\[a\] < a ok/m);
  }, 30_000);

  it('K138 stream: a check that leaves a background process holding its output still ends', () => {
    writeFileSync(join(dir, 'bg.js'), "const c = require('child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'inherit', detached: true });\nc.unref();\nrequire('fs').writeFileSync('bg.pid', String(c.pid));\nconsole.log('bg-started');\n");
    const t0 = Date.now();
    const r = run({ check: 'npm run a', a: 'node bg.js' }, { first: [], lanes: [['a']], stream: true, npmSilent: true });
    const ms = Date.now() - t0;
    try {
      process.kill(Number(readFileSync(join(dir, 'bg.pid'), 'utf8')));
    } catch {
      // already gone
    }
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^\[a\] bg-started\n\[a\] < a ok/m);
    expect(ms).toBeLessThan(30_000);
  }, 90_000);

  it('K138 npmSilent: npm run --silent prints no "> script" banner; without it the banner is there', () => {
    writeFileSync(join(dir, 'hi.js'), "console.log('hi');\n");
    const scripts = { check: 'npm run a', a: 'node hi.js' };
    const loud = run(scripts, { first: [], lanes: [['a']] });
    expect(loud.stdout).toMatch(/> node hi\.js/);
    const quiet = run(scripts, { first: [], lanes: [['a']], npmSilent: true });
    expect(quiet.status).toBe(0);
    expect(quiet.stdout).toMatch(/\nhi\n/);
    expect(quiet.stdout).not.toMatch(/> node hi\.js/);
  }, 30_000);

  it('K138 skipLastAfterFailure: `last` does not start once a check failed; it runs when all passed, without the option, and with --keep-going', () => {
    const scripts = { check: 'npm run a && npm run b && npm run z', a: ko, b: ok, z: ok };
    const config = { first: [], lanes: [['a'], ['b']], last: ['z'], skipLastAfterFailure: true };
    const r = run(scripts, config);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/not starting z/);
    expect(r.stdout).not.toMatch(/npm run z:/);
    expect(r.stdout).toMatch(/1 of 2 passed/);
    expect(run(scripts, config, ['--keep-going']).stdout).toMatch(/2 of 3 passed/);
    expect(run(scripts, { ...config, skipLastAfterFailure: false }).stdout).toMatch(/2 of 3 passed/);
    const good = run({ ...scripts, a: ok }, config);
    expect(good.status).toBe(0);
    expect(good.stdout).toMatch(/3 of 3 passed/);
  }, 30_000);

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
