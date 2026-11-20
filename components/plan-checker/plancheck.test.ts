// BUILD_PLAN §10.1: npm run plancheck finds a Python 3 (python3 first on Linux, python and the py launcher on Windows).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { candidates, main } from './plancheck.ts';

const made: string[] = [];
const tmp = (prefix: string): string => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  made.push(d);
  return d;
};
afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true });
});

describe('plancheck interpreters (§10.1)', () => {
  it('tries PYTHON first, then the platform order', () => {
    expect(candidates({ PYTHON: '/opt/py/bin/python' }, 'linux')).toEqual([
      ['/opt/py/bin/python'],
      ['python3'],
      ['python'],
    ]);
    expect(candidates({}, 'linux')).toEqual([['python3'], ['python']]);
    expect(candidates({ PYTHON: '' }, 'win32')).toEqual([['python'], ['py', '-3'], ['python3']]);
  });
});

describe('plancheck.py matches the build-plan skill', () => {
  it('has the extraction options workers start from', () => {
    const py = readFileSync(new URL('./plancheck.py', import.meta.url), 'utf-8');
    for (const opt of ['--batch', '--section']) expect(py).toContain(opt);
  });
});

const PLAN = `# Plan

## 3. Rules

- **SET-01** a rule
- **SET-02** a rule
- **P2-01** deferred

| Id | Text |
|---|---|
| ICON-TRAIN | an icon |
| CARD-001 | not a rule |

## 10. Tests

### 10.4 Scenario catalogue

| ID | Rules | Then |
|---|---|---|
| SC-01 | SET-01 | ok |

### 10.4.1 More scenarios

| ID | Rules | Then |
|---|---|---|
| SC-02 | SET-02, ICON-TRAIN | ok |

### 10.5 Property tests

## 11. Implementation phases

#### Phase 0 — all

SC-01
`;

describe('plancheck.py flags (K68)', () => {
  const plan = (text: string): string => {
    const f = join(tmp('plancheck-'), 'PLAN.md');
    writeFileSync(f, text, 'utf-8');
    return f;
  };
  const run = (text: string, ...flags: string[]): number => main(['--plan', plan(text), '--depth-optional', '--cards-optional', ...flags]);
  const full = PLAN.replace('\nSC-01\n', '\nSC-01, SC-02\n');
  const end = ['--sessions-optional', '--scenarios-end', 'Property tests'];
  afterEach(() => vi.unstubAllEnvs());

  it('--sessions-optional: a plan with no session-plan heading passes; without the flag it does not', () => {
    expect(run(PLAN)).toBe(1);
    expect(run(PLAN, '--sessions-optional')).toBe(0);
  });
  it('--sessions-optional still checks a session plan that is there', () => {
    expect(run(`${PLAN}\n### 11.5 Session plan\n\nnothing\n`, '--sessions-optional')).toBe(1);
  });
  it('--scenarios-end reads the sibling headings of the catalogue: SC-02 then needs a phase', () => {
    expect(run(PLAN, ...end)).toBe(1);
    expect(run(full, ...end)).toBe(0);
    expect(run(PLAN, '--sessions-optional', '--scenarios-end', 'No such heading')).toBe(1);
  });
  it('--cover: every rule id of the section is in the catalogue; --cover-rows and --cover-skip pick families', () => {
    const cover = ['--cover', '3. Rules'];
    expect(run(full, '--sessions-optional', ...cover)).toBe(1);
    expect(run(full, ...end, ...cover)).toBe(1);
    expect(run(full, ...end, ...cover, '--cover-skip', 'P2')).toBe(0);
    expect(run(full, ...end, ...cover, '--cover-skip', 'P2', '--cover-rows', 'ICON')).toBe(0);
    expect(run(full, ...end, ...cover, '--cover-skip', 'P2', '--cover-rows', 'ICON,CARD')).toBe(1);
    expect(run(full.replace(', ICON-TRAIN', ''), ...end, ...cover, '--cover-skip', 'P2', '--cover-rows', 'ICON')).toBe(1);
  });
  it('--tsc (K139): several sections in the order given, a range B..C, and a stub line; one section as before', () => {
    const ts = (h: string, code: string): string => `\n${h}\n\n\`\`\`ts\n${code}\n\`\`\`\n`;
    const typed =
      full +
      ts('## 12. Type definitions', "export interface GameState { status: 'on' | 'off' }") +
      ts('## 13. Effect DSL reference', 'export type Effect = (s: GameState) => GameState;') +
      ts('### 13.3 Text generation', "export const broken: number = 'x';") +
      ts('## 14. Boss modules', 'export type Boss = (v: PlayerView, e: Effect) => GameState;');
    const stub = ['--tsc-stub', "export interface PlayerView { status: GameState['status'] }"];
    const tsc = (...flags: string[]): number => run(typed, ...end, '--tsc', ...flags);
    expect(tsc()).toBe(0);
    expect(tsc('--types', 'Boss modules')).toBe(1);
    expect(tsc('--types', 'Effect DSL reference..Text generation;Type definitions;Boss modules', ...stub)).toBe(0);
    expect(tsc('--types', 'Effect DSL reference..Text generation;Type definitions;Boss modules')).toBe(1);
    expect(tsc('--types', 'Effect DSL reference;Type definitions;Boss modules', ...stub)).toBe(1);
    expect(tsc('--types', 'Type definitions;No such heading')).toBe(1);
    expect(tsc('--types', 'Type definitions..No such heading')).toBe(1);
    expect(tsc('--types', '..Effect DSL reference')).toBe(1);
    expect(tsc('--types', 'Type definitions..')).toBe(1);
    expect(tsc('--types', 'Type definitions;')).toBe(1);
    expect(tsc('--types', 'Type definitions;;Effect DSL reference..Text generation')).toBe(1);
    expect(tsc('--types', 'Type definitions;Effect DSL reference..Text generation')).toBe(0);
  }, 300_000);
  it('--tsc-at (K285): blocks compile inside a game folder, so a relative kit import resolves', () => {
    const game = tmp('plancheck-game-');
    mkdirSync(join(game, 'kit', 'core'), { recursive: true });
    mkdirSync(join(game, 'src', 'engine'), { recursive: true });
    writeFileSync(join(game, 'kit', 'core', 'index.ts'), "export interface Core { status: 'on' | 'off' }\nexport const last = [1, 2].findLast((n) => n > 1);\nexport const el: HTMLElement | null = null;\n");
    const typed = full + "\n## 12. Type definitions\n\n```ts\nimport type { Core } from './../../kit/core/index.ts';\nexport type GameState = Core;\n```\n";
    const at = join(game, 'src', 'engine');
    expect(run(typed, ...end, '--tsc')).toBe(1);
    writeFileSync(join(at, 'tsconfig.json'), '{}');
    expect(run(typed, ...end, '--tsc', '--tsc-at', at)).toBe(0);
    const ok = full + "\n## 12. Type definitions\n\n```ts\nexport type Ok = 1;\n```\n";
    expect(run(ok, ...end, '--tsc')).toBe(0);
    expect(run(ok, ...end, '--tsc', '--tsc-at', join(game, 'nope'))).toBe(1);
    expect(readdirSync(at)).toEqual(['tsconfig.json']);
  }, 300_000);
  it('--skip-without-python: no Python 3 is a notice and exit 0, but exit 2 in CI or without the flag', () => {
    vi.stubEnv('PATH', join(tmpdir(), 'no-such-dir'));
    vi.stubEnv('Path', join(tmpdir(), 'no-such-dir'));
    vi.stubEnv('PYTHON', '');
    vi.stubEnv('CI', '');
    expect(main(['--skip-without-python'])).toBe(0);
    expect(main([])).toBe(2);
    vi.stubEnv('CI', 'true');
    expect(main(['--skip-without-python'])).toBe(2);
  });
});

describe('plancheck.py kit warnings (K207)', () => {
  const git = (cwd: string, ...a: string[]): void => void spawnSync('git', ['-C', cwd, ...a]);
  const kit = tmp('kit-');
  mkdirSync(join(kit, 'docs'));
  writeFileSync(join(kit, 'docs', 'PLAN.md'), '| # | Batch | Size | State |\n|---|---|---|---|\n| K25 | x | S | done |\n| K26 | y | S | proposed |\n| K27 | z | S | covered: already there |\n');
  git(kit, 'init');
  git(kit, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-m', 'x');
  for (const t of ['v0.3.0', 'v0.9.0']) git(kit, 'tag', t);
  const plan = (pin: string, gk: string): string => {
    const d = tmp('plancheck-');
    mkdirSync(join(d, 'docs'));
    writeFileSync(join(d, 'docs', 'PLAN.md'), `${PLAN.replace('\nSC-01\n', '\nSC-01, SC-02\n')}\n\nKit pin: ${pin}\n\n#### Phase GK1 - kit\n\n${gk}\n`);
    return join(d, 'docs', 'PLAN.md');
  };
  const py = candidates(process.env, process.platform)[0] ?? ['python'];
  const out = (f: string, ...a: string[]): string =>
    spawnSync(py[0] ?? 'python', [...py.slice(1), fileURLToPath(new URL('./plancheck.py', import.meta.url)), f, '--sessions-optional', '--depth-optional', '--cards-optional', ...a], { encoding: 'utf-8' }).stdout;
  it('warns on a pin 5+ minor versions behind and on a done K row, without failing', () => {
    const o = out(plan('v0.3.0', 'Targets K25 and K26.'), '--kit', kit);
    expect(o).toContain('WARN kit pin v0.3.0 is far behind the latest kit tag v0.9.0');
    expect(o).toContain('GK1 targets kit row K25');
    expect(o).not.toContain('row K26');
    expect(o).not.toContain('PROBLEM');
  });
  it('is quiet for a recent pin, no done row, or no kit checkout', () => {
    expect(out(plan('v0.8.0', 'Targets K26.'), '--kit', kit)).not.toContain('WARN');
    expect(out(plan('v0.3.0', 'Targets K25.'), '--kit', join(kit, 'nope'))).not.toContain('GK1 targets');
  });
  it('covered counts as done; the pin comes from kit/kit.lock.json before the plan text', () => {
    expect(out(plan('v0.9.0', 'Targets K27.'), '--kit', kit)).toContain('GK1 targets kit row K27');
    const f = plan('v0.9.0', 'Targets K26.');
    mkdirSync(join(dirname(dirname(f)), 'kit'));
    writeFileSync(join(dirname(dirname(f)), 'kit', 'kit.lock.json'), JSON.stringify({ components: { a: { ref: 'v0.3.0' } } }));
    expect(out(f, '--kit', kit)).toContain('WARN kit pin v0.3.0');
  });
  it('K227: the one-tag lock shape (top-level ref) gives the pin', () => {
    const f = plan('v0.9.0', 'Targets K26.');
    mkdirSync(join(dirname(dirname(f)), 'kit'));
    writeFileSync(join(dirname(dirname(f)), 'kit', 'kit.lock.json'), JSON.stringify({ ref: 'v0.3.0', commit: 'abc', components: { a: { files: {} } } }));
    expect(out(f, '--kit', kit)).toContain('WARN kit pin v0.3.0');
  });
});

describe('plancheck depth checks (K414)', () => {
  const GOOD = `${PLAN.replace('\nSC-01\n', '\nSC-01, SC-02\n')}
#### Phase 1 - playtest

Build llm-playtester.

## 12. Shared preamble

Run e2e through heavy run.

## 13. Card-language test programme

| Family | Full resolve | Poor setup |
|---|---|---|
| Events | one per clause | expectNotOffered |
| Triggers | one per clause | expectNotFired |

## 14. Definition of Done

A poor test calls expectNotOffered; default-off paths covered; LLM playtest run.

## 15. Layers

Unit, e2e, LLM playtest.
`;
  const dir = tmp('plancheck-depth-');
  let n = 0;
  const py = candidates(process.env, process.platform)[0] ?? ['python'];
  // the .ts wrapper and the .py must agree on the same plan
  const direct = (text: string, ...flags: string[]): { code: number | null; out: string } => {
    const f = join(dir, `p${n++}.md`);
    writeFileSync(f, text, 'utf-8');
    const base = ['--sessions-optional', '--scenarios-end', 'Property tests', '--cards-optional', ...flags];
    const r = spawnSync(py[0] ?? 'python', [...py.slice(1), fileURLToPath(new URL('./plancheck.py', import.meta.url)), f, ...base], { encoding: 'utf-8' });
    expect(main(['--plan', f, ...base])).toBe(r.status);
    return { code: r.status, out: r.stdout };
  };
  const bad = (text: string, ...flags: string[]): string => {
    const r = direct(text, ...flags);
    expect(r.code).toBe(1);
    return r.out;
  };
  const without = (from: string, to = ''): string => {
    expect(GOOD).toContain(from);
    return GOOD.replace(from, to);
  };
  it('a plan with every depth element passes, with and without --depth-optional', () => {
    expect(direct(GOOD).code).toBe(0);
    const o = direct(GOOD, '--depth-optional');
    expect(o.code).toBe(0);
    expect(o.out).not.toContain('depth:');
  });
  it('card tests: expectNotOffered is named', () => {
    const t = without('| expectNotOffered |', '| expectNotFired |').replace('A poor test calls expectNotOffered; ', '');
    expect(bad(t)).toContain('depth: card tests: the poor-setup helper expectNotOffered is not named');
  });
  it('card tests: a family with no full-resolve depth, and one with no poor helper', () => {
    expect(bad(without('| Triggers | one per clause |', '| Triggers | - |'))).toContain("family 'Triggers' has no full-resolve depth");
    expect(bad(without('| expectNotFired |', '| none |'))).toContain("family 'Triggers' names no poor-setup helper");
  });
  it('card tests: no depth table, no section, a renamed section with --cards', () => {
    expect(bad(without('| Family | Full resolve | Poor setup |', '| Kind | Count | Note |'))).toContain('no depth table');
    expect(bad(without('Card-language test programme', 'Cards'))).toContain("no heading contains 'Card-language test programme'");
    expect(direct(without('Card-language test programme', 'Cards'), '--cards', 'Cards').code).toBe(0);
  });
  it('Definition of Done: each of the three is needed', () => {
    expect(bad(without('default-off', 'x'))).toContain('the Definition of Done lacks the default-off paths');
    expect(bad(without('LLM playtest run', 'x'))).toContain('the Definition of Done lacks the LLM playtest');
    expect(bad(without('A poor test calls expectNotOffered; ', ''))).toContain('the Definition of Done lacks the card-test depth gate');
    expect(bad(without('Definition of Done', 'Done'))).toContain("no heading contains 'Definition of Done'");
  });
  it('layers, phases and shared preamble', () => {
    expect(bad(without('Unit, e2e, LLM playtest.', 'Unit.'))).toContain('the test layers');
    expect(bad(without('Build llm-playtester.', 'Nothing.'))).toContain('no phase builds the LLM playtest');
    expect(bad(without('Run e2e through heavy run.', 'Nothing.'))).toContain('the shared preamble does not send a changed flow');
    expect(bad(without('Shared preamble', 'Intro'))).toContain("no heading contains 'Shared preamble'");
  });
  it('--depth-optional turns every depth problem into a NOTE and exits 0; without it they fail', () => {
    const old = PLAN.replace('\nSC-01\n', '\nSC-01, SC-02\n');
    const o = direct(old, '--depth-optional');
    expect(o.code).toBe(0);
    expect(o.out).toContain('NOTE depth: ');
    expect(o.out).not.toContain('PROBLEM');
    expect(bad(old)).toContain('PROBLEM depth: ');
  });
  it('the old checks give the same result with the depth flag', () => {
    expect(bad(PLAN, '--depth-optional')).toContain('SC-02');
  });
});

describe('plancheck card encoding checks (K492)', () => {
  const dir = tmp('plancheck-cards-');
  let n = 0;
  const cat = join(dir, 'cat.json');
  writeFileSync(cat, JSON.stringify({ summary: { clauses: 30 }, patterns: [{ id: 'P-01' }, { id: 'P-02' }] }));
  const BASE = `${PLAN.replace('\nSC-01\n', '\nSC-01, SC-02\n')}
#### Phase 1 - playtest

Build llm-playtester. Run cards:whole-game.

## 11.4 Session plan

| Batch | Phase | Model | Confidence | Clauses | Patterns |
|---|---|---|---|---|---|
| B1 | 0 | opus | 80% | 10 | P-01 |
| B2 | 1 | opus | 80% | 20 | P-02 |

## 12. Shared preamble

Run e2e through heavy run. Rulings: ar-map.md.

## 13. Card-language test programme

Each test is cardCase; add an interaction test.

| Family | Full resolve | Poor setup |
|---|---|---|
| Events | one per clause | expectNotOffered |
| Triggers | one per clause | expectNotFired |

### 13.1 Modifier order

| Step | Rule |
|---|---|
| a | AR-12 |
| b | IR-03 |
| <skipped> | none |

### 13.2 Screen-text scan

Scan.

## 14. Definition of Done

A poor test calls expectNotOffered; default-off paths covered; LLM playtest run; cards:check, cards:screen, cards:whole-game pass.

## 15. Layers

Unit, e2e, LLM playtest.
`;
  const py = candidates(process.env, process.platform)[0] ?? ['python'];
  const direct = (text: string, ...flags: string[]): { code: number | null; out: string } => {
    const f = join(dir, `p${n++}.md`);
    writeFileSync(f, text, 'utf-8');
    const base = ['--scenarios-end', 'Property tests', ...(flags.includes('--catalogue') ? [] : ['--catalogue', cat]), ...flags];
    const r = spawnSync(py[0] ?? 'python', [...py.slice(1), fileURLToPath(new URL('./plancheck.py', import.meta.url)), f, ...base], { encoding: 'utf-8' });
    expect(main(['--plan', f, ...base])).toBe(r.status);
    return { code: r.status, out: r.stdout };
  };
  const bad = (text: string, want: string, ...flags: string[]): void => {
    const r = direct(text, ...flags);
    expect(r.code).toBe(1);
    expect(r.out).toContain(`PROBLEM cards: ${want}`);
  };
  const without = (from: string, to = ''): string => {
    expect(BASE).toContain(from);
    return BASE.replace(from, to);
  };
  it('a plan with every cards element passes', () => {
    const r = direct(BASE);
    expect(r.out).not.toContain('cards:');
    expect(r.code).toBe(0);
  });
  it('no catalogue, unparsable catalogue, and --catalogue names it', () => {
    bad(BASE, 'no catalogue', '--catalogue', join(dir, 'missing.json'));
    const badc = join(dir, 'bad.json');
    writeFileSync(badc, '{}');
    bad(BASE, 'catalogue', '--catalogue', badc);
  });
  it('the plan names ar-map.md; a Modifier order heading; rows hold AR or IR ids', () => {
    bad(without(' Rulings: ar-map.md.'), 'the plan does not name ar-map.md');
    bad(without('Modifier order', 'Order'), "no heading contains 'Modifier order'");
    bad(without('| b | IR-03 |', '| b | none |'), "Modifier order: row 'b' has no AR or IR id");
  });
  it('cardCase and interaction; Screen-text scan; Definition of Done names', () => {
    bad(without('Each test is cardCase; add an interaction test.', 'Tests.'), "the card-test section does not name cardCase and 'interaction'");
    bad(without('Screen-text scan', 'Scan'), "no heading contains 'Screen-text scan'");
    for (const w of ['cards:check', 'cards:screen']) bad(without(`${w}, `), `the Definition of Done lacks ${w}`);
    bad(without('cards:whole-game pass', 'pass'), 'the Definition of Done lacks cards:whole-game');
  });
  it('a phase names cards:whole-game', () => {
    bad(without(' Run cards:whole-game.'), 'no phase names cards:whole-game');
  });
  it('session table: Clauses and Patterns columns, sum, every pattern in a batch', () => {
    const nocols = BASE.replace(' Clauses | Patterns |', '').replace('|---|---|---|---|---|---|', '|---|---|---|---|').replace(/ \| \d+ \| P-0\d \|/g, ' |');
    const r = direct(nocols);
    expect(r.out).toContain('PROBLEM cards: the session table has no Clauses column');
    expect(r.out).toContain('PROBLEM cards: the session table has no Patterns column');
    bad(without('| 10 | P-01 |', '| 9 | P-01 |'), '30 clauses in the catalogue, 29 in batches');
    bad(without('| 20 | P-02 |', '| 20 | P-01 |'), 'pattern P-02 is in no batch');
  });
  it('--max-clauses and --max-patterns cap a batch (defaults 40 and 10)', () => {
    bad(BASE, 'B2 has 20 clauses (cap 15)', '--max-clauses', '15');
    bad(without('| 20 | P-02 |', '| 20 | P-02, P-03, P-04 |'), 'B2 has 3 patterns (cap 2)', '--max-patterns', '2');
    expect(direct(BASE, '--max-clauses', '20').code).toBe(0);
    bad(without('| 10 | P-01 |', '| 41 | P-01 |'), 'B1 has 41 clauses (cap 40)');
    const many = Array.from({ length: 11 }, (_, i) => `P-${i + 10}`).join(', ');
    bad(without('| 20 | P-02 |', `| 20 | P-02, ${many} |`), 'B2 has 12 patterns (cap 10)');
  });
  it('--cards-optional turns every cards problem into a NOTE; an old plan stays green, and without it fails', () => {
    const old = `${BASE.split('## 11.4 Session plan')[0] ?? ''}## 12. Shared preamble\n\ne2e heavy\n\n## 13. Card-language test programme\n\n| Family | Full resolve | Poor setup |\n|---|---|---|\n| E | one per clause | expectNotOffered |\n\n## 14. Definition of Done\n\nA poor test calls expectNotOffered; default-off; LLM playtest.\n\n## 15. Layers\n\nLLM playtest\n`;
    const miss = join(dir, 'missing.json');
    const o = direct(old, '--sessions-optional', '--cards-optional', '--catalogue', miss);
    expect(o.code).toBe(0);
    expect(o.out).toContain('NOTE cards: ');
    expect(o.out).not.toContain('PROBLEM');
    const r = direct(old, '--sessions-optional', '--catalogue', miss);
    expect(r.code).toBe(1);
    expect(r.out).toContain('PROBLEM cards: ');
  });
});
