// Traceability gate: plan ids, test titles, code comments, coverage, command line. Fixtures use made-up ids of the configured families.
import { describe, expect, it } from 'vitest';
import {
  computeCoverage,
  extractComments,
  extractRuleIds,
  extractTitles,
  groupByPrefix,
  run,
  DEFAULT_CONFIG,
  type Config,
  type Io,
  type SourceFile,
  extractScenarioIds,
  scenarioCoverage,
} from './check-traceability';

const CFG: Config = { ...DEFAULT_CONFIG, families: ['RL', 'IR', 'R'] };
const PLAN = `# Plan
## 2. Before
- **R-009** not in section 3
## 3. Rules
- **R-010** setup. **RL-005**, **IR-02**, **RL-014**, **R-116**.
- **SC-001** and **INV-05** and **C-05** are not rules. **OQ-03** is a question. R-010 again.
| ID | Situation |
|---|---|
| IR-07 | an interpretation |
\`\`\`ts
const x = 'R-050'; // inside a fence: ignored
\`\`\`
## 4. After
- **R-011** not in section 3
`;

const ALL = ['R-010', 'RL-005', 'IR-02', 'RL-014', 'R-116', 'IR-07'];

describe('extractRuleIds (§10.3)', () => {
  it('finds the ids of section 3, outside fences, in order, without duplicates; other id families are not rules', () => {
    expect(extractRuleIds(PLAN, CFG)).toEqual(ALL);
    expect(() => extractRuleIds('# no section three', CFG)).toThrow(/section "## 3."/);
  });

});

describe('extractTitles', () => {
  it('reads it, test and describe titles, with modifiers, each/runIf tables and template literals; not comments', () => {
    const src = [
      "describe('R-010 group', () => {",
      '  it.only("SC-025 RL-014 \\"quoted\\"", () => {});',
      '  it.each([[1]])(`INF-01 row ${0}`, () => {});',
      "  test.runIf(true)('CAP-01 conditional', () => {});",
      "  // it('ACT-03 commented out')",
      '  it.each([[1]]) ;',
      "  it(unbalanced('x'",
      '});',
    ].join('\n');
    expect(extractTitles(src, CFG)).toEqual([
      'SC-025 RL-014 "quoted"',
      'INF-01 row ${0}',
      'CAP-01 conditional',
    ]);
  });
});

describe('extractTitles, the stricter rules', () => {
  it('counts it and test only: not describe, skip, todo, fails or x-prefixed; skipIf counts; more than six ids count for none', () => {
    const src = [
      "describe('R-010 group', () => {",
      "  it.skip('R-011 skipped', () => {});",
      "  it.todo('R-012 todo');",
      "  xit('R-013 off', () => {});",
      "  it.fails('R-014 expected failure', () => {});",
      "  it.skipIf(false)('R-015 conditional', () => {});",
      "  it('R-016 R-017 R-018 R-019 R-020 R-021 R-022 too many', () => {});",
      "  it('R-023 fine', () => {});",
      '});',
    ].join('\n');
    expect(extractTitles(src, CFG)).toEqual(['R-015 conditional', 'R-023 fine']);
  });
});

describe('extractComments', () => {
  it('reads line and block comments and skips strings', () => {
    const src = [
      '// R-010: the first line',
      "const url = 'https://example.com/RL-014';",
      'const x = 1; /* INF-02 inline */ const y = "// not a comment";',
      '/**',
      ' * CAP-03 in a doc comment',
      ' */',
    ].join('\n');
    const comments = extractComments(src).join('\n');
    expect(comments).toContain('R-010');
    expect(comments).toContain('INF-02');
    expect(comments).toContain('CAP-03');
    expect(comments).not.toContain('RL-014');
    expect(comments).not.toContain('not a comment');
  });
});

const test = (path: string, text: string): SourceFile => ({ path, text });

describe('computeCoverage', () => {
  it('needs an id both in a test title and in a code comment; a sub-letter counts, a longer number does not', () => {
    const tests = [
      test('tests/a.test.ts', "it('SC-001 R-010a RL-005 setup', () => {});"),
      test('tests/b.test.ts', "it('RL-0140 is not RL-014', () => {});"),
    ];
    const sources = [test('src/engine/x.ts', '// R-010 and IR-07\nconst a = 1;')];
    const c = computeCoverage(PLAN, tests, sources, CFG);
    expect(c.covered).toEqual(['R-010']);
    expect(c.titled.get('RL-005')).toEqual(['tests/a.test.ts']);
    expect(c.untitled).not.toContain('RL-005');
    expect(c.uncited).toContain('RL-005');
    expect(c.untitled).toContain('IR-07');
    expect(c.cited.get('IR-07')).toEqual(['src/engine/x.ts']);
    expect(c.titled.has('RL-014')).toBe(true); // "is not RL-014" names it
  });

  it('reports ids named in a test title that section 3 does not define', () => {
    const c = computeCoverage(
      PLAN,
      [test('tests/a.test.ts', "it('R-010 and R-077 and TUT-01', () => {});")],
      [],
      CFG,
    );
    expect(c.unknown).toEqual(['R-077']);
  });

  it('groups ids by family for the report', () => {
    expect(groupByPrefix(['R-020', 'R-010', 'RL-001'])).toEqual([
      '  R         010 020',
      '  RL        001',
    ]);
  });
});

function io(pending: Record<string, string>, tests: SourceFile[], sources: SourceFile[] = []) {
  const out: string[] = [];
  const err: string[] = [];
  const fake: Io = {
    readText: (path) => (path.endsWith('.json') ? JSON.stringify({ pending }) : PLAN),
    testFiles: () => tests,
    sourceFiles: () => sources,
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  };
  return { fake, out, err };
}

describe('run (the command line)', () => {
  const allPending = Object.fromEntries(ALL.map((id) => [id, 'B3']));

  it('is in warning mode by default: findings are printed, the exit code is 0 (until batch B8)', () => {
    const r = io({}, []);
    expect(run([], r.fake, CFG)).toBe(0);
    expect(r.out.join('\n')).toMatch(/warning mode/);
    expect(r.out.join('\n')).toMatch(/not named in any test title/);
  });

  it('passes in strict mode when every id is pending, and fails the release gate', () => {
    expect(run(['--strict'], io(allPending, []).fake, CFG)).toBe(0);
    const r = io(allPending, []);
    expect(run(['--release'], r.fake, CFG)).toBe(1);
    expect(r.err.join('\n')).toMatch(/still pending/);
  });

  it('fails in strict mode on an id neither pending nor covered', () => {
    const pending = { ...allPending };
    delete pending['R-010'];
    const r = io(pending, []);
    expect(run(['--strict'], r.fake, CFG)).toBe(1);
    expect(r.out.join('\n')).toMatch(/not named in any test title[\s\S]*R {9}010/);
    expect(run(['--strict', '--warn'], io(pending, []).fake, CFG)).toBe(0);
  });

  it('fails when an id is titled but not cited in a comment', () => {
    const pending = { ...allPending };
    delete pending['R-010'];
    const r = io(pending, [test('tests/a.test.ts', "it('R-010 x', () => {});")]);
    expect(run(['--strict'], r.fake, CFG)).toBe(1);
    expect(r.out.join('\n')).toMatch(/not cited in any code comment/);
    const ok = io(
      pending,
      [test('tests/a.test.ts', "it('R-010 x', () => {});")],
      [test('src/a.ts', '// R-010')],
    );
    expect(run(['--strict'], ok.fake, CFG)).toBe(0);
  });

  it('fails in strict mode on an id in a title that the plan does not define, and on a stale pending id', () => {
    const r = io(allPending, [test('tests/a.test.ts', "it('R-077 x', () => {});")]);
    expect(run(['--strict'], r.fake, CFG)).toBe(1);
    expect(r.out.join('\n')).toMatch(/not defined in the rules section: R-077/);
    const stale = io({ ...allPending, 'R-099': 'B3' }, []);
    expect(run(['--strict'], stale.fake, CFG)).toBe(1);
    expect(stale.err.join('\n')).toMatch(/R-099/);
  });

  it('refuses unknown arguments', () => {
    expect(run(['--nope'], io(allPending, []).fake, CFG)).toBe(2);
  });
});

describe('the scenario check (§10.3)', () => {
  it('counts each catalogue id in test titles, and reports repeats, unknown ids and ids not yet built', () => {
    const plan = '| SC-001 | R-010 | a | b | c |\n| SC-002 | R-013 | a | b | c |\n| SC-003 | R-120 | a | b | c |\n';
    const tests = [
      { path: 'tests/a.test.ts', text: "it('SC-001 R-010: one', () => {}); it('SC-002 R-013: two', () => {});" },
      { path: 'tests/b.test.ts', text: "it('SC-002 again', () => {}); it('SC-009 typo', () => {});" },
    ];
    const sc = scenarioCoverage(plan, tests, CFG);
    expect(extractScenarioIds(plan, CFG)).toEqual(['SC-001', 'SC-002', 'SC-003']);
    expect(sc.missing).toEqual(['SC-003']);
    expect(sc.repeated).toEqual(['SC-002']);
    expect(sc.unknown).toEqual(['SC-009']);
  });
});
