import { draftOf, own, seedRng, stateInvariants, type AnswerAction, type DebugAction, type GameRules, type KernelState } from '../index.ts';

interface Board extends KernelState {
  readonly zones: { readonly hand: readonly string[]; readonly supply: readonly string[]; readonly removed: readonly string[] };
  readonly owner: string;
  readonly tokens: number;
  readonly reserve: number;
}

export type BoardFault = 'duplicate' | 'zone' | 'owner' | 'total' | 'counter';
export const faults: readonly BoardFault[] = ['duplicate', 'zone', 'owner', 'total', 'counter'];

export interface BoardGame {
  readonly state: Board;
  readonly action: AnswerAction | DebugAction;
  readonly task: { readonly kind: string; readonly answer?: readonly string[] };
  readonly prompt: NonNullable<Board['prompt']>;
  readonly event: Board['log'][number];
  readonly stamped: never;
  readonly content: null;
  readonly options: { readonly seed: string };
  readonly rules: Record<string, never>;
}

const stateChecks = stateInvariants<Board, null>({
  zones: { cards: { locations: s => s.zones, expected: () => ['card'] } },
  counters: s => ({ tokens: s.tokens, reserve: s.reserve }),
  totals: { tokens: { actual: s => s.tokens + s.reserve, expected: () => 3 } },
  queues: s => ({ idle: s.result !== null, pending: { tasks: s.stack.length } }),
});

export const board: GameRules<BoardGame> = {
  blank(options) {
    const [a, b, c, d] = seedRng(options.seed);
    return {
      rng: { a, b, c, d }, seq: 0, promptSeq: 0, stack: [], prompt: null, log: [], result: null,
      zones: { hand: [], supply: ['card'], removed: [] }, owner: 'player', tokens: 1, reserve: 2,
    };
  },
  contentHash: () => 'invariant-board',
  debug: {},
  setup(ctx) {
    ctx.then({ kind: 'prompt' });
  },
  handlers: {
    prompt(ctx) {
      const s = draftOf(ctx);
      if (s.rng.a === seedRng('bad setup')[0]) s.zones.hand.push('card');
      ctx.ask({
        min: 1, max: 1,
        options: [...faults, 'valid'].map(id => ({ id, enabled: true })),
      }, { kind: 'chosen' });
    },
    chosen(ctx, task) {
      const s = draftOf(ctx);
      const zones = own(s, 'zones');
      switch (task.answer?.[0]) {
        case 'duplicate': own(zones, 'hand').push('card'); break;
        case 'zone': zones.supply = []; zones.removed = ['card']; break;
        case 'owner': s.owner = 'outsider'; break;
        case 'total': s.reserve -= 1; break;
        case 'counter': s.tokens = 3; s.reserve = 0; break;
        default:
          own(zones, 'hand').push('card'); // The duplicate is temporary until the queued transfer finishes.
          ctx.then({ kind: 'finish' });
          return;
      }
      s.result = 'finished';
    },
    finish(ctx) {
      const s = draftOf(ctx);
      own(own(s, 'zones'), 'supply').pop();
      s.result = 'finished';
    },
  },
  invariants(state, content, events, prev) {
    return [
      ...stateChecks(state, content, events, prev),
      ...(state.zones.removed.length ? [{ id: 'zone:cards', message: 'card is in a forbidden zone' }] : []),
      ...(state.tokens > 2 ? [{ id: 'counter:tokens', message: 'player cannot hold more than two tokens' }] : []),
      ...(state.owner === 'player' ? [] : [{ id: 'owner:card', message: 'card owner is outside the game' }]),
    ];
  },
};

export const answer = (state: Board, pick: BoardFault | 'valid'): AnswerAction => ({
  kind: 'answer', promptId: state.prompt?.id ?? -1, picks: [pick],
});
