import { describe, expect, it } from 'vitest';
import { expectNotFired, expectNotOffered, inventory, runInventory, Scenario, testCalls, type InventoryInput } from './index.ts';
import { DICE_GAME } from './fake/dice.ts';

// K415: test depth on the fake dice game. CL-twin scores on a pair (conditional), CL-plain always scores (not conditional).
const files = (...texts: string[]) => texts.map((text, i) => ({ path: `tests/t${String(i)}.test.ts`, text }));
const FULL = "it('CL-twin scores on a pair', () => { expect(sc.s.score).toBe(2) })";
const POOR = "it('CL-twin poor', () => { expectNotFired(sc, 'twin#1', act) })";
const PLAIN = "it('CL-plain scores', () => { expect(sc.s.score).toBe(1) })";
const input = (texts: string[], extra: Partial<InventoryInput> = {}): InventoryInput => ({
  pieces: [],
  clauses: [
    { id: 'CL-twin', cards: ['twin'], conditional: true, family: 'dice' },
    { id: 'CL-plain', cards: ['plain'], conditional: false, family: 'plain' },
  ],
  tests: files(...texts),
  ...extra,
});
const run = (inp: InventoryInput, check = false, files = new Map<string, string>()): { code: number; log: string[] } => {
  const log: string[] = [];
  const io = { read: (p: string) => files.get(p) ?? null, write: (p: string, t: string) => void files.set(p, t), log: (l: string) => void log.push(l) };
  return { code: runInventory(inp, 'x.md', check, io), log };
};

describe('K415 depth inventory', () => {
  it('all three tests: covered, exit 0, both kinds reported per clause and per family', () => {
    const r = run(input([FULL, POOR, PLAIN]));
    expect(r.log).toEqual(['inventory: 3 pieces and clauses, 0 uncited; ok']);
    expect(r.code).toBe(0);
    const inv = inventory(input([FULL, POOR, PLAIN]));
    expect(inv.rows.map((x) => x.key)).toEqual(['clause:CL-twin', 'clause:CL-plain', 'poor:CL-twin']);
    expect(inv.report).toContain('| dice | 1 | 1 | 1 | 1 | 0 |');
    expect(inv.report).toContain('| plain | 1 | 0 | 1 | 0 | 0 |');
  });
  it('a title match whose body asserts nothing does not cover the clause, and fails as not counted', () => {
    const inv = inventory(input(["it('CL-twin scores', () => { sc.run() })", POOR, PLAIN]));
    expect(inv.uncited).toEqual(['clause:CL-twin']);
    const r = run(input(["it('CL-twin scores', () => { sc.run() })", POOR, PLAIN]));
    expect(r.code).toBe(1);
    expect(r.log).toContain('inventory: clause:CL-twin has no full-resolve test (titled with its id, its body asserts)');
    expect(r.log).toContain('inventory: tests/t0.test.ts › CL-twin scores: its body asserts nothing (not counted)');
  });
  it('an assertion only in a string or a comment does not count', () => {
    expect(inventory(input(["it('CL-twin scores', () => { const t = 'expect(1)' // expect(2)\n })", POOR, PLAIN])).uncited).toEqual(['clause:CL-twin']);
  });
  it('a .skip, .todo or skipped-describe test covers nothing', () => {
    for (const t of [FULL.replace('it(', 'it.skip('), "it.todo('CL-twin scores')", `describe.skip('x', () => { ${FULL} })`, FULL.replace('it(', 'test.skipIf(true)(')])
      expect(inventory(input([t, POOR, PLAIN])).uncited).toEqual(['clause:CL-twin']);
    expect(inventory(input([POOR.replace('it(', 'it.skip('), FULL, PLAIN])).uncited).toEqual(['poor:CL-twin']);
  });
  it('the poor test does not cover the full resolve, nor the full resolve the poor test', () => {
    expect(inventory(input([POOR, PLAIN])).uncited).toEqual(['clause:CL-twin']);
    expect(inventory(input([FULL, PLAIN])).uncited).toEqual(['poor:CL-twin']);
  });
  it('--check: a conditional clause without its poor test exits 1, and exits 0 with it', () => {
    const disk = new Map<string, string>();
    run(input([FULL, PLAIN]), false, disk);
    const r = run(input([FULL, PLAIN]), true, disk);
    expect(r.code).toBe(1);
    expect(r.log).toContain("inventory: poor:CL-twin has no poor test (titled 'CL-twin poor', calling expectNotOffered or expectNotFired)");
    run(input([FULL, POOR, PLAIN]), false, disk);
    expect(run(input([FULL, POOR, PLAIN]), true, disk).code).toBe(0);
  });
  it('a poor test that calls neither helper does not count', () => {
    const t = "it('CL-twin poor', () => { expect(sc.s.score).toBe(0) })";
    const r = run(input([FULL, t, PLAIN]));
    expect(r.code).toBe(1);
    expect(r.log).toContain('inventory: tests/t1.test.ts › CL-twin poor: a poor test that calls neither expectNotOffered nor expectNotFired (not counted)');
    expect(inventory(input([FULL, t, PLAIN])).uncited).toEqual(['poor:CL-twin']);
  });
  it('a quoted clause counts only by its cardCase, whose body must assert; a cardCase poor title is a poor test', () => {
    const q = (body: string, title = '') => `cardCase({ clause: 'CL-twin', printed: 'Score 2 on a pair.', ar: 'AR-1'${title} }, () => { ${body} })`;
    const inp = (t: string[]) => input(t, { rulings: ['AR-1'], clauses: [{ id: 'CL-twin', cards: [], conditional: true, text: 'Score 2 on a pair.' }] });
    expect(inventory(inp([q('expect(1).toBe(1)'), q("expectNotOffered(sc, 'x')", ", title: 'poor'")])).uncited).toEqual([]);
    expect(inventory(inp([q('sc.run()'), q("expectNotOffered(sc, 'x')", ", title: 'poor'")])).uncited).toEqual(['clause:CL-twin']);
    expect(inventory(inp([FULL, POOR])).uncited).toEqual(['clause:CL-twin']);
  });
  it('the baseline lets one family be adopted while another is not', () => {
    const shallow = "it('CL-plain scores', () => { sc.run() })";
    const r = run(input([FULL, POOR, shallow], { baseline: ['clause:CL-plain'] }));
    expect(r.log).toEqual(['inventory: 3 pieces and clauses, 0 uncited; ok']);
    expect(r.code).toBe(0);
    const a = run(input([FULL, shallow], { baseline: ['clause:CL-plain'] }));
    expect(a.code).toBe(1);
    expect(a.log).toContain("inventory: poor:CL-twin has no poor test (titled 'CL-twin poor', calling expectNotOffered or expectNotFired)");
    const stale = run(input([FULL, POOR, PLAIN], { baseline: ['clause:CL-plain', 'poor:CL-plain'] }));
    expect(stale.code).toBe(1);
    expect(stale.log).toContain('inventory: baseline lists clause:CL-plain, which is cited or gone');
    expect(stale.log).toContain('inventory: baseline lists poor:CL-plain, which is cited or gone');
    expect(inventory(input([FULL, POOR, shallow], { baseline: ['clause:CL-plain'] })).report).toContain('| plain | 1 | 0 | 0 | 0 | 1 |');
  });
  it('a game that marks no clause conditional sees unchanged output', () => {
    const old = {
      pieces: [{ kind: 'pattern', id: 'pair' }],
      clauses: [{ id: 'CL-a', cards: ['twin'] }, { id: 'CL-b', cards: [] }, { id: 'CL-c', cards: [] }],
      tests: [{ path: 't.test.ts', text: "it('CL-a pair', () => {})\nit.skip('CL-b', () => { expect(1).toBe(1) })\nit('CL-c poor', () => {})" }],
    };
    const disk = new Map<string, string>();
    const r = run(old, false, disk);
    expect(r).toEqual({ code: 0, log: ['inventory: 4 pieces and clauses, 0 uncited; ok'] });
    expect(disk.get('x.md')).toBe(
      '# Card language: inventory and coverage\n\nGenerated; do not edit by hand. **cards**: cards that use the piece; **direct**: tests that cite it; **via cards**: test files that name a card using it.\n\n| Kind | Pieces | Used by cards | Direct | Via cards only | Uncited | Baseline |\n|---|---|---|---|---|---|---|\n| pattern | 1 | 0 | 1 | 0 | 0 | 0 |\n| clause | 3 | 1 | 3 | 0 | 0 | 0 |\n| **all** | 4 | 1 | 4 | 0 | 0 | 0 |\n\n## pattern\n\n| Piece | Cards | Examples | Direct | Via cards |\n|---|---|---|---|---|\n| `pair` | 0 |  | t.test.ts › CL-a pair |  |\n\n## clause\n\n| Piece | Cards | Examples | Direct | Via cards |\n|---|---|---|---|---|\n| `CL-a` | 1 | twin | t.test.ts › CL-a pair |  |\n| `CL-b` | 0 |  | t.test.ts › CL-b |  |\n| `CL-c` | 0 |  | t.test.ts › CL-c poor |  |\n',
    );
    expect(inventory(old).depth).toBe(false);
  });
  it('testCalls reads titles, bodies and skips, ignoring parentheses in strings and comments', () => {
    const c = testCalls("it('a (b', () => { f(')') /* ) */ })\nit.todo('t')\ncardCase({ clause: 'CL-x', printed: 'p', ar: 'A', title: 'poor' }, () => {})");
    expect(c.map((x) => [x.title, x.skipped])).toEqual([['a (b', false], ['t', true], ['CL-x poor', false]]);
    expect(c[0]?.body).toBe("'a (b', () => { f(')') /* ) */ }");
  });
});

describe('K415 expectNotOffered and expectNotFired', () => {
  const discardPrompt = () => {
    const sc = new Scenario(DICE_GAME).set((s) => void (s.dice = [1, 2, 3]));
    const [ladder, a] = sc.put('hand', 'ladder', 'plain', 'twin');
    sc.run({ kind: 'play', card: ladder as string });
    return { sc, a: a as string, ladder: ladder as string };
  };
  it('expectNotOffered passes in a poor setup and runs the refused attempt in a rewind', () => {
    const { sc, ladder } = discardPrompt();
    const score = sc.s.score;
    expect(() => expectNotOffered(sc, ladder)).not.toThrow();
    expect(sc.s.score).toBe(score);
    expect(sc.prompt).not.toBeNull();
    const forced = new Scenario(DICE_GAME);
    const [l, p] = forced.put('hand', 'ladder', 'plain');
    forced.run({ kind: 'play', card: l as string });
    expect(() => expectNotOffered(forced, p as string)).not.toThrow();
  });
  it('expectNotOffered fails when the option is offered', () => {
    const { sc, a } = discardPrompt();
    expect(() => expectNotOffered(sc, a)).toThrow(`expectNotOffered: ${a} is offered in the open prompt`);
  });
  it('expectNotOffered fails when the option was offered, taken and did nothing', () => {
    const { sc, a } = discardPrompt();
    sc.answer(a);
    expect(sc.prompt).toBeNull();
    expect(() => expectNotOffered(sc, a)).toThrow(`expectNotOffered: ${a} is offered at step 1`);
  });
  it('expectNotOffered fails when taking it is not refused, or when the state moves', () => {
    const { sc, ladder } = discardPrompt();
    expect(() => expectNotOffered(sc, ladder, () => true)).toThrow(`expectNotOffered: taking ${ladder} was not refused`);
    expect(() => expectNotOffered(sc, ladder, () => { sc.set((s) => void (s.score = 9)); return false; })).toThrow('expectNotOffered: the state or the events changed');
  });
  it('expectNotFired passes when the condition is false, and fails when the event fires', () => {
    const sc = new Scenario(DICE_GAME).set((s) => void (s.dice = [1, 2, 5]));
    const [twin] = sc.put('hand', 'twin');
    expect(() => expectNotFired(sc, twin as string, () => sc.run({ kind: 'play', card: twin as string }), (s: { score: number }) => s.score)).not.toThrow();
    const hit = new Scenario(DICE_GAME).set((s) => void (s.dice = [2, 2, 5]));
    const [t2] = hit.put('hand', 'twin');
    expect(() => expectNotFired(hit, t2 as string, () => hit.run({ kind: 'play', card: t2 as string }), (s: { score: number }) => s.score)).toThrow(/expectNotFired: .*"scored".* fired/);
  });
  it('expectNotFired fails when a prompt is open or the state changed', () => {
    const { sc } = discardPrompt();
    expect(() => expectNotFired(sc, 'nothing')).toThrow(/expectNotFired: a prompt is open/);
    const s2 = new Scenario(DICE_GAME);
    expect(() => expectNotFired(s2, 'nothing', () => s2.set((s) => void (s.score = 3)))).toThrow('expectNotFired: the state changed');
  });
});
