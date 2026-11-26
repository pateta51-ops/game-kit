import { spawnSync } from 'node:child_process';

// The installed dependency link is a local root path. Its index mode works even with a missing target.
const index = spawnSync('git', ['ls-files', '-s', '-z', '--', 'node_modules'], { encoding: 'utf8' });
if (index.status === 0 && index.stdout.split('\0').some(entry =>
  entry.startsWith('120000 ') && entry.split('\t')[1] === 'node_modules')) {
  console.error('node_modules:0: DEPENDENCY_LINK ignore node_modules and run git rm --cached -- node_modules');
  process.exitCode = 1;
}
