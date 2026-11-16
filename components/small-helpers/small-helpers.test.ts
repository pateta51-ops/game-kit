import { describe, expect, it } from 'vitest';
import { iconHtml, iconText, keysIn, missingKeys, relationIndex, runLegalCases, validateAll, type LegalRule } from './index.ts';

describe('iconHtml', () => {
  it('carries the word, escaped', () => {
    const h = iconHtml('credit', 'credit <1>');
    expect(h).toContain('icon-credit');
    expect(iconText(`Gain 2 ${h}.`)).toBe('Gain 2 credit <1>.');
  });
});

describe('legality fixtures', () => {
  const rules: Record<string, LegalRule<{ n: number }>> = {
    tooMany: (s) => (s.n > 3 ? [{ code: 'TOO_MANY', detail: s.n }] : []),
    negative: (s) => (s.n < 0 ? [{ code: 'NEGATIVE' }] : []),
  };
  it('passes paired fixtures', () => {
    const f = runLegalCases(rules, [
      { rule: 'tooMany', valid: { n: 3 }, invalid: { n: 4 }, codes: ['TOO_MANY'] },
      { rule: 'negative', valid: { n: 0 }, invalid: { n: -1 }, codes: ['NEGATIVE'] },
    ]);
    expect(f).toEqual([]);
    expect(validateAll(rules, { n: 9 })).toEqual([{ code: 'TOO_MANY', detail: 9 }]);
  });
  it('names each failure', () => {
    const f = runLegalCases(rules, [
      { rule: 'tooMany', valid: { n: 5 }, invalid: { n: 4 }, codes: ['X'] },
      { rule: 'gone', valid: { n: 0 }, invalid: { n: 0 }, codes: [] },
    ]);
    expect(f).toEqual(['negative: no fixture pair', 'tooMany: valid fixture gave TOO_MANY', 'tooMany: invalid fixture gave [TOO_MANY], wanted [X]', 'gone: no such rule']);
  });
});

describe('relationIndex', () => {
  const cards = [{ id: 'a', bonded: ['b'], reprint: ['zz'] }, { id: 'b', bonded: [], reprint: [] }];
  const x = relationIndex(cards, (c) => c.id, { bonded: (c) => c.bonded, reprint: (c) => c.reprint });
  it('goes both ways and reports dangling', () => {
    expect(x.to('bonded', 'a')).toEqual(['b']);
    expect(x.from('bonded', 'b')).toEqual(['a']);
    expect(x.to('bonded', 'b')).toEqual([]);
    expect(x.dangling).toEqual(['reprint: a -> zz']);
  });
});

describe('text keys', () => {
  it('finds the keys that do not resolve', () => {
    const keys = keysIn(['Do {{a.b}} and {{c}}', '{{a.b}}'], /\{\{(\w+(?:\.\w+)*)\}\}/);
    expect(keys.sort()).toEqual(['a.b', 'c']);
    expect(missingKeys(keys, { 'a.b': 'x' })).toEqual(['c']);
  });
});

