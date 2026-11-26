// The art manifest check: every source picture has its built output, the manifest matches the sources (SHA-256) and the
// outputs (bytes, and SHA-256 when recorded), every id the game needs has an output, and the sizes stay under the caps.
// Exit codes: 0 clean, 1 findings, 2 usage or a missing manifest or folder.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { flags, isMain, stdio, type Io } from './args.ts';

export interface ArtEntry {
  /** Original logical ID, when filenames use a sanitized name. */
  id?: string;
  source: string;
  sha256: string;
  bytes: number;
  outSha256?: string;
  width?: number;
  height?: number;
  sourceWidth?: number;
  sourceHeight?: number;
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
  /** Required logical IDs from the game's content, independently of generated filenames. */
  needIds?: readonly string[];
  maxBytes: number | undefined;
  maxFileBytes: number | undefined;
  /** On unless false: an entry whose pixel size (width x height) is over its source's (sourceWidth x sourceHeight) fails; entries without both sizes are skipped. */
  noEnlarge?: boolean;
}

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
const filesIn = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
  .filter((entry) => entry.isFile() || (entry.isSymbolicLink() && statSync(join(dir, entry.name), { throwIfNoEntry: false })?.isFile()))
  .map((entry) => entry.name).sort();

export function artCheck(c: ArtConfig): { errors: string[]; faces: number; total: number; skipped: number } {
  const errors: string[] = [];
  let skipped = 0;
  const manifest = JSON.parse(readFileSync(c.manifest, 'utf8')) as Record<string, ArtEntry>;
  const manifestPath = realpathSync(c.manifest);
  const manifestIn = (dir: string) => {
    const actual = existsSync(dir) ? realpathSync(dir) : dir;
    return (file: string) => !relative(join(dir, file), c.manifest) || !relative(join(actual, file), manifestPath);
  };
  const sourceManifest = manifestIn(c.sources);
  const outputManifest = manifestIn(c.out);
  const ids = new Set<string>();
  for (const file of filesIn(c.sources)) {
    if (sourceManifest(file)) continue;
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
    if (c.noEnlarge !== false && (entry.width === undefined || entry.height === undefined || entry.sourceWidth === undefined || entry.sourceHeight === undefined)) skipped += 1;
    if (c.noEnlarge !== false && entry.width !== undefined && entry.height !== undefined && entry.sourceWidth !== undefined && entry.sourceHeight !== undefined && entry.width * entry.height > entry.sourceWidth * entry.sourceHeight)
      errors.push(`${id}: enlarged: the output is ${String(entry.width)}x${String(entry.height)}, the source ${String(entry.sourceWidth)}x${String(entry.sourceHeight)}`);
    if (outputManifest(`${id}.${c.ext}`) || !existsSync(out)) errors.push(`${id}: the output ${id}.${c.ext} is missing`);
    else if (statSync(out).size !== entry.bytes || (entry.outSha256 !== undefined && entry.outSha256 !== sha256(out)))
      errors.push(`${id}: the output ${id}.${c.ext} differs from the manifest`);
  }
  if (ids.size === 0) errors.push(`no source file in ${c.sources} matched ${String(c.sourceId)}`);
  for (const id of Object.keys(manifest)) if (!ids.has(id)) errors.push(`${id}: in the manifest but has no source`);
  for (const id of new Set(c.need)) if (outputManifest(`${id}.${c.ext}`) || !existsSync(join(c.out, `${id}.${c.ext}`))) errors.push(`${id}: needed by the game but has no ${id}.${c.ext}`);
  const logical = new Map<string, string>();
  for (const [name, entry] of Object.entries(manifest)) {
    const id = entry.id ?? name;
    if (logical.has(id)) errors.push(`${id}: logical ID occurs in more than one manifest entry`);
    logical.set(id, name);
  }
  for (const id of new Set(c.needIds ?? [])) {
    const name = logical.get(id);
    if (name === undefined || !ids.has(name) || !existsSync(join(c.out, `${name}.${c.ext}`))) errors.push(`${id}: required logical ID has no complete published face`);
  }
  let total = 0;
  for (const f of existsSync(c.out) ? filesIn(c.out) : []) {
    if (!f.endsWith(`.${c.ext}`) || outputManifest(f)) continue;
    const size = statSync(join(c.out, f)).size;
    total += size;
    if (c.maxFileBytes !== undefined && size > c.maxFileBytes) errors.push(`${f}: ${String(size)} bytes is over the file cap of ${String(c.maxFileBytes)}`);
  }
  if (c.maxBytes !== undefined && total > c.maxBytes) errors.push(`${String(total)} bytes of outputs is over the cap of ${String(c.maxBytes)}`);
  return { errors, faces: ids.size, total, skipped };
}

const NAMES = ['manifest', 'sources', 'out', 'ext', 'source-id', 'need', 'need-ids', 'max-bytes', 'max-file-bytes'];
const USAGE =
  'usage: node art-check.ts --manifest <json> --sources <dir> --out <dir> --ext <webp> [--source-id <regex, group 1 is the id>] [--need <json array of output names>]... [--need-ids <json array of logical ids>]... [--max-bytes <n>] [--max-file-bytes <n>] [--allow-enlarged] [--config <json>]';

export function run(args: readonly string[], io: Io = stdio): number {
  try {
    const f = flags(args, NAMES, ['allow-enlarged']);
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
    const needIds = (f['need-ids'] ?? []).flatMap((p) => {
      const value: unknown = JSON.parse(readFileSync(resolve(p), 'utf8'));
      if (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || !id)) throw new Error('--need-ids requires a JSON array of nonempty logical IDs');
      return value as string[];
    });
    const r = artCheck({
      manifest: resolve(manifest),
      sources: resolve(sources),
      out: resolve(out),
      ext,
      sourceId: new RegExp(f['source-id']?.[0] ?? '^(.+)\\.[^.]+$'),
      need,
      needIds,
      maxBytes: num('max-bytes'),
      maxFileBytes: num('max-file-bytes'),
      noEnlarge: f['allow-enlarged'] === undefined,
    });
    for (const e of r.errors) io.err(`error: ${e}`);
    if (r.errors.length > 0) {
      io.err(`art-check: ${String(r.errors.length)} error(s)`);
      return 1;
    }
    if (r.skipped > 0) io.out(`enlarged check: ${String(r.skipped)} faces skipped, no source size; republish to check them`);
    io.out(`art-check: ok (${String(r.faces)} faces, ${String(r.total)} bytes)`);
    return 0;
  } catch (error) {
    io.err(`art-check: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (isMain(import.meta.url)) process.exitCode = run(process.argv.slice(2));
