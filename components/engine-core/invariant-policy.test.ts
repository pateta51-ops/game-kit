import assert from 'node:assert/strict';
import { afterEach, describe, expect, it } from 'vitest';
import { advance, applyAction, createGame, createSave, kernelPort, replay, restoreSave, setInvariantChecking, StateInvariantError, type GameRules } from './index.ts';
import { answer, board, type BoardGame } from './fake/invariant-board.ts';

type BoardRules = GameRules<BoardGame>;
const strict: BoardRules = { ...board, invariantPolicy: 'strict' };
const diagnostic: BoardRules = { ...board, invariantPolicy: 'diagnostic' };
const options = { seed: 'board' };
const start = () => createGame(board, options, {}, null).state;

afterEach(() => setInvariantChecking(false));

describe('K592 invariant policy at real kernel boundaries', () => {
  it('rejects invalid setup and settled fixtures in strict mode with the global flag off', () => {
    expect(() => createGame(strict, { seed: 'bad setup' }, {}, null)).toThrow(/zone:cards.*appears in/);
    expect(() => advance(strict, { ...start(), owner: 'outsider' }, null)).toThrow(/owner:card/);
  });

  it('enforces strict policy when the kernel port receives an already-settled fixture', () => {
    const invalid = { ...start(), owner: 'outsider', stack: [] };
    const port = kernelPort(strict, null, { start: () => invalid });
    expect(() => port.start()).toThrow(/owner:card/);
    expect(() => port.settle(invalid)).toThrow(/owner:card/);
  });

  it.each([
    ['duplicate', 'zone:cards', /appears in/],
    ['zone', 'zone:cards', /forbidden zone/],
    ['owner', 'owner:card', /outside the game/],
    ['total', 'total:tokens', /conserved total/],
    ['counter', 'counter:tokens', /more than two tokens/],
  ] as const)('rejects a %s action without changing authoritative input', (pick, id, message) => {
    const state = start();
    const before = structuredClone(state);
    assert.throws(
      () => applyAction(strict, state, answer(state, pick), null),
      (e: unknown) => e instanceof StateInvariantError && e.violations.some(v => v.id === id && message.test(v.message)),
    );
    expect(state).toEqual(before);
  });

  it('applies the same strict policy to debug edits', () => {
    const state = start();
    expect(() => applyAction(strict, state, { kind: 'debug', verb: 'set', args: { path: ['tokens'], value: 5 } }, null)).toThrow(/total:tokens/);
    expect(state.tokens).toBe(1);
  });

  it('lets atomic operations finish before checking temporary state', () => {
    const state = start();
    const result = applyAction(strict, state, answer(state, 'valid'), null);
    expect(result.state.zones).toEqual({ hand: ['card'], supply: [], removed: [] });
    expect(result.violations).toEqual([]);
  });

  it('reports diagnostic mode independently while preserving the legacy global switch', () => {
    const state = start();
    const action = answer(state, 'owner');
    expect(applyAction(board, state, action, null).violations).toEqual([]);
    expect(applyAction(diagnostic, state, action, null)).toMatchObject({
      state: { owner: 'outsider' }, violations: [{ id: 'owner:card' }],
    });
    setInvariantChecking(true);
    expect(applyAction(board, state, action, null).violations).toMatchObject([{ id: 'owner:card' }]);
  });

  it('returns replay diagnostics but rejects required evidence at the violating transition', () => {
    const state = start();
    const actions = [answer(state, 'duplicate')];
    expect(replay(diagnostic, options, {}, actions, null)).toMatchObject({
      ok: true, violations: [{ id: 'zone:cards' }],
    });
    expect(replay(strict, options, {}, actions, null)).toMatchObject({
      ok: false, reason: 'illegal', invariantFailure: true, failedAt: 0, state, violations: [{ id: 'zone:cards' }],
    });
    expect(replay(strict, { seed: 'bad setup' }, {}, [], null)).toMatchObject({
      ok: false, reason: 'illegal', invariantFailure: true, failedAt: null, state: null, violations: [{ id: 'zone:cards' }],
    });
  });

  it('rejects a correctly sealed invalid save and retains warnings in diagnostic mode', () => {
    const state = start();
    const actions = [answer(state, 'counter')];
    const input = { options, rules: {}, actions, undoUsed: false, savedAt: '2026-01-01' };
    const save = createSave(board, input, null);
    expect(restoreSave(diagnostic, save, null)).toMatchObject({ ok: true, violations: [{ id: 'counter:tokens' }] });
    const rejected = restoreSave(strict, save, null);
    assert(!rejected.ok);
    expect(rejected.error).toMatch(/counter:tokens/);
    expect(rejected.violations).toMatchObject([{ id: 'counter:tokens' }]);
    const invalid = applyAction(board, state, answer(state, 'counter'), null).state;
    expect(() => createSave(strict, { ...input, state: invalid }, null)).toThrow(/counter:tokens/);
  });
});
