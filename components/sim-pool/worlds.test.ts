// K653: an older engine's sampled-worlds case restated on a made-up look-then-choose game (sim-pool has no world
// builder: a world is one `reshuffleHidden` call with its own DriverRng; the bound-card rule is the game's).
import { describe, expect, it } from 'vitest';
import { draftOf, hashValue, seedRng, type AnswerAction, type Ctx, type Draft, type GameRules, type KernelEvent, type KernelPrompt, type KernelState, type KernelTask } from '../engine-core/index.ts';
import { botDriver, DriverRng, playOne, type SimGame } from './index.ts';

interface LState extends KernelState {
  readonly decks: Readonly<Record<string, readonly string[]>>;
  readonly looked: readonly { readonly by: string; readonly deck: string; readonly at: number }[];
  readonly score: Readonly<Record<string, number>>;
}
interface L {
  readonly state: LState;
  readonly action: AnswerAction;
  readonly task: KernelTask;
  readonly prompt: KernelPrompt;
  readonly event: KernelEvent;
  readonly stamped: never;
  readonly content: null;
  readonly options: { readonly seed: string };
  readonly rules: null;
}

const rules: GameRules<L> = {
  handlers: {
    look: (ctx: Ctx<L>) => {
      draftOf(ctx).looked = [{ by: 'b', deck: 'b', at: 0 }, { by: 'a', deck: 'a', at: 0 }];
      ctx.ask({ min: 1, max: 1, seat: 'a', options: [{ id: 'keep', enabled: true }, { id: 'bury', enabled: true }] }, { kind: 'done' });
    },
    done: (ctx: Ctx<L>, task) => { draftOf(ctx).result = { pick: task.answer?.[0] }; },
  },
  blank(options): Draft<LState> {
    const [a, b, c, d] = seedRng(options.seed);
    const deck = (p: string) => [1, 2, 3, 4, 5, 6].map((n) => `${p}${String(n)}`);
    return { rng: { a, b, c, d }, decks: { a: deck('a'), b: deck('b') }, looked: [], score: { a: 2, b: 3 }, stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [] };
  },
  setup: (ctx: Ctx<L>) => ctx.then({ kind: 'look' }),
  contentHash: () => hashValue('k653-look'),
};

// The seat's view: scores, deck sizes and the cards its own effects looked at.
const view = (s: LState, seat: string) => ({ score: s.score, counts: Object.fromEntries(Object.entries(s.decks).map(([k, v]) => [k, v.length])), seen: s.looked.filter((l) => l.by === seat).map((l) => s.decks[l.deck]?.[l.at]) });
const reshuffle = (keepBound: boolean) => (s: LState, seat: KernelPrompt['seat'], rng: DriverRng): LState => {
  const decks: Record<string, string[]> = {};
  for (const [k, cards] of Object.entries(s.decks)) {
    const fixed = keepBound ? s.looked.filter((l) => l.by === seat && l.deck === k).map((l) => l.at) : [];
    const free = cards.map((_, i) => i).filter((i) => !fixed.includes(i));
    const pool = free.map((i) => cards[i] as string);
    for (let i = pool.length - 1; i > 0; i -= 1) { const j = rng.int(i + 1); [pool[i], pool[j]] = [pool[j] as string, pool[i] as string]; }
    const out = [...cards];
    free.forEach((i, n) => { out[i] = pool[n] as string; });
    decks[k] = out;
  }
  return { ...s, decks };
};
const sim = (keepBound: boolean): SimGame<L> => ({
  rules,
  content: () => null,
  start: (spec) => ({ options: { seed: spec.seed }, rules: null }),
  driver: (name) => botDriver<L, ReturnType<typeof view>>({ name, choose: (v, answers) => answers.find((x) => x.picks[0] === (Number(String(v.seen[0]).slice(1)) <= 3 ? 'keep' : 'bury')) as AnswerAction }, (s, seat) => view(s, seat)),
  reshuffleHidden: reshuffle(keepBound),
});

describe('K653 sim-pool: sampled worlds keep a card the deciding seat looked at', () => {
  it('S B25: a card bound by the deciding seat keeps its identity in all 20 worlds; one bound by the other seat is pooled; visible cards and counts stay (the game supplies the bound-card rule in reshuffleHidden)', () => {
    const g = sim(true);
    const r = playOne(g, null, { index: 0, seed: 'k653', driver: 'honest' });
    expect(r.error).toBeUndefined();
    const s = rules.blank({ seed: 'k653' }, null, null) as LState;
    const at = { ...s, looked: [{ by: 'b', deck: 'b', at: 0 }, { by: 'a', deck: 'a', at: 0 }] };
    const worlds = Array.from({ length: 20 }, (_, i) => (g.reshuffleHidden as ReturnType<typeof reshuffle>)(at, 'a', new DriverRng(`world-${String(i)}`)));
    expect(new Set(worlds.map((w) => w.decks.a?.[0]))).toEqual(new Set(['a1']));
    expect(new Set(worlds.map((w) => w.decks.a?.slice(1).join())).size).toBeGreaterThan(1);
    expect(new Set(worlds.map((w) => w.decks.b?.[0])).size).toBeGreaterThan(1);
    expect(new Set(worlds.map((w) => hashValue(view(w, 'a'))))).toEqual(new Set([hashValue(view(at, 'a'))]));
  });
  it('S B25: the hidden-shuffle check passes an honest bot when the bound card is kept, and flags the run when the game pools it', () => {
    const seeds = Array.from({ length: 12 }, (_, i) => `k653-${String(i)}`);
    const run = (keep: boolean) => seeds.map((seed) => playOne(sim(keep), null, { index: 0, seed, driver: 'honest' }, undefined, { hidden: true }));
    expect(run(true).map((r) => r.error ?? 'ok')).toEqual(seeds.map(() => 'ok'));
    expect(run(false).some((r) => r.error?.startsWith('hidden-info:'))).toBe(true);
  });
});
