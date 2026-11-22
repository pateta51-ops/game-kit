// K641: permanent proof that a game with no `unseen` option sees no difference: `onlyOne` and `askOrTake` against a
// frozen copy of legal.ts from before K641, on seeded random prompts.
import { describe, expect, it } from 'vitest';
import { applyAction, askOrTake, createGame, draftOf, enumerateAnswers, hashState, onlyOne, type Ctx, type GameRules, type KernelOption, type OnlyOneNotice } from './index.ts';
import { askOrTake as askOrTakeK88, onlyOne as onlyOneK88 } from './fake/legalK88.ts';
import { CONTENT, COUNTER, RULES, type Counter, type CounterTask } from './fake/counter.ts';

const seeded = (seed: number) => (n: number): number => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
};
const options = (rnd: (n: number) => number, hide: boolean): KernelOption[] =>
  Array.from({ length: 1 + rnd(4) }, (_, i) => ({
    id: `o${String(i)}`,
    enabled: rnd(3) !== 0,
    ...(rnd(5) === 0 ? { alone: true as const } : {}),
    ...(hide && rnd(3) === 0 ? { unseen: true as const } : {}),
  }));

describe('a lone unseen answer against the code before K641', () => {
  it('K641 onlyOne: equal on every prompt whose legal answers are all seen; differs only by not taking an unseen one', () => {
    const rnd = seeded(641);
    let seenTaken = 0;
    let unseenAsked = 0;
    for (let i = 0; i < 4000; i += 1) {
      const p = { options: options(rnd, i % 2 === 1), min: rnd(3), max: 1 + rnd(3) };
      const was = onlyOneK88(p);
      const now = onlyOne(p);
      if (p.options.every((o) => !o.enabled || o.unseen !== true)) {
        expect(now).toEqual(was);
        if (was !== null) seenTaken += 1;
      } else if (was !== null && p.options.find((o) => o.id === was.taken)?.unseen === true) {
        expect(now).toBeNull();
        unseenAsked += 1;
      } else expect(now).toEqual(was);
    }
    expect(seenTaken).toBeGreaterThan(100);
    expect(unseenAsked).toBeGreaterThan(20);
  });

  it('K641 askOrTake: whole seeded games with no unseen option end in the same state, notices and asked prompts', () => {
    const play = (take: typeof askOrTake, seed: number) => {
      const notices: OnlyOneNotice[] = [];
      const g: GameRules<Counter> = {
        ...COUNTER,
        handlers: {
          ...COUNTER.handlers,
          turn: (ctx: Ctx<Counter>) => {
            const s = draftOf(ctx);
            if (s.turn >= 30) {
              s.result = { kind: 'won' };
              return;
            }
            s.turn += 1;
            const rnd = seeded(seed * 1000 + s.turn);
            const opts = [...options(rnd, false), { id: 'on', enabled: rnd(2) === 0 }, { id: 'always', enabled: true }].slice(rnd(2));
            ctx.then({ kind: 'chosen' });
            const n = take(ctx, { min: 1, max: 1 + rnd(2), options: opts });
            if (n !== null) notices.push(n);
          },
          chosen: (ctx: Ctx<Counter>, t: CounterTask) => {
            draftOf(ctx).counter += (t.answer ?? []).join('').length;
            ctx.then({ kind: 'turn' });
          },
        },
      };
      let s = createGame(g, { seed: `k641-${String(seed)}` }, RULES, CONTENT).state;
      let asked = 0;
      while (s.result === null) {
        const all = enumerateAnswers(s);
        asked += 1;
        s = applyAction(g, s, all[seeded(seed + asked)(all.length)] as (typeof all)[number], CONTENT).state;
      }
      return { hash: hashState({ ...s, promptSeq: 0 }), notices, asked, seq: s.promptSeq };
    };
    let taken = 0;
    let asked = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const now = play(askOrTake, seed);
      const then = play(askOrTakeK88, seed);
      // K652: askOrTake now counts a taken prompt in promptSeq; the frozen copy does not, so the hashes match with it set aside
      expect({ ...now, seq: 0 }).toEqual({ ...then, seq: 0 });
      expect(now.seq).toBe(then.seq + now.notices.length);
      taken += now.notices.length;
      asked += now.asked;
    }
    expect(taken).toBeGreaterThan(50);
    expect(asked).toBeGreaterThan(50);
  });
});
