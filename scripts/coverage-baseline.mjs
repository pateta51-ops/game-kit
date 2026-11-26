import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function eligibleRuns(runs, repository, head, ancestor) {
  return runs.filter(run => run.status === 'completed' && run.conclusion === 'success' && run.event === 'push' && run.head_branch === 'main'
    && run.path === '.github/workflows/ci.yml' && run.repository?.full_name === repository && run.head_sha !== head
    && /^[a-f0-9]{40}$/.test(run.head_sha) && Number.isSafeInteger(run.id) && Number.isSafeInteger(run.run_attempt) && ancestor(run.head_sha, head))
    .sort((a, b) => b.id - a.id);
}

export function retainedArtifact(artifacts, run) {
  const expected = `coverage-${run.head_sha}-${run.id}-${run.run_attempt}`;
  const matches = artifacts.filter(artifact => artifact.name === expected && artifact.expired === false
    && artifact.workflow_run?.id === run.id && artifact.workflow_run.head_sha === run.head_sha
    && /^sha256:[a-f0-9]{64}$/.test(artifact.digest ?? '') && Number.isSafeInteger(artifact.id));
  return matches.length === 1 ? matches[0] : null;
}

function select(output) {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('GITHUB_REPOSITORY is required');
  const dir = path.resolve(output);
  fs.mkdirSync(dir); // A prior selection must never be reused after a failed retrieval.
  const save = value => fs.writeFileSync(path.join(dir, 'selection.json'), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  const api = endpoint => execFileSync('gh', ['api', '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2026-03-10', endpoint], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const ancestors = (before, after) => { try { execFileSync('git', ['merge-base', '--is-ancestor', before, after], { stdio: 'pipe' }); return true; } catch { return false; } };
    const input = JSON.parse(api(`repos/${repository}/actions/workflows/ci.yml/runs?branch=main&event=push&status=success&per_page=100`).toString());
    const candidates = eligibleRuns(input.workflow_runs, repository, head, ancestors);
    for (const candidate of candidates) {
      const run = JSON.parse(api(`repos/${repository}/actions/runs/${candidate.id}`).toString());
      if (eligibleRuns([run], repository, head, ancestors).length !== 1 || run.run_attempt !== candidate.run_attempt) continue;
      const listed = JSON.parse(api(`repos/${repository}/actions/runs/${run.id}/artifacts?per_page=100`).toString());
      const artifact = retainedArtifact(listed.artifacts, run);
      if (!artifact) continue;
      const archive = api(`repos/${repository}/actions/artifacts/${artifact.id}/zip`);
      if ('sha256:' + createHash('sha256').update(archive).digest('hex') !== artifact.digest) throw new Error('Artifact digest mismatch');
      const file = path.join(dir, 'artifact.zip');
      fs.writeFileSync(file, archive, { flag: 'wx' });
      execFileSync('python3', ['-c', `import sys,zipfile,pathlib
root=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(root/'artifact.zip') as z:
    for name in ['coverage-evidence.json','coverage-summary.json']:
        entries=[i for i in z.infolist() if i.filename==name]
        if len(entries)!=1 or entries[0].file_size>32*1024*1024: raise ValueError('Missing, repeated or oversized evidence member')
        with (root/name).open('xb') as out: out.write(z.read(entries[0]))
`, dir], { stdio: 'pipe' });
      save({ version: 1, status: 'selected', policy: 'successful-main-ancestor', repository, run: {
        id: run.id, run_attempt: run.run_attempt, event: run.event, head_branch: run.head_branch, conclusion: run.conclusion,
        status: run.status, head_sha: run.head_sha, path: run.path, repository: { full_name: run.repository.full_name },
      }, artifact: { id: artifact.id, name: artifact.name, digest: artifact.digest }, limits: 'Newest eligible retained run among the latest 100 successful main pushes; payload verification occurs in coverage-table.' });
      console.log(`Selected retained ancestor ${run.head_sha}; payload verification is pending`);
      return;
    }
    save({ version: 1, status: 'unavailable', reason: 'No retained eligible ancestor in the latest 100 successful main pushes' });
  } catch {
    save({ version: 1, status: 'unavailable', reason: 'Baseline retrieval or archive verification failed; no comparison is claimed' });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('usage: node scripts/coverage-baseline.mjs <new-output-directory>');
    select(process.argv[2]);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
