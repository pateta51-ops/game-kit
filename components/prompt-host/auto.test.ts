import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '../engine-core/index.ts';
import { autoAnswer } from './index.ts';
import { MARKET } from './fake/market.ts';

describe('autoAnswer (Jarl autoAnswer)', () => {
  const s0 = createGame(MARKET, { seed: 's' }, null, null).state;
  it('asks when more than one option is legal', () => {
    expect(autoAnswer(s0.prompt!, true)).toBeNull();
  });
  it('answers the only legal option unless off or a listed kind, and the engine takes it', () => {
    let s = s0;
    for (const picks of [['a'], ['1'], ['x', 'y', 'z'], ['no']]) s = applyAction(MARKET, s, { kind: 'answer', promptId: s.prompt!.id, picks }, null).state;
    const p = s.prompt!;
    expect(p.kind).toBe('pay');
    expect(autoAnswer(p, false)).toBeNull();
    expect(autoAnswer(p, true, ['pay'])).toBeNull();
    const picks = autoAnswer(p, true)!;
    expect(picks).toEqual(['gold']);
    expect(applyAction(MARKET, s, { kind: 'answer', promptId: p.id, picks }, null).state.result).toEqual({ kind: 'done' });
  });
  it('K641 does not answer a lone option the player has not seen; the same option seen is answered', () => {
    const p = { id: 1, kind: 'pick', min: 1, max: 1, options: [{ id: 'top', enabled: true, unseen: true as const }, { id: 'no', enabled: false }] };
    expect(autoAnswer(p, true)).toBeNull();
    expect(autoAnswer({ ...p, options: [{ id: 'top', enabled: true }, { id: 'no', enabled: false }] }, true)).toEqual(['top']);
  });
});
