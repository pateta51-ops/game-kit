// BUILD_PLAN §4.4, §4.9: canonical JSON, the FNV-1a 64-bit hash and hashValue (ported from Warp's Edge).
import { describe, expect, it } from 'vitest';
import { canonicalJson, fnv1a64, hashValue } from './index';

/** FNV-1a 64 with BigInt: the textbook definition, slow but obviously right. */
function reference(text: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

/** A deterministic stream of numbers, so the "random" inputs are the same on every run. */
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

/** The same value with every object's keys inserted in reverse order. */
function reversed(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reversed);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, child]) => [key, reversed(child)]),
    );
  }
  return value;
}

describe('fnv1a64', () => {
  it('matches the published FNV-1a 64-bit test vectors', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325'); // the offset basis
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
    expect(fnv1a64('foobar')).toBe('85944171f73967e8');
  });

  it('hashes the UTF-8 bytes of the text', () => {
    expect(fnv1a64('é')).toBe('0ac21707b7181e01'); // two bytes, c3 a9
    expect(fnv1a64('日本語')).toBe(reference('日本語'));
    expect(fnv1a64('😀')).toBe(reference('😀')); // a surrogate pair: four bytes
  });

  it('agrees with the BigInt definition on 300 generated texts and on a long text', () => {
    const next = lcg(7);
    const chars = [...'abcXYZ019 {}[]":,.-éß日😀\n'];
    for (let i = 0; i < 300; i += 1) {
      const length = next() % 40;
      let text = '';
      for (let j = 0; j < length; j += 1) text += chars[next() % chars.length];
      expect(fnv1a64(text), JSON.stringify(text)).toBe(reference(text));
    }
    const long = JSON.stringify(
      Array.from({ length: 400 }, (_, i) => ({
        id: `fx${String(i)}`,
        name: `Fixture token ${String(i)}`,
        value: i,
      })),
    );
    expect(long.length).toBeGreaterThan(20_000);
    expect(fnv1a64(long)).toBe(reference(long));
  });

  it('always returns 16 lowercase hex digits, with leading zeros kept', () => {
    const next = lcg(11);
    for (let i = 0; i < 200; i += 1) expect(fnv1a64(`text ${String(next())}`)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('canonicalJson', () => {
  it('sorts the keys of every object, at every depth, and keeps the order of arrays', () => {
    expect(canonicalJson({ b: [1, { z: 1, a: 2 }], a: 'x', c: null })).toBe(
      '{"a":"x","b":[1,{"a":2,"z":1}],"c":null}',
    );
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });

  it('omits properties that are undefined and writes an undefined array element as null, like JSON.stringify', () => {
    const value = { keep: 1, drop: undefined, list: [1, undefined, 3] };
    expect(canonicalJson(value)).toBe('{"keep":1,"list":[1,null,3]}');
    expect(canonicalJson(value)).toBe(JSON.stringify(value));
  });

  it('escapes strings like JSON.stringify and writes numbers in their shortest form', () => {
    expect(canonicalJson('a"b\\c\nd ')).toBe(JSON.stringify('a"b\\c\nd '));
    expect(canonicalJson([0, -0, 1.5, 1e21, -3, true, false])).toBe('[0,0,1.5,1e+21,-3,true,false]');
  });

  it('refuses what JSON cannot hold: non-finite numbers, bigint, functions, symbols', () => {
    expect(() => canonicalJson(Number.NaN)).toThrow(TypeError);
    expect(() => canonicalJson({ a: Number.POSITIVE_INFINITY })).toThrow(/non-finite/);
    expect(() => canonicalJson([1n])).toThrow(/unsupported/);
    expect(() => canonicalJson(() => 1)).toThrow(/unsupported/);
    expect(() => canonicalJson(Symbol('s'))).toThrow(/unsupported/);
  });
});

describe('hashValue (§4.9)', () => {
  it('is the FNV-1a hash of the canonical JSON of the value, independent of key order', () => {
    const state = { warp: 2, bag: ['t0001', 't0002'], pilot: { hull: 5, shield: 3 }, prompt: null };
    expect(hashValue(state)).toBe(fnv1a64(canonicalJson(state)));
    expect(hashValue(reversed(state))).toBe(hashValue(state));
    expect(hashValue({ ...state, warp: 3 })).not.toBe(hashValue(state));
    expect(hashValue({ ...state, bag: ['t0002', 't0001'] })).not.toBe(hashValue(state));
  });
});
