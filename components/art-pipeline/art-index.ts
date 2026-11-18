// The art index: one chosen image per card. Every source (fetch, extract, render-pdf, a folder of scans...) leaves a
// records file `{ id: { file, ... } | { miss } }`; the game lists them in its order of preference and this picks the first
// one that has an existing file, unless the choice rule says otherwise.
// Config: { root, ids: [..] | "<json file>", order: [{ name, records }], overrides?: { id: sourceName }, never?: { sourceName: [ids] },
//   degradedMaxSide?: 600, degradedRatio?: 1.5, out?: "index.json" }. Paths are relative to the config file; `file`s relative to `root`.
// Exit 0, 1 when a card has no image and `--strict`, 2 usage.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isMain, stdio, type Io } from '../tooling-scripts/args.ts';
import { fail, imageSize, isRec, load, type Records } from './lib.ts';

export interface IndexEntry {
  source: string;
  file: string;
  size?: [number, number];
  /** An earlier source's face passed over as degraded. */
  degraded?: { source: string; file: string; reason: string };
  url?: string;
  from?: string;
}
export interface ArtIndex {
  order: string[];
  defs: Record<string, string>;
  sources: Record<string, IndexEntry>;
  missing: string[];
  counts: Record<string, number>;
}
export interface Rule {
  /** id -> source name: that source's face is the one, whatever the order says. */
  overrides?: Record<string, string>;
  /** source name -> ids it is never used for. */
  never?: Record<string, string[]>;
  /** A face whose shorter side is under this loses to a later source's face at least `degradedRatio` times as large (default 1.5). */
  degradedMaxSide?: number;
  degradedRatio?: number;
}

/** Pure but for reading file sizes through `size(file)` (null: the file is missing). */
export function buildArtIndex(ids: readonly string[], order: readonly { name: string; records: Records }[], rule: Rule, size: (file: string) => [number, number] | null): ArtIndex {
  const index: ArtIndex = { order: order.map((o) => o.name), defs: {}, sources: {}, missing: [], counts: { missing: 0 } };
  for (const o of order) index.counts[o.name] = 0;
  for (const id of ids) {
    const cands: IndexEntry[] = [];
    for (const o of order) {
      const r = o.records[id];
      if (!isRec(r) || rule.never?.[o.name]?.includes(id) === true || size(r.file) === null) continue;
      cands.push({ source: o.name, file: r.file, ...(r.url ? { url: r.url } : {}), ...(r.from ? { from: r.from } : {}) });
    }
    const forced = rule.overrides?.[id];
    let entry = forced === undefined ? cands[0] : cands.find((c) => c.source === forced);
    if (entry && forced === undefined && rule.degradedMaxSide !== undefined) {
      const a = Math.min(...(size(entry.file) ?? [Infinity]));
      const better = cands.slice(1).find((c) => {
        const b = Math.min(...(size(c.file) ?? [0]));
        return a < (rule.degradedMaxSide ?? 0) && b >= (rule.degradedRatio ?? 1.5) * a;
      });
      if (better) entry = { ...better, degraded: { source: entry.source, file: entry.file, reason: `${String(a)} px against ${String(Math.min(...(size(better.file) ?? [0])))} px` } };
    }
    if (!entry) {
      index.missing.push(id);
      index.counts['missing'] = (index.counts['missing'] ?? 0) + 1;
      continue;
    }
    const s = size(entry.file);
    if (s) entry.size = s;
    index.defs[id] = entry.file;
    index.sources[id] = entry;
    index.counts[entry.source] = (index.counts[entry.source] ?? 0) + 1;
  }
  return index;
}

const USAGE = 'usage: node art-index.ts --config <json> [--strict]';

export function run(args: readonly string[], io: Io = stdio): number {
  try {
    const l = load(args, ['strict']);
    if (l === null) {
      io.err(USAGE);
      return 2;
    }
    const c = l.config as unknown as { root: string; ids: string[] | string; order: { name: string; records: string }[]; out?: string } & Rule;
    const root = resolve(l.dir, c.root);
    const ids = typeof c.ids === 'string' ? (JSON.parse(readFileSync(resolve(l.dir, c.ids), 'utf8')) as string[]) : c.ids;
    const order = c.order.map((o) => {
      const f = resolve(l.dir, o.records);
      return { name: o.name, records: existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Records) : {} };
    });
    const index = buildArtIndex(ids, order, c, (f) => (existsSync(join(root, f)) ? (imageSize(readFileSync(join(root, f))) ?? [0, 0]) : null));
    writeFileSync(resolve(l.dir, c.out ?? 'index.json'), JSON.stringify(index, null, 2) + '\n');
    io.out(`art-index: ${String(Object.keys(index.defs).length)} of ${String(ids.length)} cards have art (${JSON.stringify(index.counts)})`);
    return l.bools.has('strict') && index.missing.length > 0 ? 1 : 0;
  } catch (e) {
    return fail(io, 'art-index', e);
  }
}

if (isMain(import.meta.url)) process.exitCode = run(process.argv.slice(2));
