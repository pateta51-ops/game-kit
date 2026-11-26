import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { matchesTrackedTree, workingTreeSha256 } from '../components/check-runner/tracked-source.ts';

const windows = [
  { match: /rejects Windows path aliases before replacing a release:.*PUBLIC\/ART\/OLD\.PNG/, count: 1 },
  { match: /rejects Windows path aliases before replacing a release:.*CHOSEN\/OLD\.PNG\./, count: 1 },
  { match: /rejects Windows path aliases before replacing a release:.*CHOSEN\.PUBLISH-NEXT/, count: 1 },
  { match: /rejects a case alias of the coverage directory before removing coverage$/, count: 1 },
  { match: /rejects mixed-case Windows aliases for protected directories$/, count: 1 },
];
const pdf = [{ match: /renders a generated one-page PDF with pdf\.js$/, count: 1 }];
export function executedCases(result, suite) {
  const expected = suite === 'windows' ? windows : suite === 'pdf' ? pdf : null;
  if (!expected || !Array.isArray(result?.testResults)) throw new Error('Missing or invalid platform test report');
  const assertions = result.testResults.flatMap(test => test.assertionResults ?? []);
  const cases = [];
  for (const required of expected) {
    const matches = assertions.filter(test => required.match.test(test.fullName ?? ''));
    if (matches.length !== required.count || matches.some(test => test.status !== 'passed')) throw new Error('Required case did not execute and pass: ' + required.match.source);
    cases.push(...matches.map(test => ({ name: test.fullName, status: test.status })));
  }
  return cases;
}

function run(suite, destination) {
  if (!['windows', 'pdf'].includes(suite)) throw new Error('Unknown platform suite');
  if (suite === 'windows' && process.platform !== 'win32') throw new Error('Windows cases require a real Windows runner');
  const dependencies = suite === 'pdf' ? ['pdfjs-dist', '@napi-rs/canvas'] : [];
  const versions = Object.fromEntries(dependencies.map(name => [name, JSON.parse(fs.readFileSync(path.join('node_modules', name, 'package.json'), 'utf8')).version]));
  const output = path.resolve(destination);
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const tree = execFileSync('git', ['rev-parse', commit + '^{tree}'], { encoding: 'utf8' }).trim();
  const clean = () => execFileSync('git', ['--no-optional-locks', 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim() === '' && matchesTrackedTree(process.cwd(), tree);
  if (!clean()) throw new Error('Platform cases require clean source matching the recorded commit');
  const working = workingTreeSha256(process.cwd(), tree);
  const evidence = { version: 1, sourceCommit: commit, sourceTree: tree, sourceBinding: 'pending', workingSha256: working, suite, platform: process.platform, node: process.version, dependencies: versions, status: 'not-run', cases: [] };
  fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
  const raw = output + '.vitest.json';
  if (fs.existsSync(raw)) throw new Error('Raw test output already exists; use a fresh destination');
  const files = suite === 'windows' ? ['components/art-pipeline/publication.test.ts', 'tests/coverage-table.test.ts', 'tools/kit-context/brief.test.mjs'] : ['components/art-pipeline/art-pipeline.test.ts'];
  const pattern = suite === 'windows' ? 'rejects Windows path aliases before replacing a release|rejects a case alias of the coverage directory before removing coverage|rejects mixed-case Windows aliases for protected directories' : 'renders a generated one-page PDF with pdf';
  const command = ['node_modules/vitest/vitest.mjs', 'run', ...files, '--coverage.enabled=false', '--testNamePattern', pattern, '--reporter=json', '--outputFile', raw];
  const child = spawnSync(process.execPath, command, { stdio: 'inherit' });
  let error;
  try {
    evidence.cases = executedCases(JSON.parse(fs.readFileSync(raw, 'utf8')), suite);
    if (child.status !== 0) throw new Error('Platform test command failed');
    if (!clean() || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== commit || workingTreeSha256(process.cwd(), tree) !== working) {
      evidence.sourceBinding = 'stale';
      throw new Error('Platform source changed during execution');
    }
    evidence.sourceBinding = 'matched';
    evidence.status = 'passed';
  } catch (failure) { evidence.status = 'failed'; error = failure.message; }
  fs.writeFileSync(output, JSON.stringify({ ...evidence, command, exitCode: child.status, ...(error ? { error } : {}) }, null, 2) + '\n');
  if (error) throw new Error(error);
  console.log(`${suite}: ${evidence.cases.length} required cases executed at ${commit}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4) throw new Error('usage: node scripts/platform-cases.mjs <windows|pdf> <new-report.json>');
    run(process.argv[2], process.argv[3]);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
