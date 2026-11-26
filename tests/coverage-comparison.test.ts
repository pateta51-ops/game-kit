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
function fixture(compareScopes = false) {
  const dir = path.join(temporary, 'source-' + String(++sequence));
  const baseline = path.join(temporary, 'baseline-' + String(sequence));
  fs.mkdirSync(dir); fs.mkdirSync(baseline);
  const put = (file: string, content: string) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), content); };
  for (const file of ['scripts/coverage-table.mjs', 'scripts/coverage-compare.mjs', 'components/check-runner/tracked-source.ts']) put(file, fs.readFileSync(path.join(source, file), 'utf8'));
  put('.gitignore', 'coverage/\n.cache/\n');
  put('package.json', '{"type":"module"}\n');
  put('vitest.config.ts', 'export default {};\n');
  put('tsconfig.json', '{"compilerOptions":{"jsx":"react-jsx"}}\n');
  put('components/engine-core/a.ts', 'export const value = 1;\n');
  put('components/empty/a.ts', 'export const value = 1;\n');
  if (compareScopes) for (const name of ['stable', 'denominator', 'omitted', 'unmeasured', 'newly-instrumented', 'removed']) {
    put('components/engine-core/' + name + '.ts', 'export const value = 1;\n');
  }
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Kit test', '-c', 'user.email=test@users.noreply.github.com', ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q'); git('config', 'core.autocrlf', 'false'); git('add', '-A'); git('commit', '-qm', 'Baseline fixture');
  const run = (...args: string[]) => spawnSync(process.execPath, ['scripts/coverage-table.mjs', ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_RUN_ID: '100', GITHUB_RUN_ATTEMPT: '1', GITHUB_JOB: 'check', GITHUB_REPOSITORY: 'project/game-kit', GITHUB_STEP_SUMMARY: '', GITHUB_OUTPUT: '' } });
  const summary = (engine = 4, other = 1, omit = false, current = false) => {
    const files = {
      [path.join(dir, 'components/engine-core/a.ts')]: { lines: counts(10, engine), branches: counts(4, 3) },
      ...(!omit ? { [path.join(dir, 'components/empty/a.ts')]: { lines: counts(10, other), branches: counts(0, 0) } } : {}),
      ...(compareScopes ? {
        [path.join(dir, 'components/engine-core/stable.ts')]: { lines: counts(10, current ? 7 : 8), branches: counts(0, 0) },
        [path.join(dir, 'components/engine-core/denominator.ts')]: { lines: counts(current ? 5 : 4, 2), branches: counts(current ? 3 : 2, current ? 2 : 1) },
        ...(current ? {
          [path.join(dir, 'components/engine-core/newly-instrumented.ts')]: { lines: counts(2, 2), branches: counts(0, 0) },
          [path.join(dir, 'components/engine-core/added.ts')]: { lines: counts(4, 4), branches: counts(0, 0) },
        } : {
          [path.join(dir, 'components/engine-core/omitted.ts')]: { lines: counts(100, 0), branches: counts(0, 0) },
          [path.join(dir, 'components/engine-core/removed.ts')]: { lines: counts(5, 0), branches: counts(0, 0) },
        }),
      } : {}),
    };
    const total = { lines: counts(0, 0), branches: counts(0, 0) };
    for (const file of Object.values(files)) for (const kind of ['lines', 'branches'] as const) {
      total[kind].covered += file[kind].covered;
      total[kind].total += file[kind].total;
    }
    put('coverage/coverage-summary.json', JSON.stringify({ total, ...files }));
  };
  const read = () => JSON.parse(fs.readFileSync(path.join(dir, 'coverage/coverage-evidence.json'), 'utf8')) as { baseline: { status: string; reason?: string }; comparison: { status: string; losses?: string[]; likeForLikeLosses?: string[]; removedFiles?: string[]; components?: { name: string; lines: { percentagePointDelta: number | null }; branches: { percentagePointDelta: number | null } }[] } };
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
  if (compareScopes) {
    put('components/engine-core/added.ts', 'export const value = 1;\n');
    git('rm', 'components/engine-core/removed.ts');
  }
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

  it.each(['source hash', 'wrong source', 'source omission', 'summary hash', 'tool hash', 'wrong run', 'wrong attempt', 'failed run', 'cancelled run', 'missing runtime', 'malformed'] as const)('keeps %s evidence invalid despite its artifact location', kind => {
    const f = fixture();
    const file = path.join(f.baseline, 'coverage-evidence.json');
    const evidence = JSON.parse(fs.readFileSync(file, 'utf8')) as { source: { commit: string }; files: { sha256: string }[]; summary: { sha256: string }; runtime: { node?: string }; tool: { sha256: string }; execution: { run: { id: string; attempt: string }; checkOutcome: string } };
    if (kind === 'source hash') evidence.files[0]!.sha256 = hash('different source');
    if (kind === 'wrong source') evidence.source.commit = f.git('rev-parse', 'HEAD');
    if (kind === 'source omission') evidence.files.pop();
    if (kind === 'summary hash') evidence.summary.sha256 = hash('different summary');
    if (kind === 'tool hash') evidence.tool.sha256 = hash('different reporter');
    if (kind === 'wrong run') evidence.execution.run.id = '101';
    if (kind === 'wrong attempt') evidence.execution.run.attempt = '2';
    if (kind === 'failed run') evidence.execution.checkOutcome = 'failure';
    if (kind === 'cancelled run') evidence.execution.checkOutcome = 'cancelled';
    if (kind === 'missing runtime') delete evidence.runtime.node;
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

  it('checks the pinned TypeScript transform configuration even in captures that omitted it', () => {
    const f = fixture();
    f.put('tsconfig.json', '{"compilerOptions":{"jsx":"preserve"}}\n');
    f.git('add', '-A'); f.git('commit', '-qm', 'Change TypeScript transform configuration');
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

  it.each(['missing archive', 'missing summary'] as const)('keeps coverage unknown for a %s', kind => {
    const f = fixture();
    fs.unlinkSync(path.join(f.baseline, kind === 'missing archive' ? 'artifact.zip' : 'coverage-summary.json'));
    expect(f.run('--capture', '.cache/start.json').status).toBe(0); f.summary();
    expect(f.report()).toMatchObject({ baseline: { status: 'unavailable' }, comparison: { status: 'unknown' } });
  });

  it('rejects a corrupt retained archive even when its digest matches', () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.baseline, 'artifact.zip'), 'not a zip');
    f.selection.artifact.digest = 'sha256:' + hash('not a zip');
    fs.writeFileSync(path.join(f.baseline, 'selection.json'), JSON.stringify(f.selection));
    expect(f.run('--capture', '.cache/start.json').status).toBe(0); f.summary();
    expect(f.report()).toMatchObject({ baseline: { status: 'invalid', reason: 'Retained artifact members could not be independently verified' }, comparison: { status: 'unknown' } });
  });

  it.each(['truncated', 'unsafe path', 'invalid count'] as const)('rejects a %s summary from a digest-matching archive', kind => {
    const f = fixture();
    const evidencePath = path.join(f.baseline, 'coverage-evidence.json');
    const summaryPath = path.join(f.baseline, 'coverage-summary.json');
    const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8')) as { summary: { sha256: string } };
    const raw = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as Record<string, { lines: { covered: number } }>;
    const first = Object.keys(raw).find(file => file !== 'total')!;
    if (kind === 'unsafe path') {
      raw[first.replace('components', 'shadow/../components')] = raw[first]!;
      delete raw[first];
    }
    if (kind === 'invalid count') raw[first]!.lines.covered = Number.MAX_SAFE_INTEGER;
    const bytes = kind === 'truncated' ? '{' : JSON.stringify(raw);
    fs.writeFileSync(summaryPath, bytes);
    evidence.summary.sha256 = hash(bytes);
    fs.writeFileSync(evidencePath, JSON.stringify(evidence));
    f.archive();
    expect(f.run('--capture', '.cache/start.json').status).toBe(0); f.summary();
    expect(f.report()).toMatchObject({ baseline: { status: 'invalid' }, comparison: { status: 'unknown' } });
  });

  it('rejects an aliased retained report member', () => {
    const f = fixture();
    fs.linkSync(path.join(f.baseline, 'coverage-summary.json'), path.join(f.baseline, 'summary-alias.json'));
    expect(f.run('--capture', '.cache/start.json').status).toBe(0); f.summary();
    expect(f.report()).toMatchObject({ baseline: { status: 'invalid', reason: 'Baseline input must be an unaliased regular file' }, comparison: { status: 'unknown' } });
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

  it('reports a like-for-like loss despite a gain from changed observed scope', () => {
    const f = fixture(true);
    expect(f.run('--capture', '.cache/start.json').status).toBe(0);
    f.summary(4, 1, false, true);
    const result = f.report();
    expect(result.baseline.status).toBe('verified');
    const engine = result.comparison.components?.find(group => group.name === 'engine-core');
    const paths = (names: string[]) => names.map(name => 'components/engine-core/' + name + '.ts');
    expect(engine?.lines.percentagePointDelta).toBeGreaterThan(0);
    expect(engine).toMatchObject({
      status: 'scope-changed',
      lines: { coveredDelta: 5 },
      scope: {
        before: { measured: paths(['a', 'denominator', 'omitted', 'removed', 'stable']), omitted: paths(['newly-instrumented', 'unmeasured']) },
        after: { measured: paths(['a', 'added', 'denominator', 'newly-instrumented', 'stable']), omitted: paths(['omitted', 'unmeasured']) },
        addedSource: ['components/engine-core/added.ts'],
        removedSource: ['components/engine-core/removed.ts'],
        newlyInstrumented: ['components/engine-core/newly-instrumented.ts'],
        noLongerInstrumented: ['components/engine-core/omitted.ts'],
      },
      likeForLike: {
        lines: {
          status: 'partial', files: ['components/engine-core/stable.ts'],
          excluded: { changedSource: ['components/engine-core/a.ts'], changedDenominator: ['components/engine-core/denominator.ts'], zeroDenominator: [] },
          before: { covered: 8, total: 10, percent: 80 }, after: { covered: 7, total: 10, percent: 70 },
          coveredDelta: -1, totalDelta: 0, percentagePointDelta: -10, regressionEvidence: 'loss-observed',
        },
        branches: {
          status: 'unavailable', files: [], excluded: { zeroDenominator: ['components/engine-core/stable.ts'] },
          before: { covered: 0, total: 0, percent: null }, percentagePointDelta: null, regressionEvidence: 'unknown',
        },
      },
    });
    expect(result.comparison.losses).not.toContain('engine-core');
    expect(result.comparison.likeForLikeLosses).toContain('engine-core');
    expect(fs.readFileSync(path.join(f.dir, 'coverage/coverage-evidence.md'), 'utf8')).toContain('| engine-core | 80.0% (8/10) → 70.0% (7/10) (-10.0 pp, files 1) | Unavailable | loss-observed | unknown |');
  });

  it('does not compare a current failed check even when its source matches', () => {
    const f = fixture();
    expect(f.run('--capture', '.cache/start.json').status).toBe(0); f.summary();
    expect(f.report('failure').comparison.status).toBe('unknown');
  });
});
