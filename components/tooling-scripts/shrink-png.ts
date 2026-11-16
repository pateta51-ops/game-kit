// Keeps the PNGs of a folder under a byte limit: one over it is re-encoded at the same pixel size as a dithered palette
// PNG, with fewer colours until it fits. The encoder is the game's `sharp` package (or the one `--sharp` names).
// Exit codes: 0 all fit, 1 a picture is still over the limit, 2 usage or a failed read or write.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { flags, isMain, stdio, type Io } from './args';

export type Encode = (png: Uint8Array, colours: number) => Promise<Uint8Array>;

export async function shrink(dir: string, limit: number, colours: readonly number[], encode: Encode): Promise<{ file: string; before: number; after: number }[]> {
  const done: { file: string; before: number; after: number }[] = [];
  for (const f of readdirSync(dir).sort()) {
    const file = join(dir, f);
    if (!f.toLowerCase().endsWith('.png') || statSync(file).size <= limit) continue;
    const src: Uint8Array = readFileSync(file);
    let best = src;
    for (const c of colours) {
      const out = await encode(src, c);
      if (out.length < best.length) best = out;
      if (best.length <= limit) break;
    }
    if (best !== src) writeFileSync(file, best);
    done.push({ file: f, before: src.length, after: best.length });
  }
  return done;
}

type Sharp = (input: Uint8Array) => { png(o: object): { toBuffer(): Promise<Uint8Array> } };

const USAGE = 'usage: tsx shrink-png.ts --dir <dir> [--max-bytes 1900000] [--colours 256,192,128] [--sharp <module>] [--config <json>]';

export async function run(args: readonly string[], io: Io = stdio, encode?: Encode): Promise<number> {
  try {
    const f = flags(args, ['dir', 'max-bytes', 'colours', 'sharp']);
    const dir = f?.['dir']?.[0];
    const max = f?.['max-bytes']?.[0] ?? '1900000';
    const colours = (f?.['colours']?.[0] ?? '256,192,128').split(',').map(Number);
    if (f === null || dir === undefined || !/^\d+$/.test(max) || colours.some((c) => !Number.isInteger(c) || c < 2 || c > 256)) {
      io.err(USAGE);
      return 2;
    }
    let enc = encode;
    if (enc === undefined) {
      const sharp = ((await import(f['sharp']?.[0] ?? 'sharp')) as { default: Sharp }).default;
      enc = (png, c) => sharp(png).png({ palette: true, colours: c, dither: 1, compressionLevel: 9, effort: 10 }).toBuffer();
    }
    const done = await shrink(resolve(dir), Number(max), colours, enc);
    for (const d of done) io.out(`${d.file}: ${String(d.before)} -> ${String(d.after)} bytes`);
    const over = done.filter((d) => d.after > Number(max));
    for (const d of over) io.err(`error: ${d.file} is still over ${max} bytes`);
    return over.length > 0 ? 1 : 0;
  } catch (error) {
    io.err(`shrink-png: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (isMain(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
