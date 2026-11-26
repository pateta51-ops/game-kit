import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, lstatSync, mkdtempSync, openSync, readlinkSync, readSync, rmSync } from 'node:fs';
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

export function workingTreeSha256(root: string, tree: string): string {
  const entries = execFileSync('git', ['ls-tree', '-rz', '--full-tree', tree], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
  const prefix = Buffer.from(path.resolve(root) + path.sep), buffer = Buffer.allocUnsafe(64 * 1024);
  const hash = createHash('sha256');
  for (let start = 0; start < entries.length;) {
    const end = entries.indexOf(0, start), tab = entries.indexOf(9, start);
    if (end < 0 || tab < start || tab >= end) throw new Error('Git returned an invalid tracked source path');
    hash.update(entries.subarray(start, end + 1));
    const mode = entries.toString('ascii', start, start + 6);
    const file = Buffer.concat([prefix, entries.subarray(tab + 1, end)]);
    start = end + 1;
    if (mode === '160000') {
      hash.update('gitlink\0');
      continue;
    }
    const stat = lstatSync(file);
    const content = createHash('sha256');
    if (stat.isSymbolicLink()) {
      hash.update('symlink\0');
      content.update(readlinkSync(file, { encoding: 'buffer' }));
    } else if (stat.isFile()) {
      hash.update(`file:${String(stat.mode & 0o111)}\0`);
      const fd = openSync(file, 'r');
      try {
        for (let size: number; (size = readSync(fd, buffer)) > 0;) content.update(buffer.subarray(0, size));
      } finally {
        closeSync(fd);
      }
    } else throw new Error('Tracked source must be a regular file, link or gitlink');
    hash.update(content.digest());
  }
  return hash.digest('hex');
}
