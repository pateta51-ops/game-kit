// Shared parts of the art-pipeline scripts: config loading, hashing, image size, a dependency-free 8-bit PNG codec,
// sheet cells, and the optional `sharp` codec for every other format.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Io } from '../tooling-scripts/args.ts';

export const sha256 = (b: Uint8Array | string): string => createHash('sha256').update(b).digest('hex');
/** A name safe in a file name on every OS: the id with other characters turned into `_`. */
export const safeName = (id: string): string => id.replace(/[^A-Za-z0-9._-]+/g, '_');
export const posix = (p: string): string => p.split('\\').join('/');

/** One recorded file of a source: `file` is relative to the art root. A miss is remembered so a re-run skips it. */
export interface Rec {
  file: string;
  url?: string;
  from?: string;
  page?: number;
  rect?: [number, number, number];
  sha256?: string;
  bytes?: number;
}
export interface Miss {
  miss: number;
  url?: string;
}
export type Records = Record<string, Rec | Miss>;
export const isRec = (r: Rec | Miss | undefined): r is Rec => r !== undefined && 'file' in r;

/** `--config <json>` plus the named bare flags; null on anything else. */
export function load(args: readonly string[], bools: readonly string[] = []): { config: Record<string, unknown>; dir: string; bools: Set<string>; pos: string[] } | null {
  const set = new Set<string>();
  const pos: string[] = [];
  let file: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] ?? '';
    if (a === '--config') {
      i += 1;
      file = args[i];
    } else if (a.startsWith('--') && bools.includes(a.slice(2))) set.add(a.slice(2));
    else if (a.startsWith('--')) return null;
    else pos.push(a);
  }
  if (file === undefined) return null;
  return { config: JSON.parse(readFileSync(resolve(file), 'utf8')) as Record<string, unknown>, dir: dirname(resolve(file)), bools: set, pos };
}

const isPng = (b: Uint8Array): boolean => Buffer.from(b.buffer, b.byteOffset, b.length).subarray(1, 4).toString('latin1') === 'PNG';

export function imageSize(b: Uint8Array): [number, number] | null {
  const buf = Buffer.from(b.buffer, b.byteOffset, b.length);
  if (isPng(b)) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  if (buf.length >= 30 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    const kind = buf.toString('latin1', 12, 16);
    if (kind === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
    if (kind === 'VP8L') {
      const bits = buf.readUInt32LE(21);
      return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
    }
    if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
    return null;
  }
  for (let i = 2; i + 9 < buf.length; ) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const m = buf[i + 1] ?? 0;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** The pixel box of a cell on a sheet of width x height px: [cell, columns, rows], cells counted row by row from 0; edges rounded so cells tile the sheet. Null when it does not fit. */
export function cellBox(width: number, height: number, [cell, columns, rows]: [number, number, number]): Box | null {
  if (![cell, columns, rows].every(Number.isInteger) || columns < 1 || rows < 1 || cell < 0 || cell >= columns * rows) return null;
  const [cx, cy] = [cell % columns, Math.floor(cell / columns)];
  const [x0, x1] = [Math.round((cx * width) / columns), Math.round(((cx + 1) * width) / columns)];
  const [y0, y1] = [Math.round((cy * height) / rows), Math.round(((cy + 1) * height) / rows)];
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export interface Raster {
  width: number;
  height: number;
  data: Buffer;
}
export function decodePng(b: Uint8Array): Raster {
  if (!isPng(b)) throw new Error('not a PNG (other formats need the sharp module)');
  const buf = Buffer.from(b.buffer, b.byteOffset, b.length);
  let [w, h, depth, ct, il] = [0, 0, 0, 0, 0];
  let plte: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  const idat: Buffer[] = [];
  for (let i = 8; i < buf.length; ) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    const body = buf.subarray(i + 8, i + 8 + len);
    if (type === 'IHDR') [w, h, depth, ct, il] = [body.readUInt32BE(0), body.readUInt32BE(4), body[8] ?? 0, body[9] ?? 0, body[12] ?? 0];
    else if (type === 'PLTE') plte = body;
    else if (type === 'IDAT') idat.push(body);
    i += 12 + len;
  }
  const ch = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[ct];
  if (depth !== 8 || il !== 0 || ch === undefined) throw new Error('only 8-bit, non-interlaced PNGs are read without the sharp module');
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y += 1) {
    const f = raw[y * (stride + 1)] ?? 0;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= ch ? (px[y * stride + x - ch] ?? 0) : 0;
      const up = y > 0 ? (px[(y - 1) * stride + x] ?? 0) : 0;
      const c = x >= ch && y > 0 ? (px[(y - 1) * stride + x - ch] ?? 0) : 0;
      const v = raw[y * (stride + 1) + 1 + x] ?? 0;
      const p = a + up - c;
      const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - up), Math.abs(p - c)];
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      px[y * stride + x] = (v + [0, a, up, (a + up) >> 1, paeth][f]!) & 255;
    }
  }
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    const s = i * ch;
    const g = px[s]!;
    const rgba = ct === 0 ? [g, g, g, 255] : ct === 4 ? [g, g, g, px[s + 1]!] : ct === 2 ? [g, px[s + 1]!, px[s + 2]!, 255] : ct === 3 ? [plte[g * 3]!, plte[g * 3 + 1]!, plte[g * 3 + 2]!, 255] : [g, px[s + 1]!, px[s + 2]!, px[s + 3]!];
    data.set(rgba, i * 4);
  }
  return { width: w, height: h, data };
}

export function encodePng(r: Raster): Buffer {
  const chunk = (type: string, body: Buffer): Buffer => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, 'latin1');
    body.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(r.width, 0);
  ihdr.writeUInt32BE(r.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = Buffer.alloc((r.width * 4 + 1) * r.height);
  for (let y = 0; y < r.height; y += 1) r.data.copy(rows, y * (r.width * 4 + 1) + 1, y * r.width * 4, (y + 1) * r.width * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

/** Crops and converts pictures; `ext` is the output's extension without the dot, `box` omitted means the whole picture. */
export interface Codec {
  out(src: Uint8Array, ext: string, box?: Box): Promise<Uint8Array>;
}
interface SharpImg {
  extract(o: { left: number; top: number; width: number; height: number }): SharpImg;
  toFormat(f: string): SharpImg;
  toBuffer(): Promise<Uint8Array>;
}

/** The built-in codec reads and writes PNG only; a `sharp` module (the game's package, by name or path) handles the rest. */
export async function codec(sharpModule?: string): Promise<Codec> {
  if (sharpModule === undefined)
    return {
      out: (src, ext, box) => {
        if (ext !== 'png') return Promise.reject(new Error(`writing .${ext} needs the sharp module`));
        if (box === undefined && isPng(src)) return Promise.resolve(src);
        const r = decodePng(src);
        if (box === undefined) return Promise.resolve(encodePng(r));
        const o = Buffer.alloc(box.w * box.h * 4);
        for (let y = 0; y < box.h; y += 1) r.data.copy(o, y * box.w * 4, ((box.y + y) * r.width + box.x) * 4, ((box.y + y) * r.width + box.x + box.w) * 4);
        return Promise.resolve(encodePng({ width: box.w, height: box.h, data: o }));
      },
    };
  const m = (await import(/^\.|^[A-Za-z]:|^\//.test(sharpModule) ? pathToFileURL(resolve(sharpModule)).href : sharpModule)) as { default: (i: Uint8Array) => SharpImg };
  return {
    out: (src, ext, box) => {
      let s = m.default(src);
      if (box) s = s.extract({ left: box.x, top: box.y, width: box.w, height: box.h });
      return s.toFormat(ext === 'jpg' ? 'jpeg' : ext).toBuffer();
    },
  };
}

export const fail = (io: Io, name: string, e: unknown): number => {
  io.err(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  return 2;
};
