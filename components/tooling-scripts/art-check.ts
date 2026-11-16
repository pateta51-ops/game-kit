// The art manifest check: every source picture has its built output, the manifest matches the sources (SHA-256) and the
// outputs (bytes, and SHA-256 when recorded), every id the game needs has an output, and the sizes stay under the caps.
// Exit codes: 0 clean, 1 findings, 2 usage or a missing manifest or folder.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { flags, isMain, stdio, type Io } from './args';

export interface ArtEntry {
  source: string;
  sha256: string;
  bytes: number;
  outSha256?: string;
}
export interface ArtConfig {
  /** The manifest: a JSON record of id to ArtEntry. */
  manifest: string;
  sources: string;
  out: string;
  /** The extension of the outputs, without the dot: an id's output is `<out>/<id>.<ext>`. */
  ext: string;
  /** Matched against each source file name; group 1 is the id. Other files are ignored. */
  sourceId: RegExp;
  need: readonly string[];
  maxBytes: number | undefined;
  maxFileBytes: number | undefined;
}

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

export function artCheck(c: ArtConfig): { errors: string[]; faces: number; total: number } {
  const errors: string[] = [];
  const manifest = JSON.parse(readFileSync(c.manifest, 'utf8')) as Record<string, ArtEntry>;
  const ids = new Set<string>();
  for (const file of readdirSync(c.sources).sort()) {
    const m = c.sourceId.exec(file);
    const id = m?.[1] ?? m?.[0];
    if (id === undefined) continue;
    if (ids.has(id)) errors.push(`${id}: two sources (${file})`);
    ids.add(id);
    const entry = manifest[id];
    const out = join(c.out, `${id}.${c.ext}`);
    if (entry === undefined) {
      errors.push(`${id}: not in the manifest (rebuild the art)`);
      continue;
    }
    if (entry.source !== file || entry.sha256 !== sha256(join(c.sources, file))) errors.push(`${id}: the source ${file} changed since the last build`);
    if (!existsSync(out)) errors.push(`${id}: the output ${id}.${c.ext} is missing`);
    else if (statSync(out).size !== entry.bytes || (entry.outSha256 !== undefined && entry.outSha256 !== sha256(out)))
      errors.push(`${id}: the output ${id}.${c.ext} differs from the manifest`);
  }
  if (ids.size === 0) errors.push(`no source file in ${c.sources} matched ${String(c.sourceId)}`);
  for (const id of Object.keys(manifest)) if (!ids.has(id)) errors.push(`${id}: in the manifest but has no source`);
  for (const id of new Set(c.need)) if (!existsSync(join(c.out, `${id}.${c.ext}`))) errors.push(`${id}: needed by the game but has no ${id}.${c.ext}`);
  let total = 0;
  for (const f of existsSync(c.out) ? readdirSync(c.out).sort() : []) {
    if (!f.endsWith(`.${c.ext}`)) continue;
    const size = statSync(join(c.out, f)).size;
    total += size;
    if (c.maxFileBytes !== undefined && size > c.maxFileBytes) errors.push(`${f}: ${String(size)} bytes is over the file cap of ${String(c.maxFileBytes)}`);
  }
  if (c.maxBytes !== undefined && total > c.maxBytes) errors.push(`${String(total)} bytes of outputs is over the cap of ${String(c.maxBytes)}`);
  return { errors, faces: ids.size, total };
}

const NAMES = ['manifest', 'sources', 'out', 'ext', 'source-id', 'need', 'max-bytes', 'max-file-bytes'];
const USAGE =
  'usage: tsx art-check.ts --manifest <json> --sources <dir> --out <dir> --ext <webp> [--source-id <regex, group 1 is the id>] [--need <json array of ids>]... [--max-bytes <n>] [--max-file-bytes <n>] [--config <json>]';

export function run(args: readonly string[], io: Io = stdio): number {
  try {
    const f = flags(args, NAMES);
    const [manifest, sources, out, ext] = ['manifest', 'sources', 'out', 'ext'].map((k) => f?.[k]?.[0]);
    const caps = ['max-bytes', 'max-file-bytes'].map((k) => f?.[k]?.[0]);
    if (f === null || manifest === undefined || sources === undefined || out === undefined || ext === undefined || caps.some((v) => v !== undefined && !/^\d+$/.test(v))) {
      io.err(USAGE);
      return 2;
    }
    const num = (k: string): number | undefined => {
      const v = f[k]?.[0];
      return v === undefined ? undefined : Number(v);
    };
    const need = (f['need'] ?? []).flatMap((p) => JSON.parse(readFileSync(resolve(p), 'utf8')) as string[]);
    const r = artCheck({
      manifest: resolve(manifest),
      sources: resolve(sources),
      out: resolve(out),
      ext,
      sourceId: new RegExp(f['source-id']?.[0] ?? '^(.+)\\.[^.]+$'),
      need,
      maxBytes: num('max-bytes'),
      maxFileBytes: num('max-file-bytes'),
    });
    for (const e of r.errors) io.err(`error: ${e}`);
    if (r.errors.length > 0) {
      io.err(`art-check: ${String(r.errors.length)} error(s)`);
      return 1;
    }
    io.out(`art-check: ok (${String(r.faces)} faces, ${String(r.total)} bytes)`);
    return 0;
  } catch (error) {
    io.err(`art-check: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (isMain(import.meta.url)) process.exitCode = run(process.argv.slice(2));
