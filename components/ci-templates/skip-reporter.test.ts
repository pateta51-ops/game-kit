import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Reporter } from 'vitest/node';
import SkipReporter from './skip-reporter.ts';

const mod = (id: string, tests: [string, string][]) => ({
  relativeModuleId: id,
  children: { allTests: () => tests.map(([fullName, state]) => ({ fullName, result: () => ({ state }) })) },
});
const modules = [
  mod('tests/b.test.ts', [['pack > loads', 'skipped'], ['pack > counts', 'passed'], ['art > index', 'skipped']]),
  mod('tests/a.test.ts', [['real cards', 'skipped'], ['fails', 'failed']]),
  mod('tests/c.test.ts', [['fine', 'passed']]),
];

describe('skip reporter', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skip-reporter-'));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it('is a vitest reporter', () => {
    const r: Reporter = new SkipReporter();
    expect('onTestRunEnd' in r).toBe(true);
  });

  it('lists every skipped test by file on the console and in the GitHub job summary, with the inputs present or absent', () => {
    const summary = join(mkdtempSync(join(tmpdir(), 'skip-summary-')), 'summary.md');
    vi.stubEnv('GITHUB_STEP_SUMMARY', summary);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    new SkipReporter({ inputs: [[import.meta.dirname, 'never'], [join(dir, 'nope'), 'npm run extract']] }).onTestRunEnd(modules);
    const head = `Tests: 3 ran, 3 skipped (in 2 file(s)) of 6. Inputs: ${import.meta.dirname} present; ${join(dir, 'nope')} absent (npm run extract).`;
    const list = '- tests/a.test.ts (1)\n  - real cards\n- tests/b.test.ts (2)\n  - pack > loads\n  - art > index';
    expect(log).toHaveBeenCalledWith(`\n${head}\n${list}`);
    expect(readFileSync(summary, 'utf8')).toBe(`### ${head}\n\n${list}\n\n`);
    rmSync(dirname(summary), { recursive: true, force: true });
  });

  it('vitest 2 (onFinished, no onTestRunEnd): the same list from the task tree, and nothing twice on a newer vitest', () => {
    vi.stubEnv('GITHUB_STEP_SUMMARY', '');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const files = [
      { name: 'tests/b.test.ts', tasks: [{ name: 'pack', tasks: [{ name: 'loads', mode: 'skip' }, { name: 'counts', mode: 'run', result: { state: 'pass' } }] }, { name: 'later', mode: 'todo' }] },
      { name: 'tests/a.test.ts', tasks: [{ name: 'real cards', mode: 'run', result: { state: 'skip' } }, { name: 'fails', mode: 'run', result: { state: 'fail' } }, { name: 'empty', tasks: [] }] },
    ];
    new SkipReporter().onFinished(files);
    expect(log).toHaveBeenCalledWith('\nTests: 2 ran, 3 skipped (in 2 file(s)) of 5.\n- tests/a.test.ts (1)\n  - real cards\n- tests/b.test.ts (2)\n  - pack > loads\n  - later');
    const r = new SkipReporter();
    r.onTestRunStart();
    r.onFinished(files);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('runs in real vitest: a fixture run with one skipped test', () => {
    const root = mkdtempSync(join(tmpdir(), 'skip-real-'));
    writeFileSync(join(root, 'x.test.js'), "describe('s', () => { it.skip('skipped one', () => {}); it('runs', () => {}); });\n");
    const r = spawnSync(
      process.execPath,
      [join(process.cwd(), 'node_modules/vitest/vitest.mjs'), 'run', '--root', root, '--globals', '--reporter', join(import.meta.dirname, 'skip-reporter.ts')],
      { encoding: 'utf8', env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(VITEST|TEST|NODE_ENV)/.test(k))), GITHUB_STEP_SUMMARY: join(root, 'summary.md') } },
    );
    rmSync(root, { recursive: true, force: true, maxRetries: 3 });
    expect(r.stdout + r.stderr).toContain('Tests: 1 ran, 1 skipped (in 1 file(s)) of 2.\n- x.test.js (1)\n  - s > skipped one');
    expect(r.status).toBe(0);
  });

  it('prints one line and no inputs when nothing is skipped and none are named', () => {
    vi.stubEnv('GITHUB_STEP_SUMMARY', '');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    new SkipReporter().onTestRunEnd([mod('tests/c.test.ts', [['fine', 'passed']])]);
    expect(log).toHaveBeenCalledWith('\nTests: 1 ran, 0 skipped (in 0 file(s)) of 1.');
  });
});
