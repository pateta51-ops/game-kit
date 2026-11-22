// K589: a shared once-per limit (key, scope turn/round/phase/game, optionally per card and per seat), cleared at turn-flow's
// edges. Cases restated from three older engines' once-per flags on a made-up two-seat game.
import { describe, expect, it } from 'vitest';
import { applyAction, blocked, createGame, hashValue, seedRng, type AnswerAction, type Ctx, type Draft, type GameRules, type KernelEvent, type KernelOption, type KernelPrompt, type KernelState, type KernelTask } from '../engine-core/index.ts';
import { clearLimits, flowHandlers, flowOf, limitOption, limitsOf, limitUsed, startFlow, markLimit, type FlowConfig, type FlowState, type LimitRef, type LimitTable, type LimitsState } from './index.ts';

interface LState extends KernelState {
  readonly flow?: FlowState;
  readonly limits?: LimitsState;
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

const TABLE: LimitTable = {
  once: { scope: 'turn' }, // shared by every card that names it
  card: { scope: 'turn', perCard: true },
  round: { scope: 'round', perSeat: true },
  phase: { scope: 'phase' },
  game: { scope: 'game', perCard: true },
};
const REFS: readonly LimitRef[] = [{ key: 'once', card: 'x' }, { key: 'once', card: 'y' }, { key: 'card', card: 'x' }, { key: 'card', card: 'y' }, { key: 'round' }, { key: 'phase' }, { key: 'game', card: 'x' }, { key: 'game', card: 'y' }];
const idOf = (r: LimitRef): string => `${r.key}:${r.card ?? ''}`;
const refOf = (id: string): LimitRef => REFS.find((r) => idOf(r) === id) as LimitRef;

const ask = (ctx: Ctx<L>): void =>
  ctx.ask({ min: 1, max: 1, options: [...REFS.map((r) => limitOption(ctx.s, TABLE, r, idOf(r))), { id: 'next', enabled: true }], seat: flowOf(ctx.s)?.seat ?? '' }, { kind: 'use' });
const game = (rounds = 3): GameRules<L> => {
  const flow: FlowConfig<L> = { phases: [{ id: 'p1' }, { id: 'p2' }], seats: () => ['a', 'b'], rounds, step: (ctx) => ask(ctx) };
  return {
    handlers: {
      ...flowHandlers(flow),
      use: (ctx: Ctx<L>, task) => {
        const pick = task.answer?.[0] as string;
        if (pick === 'next') return;
        markLimit(ctx, TABLE, refOf(pick));
        ask(ctx);
      },
    },
    blank(options): Draft<LState> {
      const [a, b, c, d] = seedRng(options.seed);
      return { rng: { a, b, c, d }, stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [] };
    },
    setup: startFlow,
    contentHash: () => hashValue('turn-flow-limits'),
  };
};

const G = game();
const start = (): LState => createGame(G, { seed: 'k589' }, null, null).state;
const pick = (s: LState, id: string): LState => applyAction(G, s, { kind: 'answer', promptId: (s.prompt as KernelPrompt).id, picks: [id] }, null).state;
const picks = (s: LState, ids: readonly string[]): LState => ids.reduce(pick, s);
const opt = (s: LState, id: string): KernelOption => s.prompt?.options.find((o) => o.id === id) as KernelOption;
const at = (s: LState): string => `${String(flowOf(s)?.round)}:${flowOf(s)?.seat ?? ''}:${flowOf(s)?.phase ?? ''}`;

describe('turn-flow once-per limits (K589)', () => {
  it('used this turn: the option is barred with its reason for the rest of the turn, and open again at the next turn', () => {
    let s = pick(start(), 'card:x');
    expect(at(s)).toBe('1:a:p1');
    expect(opt(s, 'card:x')).toMatchObject({ enabled: false, reason: 'used', why: 'used this turn' });
    expect(blocked(s.prompt).map((b) => b.id)).toEqual(['card:x']);
    s = pick(s, 'next');
    expect(at(s)).toBe('1:a:p2');
    expect(opt(s, 'card:x').enabled).toBe(false);
    s = pick(s, 'next');
    expect(at(s)).toBe('1:b:p1');
    expect(opt(s, 'card:x').enabled).toBe(true);
    expect(limitUsed(s, TABLE, { key: 'card', card: 'x' })).toBe(false);
  });

  it('per card: one card using its limit leaves the same limit of another card open', () => {
    const s = pick(start(), 'card:x');
    expect(opt(s, 'card:y').enabled).toBe(true);
    expect(opt(pick(s, 'card:y'), 'card:y').enabled).toBe(false);
  });

  it('a limit shared by several cards: one card using it bars the others', () => {
    const s = pick(start(), 'once:x');
    expect(opt(s, 'once:x').enabled).toBe(false);
    expect(opt(s, 'once:y')).toMatchObject({ enabled: false, reason: 'used' });
    expect(opt(s, 'card:x').enabled).toBe(true);
  });

  it('per game: never cleared, through every turn, phase and round', () => {
    let s = pick(start(), 'game:x');
    s = picks(s, ['next', 'next', 'next', 'next', 'next', 'next', 'next']);
    expect(at(s)).toBe('2:b:p2');
    expect(opt(s, 'game:x')).toMatchObject({ enabled: false, why: 'already used this game' });
    expect(opt(s, 'game:y').enabled).toBe(true);
  });

  it('per round and per seat: a seat that used it is barred for the round, the other seat is not, and the next round clears it', () => {
    let s = pick(start(), 'round:');
    expect(opt(s, 'round:')).toMatchObject({ enabled: false, why: 'used this round' });
    s = picks(s, ['next', 'next']);
    expect(at(s)).toBe('1:b:p1');
    expect(opt(s, 'round:').enabled).toBe(true);
    s = picks(s, ['next', 'next']);
    expect(at(s)).toBe('2:a:p1');
    expect(opt(s, 'round:').enabled).toBe(true);
  });

  it('per phase: cleared when the phase ends, so the next phase of the same turn offers it again', () => {
    let s = pick(start(), 'phase:');
    expect(opt(s, 'phase:')).toMatchObject({ enabled: false, why: 'used this phase' });
    s = pick(s, 'next');
    expect(at(s)).toBe('1:a:p2');
    expect(opt(s, 'phase:').enabled).toBe(true);
  });

  it('markLimit says whether it marked; marking twice keeps one entry; plain data that survives a JSON round trip', () => {
    const s = picks(start(), ['card:x', 'game:y', 'round:']);
    expect(limitsOf(s)).toEqual({ turn: ['["card",null,"x"]'], game: ['["game",null,"y"]'], round: ['["round","a",null]'] });
    const copy = JSON.parse(JSON.stringify(s)) as LState;
    expect(copy).toEqual(s);
    expect(picks(copy, ['next', 'next']).limits).toEqual(picks(s, ['next', 'next']).limits);
    let twice: boolean[] = [];
    const g: GameRules<L> = { ...G, setup: (ctx) => { twice = [markLimit(ctx, TABLE, { key: 'phase' }), markLimit(ctx, TABLE, { key: 'phase' })]; clearLimits(ctx, 'turn'); } };
    const t = createGame(g, { seed: 'k589' }, null, null).state;
    expect(twice).toEqual([true, false]);
    expect(limitsOf(t)).toEqual({ phase: ['["phase",null,null]'] });
  });

  it('a game that never uses a limit gets no limits field; an unknown key or a missing card id throws', () => {
    const s = picks(start(), ['next', 'next', 'next', 'next', 'next']);
    expect(at(s)).toBe('2:a:p2');
    expect('limits' in s).toBe(false);
    expect(limitUsed(s, TABLE, { key: 'card', card: 'x' })).toBe(false);
    expect(() => limitUsed(s, TABLE, { key: 'nope' })).toThrow(/nope/);
    expect(() => limitUsed(s, TABLE, { key: 'card' })).toThrow(/card id/);
  });

  it('README recipe: a turn limit with its own words and a per-card round limit, built into one prompt', () => {
    const table: LimitTable = { draw: { scope: 'turn', why: 'drawn this turn' }, power: { scope: 'round', perCard: true } };
    const g: GameRules<L> = {
      ...G,
      setup: (ctx) => {
        markLimit(ctx, table, { key: 'draw' });
        ctx.ask({ min: 1, max: 1, options: [limitOption(ctx.s, table, { key: 'draw' }, 'draw'), limitOption(ctx.s, table, { key: 'power', card: 'c7' }, 'power:c7')] }, { kind: 'pick' });
      },
    };
    const s = createGame(g, { seed: 'k589' }, null, null).state;
    expect(s.prompt?.options).toEqual([{ id: 'draw', enabled: false, reason: 'used', why: 'drawn this turn' }, { id: 'power:c7', enabled: true }]);
  });

  it('comparison: a plain map of used keys per scope, cleared by hand at each edge, agrees with the part on random play', () => {
    const key = (r: LimitRef, seat: string): string => `${r.key}|${r.key === 'round' ? seat : ''}|${r.key === 'card' || r.key === 'game' ? (r.card as string) : ''}`;
    const scopeOf = (r: LimitRef): string => (r.key === 'once' || r.key === 'card' ? 'turn' : r.key);
    for (let seed = 1; seed <= 40; seed++) {
      let x = seed * 2654435761;
      const rand = (n: number): number => { x = (x * 1103515245 + 12345) % 2147483648; return x % n; };
      const g = game(4);
      let s = createGame(g, { seed: `k589-${String(seed)}` }, null, null).state;
      const model: Record<string, Set<string>> & Record<"turn" | "round" | "phase" | "game", Set<string>> = { turn: new Set(), round: new Set(), phase: new Set(), game: new Set() };
      let last = { round: 1, seat: 'a', phase: 'p1' };
      for (let i = 0; i < 400 && s.prompt !== null; i++) {
        const f = flowOf(s) as FlowState;
        if (f.round !== last.round || f.seat !== last.seat || f.phase !== last.phase) model.phase.clear();
        if (f.round !== last.round || f.seat !== last.seat) model.turn.clear();
        if (f.round !== last.round) model.round.clear();
        last = { round: f.round, seat: f.seat, phase: f.phase };
        for (const r of REFS) {
          expect(opt(s, idOf(r)).enabled, `seed ${String(seed)} step ${String(i)} ${idOf(r)}`).toBe(!model[scopeOf(r)]?.has(key(r, f.seat)));
          expect(limitUsed(s, TABLE, r)).toBe(model[scopeOf(r)]?.has(key(r, f.seat)));
        }
        const all = [...REFS.map(idOf), 'next', 'next', 'next'];
        const id = all[rand(all.length)] as string;
        if (id !== 'next' && opt(s, id).enabled !== true) continue;
        if (id !== 'next') model[scopeOf(refOf(id))]?.add(key(refOf(id), f.seat));
        s = applyAction(g, s, { kind: 'answer', promptId: s.prompt.id, picks: [id] }, null).state;
      }
      expect(flowOf(s)?.done).toBe(true);
    }
  });
});
