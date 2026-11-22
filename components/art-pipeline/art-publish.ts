// Copies the chosen picture of each card from the index to the game's public folder and writes the manifest that
// tooling-scripts/art-check.ts reads. The chosen sources are staged flat as `<stage>/<name>.<ext>` (the folder art-check calls
// `--sources`, with its default `--source-id`); the outputs go to `<out>/<name>.<ext>`; the manifest maps name -> { source, sha256, bytes,
// outSha256, id, width, height }. A picture of another format than `ext` is converted (the built-in codec: PNG only; else `sharp`).
// Config: { index, root, stage, out, manifest, ext, sharp? } (paths relative to the config file; the index's files relative to `root`).
// quality?: { min, max? } (or per face in faces: { <id>: { quality, maxFileBytes } }) encodes a converted picture at the highest quality up to max (100) that fits maxFileBytes, never below min; a face that does not fit at min fails the run.
// The manifest also holds the source's pixel size (sourceWidth, sourceHeight) for art-check's enlarged rule.
// Check afterwards: node tooling-scripts/art-check.ts --manifest <manifest> --sources <stage> --out <out> --ext <ext>.
// Exit 0, 2 usage or a failed read.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { isMain, stdio, type Io } from '../tooling-scripts/args.ts';
import type { ArtIndex } from './art-index.ts';
import { codec, encodeWithin, fail, imageSize, load, safeName, sha256, type Codec } from './lib.ts';

const USAGE = 'usage: node art-publish.ts --config <json>';

export type Quality = { min: number; max?: number };

export async function run(args: readonly string[], io: Io = stdio, codecOverride?: Codec): Promise<number> {
  try {
    const l = load(args);
    if (l === null) {
      io.err(USAGE);
      return 2;
    }
    const c = l.config as { index: string; root: string; stage: string; out: string; manifest: string; ext: string; sharp?: string; quality?: Quality; maxFileBytes?: number; faces?: Record<string, { quality?: Quality; maxFileBytes?: number }> };
    const [root, stage, out] = [resolve(l.dir, c.root), resolve(l.dir, c.stage), resolve(l.dir, c.out)];
    const index = JSON.parse(readFileSync(resolve(l.dir, c.index), 'utf8')) as ArtIndex;
    const cod = codecOverride ?? await codec(c.sharp);
    for (const d of [stage, out]) {
      rmSync(d, { recursive: true, force: true });
      mkdirSync(d, { recursive: true });
    }
    const manifest: Record<string, object> = {};
    for (const [id, file] of Object.entries(index.defs).sort()) {
      const name = safeName(id);
      const src = join(root, file);
      const stageName = `${name}${extname(file)}`;
      copyFileSync(src, join(stage, stageName));
      const bytes = readFileSync(src);
      const made = extname(file).slice(1).toLowerCase() === c.ext ? bytes : await (() => { const q = c.faces?.[id]?.quality ?? c.quality; return q ? encodeWithin(cod, bytes, c.ext, id, q, c.faces?.[id]?.maxFileBytes ?? c.maxFileBytes) : cod.out(bytes, c.ext); })();
      writeFileSync(join(out, `${name}.${c.ext}`), made);
      const size = imageSize(made);
      const from = imageSize(bytes);
      manifest[name] = { source: stageName, sha256: sha256(bytes), bytes: made.length, outSha256: sha256(made), id, ...(size ? { width: size[0], height: size[1] } : {}), ...(from ? { sourceWidth: from[0], sourceHeight: from[1] } : {}) };
    }
    writeFileSync(resolve(l.dir, c.manifest), JSON.stringify(manifest, null, 1) + '\n');
    io.out(`art-publish: ${String(Object.keys(manifest).length)} pictures to ${c.out}`);
    return 0;
  } catch (e) {
    return fail(io, 'art-publish', e);
  }
}

if (isMain(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
