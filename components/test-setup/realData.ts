// Real-data suite setup (vitest `globalSetup`): build or load the game's real pack once per run, cache it as JSON in the temp
// folder, and skip with a clear message when the private pack is missing. Node only.
// globalSetup file of the game:
//   import { realDataSetup } from 'kit/test-setup/realData.ts';
//   export default realDataSetup({ name: 'pack', dir: 'content/private', build: () => buildMyPack() });
// in a test:  const pack = loadRealData<MyPack>('pack', 'content/private');  describe.skipIf(!pack)('real pack', () => { ... });
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

export interface RealDataSpec {
  /** cache name: the file is `<tmp>/kit-realdata/<name>-<hash of the resolved dir>.json`, so one name over two dirs does not collide */
  name: string;
  /** the private pack's folder; when absent the setup skips (a warning, or a failure when `requireInCI` and CI is set) */
  dir: string;
  /** builds the data; it must be JSON-serialisable */
  build: () => unknown;
  /** change it when the build function or its options change: it is part of the cache key */
  version?: string;
  requireInCI?: boolean;
  tmp?: string;
}
export type RealDataStatus = 'built' | 'cached' | 'skipped';

export const realDataFile = (name: string, dir: string, tmp = tmpdir()): string =>
  join(tmp, 'kit-realdata', `${name}-${createHash('sha1').update(resolve(dir)).digest('hex').slice(0, 10)}.json`);

const files = (p: string): string[] => (statSync(p).isDirectory() ? readdirSync(p).sort().flatMap((f) => files(join(p, f))) : [p]);
/** Hash of every input file's path, size and mtime, and of the build version. */
const fingerprint = (dir: string, version = ''): string => {
  const h = createHash('sha1').update(version);
  for (const f of files(dir)) {
    const s = statSync(f);
    h.update(`${relative(dir, f)}:${s.size}:${s.mtimeMs}\n`);
  }
  return h.digest('hex');
};

/** Build once; reuse the cache while the fingerprint of every file under `dir` (and `version`) is unchanged. */
export async function ensureRealData(spec: RealDataSpec): Promise<{ status: RealDataStatus; file: string; message: string }> {
  const file = realDataFile(spec.name, spec.dir, spec.tmp);
  if (!existsSync(spec.dir)) {
    const message = `real-data '${spec.name}': ${spec.dir} is missing, the real-data tests skip`;
    if (spec.requireInCI && process.env['CI']) throw new Error(`${message} (not allowed under CI)`);
    return { status: 'skipped', file, message };
  }
  const fp = fingerprint(spec.dir, spec.version);
  if (existsSync(file) && (JSON.parse(readFileSync(file, 'utf8')) as { fp?: string }).fp === fp) return { status: 'cached', file, message: `real-data '${spec.name}': cached at ${file}` };
  mkdirSync(dirname(file), { recursive: true });
  const part = `${file}.${process.pid}.tmp`;
  writeFileSync(part, JSON.stringify({ fp, data: await spec.build() }));
  renameSync(part, file);
  return { status: 'built', file, message: `real-data '${spec.name}': built to ${file}` };
}

/** The default export of a game's globalSetup file. */
export const realDataSetup = (spec: RealDataSpec) => async (): Promise<void> => {
  const r = await ensureRealData(spec);
  if (r.status === 'skipped') console.warn(r.message);
};

/** In a test: the cached data, or null when the setup skipped (use with `describe.skipIf(!data)`). `dir` is the same as in the spec. */
export function loadRealData<T>(name: string, dir: string, tmp?: string): T | null {
  const file = realDataFile(name, dir, tmp);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { data: T }).data : null;
}
