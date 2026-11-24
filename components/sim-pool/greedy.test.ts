import { describe, expect, it } from 'vitest';
import { greedyBot, type GreedyProbe } from './browser.ts';
import { DriverRng } from './rng.ts';

type Action = 'simple' | 'choose' | 'good' | 'bad' | 'unknown' | 'illegal';
const probe = (_v: string, a: Action): GreedyProbe<string, Action> => {
  switch (a) {
    case 'simple': return { kind: 'complete', score: 4 };
    case 'choose': return { kind: 'choice', score: 1, view: 'public next view', answers: ['good', 'bad'] };
    case 'good': return { kind: 'complete', score: 7 };
    case 'bad': return { kind: 'complete', score: -3 };
    case 'unknown': return { kind: 'unknown' };
    case 'illegal': return { kind: 'rejected' };
  }
};
const rng = () => new DriverRng('test');
describe('K424 public greedy look-ahead', () => {
  it('chooses a better nested branch over immediate value', () => {
    const bot = greedyBot({ probe, fallback: () => 0 });
    expect(bot.choose('public', ['simple', 'choose'], rng())).toBe('choose');
    expect(bot.reasons?.()).toContain('score 7 (nested preview)');
  });
  it('probes every root before exploring nested answers and respects the budget', () => {
    const seen: Action[] = [];
    const bot = greedyBot({ probe: (v: string, a: Action) => { seen.push(a); return probe(v, a); }, fallback: () => 0, maxProbes: 3 });
    expect(bot.choose('public', ['choose', 'simple'], rng())).toBe('simple');
    expect(seen).toEqual(['choose', 'simple']);
  });
  it('uses the public fallback for unknown and never picks rejected answers', () => {
    const bot = greedyBot({ probe, fallback: () => 5 });
    expect(bot.choose('public', ['illegal', 'simple', 'unknown'], rng())).toBe('unknown');
    expect(() => bot.choose('public', ['illegal'], rng())).toThrow('rejected');
    expect(() => bot.choose('public', [], rng())).toThrow('no legal');
  });
  it('does not chase a second nested decision or an unknown branch', () => {
    const seen: Action[] = [];
    const bot = greedyBot({ probe: (v: string, a: Action): GreedyProbe<string, Action> => {
      seen.push(a);
      return a === 'good' ? { kind: 'choice', score: 6, view: 'next', answers: ['unknown'] } : probe(v, a);
    }, fallback: () => 0 });
    expect(bot.choose('public', ['choose', 'simple'], rng())).toBe('choose');
    expect(seen).toEqual(['choose', 'simple', 'good', 'bad']);
  });
  it('repeats seeded ties and ignores prior calls', () => {
    const bot = greedyBot<string, Action>({ probe: () => ({ kind: 'complete', score: 1 }), fallback: () => 0, ties: 'random' });
    const a = bot.choose('public', ['simple', 'choose'], rng());
    bot.choose('other', ['bad'], rng());
    expect(bot.choose('public', ['simple', 'choose'], rng())).toBe(a);
  });
  it('rejects bad score and budget', () => {
    expect(() => greedyBot({ probe, fallback: () => 0, maxProbes: 0 })).toThrow('budget');
    const bot = greedyBot({ probe, fallback: () => NaN });
    expect(() => bot.choose('public', ['unknown'], rng())).toThrow('finite');
  });
});
