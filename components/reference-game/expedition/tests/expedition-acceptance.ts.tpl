import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyAction, createGame, createSave, hashValue, IllegalActionError, restoreSave, type AnswerAction } from '../kit/engine-core/index.ts';
import { createGameStore } from '../kit/game-store/index.ts';
import { DriverRng, legalAnswers, playOne } from '../kit/sim-pool/index.ts';
import { createExpedition, expeditionView, EXPEDITIONS, type ExpeditionConfig, type ExpeditionState } from '../src/engine/expedition.ts';
import { expeditionSim } from '../src/expedition-sim.ts';

// Independent expectations authored from the printed expedition contract, not executable damage/placement callbacks.
const ORACLES = [
  { id: 'short-passage', firstHealth: 1, damage: 2, attacks: 2, actions: 8, goal: 'c4', spaces: 5 },
  { id: 'long-gallery', firstHealth: 1, damage: 3, attacks: 2, actions: 12, goal: 'c7', spaces: 8 },
] as const;
const action = (state: ExpeditionState, pick: string): AnswerAction => ({ kind: 'answer', promptId: state.prompt?.id ?? -1, picks: [pick] });

function topology(state: ExpeditionState): void {
  const board = state.map.board;
  assert.equal(new Set(board.order).size, board.order.length);
  assert.deepEqual(new Set(board.order), new Set(Object.keys(board.spaces)));
  for (const id of board.order) {
    const space = board.spaces[id]!;
    assert.equal(id, `c${String(space.x)}`);
    assert.equal(space.y, 0);
    assert.ok(Number.isSafeInteger(space.x));
    for (const to of board.adjacency[id] ?? []) {
      assert.ok(board.adjacency[to]?.includes(id), 'adjacency must be reciprocal');
      assert.equal(Math.abs(space.x! - board.spaces[to]!.x!), 1, 'all joins connect adjacent coordinates');
    }
  }
}

function exercise(config: ExpeditionConfig, seed: string) {
  const oracle = ORACLES.find(item => item.id === config.id)!;
  const { def, pilot } = createExpedition(config);
  const options = { seed };
  let state = createGame(def.rules, options, {}, null).state;
  const startingOrder = [...state.map.tiles];
  const history: AnswerAction[] = [];
  const take = (pick: string): void => {
    const step = action(state, pick);
    const before = JSON.stringify(state);
    const health = state.guard.health;
    const result = (() => {
      try { return applyAction(def.rules, state, step, null); }
      finally { assert.equal(JSON.stringify(state), before, 'a successful or refused transition must leave its authoritative input unchanged'); }
    })();
    assert.equal(result.triggerCap, undefined);
    assert.deepEqual(result.violations, []);
    if (pick === 'attack:guard') assert.deepEqual(result.events.filter(event => event.type === 'damaged').map(event => event.amount), [health - result.state.guard.health], 'damage events report actual health lost after clamping');
    state = result.state;
    history.push(step);
    topology(state);
  };
  const refuse = (pick: string): void => {
    const before = JSON.stringify(state);
    assert.throws(() => applyAction(def.rules, state, action(state, pick), null), IllegalActionError);
    assert.equal(JSON.stringify(state), before, 'refusal preserves authoritative state including RNG/points/map');
  };
  refuse('move:c99');
  refuse(`move:c${String(config.approach)}`);
  refuse(`explore:east:c${String(config.approach)}`);
  if (config.approach === 2) { refuse('attack:guard'); take('move:c1'); }
  const beforeAttack = state.points;
  take('attack:guard');
  assert.equal(state.guard.health, oracle.firstHealth, 'printed first-hit health');
  assert.equal(state.points, beforeAttack - 1);
  assert.equal(state.guard.defeated, false);
  assert.deepEqual(state.log.filter(event => event.type === 'damaged').map(event => event.amount), [oracle.damage]);
  refuse(`move:c${String(config.approach)}`);
  take('attack:guard');
  assert.equal(state.guard.health, 0);
  assert.equal(state.guard.defeated, true);
  assert.equal(state.log.filter(event => event.type === 'defeated').length, 1);
  refuse('attack:guard');
  take(`move:c${String(config.approach)}`);
  const edge = state.map.openEdges[0]!;
  const beforeGrowth = state;
  take(`explore:${edge.id}`);
  assert.deepEqual(state.rng, beforeGrowth.rng, 'hidden order is seeded once, not rerolled at reveal');
  assert.equal(state.points, beforeGrowth.points - 1);
  assert.equal(state.map.tiles.length, beforeGrowth.map.tiles.length - 1);
  assert.deepEqual(state.map.tiles, beforeGrowth.map.tiles.slice(1));
  assert.equal(state.revealedTiles.at(-1), beforeGrowth.map.tiles[0]);
  assert.ok(!state.map.openEdges.some(item => item.id === edge.id), 'chosen frontier is consumed');
  assert.deepEqual([...state.revealedTiles, ...state.map.tiles].sort(), config.tiles.map(tile => tile.id).sort());
  assert.ok(state.log.at(-1)?.reveal, 'exploration is a recorded information reveal');
  refuse(`explore:${edge.id}`);

  const save = createSave(def.rules, { options, rules: {}, actions: history, undoUsed: false, savedAt: '2026-11-26T00:00:00.000Z' }, null);
  const restored = restoreSave(def.rules, JSON.parse(JSON.stringify(save)) as typeof save, null);
  if (!restored.ok) throw new Error(restored.error);
  assert.deepEqual(restored.state, state, 'pending save/replay retains the board, hidden inventory and prompt');
  const foreign = createExpedition({ ...config, power: config.power + 1 });
  assert.equal(restoreSave(foreign.def.rules, save, null).ok, false, 'a changed rule configuration cannot reuse the save identity');
  state = restored.state;
  while (state.result === null) {
    assert.ok(state.prompt);
    assert.ok(history.length < 100, 'bounded continuation');
    const rng = new DriverRng(`${seed}|pilot|${String(state.prompt.id)}`);
    const chosen = pilot.choose(expeditionView(state), legalAnswers(state.prompt, rng), rng);
    take(chosen.picks[0]!);
  }
  assert.equal(state.result, 'escaped');
  assert.equal(state.points, 0, 'entering the exit on the last point wins before exhaustion');
  assert.equal(state.goal, oracle.goal);
  assert.equal(state.map.board.order.length, oracle.spaces);
  assert.equal(history.length, oracle.actions);
  assert.equal(state.log.filter(event => event.type === 'damaged').length, oracle.attacks);
  assert.equal(state.log.filter(event => event.type === 'defeated').length, 1);
  assert.equal(state.map.tiles.length, 0);
  assert.deepEqual(state.map.openEdges, []);
  assert.deepEqual(state.revealedTiles, startingOrder);
  assert.equal(state.prompt, null);

  const store = createGameStore(def, { seat: 'explorer', seed, instant: () => true });
  const beforeInvalid = store.get().state;
  assert.equal(store.answer(['move:c99'], beforeInvalid.prompt!.id), false);
  assert.deepEqual(store.get().state, beforeInvalid);
  for (const step of history) assert.equal(store.answer(step.picks, step.promptId), true, 'same real actions accepted by the live store');
  assert.deepEqual(store.get().state, state);
  const sim = playOne(expeditionSim(config), null, { index: 0, seed, driver: 'expedition-pilot' }, undefined, { view: true });
  assert.equal(sim.error, undefined, JSON.stringify(sim));
  assert.equal(sim.result, 'escaped');
  assert.equal(sim.actions, oracle.actions);
  assert.equal(sim.hash, hashValue(store.saved().actions));
  assert.deepEqual(sim.summary, store.get().view);
  assert.equal(playOne(expeditionSim(config), null, { index: 1, seed, driver: 'expedition-pilot' }, undefined, { view: true }).hash, sim.hash);
  const short = playOne(expeditionSim({ ...config, points: config.points - 1 }), null, { index: 2, seed, driver: 'expedition-pilot' }, undefined, { view: true });
  assert.equal(short.error, undefined, JSON.stringify(short));
  assert.equal(short.result, 'exhausted');
  assert.equal(short.actions, config.points - 1);
  return { configuration: config.id, seed, actions: history.length, result: state.result, startingOrder, replay: 'matched', storeSimulation: 'matched' };
}

export function expeditionAcceptance() {
  const records = EXPEDITIONS.flatMap(config => ['expedition-a', 'expedition-b', 'expedition-c', 'expedition-d'].map(seed => exercise(config, seed)));
  for (const config of EXPEDITIONS) {
    assert.ok(new Set(records.filter(record => record.configuration === config.id).map(record => record.startingOrder.join(','))).size > 1, 'seeds materially vary the hidden physical order');
    assert.throws(() => createExpedition({ ...config, power: config.armor }), /Invalid/);
    assert.throws(() => createExpedition({ ...config, tiles: [config.tiles[0]!, config.tiles[0]!] }), /Invalid/);
  }
  return { schema: 'expedition-acceptance/v1', status: 'passed', scope: 'original bounded tactical engine/store/simulation; browser not assessed', records };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(expeditionAcceptance(), null, 2)); }
  catch (error) { console.error(error); process.exitCode = 1; }
}
