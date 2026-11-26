import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const source = path.resolve(import.meta.dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-comparison-'));
afterAll(() => fs.rmSync(temporary, { recursive: true, force: true }));
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const counts = (total: number, covered: number) => ({ total, covered });
let sequence = 0;
function fixture() {
  const dir = path.join(temporary, 'source-' + String(++sequence));
  const baseline = path.join(temporary, 'baseline-' + String(sequence));
  fs.mkdirSync(dir); fs.mkdirSync(baseline);
  const put = (file: string, content: string) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), content); };
  for (const file of ['scripts/coverage-table.mjs', 'scripts/coverage-compare.mjs', 'components/check-runner/tracked-source.ts']) put(file, fs.readFileSync(path.join(source, file), 'utf8'));
  put('.gitignore', 'coverage/\n.cache/\n');
  put('package.json', '{"type":"module"}\n');
  put('vitest.config.ts', 'export default {};\n');
  put('components/engine-core/a.ts', 'export const value = 1;\n');
  put('components/empty/a.ts', 'export const value = 1;\n');
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Kit test', '-c', 'user.email=test@users.noreply.github.com', ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q'); git('config', 'core.autocrlf', 'false'); git('add', '-A'); git('commit', '-qm', 'Baseline fixture');
  const run = (...args: string[]) => spawnSync(process.execPath, ['scripts/coverage-table.mjs', ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_RUN_ID: '100', GITHUB_RUN_ATTEMPT: '1', GITHUB_JOB: 'check', GITHUB_REPOSITORY: 'project/game-kit', GITHUB_STEP_SUMMARY: '', GITHUB_OUTPUT: '' } });
  const summary = (engine = 4, other = 1, omit = false) => {
    const values = {
      total: { lines: counts(omit ? 10 : 20, omit ? engine : engine + other), branches: counts(4, 3) },
      [path.join(dir, 'components/engine-core/a.ts')]: { lines: counts(10, engine), branches: counts(4, 3) },
      ...(!omit ? { [path.join(dir, 'components/empty/a.ts')]: { lines: counts(10, other), branches: counts(0, 0) } } : {}),
    };
    put('coverage/coverage-summary.json', JSON.stringify(values));
  };
  const read = () => JSON.parse(fs.readFileSync(path.join(dir, 'coverage/coverage-evidence.json'), 'utf8')) as { baseline: { status: string; reason?: string }; comparison: { status: string; losses?: string[]; removedFiles?: string[]; components?: { name: string; branches: { percentagePointDelta: number | null } }[] } };
  expect(run('--capture', '.cache/start.json').status).toBe(0);
  summary();
  expect(run('--started', '.cache/start.json', '--check-outcome', 'success').status).toBe(0);
  for (const file of ['coverage-evidence.json', 'coverage-summary.json']) fs.copyFileSync(path.join(dir, 'coverage', file), path.join(baseline, file));
  const selection = { version: 1, status: 'selected', policy: 'successful-main-ancestor', repository: 'project/game-kit', run: { id: 100, run_attempt: 1, event: 'push', head_branch: 'main', conclusion: 'success', status: 'completed', head_sha: git('rev-parse', 'HEAD'), repository: { full_name: 'project/game-kit' }, path: '.github/workflows/ci.yml' }, artifact: { id: 1, name: '', digest: '' } };
  const archive = () => {
    execFileSync('python3', ['-c', 'import sys,zipfile,pathlib; p=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(p/"artifact.zip","w"); [z.write(p/n,n) for n in ["coverage-evidence.json","coverage-summary.json"]]; z.close()', baseline]);
    selection.artifact = { id: 1, name: `coverage-${selection.run.head_sha}-100-1`, digest: 'sha256:' + createHash('sha256').update(fs.readFileSync(path.join(baseline, 'artifact.zip'))).digest('hex') };
    fs.writeFileSync(path.join(baseline, 'selection.json'), JSON.stringify(selection));
  };
  archive();
  put('components/engine-core/a.ts', 'export const value = 2;\n');
  git('add', '-A'); git('commit', '-qm', 'Current source fixture');
  const report = (outcome = 'success') => {
    const result = run('--started', '.cache/start.json', '--check-outcome', outcome, '--baseline', baseline);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    return read();
  };
  return { dir, baseline, run, summary, report, put, git, selection, archive };
}

describe('verified ancestor coverage comparisons', () => {
  it('verifies each source separately and exposes component loss and zero denominators', () => {
    const f = fixture();
    expect(f.run('--capture', '.cache/start.json').status).toBe(0);
    f.summary(3);
    const evidence = f.report();
    expect(evidence.baseline.status).toBe('verified');
    expect(evidence.comparison.status).toBe('compared');
    expect(evidence.comparison.losses).toContain('engine-core');
    expect(evidence.comparison.components?.find(group => group.name === 'empty')?.branches.percentagePointDelta).toBeNull();
  });

  it.each(['source hash', 'summary hash', 'tool hash', 'wrong run', 'failed run', 'malformed'] as const)('keeps %s evidence invalid despite its artifact location', kind => {
    const f = fixture();
    const file = path.join(f.baseline, 'coverage-evidence.json');
    const evidence = JSON.parse(fs.readFileSync(file, 'utf8')) as { files: { sha256: string }[]; summary: { sha256: string }; tool: { sha256: string }; execution: { run: { id: string }; checkOutcome: string } };
    if (kind === 'source hash') evidence.files[0]!.sha256 = hash('different source');
    if (kind === 'summary hash') evidence.summary.sha256 = hash('different summary');
    if (kind === 'tool hash') evidence.tool.sha256 = hash('different reporter');
    if (kind === 'wrong run') evidence.execution.run.id = '101';
    if (kind === 'failed run') evidence.execution.checkOutcome = 'failure';
    fs.writeFileSync(file, kind === 'malformed' ? '{' : JSON.stringify(evidence));
    f.archive();
    expect(f.run('--capture', '.cache/start.json').status).toBe(0); f.summary();
    const result = f.report();
    expect(result.baseline.status).toBe('invalid');
    expect(result.comparison.status).toBe('unknown');
  });

  it('keeps a critical component loss visible while overall covered lines improve', () => {
    const f = fixture();
    expect(f.run('--capture', '.cache/start.json').status).toBe(0); f.summary(3, 3);
    const result = f.report();
    expect(result.baseline.status).toBe('verified');
    expect(result.comparison.losses).toEqual(['engine-core']);
  });

  it('keeps a successful prior run incompatible after a real configuration change', () => {
    const f = fixture();
    f.put('package.json', '{"type":"module","scripts":{"test":"changed"}}\n');
    f.git('add', '-A'); f.git('commit', '-qm', 'Changed instrumentation contract');
    expect(f.run('--capture', '.cache/start.json').status).toBe(0); f.summary();
    expect(f.report()).toMatchObject({ baseline: { status: 'incompatible' }, comparison: { status: 'unknown' } });
  });

  it('rejects a baseline configuration omission even when that file is removed at current HEAD', () => {
    const f = fixture();
    f.git('rm', 'vitest.config.ts'); f.git('commit', '-qm', 'Remove configuration');
    const file = path.join(f.baseline, 'coverage-evidence.json');
    const evidence = JSON.parse(fs.readFileSync(file, 'utf8')) as { configuration: { path: string }[] };
    evidence.configuration = evidence.configuration.filter(entry => entry.path !== 'vitest.config.ts');
    fs.writeFileSync(file, JSON.stringify(evidence)); f.archive();
    expect(f.run('--capture', '.cache/start.json').status).toBe(0); f.summary();
    expect(f.report()).toMatchObject({ baseline: { status: 'invalid', reason: 'Configuration inventory differs from the source commit' }, comparison: { status: 'unknown' } });
  });

  it.each(['selection status', 'artifact name', 'archive digest', 'extracted payload'] as const)('rejects misleading %s', kind => {
    const f = fixture();
    if (kind === 'selection status') f.selection.status = 'failed';
    if (kind === 'artifact name') f.selection.artifact.name = 'unrelated-artifact';
    if (kind === 'archive digest') f.selection.artifact.digest = 'sha256:' + '0'.repeat(64);
    if (kind === 'extracted payload') fs.appendFileSync(path.join(f.baseline, 'coverage-summary.json'), ' ');
    fs.writeFileSync(path.join(f.baseline, 'selection.json'), JSON.stringify(f.selection));
    expect(f.run('--capture', '.cache/start.json').status).toBe(0); f.summary();
    expect(f.report()).toMatchObject({ baseline: { status: 'invalid' }, comparison: { status: 'unknown' } });
  });

  it('reports removed or omitted files as changed scope', () => {
    const f = fixture();
    expect(f.run('--capture', '.cache/start.json').status).toBe(0); f.summary(4, 0, true);
    const result = f.report();
    expect(result.baseline.status).toBe('verified');
    expect(result.comparison.status).toBe('scope-changed');
    expect(result.comparison.removedFiles).toEqual(['components/empty/a.ts']);
    expect(result.comparison.losses).toContain('empty');
  });

  it('does not compare a current failed check even when its source matches', () => {
    const f = fixture();
    expect(f.run('--capture', '.cache/start.json').status).toBe(0); f.summary();
    expect(f.report('failure').comparison.status).toBe('unknown');
  });
});
