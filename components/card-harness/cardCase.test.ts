import { describe, expect, it } from 'vitest';
import { cardCase, cardCaseLog, cardCasesIn } from './cardCase.ts';
import { interactionNeeds, inventory, runInventory, type InventoryInput } from './inventory.ts';
import { Scenario } from './index.ts';
import { DICE_GAME } from './fake/dice.ts';

// K487: the fake game's clauses, rulings and test files.
const TEXT = 'Score 2 when the dice show a pair.';
const ok = `cardCase({ clause: 'CL-twin', printed: 'Score 2 when the dice show a pair.', ar: 'AR-1' }, () => {})`;
const files = (...texts: string[]) => texts.map((text, i) => ({ path: `tests/t${String(i)}.test.ts`, text }));
const base = (texts: string[], extra: Partial<InventoryInput> = {}): InventoryInput => ({
  pieces: [],
  clauses: [{ id: 'CL-twin', cards: ['twin'], text: TEXT }],
  rulings: ['AR-1'],
  tests: files(...texts),
  ...extra,
});
const run = (input: InventoryInput): { code: number; log: string[] } => {
  const log: string[] = [];
  const code = runInventory(input, 'x.md', false, { read: () => null, write: () => undefined, log: (l) => void log.push(l) });
  return { code, log };
};

describe('K487 cardCase and quote counting', () => {
  cardCase({ clause: 'CL-twin', printed: TEXT, ar: 'AR-1' }, (c) => {
    const sc = new Scenario(DICE_GAME).set((s) => void (s.dice = [2, 2, 5]));
    const [twin] = sc.put('hand', 'twin');
    sc.run({ kind: 'play', card: twin as string });
    expect(sc.s.score).toBe(2);
    expect(c.ar).toBe('AR-1');
  });
  it('cardCase registers a test titled with the clause id and records the case', () => {
    expect(cardCaseLog).toContainEqual({ clause: 'CL-twin', printed: TEXT, ar: 'AR-1' });
  });
  it('reads cardCase calls from test text, escapes and titles included', () => {
    expect(cardCasesIn(`cardCase({ clause: "CL-a", printed: 'It\\'s "here"', ar: \`AR-2\`, title: 'poor' }, () => {})`)).toEqual([
      { clause: 'CL-a', printed: `It's "here"`, ar: 'AR-2', title: 'poor' },
    ]);
    expect(cardCasesIn('cardCase({ clause: P.id, printed, ar: "AR-1" }, f)')).toEqual([{ ar: 'AR-1' }]);
    expect(cardCasesIn("cardCase({ printed: 'It\\u2019s a \\\nlong \\u{1F600}\\x41\\n' }, f)")).toEqual([{ printed: 'It’s a long \u{1F600}A\n' }]);
    expect(cardCasesIn("cardCase({ printed: 'a \\\r\nb' }, f)")).toEqual([{ printed: 'a b' }]);
  });
  it('passes: printed equals the clause text and ar is a known ruling', () => {
    const inv = inventory(base([ok]));
    expect(inv.uncited).toEqual([]);
    expect(inv.quoteDiffers).toEqual([]);
    expect(inv.rows[0]?.direct).toEqual(['tests/t0.test.ts › CL-twin']);
    expect(run(base([ok])).code).toBe(0);
  });
  it('fails `<clause>: quote differs` when printed differs, and does not count the test', () => {
    const r = run(base([ok.replace('a pair.', 'a pair')]));
    expect(r.code).toBe(1);
    expect(r.log).toContain('inventory: CL-twin: quote differs (tests/t0.test.ts)');
    expect(r.log).toContain('inventory: clause:CL-twin is cited by no test');
  });
  it('fails `<clause>: quote differs` when ar is not a known ruling, or not a literal', () => {
    expect(run(base([ok.replace('AR-1', 'AR-9')])).log).toContain('inventory: CL-twin: quote differs (tests/t0.test.ts: AR-9 is not a known ruling)');
    expect(run(base([ok], { rulings: [] })).code).toBe(1);
    expect(run(base(["cardCase({ clause: 'CL-twin', printed: P, ar: 'AR-1' }, f)"])).log).toContain('inventory: CL-twin: printed is not a literal or a same-file const: P');
  });
  it('a clause with text is not cited by its id or a card name outside cardCase', () => {
    expect(inventory(base(["it('CL-twin twin scores', () => {})"])).uncited).toEqual(['clause:CL-twin']);
  });
  it('a clause without text keeps the old counting', () => {
    expect(inventory({ pieces: [], clauses: [{ id: 'CL-twin', cards: [] }], tests: files("it('CL-twin', () => {})") }).uncited).toEqual([]);
  });
});

describe('K487 interaction pieces and rows', () => {
  const ix = { kind: 'interaction', id: 'IX-01', cards: ['twin', 'ladder'], records: ['r-discount'] };
  it('fails `interaction IX-nn has no test` unless a test title names it', () => {
    const none = run({ pieces: [ix], tests: files("// IX-01 in a comment\nit('twin and ladder', () => {})") });
    expect(none.code).toBe(1);
    expect(none.log).toContain('inventory: interaction IX-01 has no test');
    expect(run({ pieces: [ix], tests: files("it('IX-01 discount then halving', () => {})") }).code).toBe(0);
    expect(run({ pieces: [ix], tests: files("cardCase({ clause: 'CL-twin', printed: 'x', ar: 'AR-1', title: 'IX-01 with ladder' }, f)") }).code).toBe(0);
    expect(run({ pieces: [ix], tests: [], baseline: ['interaction:IX-01'] }).code).toBe(0);
  });
  it('fails `<record> is in no interaction row` for a listed record or card no row holds', () => {
    const tests = files("it('IX-01', () => {})");
    const r = run({ pieces: [ix], tests, interacting: ['r-discount', 'twin', 'r-lasting', 'plain'] });
    expect(r.code).toBe(1);
    expect(r.log.filter((l) => l.includes('no interaction row'))).toEqual(['inventory: r-lasting is in no interaction row', 'inventory: plain is in no interaction row']);
    expect(run({ pieces: [ix], tests, interacting: ['r-discount', 'ladder'] }).code).toBe(0);
  });
  it('interactionNeeds lists modifiers, lasting records and cards with several limited abilities', () => {
    const records = [
      { id: 'r1', card: 'a', kind: 'modifier' },
      { id: 'r2', card: 'b', kind: 'gain', until: 'round' },
      { id: 'r3', card: 'c', kind: 'gain', limit: 'round' },
      { id: 'r4', card: 'c', kind: 'draw', limit: 'round' },
      { id: 'r5', card: 'd', kind: 'gain', limit: 'round' },
      { id: 'r6', card: 'e', kind: 'gain' },
    ];
    expect(interactionNeeds(records, { modifier: (r) => r.kind === 'modifier', lasting: (r) => r.until !== undefined, limited: (r) => r.limit !== undefined })).toEqual(['r1', 'r2', 'c']);
  });
});
