import { describe, expect, it } from 'vitest';
import { eligibleRuns, retainedArtifact } from '../scripts/coverage-baseline.mjs';

const commit = 'a'.repeat(40), head = 'b'.repeat(40);
const run = { id: 100, run_attempt: 2, status: 'completed', conclusion: 'success', event: 'push', head_branch: 'main', path: '.github/workflows/ci.yml', repository: { full_name: 'project/game-kit' }, head_sha: commit };
const artifact = { id: 10, name: `coverage-${commit}-100-2`, expired: false, workflow_run: { id: 100, head_sha: commit }, digest: 'sha256:' + 'c'.repeat(64) };
describe('retained coverage selection policy', () => {
  it('selects only a successful same-repository main-push ancestor', () => {
    expect(eligibleRuns([run], 'project/game-kit', head, () => true)).toEqual([run]);
    expect(eligibleRuns([run], 'project/game-kit', head, () => false)).toEqual([]);
    expect(eligibleRuns([{ ...run, event: 'pull_request' }, { ...run, conclusion: 'failure' }, { ...run, head_branch: 'topic' }, { ...run, head_sha: head }], 'project/game-kit', head, () => true)).toEqual([]);
    expect(eligibleRuns([run], 'another/game-kit', head, () => true)).toEqual([]);
  });
  it('requires unique retained payload metadata as well as the artifact name', () => {
    expect(retainedArtifact([artifact], run)).toEqual(artifact);
    expect(retainedArtifact([{ ...artifact, workflow_run: { id: 101, head_sha: commit } }], run)).toBeNull();
    expect(retainedArtifact([{ ...artifact, digest: '' }], run)).toBeNull();
    expect(retainedArtifact([{ ...artifact, expired: true }], run)).toBeNull();
    expect(retainedArtifact([artifact, { ...artifact, id: 11 }], run)).toBeNull();
  });
});
