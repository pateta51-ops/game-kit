// The bundle-size gate. Builds the app with vite into .cache/size-build (or measures
// --dir), gzips index.html and every file it loads at once, and fails when the first download, a script chunk or a
// media file is over the limits the game supplies (flags or --config). Exit codes: 0 within budget, 1 over, 2 no build
// or bad usage.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, posix, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

export interface Limits {
  /** The first download, gzipped, in bytes (the check passes below it). */
  initialBudget?: number;
  /** Any one script chunk, before gzip, in bytes. */
  chunkLimit?: number;
  /** An image, font or audio file in the build over this size fails the check. */
  assetLimit?: number;
  /** The app's base path in the addresses (`/game/assets/x.js` is `assets/x.js` in the build), or `auto` to find it. */
  base?: string;
  /** Also count what the scripts import statically, what the stylesheets load with `url(...)`, and icon and manifest links. */
  follow?: boolean;
  /** The gzip level (zlib's default when left out). */
  gzipLevel?: number;
}
const MEDIA = /\.(png|jpe?g|webp|gif|avif|svg|woff2?|ttf|otf|mp3|ogg|wav|m4a)$/i;

export interface FileSize {
  /** The path relative to the build folder. */
  path: string;
  bytes: number;
  gzip: number;
}

export interface SizeReport {
  initial: FileSize[];
  initialGzip: number;
  lazy: FileSize[];
  /** Script chunks over CHUNK_LIMIT. */
  oversized: FileSize[];
  /** Media files over ASSET_LIMIT (the art must never be bundled). */
  media: FileSize[];
  pass: boolean;
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m?.[1] ?? m?.[2] ?? m?.[3];
}

/** The files index.html loads at once: its module script, the preloaded chunks and the stylesheets (local ones only). */
export function initialFiles(html: string, all = false): string[] {
  const found: string[] = [];
  const add = (url: string | undefined): void => {
    if (url === undefined || /^(?:[a-z]+:)?\/\//i.test(url) || url.startsWith('data:')) return;
    const path = url.replace(/^\.?\//, '').split(/[?#]/)[0] ?? '';
    if (path !== '' && !found.includes(path)) found.push(path);
  };
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) add(attr(tag, 'src'));
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attr(tag, 'rel') ?? '';
    if ((all ? /\b(modulepreload|stylesheet|preload|icon|manifest)\b/i : /\b(modulepreload|stylesheet|preload)\b/i).test(rel)) add(attr(tag, 'href'));
  }
  return found;
}

function sizeOf(dir: string, path: string, level?: number): FileSize {
  const data = readFileSync(join(dir, path));
  return { path, bytes: data.length, gzip: (level === undefined ? gzipSync(data) : gzipSync(data, { level })).length };
}

function withinBuild(dir: string, path: string, base: string | undefined): string {
  if (base === undefined || existsSync(join(dir, path))) return path;
  if (base !== 'auto') {
    const b = `${base.replace(/^\/+|\/+$/g, '')}/`;
    return path.startsWith(b) ? path.slice(b.length) : path;
  }
  const parts = path.split('/');
  for (let i = 1; i < parts.length; i += 1) {
    const rest = parts.slice(i).join('/');
    if (existsSync(join(dir, rest))) return rest;
  }
  return path;
}

/** The modules a built script imports statically (`import ... from "./x.js"`, `import "./x.js"`, `export ... from`). */
export function staticImports(js: string): string[] {
  const refs: string[] = [];
  for (const m of js.matchAll(/(?:\bimport|\bexport)\s*(?:[\w*{}\s,$]+\s*from\s*)?["']([^"']+\.m?js)["']/g)) {
    if (js[m.index - 1] !== '.' && m[1] !== undefined) refs.push(m[1]);
  }
  return refs;
}

/** The files a stylesheet loads with `url(...)`. */
export function cssUrls(css: string): string[] {
  return [...css.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)].map((m) => m[2] ?? '');
}

/** The address `ref`, found in the build file `from`, as a path inside the build; null for another host, `data:`, `#x` or the encoded `%23x`. */
function localPath(ref: string, from: string): string | null {
  const clean = ref.trim().split(/[?#]/)[0] ?? '';
  if (clean === '' || clean.startsWith('%23') || /^[a-z]+:/i.test(clean) || clean.startsWith('//')) return null;
  const path = clean.startsWith('/') ? posix.normalize(clean.slice(1)) : posix.join(posix.dirname(from), decodeURIComponent(clean));
  return /^\.\.?(\/|$)/.test(path) ? null : path;
}

/** Every file below `dir`, as forward-slash paths relative to it (source maps left out). */
function allFiles(dir: string, sub = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(dir, sub))) {
    const rel = sub ? `${sub}/${name}` : name;
    if (statSync(join(dir, rel)).isDirectory()) out.push(...allFiles(dir, rel));
    else if (!name.endsWith('.map')) out.push(rel);
  }
  return out.sort();
}

/** Measure a build folder. Throws when it holds no index.html. */
export function measureBuild(dir: string, limits: Limits): SizeReport {
  const level = limits.gzipLevel;
  if (level !== undefined && !(Number.isInteger(level) && level >= 0 && level <= 9)) throw new Error(`gzipLevel must be a whole number from 0 to 9, not ${String(level)}`);
  const htmlPath = join(dir, 'index.html');
  if (!existsSync(htmlPath)) throw new Error(`no build in ${dir} (run vite build first)`);
  const named = initialFiles(readFileSync(htmlPath, 'utf8'), limits.follow === true).map((path) => withinBuild(dir, path, limits.base));
  const missing = named.filter((path) => !existsSync(join(dir, path)));
  if (missing.length > 0) throw new Error(`index.html names files the build does not have: ${missing.join(', ')}`);
  if (limits.follow === true) {
    for (let i = 0; i < named.length; i += 1) {
      const from = named[i] ?? '';
      const js = /\.m?js$/.test(from);
      if (!js && !from.endsWith('.css')) continue;
      const text = readFileSync(join(dir, from), 'utf8');
      for (const ref of js ? staticImports(text) : cssUrls(text)) {
        const to = js && !/^\.{0,2}\//.test(ref) ? null : localPath(ref, from);
        if (to === null) continue;
        const path = withinBuild(dir, to, limits.base);
        if (named.includes(path)) continue;
        if (existsSync(join(dir, path))) named.push(path);
        else if (!js) throw new Error(`${from} loads ${path}, which the build does not have`);
      }
    }
  }
  const size = (path: string): FileSize => sizeOf(dir, path, limits.gzipLevel);
  const initial = [size('index.html'), ...named.map(size)];
  const files = allFiles(dir);
  const rest = files.filter((path) => path !== 'index.html' && !named.includes(path));
  const lazy = rest.filter((path) => /\.(js|css)$/.test(path)).map(size);
  const media = files
    .filter((path) => MEDIA.test(path))
    .map(size)
    .filter((f) => f.bytes > (limits.assetLimit ?? Infinity));
  const initialGzip = initial.reduce((sum, file) => sum + file.gzip, 0);
  const oversized = [...initial, ...lazy].filter((file) => file.path.endsWith('.js') && file.bytes > (limits.chunkLimit ?? Infinity));
  return {
    initial,
    initialGzip,
    lazy,
    oversized,
    media,
    pass: initialGzip < (limits.initialBudget ?? Infinity) && oversized.length === 0 && media.length === 0,
  };
}

const kB = (bytes: number): string => `${(bytes / 1024).toFixed(1)} kB`;

export function formatSize(report: SizeReport, limits: Limits): string[] {
  const row = (file: FileSize): string =>
    `  ${file.path.padEnd(40)} ${kB(file.bytes).padStart(10)} ${kB(file.gzip).padStart(10)} gzipped`;
  return [
    'First download (index.html and what it loads at once):',
    ...report.initial.map(row),
    limits.initialBudget === undefined
      ? `  total ${kB(report.initialGzip)} gzipped`
      : `  total ${kB(report.initialGzip)} gzipped; budget ${kB(limits.initialBudget)}: ${report.initialGzip < limits.initialBudget ? 'pass' : 'FAIL'}`,
    `Loaded on demand (${String(report.lazy.length)} files):`,
    ...report.lazy.map(row),
    ...(limits.chunkLimit === undefined
      ? []
      : [
          report.oversized.length === 0
            ? `Every script chunk is under ${kB(limits.chunkLimit)} before gzip.`
            : `FAIL: over ${kB(limits.chunkLimit)} before gzip: ${report.oversized.map((f) => f.path).join(', ')}`,
        ]),
    ...(limits.assetLimit === undefined
      ? []
      : [
          report.media.length === 0
            ? `No image, font or audio file over ${kB(limits.assetLimit)}.`
            : `FAIL: media over the asset limit in the build: ${report.media.map((f) => f.path).join(', ')}`,
        ]),
  ];
}

export interface SizeIo {
  out: (line: string) => void;
  err: (line: string) => void;
}

/** `vite build` into `dir` (emptied first). Returns false when the build failed. */
function build(dir: string, io: SizeIo): boolean {
  const vite = resolve('node_modules', 'vite', 'bin', 'vite.js');
  const r = spawnSync(
    process.execPath,
    [vite, 'build', '--outDir', relative(process.cwd(), dir), '--emptyOutDir', '--logLevel', 'warn'],
    {
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  );
  if (r.status !== 0) io.err(`size: vite build failed (exit ${String(r.status)})`);
  return r.status === 0;
}

const FLAGS: Record<string, keyof Limits | 'dir' | 'json' | 'config'> = {
  '--dir': 'dir',
  '--json': 'json',
  '--config': 'config',
  '--initial-budget': 'initialBudget',
  '--chunk-limit': 'chunkLimit',
  '--asset-limit': 'assetLimit',
  '--base': 'base',
  '--follow': 'follow',
  '--gzip-level': 'gzipLevel',
};
const USAGE =
  'usage: node check-bundle-size.ts [--config <json with initialBudget, chunkLimit, assetLimit>] [--initial-budget <bytes>] [--chunk-limit <bytes>] [--asset-limit <bytes>] [--base <path|auto>] [--follow true] [--gzip-level <0-9>] [--dir <build folder>] [--json <path>]';

export function run(
  args: readonly string[],
  io: SizeIo = { out: (l) => console.log(l), err: (l) => console.error(l) },
  defaults: Limits = {},
): number {
  const given: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const [flag, value] = [args[i], args[i + 1]];
    const key = flag === undefined ? undefined : FLAGS[flag];
    if (value === undefined || key === undefined) {
      io.err(USAGE);
      return 2;
    }
    given[key] = value;
  }
  const limits: Limits = { ...defaults, ...(given['config'] === undefined ? {} : (JSON.parse(readFileSync(resolve(given['config']), 'utf8')) as Limits)) };
  const NUMBERS = ['initialBudget', 'chunkLimit', 'assetLimit', 'gzipLevel'] as const;
  for (const k of NUMBERS) if (given[k] !== undefined) limits[k] = Number(given[k]);
  if (given['base'] !== undefined) limits.base = given['base'];
  if (given['follow'] !== undefined) limits.follow = given['follow'] === 'true';
  if (NUMBERS.some((k) => limits[k] !== undefined && !Number.isFinite(limits[k])) || NUMBERS.slice(0, 3).every((k) => limits[k] === undefined)) {
    io.err(`size: at least one limit is required, in bytes.\n${USAGE}`);
    return 2;
  }
  let dir = given['dir'] ?? null;
  const json = given['json'] ?? null;
  if (dir === null) {
    dir = resolve('.cache', 'size-build');
    if (!build(dir, io)) return 2;
  }
  let report: SizeReport;
  try {
    report = measureBuild(resolve(dir), limits);
  } catch (error) {
    io.err(`size: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  for (const line of formatSize(report, limits)) io.out(line);
  if (json !== null) writeFileSync(resolve(json), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report.pass ? 0 : 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = run(process.argv.slice(2));
}
