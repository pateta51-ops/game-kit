import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const script = path.resolve(import.meta.dirname, '../scripts/coverage-table.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-evidence-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const metric = (total: number, covered: number) => ({ total, covered, skipped: 0, pct: total ? 100 * covered / total : 'Unknown' });
type Report = {
  version: number;
  source: { commit: string; tree: string; clean: boolean };
  summary: { status: string; sha256?: string; reason?: string };
  execution: { checkOutcome: string; binding: { status: string } };
  baseline: { status: string };
  comparison: { status: string };
  components: { name: string; lines: { total: number; covered: number; percent: number | null }; branches: { total: number; covered: number; percent: number | null } }[];
  files: { path: string; sha256: string }[];
};
function fixture(name: string) {
  const dir = path.join(root, name);
  fs.mkdirSync(path.join(dir, 'components/engine-core'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'components/empty'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.gitignore'), 'coverage/\n.cache/\n');
  for (const file of ['engine-core/a.ts', 'engine-core/b.ts', 'empty/a.ts']) fs.writeFileSync(path.join(dir, 'components', file), 'export const value = 1;\n');
  const git = (...args: string[]): string => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('add', '-A');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Coverage fixture');
  const start = path.join(dir, '.cache/start.json');
  const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '', GITHUB_OUTPUT: '' } });
  const writeSummary = (): string => {
    const entries = {
      total: { lines: metric(11, 5), branches: metric(6, 4) },
      [path.join(dir, 'components/engine-core/a.ts')]: { lines: metric(4, 3), branches: metric(2, 1) },
      [path.join(dir, 'components/engine-core/b.ts')]: { lines: metric(6, 1), branches: metric(4, 3) },
      [path.join(dir, 'components/empty/a.ts')]: { lines: metric(1, 1), branches: metric(0, 0) },
    };
    fs.mkdirSync(path.join(dir, 'coverage'), { recursive: true });
    const file = path.join(dir, 'coverage/coverage-summary.json');
    fs.writeFileSync(file, JSON.stringify(entries));
    return file;
  };
  const read = (): Report => JSON.parse(fs.readFileSync(path.join(dir, 'coverage/coverage-evidence.json'), 'utf8')) as Report;
  return { dir, git, start, run, writeSummary, read };
}

describe('coverage history evidence', () => {
  it('reports weighted line and branch counts and binds actual git/source identities', () => {
    const f = fixture('counts');
    const summary = f.writeSummary();
    const result = f.run();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('Branches');
    const report = f.read();
    expect(report.source).toEqual(expect.objectContaining({ commit: f.git('rev-parse', 'HEAD'), tree: f.git('rev-parse', 'HEAD^{tree}'), clean: true }));
    expect(report.summary).toMatchObject({ status: 'reported', sha256: hash(fs.readFileSync(summary)) });
    expect(report.components.find(component => component.name === 'engine-core')).toMatchObject({ lines: { total: 10, covered: 4, percent: 40 }, branches: { total: 6, covered: 4 } });
    expect(report.components.find(component => component.name === 'engine-core')?.branches.percent).toBeCloseTo(66.6666667);
    expect(report.components.find(component => component.name === 'empty')?.branches.percent).toBeNull();
    expect(report.files[0]).toEqual({ path: 'components/empty/a.ts', sha256: hash('export const value = 1;\n') });
    expect(JSON.stringify(report)).not.toContain(f.dir);
    expect(report.execution.checkOutcome).toBe('unknown');
    expect(report.baseline.status).toBe('unavailable');
    expect(report.comparison.status).toBe('unknown');
  });

  it('clears old coverage and records the actual check outcome without rerunning tests', () => {
    const f = fixture('capture');
    const old = f.writeSummary();
    const begun = f.run('--capture', f.start);
    expect(begun.status, begun.stdout + begun.stderr).toBe(0);
    expect(fs.existsSync(old)).toBe(false);
    f.writeSummary();
    const result = f.run('--started', f.start, '--check-outcome', 'failure');
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(f.read().execution).toMatchObject({ checkOutcome: 'failure', binding: { status: 'matched' } });
    expect(f.read().comparison.status).toBe('unknown');
  });

  it.skipIf(process.platform !== 'win32')('rejects a case alias of the coverage directory before removing coverage', () => {
    const f = fixture('capture-case-alias');
    const summary = f.writeSummary();
    expect(f.run('--capture', path.join(f.dir, 'COVERAGE/context.json')).status).toBe(1);
    expect(fs.existsSync(summary)).toBe(true);
  });

  it('rejects a filesystem alias of the coverage directory before removing coverage', () => {
    const f = fixture('capture-directory-alias');
    const summary = f.writeSummary();
    const alias = path.join(f.dir, 'coverage-alias');
    fs.symlinkSync(path.dirname(summary), alias, process.platform === 'win32' ? 'junction' : 'dir');
    expect(f.run('--capture', path.join(alias, 'context.json')).status).toBe(1);
    expect(fs.existsSync(summary)).toBe(true);
  });

  it.each(['tracked input', 'unrelated output', 'hard-linked capture'])('preserves %s on rejected capture', kind => {
    const f = fixture('capture-' + kind.replaceAll(' ', '-'));
    const target = path.join(f.dir, kind === 'tracked input' ? 'components/engine-core/a.ts' : '.cache/target.json');
    if (kind === 'unrelated output') {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, '{"existing":"unrelated"}\n');
    }
    if (kind === 'hard-linked capture') {
      expect(f.run('--capture', f.start).status).toBe(0);
      fs.linkSync(f.start, target);
    }
    const prior = fs.readFileSync(target);
    const summary = f.writeSummary();
    expect(f.run('--capture', target).status).toBe(1);
    expect(fs.readFileSync(target)).toEqual(prior);
    expect(fs.existsSync(summary)).toBe(true);
  });

  it('refuses to remove tracked source inside the coverage directory', () => {
    const f = fixture('capture-tracked-coverage');
    const summary = f.writeSummary();
    const authored = path.join(f.dir, 'coverage/authored.md');
    fs.writeFileSync(authored, 'This file is authored.\n');
    f.git('add', '-f', 'coverage/authored.md');
    f.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Keep authored coverage-folder input');
    expect(f.run('--capture', f.start).status).toBe(1);
    expect(fs.existsSync(summary)).toBe(true);
    expect(fs.readFileSync(authored, 'utf8')).toBe('This file is authored.\n');
    expect(fs.existsSync(f.start)).toBe(false);
  });

  it('recaptures a prior context outside the coverage directory', () => {
    const f = fixture('recapture');
    expect(f.run('--capture', f.start).status).toBe(0);
    const summary = f.writeSummary();
    expect(f.run('--capture', f.start).status).toBe(0);
    expect(fs.existsSync(summary)).toBe(false);
    expect(JSON.parse(fs.readFileSync(f.start, 'utf8'))).toMatchObject({ source: { commit: f.git('rev-parse', 'HEAD') } });
  });

  it('accepts a fresh summary with the same filesystem timestamp as its capture', () => {
    const f = fixture('capture-tick');
    expect(f.run('--capture', f.start).status).toBe(0);
    const summary = f.writeSummary();
    const tick = new Date(Math.floor(fs.statSync(f.start).mtimeMs / 1000) * 1000 - 1000);
    fs.utimesSync(f.start, tick, tick);
    fs.utimesSync(summary, tick, tick);
    expect(f.run('--started', f.start, '--check-outcome', 'success').status).toBe(0);
    expect(f.read().execution.binding.status).toBe('matched');
  });

  it.each(['hardlink', 'symlink', 'tracked destination', 'aliased directory', 'directory destination'] as const)('preserves source and both reports with a %s', kind => {
    if (kind === 'symlink' && process.platform === 'win32') return;
    const f = fixture('report-' + kind.replaceAll(' ', '-'));
    expect(f.run('--capture', f.start).status).toBe(0);
    const coverage = path.dirname(f.writeSummary());
    const json = path.join(coverage, 'coverage-evidence.json');
    const markdown = path.join(coverage, 'coverage-evidence.md');
    const source = path.join(f.dir, 'components/engine-core/a.ts');
    const original = fs.readFileSync(source);
    fs.writeFileSync(json, 'previous JSON');
    if (kind === 'hardlink') fs.linkSync(source, markdown);
    else if (kind === 'symlink') fs.symlinkSync(source, markdown);
    else if (kind === 'directory destination') fs.mkdirSync(markdown);
    else fs.writeFileSync(markdown, 'previous Markdown');
    if (kind === 'tracked destination') f.git('add', '-f', 'coverage/coverage-evidence.md');
    if (kind === 'aliased directory') {
      const moved = path.join(f.dir, '.cache/real-coverage');
      fs.renameSync(coverage, moved);
      fs.symlinkSync(moved, coverage, process.platform === 'win32' ? 'junction' : 'dir');
    }
    const result = f.run('--started', f.start, '--check-outcome', 'success');
    expect(result.status).toBe(1);
    expect(fs.readFileSync(json, 'utf8')).toBe('previous JSON');
    expect(fs.readFileSync(source)).toEqual(original);
    if (kind !== 'directory destination') expect(fs.readFileSync(markdown, 'utf8')).toBe(['hardlink', 'symlink'].includes(kind) ? original.toString('utf8') : 'previous Markdown');
  });

  it('rejects a cached tracked edit outside the files named in the coverage summary', () => {
    const f = fixture('cached-source');
    const script = path.join(f.dir, 'script.mjs');
    const timestamp = new Date('2020-01-01T00:00:00Z');
    f.git('config', 'core.trustctime', 'false');
    f.git('config', 'core.checkStat', 'minimal');
    fs.writeFileSync(script, "console.log('first');\n");
    fs.utimesSync(script, timestamp, timestamp);
    f.git('add', 'script.mjs');
    f.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Add uncovered tracked source');
    expect(f.run('--capture', f.start).status).toBe(0);
    fs.writeFileSync(script, "console.log('other');\n");
    fs.utimesSync(script, timestamp, timestamp);
    expect(f.git('status', '--porcelain')).toBe('');
    f.writeSummary();
    const result = f.run('--started', f.start, '--check-outcome', 'success');
    expect(result.status).toBe(1);
    expect(f.read()).toMatchObject({ source: { clean: false }, execution: { binding: { status: 'invalid' } } });
  });

  it('rejects changed working bytes when Git filters still produce the captured tree', () => {
    const f = fixture('filtered-source');
    const original = "console.log('first');\n";
    const script = path.join(f.dir, 'script.cjs');
    f.git('config', 'filter.fixture.clean', 'node clean-filter.cjs');
    f.git('config', 'filter.fixture.required', 'true');
    fs.writeFileSync(path.join(f.dir, '.gitattributes'), 'script.cjs filter=fixture\n');
    fs.writeFileSync(path.join(f.dir, 'clean-filter.cjs'), `require('node:fs').readFileSync(0); process.stdout.write(${JSON.stringify(original)});\n`);
    fs.writeFileSync(script, original);
    f.git('add', '.');
    f.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Test a local clean filter');
    expect(f.run('--capture', f.start).status).toBe(0);
    f.writeSummary();
    expect(f.run('--started', f.start, '--check-outcome', 'success').status).toBe(0);
    fs.writeFileSync(script, "console.log('other');\n");
    expect(f.git('status', '--porcelain')).toBe('');
    const result = f.run('--started', f.start, '--check-outcome', 'success');
    expect(result.status).toBe(1);
    expect(f.read()).toMatchObject({ execution: { binding: { status: 'stale' } } });
  });

  it.each(['missing', 'malformed', 'bad-counts'] as const)('reports %s summary as unavailable or invalid, with no zero-coverage fiction', kind => {
    const f = fixture(kind);
    if (kind !== 'missing') {
      const file = f.writeSummary();
      fs.writeFileSync(file, kind === 'malformed' ? '{' : JSON.stringify({ total: { lines: metric(1, 2), branches: metric(0, 0) } }));
    }
    const result = f.run();
    expect(result.status).toBe(1);
    expect(f.read().summary.status).toBe(kind === 'missing' ? 'unavailable' : 'invalid');
    expect(f.read().components).toEqual([]);
    expect(f.read().comparison.status).toBe('unknown');
  });

  it.each(['missing', 'malformed', 'null', 'changed-source', 'old-summary'] as const)('refuses a %s source binding instead of labelling it verified', kind => {
    const f = fixture(`binding-${kind}`);
    expect(f.run('--capture', f.start).status).toBe(0);
    const file = f.writeSummary();
    if (kind === 'missing') fs.rmSync(f.start);
    if (kind === 'malformed') fs.writeFileSync(f.start, '{}');
    if (kind === 'null') fs.writeFileSync(f.start, 'null');
    if (kind === 'changed-source') fs.appendFileSync(path.join(f.dir, 'components/engine-core/a.ts'), 'export const changed = 2;\n');
    if (kind === 'old-summary') fs.utimesSync(file, new Date('2000-01-01'), new Date('2000-01-01'));
    const result = f.run('--started', f.start, '--check-outcome', 'success');
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(f.read().execution.binding.status).not.toBe('matched');
    expect(f.read().comparison.status).toBe('unknown');
  });

  it.each(['ignored source', 'ignored configuration', 'assume-unchanged source'] as const)('does not match %s outside the recorded commit content', kind => {
    const f = fixture('binding-' + kind.replaceAll(' ', '-'));
    const relative = kind === 'ignored source' ? 'components/engine-core/generated.ts'
      : kind === 'ignored configuration' ? 'vitest.config.ts' : 'components/engine-core/a.ts';
    if (kind === 'assume-unchanged source') f.git('update-index', '--assume-unchanged', relative);
    else {
      fs.appendFileSync(path.join(f.dir, '.gitignore'), relative + '\n');
      f.git('add', '.gitignore');
      f.git('-c', 'user.name=kit-tests', '-c', 'user.email=kit-tests@users.noreply.github.com', 'commit', '-qm', 'Ignored input fixture');
    }
    expect(f.run('--capture', f.start).status).toBe(0);
    fs.writeFileSync(path.join(f.dir, relative), 'export const drift = 2;\n');
    const summary = f.writeSummary();
    if (kind === 'ignored source') {
      const data = JSON.parse(fs.readFileSync(summary, 'utf8')) as Record<string, { lines: ReturnType<typeof metric>; branches: ReturnType<typeof metric> }>;
      data['total'] = { lines: metric(12, 6), branches: metric(6, 4) };
      data[path.join(f.dir, relative)] = { lines: metric(1, 1), branches: metric(0, 0) };
      fs.writeFileSync(summary, JSON.stringify(data));
    }
    expect(f.git('status', '--porcelain', '--untracked-files=all')).toBe('');
    const recorded = spawnSync('git', ['show', 'HEAD:' + relative], { cwd: f.dir, encoding: 'utf8' });
    if (kind === 'assume-unchanged source') {
      expect(recorded.status).toBe(0);
      expect(recorded.stdout).not.toBe(fs.readFileSync(path.join(f.dir, relative), 'utf8'));
    } else expect(recorded.status).not.toBe(0);
    const result = f.run('--started', f.start, '--check-outcome', 'success');
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(f.read().execution.binding.status).not.toBe('matched');
    expect(f.read().comparison.status).toBe('unknown');
  });
});
