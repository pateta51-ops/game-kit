// A cache of the costly art (fetched and rendered pictures) for CI, keyed on the hashes of what the art is made from.
// Never GitHub's cache service: a plain folder on the runner. Config: { cache, inputs: [files or folders], paths: [folders to keep], extra?: "text", version?: 1 }.
//   key      prints the key: SHA-256 of every input file's relative path and content, the extra text and the version
//   restore  copies `<cache>/<key>/` back into `paths`; prints hit or miss; `--require` makes a miss exit 1
//   save     copies `paths` into `<cache>/<key>/` (a new folder renamed into place; an existing key is left alone)
// Exit 0, 1 on a required miss, 2 usage.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { isMain, stdio, type Io } from '../tooling-scripts/args.ts';
import { fail, load, posix, sha256 } from './lib.ts';

const files = (p: string): string[] => {
  if (!existsSync(p)) return [];
  if (statSync(p).isFile()) return [p];
  return readdirSync(p, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
};

export function cacheKey(base: string, inputs: readonly string[], extra = '', version = 1): string {
  const lines: string[] = [];
  for (const i of inputs) {
    const p = resolve(base, i);
    for (const f of files(p).sort()) lines.push(`${posix(relative(base, f))}\0${statLike(f)}`);
  }
  return sha256(`${String(version)}\0${extra}\0${lines.join('\n')}`);
}
const statLike = (f: string): string => (existsSync(f) ? sha256(readFileSync(f)) : 'missing');
const slot = (p: string): string => encodeURIComponent(posix(p));

const USAGE = 'usage: node art-ci-cache.ts key|restore|save --config <json> [--require]';

export function run(args: readonly string[], io: Io = stdio): number {
  try {
    const l = load(args, ['require']);
    const cmd = l?.pos[0];
    if (l === null || !['key', 'restore', 'save'].includes(cmd ?? '')) {
      io.err(USAGE);
      return 2;
    }
    const c = l.config as { cache: string; inputs: string[]; paths: string[]; extra?: string; version?: number };
    const key = cacheKey(l.dir, c.inputs, c.extra, c.version);
    const dir = join(resolve(l.dir, c.cache), key);
    if (cmd === 'key') io.out(key);
    else if (cmd === 'restore') {
      if (!existsSync(dir)) {
        io.out(`art-ci-cache: miss ${key}`);
        return l.bools.has('require') ? 1 : 0;
      }
      for (const p of c.paths) if (existsSync(join(dir, slot(p)))) cpSync(join(dir, slot(p)), resolve(l.dir, p), { recursive: true, force: true });
      io.out(`art-ci-cache: hit ${key}`);
    } else if (existsSync(dir)) io.out(`art-ci-cache: ${key} already saved`);
    else {
      const tmp = `${dir}.tmp-${String(process.pid)}`;
      rmSync(tmp, { recursive: true, force: true });
      mkdirSync(tmp, { recursive: true });
      for (const p of c.paths) if (existsSync(resolve(l.dir, p))) cpSync(resolve(l.dir, p), join(tmp, slot(p)), { recursive: true });
      renameSync(tmp, dir);
      io.out(`art-ci-cache: saved ${key}`);
    }
    return 0;
  } catch (e) {
    return fail(io, 'art-ci-cache', e);
  }
}

if (isMain(import.meta.url)) process.exitCode = run(process.argv.slice(2));
