// The service worker's precache (runs in node, at build time). After `vite build`, the plugin writes the kit's sw.js into
// the build with the list of files to keep offline and a version made from their contents: a build whose files change
// gives a different sw.js, so the browser installs it beside the running one and the page offers the update.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

export interface PrecacheOptions {
  /** Start of the cache names, one per game (activate deletes the older caches with this prefix only). */
  readonly prefix: string;
  /**
   * Folders of the build (POSIX, relative to its root) to keep besides the app. When given, a file in a folder is kept
   * only under `appDir` or one of these; files at the build's root are always kept. When left out, every file is kept.
   */
  readonly assets?: readonly string[];
  /** The bundler's folder of scripts and styles (Vite's `build.assetsDir`, default `assets`). */
  readonly appDir?: string;
  /** Files never kept, besides sw.js and `.vite/`. */
  readonly exclude?: readonly RegExp[];
}

export const SW_FILE = 'sw.js';
export const PLACEHOLDER = /\/\*PRECACHE\*\/[^]*?\/\*END\*\//;
const ALWAYS_OUT = [/^sw\.js$/, /^\.vite\//];

export interface Precache {
  readonly prefix: string;
  /** A hash of every listed file's path and contents. */
  readonly version: string;
  /** Relative to the service worker's scope (the build's root), POSIX, sorted. */
  readonly files: readonly string[];
}

const under = (f: string, dir: string): boolean => f.startsWith(`${dir.replace(/^\.?\/+|\/+$/g, '')}/`);

/** The build's files to keep: POSIX paths relative to the build's root, sorted, exclusions out. */
export function precacheList(files: readonly string[], o: PrecacheOptions): string[] {
  const out = [...ALWAYS_OUT, ...(o.exclude ?? [])];
  const keep = (f: string): boolean =>
    o.assets === undefined || !f.includes('/') || [o.appDir ?? 'assets', ...o.assets].some((d) => under(f, d));
  const posix = files.map((f) => f.split(sep).join('/').replace(/^\.\//, ''));
  return [...new Set(posix)].filter((f) => f !== '' && keep(f) && !out.some((x) => x.test(f))).sort();
}

/** The first 16 hex digits of a SHA-256 over each file's path and content hash (order-free). */
export function cacheVersion(entries: ReadonlyArray<readonly [path: string, sha256: string]>): string {
  const lines = [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([p, h]) => `${p} ${h}\n`);
  return createHash('sha256').update(lines.join('')).digest('hex').slice(0, 16);
}

export const cacheName = (p: Precache): string => `${p.prefix}${p.version}`;

/** sw.js with the precache written in place of its placeholder; throws when the placeholder is missing. */
export function injectPrecache(source: string, p: Precache): string {
  if (!PLACEHOLDER.test(source)) throw new Error(`${SW_FILE}: the /*PRECACHE*/ ... /*END*/ placeholder is missing`);
  const json = JSON.stringify({ prefix: p.prefix, version: p.version, files: p.files });
  return source.replace(PLACEHOLDER, () => `/*PRECACHE*/ ${json} /*END*/`);
}

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));

/** Lists and versions the files of a finished build in `outDir`. */
export function buildPrecache(outDir: string, o: PrecacheOptions): Precache {
  const files = precacheList(walk(outDir).map((f) => relative(outDir, f)), o);
  const entries = files.map((f) => [f, createHash('sha256').update(readFileSync(join(outDir, f))).digest('hex')] as const);
  return { prefix: o.prefix, version: cacheVersion(entries), files };
}

/** The kit's service worker, unbuilt. */
export const swTemplate = (): string => readFileSync(new URL('./sw.js', import.meta.url), 'utf8');

/** Writes `<outDir>/sw.js`: the kit's worker with this build's precache. */
export function writeServiceWorker(outDir: string, o: PrecacheOptions): Precache {
  const p = buildPrecache(outDir, o);
  writeFileSync(join(outDir, SW_FILE), injectPrecache(swTemplate(), p));
  return p;
}

interface BuildConfig {
  readonly root: string;
  readonly build: { readonly outDir: string; readonly assetsDir: string };
  readonly logger: { info(msg: string): void };
}

/** The Vite plugin (`plugins: [swPrecache({ prefix, assets })]`): after `vite build`, writes sw.js into the build. */
export function swPrecache(o: PrecacheOptions) {
  let config: BuildConfig | undefined;
  return {
    name: 'kit-sw-precache',
    apply: 'build' as const,
    configResolved(c: BuildConfig) {
      config = c;
    },
    closeBundle() {
      if (config === undefined) return;
      const outDir = resolve(config.root, config.build.outDir);
      if (!existsSync(join(outDir, 'index.html'))) return; // a failed build: its own error says why
      const p = writeServiceWorker(outDir, { appDir: config.build.assetsDir, ...o });
      config.logger.info(`sw.js: ${String(p.files.length)} files precached, version ${p.version}`);
    },
  };
}
