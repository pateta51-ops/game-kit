// Fetches pictures into a cache folder with their SHA-256: from http(s) URLs, `file:` URLs, or local files and folders.
// Config: { cache, from?: "<base dir for plain paths>", userAgent?, gapMs?: 500, items: [{ id, source, url, name? }] }.
// A picture lands in `<cache>/<source>/<name>.<ext>` (name defaults to the id with unsafe characters turned into `_`); the
// source's records file `<cache>/<source>.json` maps id -> { file, url, sha256, bytes } or { miss: status, url }. A file
// already there and a remembered miss are skipped unless `--refresh`. Network access is a manual step, never a check.
// Exit 0, 1 when an item was a miss, 2 usage.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain, stdio, type Io } from '../tooling-scripts/args.ts';
import { fail, isRec, load, posix, safeName, sha256, type Records } from './lib.ts';

export interface FetchItem {
  id: string;
  source: string;
  url: string;
  name?: string;
}
export interface FetchDeps {
  fetch: (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; headers: { get(n: string): string | null }; arrayBuffer(): Promise<ArrayBuffer> }>;
  sleep: (ms: number) => Promise<void>;
}
const real: FetchDeps = { fetch: (u, i) => fetch(u, i), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
const EXT: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

export interface FetchOpts {
  userAgent: string;
  gapMs: number;
  refresh: boolean;
  /** A request that takes longer is aborted (default 10 minutes). */
  timeoutMs?: number;
  /** Tries per URL, with a doubling wait of `backoffMs` between them (defaults 3 and 1000). */
  retries?: number;
  backoffMs?: number;
}

export async function fetchAll(cache: string, base: string, items: readonly FetchItem[], o: FetchOpts, deps: FetchDeps = real, save?: (source: string, recs: Records) => void): Promise<{ records: Record<string, Records>; fetched: number; misses: number; failed: { id: string; error: string }[] }> {
  const records: Record<string, Records> = {};
  const failed: { id: string; error: string }[] = [];
  let [fetched, misses, last] = [0, 0, 0];
  for (const it of items) {
    const file = join(cache, `${it.source}.json`);
    const recs = (records[it.source] ??= existsSync(file) && !o.refresh ? (JSON.parse(readFileSync(file, 'utf8')) as Records) : {});
    const have = recs[it.id];
    // a cached file counts only when its bytes still hash to the recorded sha256 (a partial or changed file is fetched again)
    if (have && (!isRec(have) || (existsSync(join(cache, have.file)) && (have.sha256 === undefined || sha256(readFileSync(join(cache, have.file))) === have.sha256)))) {
      if (!isRec(have)) misses += 1;
      continue;
    }
    try {
      let bytes: Buffer<ArrayBufferLike>;
      let ext: string;
      if (/^https?:/i.test(it.url)) {
        let res: Awaited<ReturnType<FetchDeps['fetch']>> | undefined;
        let body: ArrayBuffer | undefined;
        for (let n = 0, tries = o.retries ?? 3; n < tries; n += 1) {
          const wait = last + o.gapMs - Date.now();
          if (wait > 0) await deps.sleep(wait);
          last = Date.now();
          try {
            res = await deps.fetch(it.url, { headers: { 'User-Agent': o.userAgent }, signal: AbortSignal.timeout(o.timeoutMs ?? 600_000) });
            if (res.status < 500 || n === tries - 1) {
              body = res.ok ? await res.arrayBuffer() : undefined;
              break;
            }
          } catch (e) {
            if (n === tries - 1) throw e;
          }
          await deps.sleep((o.backoffMs ?? 1000) * 2 ** n);
        }
        const type = (res?.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
        if (res === undefined || !res.ok || body === undefined || !EXT[type]) {
          recs[it.id] = { miss: res?.ok === true ? 415 : (res?.status ?? 0), url: it.url };
          misses += 1;
          save?.(it.source, recs);
          continue;
        }
        bytes = Buffer.from(body);
        ext = EXT[type];
      } else {
        const p = it.url.startsWith('file:') ? fileURLToPath(it.url) : resolve(base, it.url);
        if (!existsSync(p)) {
          recs[it.id] = { miss: 404, url: it.url };
          misses += 1;
          save?.(it.source, recs);
          continue;
        }
        bytes = readFileSync(p);
        ext = extname(p).toLowerCase();
      }
      const rel = posix(join(it.source, `${it.name ?? safeName(it.id)}${ext}`));
      mkdirSync(join(cache, it.source), { recursive: true });
      writeFileSync(join(cache, `${rel}.part`), bytes);
      renameSync(join(cache, `${rel}.part`), join(cache, rel));
      recs[it.id] = { file: rel, url: it.url, sha256: sha256(bytes), bytes: bytes.length };
      fetched += 1;
      save?.(it.source, recs);
    } catch (e) {
      // a network error is not remembered (the next run asks again); the item is reported and the run goes on
      failed.push({ id: it.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { records, fetched, misses, failed };
}

const USAGE = 'usage: node art-fetch.ts --config <json> [--refresh]';

export async function run(args: readonly string[], io: Io = stdio, deps: FetchDeps = real): Promise<number> {
  try {
    const l = load(args, ['refresh']);
    if (l === null) {
      io.err(USAGE);
      return 2;
    }
    const c = l.config as { cache: string; from?: string; userAgent?: string; gapMs?: number; timeoutMs?: number; retries?: number; backoffMs?: number; items: FetchItem[] };
    const cache = resolve(l.dir, c.cache);
    mkdirSync(cache, { recursive: true });
    const save = (s: string, recs: Records): void => {
      writeFileSync(join(cache, `${s}.json.tmp`), JSON.stringify(recs, null, 2) + '\n');
      renameSync(join(cache, `${s}.json.tmp`), join(cache, `${s}.json`));
    };
    const r = await fetchAll(cache, resolve(l.dir, c.from ?? '.'), c.items, { userAgent: c.userAgent ?? 'art-pipeline (private, non-commercial)', gapMs: c.gapMs ?? 500, refresh: l.bools.has('refresh'), ...(c.timeoutMs === undefined ? {} : { timeoutMs: c.timeoutMs }), ...(c.retries === undefined ? {} : { retries: c.retries }), ...(c.backoffMs === undefined ? {} : { backoffMs: c.backoffMs }) }, deps, save);
    for (const [s, recs] of Object.entries(r.records)) save(s, recs);
    for (const f of r.failed) io.err(`art-fetch: ${f.id}: ${f.error}`);
    io.out(`art-fetch: ${String(r.fetched)} fetched, ${String(r.misses)} misses, ${String(r.failed.length)} failed`);
    return r.misses + r.failed.length > 0 ? 1 : 0;
  } catch (e) {
    return fail(io, 'art-fetch', e);
  }
}

if (isMain(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
