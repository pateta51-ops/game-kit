import { describe, expect, it } from 'vitest';
import { cardsCheck, cardsCheckMain, recordsHash, type CardRecord, type CardsCheckInput, type Catalogue, type RecordIo } from './index.ts';

// K513: an invented game with known problems (no readings), a baseline file held in memory.
const C = (id: string, text: string) => ({ id, card: id.split('#')[0] ?? '', text });
const cat: Catalogue = { summary: { clauses: 2 }, patterns: [], oneOffs: [C('owl#1', 'Draw 2 cards.'), C('fox#1', 'Gain 1 coin.')], interactions: [] };
const records: CardRecord[] = [{ id: 'owl#1 r0', clause: 'owl#1', op: 'draw', n: 2 }, { id: 'fox#1 r0', clause: 'fox#1', op: 'gain', n: 1 }];
const faces = [{ card: 'owl', text: 'Draw 2 cards.' }, { card: 'fox', text: 'Gain 1 coin.' }];
const okLines = records.map((r) => ({ clause: r.clause, verdict: 'ok' as const, note: '', hash: recordsHash([r]) }));
const game: CardsCheckInput = { faces, catalogue: cat, records, keys: [], words: {}, rulings: [], arMap: [], readings: [] };
const today = Object.entries(cardsCheck(game)).flatMap(([k, ps]) => ps.map((p) => `${k}: ${p}`));
const fake = (files: Record<string, string>) => {
  const writes: [string, string][] = [];
  const io: RecordIo = { comments: () => [], git: () => '', read: (p) => { const t = files[p]; if (t === undefined) throw new Error('no file'); return t; }, write: (p, t) => { writes.push([p, t]); } };
  return { io, writes };
};
const run = (argv: string[], g: CardsCheckInput, files: Record<string, string>) => { const log: string[] = [], f = fake(files); return { code: cardsCheckMain(argv, g, (l) => log.push(l), f.io), log, writes: f.writes }; };

describe('K513 baseline', () => {
  it('the invented game has problems today', () => { expect(today.length).toBe(2); });
  it('allowed: every problem in the file passes, exit 0', () => {
    const r = run(['--baseline', 'b.txt'], game, { 'b.txt': `# header\n\n${today.join('\n')}\n` });
    expect(r.code).toBe(0);
    expect(r.log).toEqual(['cards:check: clauses 0, restrictions 0, patterns 0, readings 2 (2 in the baseline); 0 new, 0 stale']);
  });
  it('new: a problem not in the file fails', () => {
    const r = run(['--baseline', 'b.txt'], game, { 'b.txt': `${today[0]}\n` });
    expect(r.code).toBe(1);
    expect(r.log).toEqual([`FAIL ${today[1]}`, 'cards:check: clauses 0, restrictions 0, patterns 0, readings 2 (1 in the baseline); 1 new, 0 stale']);
  });
  it('stale: a file line no longer found fails and says where to remove it', () => {
    const r = run([], { ...game, baseline: 'b.txt' }, { 'b.txt': `${today.join('\n')}\nreadings: gone\n` });
    expect(r.code).toBe(1);
    expect(r.log[0]).toBe('FAIL baseline lists "readings: gone", which is gone: remove it from b.txt');
    expect(r.log[1]).toContain('0 new, 1 stale');
  });
  it('write-baseline: writes today with a # header, exit 0', () => {
    const r = run(['--write-baseline'], { ...game, baseline: 'b.txt' }, {});
    expect(r.code).toBe(0);
    expect(r.writes).toEqual([['b.txt', `# cards:check problems allowed for now; this file only shrinks\n${today.join('\n')}\n`]]);
    expect(r.log).toEqual(['cards:check: baseline written, 2 lines']);
  });
  it('no baseline: output and exit code unchanged', () => {
    const r = run([], game, { 'b.txt': today.join('\n') });
    expect(r.code).toBe(1);
    expect(r.log.slice(0, 4)).toEqual(['ok   clauses (0)', 'ok   restrictions (0)', 'ok   patterns (0)', 'FAIL readings (2)']);
    expect(r.writes).toEqual([]);
    expect(run([], { ...game, readings: okLines }, {}).code).toBe(0);
  });
});
