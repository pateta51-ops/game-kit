// BUILD_PLAN §4.4, D7: cyrb128 + sfc32 with known-answer tests (ported from Warp's Edge). The expected numbers come from an
// independent implementation of the two published algorithms (Python, explicit 32-bit masks), not from this code.
import { describe, expect, it } from 'vitest';
import {
  drawRandom,
  drawRandomIndex,
  EngineBugError,
  nextUint32,
  randomInt,
  seedRng,
  shuffleInPlace,
  type RngState,
} from './index';

const KNOWN: { seed: string; words: RngState; first6: number[]; afterSix: RngState }[] = [
  {
    seed: '',
    words: [41608494, 3485963809, 1435736333, 1262568316],
    first6: [495173323, 487725788, 2249504753, 4020827468, 757662001, 3330112374],
    afterSix: [79509266, 2878448293, 1579612653, 1262568322],
  },
  {
    seed: 's1',
    words: [3747928884, 3059849859, 2520894988, 462701932],
    first6: [2975513379, 438251047, 1851914781, 3641369329, 45931048, 3115226896],
    afterSix: [1780310861, 139522161, 2665744886, 462701938],
  },
  {
    seed: 's0',
    words: [1368145393, 3508374022, 3073845521, 3826946338],
    first6: [113531161, 645924735, 3317160627, 2910209196, 4072585326, 1981044279],
    afterSix: [3688032731, 1355805632, 774090351, 3826946344],
  },
  {
    seed: 'Ünïcödé 🎲', // code units above U+FFFF are hashed as surrogate pairs
    words: [1464008714, 1182247720, 2381649195, 3248681246],
    first6: [1599970384, 93667487, 3939537918, 1871132566, 1634624048, 1523747925],
    afterSix: [2082113189, 185661503, 1540069180, 3248681252],
  },
];

describe('rng: cyrb128 seeding (D7, §4.4)', () => {
  it.each(KNOWN.map((k) => [k.seed, k.words] as [string, RngState]))(
    'hashes the seed %j to four 32-bit words',
    (seed, words) => {
      expect(seedRng(seed)).toEqual(words);
    },
  );

  it('gives different words for neighbouring seeds (the hash mixes every character)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(JSON.stringify(seedRng(`s${i}`)));
    expect(seen.size).toBe(200);
  });

  it('returns unsigned 32-bit integers', () => {
    for (const word of seedRng('anything at all')) {
      expect(Number.isInteger(word)).toBe(true);
      expect(word).toBeGreaterThanOrEqual(0);
      expect(word).toBeLessThan(2 ** 32);
    }
  });
});

describe('rng: sfc32 stream', () => {
  it.each(KNOWN.map((k) => [k.seed, k.first6, k.afterSix] as [string, number[], RngState]))(
    'produces the known first six outputs for seed %j and the known state after them',
    (seed, first6, afterSix) => {
      const rng = seedRng(seed);
      expect(Array.from({ length: 6 }, () => nextUint32(rng))).toEqual(first6);
      expect(rng).toEqual(afterSix);
    },
  );

  it('advances the state in place and returns unsigned values', () => {
    const rng: RngState = [4294967295, 0, 0, 0];
    expect(nextUint32(rng)).toBe(4294967295);
    expect(rng).toEqual([0, 0, 4294967295, 1]);
  });

  it('moves on from the all-zero state because of the counter word', () => {
    const rng: RngState = [0, 0, 0, 0];
    expect(nextUint32(rng)).toBe(0);
    expect(rng).toEqual([0, 0, 0, 1]);
  });

  it('wraps the counter word at 2^32', () => {
    const rng: RngState = [1, 2, 3, 4294967295];
    expect(nextUint32(rng)).toBe(2);
    expect(rng).toEqual([2, 27, 6291458, 0]);
  });
});

describe('rng: randomInt', () => {
  it('draws the known sequence of bounded integers from seed s1', () => {
    const rng = seedRng('s1');
    const drawn = [1, 2, 3, 10, 100, 1000, 4294967296].map((n) => [n, randomInt(rng, n)]);
    expect(drawn).toEqual([
      [1, 0],
      [2, 1],
      [3, 0],
      [10, 9],
      [100, 48],
      [1000, 896],
      [4294967296, 2382534960],
    ]);
    expect(rng).toEqual([139778057, 2516867494, 3436606897, 462701939]);
  });

  it('rejects a raw word that would bias the result and draws again', () => {
    // 2^32 − 1 is the one word n = 3 cannot use evenly (limit = 2^32 − 1), so the first draw is thrown away.
    const rng: RngState = [4294967295, 0, 0, 0];
    expect(randomInt(rng, 3)).toBe(1);
    expect(rng).toEqual([0, 4294967287, 0, 2]); // two words consumed
  });

  it.each([0, -1, 1.5, Number.NaN, 2 ** 32 + 1])('refuses n = %s', (n) => {
    expect(() => randomInt(seedRng('x'), n)).toThrow(EngineBugError);
  });

  it('is uniform enough: 6,000 draws of randomInt(6) land within 15% of 1,000 per face', () => {
    const rng = seedRng('uniform');
    const faces = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 6000; i += 1) {
      const face = randomInt(rng, 6);
      faces[face] = (faces[face] ?? 0) + 1;
    }
    for (const count of faces) {
      expect(count).toBeGreaterThan(850);
      expect(count).toBeLessThan(1150);
    }
  });
});

describe('rng: shuffleInPlace (Fisher–Yates from the end)', () => {
  it('shuffles 0…9 into the known order for seed s1', () => {
    const rng = seedRng('s1');
    const xs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    shuffleInPlace(rng, xs);
    expect(xs).toEqual([6, 8, 2, 0, 1, 4, 3, 5, 7, 9]);
    expect(rng).toEqual([865330728, 4049576304, 595314969, 462701941]);
  });

  it('shuffles a 52-card deck into the known order for seed "deck"', () => {
    const rng = seedRng('deck');
    const xs = Array.from({ length: 52 }, (_, i) => i);
    shuffleInPlace(rng, xs);
    expect(xs).toEqual([
      20, 26, 32, 37, 45, 40, 1, 17, 35, 38, 51, 34, 21, 30, 31, 6, 50, 44, 13, 22, 24, 25, 3, 15, 28, 23, 0,
      27, 46, 7, 5, 9, 36, 10, 48, 18, 16, 19, 43, 29, 4, 11, 49, 8, 41, 12, 33, 47, 42, 39, 2, 14,
    ]);
    expect(rng).toEqual([3195700106, 516692234, 1599057507, 3866989174]);
  });

  it('leaves an empty or one-element array alone and draws nothing', () => {
    const rng = seedRng('s1');
    const before = [...rng];
    const none: number[] = [];
    const one = [7];
    shuffleInPlace(rng, none);
    shuffleInPlace(rng, one);
    expect(none).toEqual([]);
    expect(one).toEqual([7]);
    expect(rng).toEqual(before);
  });

  it('keeps every element exactly once', () => {
    const rng = seedRng('perm');
    const xs = Array.from({ length: 100 }, (_, i) => i);
    shuffleInPlace(rng, xs);
    expect([...xs].sort((a, b) => a - b)).toEqual(Array.from({ length: 100 }, (_, i) => i));
  });

  it('reaches every permutation of three cards about equally often (6,000 shuffles)', () => {
    const rng = seedRng('perms');
    const seen = new Map<string, number>();
    for (let i = 0; i < 6000; i += 1) {
      const xs = ['a', 'b', 'c'];
      shuffleInPlace(rng, xs);
      const key = xs.join('');
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    expect(seen.size).toBe(6);
    for (const count of seen.values()) {
      expect(count).toBeGreaterThan(850);
      expect(count).toBeLessThan(1150);
    }
  });
});

describe('rng: drawRandom (the deck helper, §4.11)', () => {
  it('removes and returns the element at randomInt(length), keeping the order of the rest', () => {
    const rng = seedRng('bag');
    const twin = seedRng('bag');
    const bag = ['a', 'b', 'c', 'd', 'e'];
    const expected = bag[randomInt(twin, bag.length)];
    const picked = drawRandom(rng, bag);
    expect(picked).toBe(expected);
    expect(bag).toHaveLength(4);
    expect(bag).not.toContain(picked);
    expect(bag).toEqual(['a', 'b', 'c', 'd', 'e'].filter((x) => x !== picked));
    expect(rng).toEqual(twin);
  });

  it('draws every element once when a bag is emptied, in an order fixed by the seed', () => {
    const draw = (seed: string): number[] => {
      const rng = seedRng(seed);
      const bag = Array.from({ length: 20 }, (_, i) => i);
      const out: number[] = [];
      while (bag.length > 0) out.push(drawRandom(rng, bag));
      return out;
    };
    const first = draw('replay');
    expect([...first].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(draw('replay')).toEqual(first);
    expect(draw('other')).not.toEqual(first);
  });

  it('draws from a one-element bag without consuming a word, and refuses an empty bag', () => {
    const rng = seedRng('one');
    const before = [...rng];
    expect(drawRandom(rng, ['only'])).toBe('only');
    // randomInt(1) still draws one word (n = 1 accepts every word)
    expect(rng).not.toEqual(before);
    expect(() => drawRandom(rng, [])).toThrow(EngineBugError);
    expect(() => drawRandomIndex(rng, [])).toThrow(EngineBugError);
  });

  it('picks each of six elements about equally often (6,000 draws)', () => {
    const rng = seedRng('fair');
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 6000; i += 1) {
      const idx = drawRandomIndex(rng, counts);
      counts[idx] = (counts[idx] ?? 0) + 1;
    }
    for (const count of counts) {
      expect(count).toBeGreaterThan(850);
      expect(count).toBeLessThan(1150);
    }
  });
});
