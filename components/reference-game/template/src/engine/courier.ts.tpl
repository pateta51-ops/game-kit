import { draftOf, seedRng, type AnswerAction, type GameRules, type KernelState } from '../../kit/engine-core/index.ts';
import { firstSteps, gridMap, neighbours } from '../../kit/grid-map/index.ts';
import { botDriver, type Bot, type SimGame } from '../../kit/sim-pool/index.ts';

const map = gridMap({ rows: 2, cols: 3, walls: [[0, 0, 'e']] });
const depot = 'r0c0';
const pickup = 'r1c1';
const destination = 'r0c2';

export interface CourierState extends KernelState {
  readonly space: string;
  readonly parcel: boolean;
  readonly movesLeft: number;
  readonly result: 'delivered' | 'late' | null;
}

interface Courier {
  readonly state: CourierState;
  readonly options: { readonly seed: string };
  readonly rules: Record<string, never>;
  readonly content: null;
  readonly action: AnswerAction;
  readonly task: { readonly kind: string; readonly answer?: readonly string[] };
  readonly prompt: NonNullable<CourierState['prompt']>;
  readonly event: CourierState['log'][number];
  readonly stamped: never;
}

export const COURIER: GameRules<Courier> = {
  blank({ seed }) {
    const [a, b, c, d] = seedRng(seed);
    return {
      rng: { a, b, c, d }, stack: [], prompt: null, result: null, seq: 0, promptSeq: 0, log: [],
      space: depot, parcel: false, movesLeft: 5,
    };
  },
  setup(ctx) { ctx.then({ kind: 'route' }); },
  contentHash: () => 'courier-v1',
  handlers: {
    route(ctx) {
      ctx.ask({
        kind: 'route', seat: 'courier', min: 1, max: 1,
        options: neighbours(map, ctx.s.space).map(id => ({ id, enabled: true })),
      }, { kind: 'move' });
    },
    move(ctx, task) {
      const to = task.answer?.[0];
      if (to === undefined) throw new Error('route choice is missing');
      const state = draftOf(ctx);
      state.space = to;
      state.parcel ||= to === pickup;
      state.movesLeft--;
      if (state.parcel && to === destination) state.result = 'delivered';
      else if (state.movesLeft === 0) state.result = 'late';
      else ctx.then({ kind: 'route' });
    },
  },
};

const viewOf = ({ space, parcel, movesLeft }: CourierState) => ({ space, parcel, movesLeft });
type CourierView = ReturnType<typeof viewOf>;
const pilot: Bot<CourierView> = {
  name: 'courier-pilot',
  choose(view, answers, rng) {
    const hops = firstSteps(map, view.space, view.parcel ? destination : pickup).starts;
    return rng.pick(answers.filter(answer => hops.some(([space]) => answer.picks[0] === space)));
  },
};

export const courierSim: SimGame<Courier, CourierView> = {
  rules: COURIER,
  content: () => null,
  start: ({ seed }) => ({ options: { seed }, rules: {} }),
  driver: () => botDriver<Courier, CourierView>(pilot, viewOf),
  summary: viewOf,
  view: viewOf,
  leakKeys: () => ['rng', 'stack'],
  maxActions: 5,
};
