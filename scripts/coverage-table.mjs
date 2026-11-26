import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { matchesTrackedTree, workingTreeSha256 } from '../components/check-runner/tracked-source.ts';
import { compareCoverage, coverageConfiguration } from './coverage-compare.mjs';

const root = process.cwd();
const directory = path.join(root, 'coverage');
const summaryFile = path.join(directory, 'coverage-summary.json');
const digest = value => createHash('sha256').update(value).digest('hex');
const tool = { name: 'coverage-table', version: 2, sha256: createHash('sha256')
  .update(fs.readFileSync(new URL(import.meta.url)))
  .update(fs.readFileSync(new URL('../components/check-runner/tracked-source.ts', import.meta.url)))
  .update(fs.readFileSync(new URL('./coverage-compare.mjs', import.meta.url))).digest('hex') };
const gitOutput = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
const git = (...args) => gitOutput(...args).trim();

function identity() {
  try {
    const status = git('--no-optional-locks', '-c', 'core.fsmonitor=false', 'status', '--porcelain', '--untracked-files=all', '--ignore-submodules=none');
    const hidden = git('ls-files', '-v', '-z').split('\0').some(record => /^[a-zS] /.test(record));
    const commit = git('rev-parse', 'HEAD'), tree = git('rev-parse', commit + '^{tree}');
    const clean = status === '' && !hidden && matchesTrackedTree(root, tree);
    return { commit, tree, clean, ...(clean ? { workingSha256: workingTreeSha256(root, tree) } : {}), statusSha256: digest(status), diffSha256: digest(git('diff', '--binary', 'HEAD')) };
  } catch { return { status: 'unavailable', reason: 'Git source identity is unavailable' }; }
}

function flags(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!['--capture', '--started', '--check-outcome', '--baseline'].includes(flag) || !args[i + 1] || args[i + 1].startsWith('--') || Object.hasOwn(out, flag)) throw new Error('Invalid coverage option: ' + flag);
    out[flag] = args[++i];
  }
  if (out['--capture'] && Object.keys(out).length !== 1) throw new Error('--capture cannot be combined with reporting options');
  if (out['--check-outcome'] && !out['--started']) throw new Error('--check-outcome requires --started');
  if (out['--check-outcome'] && !['success', 'failure', 'cancelled', 'skipped', 'unknown'].includes(out['--check-outcome'])) throw new Error('Invalid check outcome');
  return out;
}

function canonical(file) {
  let ancestor = file;
  while (!fs.lstatSync(ancestor, { throwIfNoEntry: false })) ancestor = path.dirname(ancestor);
  return path.resolve(fs.realpathSync.native(ancestor), path.relative(ancestor, file));
}

function contains(parent, file) {
  const relative = path.relative(parent, file);
  return !path.isAbsolute(relative) && relative.split(path.sep, 1)[0] !== '..';
}

function gitPaths(repo, commit) {
  const tracked = [gitOutput('ls-files', '--cached', '--full-name', '-z'), commit ? gitOutput('ls-tree', '-rz', '--full-tree', '--name-only', commit) : '']
    .flatMap(output => output.split('\0').filter(Boolean)).map(name => path.resolve(repo, name));
  const internals = [canonical(git('rev-parse', '--absolute-git-dir')), canonical(path.resolve(git('rev-parse', '--git-common-dir')))];
  return { tracked, internals };
}

function isCapture(value) {
  return value?.version === 1 && value.tool?.name === tool.name && value.tool?.version === tool.version
    && typeof value.capturedAt === 'string' && Number.isFinite(Date.parse(value.capturedAt))
    && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value.source?.commit ?? '')
    && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value.source?.tree ?? '')
    && /^[a-f0-9]{64}$/.test(value.tool.sha256 ?? '');
}

function capture(file) {
  const source = identity();
  if (!source.commit) throw new Error(source.reason);
  const requested = path.resolve(file);
  if (process.platform === 'win32' && /[ .](?:\\|$)|:/.test(requested.slice(path.parse(requested).root.length))) throw new Error('Capture context uses an ambiguous Windows path');
  const target = canonical(requested), coverage = canonical(directory);
  if (contains(directory, requested) || contains(coverage, target)) throw new Error('Capture context must be outside coverage, which Vitest replaces');
  const existingCoverage = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (existingCoverage && !existingCoverage.isDirectory()) throw new Error('Coverage must be a real directory before capture');
  const { tracked, internals } = gitPaths(canonical(git('rev-parse', '--show-toplevel')), source.commit);
  if (tracked.some(name => path.relative(name, target) === '' || contains(coverage, name))) throw new Error('Capture cannot overwrite or remove tracked source');
  if (internals.some(dir => contains(dir, target) || contains(coverage, dir))) throw new Error('Capture cannot write to or remove Git internals');
  const existing = fs.lstatSync(requested, { throwIfNoEntry: false });
  if (existing) {
    if (!existing.isFile() || existing.nlink !== 1) throw new Error('Capture context must be a regular file without aliases');
    let previous;
    try { previous = JSON.parse(fs.readFileSync(target, 'utf8')); } catch { /* Refuse invalid output. */ }
    if (!isCapture(previous)) throw new Error('Capture can replace only a prior coverage context');
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const scratch = fs.mkdtempSync(path.join(path.dirname(target), '.coverage-context-'));
  try {
    const staged = path.join(scratch, 'context.json');
    fs.writeFileSync(staged, JSON.stringify({ version: 1, capturedAt: new Date().toISOString(), source, tool }, null, 2) + '\n');
    fs.renameSync(staged, target);
    try {
      fs.rmSync(directory, { recursive: true, force: true });
    } catch (error) {
      fs.rmSync(target, { force: true });
      throw error;
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `commit=${source.commit}\n`);
  console.log(`Coverage context captured at ${source.commit}; previous coverage removed`);
}

function metric(value, label) {
  if (!value || !Number.isSafeInteger(value.total) || !Number.isSafeInteger(value.covered) || value.total < 0 || value.covered < 0 || value.covered > value.total) throw new Error('Invalid coverage counts: ' + label);
  return { total: value.total, covered: value.covered, percent: value.total ? 100 * value.covered / value.total : null };
}

const fileStats = { bigint: true, throwIfNoEntry: false };

function readUnaliased(file) {
  const entry = fs.lstatSync(file, fileStats);
  if (!entry) return;
  const matches = stat => stat?.isFile() && stat.nlink === 1n && stat.dev === entry.dev && stat.ino === entry.ino
    && stat.mtimeNs === entry.mtimeNs && stat.ctimeNs === entry.ctimeNs;
  const invalid = () => new Error('Expected an unchanged regular file without aliases');
  if (!matches(entry)) throw invalid();
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
  try {
    const opened = fs.fstatSync(fd, fileStats);
    if (!matches(opened)) throw invalid();
    const bytes = fs.readFileSync(fd);
    if (!matches(fs.lstatSync(file, fileStats))) throw invalid();
    return { bytes, mtimeNs: opened.mtimeNs };
  } finally { fs.closeSync(fd); }
}

function readSummary() {
  const empty = (status, reason) => ({ summary: { status, reason }, components: [], files: [] });
  let file;
  try { file = readUnaliased(summaryFile); }
  catch { return empty('invalid', 'Coverage summary must be a readable regular file without aliases'); }
  if (!file) return empty('unavailable', 'No V8 coverage summary was produced');
  const { bytes, mtimeNs } = file;
  const sha256 = digest(bytes);
  try {
    const input = JSON.parse(bytes.toString('utf8'));
    metric(input.total?.lines, 'total lines');
    metric(input.total?.branches, 'total branches');
    const groups = new Map();
    const files = [];
    const seen = new Set();
    for (const [name, value] of Object.entries(input)) {
      if (name === 'total') continue;
      const relative = path.relative(root, path.resolve(name.replaceAll('\\', '/'))).replaceAll('\\', '/');
      const component = /^components\/([a-z][a-z0-9-]*)\/.+\.(?:ts|tsx)$/.exec(relative)?.[1];
      if (!component || relative.split('/').includes('..') || relative.includes('/node_modules/') || /\.test\./.test(relative)) throw new Error('Coverage contains an entry outside the declared component TypeScript scope');
      if (seen.has(relative)) throw new Error('Coverage repeats a source file');
      seen.add(relative);
      const current = groups.get(component) ?? { name: component, lines: { total: 0, covered: 0 }, branches: { total: 0, covered: 0 } };
      for (const kind of ['lines', 'branches']) {
        const counts = metric(value[kind], relative + ' ' + kind);
        current[kind].total += counts.total;
        current[kind].covered += counts.covered;
      }
      groups.set(component, current);
      files.push({ path: relative, sha256: digest(fs.readFileSync(path.join(root, relative))) });
    }
    if (!files.length) return { summary: { status: 'unavailable', sha256, reason: 'The V8 summary contains no component files' }, components: [], files: [], mtimeNs };
    const components = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name)).map(group => ({ name: group.name, lines: metric(group.lines, group.name), branches: metric(group.branches, group.name) }));
    for (const kind of ['lines', 'branches']) {
      const total = components.reduce((sum, group) => ({ total: sum.total + group[kind].total, covered: sum.covered + group[kind].covered }), { total: 0, covered: 0 });
      if (total.total !== input.total[kind].total || total.covered !== input.total[kind].covered) throw new Error('Coverage total does not match reported component ' + kind);
    }
    return { summary: { status: 'reported', sha256 }, components, files: files.sort((a, b) => a.path.localeCompare(b.path)), mtimeNs };
  } catch (error) {
    const reason = error instanceof SyntaxError ? 'Malformed V8 coverage summary' : error.code === 'ENOENT' ? 'A covered source file is unavailable' : error.message;
    return { summary: { status: 'invalid', sha256, reason }, components: [], files: [], mtimeNs };
  }
}

function binding(file, source, data, configuration, mtimeNs) {
  if (!file) return { status: 'unavailable', reason: 'No before-run source context was supplied' };
  let capture;
  try { capture = readUnaliased(file); }
  catch { return { status: 'invalid', reason: 'Before-run source context must be a readable regular file without aliases' }; }
  if (!capture) return { status: 'unavailable', reason: 'Before-run source context is missing' };
  let before;
  try { before = JSON.parse(capture.bytes.toString('utf8')); }
  catch { return { status: 'invalid', reason: 'Malformed before-run source context' }; }
  if (!isCapture(before)) return { status: 'invalid', reason: 'Unsupported before-run source context' };
  if (!before.source.clean || !source.clean) return { status: 'invalid', reason: 'Coverage source is dirty; it is not the recorded commit tree' };
  if (!/^[a-f0-9]{64}$/.test(before.source.workingSha256 ?? '')) return { status: 'invalid', reason: 'Before-run source context lacks a tracked working-byte fingerprint' };
  if (before.source.commit !== source.commit || before.source.tree !== source.tree || before.tool.sha256 !== tool.sha256) return { status: 'stale', reason: 'Source or reporting tool changed since capture' };
  if (before.source.workingSha256 !== source.workingSha256) return { status: 'stale', reason: 'Tracked working bytes changed since capture' };
  if (mtimeNs === undefined && data.summary.status === 'unavailable') return { status: 'unavailable', reason: 'No summary for the captured run' };
  if (mtimeNs !== undefined && mtimeNs < capture.mtimeNs) return { status: 'stale', reason: 'Coverage summary predates source capture' };
  if (data.summary.status !== 'reported') return { status: 'unavailable', reason: 'No valid component summary for the captured run' };
  for (const entry of [...data.files, ...configuration]) {
    try {
      const local = path.join(root, entry.path);
      const tracked = /^(?:100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t/.exec(git('ls-tree', '-z', before.source.commit, '--', entry.path));
      if (!tracked || !fs.lstatSync(local).isFile() || fs.realpathSync(local) !== path.join(fs.realpathSync(root), entry.path))
        return { status: 'invalid', reason: 'Reported file is not a regular tracked source file: ' + entry.path };
      const bytes = execFileSync('git', ['cat-file', 'blob', tracked[1]], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
      if (digest(bytes) !== entry.sha256) return { status: 'stale', reason: 'Reported file differs from the captured commit: ' + entry.path };
    } catch { return { status: 'invalid', reason: 'Reported source identity is unavailable: ' + entry.path }; }
  }
  return { status: 'matched', capturedAt: before.capturedAt };
}

function markdown(report) {
  const counts = value => `${value.percent === null ? 'n/a' : value.percent.toFixed(1) + '%'} (${value.covered}/${value.total})`;
  const comparable = row => !row.files.length ? 'Unavailable' : `${counts(row.before)} → ${counts(row.after)} (${row.percentagePointDelta.toFixed(1)} pp, files ${row.files.length})`;
  return [
    '# Component coverage', '',
    `Source commit: ${report.source.commit ?? 'unavailable'}. Tree: ${report.source.tree ?? 'unavailable'}. Clean: ${report.source.clean ?? 'unknown'}.`,
    `Check outcome: ${report.execution.checkOutcome}. Source binding: ${report.execution.binding.status}. Summary: ${report.summary.status}.`,
    ...(report.summary.reason ? [report.summary.reason] : []), ...(report.execution.binding.reason ? [report.execution.binding.reason] : []), '',
    '| Component | Lines | Branches |', '|---|---:|---:|',
    ...report.components.map(group => `| ${group.name} | ${counts(group.lines)} | ${counts(group.branches)} |`), '',
    'Scope: reported component TypeScript files; no branches means n/a, not 100%. Counts do not prove rule correctness or complete execution.',
    `Baseline: ${report.baseline.status}. Comparison: ${report.comparison.status}. ${report.comparison.reason ?? ''}`,
    ...(report.comparison.components ? ['', '| Observed component scope | Lines pp | Branches pp | Scope |', '|---|---:|---:|---|',
      ...report.comparison.components.map(group => `| ${group.name} | ${group.lines?.percentagePointDelta?.toFixed(1) ?? 'n/a'} | ${group.branches?.percentagePointDelta?.toFixed(1) ?? 'n/a'} | ${group.status} |`),
      `Added files: ${report.comparison.addedFiles.join(', ') || 'none'}. Removed/omitted files: ${report.comparison.removedFiles.join(', ') || 'none'}.`,
      `Components with observed count or percentage loss: ${report.comparison.losses.join(', ') || 'none observed'}.`,
      '', '| Like-for-like component | Lines | Branches | Line evidence | Branch evidence |', '|---|---|---|---|---|',
      ...report.comparison.components.map(({ name, likeForLike }) => `| ${name} | ${comparable(likeForLike.lines)} | ${comparable(likeForLike.branches)} | ${likeForLike.lines.regressionEvidence} | ${likeForLike.branches.regressionEvidence} |`),
      `Components with like-for-like loss: ${report.comparison.likeForLikeLosses.join(', ') || 'none observed'}.`,
      'The JSON report lists each measured, omitted, added, removed and excluded file.'] : []),
    'Comparisons are informative only. Missing, invalid, incompatible or stale evidence leaves regression unknown. Changed scope and zero denominators cannot establish no regression.', '',
  ].join('\n');
}

function sameReportDirectory(pinned) {
  const current = fs.lstatSync(directory, fileStats);
  return (!current || current.isDirectory()) && current?.dev === pinned.entry?.dev && current?.ino === pinned.entry?.ino
    && path.relative(canonical(directory), pinned.location) === '';
}

function assertReportDirectory(pinned) {
  if (!sameReportDirectory(pinned)) throw new Error('Coverage directory changed or is not a real directory');
}

function assertReportFile(target) {
  const entry = fs.lstatSync(target, fileStats);
  if (entry && (!entry.isFile() || entry.nlink !== 1n)) throw new Error('Coverage reports must be regular files without aliases');
}

function reportTargets(commit, location) {
  const targets = ['coverage-evidence.json', 'coverage-evidence.md'].map(name => path.join(location, name));
  for (const target of targets) assertReportFile(target);
  let repo;
  try { repo = canonical(git('rev-parse', '--show-toplevel')); }
  catch (error) {
    if (error.code === 'ENOENT' || String(error.stderr).includes('not a git repository')) return targets;
    throw error;
  }
  const { tracked, internals } = gitPaths(repo, commit);
  for (const target of targets.map(canonical)) {
    if (tracked.some(name => path.relative(name, target) === '') || internals.some(dir => contains(dir, target))) throw new Error('Coverage reports cannot overwrite tracked source or Git internals');
  }
  return targets;
}

function report(options) {
  const pinned = { location: path.join(fs.realpathSync.native(root), 'coverage'), entry: fs.lstatSync(directory, fileStats) };
  assertReportDirectory(pinned);
  const source = identity();
  const targets = reportTargets(source.commit, pinned.location);
  const { mtimeNs, ...data } = readSummary();
  const configuration = coverageConfiguration.filter(file => fs.existsSync(path.join(root, file))).map(file => ({ path: file, sha256: digest(fs.readFileSync(path.join(root, file))) }));
  const evidence = {
    version: 1, tool, createdAt: new Date().toISOString(), source,
    configuration,
    runtime: { node: process.version },
    scope: 'components/**/*.ts and components/**/*.tsx; excludes tests and node_modules; only summary entries', ...data,
    execution: {
      checkOutcome: options['--check-outcome'] ?? 'unknown', binding: binding(options['--started'], source, data, configuration, mtimeNs),
      ...(process.env.GITHUB_RUN_ID ? { run: { id: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT ?? 'unknown', job: process.env.GITHUB_JOB ?? 'unknown' } } : {}),
    },
  };
  Object.assign(evidence, compareCoverage(root, evidence, data.summary.status === 'reported' ? readUnaliased(summaryFile).bytes : Buffer.alloc(0), options['--baseline']));
  const text = markdown(evidence);
  const contents = [JSON.stringify(evidence, null, 2) + '\n', text];
  assertReportDirectory(pinned);
  if (!pinned.entry) {
    fs.mkdirSync(pinned.location);
    pinned.entry = fs.lstatSync(pinned.location, fileStats);
  }
  for (const target of targets) assertReportFile(target);
  assertReportDirectory(pinned);
  const scratch = fs.mkdtempSync(path.join(pinned.location, '.coverage-report-'));
  try {
    const staged = targets.map(target => path.join(scratch, path.basename(target)));
    for (const [index, file] of staged.entries()) {
      assertReportDirectory(pinned);
      fs.writeFileSync(file, contents[index], { flag: 'wx' });
    }
    for (const [index, target] of targets.entries()) {
      assertReportFile(target);
      assertReportDirectory(pinned);
      fs.renameSync(staged[index], target);
    }
  } finally {
    if (sameReportDirectory(pinned)) fs.rmSync(scratch, { recursive: true, force: true });
  }
  if (options['--started'] && process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  console.log(text);
  return data.summary.status !== 'reported' || (options['--started'] && evidence.execution.binding.status !== 'matched') ? 1 : 0;
}

try {
  const options = flags(process.argv.slice(2));
  if (options['--capture']) capture(options['--capture']);
  else process.exitCode = report(options);
} catch (error) { console.error(error.message); process.exitCode = 1; }
