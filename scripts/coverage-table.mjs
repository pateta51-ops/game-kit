import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { matchesTrackedTree, workingTreeSha256 } from '../components/check-runner/tracked-source.ts';

const root = process.cwd();
const directory = path.join(root, 'coverage');
const summaryFile = path.join(directory, 'coverage-summary.json');
const digest = value => createHash('sha256').update(value).digest('hex');
const tool = { name: 'coverage-table', version: 1, sha256: createHash('sha256')
  .update(fs.readFileSync(new URL(import.meta.url)))
  .update(fs.readFileSync(new URL('../components/check-runner/tracked-source.ts', import.meta.url))).digest('hex') };
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }).trim();

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
    if (!['--capture', '--started', '--check-outcome'].includes(flag) || !args[i + 1] || args[i + 1].startsWith('--') || Object.hasOwn(out, flag)) throw new Error('Invalid coverage option: ' + flag);
    out[flag] = args[++i];
  }
  if (out['--capture'] && Object.keys(out).length !== 1) throw new Error('--capture cannot be combined with reporting options');
  if (out['--check-outcome'] && !['success', 'failure', 'cancelled', 'skipped', 'unknown'].includes(out['--check-outcome'])) throw new Error('Invalid check outcome');
  return out;
}

function capture(file) {
  const source = identity();
  if (!source.commit) throw new Error(source.reason);
  const target = path.resolve(file);
  if (target === directory || target.startsWith(directory + path.sep)) throw new Error('Capture context must be outside coverage, which Vitest replaces');
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify({ version: 1, capturedAt: new Date().toISOString(), source, tool }, null, 2) + '\n');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `commit=${source.commit}\n`);
  console.log(`Coverage context captured at ${source.commit}; previous coverage removed`);
}

function metric(value, label) {
  if (!value || !Number.isSafeInteger(value.total) || !Number.isSafeInteger(value.covered) || value.total < 0 || value.covered < 0 || value.covered > value.total) throw new Error('Invalid coverage counts: ' + label);
  return { total: value.total, covered: value.covered, percent: value.total ? 100 * value.covered / value.total : null };
}

function readSummary() {
  if (!fs.existsSync(summaryFile)) return { summary: { status: 'unavailable', reason: 'No V8 coverage summary was produced' }, components: [], files: [] };
  const bytes = fs.readFileSync(summaryFile);
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
    if (!files.length) return { summary: { status: 'unavailable', sha256, reason: 'The V8 summary contains no component files' }, components: [], files: [] };
    const components = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name)).map(group => ({ name: group.name, lines: metric(group.lines, group.name), branches: metric(group.branches, group.name) }));
    for (const kind of ['lines', 'branches']) {
      const total = components.reduce((sum, group) => ({ total: sum.total + group[kind].total, covered: sum.covered + group[kind].covered }), { total: 0, covered: 0 });
      if (total.total !== input.total[kind].total || total.covered !== input.total[kind].covered) throw new Error('Coverage total does not match reported component ' + kind);
    }
    return { summary: { status: 'reported', sha256 }, components, files: files.sort((a, b) => a.path.localeCompare(b.path)) };
  } catch (error) {
    const reason = error instanceof SyntaxError ? 'Malformed V8 coverage summary' : error.code === 'ENOENT' ? 'A covered source file is unavailable' : error.message;
    return { summary: { status: 'invalid', sha256, reason }, components: [], files: [] };
  }
}

function binding(file, source, data, configuration) {
  if (!file) return { status: 'unavailable', reason: 'No before-run source context was supplied' };
  if (!fs.existsSync(file)) return { status: 'unavailable', reason: 'Before-run source context is missing' };
  let before;
  try { before = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return { status: 'invalid', reason: 'Malformed before-run source context' }; }
  if (!before || before.version !== 1 || !Number.isFinite(Date.parse(before.capturedAt)) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(before.source?.commit ?? '') || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(before.source?.tree ?? '') || !/^[a-f0-9]{64}$/.test(before.tool?.sha256 ?? '')) return { status: 'invalid', reason: 'Unsupported before-run source context' };
  if (!before.source.clean || !source.clean) return { status: 'invalid', reason: 'Coverage source is dirty; it is not the recorded commit tree' };
  if (!/^[a-f0-9]{64}$/.test(before.source.workingSha256 ?? '')) return { status: 'invalid', reason: 'Before-run source context lacks a tracked working-byte fingerprint' };
  if (before.source.commit !== source.commit || before.source.tree !== source.tree || before.tool.sha256 !== tool.sha256) return { status: 'stale', reason: 'Source or reporting tool changed since capture' };
  if (before.source.workingSha256 !== source.workingSha256) return { status: 'stale', reason: 'Tracked working bytes changed since capture' };
  if (!fs.existsSync(summaryFile)) return { status: 'unavailable', reason: 'No summary for the captured run' };
  if (fs.statSync(summaryFile, { bigint: true }).mtimeNs < fs.statSync(file, { bigint: true }).mtimeNs) return { status: 'stale', reason: 'Coverage summary predates source capture' };
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
  return [
    '# Component coverage', '',
    `Source commit: ${report.source.commit ?? 'unavailable'}. Tree: ${report.source.tree ?? 'unavailable'}. Clean: ${report.source.clean ?? 'unknown'}.`,
    `Check outcome: ${report.execution.checkOutcome}. Source binding: ${report.execution.binding.status}. Summary: ${report.summary.status}.`,
    ...(report.summary.reason ? [report.summary.reason] : []), ...(report.execution.binding.reason ? [report.execution.binding.reason] : []), '',
    '| Component | Lines | Branches |', '|---|---:|---:|',
    ...report.components.map(group => `| ${group.name} | ${counts(group.lines)} | ${counts(group.branches)} |`), '',
    'Scope: reported component TypeScript files; no branches means n/a, not 100%. Counts do not prove rule correctness or complete execution.',
    'Regression: unknown. No verified baseline comparison is implemented. Missing, invalid or stale evidence is not a no-regression result.', '',
  ].join('\n');
}

function report(options) {
  const source = identity();
  const data = readSummary();
  const configuration = ['vitest.config.ts', 'package.json', 'package-lock.json', 'check-runner.config.json'].filter(file => fs.existsSync(path.join(root, file))).map(file => ({ path: file, sha256: digest(fs.readFileSync(path.join(root, file))) }));
  const evidence = {
    version: 1, tool, createdAt: new Date().toISOString(), source,
    configuration,
    runtime: { node: process.version },
    scope: 'components/**/*.ts and components/**/*.tsx; excludes tests and node_modules; only summary entries', ...data,
    execution: {
      checkOutcome: options['--check-outcome'] ?? 'unknown', binding: binding(options['--started'], source, data, configuration),
      ...(process.env.GITHUB_RUN_ID ? { run: { id: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT ?? 'unknown', job: process.env.GITHUB_JOB ?? 'unknown' } } : {}),
    },
    baseline: { status: 'unavailable', reason: 'Automatic baseline selection and verification are not implemented' }, comparison: { status: 'unknown' },
  };
  fs.mkdirSync(directory, { recursive: true });
  const text = markdown(evidence);
  fs.writeFileSync(path.join(directory, 'coverage-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  fs.writeFileSync(path.join(directory, 'coverage-evidence.md'), text);
  if (options['--started'] && process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  console.log(text);
  return data.summary.status !== 'reported' || (options['--started'] && evidence.execution.binding.status !== 'matched') ? 1 : 0;
}

try {
  const options = flags(process.argv.slice(2));
  if (options['--capture']) capture(options['--capture']);
  else process.exitCode = report(options);
} catch (error) { console.error(error.message); process.exitCode = 1; }
