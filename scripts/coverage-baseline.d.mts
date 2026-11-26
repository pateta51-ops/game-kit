interface Run {
  id: number; run_attempt: number; status: string; conclusion: string; event: string;
  head_branch: string; path: string; repository: { full_name: string }; head_sha: string;
}
interface Artifact {
  id: number; name: string; expired: boolean; workflow_run: { id: number; head_sha: string }; digest: string;
}
export function eligibleRuns(runs: Run[], repository: string, head: string, ancestor: (before: string, after: string) => boolean): Run[];
export function retainedArtifact(artifacts: Artifact[], run: Run): Artifact | null;
