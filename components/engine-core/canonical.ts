// BUILD_PLAN §4.4, §4.7: canonical JSON (sorted object keys) and the FNV-1a 64-bit hash over it (ported kernel).
// Synchronous, deterministic, dependency-free: the content hash of a pack and `hashState` both use it.

/** JSON text with the keys of every object in sorted order; `undefined` properties are omitted, as `JSON.stringify` does. */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError(`canonicalJson: non-finite number ${String(value)}`);
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'object': {
      // built with `+=` (no array of parts per object); same text as the map/join form it replaced
      if (Array.isArray(value)) {
        let out = '[';
        for (let i = 0; i < value.length; i += 1) {
          if (i > 0) out += ',';
          const v = value[i] as unknown;
          out += v === undefined ? 'null' : canonicalJson(v);
        }
        return `${out}]`;
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      let out = '{';
      let first = true;
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i] as string;
        const v = record[key];
        if (v === undefined) continue;
        if (!first) out += ',';
        first = false;
        out += `${JSON.stringify(key)}:${canonicalJson(v)}`;
      }
      return `${out}}`;
    }
    default:
      throw new TypeError(`canonicalJson: unsupported value of type ${typeof value}`);
  }
}

const UTF8 = new TextEncoder();
const hex = (n: number): string => n.toString(16).padStart(8, '0');

/**
 * FNV-1a, 64 bits, over the UTF-8 bytes of `text`; 16 lowercase hex digits. No BigInt: the hash is four 16-bit limbs
 * (v0 lowest), so every product stays exact in 32-bit integer arithmetic.
 */
export function fnv1a64(text: string): string {
  // offset basis 0xcbf29ce484222325, prime 0x100000001b3 = 2^40 + 0x1b3
  let v0 = 0x2325;
  let v1 = 0x8422;
  let v2 = 0x9ce4;
  let v3 = 0xcbf2;
  const bytes = UTF8.encode(text);
  for (let i = 0; i < bytes.length; i += 1) {
    v0 ^= bytes[i] as number;
    // (v3:v2:v1:v0) * (2^40 + 0x1b3) mod 2^64: each limb times 0x1b3, plus the 2^40 term (v0 and v1 shifted 8 bits into
    // limbs 2 and 3), then the carries
    const t0 = v0 * 0x1b3;
    const t1 = v1 * 0x1b3 + (t0 >>> 16);
    const t2 = v2 * 0x1b3 + (v0 << 8) + (t1 >>> 16);
    const t3 = v3 * 0x1b3 + (v1 << 8) + (t2 >>> 16);
    v0 = t0 & 0xffff;
    v1 = t1 & 0xffff;
    v2 = t2 & 0xffff;
    v3 = t3 & 0xffff;
  }
  return hex(((v3 << 16) | v2) >>> 0) + hex(((v1 << 16) | v0) >>> 0);
}
