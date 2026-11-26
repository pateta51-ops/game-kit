import { isDeepStrictEqual } from 'node:util';
import { IllegalActionError, applyAction, createGame, createSave, type GameRules } from '../kit/engine-core/index.ts';
import { createGameStore, type GameDef, type GameStore } from '../kit/game-store/index.ts';
import type { Assertion, Json, RuleAdapter, RuleCase, RuleRequirement, RuleStep } from '../kit/traceability/assertions.ts';
import { ACCEPTANCE_ROUTE, CONFIG, CONTENT, GAME_DEF, startCourier, type Courier, type CourierState, type CourierView } from '../src/engine/api.ts';
import { createCourier, type CourierConfig } from '../src/engine/courier.ts';

interface Fixture { readonly allowance?: number; readonly boundary?: boolean; readonly layout?: 'walls' | 'before-pickup'; readonly store?: boolean }
type Action = { readonly kind: 'move'; readonly to: string; readonly promptId?: number } | { readonly kind: 'undo' } | { readonly kind: 'restore' };
interface Runtime {
  readonly def: GameDef<Courier, CourierView, 'courier'>;
  readonly state: CourierState;
  readonly store?: GameStore<Courier, CourierView>;
}
const json = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json;
const snapshot = (runtime: Runtime): CourierState => runtime.store?.get().state ?? runtime.state;
const BOUNDARIES = {
  walls: { board: { rows: 2, cols: 3, walls: [[0, 0, 'e']] }, depot: 'r0c0', pickup: 'r1c1', destination: 'r0c2', allowances: [6] },
  'before-pickup': { board: { rows: 1, cols: 3 }, depot: 'r0c0', pickup: 'r0c2', destination: 'r0c1', allowances: [4] },
} as const satisfies Record<string, CourierConfig>;
const clean = (state: CourierState, rules: GameRules<Courier>): CourierState => {
  const violations = rules.invariants?.(state, CONTENT, [], state) ?? [];
  if (violations.length) throw new Error(violations.map(item => item.message).join('; '));
  return state;
};
const adapter: RuleAdapter<Fixture, Action, Runtime> = {
  setup(fixture, seed) {
    // Boundary fixtures change only declared setup data, through the same public factory.
    const def = fixture.layout !== undefined ? createCourier(BOUNDARIES[fixture.layout]).def : fixture.boundary === true
      ? createCourier({ ...CONFIG, allowances: [fixture.allowance ?? ACCEPTANCE_ROUTE.length] }).def
      : { ...GAME_DEF, start: (value: string) => startCourier(value, fixture.allowance) };
    const setup = def.start(seed);
    const state = createGame(def.rules, setup.options, setup.rules, CONTENT).state;
    return { def, state, ...(fixture.store === true ? { store: createGameStore(def, { seat: 'courier', seed, undo: 'free' }) } : {}) };
  },
  observe: runtime => json(snapshot(runtime)),
  act(runtime, action) {
    const before = snapshot(runtime);
    if (runtime.store !== undefined) {
      let store = runtime.store;
      let accepted: boolean;
      if (action.kind === 'restore') {
        const history = store.saved();
        const save = createSave(runtime.def.rules, { ...history, savedAt: '2026-01-01T00:00:00.000Z' }, CONTENT);
        store = createGameStore(runtime.def, { seat: 'courier', seed: 'fresh-before-load', undo: 'free' });
        const problem = store.load(save);
        if (problem !== null) throw new Error(problem);
        if (!isDeepStrictEqual(store.get().state, before) || !isDeepStrictEqual(store.saved(), history)) throw new Error('Restore changed the pending decision or history');
        accepted = true;
      } else accepted = action.kind === 'undo' ? store.undo() : store.answer([action.to], action.promptId ?? before.prompt?.id ?? -1);
      const snap = store.get();
      if (snap.triggerCap !== undefined || (accepted && snap.error !== null)) throw new Error(snap.error ?? 'Trigger cap');
      const state = clean(snap.state, runtime.def.rules);
      return { accepted, state: { ...runtime, state, store }, events: action.kind === 'move' && accepted ? state.log.slice(before.log.length).map(json) : [] };
    }
    if (action.kind !== 'move') throw new Error('Store action needs a store fixture');
    try {
      const result = applyAction(runtime.def.rules, before, { kind: 'answer', promptId: action.promptId ?? before.prompt?.id ?? -1, picks: [action.to] }, CONTENT);
      if (result.triggerCap !== undefined || result.violations.length) throw new Error('Invalid engine transition');
      return { accepted: true, state: { ...runtime, state: result.state }, events: result.events.map(json) };
    } catch (error) {
      if (!(error instanceof IllegalActionError)) throw error;
      return { accepted: false, state: runtime, events: [] };
    }
  },
};

const equal = (key: string, value: Json): Assertion => ({ source: 'state', path: [key], op: 'equals', value });
const move = (to: string, checks: readonly Assertion[]): RuleStep<Action> => ({ action: { kind: 'move', to }, accepted: true, checks });
const first = ACCEPTANCE_ROUTE[0];
const defaultAllowance = CONFIG.allowances[0];
const pickup = ACCEPTANCE_ROUTE.indexOf(CONFIG.pickup);
// These requirements and cases are maintained from docs/PLAN.md, not inferred from engine handlers.
const rules: readonly RuleRequirement[] = [
  { id: 'COU-01', kind: 'setup' },
  { id: 'COU-02', kind: 'action', requireRefusal: true },
  { id: 'COU-03', kind: 'action' },
  { id: 'COU-04', kind: 'action' },
  { id: 'COU-05', kind: 'action', requireRefusal: true },
  { id: 'COU-06', kind: 'action' },
  { id: 'COU-07', kind: 'action' },
];
const cases: readonly RuleCase<Fixture, Action>[] = [
  ...CONFIG.allowances.map(allowance => ({
    id: `setup-${String(allowance)}`, rules: ['COU-01'], seed: 'rule-setup', fixture: { allowance }, steps: [],
    initial: [equal('space', CONFIG.depot), equal('parcel', false), equal('movesLeft', allowance), equal('allowance', allowance)],
    evidence: [{ rule: 'COU-01', kind: 'setup' as const, assertion: 0 }, { rule: 'COU-01', kind: 'setup' as const, assertion: 2 }],
  })),
  {
    id: 'legal-and-refused', rules: ['COU-02'], seed: 'rule-legality', fixture: {},
    steps: [
      { action: { kind: 'move', to: CONFIG.depot }, accepted: false, checks: [equal('space', CONFIG.depot), equal('movesLeft', defaultAllowance)] },
      move(first, [equal('space', first), equal('movesLeft', defaultAllowance - 1)]),
      { action: { kind: 'move', to: CONFIG.depot, promptId: 0 }, accepted: false, checks: [equal('space', first)] },
    ],
    evidence: [{ rule: 'COU-02', kind: 'action', step: 0, assertion: 0 }, { rule: 'COU-02', kind: 'action', step: 1, assertion: 1 }, { rule: 'COU-02', kind: 'action', step: 2, assertion: 0 }],
  },
  {
    id: 'wall-diagonal-and-remote', rules: ['COU-02'], seed: 'rule-walls', fixture: { layout: 'walls' },
    steps: [
      { action: { kind: 'move', to: 'r0c1' }, accepted: false, checks: [equal('space', 'r0c0'), equal('movesLeft', 6)] },
      { action: { kind: 'move', to: 'r1c1' }, accepted: false, checks: [equal('space', 'r0c0'), equal('movesLeft', 6)] },
      { action: { kind: 'move', to: 'r1c2' }, accepted: false, checks: [equal('space', 'r0c0'), equal('movesLeft', 6)] },
      move('r1c0', [equal('space', 'r1c0'), equal('movesLeft', 5)]),
    ],
    evidence: [
      { rule: 'COU-02', kind: 'action', step: 0, assertion: 0 }, { rule: 'COU-02', kind: 'action', step: 1, assertion: 0 },
      { rule: 'COU-02', kind: 'action', step: 2, assertion: 0 }, { rule: 'COU-02', kind: 'action', step: 3, assertion: 1 },
    ],
  },
  {
    id: 'collect-and-keep', rules: ['COU-03'], seed: 'rule-parcel', fixture: {},
    steps: ACCEPTANCE_ROUTE.slice(0, pickup + 2).map((to, index) => move(to, [equal('parcel', index >= pickup)])),
    evidence: [{ rule: 'COU-03', kind: 'action', step: pickup, assertion: 0 }, { rule: 'COU-03', kind: 'action', step: pickup + 1, assertion: 0 }],
  },
  {
    id: 'deliver-on-last-move', rules: ['COU-04'], seed: 'rule-delivery', fixture: { boundary: true, allowance: ACCEPTANCE_ROUTE.length },
    steps: ACCEPTANCE_ROUTE.map((to, index) => move(to, [equal('result', index === ACCEPTANCE_ROUTE.length - 1 ? 'delivered' : null), equal('movesLeft', ACCEPTANCE_ROUTE.length - index - 1)])),
    evidence: [{ rule: 'COU-04', kind: 'action', step: ACCEPTANCE_ROUTE.length - 1, assertion: 0 }, { rule: 'COU-04', kind: 'action', step: ACCEPTANCE_ROUTE.length - 1, assertion: 1 }],
  },
  {
    id: 'destination-needs-parcel', rules: ['COU-04'], seed: 'rule-before-pickup', fixture: { layout: 'before-pickup' },
    steps: [
      move('r0c1', [equal('space', 'r0c1'), equal('parcel', false), equal('result', null), { source: 'state', path: ['prompt', 'id'], op: 'exists' }]),
      move('r0c2', [equal('parcel', true), equal('result', null)]),
      move('r0c1', [equal('result', 'delivered')]),
    ],
    evidence: [{ rule: 'COU-04', kind: 'action', step: 0, assertion: 2 }, { rule: 'COU-04', kind: 'action', step: 2, assertion: 0 }],
  },
  {
    id: 'exhaust-and-refuse', rules: ['COU-05'], seed: 'rule-exhaustion', fixture: { boundary: true, allowance: 1 },
    steps: [
      move(first, [equal('result', 'late'), equal('movesLeft', 0), equal('prompt', null)]),
      { action: { kind: 'move', to: CONFIG.depot }, accepted: false, checks: [equal('result', 'late')] },
    ],
    evidence: [{ rule: 'COU-05', kind: 'action', step: 0, assertion: 0 }, { rule: 'COU-05', kind: 'action', step: 1, assertion: 0 }],
  },
  {
    id: 'undo-one-answer', rules: ['COU-06'], seed: 'rule-undo', fixture: { store: true },
    steps: [
      move(first, [equal('space', first)]),
      { action: { kind: 'undo' }, accepted: true, checks: [equal('space', CONFIG.depot), equal('movesLeft', defaultAllowance), equal('parcel', false)] },
    ],
    evidence: [{ rule: 'COU-06', kind: 'action', step: 1, assertion: 0 }, { rule: 'COU-06', kind: 'action', step: 1, assertion: 1 }],
  },
  {
    id: 'save-resume', rules: ['COU-07'], seed: 'rule-save', fixture: { store: true },
    steps: [
      move(first, [equal('space', first)]),
      { action: { kind: 'restore' }, accepted: true, checks: [equal('space', first), equal('movesLeft', defaultAllowance - 1), { source: 'state', path: ['prompt', 'id'], op: 'exists' }] },
      ...ACCEPTANCE_ROUTE.slice(1).map((to, index) => move(to, [equal('space', to), equal('result', index === ACCEPTANCE_ROUTE.length - 2 ? 'delivered' : null)])),
    ],
    evidence: [{ rule: 'COU-07', kind: 'action', step: 1, assertion: 2 }, { rule: 'COU-07', kind: 'action', step: ACCEPTANCE_ROUTE.length, assertion: 1 }],
  },
];

export default { adapter, cases, rules };
