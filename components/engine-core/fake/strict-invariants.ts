import assert from 'node:assert/strict';
import { applyAction, createGame, StateInvariantError, type GameRules } from '../index.ts';
import { answer, board, type BoardGame } from './invariant-board.ts';

// The board config selects physical card IDs in each zone and a conserved token total.
const strict: GameRules<BoardGame> = { ...board, invariantPolicy: 'strict' };
const diagnostic: GameRules<BoardGame> = { ...board, invariantPolicy: 'diagnostic' };

const { state } = createGame(strict, { seed: 'board' }, {}, null);
const before = structuredClone(state);
const correct = applyAction(strict, state, answer(state, 'valid'), null);
assert.deepEqual(correct.state.zones, { hand: ['card'], supply: [], removed: [] });
assert.deepEqual(correct.violations, []);

function isDuplicate(error: unknown): boolean {
  return error instanceof StateInvariantError && error.violations.some(v => v.id === 'zone:cards');
}

assert.throws(() => createGame(strict, { seed: 'bad setup' }, {}, null), isDuplicate);
const invalid = answer(state, 'duplicate');
assert.throws(() => applyAction(strict, state, invalid, null), isDuplicate);
assert.deepEqual(state, before);

const warning = applyAction(diagnostic, state, invalid, null);
assert(warning.violations.some(v => v.id === 'zone:cards'));
assert.deepEqual(state, before);
