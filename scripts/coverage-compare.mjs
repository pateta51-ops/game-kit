import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const scope = 'components/**/*.ts and components/**/*.tsx; excludes tests and node_modules; only summary entries';
export const coverageConfiguration = ['vitest.config.ts', 'package.json', 'package-lock.json', 'check-runner.config.json'];
const sha = value => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const relative = value => typeof value === 'string' && /^[\w./-]+$/.test(value) && !value.startsWith('/') && !value.split('/').some(part => !part || part === '.' || part === '..');
const git = (root, ...args) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
const regular = file => {
  const entry = fs.lstatSync(file);
  if (!entry.isFile() || entry.nlink !== 1) throw new Error('Baseline input must be an unaliased regular file');
  return fs.readFileSync(file);
};
function metric(value) {
  if (!value || !Number.isSafeInteger(value.total) || !Number.isSafeInteger(value.covered) || value.total < 0 || value.covered < 0 || value.covered > value.total) throw new Error('Invalid baseline coverage counts');
  return { total: value.total, covered: value.covered, percent: value.total ? 100 * value.covered / value.total : null };
}
function blob(root, commit, file) {
  if (!relative(file)) throw new Error('Invalid repository-relative evidence path');
  const entry = git(root, 'ls-tree', '-z', commit, '--', file).toString();
  const match = /^(?:100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t/.exec(entry);
  if (!match || entry !== match[0] + file + '\0') throw new Error('Evidence path is not a regular tracked blob: ' + file);
  return git(root, 'cat-file', 'blob', match[1]);
}
function verify(root, evidence, bytes) {
  if (evidence?.version !== 1 || !sha(evidence.source?.commit) || !sha(evidence.source?.tree) || evidence.source.clean !== true
    || !/^[a-f0-9]{64}$/.test(evidence.source.workingSha256 ?? '') || evidence.summary?.status !== 'reported'
    || evidence.execution?.checkOutcome !== 'success' || evidence.execution.binding?.status !== 'matched') throw new Error('Evidence lacks successful matched source binding');
  if (git(root, 'rev-parse', evidence.source.commit + '^{tree}').toString().trim() !== evidence.source.tree) throw new Error('Evidence tree differs from its source commit');
  if (hash(bytes) !== evidence.summary.sha256) throw new Error('Coverage summary digest does not match its payload');
  if (evidence.scope !== scope || !Array.isArray(evidence.files) || !evidence.files.length || !Array.isArray(evidence.configuration)) throw new Error('Unsupported coverage scope or file inventory');
  const expectedConfiguration = coverageConfiguration.filter(file => git(root, 'ls-tree', '-z', evidence.source.commit, '--', file).length > 0).sort();
  if (JSON.stringify(evidence.configuration.map(entry => entry?.path).sort()) !== JSON.stringify(expectedConfiguration)) throw new Error('Configuration inventory differs from the source commit');
  const files = new Set();
  for (const entry of [...evidence.files, ...evidence.configuration]) {
    if (!entry || files.has(entry.path) || hash(blob(root, evidence.source.commit, entry.path)) !== entry.sha256) throw new Error('Source or configuration identity mismatch: ' + entry?.path);
    files.add(entry.path);
  }
  if (evidence.tool?.name !== 'coverage-table' || ![1, 2].includes(evidence.tool.version)) throw new Error('Unsupported coverage reporting tool');
  const toolFiles = ['scripts/coverage-table.mjs', 'components/check-runner/tracked-source.ts', ...(evidence.tool.version === 2 ? ['scripts/coverage-compare.mjs'] : [])];
  const toolHash = createHash('sha256');
  for (const file of toolFiles) toolHash.update(blob(root, evidence.source.commit, file));
  if (toolHash.digest('hex') !== evidence.tool.sha256) throw new Error('Reporting tool does not match its source commit');
  const summary = JSON.parse(bytes.toString('utf8'));
  const byFile = new Map(), groups = new Map();
  for (const [name, counts] of Object.entries(summary)) {
    if (name === 'total') continue;
    const normalized = name.replaceAll('\\', '/');
    const matches = evidence.files.filter(file => normalized === file.path || normalized.endsWith('/' + file.path));
    if (matches.length !== 1 || byFile.has(matches[0].path)) throw new Error('Coverage payload file inventory mismatch');
    const file = matches[0].path;
    const component = /^components\/([a-z][a-z0-9-]*)\/.+\.(?:ts|tsx)$/.exec(file)?.[1];
    if (!component || /\.test\.|\/node_modules\//.test(file)) throw new Error('Coverage file is outside the declared scope');
    const values = { lines: metric(counts.lines), branches: metric(counts.branches) };
    byFile.set(file, values);
    const group = groups.get(component) ?? { name: component, lines: { total: 0, covered: 0 }, branches: { total: 0, covered: 0 } };
    for (const kind of ['lines', 'branches']) {
      group[kind].total += values[kind].total;
      group[kind].covered += values[kind].covered;
      metric(group[kind]);
    }
    groups.set(component, group);
  }
  if (byFile.size !== evidence.files.length) throw new Error('Coverage payload omits declared files');
  const components = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name)).map(group => ({ name: group.name, lines: metric(group.lines), branches: metric(group.branches) }));
  if (JSON.stringify(components) !== JSON.stringify(evidence.components)) throw new Error('Weighted component totals differ from the raw payload');
  for (const kind of ['lines', 'branches']) {
    const total = components.reduce((sum, group) => ({ total: sum.total + group[kind].total, covered: sum.covered + group[kind].covered }), { total: 0, covered: 0 });
    if (JSON.stringify(metric(total)) !== JSON.stringify(metric(summary.total?.[kind]))) throw new Error('Coverage total differs from component counts');
  }
  return { components, byFile };
}

/** Compare retained evidence to its own source revision before comparing counts. */
export function compareCoverage(root, current, summaryBytes, baselineDirectory) {
  const unknown = (status, reason) => ({ baseline: { status, reason }, comparison: { status: 'unknown', reason } });
  if (!baselineDirectory) return unknown('unavailable', 'No successful retained ancestor baseline was selected');
  try {
    const directory = path.resolve(baselineDirectory);
    const selection = JSON.parse(regular(path.join(directory, 'selection.json')).toString());
    if (selection.status === 'unavailable') return unknown('unavailable', selection.reason);
    const evidenceBytes = regular(path.join(directory, 'coverage-evidence.json'));
    const baselineBytes = regular(path.join(directory, 'coverage-summary.json'));
    const baseline = JSON.parse(evidenceBytes.toString());
    const run = selection.run;
    if (selection.version !== 1 || selection.status !== 'selected' || selection.policy !== 'successful-main-ancestor' || !/^[\w.-]+\/[\w.-]+$/.test(selection.repository ?? '')
      || !run || !Number.isSafeInteger(run.id) || run.id <= 0 || !Number.isSafeInteger(run.run_attempt) || run.run_attempt <= 0 || run.event !== 'push' || run.head_branch !== 'main'
      || run.conclusion !== 'success' || run.status !== 'completed' || run.head_sha !== baseline.source?.commit
      || String(run.id) !== baseline.execution?.run?.id || String(run.run_attempt) !== baseline.execution?.run?.attempt
      || run.repository?.full_name !== selection.repository || (process.env.GITHUB_REPOSITORY && selection.repository !== process.env.GITHUB_REPOSITORY)
      || run.path !== '.github/workflows/ci.yml') return unknown('invalid', 'Selected run does not qualify as the successful main baseline recorded in the payload');
    const artifact = selection.artifact;
    if (!artifact || !Number.isSafeInteger(artifact.id) || artifact.id <= 0 || artifact.name !== `coverage-${run.head_sha}-${run.id}-${run.run_attempt}`
      || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest ?? '')) return unknown('invalid', 'Selected artifact metadata does not match the run');
    if ('sha256:' + hash(regular(path.join(directory, 'artifact.zip'))) !== artifact.digest) return unknown('invalid', 'Retained artifact digest differs from its selection');
    let memberHashes;
    try {
      memberHashes = JSON.parse(execFileSync('python3', ['-c', `import sys,zipfile,hashlib,json
result={}
with zipfile.ZipFile(sys.argv[1]) as z:
    for name in ['coverage-evidence.json','coverage-summary.json']:
        entries=[i for i in z.infolist() if i.filename==name]
        if len(entries)!=1 or entries[0].file_size>32*1024*1024: raise ValueError('Invalid evidence archive member')
        result[name]=hashlib.sha256(z.read(entries[0])).hexdigest()
print(json.dumps(result))
`, path.join(directory, 'artifact.zip')], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }));
    } catch { return unknown('invalid', 'Retained artifact members could not be independently verified'); }
    if (memberHashes['coverage-evidence.json'] !== hash(evidenceBytes) || memberHashes['coverage-summary.json'] !== hash(baselineBytes)) return unknown('invalid', 'Extracted evidence differs from the retained artifact');
    if (baseline.source.commit === current.source?.commit) return unknown('invalid', 'Baseline must be an earlier ancestor');
    try { git(root, 'merge-base', '--is-ancestor', baseline.source.commit, current.source.commit); }
    catch { return unknown('invalid', 'Selected baseline is not an available ancestor of the current source'); }
    const before = verify(root, baseline, baselineBytes);
    const after = verify(root, current, summaryBytes);
    const configuration = evidence => JSON.stringify([...evidence.configuration].sort((a, b) => a.path.localeCompare(b.path)));
    if (baseline.tool.version !== current.tool.version || baseline.tool.sha256 !== current.tool.sha256 || configuration(baseline) !== configuration(current)
      || baseline.runtime?.node !== current.runtime?.node) return unknown('incompatible', 'Reporting tool, configuration, instrumentation dependencies or Node version changed');
    const addedFiles = [...after.byFile.keys()].filter(file => !before.byFile.has(file));
    const removedFiles = [...before.byFile.keys()].filter(file => !after.byFile.has(file));
    const files = new Set([...addedFiles, ...removedFiles]);
    const beforeGroups = new Map(before.components.map(group => [group.name, group]));
    const afterGroups = new Map(after.components.map(group => [group.name, group]));
    const components = [...new Set([...beforeGroups.keys(), ...afterGroups.keys()])].sort().map(name => {
      const old = beforeGroups.get(name), next = afterGroups.get(name);
      const scopeChanged = [...files].some(file => file.startsWith('components/' + name + '/'));
      const result = { name, status: !old ? 'added' : !next ? 'removed' : scopeChanged ? 'scope-changed' : 'compared', before: old ?? null, after: next ?? null };
      if (old && next) for (const kind of ['lines', 'branches']) result[kind] = {
        coveredDelta: next[kind].covered - old[kind].covered, totalDelta: next[kind].total - old[kind].total,
        percentagePointDelta: old[kind].percent === null || next[kind].percent === null ? null : next[kind].percent - old[kind].percent,
      };
      return result;
    });
    return {
      baseline: { status: 'verified', commit: baseline.source.commit, run: baseline.execution.run, policy: selection.policy },
      comparison: { status: files.size ? 'scope-changed' : 'compared', components, addedFiles, removedFiles,
        exclusions: ['tests', 'node_modules', 'non-TypeScript files', 'files absent from either summary'],
        losses: components.filter(component => component.status === 'removed' || ['lines', 'branches'].some(kind => component[kind]?.coveredDelta < 0 || component[kind]?.percentagePointDelta < 0)).map(component => component.name),
        thresholds: 'informative-only', limitations: 'Counts do not prove rule accuracy. Changed file scope and zero denominators do not establish no regression.' },
    };
  } catch (error) { return unknown('invalid', error instanceof SyntaxError ? 'Malformed baseline evidence' : error.message); }
}
