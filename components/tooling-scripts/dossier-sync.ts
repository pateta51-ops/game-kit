// Copies the files git tracks in a source repository (a dossier) into a folder of this one and records the source commit
// in its SYNC.md. The old copy is replaced, so a file the source dropped disappears here too. Needs git.
// Exit codes: 0 done, 2 usage or a source that is not a clean git checkout.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, parse, relative, resolve } from 'node:path';
import { flags, isMain, stdio, type Io } from './args.ts';

const git = (cwd: string, args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });

/** The tracked files to copy, as forward-slash paths relative to the source root. */
export function filesToCopy(tracked: readonly string[], exclude: readonly string[]): string[] {
  return tracked.filter((file) => file !== '' && !exclude.includes(file));
}

/** The text of SYNC.md. */
export function syncNote(source: { name: string; commit: string; subject: string; branch: string }, count: number, exclude: readonly string[]): string {
  return `# Sync

This folder is a copy of ${source.name}, made by dossier-sync. Change the source, never this copy.

- Source commit: \`${source.commit}\` (${source.branch}): ${source.subject}
- Files copied: ${String(count)}
${exclude.length > 0 ? `- Left out: ${exclude.map((file) => `\`${file}\``).join(', ')}\n` : ''}`;
}

const USAGE = 'usage: node dossier-sync.ts --source <git checkout> --target <dir> [--exclude <path>]... [--name <what the source is called>] [--config <json>]';

export function run(args: readonly string[], io: Io = stdio): number {
  try {
    const f = flags(args, ['source', 'target', 'exclude', 'name']);
    const src = f?.['source']?.[0];
    const to = f?.['target']?.[0];
    if (f === null || src === undefined || to === undefined) {
      io.err(USAGE);
      return 2;
    }
    const source = resolve(src);
    const target = resolve(to);
    const exclude = f['exclude'] ?? [];
    const holds = (child: string): boolean => {
      const r = relative(target, resolve(child));
      return r === '' || (!r.startsWith('.'.repeat(2)) && !isAbsolute(r));
    };
    if (target === parse(target).root || holds(source) || holds(process.cwd()) || holds(homedir())) {
      io.err(`dossier-sync: refusing to replace ${target}: it is, or contains, the source, the current folder, the home folder or a root`);
      return 2;
    }
    if (!existsSync(join(source, '.git'))) {
      io.err(`dossier-sync: ${source} is not a git checkout`);
      return 2;
    }
    if (git(source, ['status', '--porcelain', '--untracked-files=no']).trim() !== '') {
      io.err(`dossier-sync: ${source} has uncommitted changes; commit or stash them first, so SYNC.md names the real source`);
      return 2;
    }
    const commit = git(source, ['rev-parse', 'HEAD']).trim();
    const subject = git(source, ['log', '-1', '--format=%s']).trim();
    const branch = git(source, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    const files = filesToCopy(git(source, ['ls-files', '-z']).split('\0'), exclude).filter((file) => !lstatSync(join(source, file)).isSymbolicLink());
    rmSync(target, { recursive: true, force: true });
    for (const file of files) {
      mkdirSync(dirname(join(target, file)), { recursive: true });
      cpSync(join(source, file), join(target, file));
    }
    writeFileSync(join(target, 'SYNC.md'), syncNote({ name: f['name']?.[0] ?? 'the source repository', commit, subject, branch }, files.length, exclude));
    io.out(`dossier-sync: ${String(files.length)} files at ${commit.slice(0, 7)} into ${to}`);
    return 0;
  } catch (error) {
    io.err(`dossier-sync: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (isMain(import.meta.url)) process.exitCode = run(process.argv.slice(2));
