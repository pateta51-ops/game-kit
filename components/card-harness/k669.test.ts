import { describe, expect, it } from 'vitest';
import { describeCheck, parseReadingFiles, readingProblems, type CardRecord } from './index.ts';

const card = (printed: string, id = 'x#1') => [{ id, printed, encoding: printed }];
const opts = (o: object) => o as never;
const raw = { raw: { allow: ['freeLight'] } };
const gen = (g: string, o: object = raw) => describeCheck([{ id: 'x#1', printed: g, encoding: g }], (e: string) => e, undefined, undefined, undefined, opts(o));

describe('K669 describeCheck raw words', () => {
  it('a camelCase flag in the reading is reported', () => { expect(gen('Mark doomThreshold').join('\n')).toContain('raw "doomThreshold"'); });
  it('a snake_case rule key is reported', () => { expect(gen('Draw 2 cards via rule_key').join('\n')).toContain('raw "rule_key"'); });
  it('an empty bracket is reported', () => { expect(gen('Draw 2 {} cards').join('\n')).toContain('empty bracket'); });
  it('an empty square bracket is reported', () => { expect(gen('Draw 2 [] cards').join('\n')).toContain('empty bracket'); });
  it('a stand-in 99 is reported', () => { expect(gen('Draw 99 cards').join('\n')).toContain('stand-in number 99'); });
  it('an allowed stand-in number passes, an unlisted one fails', () => {
    expect(gen('Draw 99 cards', { raw: { allow: ['99'] } })).toEqual([]);
    expect(gen('Draw 999 cards', { raw: { allow: ['99'] } }).join('\n')).toContain('stand-in number 999');
  });
  it('allowed words pass',() => { expect(gen('Mark freeLight')).toEqual([]); });
  it('without the option nothing changes', () => { expect(describeCheck(card('Draw 99 doomThreshold {}'), (e) => e)).toEqual([]); });
  it('a code in braces is not a raw word', () => { expect(gen('Draw 2 {attackValue}')).toEqual([]); });
});

describe('K669 describeCheck accepted', () => {
  const run = (accepted: Record<string, string>) => describeCheck(card('Draw 2'), () => 'Take 2', undefined, undefined, undefined, opts({ accepted }));
  const line = 'x#1: the generated reading differs from the printed text:\n  printed:   Draw 2\n  generated: Take 2';
  it('an accepted line is dropped', () => { expect(run({ [line]: 'wording' })).toEqual([]); });
  it('a stale accepted line fails', () => { expect(run({ [line]: 'wording', 'y#1: gone': 'old' }).join('\n')).toContain('stale accepted line: y#1: gone'); });
  it('an accepted line with no reason fails', () => { expect(run({ [line]: ' ' }).join('\n')).toContain('no reason'); });
  it('no accepted option: the line stays', () => { expect(describeCheck(card('Draw 2'), () => 'Take 2')).toHaveLength(1); });
});

describe('K669 describeCheck tokensOnly', () => {
  const t = (p: string, g: string) => describeCheck([{ id: 'x#1', printed: p, encoding: g }], (e: string) => e, undefined, undefined, undefined, opts({ tokensOnly: true }));
  it('word differences are ignored', () => { expect(t('Draw 2 {card}', 'Take 2 {card} now')).toEqual([]); });
  it('a changed number is caught', () => { expect(t('Draw 2 {card}', 'Draw 3 {card}').join('\n')).toContain('printed [2] is not in the generated reading'); });
  it('a changed icon is caught', () => { expect(t('Draw 2 {card}', 'Draw 2 {wound}').join('\n')).toContain('generated [wound]'); });
});

describe('K669 parseReadingFiles order', () => {
  const rec = (clause: string): CardRecord => ({ id: 'r', clause });
  const newer = 'from PR #12\n| a#1 | wrong | newer |';
  const older = 'from PR #9\n| a#1 | ok | older |';
  it('an older reading listed after a newer one does not override it', () => {
    const lines = parseReadingFiles([newer, older]);
    expect(lines[lines.length - 1]?.note).toBe('newer');
    expect(readingProblems({ records: [rec('a#1')], readings: lines, rulings: [] }).join()).toContain('judged wrong');
  });
  it('files with no PR number keep their given order', () => { expect(parseReadingFiles(['| b#1 | ok | one |', '| b#1 | wrong | two |']).map((l) => l.note)).toEqual(['one', 'two']); });
});
