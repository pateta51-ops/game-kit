// Play locally: rebuild the production build only when its inputs changed, then serve it and open the browser.
// Inputs (files or folders, repeatable) are hashed (names + bytes) and compared with the stamp written after the last good build.
// The port comes from `--port` (or `port` in --config), never from here; `{port}` in --serve is replaced by it.
// Exit codes: 0 served and stopped, 2 usage, the build's own code when it fails.
import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { flags, isMain, stdio, type Io } from './args.ts';

export function hashInputs(root: string, inputs: readonly string[]): string {
  const h = createHash('sha256');
  const walk = (rel: string): void => {
    const p = join(root, rel);
    if (!existsSync(p)) return;
    if (statSync(p).isDirectory()) {
      for (const n of readdirSync(p).filter((x) => x !== 'node_modules' && x !== '.git').sort()) walk(join(rel, n));
    } else h.update(rel.replace(/\\/g, '/')).update('\0').update(readFileSync(p)).update('\0');
  };
  const env = ['.env', '.env.local', '.env.production', '.env.production.local'];
  for (const i of [...new Set([...inputs, ...env])].sort()) walk(i);
  try {
    const git = (...a: string[]): Buffer => execFileSync('git', a, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 128 * 1024 * 1024 });
    h.update(git('rev-parse', 'HEAD')).update(git('diff', '--no-ext-diff', '--binary', 'HEAD', '--', ...inputs));
  } catch { /* not a git repository */ }
  return h.digest('hex');
}

/** True when the build must run: no stamp, no built file, or a stamp that differs from the inputs' hash. */
export function isStale(root: string, inputs: readonly string[], stamp: string, built?: string): boolean {
  const s = join(root, stamp);
  if (built !== undefined && !existsSync(join(root, built))) return true;
  return !existsSync(s) || readFileSync(s, 'utf8') !== hashInputs(root, inputs);
}

export interface Deps {
  build: (cmd: string, cwd: string) => number;
  serve: (cmd: string, cwd: string) => Promise<number>;
  open: (url: string) => void;
}
export const realDeps: Deps = {
  build: (cmd, cwd) => spawnSync(cmd, { cwd, shell: true, stdio: 'inherit' }).status ?? 1,
  serve: (cmd, cwd) => new Promise((res) => spawn(cmd, { cwd, shell: true, stdio: 'inherit' }).on('exit', (c) => res(c ?? 0))),
  open: (url) => {
    const [c, a] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    spawn(c, a, { stdio: 'ignore', detached: true }).on('error', () => undefined).unref();
  },
};

const USAGE = 'usage: node launch.ts --input <path>... --build <cmd> --serve <cmd with {port}> --port <n> [--stamp .launch-stamp] [--built dist/index.html] [--root .] [--no-open] [--config <json>] [-- extra server args]';

export async function run(args: readonly string[], io: Io = stdio, deps: Deps = realDeps): Promise<number> {
  try {
    const cut = args.indexOf('--');
    const extra = cut < 0 ? [] : args.slice(cut + 1);
    const f = flags(cut < 0 ? args : args.slice(0, cut), ['input', 'build', 'serve', 'port', 'stamp', 'built', 'root'], ['no-open']);
    const inputs = f?.['input'];
    const build = f?.['build']?.[0];
    const serve = f?.['serve']?.[0];
    const port = f?.['port']?.[0];
    if (f === null || !inputs?.length || build === undefined || serve === undefined || port === undefined || !/^\d+$/.test(port)) {
      io.err(USAGE);
      return 2;
    }
    const root = resolve(f['root']?.[0] ?? '.');
    const stamp = f['stamp']?.[0] ?? '.launch-stamp';
    const built = f['built']?.[0];
    if (isStale(root, inputs, stamp, built)) {
      io.out('Inputs changed: building.');
      mkdirSync(dirname(join(root, stamp)), { recursive: true });
      writeFileSync(join(root, stamp), '');
      const code = deps.build(build, root);
      if (code !== 0) return code;
      writeFileSync(join(root, stamp), hashInputs(root, inputs));
    } else io.out('Inputs unchanged: reusing the build.');
    const url = `http://localhost:${port}`;
    io.out(`Serving ${url}`);
    if (f['no-open'] === undefined) deps.open(url);
    return await deps.serve([serve.replace(/\{port\}/g, port), ...extra].join(' '), root);
  } catch (e) {
    io.err(`error: ${(e as Error).message}`);
    return 2;
  }
}

if (isMain(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
