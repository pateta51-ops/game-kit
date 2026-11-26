import assert from 'node:assert/strict';
import { ACCEPTANCE_ROUTE, CONTENT, COURIER, GAME_DEF, applyAction, createGame } from '../src/engine/api.ts';

const start = GAME_DEF.start('configuration');
let state = createGame(COURIER, start.options, start.rules, CONTENT).state;
for (const to of ACCEPTANCE_ROUTE) {
  assert(state.prompt, 'courier acceptance route continues after the game ended');
  state = applyAction(COURIER, state, { kind: 'answer', promptId: state.prompt.id, picks: [to] }, CONTENT).state;
}
assert.equal(state.result, 'delivered', 'courier acceptance route must deliver the parcel');
console.log('Courier configuration route validated; gameplay acceptance still requires tests and browser execution');
