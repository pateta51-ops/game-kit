import { expect, it } from 'vitest';
import { createSave, hashState, replay, restoreSave, type Ctx } from '../engine-core/index.ts';
import { type Timed } from '../engine-core/fake/timed.ts';
import { simGame } from '../sim-pool/fake/trigger-cap.ts';
import { createGameStore, defineGame } from './index.ts';

const definition = defineGame({
  rules: simGame.rules,
  seats: ['p1', 'p2'],
  start: (seed) => simGame.start({ index: 0, driver: 'random', seed }, null),
  content: null,
  view: (s) => ({ prompt: s.prompt, result: s.result }),
});

it('retains the first warning through later actions, save, restore, undo and redo', () => {
  const store = createGameStore(definition, { seat: 'p1', afterGameOver: true });
  expect(store.get().triggerCap).toBeUndefined();
  expect(store.answer(['hit'], 1)).toBe(true);
  const warning = store.get().triggerCap;
  expect(warning).toMatchObject({ code: 'trigger-cap', actionIndex: 0 });
  expect(store.get().view).not.toHaveProperty('triggerCap');
  expect(store.get().state.result).toBeNull();
  expect(store.answer(['finish'], 2)).toBe(true);
  expect(store.get()).toMatchObject({ error: null, state: { result: { hp: 7 } }, triggerCap: warning });
  const history = store.saved();
  const replayed = replay(definition.rules, history.options, history.rules, history.actions, null);
  expect(replayed).toMatchObject({ ok: true, hash: hashState(store.get().state), triggerCap: warning });
  const save = createSave(definition.rules, { ...history, savedAt: '2026-11-25T00:00:00.000Z' }, null);
  expect(save).not.toHaveProperty('triggerCap');
  expect(restoreSave(definition.rules, save, null)).toMatchObject({ ok: true, triggerCap: warning });
  const loaded = createGameStore(definition, { seat: 'p1' });
  expect(loaded.load(save)).toBeNull();
  expect(loaded.get().triggerCap).toEqual(warning);
  expect(store.undo()).toBe(true);
  expect(store.get().triggerCap).toEqual(warning);
  expect(store.undo()).toBe(true);
  expect(store.get().triggerCap).toBeUndefined();
  expect(store.redo()).toBe(true);
  expect(store.get().triggerCap).toEqual(warning);
});

it('locates a setup cap and includes it when rebuilding a history with no actions', () => {
  const { rules } = definition;
  const setup = (ctx: Ctx<Timed>) => ctx.then({ kind: 'chosen' });
  const game = { ...definition, rules: { ...rules, setup } };
  const store = createGameStore(game, { seat: 'p1' });
  expect(store.get().triggerCap).toMatchObject({ code: 'trigger-cap', actionIndex: null });
  const history = store.saved();
  const save = createSave(game.rules, { ...history, savedAt: '2026-11-25T00:00:00.000Z' }, null);
  expect(history.actions).toHaveLength(0);
  expect(store.load(save)).toBeNull();
  expect(store.get().triggerCap).toMatchObject({ code: 'trigger-cap', actionIndex: null });
});

it('retains a cap in an opponent action and removes it with the enclosing undo step', () => {
  const rules = {
    ...definition.rules,
    handlers: {
      ...definition.rules.handlers,
      player(ctx: Ctx<Timed>) {
        ctx.ask({ min: 1, max: 1, seat: 'p1', options: [{ id: 'pass', enabled: true }] }, { kind: 'opponent' });
      },
      opponent(ctx: Ctx<Timed>) {
        ctx.ask({ min: 1, max: 1, seat: 'p2', options: [{ id: 'hit', enabled: true }] }, { kind: 'chosen' });
      },
    },
    setup: (ctx: Ctx<Timed>) => ctx.then({ kind: 'player' }),
  };
  const store = createGameStore({ ...definition, rules, opponent: () => ['hit'] }, { seat: 'p1' });
  expect(store.answer(['pass'], 1)).toBe(true);
  expect(store.get().triggerCap).toMatchObject({ actionIndex: 1 });
  expect(store.get().history.steps[0]?.count).toBe(2);
  expect(store.undo()).toBe(true);
  expect(store.get().triggerCap).toBeUndefined();
  expect(store.redo()).toBe(true);
  expect(store.get().triggerCap).toMatchObject({ actionIndex: 1 });
});
