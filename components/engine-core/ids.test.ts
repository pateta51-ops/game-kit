// Deterministic card instance ids and the sequence counters; the error classes (§4.4).
import { describe, expect, it } from 'vitest';
import {
  cardInstanceId,
  EngineBugError,
  GameSetupError,
  notYet,
  parseCardInstanceId,
  takePromptSeq,
  takeSeq,
} from './index.ts';

describe('ids (§6.1)', () => {
  it('writes a card instance id as the card id, a hash and the copy number', () => {
    expect(cardInstanceId('C-05', 3)).toBe('C-05#3');
    expect(cardInstanceId('C-17', 1)).toBe('C-17#1');
  });

  it.each([0, -1, 1.5, Number.NaN])('refuses the copy number %s', (copy) => {
    expect(() => cardInstanceId('C-05', copy)).toThrow(EngineBugError);
  });

  it('refuses an empty definition id and one that holds a hash', () => {
    expect(() => cardInstanceId('', 1)).toThrow(EngineBugError);
    expect(() => cardInstanceId('C-1#2', 1)).toThrow(EngineBugError);
  });

  it('reads the definition id and copy back, and nothing from other strings', () => {
    for (const copy of [1, 7, 120])
      expect(parseCardInstanceId(cardInstanceId('C-12', copy))).toEqual({ defId: 'C-12', copy });
    for (const s of ['C-05#0', 'C-05', '#3', 'C-05#x', 'C-05#3#4', ''])
      expect(parseCardInstanceId(s), JSON.stringify(s)).toBeNull();
  });

  it('takeSeq returns the counter and advances it in place', () => {
    const s = { seq: 1 };
    expect([takeSeq(s), takeSeq(s), takeSeq(s)]).toEqual([1, 2, 3]);
    expect(s.seq).toBe(4);
  });
});

describe('prompt ids (§6.5)', () => {
  it('takePromptSeq returns the counter and advances it in place', () => {
    const s = { promptSeq: 1 };
    expect([takePromptSeq(s), takePromptSeq(s)]).toEqual([1, 2]);
    expect(s.promptSeq).toBe(3);
  });
});

describe('errors (§4.4)', () => {
  it('names each error class and keeps the message', () => {
    const bug = new EngineBugError('broken');
    expect(bug).toBeInstanceOf(Error);
    expect(bug.name).toBe('EngineBugError');
    expect(bug.message).toBe('broken');
    const setup = new GameSetupError('unknown starting kingdom');
    expect(setup.name).toBe('GameSetupError');
    expect(setup).toBeInstanceOf(Error);
  });

  it('notYet names the batch that will build the missing piece', () => {
    const error = notYet('the op "gain"', 'B5');
    expect(error).toBeInstanceOf(EngineBugError);
    expect(error.message).toBe('the op "gain" arrives with batch B5');
  });
});
