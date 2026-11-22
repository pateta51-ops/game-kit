// K599: a zone with a capacity. Cases of the source engine (row sources) restated on the kit's fake game
// (engine-core fake/casesK647): the check runs from engine-core's checkpoint as a state check.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyAction, draftOf, enumerateAnswers, type Ctx, type GameRules } from '../engine-core/index.ts';
import { answer, playGame, startPlay, type Play, type PlayState } from '../engine-core/fake/casesK647.ts';
import { capacityCheck, capacityHandlers, cardsIn, dropRaise, hiddenFrom, limitOf, newZones, overBy, raiseLimit, reveal, viewOf, type OverLimit, type Zone, type Zoned } from './index.ts';

type S = PlayState & Zoned;
const CP = { kind: 'timing.checkpoint' };
const game = (step: (s: Zoned) => void = () => undefined, o: OverLimit = { to: 'discard' }): GameRules<Play> =>
  playGame({ checkpoint: { checks: [capacityCheck<Play>(['hand:a'], o)] } }, {
    ...capacityHandlers<Play>(),
    play: (ctx: Ctx<Play>) => {
      step(draftOf(ctx) as unknown as Zoned);
      ctx.then(CP);
    },
  });
const go = (g: GameRules<Play>, hand: Omit<Partial<Zone>, 'owner'> & { owner?: string | undefined }): S => {
  const s = startPlay(g);
  const s1 = { ...s, zones: { 'hand:a': { seen: 'owner', owner: 'a', cards: [], ...hand }, discard: { seen: 'all', cards: [] } } } as S;
  return applyAction(g, s1, answer(s1, 'go'), null).state as S;
};
const pick = (g: GameRules<Play>, s: S, ...ids: string[]): S => applyAction(g, s, answer(s, ...ids), null).state as S;
const FIVE = ['c1', 'c2', 'c3', 'c4', 'c5'];

describe('K599 zone capacity (cases of the source engine)', () => {
  it('K599 a hand limit of 3 with 5 cards asks the owner for exactly 2, by id; they go to the discard', () => {
    const g = game();
    const s = go(g, { cards: FIVE, limit: 3 });
    expect(s.prompt).toMatchObject({ kind: 'zones.overLimit', seat: 'a', min: 2, max: 2 });
    expect(s.prompt?.options.map((o) => o.id)).toEqual(FIVE);
    const r = pick(g, s, 'c4', 'c2');
    expect(cardsIn(r, 'hand:a')).toEqual(['c1', 'c3', 'c5']);
    expect(cardsIn(r, 'discard')).toEqual(['c4', 'c2']);
    expect(r.prompt).toBeNull();
    expect(r.result).toEqual({ done: true });
  });

  it('K599 a raised limit asks for fewer', () => {
    const g = game((s) => raiseLimit(s, 'hand:a', 'annex'));
    const s = go(g, { cards: FIVE, limit: 3 });
    expect(limitOf(s, 'hand:a')).toBe(4);
    expect(s.prompt).toMatchObject({ min: 1, max: 1 });
  });

  it('K599 a raise given up brings the lower limit back and asks again', () => {
    const g = game((s) => {
      expect(dropRaise(s, 'hand:a', 'annex')).toBe(true);
    });
    const s = go(g, { cards: ['c1', 'c2', 'c3', 'c4'], limit: 3, raises: { annex: 1 } });
    expect(s.zones['hand:a']?.raises).toBeUndefined();
    expect(s.prompt).toMatchObject({ min: 1, max: 1 });
    expect(cardsIn(pick(g, s, 'c1'), 'hand:a')).toEqual(['c2', 'c3', 'c4']);
  });

  it('K599 at or under the limit nothing is asked', () => {
    for (const cards of [['c1', 'c2', 'c3'], ['c1', 'c2']]) {
      const s = go(game(), { cards, limit: 3 });
      expect(s.prompt).toBeNull();
      expect(cardsIn(s, 'hand:a')).toEqual(cards);
      expect(s.result).toEqual({ done: true });
    }
  });

  it('K599 every choice ends the same (all must go): nothing is asked, all leave', () => {
    const s = go(game(), { cards: ['c1', 'c2'], limit: 0 });
    expect(s.prompt).toBeNull();
    expect(cardsIn(s, 'hand:a')).toEqual([]);
    expect(cardsIn(s, 'discard')).toEqual(['c2', 'c1']);
  });

  it('K599 a zone with no limit sees no change', () => {
    expect(newZones({ h: { seen: 'all', cards: ['x'] } })).toEqual({ h: { seen: 'all', cards: ['x'] } });
    const s = go(game(), { cards: FIVE });
    expect(s.prompt).toBeNull();
    expect(overBy(s, 'hand:a')).toBe(0);
    expect(limitOf(s, 'hand:a')).toBeUndefined();
    expect(() => raiseLimit(s, 'hand:a', 'x')).toThrow(/no limit/);
  });

  it('K599 the chooser and discard the game names; a raise from the same source replaces it', () => {
    const s = go(game((z) => {
      raiseLimit(z, 'hand:a', 'x', 2);
      raiseLimit(z, 'hand:a', 'x', 1);
      expect(dropRaise(z, 'hand:a', 'y')).toBe(false);
    }, { to: () => 'discard', chooser: 'b', kind: 'drop' }), { cards: FIVE, limit: 2, seen: 'all' });
    expect(s.prompt).toMatchObject({ kind: 'drop', seat: 'b', zone: 'hand:a', to: 'discard', min: 2, max: 2 });
    expect(newZones({ h: { seen: 'all', limit: 2 } })['h']?.limit).toBe(2);
  });

  it('K599 two raises sum; dropping one of two keeps the other', () => {
    const s = go(game((z) => {
      raiseLimit(z, 'hand:a', 'x', 1);
      raiseLimit(z, 'hand:a', 'y', 2);
      expect(limitOf(z, 'hand:a')).toBe(4);
      expect(dropRaise(z, 'hand:a', 'x')).toBe(true);
    }), { cards: FIVE, limit: 1 });
    expect(s.zones['hand:a']?.raises).toEqual({ y: 2 });
    expect(limitOf(s, 'hand:a')).toBe(3);
    expect(viewOf(s, 'a')['hand:a']?.limit).toBe(3);
    expect(viewOf(s, 'b')['discard']).not.toHaveProperty('limit');
    expect(s.prompt).toMatchObject({ min: 2, max: 2 });
  });

  it('K599 a negative raise lowers the limit, never below 0: all go, no crash', () => {
    const s = go(game((z) => raiseLimit(z, 'hand:a', 'curse', -2)), { cards: ['c1', 'c2'], limit: 1 });
    expect(limitOf(s, 'hand:a')).toBe(0);
    expect(s.prompt).toBeNull();
    expect(cardsIn(s, 'hand:a')).toEqual([]);
    expect(s.result).toEqual({ done: true });
  });

  it('K599 misuse throws EngineBugError: a repeated id, the discard being the zone, no owner and no chooser, a hidden option', () => {
    expect(() => go(game(), { cards: ['g', 'g', 'g'], limit: 1 })).toThrow(/holds g twice/);
    expect(() => go(game(() => undefined, { to: 'hand:a' }), { cards: FIVE, limit: 3 })).toThrow(/to itself/);
    expect(() => go(game(), { cards: FIVE, limit: 3, owner: undefined })).toThrow(/no owner or chooser/);
    expect(() => go(game(() => undefined, { to: 'discard', chooser: 'b' }), { cards: FIVE, limit: 3 })).toThrow(/b chooses .* cannot see c1, c2, c3, c4, c5/);
    expect(() => go(game(), { cards: FIVE, limit: 3, seen: 'count' })).toThrow(/cannot see/);
  });

  it('K599 a chooser shown the cards by the game may choose: no hidden id reaches the prompt', () => {
    const g = game((z) => reveal(z, 'hand:a', FIVE, ['b']), { to: 'discard', chooser: 'b' });
    const s = go(g, { cards: FIVE, limit: 3 });
    const hidden = hiddenFrom(s, 'b');
    expect(s.prompt?.options.map((o) => o.id)).toEqual(FIVE);
    expect(s.prompt?.options.filter((o) => hidden.includes(o.id))).toEqual([]);
  });

  it('K599 two zones over at once: the first is asked, then the second', () => {
    const g = playGame({ checkpoint: { checks: [capacityCheck<Play>(['hand:a', 'hand:b'], { to: 'discard' })] } }, { ...capacityHandlers<Play>(), play: (ctx: Ctx<Play>) => ctx.then(CP) });
    const s0 = startPlay(g);
    const zones = newZones({ 'hand:a': { seen: 'owner', owner: 'a', cards: ['a1', 'a2'], limit: 1 }, 'hand:b': { seen: 'owner', owner: 'b', cards: ['b1', 'b2', 'b3'], limit: 1 }, discard: { seen: 'all' } });
    const s1 = { ...s0, zones } as S;
    const s2 = applyAction(g, s1, answer(s1, 'go'), null).state as S;
    expect(s2.prompt).toMatchObject({ seat: 'a', zone: 'hand:a', min: 1 });
    const s3 = pick(g, s2, 'a1');
    expect(s3.prompt).toMatchObject({ seat: 'b', zone: 'hand:b', min: 2 });
    const s4 = pick(g, s3, 'b1', 'b3');
    expect(cardsIn(s4, 'hand:b')).toEqual(['b2']);
    expect(cardsIn(s4, 'discard')).toEqual(['b3', 'b1', 'a1']);
    expect(s4.result).toEqual({ done: true });
  });
});

describe('K599 README recipe "Capacity" runs', () => {
  it('the README block is this test, and it asks for the excess', () => {
    const s = { zones: newZones({ 'hand:a': { seen: 'owner', owner: 'a', limit: 3, cards: FIVE }, discard: { seen: 'all' } }) };
    // recipe:start
    const checks = [capacityCheck<Play>(['hand:a'], { to: 'discard' })]; // engine-core checkpoint.checks; asks the zone's owner
    const handlers = { ...capacityHandlers<Play>() }; // the prompt's resume task, added to the game's handlers
    raiseLimit(s, 'hand:a', 'annex'); // a rule raises the limit: 3 to 4
    dropRaise(s, 'hand:a', 'annex'); // the raise is given up: back to 3
    // recipe:end
    expect(limitOf(s, 'hand:a')).toBe(3);
    const g = playGame({ checkpoint: { checks } }, { ...handlers, play: (ctx: Ctx<Play>) => ctx.then(CP) });
    expect(go(g, s.zones['hand:a']!).prompt).toMatchObject({ seat: 'a', min: 2, max: 2 });
    const src = readFileSync(fileURLToPath(import.meta.url), 'utf8').replaceAll('\r', '');
    const block = /\/\/ recipe:start\n([\s\S]*?)\s*\/\/ recipe:end/.exec(src)?.[1] ?? 'none';
    const readme = readFileSync(new URL('README.md', import.meta.url), 'utf8').replaceAll('\r', '');
    const lines = block.split('\n').map((l) => l.trim());
    expect(lines.length).toBe(4);
    expect(/## Capacity[\s\S]*?```ts\n([\s\S]*?)```/.exec(readme)?.[1]?.trim().split('\n').map((l) => l.trim())).toEqual(lines);
  });
});

const subsets =(xs: readonly string[], k: number): string[][] =>
  k === 0 ? [[]] : xs.length < k ? [] : [...subsets(xs.slice(1), k - 1).map((r) => [xs[0]!, ...r]), ...subsets(xs.slice(1), k)];

describe('K599 comparison with the brute-force model (stays)', () => {
  it('for every zone of up to 5 cards and every limit: offered answers = all subsets of the excess, result = the model', () => {
    const g = game();
    let asked = 0;
    for (let n = 0; n <= 5; n += 1)
      for (let limit = 0; limit <= n + 1; limit += 1) {
        const cards = FIVE.slice(0, n);
        const s = go(g, { cards, limit });
        const k = Math.max(0, n - limit);
        if (k === 0 || k === n) {
          expect(s.prompt).toBeNull();
          expect(cardsIn(s, 'hand:a')).toEqual(k === 0 ? cards : []);
          continue;
        }
        asked += 1;
        const offered = enumerateAnswers(s).map((a) => [...a.picks].sort().join(','));
        const model = subsets(cards, k).map((x) => x.join(','));
        expect(offered.sort()).toEqual([...model].sort());
        for (const sub of subsets(cards, k)) {
          const r = pick(g, s, ...[...sub].reverse());
          expect(cardsIn(r, 'hand:a')).toEqual(cards.filter((c) => !sub.includes(c)));
          expect(cardsIn(r, 'discard')).toEqual([...sub].reverse());
          expect(r.prompt).toBeNull();
        }
      }
    expect(asked).toBe(10);
  });
});
