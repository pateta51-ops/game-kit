import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export function matchesTrackedTree(root: string, tree: string): boolean {
  const directory = mkdtempSync(path.join(tmpdir(), 'kit-tracked-source-'));
  try {
    const options = { cwd: root, env: { ...process.env, GIT_INDEX_FILE: path.join(directory, 'index') }, stdio: 'ignore' } as const;
    const config = ['-c', 'core.splitIndex=false', '-c', 'core.sparseCheckout=false', '-c', 'core.fsmonitor=false', '-c', 'core.ignoreStat=false'];
    execFileSync('git', [...config, 'read-tree', tree], options);
    const result = spawnSync('git', [...config, 'update-index', '--really-refresh'], options);
    if (result.status === 1) return false;
    if (result.status !== 0) throw new Error('Git could not verify tracked source', { cause: result.error });
    return true;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
