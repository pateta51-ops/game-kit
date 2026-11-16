// A TrueType or OpenType file as WOFF, losslessly: every table (and so every variable axis) is kept. Node's zlib only.
import { deflateSync } from 'node:zlib';

const padded = (n: number): number => (n + 3) & ~3;

export function toWoff(bytes: Uint8Array): Buffer {
  const source = Buffer.from(bytes);
  const count = source.readUInt16BE(4);
  const tables = Array.from({ length: count }, (_, i) => {
    const at = 12 + i * 16;
    const tag = source.subarray(at, at + 4);
    const checksum = source.readUInt32BE(at + 4);
    const offset = source.readUInt32BE(at + 8);
    const length = source.readUInt32BE(at + 12);
    if (offset + length > source.length) throw new Error('Font table extends beyond the source');
    const raw = source.subarray(offset, offset + length);
    const compressed = deflateSync(raw, { level: 9 });
    return { tag, checksum, raw, data: compressed.length < raw.length ? compressed : raw };
  }).sort((a, b) => Buffer.compare(a.tag, b.tag));
  const headerSize = 44 + count * 20;
  const result = Buffer.alloc(headerSize + tables.reduce((n, t) => n + padded(t.data.length), 0));
  result.write('wOFF');
  source.copy(result, 4, 0, 4); // the original SFNT flavour
  result.writeUInt32BE(result.length, 8);
  result.writeUInt16BE(count, 12);
  result.writeUInt32BE(12 + count * 16 + tables.reduce((n, t) => n + padded(t.raw.length), 0), 16);
  result.writeUInt16BE(1, 20);
  let offset = headerSize;
  for (const [i, table] of tables.entries()) {
    const at = 44 + i * 20;
    table.tag.copy(result, at);
    result.writeUInt32BE(offset, at + 4);
    result.writeUInt32BE(table.data.length, at + 8);
    result.writeUInt32BE(table.raw.length, at + 12);
    result.writeUInt32BE(table.checksum, at + 16);
    table.data.copy(result, offset);
    offset += padded(table.data.length);
  }
  return result;
}
