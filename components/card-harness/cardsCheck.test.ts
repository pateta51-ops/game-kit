import { describe, expect, it } from 'vitest';
import {
  cardsCheckMain, catalogueProblems, clauseProblems, groupClauses, maskClause, numberClauses, parseReadings, patternProblems, readingProblems,
  recordReadings, recordsHash, restrictionProblems, splitClauses, type CardRecord, type CardsCheckInput, type Catalogue, type RecordIo,
} from './index.ts';

// A fake game: three cards, one pattern of two clauses, two one-offs.
const faces = [
  { card: 'scout', text: 'Draw 2 cards. ¶ Start of round: you may gain 1 coin.' },
  { card: 'guard', text: 'Gain 3 coins.' },
  { card: 'mage', text: 'Gain 2 coins.' },
];
const C = (id: string, text: string) => ({ id, card: id.split('#')[0] ?? '', text });
const cat: Catalogue = {
  summary: { clauses: 4 },
  patterns: [{ id: 'P-01', name: 'gain', clauses: [C('guard#1', 'Gain 3 coins.'), C('mage#1', 'Gain 2 coins.')] }],
  oneOffs: [C('scout#1', 'Draw 2 cards.'), C('scout#2', 'Start of round: you may gain 1 coin.')],
  interactions: [],
};
const records: CardRecord[] = [
  { id: 'scout#1 r0', clause: 'scout#1', op: 'draw', n: 2 },
  { id: 'scout#2 r0', clause: 'scout#2', op: 'gain', n: 1, moment: 'start', optional: true },
  { id: 'guard#1 r0', clause: 'guard#1', op: 'gain', n: 3 },
  { id: 'mage#1 r0', clause: 'mage#1', op: 'gain', n: 2 },
];
const words = { 'moment:start': ['Start of'], 'optional:true': ['you may'], 'duration:round': ['this round'] };
const keys = ['moment', 'optional', 'duration', 'phase'];
const rulings = ['AR-1', 'AR-2'];
const okLines = (rs: CardRecord[]) => [...new Set(rs.map((r) => r.clause))].map((c) => ({ clause: c, verdict: 'ok' as const, note: '', hash: recordsHash(rs.filter((r) => r.clause === c)) }));
const game: CardsCheckInput = { faces, catalogue: cat, records, keys, words, rulings, arMap: [{ id: 'P-01', ar: 'AR-1' }], readings: okLines(records), batch: () => ['scout#1', 'scout#2'] };
const set = (id: string, patch: Record<string, unknown>) => records.map((r) => (r.id === id ? { ...r, ...patch } : r));

it('the fake game passes all four parts with exit 0', () => {
  const log: string[] = [];
  expect(cardsCheckMain([], game, (l) => log.push(l))).toBe(0);
  expect(log).toEqual(['ok   clauses (0)', 'ok   restrictions (0)', 'ok   patterns (0)', 'ok   readings (0)']);
  expect(catalogueProblems(cat)).toEqual([]);
});
it('one problem in any part gives exit 1', () => {
  const log: string[] = [];
  expect(cardsCheckMain([], { ...game, readings: [] }, (l) => log.push(l))).toBe(1);
  expect(log).toContain('FAIL readings (4)');
});

describe('clauses', () => {
  const p = (o: Partial<Parameters<typeof clauseProblems>[0]>) => clauseProblems({ faces, catalogue: cat, records, ...o });
  it('clauses that do not rejoin the face', () => {
    expect(p({ faces: [{ card: 'scout', text: 'Draw 3 cards. ¶ Start of round: you may gain 1 coin.' }, ...faces.slice(1)] })).toEqual(['scout: clauses do not rejoin']);
  });
  it('a clause that does not end a sentence or a paragraph', () => {
    const c2: Catalogue = { ...cat, oneOffs: [C('scout#1', 'Draw 2 cards. Start of'), C('scout#2', 'round: you may gain 1 coin.')] };
    expect(p({ catalogue: c2, faces: [{ card: 'scout', text: 'Draw 2 cards. Start of round: you may gain 1 coin.' }, ...faces.slice(1)] })).toEqual(['scout#1 does not end a sentence']);
  });
  it('a clause ending at a paragraph mark needs no full stop', () => {
    const c2: Catalogue = { ...cat, oneOffs: [C('scout#1', 'Draw 2 cards'), C('scout#2', 'Start of round: you may gain 1 coin.')] };
    expect(p({ catalogue: c2, faces: [{ card: 'scout', text: 'Draw 2 cards ¶ Start of round: you may gain 1 coin.' }, ...faces.slice(1)] })).toEqual([]);
  });
  it('a count that differs from the content', () => {
    expect(p({ faces: [{ ...faces[0]!, clauses: 3 }, ...faces.slice(1)] })).toEqual(['scout: 3 clauses in content, 2 in the catalogue']);
  });
  it('a face with no row, and a clause on no face', () => {
    expect(p({ faces: [...faces, { card: 'rogue', text: 'Steal 1.' }] })).toEqual(['missing row rogue']);
    expect(p({ faces: faces.slice(0, 2) })).toEqual(['catalogued clause mage#1 is on no face']);
  });
  it('orphans both ways', () => {
    expect(p({ records: [...records, { id: 'x', clause: 'scout#3' }] })).toEqual(['orphan record x (clause scout#3 does not exist)']);
    expect(p({ records: records.slice(1) })).toEqual(['no record: scout#1']);
  });
  it('open clauses: a reason excuses a missing record; no reason or no such clause fails', () => {
    expect(p({ records: records.slice(1), open: [{ clause: 'scout#1', reason: 'sweep' }] })).toEqual([]);
    expect(p({ records: records.slice(1), open: [{ clause: 'scout#1', reason: ' ' }] })).toEqual(['open clause scout#1 has no reason']);
    expect(p({ open: [{ clause: 'scout#9', reason: 'sweep' }] })).toEqual(['open clause scout#9 does not exist']);
  });
});

describe('restrictions', () => {
  const p = (o: Partial<Parameters<typeof restrictionProblems>[0]>) => restrictionProblems({ catalogue: cat, records, keys, words, rulings, ...o });
  it('a restriction with no printed words and no ruling', () => {
    expect(p({ records: set('guard#1 r0', { phase: 'night' }) })).toEqual(['guard#1 r0: phase=night has no printed source and no AR']);
    expect(p({ records: set('guard#1 r0', { phase: 'night', why: 'AR-2' }) })).toEqual([]);
    expect(p({ records: set('guard#1 r0', { phase: 'night', why: 'AR-21' }) })).toEqual(['guard#1 r0: phase=night has no printed source and no AR']);
  });
  it('a printed restriction word with no restriction', () => {
    expect(p({ records: set('scout#2 r0', { optional: undefined }) })).toEqual(['scout#2: printed "you may" has no restriction optional=true']);
  });
  it('a lasting record with no duration', () => {
    const lasting = (r: CardRecord) => r.op === 'gain';
    expect(p({ lasting, records: records.map((r) => (r.op === 'gain' ? { ...r, duration: 'round', why: 'AR-1' } : r)) })).toEqual([]);
    expect(p({ lasting, records: records.map((r) => (r.id === 'mage#1 r0' ? r : r.op === 'gain' ? { ...r, duration: 'round', why: 'AR-1' } : r)) })).toEqual(['mage#1 r0: lasting effect with no duration']);
  });
  it('exceptions cite a ruling and match something', () => {
    const recs = set('guard#1 r0', { phase: 'night' });
    expect(p({ records: recs, exceptions: [{ id: 'guard#1 r0', key: 'phase', ar: 'AR-1' }] })).toEqual([]);
    expect(p({ records: recs, exceptions: [{ id: 'guard#1 r0', key: 'phase', ar: 'AR-9' }] })).toEqual([
      'guard#1 r0: phase=night has no printed source and no AR', 'exception guard#1 r0 phase cites no known ruling (AR-9)',
    ]);
    expect(p({ exceptions: [{ id: 'mage#1 r0', key: 'phase', ar: 'AR-1' }] })).toEqual(['exception mage#1 r0 phase matches nothing']);
  });
  it('--list-restrictions prints the batch clauses with the most restriction words first', () => {
    const log: string[] = [];
    expect(cardsCheckMain(['--list-restrictions', 'B1'], game, (l) => log.push(l))).toBe(0);
    expect(log).toEqual(['scout#2 2 [Start of; you may] Start of round: you may gain 1 coin.', 'scout#1 0 [] Draw 2 cards.']);
  });
});

describe('patterns', () => {
  const p = (o: Partial<Parameters<typeof patternProblems>[0]>) => patternProblems({ catalogue: cat, records, arMap: [{ id: 'P-01', ar: 'AR-1' }], ...o });
  it('one shape per pattern unless the AR map splits it', () => {
    const recs = set('mage#1 r0', { phase: 'night' });
    expect(p({ records: recs })).toEqual(['P-01 has 2 shapes: guard#1 {n,op}; mage#1 {n,op,phase}']);
    expect(p({ records: recs, arMap: [{ id: 'P-01', ar: 'AR-1', split: true }] })).toEqual([]);
  });
  it('an encoded pattern with no AR-map row, or a row not read', () => {
    expect(p({ arMap: [] })).toEqual(['P-01 has no AR-map row']);
    expect(p({ arMap: [{ id: 'P-01', ar: 'not read' }] })).toEqual(['P-01: AR-map row is not read']);
    expect(p({ arMap: [], records: records.slice(0, 2) })).toEqual([]);
  });
});

describe('readings', () => {
  const p = (o: Partial<Parameters<typeof readingProblems>[0]>) => readingProblems({ records, readings: okLines(records), rulings, ...o });
  it('no reading, a stale ok, an ambiguous line with no AR, a wrong line', () => {
    expect(p({ readings: okLines(records).slice(1) })).toEqual(['no reading for scout#1']);
    expect(p({ records: set('guard#1 r0', { n: 4 }) })).toEqual(['no reading for guard#1 (records changed since the judge)']);
    const others = okLines(records).filter((l) => l.clause !== 'mage#1');
    expect(p({ readings: [...others, { clause: 'mage#1', verdict: 'ambiguous', note: 'two readings' }] })).toEqual(['mage#1: ambiguous, no AR']);
    expect(p({ readings: [...others, { clause: 'mage#1', verdict: 'ambiguous', note: 'see AR-2' }] })).toEqual([]);
    expect(p({ readings: [...others, { clause: 'mage#1', verdict: 'wrong', note: 'adds a phase' }] })).toEqual(['mage#1: judged wrong: adds a phase']);
  });
  it('the hash ignores key order and record order', () => {
    const a: CardRecord = { id: 'a', clause: 'c', n: 1, op: 'x' }, b: CardRecord = { op: 'y', clause: 'c', id: 'b' };
    expect(recordsHash([a, b])).toBe(recordsHash([b, { op: 'x', n: 1, clause: 'c', id: 'a' }]));
    expect(recordsHash([a])).not.toBe(recordsHash([b]));
  });
  it('parses judge lines bare, bulleted and as table rows, with a hash cell', () => {
    expect(parseReadings('Verdicts:\n- `a#1` | ok | fine\n| a#2 | wrong | x | y |\nb#1 | ambiguous | AR-1\n| a#3 | ok | n | 0123456789ab |\nnot | a | line')).toEqual([
      { clause: 'a#1', verdict: 'ok', note: 'fine' }, { clause: 'a#2', verdict: 'wrong', note: 'x | y' },
      { clause: 'b#1', verdict: 'ambiguous', note: 'AR-1' }, { clause: 'a#3', verdict: 'ok', note: 'n', hash: '0123456789ab' },
    ]);
  });
});

describe('--record', () => {
  const fake = (comments: string[]) => {
    const calls: string[][] = [], files: Record<string, string> = {};
    const io: RecordIo = { comments: () => comments, write: (p, t) => void (files[p] = t), git: (a) => void calls.push([...a]) };
    return { io, calls, files };
  };
  const judge = 'scout#1 | ok | reads right\nscout#2 | ambiguous | AR-1 decides';
  it('writes the latest judge comment with a hash per clause, commits and pushes; the file then passes readings', () => {
    const f = fake(['scout#1 | wrong | old', judge, 'thanks']);
    const r = recordReadings({ batch: 'B1', pr: 7, clauses: ['scout#1', 'scout#2'], records }, f.io);
    expect(r).toEqual({ failed: false, problems: [], path: 'docs/cards/readings/B1.md' });
    expect(f.calls).toEqual([['add', 'docs/cards/readings/B1.md'], ['commit', '-m', 'readings: B1 from PR #7'], ['push']]);
    const lines = parseReadings(f.files['docs/cards/readings/B1.md'] ?? '');
    expect(lines.map((l) => [l.clause, l.verdict, l.hash])).toEqual([['scout#1', 'ok', recordsHash(records.slice(0, 1))], ['scout#2', 'ambiguous', recordsHash(records.slice(1, 2))]]);
    expect(readingProblems({ records: records.slice(0, 2), readings: lines, rulings })).toEqual([]);
  });
  it('fails, writing nothing, on a line naming no clause of the batch, a clause with no line, or no judge comment', () => {
    const f = fake([`${judge}\nguard#1 | ok | x`]);
    expect(recordReadings({ batch: 'B1', pr: 7, clauses: ['scout#1', 'scout#2'], records }, f.io).problems).toEqual(['judge line names no clause of B1: guard#1']);
    expect(recordReadings({ batch: 'B1', pr: 7, clauses: ['scout#1', 'scout#2', 'scout#3'], records }, fake([judge]).io).problems).toEqual(['scout#3 has no judge line']);
    expect(recordReadings({ batch: 'B1', pr: 7, clauses: ['scout#1'], records }, fake(['lgtm']).io).problems).toEqual(['PR #7 has no judge comment', 'scout#1 has no judge line']);
    expect(f.calls).toEqual([]);
    expect(f.files).toEqual({});
  });
  it('through cardsCheckMain: exit codes, and --pr is required', () => {
    const log: string[] = [];
    expect(cardsCheckMain(['--record', 'B1', '--pr', '7'], game, (l) => log.push(l), fake([judge]).io)).toBe(0);
    expect(cardsCheckMain(['--record', 'B1', '--pr', '7'], game, (l) => log.push(l), fake(['scout#1 | ok | x']).io)).toBe(1);
    expect(cardsCheckMain(['--record', 'B1'], game, (l) => log.push(l), fake([judge]).io)).toBe(1);
    expect(log).toEqual(['recorded docs/cards/readings/B1.md', 'FAIL scout#2 has no judge line', 'FAIL --record needs --pr <n>']);
  });
});

describe('clause tools and the catalogue contract', () => {
  const LEAD = /(?=\bWhen Played:)/;
  it('splits first on the paragraph mark, then before each lead; numbers in printed order', () => {
    expect(splitClauses('Draw 2. When Played: gain 1. ¶ Gain 3.', LEAD)).toEqual(['Draw 2.', 'When Played: gain 1.', 'Gain 3.']);
    expect(splitClauses('Draw 2. When Played: gain 1.')).toEqual(['Draw 2. When Played: gain 1.']);
    expect(numberClauses('scout', ['Draw 2. ¶ Gain 1.', 'Lose 1.'])).toEqual([C('scout#1', 'Draw 2.'), C('scout#2', 'Gain 1.'), C('scout#3', 'Lose 1.')]);
    expect(numberClauses('scout', ['Draw 2.'], undefined, 0)[0]?.id).toBe('scout#0');
  });
  it('masks numbers, icon amounts and names, and groups equal wordings, biggest first', () => {
    expect(maskClause('Gain 3 {coin:2} from Old Guard or Guard.', ['Guard', 'Old Guard'])).toBe('Gain N {coin:N} from NAME or NAME.');
    const g = groupClauses([C('a#1', 'Gain 3 coins.'), C('b#1', 'Draw 1.'), C('c#1', 'Gain 2 coins.')]);
    expect(g.map((x) => [x.key, x.clauses.map((c) => c.id)])).toEqual([['Gain N coins.', ['a#1', 'c#1']], ['Draw N.', ['b#1']]]);
  });
  it('a clause in two places, a one-clause pattern, a summary that miscounts', () => {
    const bad: Catalogue = { ...cat, summary: { clauses: 5 }, patterns: [...cat.patterns, { id: 'P-02', clauses: [C('scout#1', 'Draw 2 cards.')] }] };
    expect(catalogueProblems(bad)).toEqual(['scout#1 is in 2 places: P-02, one-offs', 'P-02 has 1 clause(s)', 'summary says 5 clauses, counted 4']);
  });
});
