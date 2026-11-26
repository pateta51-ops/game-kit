import { createBoard, neighbours, type Board, type Space } from '../../kit/board-model/index.ts';
import { reachableMoves } from '../../kit/board-model/movement.ts';
import { combatHappen, queueCombat } from '../../kit/combat/index.ts';
import { draftOf, hashValue, seedRng, stateInvariants, timingHandlers, type AnswerAction, type Draft, type GameRules, type KernelState } from '../../kit/engine-core/index.ts';
import { defineGame } from '../../kit/game-store/index.ts';
import { createGrowingMap, growMap, type GrowingMap, type OpenMapEdge, type TilePlacement } from '../../kit/growing-map/index.ts';
import type { Bot } from '../../kit/sim-pool/index.ts';

export interface ExpeditionConfig {
  readonly id: string;
  readonly approach: 1 | 2;
  readonly health: number;
  readonly power: number;
  readonly armor: number;
  readonly points: number;
  readonly tiles: readonly { readonly id: string; readonly span: 1 | 2 }[];
}
export interface ExpeditionEvent {
  readonly seq: number;
  readonly type: 'moved' | 'damaged' | 'defeated' | 'explored';
  readonly target: string;
  readonly amount: number;
  readonly reveal?: boolean;
}
export interface ExpeditionState extends KernelState {
  readonly position: string;
  readonly points: number;
  readonly guard: { readonly id: 'guard'; readonly space: string; readonly health: number; readonly defeated: boolean };
  readonly map: GrowingMap;
  readonly revealedTiles: readonly string[];
  readonly goal: string | null;
  readonly result: 'escaped' | 'exhausted' | null;
  readonly log: readonly ExpeditionEvent[];
}
export interface Expedition {
  readonly state: ExpeditionState;
  readonly options: { readonly seed: string };
  readonly rules: Record<string, never>;
  readonly content: null;
  readonly action: AnswerAction;
  readonly task: { readonly kind: string; readonly answer?: readonly string[] };
  readonly prompt: NonNullable<ExpeditionState['prompt']>;
  readonly event: ExpeditionEvent;
  readonly stamped: never;
}

export const expeditionView = (state: ExpeditionState) => ({
  position: state.position, points: state.points, guard: state.guard, board: state.map.board,
  openEdges: state.map.openEdges, remainingTiles: state.map.tiles.length, revealedTiles: state.revealedTiles,
  goal: state.goal, prompt: state.prompt, result: state.result,
});
export type ExpeditionView = ReturnType<typeof expeditionView>;

const cell = (x: number): string => `c${String(x)}`;
const canAttack = (state: ExpeditionState): boolean => !state.guard.defeated
  && neighbours(state.map.board, state.position).includes(state.guard.space);
const moves = (state: ExpeditionState) => reachableMoves(state.map.board, state.position, {
  points: 1, cost: (_from, to) => !state.guard.defeated && to === state.guard.space ? null : 1,
});

/** Original bounded example: one guard, one eastward frontier, fixed armor, no reactions or retaliation. */
export function createExpedition(input: ExpeditionConfig) {
  const config = structuredClone(input);
  if (!config.id.trim() || ![1, 2].includes(config.approach)
      || !Number.isSafeInteger(config.health) || config.health < 1 || config.health > 20
      || !Number.isSafeInteger(config.power) || !Number.isSafeInteger(config.armor)
      || config.armor < 0 || config.power <= config.armor || config.power > 20
      || !Number.isSafeInteger(config.points) || config.points < 1 || config.points > 100
      || config.tiles.length < 1 || config.tiles.length > 8
      || new Set(config.tiles.map(tile => tile.id)).size !== config.tiles.length
      || config.tiles.some(tile => !tile.id.trim() || tile.id !== tile.id.trim() || ![1, 2].includes(tile.span)))
    throw new Error('Invalid bounded expedition configuration');
  const initial = createBoard(Array.from({ length: config.approach + 1 }, (_, x) => ({ id: cell(x), x, y: 0 })),
    Array.from({ length: config.approach }, (_, x) => [cell(x), cell(x + 1)] as const));
  const guardSpace = cell(config.approach);
  const tiles = new Map(config.tiles.map(tile => [tile.id, tile]));
  const checks = stateInvariants<ExpeditionState, null>({
    zones: { tiles: { locations: state => ({ hidden: state.map.tiles, revealed: state.revealedTiles }), expected: () => config.tiles.map(tile => tile.id) } },
    counters: state => ({ points: state.points, guardHealth: state.guard.health }),
    flags: state => ({ guardDefeated: state.guard.defeated }),
    queues: state => ({ idle: state.result !== null, pending: { tasks: state.stack.length } }),
  });

  const placement = (state: ExpeditionState, tile: string, edge: OpenMapEdge): TilePlacement => {
    const span = tiles.get(tile)?.span;
    const from = state.map.board.spaces[edge.space]?.x;
    if (span === undefined || from === undefined || !Number.isSafeInteger(from)) throw new Error('Unknown expedition tile or coordinate');
    const spaces: Space[] = Array.from({ length: span }, (_, i) => ({ id: cell(from + i + 1), x: from + i + 1, y: 0, tile }));
    const last = spaces.at(-1)!.id;
    return {
      spaces, links: spaces.slice(1).map((space, i) => [spaces[i]!.id, space.id] as const),
      joins: [{ edge: edge.id, space: spaces[0]!.id }],
      openEdges: state.map.tiles.length === 1 ? [] : [{ id: `east:${last}`, space: last }],
    };
  };
  const combat = combatHappen<Expedition>({
    attack(ctx, attack) {
      if (attack.source !== 'explorer' || attack.target !== 'guard' || !canAttack(ctx.s)) throw new Error('Illegal expedition attack');
      return [{ op: 'damage', source: 'explorer', target: 'guard', player: 'explorer', amount: config.power }];
    },
    armor: () => config.armor,
    applyDamage(ctx, damage, amount) {
      if (damage.target !== 'guard' || ctx.s.guard.defeated) throw new Error('Illegal expedition damage target');
      const state = draftOf(ctx);
      const lost = Math.min(state.guard.health, amount);
      state.guard = { ...state.guard, health: state.guard.health - lost };
      ctx.emit({ type: 'damaged', target: 'guard', amount: lost });
      return state.guard.health === 0;
    },
    defeat(ctx, defeat) {
      if (defeat.target !== 'guard' || ctx.s.guard.defeated || ctx.s.guard.health !== 0) throw new Error('Illegal repeated defeat');
      draftOf(ctx).guard = { ...ctx.s.guard, defeated: true };
      ctx.emit({ type: 'defeated', target: 'guard', amount: 1 });
    },
  });
  const rules: GameRules<Expedition> = {
    blank({ seed }) {
      const [a, b, c, d] = seedRng(seed);
      return {
        rng: { a, b, c, d }, stack: [], prompt: null, result: null, seq: 0, promptSeq: 0, log: [],
        position: 'c0', points: config.points, guard: { id: 'guard', space: guardSpace, health: config.health, defeated: false },
        map: { board: structuredClone(initial) as Draft<Board>, openEdges: [], tiles: [] }, revealedTiles: [], goal: null,
      };
    },
    setup(ctx) {
      draftOf(ctx).map = createGrowingMap(initial, [{ id: `east:${guardSpace}`, space: guardSpace }], config.tiles.map(tile => tile.id), ctx.rng) as Draft<GrowingMap>;
      ctx.then({ kind: 'decision' });
    },
    contentHash: () => hashValue({ version: 1, config }),
    invariantPolicy: 'strict',
    invariants(state, content, events, previous) {
      const errors = [...checks(state, content, events, previous)];
      if (!Number.isSafeInteger(state.points) || state.points < 0 || state.points > config.points) errors.push({ id: 'expedition:points', message: 'Invalid action budget' });
      if (!Object.hasOwn(state.map.board.spaces, state.position)) errors.push({ id: 'expedition:position', message: 'Explorer is outside the board' });
      if (state.guard.health < 0 || state.guard.health > config.health || state.guard.defeated !== (state.guard.health === 0)) errors.push({ id: 'expedition:guard', message: 'Guard health and defeat disagree' });
      const inventory = [...state.revealedTiles, ...state.map.tiles].sort();
      if (JSON.stringify(inventory) !== JSON.stringify(config.tiles.map(tile => tile.id).sort())) errors.push({ id: 'expedition:tiles', message: 'Physical tile inventory changed' });
      if (state.result === 'escaped' && state.position !== state.goal) errors.push({ id: 'expedition:goal', message: 'Escape requires entering the goal' });
      return errors;
    },
    handlers: {
      ...timingHandlers<Expedition>({ happen(ctx, occurrence) { if (!combat(ctx, occurrence)) throw new Error('Unknown expedition occurrence'); }, event: () => undefined }),
      decision(ctx) {
        const state = draftOf(ctx);
        if (state.goal !== null && state.position === state.goal) { state.result = 'escaped'; return; }
        if (state.points === 0) { state.result = 'exhausted'; return; }
        const options = moves(ctx.s).map(move => ({ id: `move:${move.space}`, enabled: true }));
        if (canAttack(ctx.s)) options.push({ id: 'attack:guard', enabled: true });
        if (state.guard.defeated && state.map.tiles.length)
          for (const edge of state.map.openEdges) if (edge.space === state.position) options.push({ id: `explore:${edge.id}`, enabled: true });
        ctx.ask({ kind: 'expedition', seat: 'explorer', min: 1, max: 1, options }, { kind: 'act' });
      },
      act(ctx, task) {
        const answer = task.answer?.[0];
        const state = draftOf(ctx);
        if (answer?.startsWith('move:')) {
          const to = answer.slice(5);
          if (!moves(ctx.s).some(move => move.space === to)) throw new Error('Illegal expedition move');
          state.position = to;
          state.points--;
          ctx.emit({ type: 'moved', target: to, amount: 1 });
          ctx.then({ kind: 'decision' });
        } else if (answer === 'attack:guard') {
          if (!canAttack(ctx.s)) throw new Error('Illegal expedition attack');
          state.points--;
          ctx.then({ kind: 'decision' });
          queueCombat(ctx, [{ op: 'attack', source: 'explorer', target: 'guard', player: 'explorer' }]);
        } else if (answer?.startsWith('explore:')) {
          const edgeId = answer.slice(8);
          if (!state.guard.defeated || !state.map.openEdges.some(edge => edge.id === edgeId && edge.space === state.position)) throw new Error('Illegal expedition exploration');
          const grown = growMap(ctx.s.map, edgeId, (tile, edge) => placement(ctx.s, tile, edge));
          if (grown.kind !== 'grew') throw new Error('Expedition exploration did not place a tile');
          state.map = grown.map as Draft<GrowingMap>;
          state.revealedTiles = [...state.revealedTiles, grown.tile];
          if (state.map.tiles.length === 0) state.goal = state.map.board.order.at(-1)!;
          state.points--;
          ctx.emit({ type: 'explored', target: grown.tile, amount: 1, reveal: true });
          ctx.then({ kind: 'decision' });
        } else throw new Error('Unknown expedition action');
      },
    },
  };
  const def = defineGame<Expedition, ExpeditionView, 'explorer'>({ rules, content: null, seats: ['explorer'], start: seed => ({ options: { seed }, rules: {} }), view: expeditionView });
  const pilot: Bot<ExpeditionView> = {
    name: 'expedition-pilot',
    choose(view, answers) {
      const urgent = answers.find(answer => answer.picks[0] === 'attack:guard') ?? answers.find(answer => answer.picks[0]?.startsWith('explore:'));
      const forward = [...answers].sort((a, b) => (view.board.spaces[b.picks[0]?.slice(5) ?? '']?.x ?? -1) - (view.board.spaces[a.picks[0]?.slice(5) ?? '']?.x ?? -1));
      const action = urgent ?? forward[0];
      if (action === undefined) throw new Error('Expedition pilot has no legal action');
      return action;
    },
  };
  return { def, pilot };
}

export const EXPEDITIONS: readonly ExpeditionConfig[] = [
  { id: 'short-passage', approach: 1, health: 3, power: 3, armor: 1, points: 8, tiles: [{ id: 'passage-a', span: 1 }, { id: 'gallery-a', span: 2 }] },
  { id: 'long-gallery', approach: 2, health: 4, power: 5, armor: 2, points: 12, tiles: [{ id: 'gallery-b', span: 2 }, { id: 'gallery-c', span: 2 }, { id: 'passage-b', span: 1 }] },
];
