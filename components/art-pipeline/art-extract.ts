// Cuts or converts pictures into one file per card: a crop box, a cell of a sheet (cell, columns, rows: a Tabletop Simulator
// style deck sheet), or the whole picture in another format. The built-in codec reads and writes 8-bit PNG; any other format
// needs the game's `sharp` package (`sharp` in the config: a module name or a path).
// Config: { root, from?: "<base dir of the item files>", source: "<records name>", ext?: "png", sharp?, items: [{ id, from, box?: {x,y,w,h}, rect?: [cell, columns, rows], name? }] }.
// Writes `<root>/<source>/<name>.<ext>` and the records file `<root>/<source>.json` (id -> { file, from, rect? }). Exit 0, 1 when an item
// was skipped (its box or cell does not fit), 2 usage or a failed read.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isMain, stdio, type Io } from '../tooling-scripts/args.ts';
import { cellBox, codec, fail, imageSize, load, posix, safeName, type Box, type Codec, type Records } from './lib.ts';

export interface ExtractItem {
  id: string;
  from: string;
  box?: Box;
  rect?: [number, number, number];
  name?: string;
}

export async function extractAll(root: string, base: string, source: string, ext: string, items: readonly ExtractItem[], c: Codec, io: Io): Promise<{ records: Records; skipped: number }> {
  const records: Records = {};
  let skipped = 0;
  mkdirSync(join(root, source), { recursive: true });
  for (const it of items) {
    const src = readFileSync(resolve(base, it.from));
    const size = imageSize(src);
    const box = it.rect ? (size ? cellBox(size[0], size[1], it.rect) : null) : (it.box ?? undefined);
    const inside = box === undefined || (size !== null && box !== null && box.x >= 0 && box.y >= 0 && box.w > 0 && box.h > 0 && box.x + box.w <= size[0] && box.y + box.h <= size[1]);
    if (box === null || !inside) {
      io.err(`art-extract: ${it.id}: the box or cell does not fit ${it.from}`);
      skipped += 1;
      continue;
    }
    const rel = posix(join(source, `${it.name ?? safeName(it.id)}.${ext}`));
    writeFileSync(join(root, rel), await c.out(src, ext, box));
    records[it.id] = { file: rel, from: it.from, ...(it.rect ? { rect: it.rect } : {}) };
  }
  return { records, skipped };
}

const USAGE = 'usage: node art-extract.ts --config <json>';

export async function run(args: readonly string[], io: Io = stdio): Promise<number> {
  try {
    const l = load(args);
    if (l === null) {
      io.err(USAGE);
      return 2;
    }
    const c = l.config as { root: string; from?: string; source: string; ext?: string; sharp?: string; items: ExtractItem[] };
    const root = resolve(l.dir, c.root);
    const r = await extractAll(root, resolve(l.dir, c.from ?? '.'), c.source, c.ext ?? 'png', c.items, await codec(c.sharp === undefined ? undefined : c.sharp), io);
    writeFileSync(join(root, `${c.source}.json`), JSON.stringify(r.records, null, 2) + '\n');
    io.out(`art-extract: ${String(Object.keys(r.records).length)} files, ${String(r.skipped)} skipped`);
    return r.skipped > 0 ? 1 : 0;
  } catch (e) {
    return fail(io, 'art-extract', e);
  }
}

if (isMain(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
