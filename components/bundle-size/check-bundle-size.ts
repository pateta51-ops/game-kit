// The bundle-size gate. Builds the app with vite into .cache/size-build (or measures
// --dir), gzips index.html and every file it loads at once, and fails when the first download, a script chunk or a
// media file is over the limits the game supplies (flags or --config). Exit codes: 0 within budget, 1 over, 2 no build
// or bad usage.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

export interface Limits {
  /** The first download, gzipped, in bytes (the check passes below it). */
  initialBudget: number;
  /** Any one script chunk, before gzip, in bytes. */
  chunkLimit: number;
  /** An image, font or audio file in the build over this size fails the check. */
  assetLimit: number;
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

/** The files index.html loads at once: its module script, the preloaded chunks and the stylesheets (local ones only). */
export function initialFiles(html: string): string[] {
  const found: string[] = [];
  const add = (url: string | undefined): void => {
    if (url === undefined || /^(?:[a-z]+:)?\/\//i.test(url) || url.startsWith('data:')) return;
    const path = url.replace(/^\.?\//, '').split(/[?#]/)[0] ?? '';
    if (path !== '' && !found.includes(path)) found.push(path);
  };
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) add(/\bsrc="([^"]+)"/i.exec(tag)?.[1]);
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /\brel="([^"]+)"/i.exec(tag)?.[1] ?? '';
    if (/\b(modulepreload|stylesheet|preload)\b/i.test(rel)) add(/\bhref="([^"]+)"/i.exec(tag)?.[1]);
  }
  return found;
}

function sizeOf(dir: string, path: string): FileSize {
  const data = readFileSync(join(dir, path));
  return { path, bytes: data.length, gzip: gzipSync(data).length };
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
  const htmlPath = join(dir, 'index.html');
  if (!existsSync(htmlPath)) throw new Error(`no build in ${dir} (run vite build first)`);
  const named = initialFiles(readFileSync(htmlPath, 'utf8'));
  const missing = named.filter((path) => !existsSync(join(dir, path)));
  if (missing.length > 0) throw new Error(`index.html names files the build does not have: ${missing.join(', ')}`);
  const initial = [sizeOf(dir, 'index.html'), ...named.map((path) => sizeOf(dir, path))];
  const rest = allFiles(dir).filter((path) => path !== 'index.html' && !named.includes(path));
  const lazy = rest.filter((path) => /\.(js|css)$/.test(path)).map((path) => sizeOf(dir, path));
  const media = rest
    .filter((path) => MEDIA.test(path))
    .map((path) => sizeOf(dir, path))
    .filter((f) => f.bytes > limits.assetLimit);
  const initialGzip = initial.reduce((sum, file) => sum + file.gzip, 0);
  const oversized = [...initial, ...lazy].filter((file) => file.path.endsWith('.js') && file.bytes > limits.chunkLimit);
  return {
    initial,
    initialGzip,
    lazy,
    oversized,
    media,
    pass: initialGzip < limits.initialBudget && oversized.length === 0 && media.length === 0,
  };
}

const kB = (bytes: number): string => `${(bytes / 1024).toFixed(1)} kB`;

export function formatSize(report: SizeReport, limits: Limits): string[] {
  const row = (file: FileSize): string =>
    `  ${file.path.padEnd(40)} ${kB(file.bytes).padStart(10)} ${kB(file.gzip).padStart(10)} gzipped`;
  return [
    'First download (index.html and what it loads at once):',
    ...report.initial.map(row),
    `  total ${kB(report.initialGzip)} gzipped; budget ${kB(limits.initialBudget)}: ${report.initialGzip < limits.initialBudget ? 'pass' : 'FAIL'}`,
    `Loaded on demand (${String(report.lazy.length)} files):`,
    ...report.lazy.map(row),
    report.oversized.length === 0
      ? `Every script chunk is under ${kB(limits.chunkLimit)} before gzip.`
      : `FAIL: over ${kB(limits.chunkLimit)} before gzip: ${report.oversized.map((f) => f.path).join(', ')}`,
    report.media.length === 0
      ? `No image, font or audio file over ${kB(limits.assetLimit)}.`
      : `FAIL: media over the asset limit in the build: ${report.media.map((f) => f.path).join(', ')}`,
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
};
const USAGE =
  'usage: tsx check-bundle-size.ts [--config <json with initialBudget, chunkLimit, assetLimit>] [--initial-budget <bytes>] [--chunk-limit <bytes>] [--asset-limit <bytes>] [--dir <build folder>] [--json <path>]';

export function run(
  args: readonly string[],
  io: SizeIo = { out: (l) => console.log(l), err: (l) => console.error(l) },
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
  const fromFile = given['config'] === undefined ? {} : (JSON.parse(readFileSync(resolve(given['config']), 'utf8')) as Partial<Limits>);
  const num = (k: keyof Limits): number => Number(given[k] ?? fromFile[k]);
  const limits: Limits = { initialBudget: num('initialBudget'), chunkLimit: num('chunkLimit'), assetLimit: num('assetLimit') };
  if (Object.values(limits).some((v) => !Number.isFinite(v))) {
    io.err(`size: the three limits are required.\n${USAGE}`);
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
