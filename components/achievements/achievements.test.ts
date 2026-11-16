import { describe, expect, it } from 'vitest';
import { bestCount, byFamily, checklist, countGames, createSummaryStore, evaluate, makeSummary, newlyEarned, validSummary, type AchievementDef, type GameSummary } from './index';

const g = (id: string, o: Partial<GameSummary> = {}): GameSummary =>
  makeSummary({ id, at: Number(id.replace(/\D/g, '')) || 1, result: 'win', rounds: 5, counts: {}, sets: { hero: ['a'] }, ...o });

const defs: AchievementDef[] = [
  { id: 'w1', name: 'First win', text: 'Win a game.', family: 'wins', points: 10, measure: countGames((x) => x.result === 'win', 1) },
  { id: 'w3', name: 'Three wins', text: 'Win 3.', family: 'wins', points: 20, measure: countGames((x) => x.result === 'win', 3) },
  { id: 'all', name: 'Everyone', text: 'Win with a, b, c.', family: 'heroes', points: 30, checklist: ['a', 'b', 'c'], measure: checklist(['a', 'b', 'c'], (x) => (x.result === 'win' ? x.sets['hero'] ?? [] : [])) },
  { id: 'kills', name: 'Slayer', text: '5 in one game.', family: 'feats', points: 5, measure: bestCount((x) => x.counts['kills'] ?? 0, 5) },
];

describe('achievements', () => {
  it('evaluates over summaries, a new definition applies to old games', () => {
    const games = [g('1'), g('2', { sets: { hero: ['b'] } }), g('3', { result: 'loss', sets: { hero: ['c'] }, counts: { kills: 9 } })];
    const s = evaluate(defs, games);
    expect(s.map((x) => x.earned)).toEqual([true, false, false, true]);
    expect(s[2]).toMatchObject({ current: 2, target: 3, done: ['a', 'b'] });
    expect(evaluate(defs.slice(0, 1), games)[0]?.earned).toBe(true);
  });
  it('practice games never count; empty list earns nothing', () => {
    expect(evaluate(defs, [g('1', { practice: true })]).some((x) => x.earned)).toBe(false);
    expect(evaluate(defs, []).some((x) => x.earned)).toBe(false);
  });
  it('newlyEarned lists what the newest game earned', () => {
    const a = [g('1')], b = [...a, g('2', { sets: { hero: ['b'] } }), g('3', { counts: { kills: 5 } })];
    expect(newlyEarned(defs, a, b)).toEqual(['w3', 'kills']);
  });
  it('byFamily counts earned, total and points', () => {
    expect(byFamily(defs, evaluate(defs, [g('1')]))).toEqual([
      { family: 'wins', earned: 1, total: 2, points: 10 },
      { family: 'heroes', earned: 0, total: 1, points: 0 },
      { family: 'feats', earned: 0, total: 1, points: 0 },
    ]);
  });
  it('the store keeps versioned summaries and skips bad rows', () => {
    const data: Record<string, string> = {};
    const storage = { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), removeItem: (k: string) => void delete data[k] };
    const st = createSummaryStore({ key: 'k', storage, onError: () => undefined });
    expect(st.record(g('1'))?.v).toBe(1);
    st.record(g('2'));
    expect(st.read().map((r) => r.id)).toEqual(['2', '1']);
    expect(validSummary({ v: 1, result: 'win', rounds: 1, counts: { a: 'x' }, sets: {} })).toBe(false);
    expect(validSummary({ v: 1, result: 'win', rounds: 1, counts: {}, sets: { a: [1] } })).toBe(false);
  });
});
