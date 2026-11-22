// K583: the made-up two-seat game of the offer-policy tests (tests only), built on a pack given by the caller, so the same
// game runs on the pack as it is and on a frozen copy of an earlier one. Seat a acts with 3 gold; p1 (in play) is the source card.
import { applyAction, canonicalJson, createGame, draftOf, GameOver, hashState, hashValue, seedRng, timingHandlers, type AnswerAction, type Ctx, type Draft, type GameRules, type HandlerTable, type KernelPrompt, type KernelState, type KernelTask, type Occurrence } from '../engine-core/index.ts';
import { cardsIn, locate, newZones } from '../card-zones/index.ts';
import { askVerb, effectTasks, verbHandler, type VerbTable, type VerbTask } from './index.ts';
import { cannotKnow, type Offered, type OfferPolicy, type PackConfig, type PackEnv, type PackState, type PackStep } from './pack.ts';
import { cardTriggers, type WhenCard } from './when.ts';

export type Task = KernelTask | VerbTask<PackStep, PackEnv>;
export interface S extends KernelState, PackState {
  readonly stack: readonly Task[];
  readonly log: readonly { readonly seq: number; readonly type: string }[];
  /** The brute-force run's own notes (never part of the view): what a cost changed is not counted. */
  readonly truth?: { readonly hit: boolean; readonly open: readonly number[]; readonly base: string | null };
}
export interface Content { readonly effect: readonly PackStep[]; readonly env?: PackEnv }
export interface G {
  readonly state: S;
  readonly action: AnswerAction;
  readonly task: Task;
  readonly prompt: KernelPrompt;
  readonly event: { readonly seq: number; readonly type: string };
  readonly stamped: never;
  readonly content: Content;
  readonly options: { readonly seed: string };
  readonly rules: object;
}
export type Eff = readonly PackStep[];
interface BasePack {
  readonly verbs: VerbTable<G, PackStep, PackEnv>;
  readonly happen: (ctx: Ctx<G>, occ: Occurrence) => boolean;
  readonly wouldChange: (s: S, content: Content, steps: Eff, env: PackEnv) => Offered;
}
export interface GameOpts {
  readonly offer?: OfferPolicy<S>;
  /** The other seat's hidden hand (default b1 b2 b3) and the acting seat's deck (default d1 d2). */
  readonly b?: readonly string[];
  readonly deck?: readonly string[];
  readonly cfg?: Partial<PackConfig<G>>;
  /** Card data with `when` entries; a card is live wherever it is. */
  readonly pool?: Readonly<Record<string, WhenCard<PackStep>>>;
}

export const gold = (s: PackState, seat = 'a', k = 'gold'): number => s.res?.[seat]?.[k] ?? 0;
export const GAIN: PackStep = { op: 'gainResource', res: 'gold', amount: 1 };
export const NOTHING: PackStep = { op: 'move', cards: 'top', from: 'aside', to: 'discard' };
export const DRAW: PackStep = { op: 'draw', count: 1 };
export const pay = (amount: number): PackStep => ({ op: 'pay', res: 'gold', amount });
const SKIP = ['stack', 'prompt', 'seq', 'promptSeq', 'log', 'timing', 'cardMoves', 'rng', 'forced', 'truth'];
/** What the check compares by default, without the brute-force notes. */
export const viewOf = (s: S): string => canonicalJson(Object.fromEntries(Object.entries(s).filter(([k]) => !SKIP.includes(k))));
/** Did this line of play change the game, not counting what a cost marked by `marked` changed? */
export const changed = (s: S, base: string): boolean => (s.truth?.hit ?? false) || ((s.truth?.open.length ?? 0) === 0 && viewOf(s) !== (s.truth?.base ?? base));
/** The same effect with each `payThen` wrapped in the brute-force notes: `pre`, the cost, `mark` before `then`, `post`. */
export const marked = (steps: Eff, next = { id: 0 }): PackStep[] => steps.map((st): PackStep => {
  const out = Object.fromEntries(Object.entries(st).map(([k, v]) => [k, Array.isArray(v) && typeof v[0] === 'object' ? (Array.isArray(v[0]) ? (v as Eff[]).map((o) => marked(o, next)) : marked(v as Eff, next)) : v as unknown])) as unknown as PackStep;
  if (out.op !== 'payThen') return out;
  const n = (next.id += 1);
  return { op: 'seq', steps: [{ op: 'custom', name: 'pre', n }, { ...out, then: [{ op: 'custom', name: 'mark' }, ...out.then] as Eff }, { op: 'custom', name: 'post', n }] };
});

export const offerGame = <P extends BasePack>(make: (cfg: never) => P, opts: GameOpts = {}) => {
  const nested: string[] = [];
  const res = (ctx: Ctx<G>, seat: string, n: number): void => void (draftOf(ctx).res = { ...ctx.s.res, [seat]: { gold: n } });
  const note = (ctx: Ctx<G>, f: (t: NonNullable<S['truth']>) => S['truth']): void => void (draftOf(ctx).truth = f(ctx.s.truth ?? { hit: false, open: [], base: null }) as never);
  const base = (): string => viewOf(createGame(RULES, { seed: 's' }, {}, { effect: [] }).state);
  const cfg: PackConfig<G> = {
    filters: { even: (_s, c) => c.endsWith('2') },
    tests: {
      rich: (s, e) => gold(s, e.seat) >= 9, two: (_s, e) => e.cards?.length === 2, h2: (_s, e) => e.cards?.join() === 'h2', poor: (s, e) => gold(s, e.seat) === 2,
      ends: (_s, e) => ['h2', 'd1'].every((c) => e.cards?.includes(c)), b3: (_s, e) => e.cards?.includes('b3') ?? false,
      top: (s) => (cannotKnow(), cardsIn(s, 'deck:a')[0] === 'd1'), owes: (_s, e) => e.owed !== undefined,
    },
    counts: { held: (s, e) => cardsIn(s, `hand:${e.seat}`).length },
    seats: () => ['a', 'b'],
    custom: {
      nothing: { run: () => undefined, text: () => 'Nothing.' },
      roll: { run: (ctx, _st, env) => res(ctx, env.seat, ctx.rng.int(6)), text: () => 'Roll.' },
      loop: { run: (ctx, st, env) => ctx.then(...(effectTasks([st], env) as Task[])), text: () => 'Loop.' },
      spend: { run: (ctx, _st, env) => res(ctx, env.seat, 0), text: () => 'Lose all gold.' },
      nest: { run: (ctx, _st, env) => void nested.push(pack.wouldChange(ctx.s, ctx.content, [GAIN], env)), text: () => 'Nest.' },
      order: {
        run: (ctx, st, env) => askVerb(ctx, { kind: 'order', seat: env.seat, min: 3, max: 3, ordered: true, options: ['x', 'y', 'z'].map((id) => ({ id, enabled: true })) }, st, env),
        resume: (ctx, _st, env, a) => void (a.join('') === 'zyx' && res(ctx, env.seat, 0)),
        text: () => 'Order.',
      },
      lone: {
        run: (ctx, st, env) => askVerb(ctx, { kind: 'lone', seat: env.seat, min: 1, max: 1, options: [{ id: 'stay', enabled: true }, { id: 'other', enabled: true, alone: true }] }, st, env),
        resume: (ctx, _st, env, a) => void (a[0] === 'other' && res(ctx, env.seat, 0)),
        text: () => 'Lone.',
      },
      have: { run: () => undefined, payable: (s, _st, e) => gold(s, e.seat) >= 2, text: () => 'Have 2 gold.' },
      // K583: ends the game; throws outside the kernel's errors; a prompt whose handler throws on an answer the screen never sends.
      win: { run: (ctx, _st, env) => {
        (draftOf(ctx) as { result: unknown }).result = { winner: env.seat };
        throw new GameOver();
      }, text: () => 'Win.' },
      boom: { run: () => {
        throw new TypeError('boom');
      }, text: () => 'Boom.' },
      back: {
        run: (ctx, st, env) => askVerb(ctx, { kind: 'back', seat: env.seat, min: 1, max: 1, options: [{ id: 'stay', enabled: true }, { id: 'back', enabled: true, alone: true }] }, st, env),
        resume: (_ctx, _st, _env, a) => {
          if (a[0] === 'back') throw new TypeError('back is the screen\'s own');
        },
        text: () => 'Back.',
      },
      pairs: {
        run: (ctx, st, env) => askVerb(ctx, { kind: 'pairs', seat: env.seat, min: 2, max: 2, options: ['x1', 'y1', 'x2'].map((id) => ({ id, enabled: true })) }, st, env),
        resume: (_ctx, _st, _env, a) => {
          if (a[0]?.[0] === a[1]?.[0]) throw new TypeError('a pair of the same kind');
        },
        text: () => 'Pairs.',
      },
      // The game's moment for triggers (engine-core timing): a game pushes it at its effect end.
      triggers: { run: (ctx) => ctx.then({ kind: 'timing.triggers' }), text: () => 'Triggers.' },
      peek: { run: (ctx, _st, env) => (cannotKnow(), void (cardsIn(ctx.s, 'hand:b')[0] === 'b1' && res(ctx, env.seat, 9))), text: () => 'Peek.' },
      // Case 25: attempt to draw, otherwise gain 1 gold (the game's own verb, on the pack's check).
      attempt: { run: (ctx, _st, env) => ctx.then(...(effectTasks([pack.wouldChange(ctx.s, ctx.content, [DRAW], env) === 'no' ? GAIN : DRAW], env) as Task[])), text: () => 'Attempt.' },
      start: { run: (ctx) => note(ctx, (t) => ({ ...t, base: viewOf(ctx.s) })), text: () => 'Start.' },
      pre: { run: (ctx, st) => note(ctx, (t) => ({ ...t, hit: t.hit || (t.open.length === 0 && viewOf(ctx.s) !== (t.base ?? base())), open: [...t.open, (st as { n?: number }).n ?? 0] })), text: () => 'Pre.' },
      mark: { run: (ctx) => note(ctx, (t) => ({ ...t, open: t.open.slice(0, -1), base: t.open.length === 1 ? viewOf(ctx.s) : t.base })), text: () => 'Mark.' },
      post: { run: (ctx, st) => note(ctx, (t) => (t.open[t.open.length - 1] !== (st as { n?: number }).n ? t : { ...t, open: t.open.slice(0, -1), base: t.open.length === 1 ? viewOf(ctx.s) : t.base })), text: () => 'Post.' },
    },
    moved: (ctx, m) => ctx.emit({ type: `${m.op} ${m.card}` }),
    ...(opts.offer === undefined ? {} : { offer: opts.offer }),
    handlers: (): HandlerTable<G> => RULES.handlers,
    ...opts.cfg,
  };
  const pack = make(cfg as never);
  const RULES: GameRules<G> = {
    handlers: {
      ...timingHandlers<G>({
        happen: (ctx, o) => void pack.happen(ctx, o),
        ...(opts.pool ? cardTriggers<G>({ pool: opts.pool, player: () => 'b', active: (s, c) => locate(s, c) !== undefined, table: pack.verbs }) : {}),
      }),
      verb: verbHandler<G>(pack.verbs),
    },
    blank: ({ seed }): Draft<S> => {
      const [a, b, c, d] = seedRng(seed);
      return {
        rng: { a, b, c, d }, stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [], res: { a: { gold: 3 } },
        zones: newZones({
          'deck:a': { seen: 'count', owner: 'a', cards: [...(opts.deck ?? ['d1', 'd2'])] }, 'hand:a': { seen: 'owner', owner: 'a', cards: ['h1', 'h2'] },
          'discard:a': { seen: 'all' }, 'play:a': { seen: 'all', cards: ['p1'] }, aside: { seen: 'all' },
          'hand:b': { seen: 'owner', owner: 'b', cards: [...(opts.b ?? ['b1', 'b2', 'b3'])] }, 'deck:b': { seen: 'count' },
        }) as Draft<S['zones']>,
      };
    },
    setup: (ctx) => ctx.then(...(effectTasks(ctx.content.effect, ctx.content.env ?? { seat: 'a', source: 'p1' }) as Task[])),
    contentHash: (c) => hashValue(c),
  };
  /** Plays `effect` with the answers given; `open: true` lets it end on a prompt. */
  const play = (effect: Eff, answers: readonly (readonly string[])[] = [], env?: PackEnv, open = false): { s: S; prompts: KernelPrompt[] } => {
    const content = env === undefined ? { effect } : { effect, env };
    let { state } = createGame(RULES, { seed: 's' }, {}, content);
    const prompts: KernelPrompt[] = [];
    for (const picks of answers) {
      if (state.prompt === null) throw new Error(`no prompt for ${picks.join(',')}`);
      prompts.push(state.prompt);
      state = applyAction(RULES, state, { kind: 'answer', promptId: state.prompt.id, picks }, content).state;
    }
    if (state.prompt !== null && !open) throw new Error(`a prompt is still open: ${String(state.prompt.kind)}`);
    return { s: state, prompts };
  };
  /** The state after `before` ran, and its content. */
  const at = (before: Eff = []): { s: S; content: Content } => ({ s: createGame(RULES, { seed: 's' }, {}, { effect: before }).state, content: { effect: before } });
  /** The check on the state after `before`; throws when it touched the state. */
  const check = (steps: Eff, env: PackEnv = { seat: 'a', source: 'p1' }, before: Eff = []): Offered => {
    const { s, content } = at(before);
    const h = hashState(s);
    const r = pack.wouldChange(s, content, steps, env);
    if (hashState(s) !== h) throw new Error('the check changed the state');
    return r;
  };
  return { pack, play, check, at, nested, RULES };
};
