import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { restrictionCounts, restrictionProblems, type Phrase } from './index.ts';

const C = (id: string, text: string) => ({ id, card: id, text });
const run = (text: string, rec: Record<string, unknown>, words: Record<string, readonly Phrase[]>, notPhrases?: Record<string, readonly Phrase[]>) =>
  restrictionProblems({ catalogue: { summary: { clauses: 1 }, patterns: [], oneOffs: [C('c', text)], interactions: [] }, records: [{ id: 'c r0', clause: 'c', ...rec }], keys: ['moment', 'optional'], words, rulings: ['AR-1'], ...(notPhrases ? { notPhrases } : {}) });
const imm = { 'moment:now': [{ phrase: 'Immediately', case: true, start: true }] };
const miss = 'c: printed "Immediately" has no restriction moment=now';

describe('K677 case-sensitive and start-anchored phrases', () => {
  it('K677 an anchored case-sensitive phrase does not match lower case', () => {
    expect(run('immediately advance the tracker', {}, imm)).toEqual([]);
    expect(run('immediately advance the tracker', { moment: 'now' }, imm)).toEqual(['c r0: moment=now has no printed source and no AR']);
  });
  it('K677 an anchored case-sensitive phrase matches at the start', () => {
    expect(run('Immediately advance the tracker', {}, imm)).toEqual([miss]);
    expect(run('Immediately advance the tracker', { moment: 'now' }, imm)).toEqual([]);
  });
  it('K677 an anchored phrase does not match later in the text', () => {
    expect(run('Then Immediately advance', {}, imm)).toEqual([]);
  });
  it('K677 a case-sensitive When does not match when', () => {
    const w = { 'moment:now': [{ phrase: 'When', case: true }] };
    expect(run('Score 1 when you flim.', {}, w)).toEqual([]);
    expect(run('Score 1. When you flim, zorb.', {}, w)).toEqual(['c: printed "When" has no restriction moment=now']);
  });
  it('K677 plain strings still match any case anywhere', () => {
    expect(run('Then immediately advance', {}, { 'moment:now': ['Immediately'] })).toEqual([miss]);
  });
  it('K677 restrictionCounts reads phrase objects', () => {
    expect(restrictionCounts([C('a', 'Immediately zorb.'), C('b', 'immediately zorb.')], imm).map((r) => r.count)).toEqual([1, 0]);
  });
});

describe('K677 per-key notPhrases', () => {
  const words = { 'optional:true': ['you may'], 'moment:now': ['zorb'] };
  const notPhrases = { 'optional:true': ['you may not'] };
  it('K677 a notPhrase suppresses only its own key', () => {
    expect(run('You may not flim. Zorb.', {}, words)).toEqual(['c: printed "you may" has no restriction optional=true', 'c: printed "zorb" has no restriction moment=now']);
    expect(run('You may not flim. Zorb.', {}, words, notPhrases)).toEqual(['c: printed "zorb" has no restriction moment=now']);
  });
  it('K677 a notPhrase also stops the key being its printed source', () => {
    expect(run('You may not flim. Zorb.', { optional: true, moment: 'now' }, words, notPhrases)).toEqual(['c r0: optional=true has no printed source and no AR']);
  });
  it('K677 without the notPhrase in the text the key matches as before', () => {
    expect(run('You may flim.', {}, words, notPhrases)).toEqual(['c: printed "you may" has no restriction optional=true']);
  });
});

describe('K677 README recipe', () => {
  const recipe = `const words = { 'moment:now': [{ phrase: 'Zorb', case: true, start: true }], 'optional:true': ['you may'] }
const notPhrases = { 'optional:true': ['you may not'] }
restrictionProblems({ ...input, words, notPhrases }) // "Zorb the flim." asks for moment=now; "zorb the flim." and "Then Zorb." do not; "You may not flim." asks for no optional`;
  it('K677 the README holds the recipe word for word, and it runs as it says', () => {
    expect(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'README.md'), 'utf8')).toContain(recipe);
    const words = { 'moment:now': [{ phrase: 'Zorb', case: true, start: true }], 'optional:true': ['you may'] };
    const notPhrases = { 'optional:true': ['you may not'] };
    const p = (t: string) => run(t, {}, words, notPhrases);
    expect(p('Zorb the flim.')).toEqual(['c: printed "Zorb" has no restriction moment=now']);
    expect([p('zorb the flim.'), p('Then Zorb.'), p('You may not flim.')]).toEqual([[], [], []]);
  });
});
