// Bundles headless Node scripts (a simulator, its worker thread, benches) with esbuild into plain .mjs files, so they run
// on `node` instead of a loader. No keepNames: a loader's transform keeps every function's name with a helper call on each closure
// it creates, which cost about a quarter of a simulator's time. Keep --outdir as deep under the root as the entries are
// (scripts/x.ts -> .bundle/node/x.mjs), so paths the scripts build from import.meta.url still resolve. Packages stay
// external. Needs the game's `esbuild`. Exit codes: 0 done, 2 usage or a failed build.
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { flags, isMain, stdio, type Io } from './args.ts';

const USAGE = 'usage: node bundle-node.ts --entry <file>... --outdir <dir> [--root .] [--target node22] [--config <json>]';

export async function run(args: readonly string[], io: Io = stdio): Promise<number> {
  try {
    const f = flags(args, ['entry', 'outdir', 'root', 'target']);
    const entry = f?.['entry'];
    const outdir = f?.['outdir']?.[0];
    if (f === null || entry === undefined || outdir === undefined) {
      io.err(USAGE);
      return 2;
    }
    await build({
      absWorkingDir: resolve(f['root']?.[0] ?? '.'),
      entryPoints: entry,
      outdir,
      entryNames: '[name]',
      outExtension: { '.js': '.mjs' },
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: f['target']?.[0] ?? 'node22',
      packages: 'external',
      sourcemap: 'linked',
      logLevel: 'silent',
    });
    io.out(`bundle-node: ${String(entry.length)} entries into ${outdir}`);
    return 0;
  } catch (error) {
    io.err(`bundle-node: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (isMain(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
