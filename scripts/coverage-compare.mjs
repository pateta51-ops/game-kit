import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const scope = 'components/**/*.ts and components/**/*.tsx; excludes tests and node_modules; only summary entries';
export const coverageConfiguration = ['vitest.config.ts', 'package.json', 'package-lock.json', 'check-runner.config.json'];
const sourceConfiguration = ['.github/workflows/ci.yml', '.npmrc', '.nvmrc', 'tests/setup-dom.ts'];
const sha = value => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const relative = value => typeof value === 'string' && /^[\w./-]+$/.test(value) && !value.startsWith('/') && !value.split('/').some(part => !part || part === '.' || part === '..');
const git = (root, ...args) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
const componentOf = file => /\.test\.|\/node_modules\//.test(file) ? undefined : /^components\/([a-z][a-z0-9-]*)\/.+\.(?:ts|tsx)$/.exec(file)?.[1];
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
function trackedSources(root, commit) {
  const entries = git(root, 'ls-tree', '-r', '-z', commit, '--', 'components').toString('utf8').split('\0');
  return new Set(entries.flatMap(entry => {
    const file = /^(?:100644|100755) blob [a-f0-9]+\t(.+)$/.exec(entry)?.[1];
    return file && componentOf(file) ? [file] : [];
  }));
}
function configurationAt(root, commit) {
  const known = sourceConfiguration.filter(file => git(root, 'ls-tree', '-z', commit, '--', file).length > 0);
  const tsconfigs = new Set(git(root, 'ls-tree', '-r', '-z', '--name-only', commit).toString('utf8').split('\0')
    .filter(file => /(?:^|\/)tsconfig\.json$/i.test(file)));
  let unresolved;
  const files = [...known, ...tsconfigs].sort().map(file => {
    const bytes = blob(root, commit, file);
    if (tsconfigs.has(file)) {
      let config;
      try { config = JSON.parse(bytes.toString('utf8')); } catch { config = null; }
      if (!config || typeof config !== 'object' || Array.isArray(config) || Object.hasOwn(config, 'extends') || Object.hasOwn(config, 'references')) unresolved ??= file;
    }
    return { path: file, sha256: hash(bytes) };
  });
  return { files, unresolved };
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
  if (typeof evidence.runtime?.node !== 'string' || !/^v\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/.test(evidence.runtime.node)) throw new Error('Evidence lacks the Node runtime identity');
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
  let reportRoot;
  for (const [name, counts] of Object.entries(summary)) {
    if (name === 'total') continue;
    const normalized = name.replaceAll('\\', '/');
    const segments = normalized.replace(/^(?:[a-z]:)?\//i, '').split('/');
    if ([...normalized].some(character => character < ' ' || character === '\u007f') || segments.some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe coverage summary path');
    const matches = evidence.files.filter(file => normalized === file.path || normalized.endsWith('/' + file.path));
    if (matches.length !== 1 || byFile.has(matches[0].path)) throw new Error('Coverage payload file inventory mismatch');
    const file = matches[0].path;
    const prefix = normalized.slice(0, normalized.length - file.length);
    reportRoot ??= prefix;
    if (reportRoot !== prefix) throw new Error('Coverage summary uses multiple source roots');
    const component = componentOf(file);
    if (!component) throw new Error('Coverage file is outside the declared scope');
    const values = { sha256: matches[0].sha256, lines: metric(counts.lines), branches: metric(counts.branches) };
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
  const sourceConfig = configurationAt(root, evidence.source.commit);
  const configuration = {
    captured: [...evidence.configuration].sort((a, b) => a.path.localeCompare(b.path)),
    sourceTree: sourceConfig.files,
  };
  return { components, byFile, tracked: trackedSources(root, evidence.source.commit), configuration, unresolvedConfiguration: sourceConfig.unresolved };
}

function componentScope(name, before, after) {
  const filesFor = files => [...files].filter(file => componentOf(file) === name).sort();
  const sides = [before, after].map(side => ({
    measured: filesFor(side.byFile.keys()),
    omitted: filesFor([...side.tracked].filter(file => !side.byFile.has(file))),
  }));
  return {
    before: sides[0], after: sides[1],
    addedSource: filesFor([...after.tracked].filter(file => !before.tracked.has(file))),
    removedSource: filesFor([...before.tracked].filter(file => !after.tracked.has(file))),
    newlyInstrumented: sides[1].measured.filter(file => before.tracked.has(file) && !before.byFile.has(file)),
    noLongerInstrumented: sides[0].measured.filter(file => after.tracked.has(file) && !after.byFile.has(file)),
  };
}

const delta = (before, after) => ({
  coveredDelta: after.covered - before.covered,
  totalDelta: after.total - before.total,
  percentagePointDelta: before.percent === null || after.percent === null ? null : after.percent - before.percent,
});

function likeForLike(kind, scope, before, after) {
  const files = [], lossFiles = [];
  const excluded = { changedSource: [], changedDenominator: [], zeroDenominator: [] };
  const oldCounts = { covered: 0, total: 0 }, newCounts = { covered: 0, total: 0 };
  for (const file of scope.before.measured) {
    const old = before.byFile.get(file), next = after.byFile.get(file);
    if (!next) continue;
    if (old.sha256 !== next.sha256) excluded.changedSource.push(file);
    else if (old[kind].total !== next[kind].total) excluded.changedDenominator.push(file);
    else if (!old[kind].total) excluded.zeroDenominator.push(file);
    else {
      files.push(file);
      if (next[kind].covered < old[kind].covered) lossFiles.push(file);
      oldCounts.covered += old[kind].covered;
      oldCounts.total += old[kind].total;
      newCounts.covered += next[kind].covered;
      newCounts.total += next[kind].total;
    }
  }
  const complete = [scope.before, scope.after].every(side => !side.omitted.length && side.measured.length === files.length);
  const old = metric(oldCounts), next = metric(newCounts);
  return {
    status: !files.length ? 'unavailable' : complete ? 'compared' : 'partial',
    files, excluded, before: old, after: next,
    ...(files.length ? delta(old, next) : { coveredDelta: null, totalDelta: null, percentagePointDelta: null }),
    lossFiles, regressionEvidence: lossFiles.length ? 'loss-observed' : files.length && complete ? 'no-loss-observed' : 'unknown',
  };
}

/** Compare retained evidence to its own source revision before comparing counts. */
export function compareCoverage(root, current, summaryBytes, baselineDirectory) {
  const unknown = (status, reason) => ({ baseline: { status, reason }, comparison: { status: 'unknown', reason } });
  if (!baselineDirectory) return unknown('unavailable', 'No successful retained ancestor baseline was selected');
  try {
    const directory = path.resolve(baselineDirectory);
    if (!fs.lstatSync(directory).isDirectory() || path.relative(directory, fs.realpathSync.native(directory))) return unknown('invalid', 'Baseline directory must not be aliased');
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
    const unresolved = before.unresolvedConfiguration ?? after.unresolvedConfiguration;
    if (unresolved) return unknown('incompatible', 'TypeScript transform configuration resolution is unsupported: ' + unresolved);
    if (baseline.tool.version !== current.tool.version || baseline.tool.sha256 !== current.tool.sha256 || JSON.stringify(before.configuration) !== JSON.stringify(after.configuration)
      || baseline.runtime?.node !== current.runtime?.node) return unknown('incompatible', 'Reporting tool, configuration, instrumentation dependencies or Node version changed');
    const addedFiles = [...after.byFile.keys()].filter(file => !before.byFile.has(file));
    const removedFiles = [...before.byFile.keys()].filter(file => !after.byFile.has(file));
    const files = new Set([...addedFiles, ...removedFiles]);
    const beforeGroups = new Map(before.components.map(group => [group.name, group]));
    const afterGroups = new Map(after.components.map(group => [group.name, group]));
    const names = new Set([...before.tracked, ...after.tracked].map(componentOf));
    const components = [...names].sort().map(name => {
      const old = beforeGroups.get(name), next = afterGroups.get(name);
      const scope = componentScope(name, before, after);
      const scopeChanged = [...files].some(file => componentOf(file) === name);
      const result = {
        name, status: !old && !next ? 'unmeasured' : !old ? 'added' : !next ? 'removed' : scopeChanged ? 'scope-changed' : 'compared',
        before: old ?? null, after: next ?? null, scope,
        likeForLike: { lines: likeForLike('lines', scope, before, after), branches: likeForLike('branches', scope, before, after) },
      };
      if (old && next) for (const kind of ['lines', 'branches']) result[kind] = delta(old[kind], next[kind]);
      return result;
    });
    return {
      baseline: { status: 'verified', commit: baseline.source.commit, run: baseline.execution.run, policy: selection.policy },
      comparison: { status: files.size ? 'scope-changed' : 'compared', configuration: after.configuration, components, addedFiles, removedFiles,
        exclusions: ['tests', 'node_modules', 'non-TypeScript files', 'files absent from either summary'],
        losses: components.filter(component => component.status === 'removed' || ['lines', 'branches'].some(kind => component[kind]?.coveredDelta < 0 || component[kind]?.percentagePointDelta < 0)).map(component => component.name),
        likeForLikeLosses: components.filter(component => ['lines', 'branches'].some(kind => component.likeForLike[kind].lossFiles.length)).map(component => component.name),
        thresholds: 'informative-only', limitations: 'Like-for-like coverage requires identical source bytes and matching positive denominators. Observed deltas describe both measured scopes. Counts do not prove rule accuracy.' },
    };
  } catch (error) {
    if (error.code === 'ENOENT') return unknown('unavailable', 'A required coverage evidence input is missing');
    return unknown('invalid', error instanceof SyntaxError ? 'Malformed coverage evidence' : error.message);
  }
}
