import { describe, expect, it } from 'vitest';
import { cardsCheckMain, patternNotes, patternProblems, recordsHash, type CardRecord, type CardsCheckInput, type Catalogue } from './index.ts';

// K509: an invented game; one pattern holds several printed wordings.
const C = (id: string, text: string) => ({ id, card: id.split('#')[0] ?? '', text });
const clauses = [
  C('owl#1', 'Gain 2 {gem}.'), C('fox#1', 'Gain 3 {gem}.'), C('elk#1', 'Gain 2 {gem}.'),
  C('bat#1', 'Gain 2 {leaf}.'), C('yak#1', 'Gain 2 {gem} each turn.'),
];
const cat: Catalogue = { summary: { clauses: 5 }, patterns: [{ id: 'P-07', clauses }], oneOffs: [], interactions: [] };
const R = (clause: string, patch: Record<string, unknown> = {}): CardRecord => ({ id: `${clause} r0`, clause, op: 'gain', n: 2, ...patch });
const base = clauses.map((c) => R(c.id));
const with_ = (clause: string, patch: Record<string, unknown>) => base.map((r) => (r.clause === clause ? { ...r, ...patch } : r));
const arMap = [{ id: 'P-07', ar: 'AR-9' }];
const p = (records: CardRecord[], o: Partial<Parameters<typeof patternProblems>[0]> = {}) => patternProblems({ catalogue: cat, records, arMap, ...o });

describe('K509 patternProblems wording', () => {
  it('same words, different shapes: fails, naming the key and the clashing clauses', () => {
    expect(p(with_('elk#1', { phase: 'night' }), { wording: true })).toEqual(['P-07 wording "Gain N {gem}." has 2 shapes: owl#1 {n,op}; elk#1 {n,op,phase}']);
  });
  it('different numbers, different shapes: fails, numbers are masked', () => {
    expect(p(with_('fox#1', { phase: 'night' }), { wording: true })).toEqual(['P-07 wording "Gain N {gem}." has 2 shapes: owl#1 {n,op}; fox#1 {n,op,phase}']);
  });
  it('different words or icons, different shapes: passes', () => {
    const recs = with_('yak#1', { duration: 'turn' }).map((r) => (r.clause === 'bat#1' ? { ...r, kind: 'leaf' } : r));
    expect(p(recs, { wording: true })).toEqual([]);
    expect(p(recs)).toEqual(['P-07 has 3 shapes: owl#1 {n,op}; bat#1 {kind,n,op}; yak#1 {duration,n,op}']);
  });
  it('a custom wording key', () => {
    expect(p(with_('bat#1', { kind: 'leaf' }), { wording: () => 'one' })).toEqual(['P-07 wording "one" has 2 shapes: owl#1 {n,op}; bat#1 {kind,n,op}']);
  });
  it('an allowShape exception passes; a null reason still compares', () => {
    const recs = with_('elk#1', { instead: true });
    const allowShape = (id: string, rs: CardRecord[]) => (id === 'elk#1' && rs.some((r) => r.instead === true) ? 'owl#2 changes it with "instead"' : null);
    expect(p(recs, { wording: true, allowShape })).toEqual([]);
    expect(p(recs, { allowShape })).toEqual([]);
    expect(p(recs, { wording: true, allowShape: () => null })).toEqual(['P-07 wording "Gain N {gem}." has 2 shapes: owl#1 {n,op}; elk#1 {instead,n,op}']);
  });
  it('the AR-map row checks stay as they are', () => {
    expect(p(base, { wording: true, arMap: [] })).toEqual(['P-07 has no AR-map row']);
    expect(p(base, { wording: true, allowShape: () => 'x', arMap: [{ id: 'P-07', ar: 'not read' }] })).toEqual(['P-07: AR-map row is not read']);
    expect(p(with_('elk#1', { phase: 'night' }), { wording: true, arMap: [{ id: 'P-07', ar: 'AR-9', split: true }] })).toEqual([]);
  });
  it('without the options the result is the old one', () => {
    expect(p(with_('bat#1', { kind: 'leaf' }))).toEqual(['P-07 has 2 shapes: owl#1 {n,op}; bat#1 {kind,n,op}']);
  });
  it('cardsCheckMain passes wording and allowShape through; exit code follows', () => {
    const recs = with_('bat#1', { kind: 'leaf' });
    const faces = clauses.map((c) => ({ card: c.card, text: c.text }));
    const readings = recs.map((r) => ({ clause: r.clause, verdict: 'ok' as const, note: '', hash: recordsHash([r]) }));
    const game: CardsCheckInput = { faces, catalogue: cat, records: recs, keys: [], words: {}, rulings: ['AR-9'], arMap, readings };
    const log: string[] = [];
    expect(cardsCheckMain([], game, (l) => log.push(l))).toBe(1);
    expect(log).toContain('FAIL patterns (1)');
    const log2: string[] = [];
    expect(cardsCheckMain([], { ...game, wording: true }, (l) => log2.push(l))).toBe(0);
    expect(log2).toEqual(['ok   clauses (0)', 'ok   restrictions (0)', 'ok   patterns (0)', 'ok   readings (0)']);
    const log3: string[] = [];
    expect(cardsCheckMain([], { ...game, records: with_('elk#1', { kind: 'x' }), readings: [], allowShape: () => 'excused' }, (l) => log3.push(l))).toBe(1);
    expect(log3).toContain('ok   patterns (0)');
  });
  it('an excused clause is printed as a NOTE with its reason; the exit code stays 0', () => {
    const recs = with_('elk#1', { instead: true });
    const faces = clauses.map((c) => ({ card: c.card, text: c.text }));
    const readings = recs.map((r) => ({ clause: r.clause, verdict: 'ok' as const, note: '', hash: recordsHash([r]) }));
    const allowShape = (id: string) => (id === 'elk#1' ? 'owl#2 changes it with "instead"' : null);
    const game: CardsCheckInput = { faces, catalogue: cat, records: recs, keys: [], words: {}, rulings: ['AR-9'], arMap, readings, wording: true, allowShape };
    const log: string[] = [];
    expect(cardsCheckMain([], game, (l) => log.push(l))).toBe(0);
    expect(log).toEqual(['ok   clauses (0)', 'ok   restrictions (0)', 'ok   patterns (0)', 'ok   readings (0)', 'NOTE elk#1 excused: owl#2 changes it with "instead"']);
    expect(patternNotes({ catalogue: cat, records: recs, arMap, allowShape })).toEqual(['elk#1 excused: owl#2 changes it with "instead"']);
    expect(patternNotes({ catalogue: cat, records: [], arMap, allowShape })).toEqual([]);
  });
  it('no records: a pattern gives no lines; a clause with no records is no shape', () => {
    expect(p([], { wording: true, allowShape: () => null, arMap: [] })).toEqual([]);
    const two = base.filter((r) => r.clause !== 'owl#1').map((r) => (r.clause === 'elk#1' ? { ...r, phase: 'night' } : r));
    expect(p(two, { wording: true })).toEqual(['P-07 wording "Gain N {gem}." has 2 shapes: fox#1 {n,op}; elk#1 {n,op,phase}']);
    expect(p(two.filter((r) => r.clause !== 'fox#1'), { wording: true })).toEqual([]);
  });
  it('wording true keeps numbers inside icon codes: {d6} and {d8} are different keys', () => {
    const dice = [C('ant#1', 'Roll {d6}.'), C('cow#1', 'Roll {d8}.'), C('pig#1', 'Roll {d6} twice.'), C('rat#1', 'Roll {d6} 3 times.')];
    const dc: Catalogue = { summary: { clauses: 4 }, patterns: [{ id: 'P-08', clauses: dice }], oneOffs: [], interactions: [] };
    const q = (records: CardRecord[]) => patternProblems({ catalogue: dc, records, arMap: [{ id: 'P-08', ar: 'AR-9' }], wording: true });
    expect(q([R('ant#1'), R('cow#1', { die: 8 })])).toEqual([]);
    expect(q([R('ant#1'), R('cow#1'), R('pig#1', { twice: true }), R('rat#1', { times: 3 })])).toEqual([]);
    const ext: Catalogue = { ...dc, patterns: [{ id: 'P-08', clauses: [...dice, C('emu#1', 'Roll {d6} 2 times.')] }] };
    expect(patternProblems({ catalogue: ext, records: [R('rat#1', { times: 3 }), R('emu#1')], arMap: [{ id: 'P-08', ar: 'AR-9' }], wording: true }))
      .toEqual(['P-08 wording "Roll {d6} N times." has 2 shapes: rat#1 {n,op,times}; emu#1 {n,op}']);
  });
});
