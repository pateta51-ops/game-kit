import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { printedFindings, runPrintedCheck } from './printed.ts';

const RULES = 'Each player has a Roster: the cards in the Line-\nup and on the Bench.\n\nSpend {die:6} to steal a base; "Outs" end the half-inning.';
const E = [
  { id: 'roster', term: 'Roster', summary: 'the cards in the Lineup and on the Bench' },
  { id: 'steal', term: 'Steal', summary: 'Spend {die:6} to steal a base', body: 'Outs end the half inning.\n\nEach player has a Roster' },
];

describe('printed words', () => {
  it('passes when every summary and body paragraph is in the sources, icons and punctuation aside', () => {
    expect(printedFindings({ entries: E, sources: [RULES] })).toEqual([]);
    expect(printedFindings({ entries: [{ id: 'a', term: 'a', summary: 'steal [[die]] a base!' }], sources: ['to steal {x} a base'], icon: /\[\[[a-z]+\]\]|\{[a-z]+\}/ })).toEqual([]);
  });

  it('fails on a paraphrase, per paragraph', () => {
    expect(printedFindings({ entries: [...E, { id: 'x', term: 'x', summary: 'Rosters hold cards', body: 'Spend to steal a base\n\nOuts finish the inning' }], sources: [RULES] })).toEqual([
      'PRINTED x summary is not printed in the source documents: Rosters hold cards',
      'PRINTED x body is not printed in the source documents: Outs finish the inning',
    ]);
  });

  it('strips markup, takes other letters, skips an exempt entry', () => {
    const e = [{ id: 'a', term: 'a', summary: 'the Bench is full', source: 'arbiter' }];
    expect(printedFindings({ entries: e, sources: ['the [b]Bench[/b] is full'] })).toHaveLength(1);
    expect(printedFindings({ entries: e, sources: ['the [b]Bench[/b] is full'], strip: [/\[\/?[bi]\]/] })).toEqual([]);
    expect(printedFindings({ entries: e, sources: ['nothing'], exempt: (x) => (x as { source?: string }).source === 'arbiter' })).toEqual([]);
    const fr = [{ id: 'b', term: 'b', summary: 'été' }];
    expect(printedFindings({ entries: fr, sources: ['t'] })).toEqual([]);
    expect(printedFindings({ entries: fr, sources: ['t'], letters: 'a-zà-ÿ0-9' })).toHaveLength(1);
  });

  it('runs as a CLI over files and folders', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kit-printed-'));
    mkdirSync(join(dir, 'cards'));
    writeFileSync(join(dir, 'rules.md'), RULES);
    writeFileSync(join(dir, 'cards', 'a.md'), 'A [i]mighty[/i] swing.');
    const write = (entries: unknown): string => {
      writeFileSync(join(dir, 'glossary.json'), JSON.stringify(entries));
      return join(dir, 'glossary.json');
    };
    const out: string[] = [];
    const err: string[] = [];
    const io = [(l: string) => out.push(l), (l: string) => err.push(l)] as const;
    const src = ['--source', join(dir, 'rules.md'), '--source', join(dir, 'cards')];
    expect(runPrintedCheck(['--entries', write([...E, { id: 'swing', term: 'Swing', summary: 'A mighty swing' }]), ...src, '--strip', '\\[/?[bi]\\]'], ...io)).toBe(0);
    expect(out).toEqual(['glossary:printed: 3 entries are printed in 2 source document(s)']);
    const bad = write([...E, { id: 'pips', term: 'Pips', summary: 'The dots on a die', source: 'arbiter' }]);
    expect(runPrintedCheck(['--entries', bad, ...src], ...io)).toBe(1);
    expect(err).toEqual(['PRINTED pips summary is not printed in the source documents: The dots on a die', 'glossary:printed: 1 finding(s)']);
    expect(runPrintedCheck(['--entries', bad, ...src, '--exempt', 'source=arbiter'], ...io)).toBe(0);
    expect(runPrintedCheck(['--entries', bad], ...io)).toBe(2);
    expect(runPrintedCheck(['--nope', 'x'], ...io)).toBe(2);
  });
});
