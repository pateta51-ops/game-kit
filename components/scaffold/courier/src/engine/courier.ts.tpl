import { defineGame } from '../../kit/game-store/index.ts';
import { draftOf, hashValue, seedRng, stateInvariants, type AnswerAction, type GameRules, type KernelState } from '../../kit/engine-core/index.ts';
import { firstSteps, gridMap, neighbours, type GridSpec } from '../../kit/grid-map/index.ts';
import type { Bot } from '../../kit/sim-pool/index.ts';

export interface CourierConfig {
  readonly board: Pick<GridSpec, 'rows' | 'cols' | 'walls'>;
  readonly depot: string;
  readonly pickup: string;
  readonly destination: string;
  readonly allowances: readonly number[];
}

export interface CourierState extends KernelState {
  readonly space: string;
  readonly parcel: boolean;
  readonly allowance: number;
  readonly movesLeft: number;
  readonly result: 'delivered' | 'late' | null;
  readonly log: readonly CourierEvent[];
}

export interface CourierEvent {
  readonly seq: number;
  readonly type: 'moved';
  readonly from: string;
  readonly to: string;
  readonly movesLeft: number;
}

export interface Courier {
  readonly state: CourierState;
  readonly options: { readonly seed: string };
  readonly rules: { readonly moves?: number };
  readonly content: null;
  readonly action: AnswerAction;
  readonly task: { readonly kind: string; readonly answer?: readonly string[] };
  readonly prompt: NonNullable<CourierState['prompt']>;
  readonly event: CourierState['log'][number];
  readonly stamped: never;
}

export const courierView = ({ space, parcel, allowance, movesLeft, prompt, result }: CourierState) => ({ space, parcel, allowance, movesLeft, prompt, result });
export type CourierView = ReturnType<typeof courierView>;

export function createCourier(input: CourierConfig) {
  const config = structuredClone(input);
  const map = gridMap(config.board);
  for (const id of [config.depot, config.pickup, config.destination]) neighbours(map, id);
  if (new Set([config.depot, config.pickup, config.destination]).size !== 3) throw new Error('Courier locations must differ');
  if (!config.allowances.length || config.allowances.some(value => !Number.isSafeInteger(value) || value < 1 || value > 1000)) throw new Error('Courier needs positive movement allowances');
  const allowance = (value = config.allowances[0]): number => {
    if (value === undefined || !config.allowances.includes(value)) throw new Error('Unknown courier movement allowance');
    return value;
  };
  const checks = stateInvariants<CourierState, null>({
    counters: state => ({ movesLeft: state.movesLeft, allowance: state.allowance }),
    flags: state => ({ parcel: state.parcel }),
    queues: state => ({ idle: state.result !== null, pending: { tasks: state.stack.length } }),
  });
  const rules: GameRules<Courier> = {
    blank({ seed }, settings) {
      const [a, b, c, d] = seedRng(seed);
      const moves = allowance(settings.moves);
      return {
        rng: { a, b, c, d }, stack: [], prompt: null, result: null, seq: 0, promptSeq: 0, log: [],
        space: config.depot, parcel: false, allowance: moves, movesLeft: moves,
      };
    },
    setup(ctx) { ctx.then({ kind: 'route' }); },
    contentHash: () => hashValue({ version: 1, config }),
    invariantPolicy: 'strict',
    invariants(state, content, events, previous) {
      const violations = [...checks(state, content, events, previous)];
      if (!map.spaces.includes(state.space)) violations.push({ id: 'courier:space', message: 'Courier is outside the board' });
      if (state.movesLeft > state.allowance) violations.push({ id: 'courier:allowance', message: 'Movement exceeds the selected allowance' });
      if (state.result === 'delivered' && (!state.parcel || state.space !== config.destination)) violations.push({ id: 'courier:delivery', message: 'Delivery needs the parcel at its destination' });
      return violations;
    },
    handlers: {
      route(ctx) {
        ctx.ask({
          kind: 'route', seat: 'courier', min: 1, max: 1,
          options: neighbours(map, ctx.s.space).map(id => ({ id, enabled: true })),
        }, { kind: 'move' });
      },
      move(ctx, task) {
        const to = task.answer?.[0];
        if (to === undefined) throw new Error('Route choice is missing');
        const state = draftOf(ctx);
        const from = state.space;
        state.space = to;
        state.parcel ||= to === config.pickup;
        state.movesLeft--;
        ctx.emit({ type: 'moved', from, to, movesLeft: state.movesLeft });
        if (state.parcel && to === config.destination) state.result = 'delivered';
        else if (state.movesLeft === 0) state.result = 'late';
        else ctx.then({ kind: 'route' });
      },
    },
  };
  const start = (seed: string, moves?: number) => ({ options: { seed }, rules: { moves: allowance(moves) } });
  const def = defineGame<Courier, CourierView, 'courier'>({ rules, content: null, seats: ['courier'], start, view: courierView });
  const pilot: Bot<CourierView> = {
    name: 'courier-pilot',
    choose(view, answers, rng) {
      const hops = firstSteps(map, view.space, view.parcel ? config.destination : config.pickup).starts;
      const preferred = answers.filter(answer => hops.some(([space]) => answer.picks[0] === space));
      return rng.pick(preferred.length ? preferred : answers);
    },
  };
  return { def, pilot, start };
}

export const DEFAULT_COURIER_CONFIG = {
  board: { rows: 2, cols: 3, walls: [[0, 0, 'e']] },
  depot: 'r0c0', pickup: 'r1c1', destination: 'r0c2', allowances: [5],
} as const satisfies CourierConfig;
const example = createCourier(DEFAULT_COURIER_CONFIG);
export const COURIER = example.def.rules;
export const COURIER_DEF = example.def;
export const COURIER_PILOT = example.pilot;
