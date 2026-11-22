// K583: the made-up two-seat game of the offer-policy tests (tests only), built on a pack given by the caller, so the same
// game runs on the pack as it is and on a frozen copy of an earlier one. Seat a acts with 3 gold; p1 (in play) is the source card.
import { applyAction, canonicalJson, createGame, draftOf, enumerateAnswers, GameOver, hashState, hashValue, seedRng, timingHandlers, type AnswerAction, type Ctx, type Draft, type GameRules, type HandlerTable, type KernelPrompt, type KernelState, type KernelTask, type Occurrence } from '../engine-core/index.ts';
import { cardsIn, locate, newZones, reveal } from '../card-zones/index.ts';
import { askVerb, effectTasks, verbHandler, type VerbTable, type VerbTask } from './index.ts';
import { cannotKnow, dryRunSeat, type Offered, type OfferPolicy, type PackConfig, type PackEnv, type PackState, type PackStep } from './pack.ts';
import { cardTriggers, type WhenCard } from './when.ts';

export type Task = KernelTask | VerbTask<PackStep, PackEnv>;
export interface S extends KernelState, PackState {
  readonly stack: readonly Task[];
  readonly log: readonly { readonly seq: number; readonly type: string }[];
  /** The brute-force run's own notes (never part of the view): what a cost changed is not counted. */
  /** K597 fourth look, with `marks`: every card moved, kept as a key (a mark). */
  readonly got?: Readonly<Record<string, number>>;
  readonly truth?: { readonly hit: boolean; readonly open: readonly number[]; readonly base: string | null };
  /** K597, the brute-force run's notes: the view after the last step marker, the parts whose run changed it (a top-level payThen: i its cost, i + 0.5 its effect), the step running, the view when a cost ended. */
  readonly steps?: { readonly base: string; readonly done: readonly number[]; readonly next: number; readonly paid?: string; readonly part?: readonly number[]; readonly half?: readonly number[]; readonly costs?: readonly { readonly pre?: string; readonly mid?: string }[] };
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
  /** An occurrence kind every occurrence of which is cancelled in its would-window (a replacement that skips it). */
  readonly cancel?: string;
  /** K597 fourth look: `moved` also marks the card in `got`; `viewSafe` flags the custom verbs that read no card and the row `lucky`. */
  readonly marks?: boolean;
  readonly viewSafe?: boolean;
}
const SAFE = ['nothing', 'lone', 'order', 'spend', 'win', 'boom', 'back', 'pairs', 'roll', 'have'];

export const gold = (s: PackState, seat = 'a', k = 'gold'): number => s.res?.[seat]?.[k] ?? 0;
export const GAIN: PackStep = { op: 'gainResource', res: 'gold', amount: 1 };
export const NOTHING: PackStep = { op: 'move', cards: 'top', from: 'aside', to: 'discard' };
export const DRAW: PackStep = { op: 'draw', count: 1 };
export const pay = (amount: number): PackStep => ({ op: 'pay', res: 'gold', amount });
export const LUCKY = { op: 'lucky' } as unknown as PackStep;
const SKIP = ['stack', 'prompt', 'seq', 'promptSeq', 'log', 'timing', 'cardMoves', 'rng', 'forced', 'truth', 'steps'];
/** What the check compares by default, without the brute-force notes. */
export const viewOf = (s: S): string => canonicalJson(Object.fromEntries(Object.entries(s).filter(([k, v]) => !SKIP.includes(k) && !(k === 'marks' && Object.keys(v as object).length === 0))));
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
      evenUp: (s) => cardsIn(s, 'discard:a').some((c) => c.endsWith('2')), drew2: (s) => cardsIn(s, 'hand:a').includes('d2'),
      top: (s) => (cannotKnow(), cardsIn(s, 'deck:a')[0] === 'd1'), owes: (_s, e) => e.owed !== undefined,
      gotD2: (s) => s.got?.d2 === 1, inD2: (s) => 'd2' in (s.got ?? {}), ownD2: (s) => Object.prototype.hasOwnProperty.call(s.got ?? {}, 'd2'), hasD2: (s) => Object.hasOwn(s.got ?? {}, 'd2'),
      descD2: (s) => Object.getOwnPropertyDescriptor(s.got ?? {}, 'd2') !== undefined, p1: (s) => cardsIn(s, 'play:a').includes('p1'),
    },
    counts: { held: (s, e) => cardsIn(s, `hand:${e.seat}`).length },
    seats: () => ['a', 'b'],
    custom: {
      nothing: { run: () => undefined, text: () => 'Nothing.' },
      roll: { run: (ctx, _st, env) => res(ctx, env.seat, ctx.rng.int(6)), text: () => 'Roll.' },
      loop: { run: (ctx, st, env) => ctx.then(...(effectTasks([st], env) as Task[])), text: () => 'Loop.' },
      spend: { run: (ctx, _st, env) => res(ctx, env.seat, 0), text: () => 'Lose all gold.' },
      // A pay step a game verb makes itself; a cost step payable only while an even card lies open.
      dyn: { run: (ctx, _st, env) => ctx.then(...(effectTasks([pay(2)], env) as Task[])), text: () => 'Dyn.' },
      evenPay: { run: () => undefined, payable: (s) => cardsIn(s, 'discard:a').some((c) => c.endsWith('2')), text: () => 'Even.' },
      // Shows seat a its deck's top card, asks, and on the answer reads that card (9 gold if it is even).
      show: {
        run: (ctx, st, env) => (reveal(draftOf(ctx), 'deck:a', cardsIn(ctx.s, 'deck:a').slice(0, 1), [env.seat]), askVerb(ctx, { kind: 'show', seat: env.seat, min: 1, max: 1, options: [{ id: 'ok', enabled: true }] }, st, env)),
        resume: (ctx, _st, env) => void (cardsIn(ctx.s, 'deck:a')[0]?.endsWith('2') && res(ctx, env.seat, 9)),
        text: () => 'Show.',
      },
      who: { run: () => void nested.push(String(dryRunSeat())), text: () => 'Who.' },
      why: { run: (ctx, _st, env) => void nested.push(String((pack as unknown as { judge: (...a: unknown[]) => { reason?: string } }).judge(ctx.s, ctx.content, [GAIN], env).reason)), text: () => 'Why.' },
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
      // K597: between two top-level steps of a real run (`n` = the step just run, 1-based; none before the first).
      step: { run: (ctx, st) => {
        const v = viewOf(ctx.s);
        const n = (st as { n?: number }).n;
        const t = ctx.s.steps ?? { base: v, done: [], next: 0 };
        const got = n === undefined ? [] : t.paid !== undefined ? [...(t.paid !== t.base ? [n - 1] : []), ...(v !== t.paid ? [n - 0.5] : [])] : v !== t.base ? [n - 1] : [];
        const part = t.part ?? [];
        draftOf(ctx).steps = { base: v, done: [...t.done, ...got.filter((u) => !part.includes(u))], half: [...(t.half ?? []), ...got.filter((u) => part.includes(u))], part, next: n ?? 0 } as never;
      }, text: () => 'Step.' },
      // K597: around a cost that is not a top-level payThen (pre2 before it, mid2 when it is paid, end2 after its effect, post2 after it): a part whose cost or effect changed nothing did not resolve in full.
      pre2: { run: (ctx) => void (ctx.s.steps && (draftOf(ctx).steps = { ...ctx.s.steps, costs: [...(ctx.s.steps.costs ?? []), { pre: viewOf(ctx.s) }] } as never)), text: () => 'Pre2.' },
      mid2: { run: (ctx) => void (ctx.s.steps && (draftOf(ctx).steps = { ...ctx.s.steps, costs: [...(ctx.s.steps.costs ?? []).slice(0, -1), { ...ctx.s.steps.costs?.[ctx.s.steps.costs.length - 1], mid: viewOf(ctx.s) }] } as never)), text: () => 'Mid2.' },
      end2: { run: (ctx) => {
        const t = ctx.s.steps;
        const c = t?.costs?.[t.costs.length - 1];
        if (t && c && (c.mid === c.pre || viewOf(ctx.s) === c.mid)) draftOf(ctx).steps = { ...t, part: [...(t.part ?? []), t.paid !== undefined ? t.next + 0.5 : t.next] } as never;
      }, text: () => 'End2.' },
      post2: { run: (ctx) => {
        const t = ctx.s.steps;
        const c = t?.costs?.[t.costs.length - 1];
        if (t && c) draftOf(ctx).steps = { ...t, costs: t.costs?.slice(0, -1), ...(c.mid === undefined && viewOf(ctx.s) !== c.pre ? { part: [...(t.part ?? []), t.paid !== undefined ? t.next + 0.5 : t.next] } : {}) } as never;
      }, text: () => 'Post2.' },
      // K597: first in the effect of a top-level payThen of a real run: the view when its cost ended.
      paid: { run: (ctx) => void (ctx.s.steps && ctx.s.steps.paid === undefined && (draftOf(ctx).steps = { ...ctx.s.steps, paid: viewOf(ctx.s) } as never)), text: () => 'Paid.' },
      start: { run: (ctx) => note(ctx, (t) => ({ ...t, base: viewOf(ctx.s) })), text: () => 'Start.' },
      pre: { run: (ctx, st) => note(ctx, (t) => ({ ...t, hit: t.hit || (t.open.length === 0 && viewOf(ctx.s) !== (t.base ?? base())), open: [...t.open, (st as { n?: number }).n ?? 0] })), text: () => 'Pre.' },
      mark: { run: (ctx) => note(ctx, (t) => ({ ...t, open: t.open.slice(0, -1), base: t.open.length === 1 ? viewOf(ctx.s) : t.base })), text: () => 'Mark.' },
      post: { run: (ctx, st) => note(ctx, (t) => (t.open[t.open.length - 1] !== (st as { n?: number }).n ? t : { ...t, open: t.open.slice(0, -1), base: t.open.length === 1 ? viewOf(ctx.s) : t.base })), text: () => 'Post.' },
    },
    moved: (ctx, m) => (ctx.emit({ type: `${m.op} ${m.card}` }), opts.marks === true && void (draftOf(ctx).got = { ...ctx.s.got, [m.card]: 1 })),
    ...(opts.offer === undefined ? {} : { offer: opts.offer }),
    handlers: (): HandlerTable<G> => RULES.handlers,
    table: () => VERBS,
    ...opts.cfg,
  };
  const pack = make((opts.viewSafe === true ? { ...cfg, custom: Object.fromEntries(Object.entries(cfg.custom ?? {}).map(([k, v]) => [k, SAFE.includes(k) ? { ...v, viewSafe: true } : v])) } : cfg) as never);
  // The game's own verb (a row of its table, not a pack verb): 9 gold if an even card lies in the open discard.
  const VERBS = { ...pack.verbs, lucky: { fields: {}, run: (ctx: Ctx<G>, _st: PackStep, env: PackEnv | undefined) => void (cardsIn(ctx.s, 'discard:a').some((c) => c.endsWith('2')) && res(ctx, env?.seat ?? 'a', 9)), text: () => 'Lucky.', ...(opts.viewSafe === true ? { viewSafe: true } : {}) } } as unknown as VerbTable<G, PackStep, PackEnv>;
  const RULES: GameRules<G> = {
    handlers: {
      ...timingHandlers<G>({
        happen: (ctx, o) => void pack.happen(ctx, o),
        ...(opts.cancel === undefined ? {} : { replacementsFor: (_s: S, o: Occurrence) => (o.kind === opts.cancel ? [{ id: 9000, controller: 'b', cls: 1, label: 'Skip' }] : []), applyReplacement: () => 'skipped' as const }),
        ...(opts.pool ? cardTriggers<G>({ pool: opts.pool, player: () => 'b', active: (s, c) => locate(s, c) !== undefined, table: pack.verbs }) : {}),
      }),
      verb: verbHandler<G>(VERBS),
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

// K583: random small effects on the made-up game (fixed seeds, no clock). `rnd` is a plain generator kept in the test.
export const rng = (seed: number) => {
  let x = seed;
  const rnd = (n: number): number => {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    return (x >>> 8) % n;
  };
  return { rnd, of: <T,>(xs: readonly T[]): T => xs[rnd(xs.length)] as T };
};
const custom = (name: string): PackStep => ({ op: 'custom', name });
// K583: the random effect generator of the check's tests (also K597's comparison). K597: `more` adds tests that read a card drawn or milled (the same sequence without it).
export const gen = (seed: number, more = false) => {
  const { rnd, of } = rng(seed);
  const reads = more ? ['drew2', 'evenUp', 'gotD2', 'inD2', 'ownD2', 'hasD2', 'descD2', 'p1'] : [];
  const leaf = (): PackStep => of<() => PackStep>([
    () => GAIN, () => NOTHING, () => NOTHING, () => DRAW, () => pay(1), () => pay(9), () => custom('nothing'), () => custom('lone'), () => custom('order'), () => custom('roll'),
    () => custom('win'), () => custom('boom'), () => custom('back'), () => custom('pairs'), () => custom('nest'), () => custom('attempt'), () => custom('spend'),
    () => ({ op: 'adjust', key: 'gold', by: -1 }), () => ({ op: 'adjust', key: 'gold', by: 1, max: 3 }), () => ({ op: 'gainResource', res: 'gold', amount: 'X' }),
    () => ({ op: 'discard', cards: 'chosen' }), () => ({ op: 'move', cards: 'chosen', to: 'discard' }), () => ({ op: 'exhaust' }), () => ({ op: 'ready' }), () => ({ op: 'shuffle', zone: of(['deck', 'aside', 'play']) }),
    () => ({ op: 'lookAt', cards: 'all', from: of(['hand', 'play', 'deck']) }), () => ({ op: 'reveal', cards: 'all', from: of(['hand', 'play']) }), () => ({ op: 'lookAt', count: 1 }),
    () => ({ op: 'if', test: of(['two', 'h2', 'poor', 'rich', 'b3', 'ends', ...reads]), then: [of([GAIN, DRAW, NOTHING])] }),
    () => ({ op: 'later', at: 'end', then: [GAIN] }), () => ({ op: 'search', zone: 'deck', filter: 'even' }), () => ({ op: 'search', zone: 'aside' }),
    ...(more ? [(): PackStep => ({ op: 'mill', count: 1 }), (): PackStep => ({ op: 'if', test: of(reads), then: [GAIN] })] : []),
  ])();
  const eff = (depth: number): PackStep[] => Array.from({ length: 1 + rnd(2) }, () => step(depth));
  const cost = (): PackStep[] => Array.from({ length: 1 + rnd(2) }, () => of<() => PackStep>([() => pay(1), () => pay(2), () => pay(9), () => custom('have'), () => custom('nothing'), () => ({ op: 'discard', count: 1 }), () => ({ op: 'exhaust' }), () => ({ op: 'mill', count: 1 })])());
  const step = (depth: number): PackStep => (depth === 0 || rnd(4) === 0 ? leaf() : of<() => PackStep>([
    () => ({ op: 'may', then: eff(depth - 1) }),
    () => ({ op: 'chooseOption', options: [eff(depth - 1), eff(depth - 1)] }),
    () => ({ op: 'chooseCards', zone: of(['hand', 'hand', 'hand:b', 'aside', 'deck']), min: rnd(3), max: 2 + rnd(2), then: eff(depth - 1) }),
    () => ({ op: 'chooseCards', zone: of(['hand', 'hand:b']), min: rnd(2), max: 1, then: eff(depth - 1) }),
    () => ({ op: 'orderEffects', effects: Array.from({ length: 2 + rnd(2) }, () => eff(depth - 1)) }),
    () => ({ op: 'chooseNumber', max: 2, then: eff(depth - 1) }),
    () => ({ op: 'seq', steps: [{ op: 'scout', count: 2 }, ...eff(depth - 1)] }),
    () => ({ op: 'if', test: of(['two', 'h2', 'poor', 'b3', ...reads]), then: eff(depth - 1) }),
    () => ({ op: 'payThen', cost: cost(), then: eff(depth - 1) }),
    () => ({ op: 'choosePayment', ways: [cost(), cost()], then: eff(depth - 1) }),
    () => ({ op: 'eachPlayer', then: eff(depth - 1) }),
    () => ({ op: 'choosePlayer', then: eff(depth - 1) }),
    () => ({ op: 'forEach', then: eff(depth - 1) }),
    () => ({ op: 'count', what: 'held', then: eff(depth - 1) }),
  ])());
  return eff;
};
// K597 interface row (moved from its test; also K598): exhaustive real play of every answer, graded full, part or none.
export const has = (e: Eff, f: (st: PackStep) => boolean): boolean => e.some((st) => f(st) || Object.values(st).some((v) => Array.isArray(v) && typeof v[0] === 'object' && (Array.isArray(v[0]) ? (v as Eff[]).some((o) => has(o, f)) : has(v as Eff, f))));
export const shortOf = (e: Eff, r: { answer: string }, t: string | undefined): boolean => r.answer === 'part' && t === 'full' && has(e, (st) => st.op === 'chooseCards' && (st.min ?? 0) >= 2);
export const truth = (g: { readonly RULES: GameRules<G> }, effect: Eff, seed: string): string | undefined => {
  const c = (name: string): PackStep => ({ op: 'custom', name });
  // A cost that is not a top-level payThen: two parts, its cost and its effect, at any depth.
  const wrap = (e: Eff): PackStep[] => e.map((st): PackStep => {
    const out = Object.fromEntries(Object.entries(st).map(([k, v]) => [k, Array.isArray(v) && typeof v[0] === 'object' ? (Array.isArray(v[0]) ? (v as Eff[]).map(wrap) : wrap(v as Eff)) : v as unknown])) as unknown as PackStep;
    if (out.op !== 'payThen' && out.op !== 'choosePayment') return out;
    return { op: 'seq', steps: [c('pre2'), { ...out, then: [c('mid2'), ...out.then, c('end2')] }, c('post2')] };
  });
  const top = (st: PackStep): PackStep => (st.op === 'payThen' ? { ...st, cost: wrap(st.cost as Eff), then: [c('paid'), ...wrap(st.then as Eff)] } : wrap([st])[0] ?? st);
  const content = { effect: [{ op: 'custom', name: 'step' } as PackStep, ...effect.flatMap((st, i): PackStep[] => [top(st), { op: 'custom', name: 'step', n: i + 1 }])] };
  const units = effect.reduce((n, st) => n + (st.op === 'payThen' ? 2 : 1), 0);
  let left = 3000;
  let best = 0;
  const grade = (done: number, half: number): number => (done === units ? 2 : done + half > 0 ? 1 : 0);
  const walk = (s: S): boolean => {
    if ((left -= 1) < 0) return false;
    const t = s.steps;
    if (s.result !== null) {
      // K597 fourth look: the step that ended the game resolves, and the steps after it do not count against full.
      const i = t?.next ?? 0;
      const now = effect.flatMap((st, j) => (j < i ? [] : st.op === 'payThen' ? [j, j + 0.5] : [j])).filter((u) => !(t?.done ?? []).includes(u));
      best = Math.max(best, grade((t?.done.length ?? 0) + now.length, (t?.half ?? []).filter((u) => u < i).length));
      return true;
    }
    const p = s.prompt;
    if (p === null) return (best = Math.max(best, grade(t?.done.length ?? 0, t?.half?.length ?? 0))), true;
    const ordered = p.ordered === true || p.kind === 'orderCards' || p.kind === 'orderEffects';
    for (const a of enumerateAnswers({ ...s, prompt: { ...p, ordered } })) if (!walk(applyAction(g.RULES, s, a, content).state)) return false;
    return true;
  };
  try {
    if (!walk(createGame(g.RULES, { seed }, {}, content).state)) return undefined;
  } catch {
    return undefined;
  }
  return (['none', 'part', 'full'] as const)[best];
};
