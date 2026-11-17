import { describe, expect, it } from 'vitest';
import { createGame, draftOf, hashValue, seedRng, timingHandlers, type AnswerAction, type Ctx, type Draft, type GameRules, type KernelPrompt, type KernelState, type KernelTask } from '../engine-core/index.ts';
import { cardsIn, newZones } from '../card-zones/index.ts';
import { effectTasks, verbHandler, type VerbTask } from './index.ts';
import { cardPack, type PackEnv, type PackState, type PackStep } from './pack.ts';
import { cardTriggers, validateWhen, type WhenCard } from './when.ts';

// A fake one-seat card game (tests only): seat a discards h1; cards in play react to the discard.
type Task = KernelTask | VerbTask<PackStep, PackEnv>;
interface S extends KernelState, PackState {
  readonly stack: readonly Task[];
  readonly fired: readonly string[];
}
interface G {
  readonly state: S;
  readonly action: AnswerAction;
  readonly task: Task;
  readonly prompt: KernelPrompt;
  readonly event: { readonly seq: number; readonly type: string };
  readonly stamped: never;
  readonly content: { readonly play: readonly string[]; readonly away?: readonly string[] };
  readonly options: { readonly seed: string };
  readonly rules: object;
}
const mark = (ctx: Ctx<G>, _st: PackStep, e: PackEnv): void => {
  const d = draftOf(ctx);
  d.fired = [...d.fired, e.source ?? ''];
};
const pack = cardPack<G>({ custom: { mark: { run: mark, text: () => 'Mark.' } } });
const VERBS = pack.verbs;
const POOL: Readonly<Record<string, WhenCard<PackStep>>> = {
  alpha: { when: [{ on: 'discard', then: [{ op: 'custom', name: 'mark' }, { op: 'destroy', cards: 'all', from: 'play:x', to: 'discard:a' }] }] },
  beta: { when: [{ on: 'discard', then: [{ op: 'custom', name: 'mark' }] }] },
  late: { when: [{ on: 'discard', order: { auto: 'last' }, then: [{ op: 'custom', name: 'mark' }] }] },
  idle: { when: [{ on: 'draw', then: [{ op: 'custom', name: 'mark' }] }] },
};
const RULES: GameRules<G> = {
  handlers: {
    ...timingHandlers<G>({ happen: (ctx, o) => void pack.happen(ctx, o), ...cardTriggers<G, PackEnv>({ pool: POOL, player: () => 'a' }) }),
    verb: verbHandler<G>(VERBS),
  },
  blank: ({ seed }): Draft<S> => {
    const [a, b, c, d] = seedRng(seed);
    return { rng: { a, b, c, d }, stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [], fired: [], zones: newZones({ 'hand:a': { seen: 'owner', owner: 'a', cards: ['h1', 'h2'] }, 'discard:a': { seen: 'all' }, 'play:a': { seen: 'all' }, 'play:x': { seen: 'all' } }) as Draft<S['zones']> };
  },
  setup: (ctx) => {
    const d = draftOf(ctx);
    d.zones['play:a'] = { ...d.zones['play:a'], cards: [...ctx.content.play] } as never;
    d.zones['play:x'] = { ...d.zones['play:x'], cards: [...(ctx.content.away ?? [])] } as never;
    ctx.then(...(effectTasks<PackStep, PackEnv>([{ op: 'discard', cards: 'chosen' }], { seat: 'a', cards: ['h1'] }) as Task[]), { kind: 'timing.triggers' });
  },
  contentHash: (c) => hashValue(c),
};
const run = (play: readonly string[], away?: readonly string[]): S => createGame(RULES, { seed: "s" }, {}, away ? { play, away } : { play }).state;

describe('card-language when (K267)', () => {
  it('K267 a reaction card fires once on its event', () => {
    const s = run(['beta', 'idle']);
    expect(cardsIn(s, 'discard:a')).toEqual(['h1']);
    expect(s.fired).toEqual(['beta']);
    expect(s.timing?.pending).toEqual([]);
  });

  it('K267 two reactions to one event resolve in engine-core order: priority table, then ability key', () => {
    expect(run(['beta', 'alpha']).fired).toEqual(['alpha', 'beta']);
    expect(run(['late', 'beta']).fired).toEqual(['beta', 'late']);
  });

  it('K267 a reaction whose source left play before it resolves is dropped', () => {
    const s = run(['alpha'], ['beta']);
    expect(cardsIn(s, 'discard:a')).toEqual(['beta', 'h1']);
    expect(s.fired).toEqual(['alpha']);
  });

  it('K267 a card out of play does not react', () => {
    expect(run([]).fired).toEqual([]);
  });

  it('K267 the validator refuses a bad when entry', () => {
    expect(validateWhen(VERBS, POOL.alpha?.when, { kinds: ['discard'] })).toEqual([]);
    expect(validateWhen(VERBS, [{ on: 'discrad', then: [{ op: 'nope' }], extra: 1, once: 'twice' }], { kinds: ['discard'] })).toEqual([
      'when[0].extra: unknown key',
      'when[0].on: unknown event kind "discrad"',
      'when[0].once: must be perItem or perInstance',
      'when[0].then[0].op: unknown verb "nope"',
    ]);
    expect(validateWhen(VERBS, [])).toEqual(['when must be a non-empty list']);
  });

  it('K267 cardTriggers throws at build for an if test it does not hold and for optional without may', () => {
    const on = { on: 'discard', then: [{ op: 'custom', name: 'mark' }] } as const;
    expect(() => cardTriggers<G>({ pool: { a: { when: [{ ...on, if: 'rich' }] } }, player: () => 'a' })).toThrow(/test rich/);
    expect(() => cardTriggers<G>({ pool: { a: { when: [{ ...on, optional: true }] } }, player: () => 'a' })).toThrow(/no may/);
    expect(() => cardTriggers<G>({ pool: { a: { when: [{ ...on, optional: true }] } }, player: () => 'a', table: VERBS })).not.toThrow();
  });

  it('K292 timing is carried onto the trigger candidate and validated', () => {
    const t = cardTriggers<G>({ pool: { w: { when: [{ on: 'discard', timing: 'after', then: [{ op: 'custom', name: 'mark' } as never] }] } }, player: () => 'a', sources: () => ['w'] });
    expect(t.triggersFor(run([]), { kind: 'discard' } as never)[0]?.timing).toBe('after');
    expect(validateWhen(VERBS, [{ on: 'discard', timing: 'later', then: [{ op: 'custom', name: 'mark' }] }])).toEqual(['when[0].timing: must be when or after']);
  });

  it('K267 resolveTrigger throws for an entry the pool does not hold', () => {
    const t = cardTriggers<G>({ pool: POOL, player: () => 'a' });
    expect(() => t.resolveTrigger({ s: run([]) } as unknown as Ctx<G>, { id: 1, ability: 'beta#0009', source: 'beta', player: 'a', batch: 1, occurrences: [], once: 'perItem', order: 'silent' })).toThrow(/no when entry/);
  });
});
