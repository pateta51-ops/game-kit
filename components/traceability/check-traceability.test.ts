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
  phaseFamilies,
  makeIo,
} from './check-traceability';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

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

describe('K67 options', () => {
  const src = [
    "describe('R-010 group', () => {",
    "  it.skip('R-011 skipped', () => {});",
    "  it('TODAY R-012 known gap', () => {});",
    "  it('R-016 R-017 R-018 R-019 R-020 R-021 R-022 many', () => {});",
    '});',
  ].join('\n');

  it('countDescribe, countSkipped, hollowTitlePrefixes and maxIdsPerTitle 0 (no cap)', () => {
    expect(extractTitles(src, CFG)).toEqual(['TODAY R-012 known gap']);
    expect(extractTitles(src, { ...CFG, countDescribe: true })).toContain('R-010 group');
    expect(extractTitles(src, { ...CFG, countSkipped: true })).toContain('R-011 skipped');
    expect(extractTitles(src, { ...CFG, hollowTitlePrefixes: ['TODAY'] })).toEqual([]);
    expect(extractTitles(src, { ...CFG, maxIdsPerTitle: 0 })).toHaveLength(2);
  });

  it('requireComment false: a test title alone covers an id', () => {
    const c = computeCoverage('## 3. Rules\nR-010\n', [test('tests/a.test.ts', "it('R-010 x', () => {});")], [], { ...CFG, requireComment: false });
    expect(c.covered).toEqual(['R-010']);
    expect(c.uncited).toEqual([]);
  });

  it('reportUnknown false: an undefined id in a title is not a finding', () => {
    const tests = [test('tests/a.test.ts', "it('R-077 x', () => {});")];
    expect(computeCoverage('## 3. Rules\nR-010\n', tests, [], CFG).unknown).toEqual(['R-077']);
    expect(computeCoverage('## 3. Rules\nR-010\n', tests, [], { ...CFG, reportUnknown: false }).unknown).toEqual([]);
  });

  it('idTail, idsAtLineStart and deferredPrefixes: word suffixes, one digit, a sub-letter, defining positions only', () => {
    const cfg: Config = { ...CFG, families: ['[A-Z][A-Z0-9]*'], idTail: '[A-Z0-9]+(?:-[A-Z0-9]+)*', idsAtLineStart: true, deferredPrefixes: ['P2-'] };
    const plan = '## 3. Rules\n- **KW-FAST** acts first, see DMG-03.\n* **LVL-01a** sub.\n- **SET-7** one digit.\n- **KW-R-01** two parts.\n- **P2-04** later.\n| IR-2 | a ruling |\n| see | KW-SLOW |\n';
    expect(extractRuleIds(plan, cfg)).toEqual(['KW-FAST', 'LVL-01', 'SET-7', 'KW-R-01', 'IR-2']);
    const c = computeCoverage(plan, [test('tests/a.test.ts', "it('KW-FAST and LVL-01a and SET-70', () => {});")], [], { ...cfg, requireComment: false, reportUnknown: false });
    expect(c.covered).toEqual(['KW-FAST', 'LVL-01']);
    expect(extractRuleIds('## 3. Rules\nR-1 and R-22\n', { ...CFG, idTail: '\\d{1,2}' })).toEqual(['R-1', 'R-22']);
  });

  it('extraRuleHeadings: ids of another heading are rules too', () => {
    const plan = '## 3. Rules\nR-010\n## 4. Arch\n#### 4.4.8 Invariants\n| IR-05 | x |\n#### 4.4.9 Next\nIR-06\n';
    expect(extractRuleIds(plan, { ...CFG, extraRuleHeadings: ['#### 4.4.8'] })).toEqual(['R-010', 'IR-05']);
  });

  const scPlan = '## 3. Rules\nR-010\n## 10. Tests\n| SC-01 | a |\n| SC-02 | b |\n| SC-03 | c | pending: 9 |\n#### Group\npending: 9.\n| SC-04 | d |\n';
  const scIo = (text: string, progress = '') => {
    const r = io({}, [test('tests/a.test.ts', text)]);
    r.fake.readText = (path) => (path.endsWith('.json') ? '{"pending":{"R-010":"B1"}}' : path.endsWith('PROGRESS.md') ? progress : scPlan);
    return r;
  };

  it('scenarioDigits: two-digit scenario ids; scenarioPrefix empty: no scenario check', () => {
    const cfg: Config = { ...CFG, scenarioDigits: '2' };
    expect(extractScenarioIds(scPlan, cfg)).toEqual(['SC-01', 'SC-02', 'SC-03', 'SC-04']);
    const twice = "it('SC-01 a', () => {}); it('SC-01 b', () => {}); it('SC-09 c', () => {});";
    expect(run(['--strict'], scIo(twice).fake, cfg)).toBe(1);
    const off = scIo(twice);
    expect(run(['--strict'], off.fake, { ...cfg, scenarioPrefix: '' })).toBe(0);
    expect(off.out.join('\n')).not.toMatch(/scenarios:/);
  });

  it('scenarios required: every row needs a title unless pending on a phase not yet merged; repeats are fine', () => {
    const cfg: Config = { ...CFG, scenarioDigits: '2', scenarios: 'required' };
    const both = "it('SC-01 a', () => {}); it('SC-01 b', () => {}); it('SC-02 c', () => {});";
    expect(run(['--strict'], scIo(both).fake, cfg)).toBe(0);
    const one = scIo("it('SC-01 a', () => {});");
    expect(run(['--strict'], one.fake, cfg)).toBe(1);
    expect(one.err.join('\n')).toMatch(/not pending: SC-02$/);
    const late = scIo(both, '- Phase 9 merged\n');
    expect(run(['--strict'], late.fake, cfg)).toBe(1);
    expect(late.err.join('\n')).toMatch(/not pending: SC-03 SC-04/);
  });

  it('phase mode: a family is due once its phase is in the progress file; inline pending waits; strictFromPhase', () => {
    const plan = [
      '## 3. Rules',
      '- **R-010** a.',
      '- **R-011** b. pending: 5',
      '- **RL-005** c.',
      '## 11. Phases',
      '### 11.3 Phase table',
      '| Phase | Name | Families | Gate |',
      '|---|---|---|---|',
      '| 2 | core | R | x |',
      '| 5 | later | (all RL-*) | x |',
      '### 11.4 Next',
    ].join('\n');
    const cfg: Config = { ...CFG, scenarioPrefix: '', requireComment: false, idsAtLineStart: true, phaseTable: '### 11.3', strictFromPhase: '2' };
    const go = (progress: string, titles: string, c: Config = cfg) => {
      const r = io({}, [test('tests/a.test.ts', titles)]);
      r.fake.readText = (path) => (path.endsWith('.json') ? '{}' : path.endsWith('PROGRESS.md') ? progress : plan);
      return { code: run([], r.fake, c), text: [...r.out, ...r.err].join('\n') };
    };
    expect(phaseFamilies(plan, cfg)).toEqual(new Map([['2', ['R']], ['5', ['RL']]]));
    expect(go('', '').code).toBe(0);
    expect(go('- Phase 2 merged\n', '').code).toBe(1);
    expect(go('- Phase 2 merged\n', "it('R-010 x', () => {});").code).toBe(0);
    const all = go('- Phase 2 merged\n- Batch 5 merged\n', "it('R-010 x', () => {});");
    expect(all.code).toBe(1);
    expect(all.text).toMatch(/R {9}011[\s\S]*RL {8}005/);
    const unlisted = go('- Phase 2 merged\n', "it('R-010 x', () => {});", { ...cfg, phaseTable: '### 11.4' });
    expect(unlisted.text).toMatch(/missing from the phase table: R RL/);
    expect(unlisted.code).toBe(1);
  });
});

describe('K67 options, the review round', () => {
  const base: Config = { ...CFG, scenarioPrefix: '', requireComment: false };
  const go = (plan: string, titles: string, cfg: Config, files: Record<string, string> = {}) => {
    const r = io({}, [test('tests/a.test.ts', titles)]);
    r.fake.readText = (path) => files[path] ?? (path.endsWith('.json') ? '{}' : path.endsWith('.md') && path !== cfg.plan ? '' : plan);
    return { code: run(['--strict'], r.fake, cfg), text: [...r.out, ...r.err].join('\n') };
  };
  const phased = (rules: string[]) => [...['## 3. Rules'], ...rules, '## 11. Phases', '### 11.3 Phase table', '| 2 | core | R | x |', '### 11.4 Next'].join('\n');
  const done = { 'docs/PROGRESS.md': '- Phase 2 merged\n' };

  it('strictIdEnd: a sub-letter no longer names the id', () => {
    const tests = [test('tests/a.test.ts', "it('R-010a x', () => {});")];
    expect(computeCoverage('## 3. Rules\nR-010\n', tests, [], base).covered).toEqual(['R-010']);
    expect(computeCoverage('## 3. Rules\nR-010\n', tests, [], { ...base, strictIdEnd: true }).covered).toEqual([]);
    expect(extractRuleIds('## 3. Rules\nR-010a R-011\n', { ...base, strictIdEnd: true })).toEqual(['R-011']);
  });

  it('unlistedCountsDeferred: a deferred family missing from the phase table fails; progress and phaseDone are read as configured', () => {
    const plan = phased(['- **R-010** a.', '- **CPN-01** later.']);
    const cfg: Config = { ...base, families: ['CPN', 'R'], deferredPrefixes: ['CPN-'], idsAtLineStart: true, phaseTable: '### 11.3', progress: 'docs/DONE.md', phaseDone: '^done: (\\w+)' };
    const files = { 'docs/DONE.md': 'done: 2\n' };
    expect(go(plan, "it('R-010 x', () => {});", cfg, files).code).toBe(0);
    expect(go(plan, '', cfg, files).code).toBe(1);
    expect(go(plan, '', cfg, { 'docs/DONE.md': '- Phase 2 merged\n' }).code).toBe(0);
    const r = go(plan, "it('R-010 x', () => {});", { ...cfg, unlistedCountsDeferred: true }, files);
    expect(r.code).toBe(1);
    expect(r.text).toMatch(/phase table: CPN$/m);
  });

  it('rulePendingInlineOnly: a bare pending line does not cover rule lines', () => {
    const plan = phased(['pending: 5', '- **R-010** a.', '- **R-011** b. pending: 5']);
    const cfg: Config = { ...base, idsAtLineStart: true, phaseTable: '### 11.3' };
    expect(go(plan, '', cfg, done).code).toBe(0);
    const r = go(plan, '', { ...cfg, rulePendingInlineOnly: true }, done);
    expect(r.code).toBe(1);
    expect(r.text).toMatch(/R {9}010$/m);
  });

  it('skipInsideSkippedDescribe and ignoreTemplateSubstitutions', () => {
    const src = "describe.skip('g', () => {\n  it('R-010 in', () => {});\n});\nit('R-011 out', () => {});\nit(`R-012 $" + '{n}`, () => {});';
    expect(extractTitles(src, base)).toHaveLength(3);
    expect(extractTitles(src, { ...base, skipInsideSkippedDescribe: true })).toEqual(['R-011 out', 'R-012 $' + '{n}']);
    expect(extractTitles(src, { ...base, ignoreTemplateSubstitutions: true })).toEqual(['R-010 in', 'R-011 out']);
  });

  it('staleFails false: a pending id the plan does not define is only reported', () => {
    const pending = { ...Object.fromEntries(ALL.map((id) => [id, 'B3'])), 'R-099': 'B3' };
    const r = io(pending, []);
    expect(run(['--strict'], r.fake, { ...CFG, staleFails: false })).toBe(0);
    expect(r.err.join('\n')).toMatch(/R-099/);
  });

  it('testFilePattern: only matching files of the test folders are read', () => {
    const dir = mkdtempSync(join(tmpdir(), 'k67-'));
    mkdirSync(join(dir, 'tests'));
    writeFileSync(join(dir, 'tests', 'a.test.ts'), '');
    writeFileSync(join(dir, 'tests', 'helper.ts'), '');
    const cfg: Config = { ...base, testDirs: ['tests'], testSrcDirs: [] };
    const paths = (c: Config) => makeIo(dir + sep, c).testFiles().map((f) => f.path);
    expect(paths(cfg)).toEqual(['tests/a.test.ts', 'tests/helper.ts']);
    expect(paths({ ...cfg, testFilePattern: '\\.(test|spec)\\.tsx?$' })).toEqual(['tests/a.test.ts']);
    rmSync(dir, { recursive: true });
  });

  it('extraRuleHeadings through run: an id of the extra heading is required', () => {
    const plan = '## 3. Rules\nR-010\n## 4. Arch\n#### 4.4.8 Invariants\n| IR-05 | x |\n';
    expect(go(plan, "it('R-010 x', () => {});", base).code).toBe(0);
    const r = go(plan, "it('R-010 x', () => {});", { ...base, extraRuleHeadings: ['#### 4.4.8'] });
    expect(r.code).toBe(1);
    expect(r.text).toMatch(/IR {8}05/);
  });
});

describe('heading without a dot', () => {
  it('finds `## 3 Rules specification`', () => {
    expect(extractRuleIds('## 3 Rules specification\nSC-01 x\n## 4 Next', { ...CFG, families: ['SC'] })).toEqual(['SC-01']);
  });
});

describe('K136', () => {
  const base: Config = { ...CFG, scenarioPrefix: '', requireComment: false };

  it('test titles come from a TypeScript parse: a string, a comment or a call on another object holds no test', () => {
    const src = [
      'const fixture = "it(\'R-010 in a string\', () => {});";',
      "const a = 1; // it('R-011 after code')",
      "helper.it('R-012 not a test', () => {});",
      "it.each`a\n$" + "{1}`('R-013 tagged', () => {});",
      "it('R-014 ' + name, () => {});",
      "it('R-015 real', () => {});",
    ].join('\n');
    expect(extractTitles(src, CFG)).toEqual(['R-013 tagged', 'R-014 ', 'R-015 real']);
    expect(extractTitles(src, { ...CFG, ignoreTemplateSubstitutions: true })).toEqual(['R-013 tagged', 'R-015 real']);
    expect(extractTitles("it('R-010 x', () => <div />);", CFG, 'a.test.tsx')).toEqual(['R-010 x']);
    const c = computeCoverage('## 3. Rules\nR-010\n', [test('tests/a.test.ts', src)], [], base);
    expect(c.untitled).toEqual(['R-010']);
  });

  it('idsAtLineStart: the first cell of a section 3 table row is a rule, and its pending phase is read', () => {
    const plan = '## 3. Rules\n- **R-010** a.\n| IR-07 | a ruling | pending: 5 |\n| see | IR-08 |\n## 11. Phases\n### 11.3 Phase table\n| 2 | core | R, IR | x |\n### 11.4 Next\n';
    const cfg: Config = { ...base, idsAtLineStart: true, phaseTable: '### 11.3' };
    expect(extractRuleIds(plan, cfg)).toEqual(['R-010', 'IR-07']);
    const go = (progress: string) => {
      const r = io({}, [test('tests/a.test.ts', "it('R-010 x', () => {});")]);
      r.fake.readText = (path) => (path.endsWith('.json') ? '{}' : path.endsWith('PROGRESS.md') ? progress : plan);
      return run(['--strict'], r.fake, cfg);
    };
    expect(go('- Phase 2 merged\n')).toBe(0);
    expect(go('- Phase 2 merged\n- Phase 5 merged\n')).toBe(1);
  });

  const STCC = String.raw`\b(PREC|VOC|SET|PSET|TURN|RES|RSP|CTL|ACT|TBL|DECK|GAIN|SPC|LOC|SHIP|AWAY|BEAM|DUTY|MIS|LOG|CLN|STD|SCR|MIX|KW-[A-Z]+|BOT-[A-Z]+|CREW-[A-Z]+|SC-RULE|CADET)-\d{2}\b`;
  const IMPERIUM = String.raw`\b(GEN|CMP|SET|CSET|BSET|RND|TURN|ACT|EXH|INN|REV|CLN|RSH|SOL|TXT|RES|MKT|FAME|END|COL|SCR|IR)-\d{2}\b|\bKW-[A-Z]+-\d{2}\b|\bBOT-[A-Z]+-\d{2}\b|\bVAR-[A-Z]+-\d{2}\b|\bCARD-\d{3}\b`;

  it('idPattern: the whole id regexp as the game wrote it (STCC, Imperium): an id after a dash counts, after an underscore or before a letter not', () => {
    const plan = '## 3. Rules\nSET-01, KW-FAST-02, X-TURN-03, SET-04a, SET-005, a_SET-06, DEF-01\n';
    expect(extractRuleIds(plan, { ...base, idPattern: STCC })).toEqual(['SET-01', 'KW-FAST-02', 'TURN-03']);
    expect(extractRuleIds(plan, { ...base, families: ['SET', 'TURN', 'KW-[A-Z]+'], idTail: '\\d{2}' })).toEqual(['SET-01', 'KW-FAST-02', 'SET-04', 'SET-06']);
    const imp: Config = { ...base, idPattern: IMPERIUM };
    const plan2 = '## 3. Rules\nCARD-001 KW-ACQ-01 X-IR-02 y_GEN-03 CARD-01\n';
    expect(extractRuleIds(plan2, imp)).toEqual(['CARD-001', 'KW-ACQ-01', 'IR-02']);
    const c = computeCoverage(plan2, [test('tests/a.test.ts', "it('x_IR-02 and KW-ACQ-01a', () => {});\nit('IR-99', () => {});")], [], imp);
    expect(c.covered).toEqual(['KW-ACQ-01', 'IR-02']);
    expect(c.unknown).toEqual(['IR-99']);
    expect(extractRuleIds('## 3. Rules\n- **SET-01** a, see SET-02.\n', { ...base, idPattern: STCC, idsAtLineStart: true })).toEqual(['SET-01']);
  });

  it('headingDot: only `## 3.` opens or closes a section', () => {
    const plan = '## 3. Rules\nR-010\n## 4 Next\nR-011\n## 5. Last\nR-012\n';
    expect(extractRuleIds(plan, base)).toEqual(['R-010']);
    expect(extractRuleIds(plan, { ...base, headingDot: true })).toEqual(['R-010', 'R-011']);
    expect(() => extractRuleIds('## 3 Rules\nR-010\n', { ...base, headingDot: true })).toThrow(/section "## 3."/);
  });

  it('countsLine, rejectedTitles and scenarioReport print the lines of the EBR check; off by default', () => {
    const plan = ['## 3. Rules', '- **R-010** a.', '- **R-011** b.', '- **RL-005** c.', '## 10. Tests', '| SC-01 | a |', '| SC-02 | b | pending: 2 |', '| SC-03 | c | pending: 9 |', '## 11. Phases', '### 11.3 Phase table', '| 2 | core | R | x |', '| 5 | later | RL | x |', '### 11.4 Next'].join('\n');
    const cfg: Config = { ...CFG, requireComment: false, reportUnknown: false, idsAtLineStart: true, phaseTable: '### 11.3', scenarioDigits: '2', scenarios: 'required' };
    const titles = "it('SC-01 R-010 x', () => {});\nit.skip('R-011 skipped', () => {});\nit('R-010 R-011 R-012 R-013 R-014 R-015 R-016 many', () => {});";
    const go = (c: Config) => {
      const r = io({}, [test('tests/a.test.ts', titles)]);
      r.fake.readText = (path) => (path.endsWith('.json') ? '{}' : path.endsWith('PROGRESS.md') ? '- Phase 2 merged\n' : plan);
      return { code: run(['--strict'], r.fake, c), text: [...r.out, ...r.err].join('\n') };
    };
    const off = go(cfg);
    expect(off.code).toBe(1);
    expect(off.text).toMatch(/not pending: SC-02$/m);
    expect(off.text).not.toMatch(/counts:|gate rejects|scenario row/);
    const on = go({ ...cfg, countsLine: true, rejectedTitles: true, scenarioReport: true });
    expect(on.code).toBe(1);
    expect(on.text).toMatch(/counts: 3 rules defined; 2 in implemented families \(R\); 1 cited or pending; 2 of 3 scenarios tested or pending\./);
    expect(on.text).toMatch(/6 id\(s\) are named only by titles the gate rejects: R-011 \[unconditional skip or todo\], R-012 \[a title with 7 ids\]/);
    expect(on.text).toMatch(/1 scenario row\(s\) have no test: SC-02 \(pending: 2, which is merged\)$/m);
  });
});
