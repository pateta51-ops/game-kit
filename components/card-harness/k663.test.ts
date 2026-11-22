import { describe, expect, it } from 'vitest';
import { cardCasesIn, inventory, type InventoryInput } from './index.ts';

const TEXT = 'Score 2 when the dice show a pair.';
const files = (...texts: string[]) => texts.map((text, i) => ({ path: `tests/t${String(i)}.test.ts`, text }));
const base = (texts: string[], extra: Partial<InventoryInput> = {}): InventoryInput => ({
  pieces: [],
  clauses: [{ id: 'CL-twin', cards: ['twin'], text: TEXT }, { id: 'CL-plain', cards: ['plain'], text: 'Draw 1.' }],
  rulings: ['AR-1'],
  tests: files(...texts),
  ...extra,
});
const call = (printed: string) => `cardCase({ clause: 'CL-twin', printed: ${printed}, ar: 'AR-1' }, f)`;
const one = { clauses: [{ id: 'CL-twin', cards: [], text: TEXT }] };

describe('K663 cardCasesIn resolves a same-file const', () => {
  it('K663 a const string literal and a plain template resolve', () => {
    expect(cardCasesIn(`const P = '${TEXT}'\n${call('P')}`)[0]?.printed).toBe(TEXT);
    expect(cardCasesIn(`export const P: string = \`${TEXT}\`;\n${call('P')}`)[0]?.printed).toBe(TEXT);
  });
  it('K663 a const quote passes the inventory; a wrong one is quote differs', () => {
    expect(inventory(base([`const P = '${TEXT}'\n${call('P')}`], one)).quoteDiffers).toEqual([]);
    expect(inventory(base([`const P = 'Score 3.'\n${call('P')}`], one)).quoteDiffers).toEqual(['CL-twin: quote differs (tests/t0.test.ts)']);
  });
  it('K663 an import, a computed value or a template with an expression gets its own problem line', () => {
    const line = (n: string) => `CL-twin: printed is not a literal or a same-file const: ${n}`;
    expect(inventory(base([`import { P } from './p.ts'\n${call('P')}`], one)).quoteDiffers).toEqual([line('P')]);
    expect(inventory(base([`const P = 'a' + 'b'\n${call('P')}`], one)).quoteDiffers).toEqual([line('P')]);
    expect(inventory(base([`const P = \`a \${x}\`\n${call('P')}`], one)).quoteDiffers).toEqual([line('P')]);
    expect(inventory(base([call('texts.twin')], one)).quoteDiffers).toEqual([line('texts.twin')]);
  });
});

describe('K663 rule 11 mixed mode', () => {
  const good = call(`'${TEXT}'`);
  const t = (texts: string[], mixed?: boolean) => inventory(base(texts, { mixed }));
  it('K663 a clause with a cardCase is quote-checked: a wrong quote fails', () => {
    const r = t([good.replace('pair.', 'pair'), "it('CL-twin scores', () => {})", "it('CL-plain draws', () => {})"], true);
    expect(r.quoteDiffers).toEqual(['CL-twin: quote differs (tests/t0.test.ts)']);
    expect(r.uncited).toEqual(['clause:CL-twin']);
  });
  it('K663 a clause without a cardCase is cited by an it() title', () => {
    const r = t([good, "it('CL-plain draws', () => {})"], true);
    expect(r.uncited).toEqual([]);
    expect(r.rows.find((x) => x.id === 'CL-plain')?.direct).toEqual(['tests/t1.test.ts › CL-plain draws']);
  });
  it('K663 mixed mode: a clause with no cardCase and no title is uncited; a mention outside a title does not count', () => {
    expect(t([good, "// CL-plain\nit('draws', () => {})"], true).uncited).toEqual(['clause:CL-plain']);
  });
  it('K663 default mode is unchanged: a text clause is cited only by a cardCase', () => {
    expect(t([good, "it('CL-plain draws', () => {})"]).uncited).toEqual(['clause:CL-plain']);
    expect(t([good, "it('CL-plain draws', () => {})"], false).uncited).toEqual(['clause:CL-plain']);
  });
});
