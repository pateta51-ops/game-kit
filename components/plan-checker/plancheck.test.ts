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
  const run = (text: string, ...flags: string[]): number => main(['--plan', plan(text), '--depth-optional', '--cards-optional', '--kit-optional', ...flags]);
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
  mkdirSync(join(kit, 'components'));
  writeFileSync(join(kit, 'kit.mjs'), '');
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
    spawnSync(py[0] ?? 'python', [...py.slice(1), fileURLToPath(new URL('./plancheck.py', import.meta.url)), f, '--sessions-optional', '--depth-optional', '--cards-optional', '--kit-optional', ...a], { encoding: 'utf-8' }).stdout;
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
    const base = ['--sessions-optional', '--scenarios-end', 'Property tests', '--cards-optional', '--kit-optional', ...flags];
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
    const base = ['--scenarios-end', 'Property tests', '--kit-optional', ...(flags.includes('--catalogue') ? [] : ['--catalogue', cat]), ...flags];
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

describe('plancheck --batch read-first ranges (K515)', () => {
  it('a range of one major lists every section in it', () => {
    const d = tmp('pc-range-');
    const f = join(d, 'PLAN.md');
    writeFileSync(f, '# Plan\n\n## Batch S1\n\n**Read first:** §3.4-§3.7, §5.1, BRIEF §2.1–2.3\n\nBody.\n');
    const py = candidates(process.env, process.platform)[0] ?? ['python'];
    const o = spawnSync(py[0] ?? 'python', [...py.slice(1), '-X', 'utf8', fileURLToPath(new URL('./plancheck.py', import.meta.url)), f, '--batch', 'S1'], { encoding: 'utf-8' }).stdout;
    for (const s of ['§3.4', '§3.5', '§3.6', '§3.7', '§5.1', 'BRIEF §2.2']) expect(o).toContain(s);
  });
});

describe('plancheck --batch card-test rules (K713)', () => {
  const run = (plan: string): string => {
    const f = join(tmp('pc-card-'), 'PLAN.md');
    writeFileSync(f, plan);
    const py = candidates(process.env, process.platform)[0] ?? ['python'];
    return spawnSync(py[0] ?? 'python', [...py.slice(1), '-X', 'utf8', fileURLToPath(new URL('./plancheck.py', import.meta.url)), f, '--batch', 'S1'], { encoding: 'utf-8' }).stdout;
  };
  const plan = (row: string, body: string): string => `# Plan\n\n## Session plan\n\n| Batch | Phases | Model | Clauses | Patterns |\n|---|---|---|---|---|\n| S1 | 1 | Sonnet | ${row} |\n\n## Batch S1\n\nDo it.\n\n#### Phase 1 - x\n\n${body}\n`;
  it('a card batch prints the card-test rules, a screen batch does not', () => {
    expect(run(plan('12 | P-01', 'Cards.'))).toContain('## Card tests');
    expect(run(plan('12 | P-01', 'Cards.'))).toContain('`<clause id> poor`');
    expect(run(plan('- | -', 'Write content/cards/a.json.'))).toContain('## Card tests');
    const o = run(plan('- | -', 'Build the settings screen.'));
    expect(o).toContain('Build the settings screen');
    expect(o).not.toContain('Card tests');
  });
});

describe('plancheck kit checks (K525)', () => {
  const git = (cwd: string, ...a: string[]): void => void spawnSync('git', ['-C', cwd, ...a]);
  const kit = tmp('kit525-');
  mkdirSync(join(kit, 'docs'));
  writeFileSync(join(kit, 'docs', 'PLAN.md'), '| # | Batch | Size | State |\n|---|---|---|---|\n');
  writeFileSync(join(kit, 'kit.mjs'), '');
  for (const c of ['engine-core', 'card-language', 'board-model', 'player-board', 'automa', 'opponent']) {
    mkdirSync(join(kit, 'components', c), { recursive: true });
    writeFileSync(join(kit, 'components', c, 'README.md'), c);
  }
  git(kit, 'init');
  git(kit, 'add', '-A');
  git(kit, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-m', 'x');
  git(kit, 'tag', 'v0.227.1');
  const L = ['Who the player controls', 'What can run out', 'Clocks and tracks', 'The phase list', 'Where the opposition comes from', 'Dice', 'Positions', 'Numbers several cards change', 'Costs and payment', 'May an effect be offered', 'Lasting effects and status', 'Triggers and windows', 'Cards as data', 'Hidden information', 'Objectives and scoring', 'Set-up picks', 'Between games', 'Loading the content', 'Attacks and damage', 'Tokens and markers', 'Levels and upgrades', 'Markets and rows'];
  const SHEET = '| Game sheet line | Answer | Kit part or build-own row |\n|---|---|---|\n' + L.map((t, i) => `| ${t} | ${i % 4 === 3 ? 'not in this game' : 'one hero'} | ${i % 4 === 3 ? '' : '`player-board`'} |\n`).join('');
  const REPLY = "**Kit steward's reply (21 Nov 2026):**";
  const GOOD = `${PLAN.replace('\nSC-01\n', '\nSC-01, SC-02\n')}
### 4.11 Reuse map

**Kit pin:** \`kit/\`, tag v0.227.1.

| Layer | Kind | Source | What the game supplies or changes | Phase |
|---|---|---|---|---|
| Kernel | Pull | \`engine-core\` (\`timing.md\`, \`layered\`) | state | 1 |
| Effect language | Pull | \`card-language\` (\`cardPack\`) | verbs | 3 |
| Walled grid | **Kit phase, new** | \`grid-map\` (new) | cells | GK530 |
| Map | Pull | \`board-model\`, \`grid-map\` | spaces | 2 |
| Spy movement | New | game code | the arrow deck | 5 |
| Greedy player | Pattern | the kit's note | scores | 7 |

${SHEET}
| What the game builds | Words searched in the kit | Nearest kit part | Verdict | Register id or refusal |
|---|---|---|---|---|
| Spy movement | "arrow deck"; "movement deck" | \`automa\` | game code | \`automa\` picks among legal answers; this deck moves a piece by printed arrows |
| Greedy player | "greedy"; "look ahead" | \`opponent\` | candidate | K424 |
| Walled grid | "grid"; "line of sight" | \`board-model\` | kit phase | K530 |
| Game verbs: none | 12 clauses, 12 covered by the pack | - | - | - |

${REPLY}
> Spy movement: game code. Greedy player: candidate K424. Walled grid: kit phase K530.

### 5.14 Modifier order

| Quantity | Applied in this order | Floors and caps | Read or paid at | Kit function or build-own row | AR |
|---|---|---|---|---|---|
| Roll | set, add | floor 1 | the roll | \`layered\` | \`AR-001\` |

#### Phase GK530 — game-kit: grid-map

x
`;
  const FIT = "| row | verdict |\n|---|---|\n| Spy movement | truly this game's |\n| Greedy player | candidate |\n| Walled grid | kit phase |\n";
  const py = candidates(process.env, process.platform)[0] ?? ['python'];
  let mapText: string | null = null;
  let lockKit: ((k: string) => void) | null = null;
  const exec =(text: string, fit: string | null = FIT, ...extra: string[]): { code: number | null; out: string; f: string; args: string[] } => {
    const d = join(tmp('pc-kit-'), 'docs');
    mkdirSync(join(d, 'plan-review'), { recursive: true });
    const f = join(d, 'P.md');
    writeFileSync(f, text, 'utf-8');
    if (fit !== null) writeFileSync(join(d, 'plan-review', 'kit-fit.md'), fit, 'utf-8');
    if (mapText !== null) {
      mkdirSync(join(dirname(d), 'kit', 'recipes'), { recursive: true });
      writeFileSync(join(dirname(d), 'kit', 'recipes', 'mechanics.md'), mapText, 'utf-8');
    }
    if (lockKit) lockKit(join(dirname(d), 'kit'));
    const args = ['--sessions-optional', '--scenarios-end', 'Property tests', '--depth-optional', '--cards-optional', ...(extra.includes('--kit') ? [] : ['--kit', kit]), ...extra];
    const r = spawnSync(py[0] ?? 'python', [...py.slice(1), '-X', 'utf8', fileURLToPath(new URL('./plancheck.py', import.meta.url)), f, ...args], { encoding: 'utf-8' });
    return { code: r.status, out: r.stdout, f, args };
  };
  const problems = (text: string, fit: string | null = FIT): string[] => exec(text, fit).out.split('\n').filter((l) => l.startsWith('PROBLEM kit:'));
  const cases: [string, (t: string) => string, string | null][] = [
    ['kind game-owned', (t) => t.replace('| Spy movement | New |', '| Spy movement | Game-owned |'), 'has Kind'],
    ['port without build-own row', (t) => t.replace('| Greedy player | Pattern |', '| Other thing | Port |'), "Port row 'Other thing' is not in the build-own"],
    ['pull, wrong name outside parentheses', (t) => t.replace('`engine-core` (', '`engine-core`, `dice-oddz` ('), '`dice-oddz`'],
    ['pull, only a wrong name', (t) => t.replace('| `engine-core` (`timing.md`, `layered`) |', '| Kernel (`enginecore`) |'), 'names no kit part'],
    ['pull written as title (folder)', (t) => t.replace('| `engine-core` (`timing.md`, `layered`) |', '| Game rules engine core (`engine-core`) |'), null],
    ['pull of the part its own kit phase builds', (t) => t.replace('| `board-model`, `grid-map` |', '| `grid-map` |'), null],
    ['another version before the pin', (t) => t.replace('**Kit pin:**', 'Since v0.2.1 the kernel exists. At this stage the plan is v9.9.9.\n\n**Kit pin:**'), null],
    ['no pin at all', (t) => t.replace(', tag v0.227.1', ''), 'names no kit pin'],
    ['kit phase row without a GK heading', (t) => t.replace('| cells | GK530 |', '| cells | GK7 |'), 'names no GK phase'],
    ['new kit phase without build-own row', (t) => t.replace('| Walled grid | "grid"; "line of sight" | `board-model` | kit phase | K530 |\n', ''), "Kit phase row 'Walled grid' is not in the build-own"],
    ['sheet line missing', (t) => t.replace('| Dice | one hero | `player-board` |\n', ''), "no row for the line 'dice'"],
    ['sheet third cell empty', (t) => t.replace('| Positions | one hero | `player-board` |', '| Positions | one hero | |'), 'names no kit part'],
    ['sheet third cell n/a', (t) => t.replace('| Positions | one hero | `player-board` |', '| Positions | n/a | n/a |'), 'names no kit part'],
    ['verdict word buried', (t) => t.replace('| `opponent` | candidate | K424 |', '| `opponent` | undecided, not a candidate yet | K424 |'), 'has no verdict'],
    ['one phrasing', (t) => t.replace('"greedy"; "look ahead"', 'greedy'), 'fewer than two phrasings'],
    ['words searched is a semicolon', (t) => t.replace('"greedy"; "look ahead"', ';'), 'fewer than two phrasings'],
    ['candidate without id', (t) => t.replace('| candidate | K424 |', '| candidate | soon |'), 'no kit row id'],
    ['game code with a short reason', (t) => t.replace('`automa` picks among legal answers; this deck moves a piece by printed arrows', 'n/a'), 'six words'],
    ['kit phase verdict without GK heading', (t) => t.replace('| kit phase | K530 |', '| kit phase | K531 |'), "no 'Phase GK531'"],
    ['another none row', (t) => t.replace('| Game verbs: none |', '| Engine modules: none | - | - | - | - |\n| Game verbs: none |'), 'may say none'],
    ['game verbs none without counts', (t) => t.replace('12 clauses, 12 covered by the pack', '-'), 'no counts'],
    ['no reply label', (t) => t.replace(REPLY, 'Reply:'), "Kit steward's reply"],
    ['reply label with nothing under it', (t) => t.replace('> Spy movement: game code.', 'Spy movement: game code.'), "Kit steward's reply"],
    ['reply label with a typographic apostrophe', (t) => t.replace("Kit steward's reply", 'Kit steward’s reply'), null],
    ['every row says steward not asked', (t) => t.replace('by printed arrows |', 'by printed arrows; steward not asked |').replace('| K424 |', '| steward not asked |').replace('| kit phase | K530 |', '| kit phase | steward not asked |').replace(REPLY, 'x'), null],
    ['modifier row names no function', (t) => t.replace('| `layered` | `AR-001` |', '| the engine | `AR-001` |'), "Modifier order: row 'Roll'"],
    ['hyphenated verdict', (t) => t.replace('| game code |', '| Game-code |'), null],
    ['table inside a code fence', (t) => t.replace(REPLY, '```\n| Layer | Kind | Source |\n|---|---|---|\n| Example | New | x |\n```\n\n' + REPLY), null],
    ['second table with a Kind column', (t) => t.replace(REPLY, '| Kit phase | Kind |\n|---|---|\n| GK530 | new |\n\n' + REPLY), null],
    ['no reuse-map table', (t) => t.replace('| Layer | Kind | Source |', '| Part | Kind | Source |'), 'no table with Layer, Kind and Source'],
    ['sheet line with no answer', (t) => t.replace('| Positions | one hero | `player-board` |', '| Positions |  | `player-board` |'), "line 'Positions' has no answer"],
    ['no Game verbs row', (t) => t.replace('| Game verbs: none | 12 clauses, 12 covered by the pack | - | - | - |\n', ''), "no 'Game verbs' row"],
  ];
  it('a plan with a reuse map, game sheet, build-own table and kit-fit review passes; Pull rows checked at the tag', () => {
    const r = exec(GOOD);
    expect(r.out).not.toContain('PROBLEM');
    expect(r.out).toContain('NOTE kit: Pull rows checked against v0.227.1');
    expect(r.code).toBe(0);
    expect(main(['--plan', r.f, ...r.args])).toBe(0);
  });
  for (const [name, change, want] of cases)
    it(`${name}: ${want ?? 'no kit problem'}`, () => {
      const t = change(GOOD);
      expect(t).not.toBe(GOOD);
      const r = exec(t);
      const p = r.out.split('\n').filter((l) => l.startsWith('PROBLEM kit:'));
      expect(want === null ? p : p.filter((l) => l.includes(want)).length > 0).toEqual(want === null ? [] : true);
      expect(r.code).toBe(want === null ? 0 : 1);
    });
  describe('K690 build-own rows for screen, motion and sound code', () => {
    const ROWS = '| Screen: hand fan | "hand fan"; "card row" | `player-board` | game code | `player-board` lays cards flat; this fan bends along an arc |\n| Motion: dice tumble | "dice roll"; "tumble" | `motion-frame` | candidate | K700 |\n| Sound: none | every sound is the kit player with this game\'s cues | - | - | - |\n';
    const UI = GOOD.replace('| Game verbs: none |', ROWS + '| Game verbs: none |') + '\n#### Phase U1 — the table\n\nx\n\n#### Phase V — motion\n\nx\n\n#### Phase AU — sound\n\nx\n';
    const UFIT = FIT + '| Screen: hand fan | game code |\n| Motion: dice tumble | candidate |\n';
    const k690 = (t: string): string[] => exec(t, UFIT).out.split(/\r?\n/).filter((l) => l.startsWith('PROBLEM kit:'));
    it('a plan with Screen, Motion and Sound rows passes (py and ts)', () => {
      const r = exec(UI, UFIT);
      expect(r.out).not.toContain('PROBLEM');
      expect(r.code).toBe(0);
      expect(main(['--plan', r.f, ...r.args])).toBe(0);
    });
    it('a plan that builds a screen with no Screen row fails, naming it (py and ts)', () => {
      const r = exec(UI.replace(/\| Screen: hand fan .*\n/, ''), UFIT);
      expect(r.out.split(/\r?\n/).filter((l) => l.startsWith('PROBLEM'))).toEqual(["PROBLEM kit: build-own table: the plan builds screen code (Phase U1) but has no 'Screen' row (one per screen part the game writes, 'Screen: <part>', or 'Screen: none' with a reason of six words or more)"]);
      expect(r.code).toBe(1);
      expect(main(['--plan', r.f, ...r.args])).toBe(1);
    });
    it('no Motion row under Phase V, no Sound row under Phase AU: each fails', () => {
      expect(k690(UI.replace(/\| Motion: dice tumble .*\n/, ''))).toEqual([expect.stringContaining("builds motion code (Phase V) but has no 'Motion' row")]);
      expect(k690(UI.replace(/\| Sound: none .*\n/, ''))).toEqual([expect.stringContaining("builds sound code (Phase AU) but has no 'Sound' row")]);
    });
    it('a none row needs a reason and stands alone of its kind; a Screen row still needs its searches', () => {
      expect(k690(UI.replace("every sound is the kit player with this game's cues", 'kit'))).toEqual(["PROBLEM kit: build-own table: 'Sound: none' gives no reason of six words or more"]);
      expect(k690(UI.replace('| Sound: none |', '| Sound: music states | "music"; "states" | `sound-player` | candidate | K701 |\n| Sound: none |'))).toEqual(["PROBLEM kit: kit-fit review: no line for the build-own row 'Sound: music states'", "PROBLEM kit: build-own table: 'Sound: none': a kind with rows of its own may not also say none"]);
      expect(k690(UI.replace('"hand fan"; "card row"', 'fan'))).toEqual(["PROBLEM kit: build-own table: 'Screen: hand fan' names fewer than two phrasings searched in the kit (separate them with ';')"]);
    });
    it('an old plan with no UI phase is unchanged; wireframe and mock phases (UW, UK) and voice (VO) ask for no row', () => {
      expect(k690(GOOD)).toEqual([]);
      const r = exec(GOOD + '\n#### Phase UW — wireframes\n\nx\n\n#### Phase UK — mocks\n\nx\n\n#### Phase VO — voice\n\nx\n');
      expect(r.out).not.toContain('PROBLEM');
      expect(r.code).toBe(0);
    });
  });
  it('kit-fit review: an empty file, a missing row, no file', () => {
    expect(problems(GOOD, '').some((l) => l.includes('missing or empty'))).toBe(true);
    expect(problems(GOOD, '| Spy movement | x |\n').some((l) => l.includes('no line for the build-own row'))).toBe(true);
    expect(problems(GOOD, null).some((l) => l.includes('missing or empty'))).toBe(true);
  });
  it('without --kit-optional a kit problem exits 1; with it the problem is a NOTE and exit 0', () => {
    const t = GOOD.replace('| candidate | K424 |', '| candidate | soon |');
    const r = exec(t);
    expect(r.code).toBe(1);
    expect(r.out).toContain('PROBLEM kit: build-own table');
    expect(main(['--plan', r.f, ...r.args])).toBe(1);
    const o = exec(t, FIT, '--kit-optional');
    expect(o.code).toBe(0);
    expect(o.out).toContain('NOTE kit: build-own table');
    expect(o.out).not.toContain('PROBLEM');
    expect(main(['--plan', o.f, ...o.args])).toBe(0);
  });
  it('an old plan with no reuse map fails every kit part until --kit-optional', () => {
    const old = PLAN.replace('\nSC-01\n', '\nSC-01, SC-02\n');
    const r = exec(old);
    expect(r.code).toBe(1);
    for (const w of ["no heading contains 'Reuse map'", 'the reuse map has no game sheet table', 'the reuse map has no build-own table']) expect(r.out).toContain(`PROBLEM kit: ${w}`);
    expect(exec(old, FIT, '--kit-optional').code).toBe(0);
  });
  it('a folder lacking components/ and kit.mjs is no kit: the NOTE says the Pull rows were not checked', () => {
    const r = exec(GOOD, FIT, '--kit', join(kit, 'docs'));
    expect(r.out).toContain('NOTE kit: Pull rows NOT checked (no kit checkout)');
    expect(r.code).toBe(0);
  });
  describe("K568: no kit checkout, the game's locked copy kit/ (kit.lock.json) checks the Pull rows", () => {
    const none = ['--kit', join(kit, 'docs')];
    const locked = (ref: string, catalog: boolean) => (k: string): void => {
      for (const c of ['engine-core', 'card-language']) {
        mkdirSync(join(k, c), { recursive: true });
        writeFileSync(join(k, c, 'component.json'), '{}');
      }
      writeFileSync(join(k, 'kit.lock.json'), JSON.stringify({ ref, commit: 'abc', components: { 'engine-core': { files: {} }, 'card-language': { files: {} } } }));
      if (catalog) writeFileSync(join(k, 'CATALOG.md'), '| Component | Use it when |\n|---|---|\n| [`board-model`](#board-model) | spaces |\n| [`engine-core`](#engine-core) | rules |\n');
    };
    const withLock = (setup: ((k: string) => void) | null, text: string, ...extra: string[]) => {
      lockKit = setup;
      try { return exec(text, FIT, ...extra); } finally { lockKit = null; }
    };
    const kp = (out: string): string[] => out.split(/\r?\n/).filter((l) => l.startsWith('PROBLEM kit:')).sort();
    it('K568 a Pull row naming a part the locked copy and its tag lack: the same problem lines as a kit checkout', () => {
      const bad = GOOD.replace('`engine-core` (', '`engine-core`, `dice-oddz` (').replace('| `board-model`, `grid-map` |', '| `dice-tray` |');
      const want = kp(exec(bad).out);
      expect(want).toEqual(["PROBLEM kit: reuse map: Pull row 'Map' names no kit part of v0.227.1", "PROBLEM kit: reuse map: `dice-oddz` (row 'Kernel') is no kit part at v0.227.1", "PROBLEM kit: reuse map: `dice-tray` (row 'Map') is no kit part at v0.227.1"].sort());
      const r = withLock(locked('v0.227.1', true), bad, ...none);
      expect(kp(r.out)).toEqual(want);
      expect(r.code).toBe(1);
    });
    it('K568 a good plan passes against the locked copy (a part not pulled counts when CATALOG.md lists it); the NOTE names the locked copy', () => {
      const r = withLock(locked('v0.227.1', true), GOOD, ...none);
      expect(r.out).not.toContain('PROBLEM');
      expect(r.out).toMatch(/NOTE kit: Pull rows checked against the locked copy \S*kit at v0\.227\.1 \(no kit checkout/);
      expect(r.code).toBe(0);
      expect(kp(withLock(locked('v0.227.1', false), GOOD, ...none).out)).toEqual(["PROBLEM kit: reuse map: `board-model` (row 'Map') is no kit part at v0.227.1"]);
    });
    it('K568 the plan pins another tag than the lock: a NOTE says so and the rows are still checked', () => {
      const r = withLock(locked('v0.230.0', true), GOOD.replace('`engine-core` (', '`engine-core`, `dice-oddz` ('), ...none);
      expect(r.out).toContain('NOTE kit: the plan pins v0.227.1 but');
      expect(r.out).toContain('holds v0.230.0: Pull rows checked against the locked copy');
      expect(kp(r.out)).toEqual(["PROBLEM kit: reuse map: `dice-oddz` (row 'Kernel') is no kit part at v0.230.0"]);
      expect(r.code).toBe(1);
    });
    it("K568 a kit/ without kit.lock.json and no checkout: today's NOTE; no drive path in the script", () => {
      const r = withLock((k) => mkdirSync(join(k, 'engine-core'), { recursive: true }), GOOD, ...none);
      expect(r.out).toContain('NOTE kit: Pull rows NOT checked (no kit checkout)');
      expect(r.code).toBe(0);
      expect(readFileSync(new URL('./plancheck.py', import.meta.url), 'utf-8')).not.toMatch(/[A-Z]:\/projects/);
    });
  });
  it('a tag the kit lacks: the NOTE says to fetch tags', () => {
    const r = exec(GOOD.replace('tag v0.227.1', 'tag v0.999.0'));
    expect(r.out).toContain('tag v0.999.0 not in');
    expect(r.code).toBe(0);
  });

  describe('K584: the game sheet is one row per question; the mechanics map under each question, closed candidates', () => {
    const under = (i: number, n: number, from = 0): string => Array.from({ length: n }, (_, j) => (i % 4 === 3 ? `| q${i} gap ${from + j}, other words | not in the kit (candidate K9${i}) |\n` : `| q${i} thing ${from + j}, other words | \`player-board\`: read its README |\n`)).join('');
    const HEAD = '\n| Mechanic | Answer |\n|---|---|\n';
    const MAP = '# Mechanics map\n\nGenerated.\n' + L.map((t, i) => `\n## ${t}\n${HEAD}${under(i, i === 5 ? 10 : 5)}`).join('');
    const run = (map: string | null, text: string, ...extra: string[]) => {
      mapText = map;
      try { return exec(text, FIT, ...extra); } finally { mapText = null; }
    };
    const warns = (out: string): string[] => out.split(/\r?\n/).filter((l) => l.startsWith('NOTE WARN kit:'));
    const NO_DICE = GOOD.replace('| Dice | one hero | `player-board` |\n', '');
    it('K584 the fixture map has 115 lines and the fixture sheet 22 rows', () => {
      expect(MAP.split('\n').filter((l) => /^\| q\d/.test(l))).toHaveLength(115);
      expect(SHEET.split('\n').filter((l) => l.startsWith('| ')).length - 1).toBe(22);
      expect(NO_DICE).not.toBe(GOOD);
    });
    it('K584 a sheet with 22 answered questions passes with a map of 115 lines, exit 0, no warning', () => {
      const r = run(MAP, GOOD);
      expect(r.out).not.toContain('PROBLEM');
      expect(r.out).toContain('NOTE kit: game sheet checked against the mechanics map');
      expect(r.out).toContain('(115 lines under 22 questions)');
      expect(warns(r.out)).toEqual([]);
      expect(r.code).toBe(0);
      expect(main(['--plan', r.f, ...r.args])).toBe(0);
    });
    it('K584 a missing question fails naming it, with the map, without it and under --sheet-optional', () => {
      const r = run(MAP, NO_DICE);
      expect(r.out.split(/\r?\n/).filter((l) => l.startsWith('PROBLEM'))).toEqual(["PROBLEM kit: game sheet: no row for the line 'dice'"]);
      expect(r.code).toBe(1);
      expect(main(['--plan', r.f, ...r.args])).toBe(1);
      for (const x of [run(null, NO_DICE), run(MAP, NO_DICE, '--sheet-optional')]) {
        expect(x.out).toContain("PROBLEM kit: game sheet: no row for the line 'dice'");
        expect(x.code).toBe(1);
      }
    });
    it('K584 a new map line does not fail the plan', () => {
      const r = run(MAP + under(21, 1, 5) + '\n## A question of a later kit\n' + HEAD + '| brand new mechanic | `new-part`: read its README |\n', GOOD);
      expect(r.out).toContain('(117 lines under 22 questions)');
      expect(r.out).not.toContain('PROBLEM');
      expect(warns(r.out)).toEqual([]);
      expect(r.code).toBe(0);
    });
    it('K584 build-own over a built line: a warning naming the lines, exit 0', () => {
      const r = run(MAP, GOOD.replace('| Positions | one hero | `player-board` |', '| Positions | one hero | build-own: Walled grid |'));
      expect(warns(r.out)).toEqual(["NOTE WARN kit: game sheet line 'Positions' answers build-own, and the mechanics map has built lines under that question: q6 thing 0, q6 thing 1, q6 thing 2, q6 thing 3, q6 thing 4"]);
      expect(r.out).not.toContain('PROBLEM');
      expect(r.code).toBe(0);
    });
    it('K584 "not in this game" over a built line warns too; a part named beside build-own does not', () => {
      const r = run(MAP, GOOD.replace('| Positions | one hero | `player-board` |', '| Positions | not in this game | |'));
      expect(warns(r.out)).toEqual(["NOTE WARN kit: game sheet line 'Positions' answers not in this game, and the mechanics map has built lines under that question: q6 thing 0, q6 thing 1, q6 thing 2, q6 thing 3, q6 thing 4"]);
      expect(r.code).toBe(0);
      expect(warns(run(MAP, GOOD.replace('| Positions | one hero | `player-board` |', '| Positions | one hero | `player-board` and build-own: Walled grid |')).out)).toEqual([]);
    });
    it('K584 poor: no built line under the question, no warning; a partly line counts as built, a pending one does not', () => {
      const phase = MAP.split('\n').filter((l) => l.startsWith('| q3 gap'));
      expect(phase).toHaveLength(5);
      expect(GOOD).toContain('| The phase list | not in this game |');
      expect(warns(run(MAP, GOOD).out)).toEqual([]);
      expect(warns(run(MAP.replace(phase[0]!, '| soon, later | `ghost` (pending: K900) |'), GOOD).out)).toEqual([]);
      expect(warns(run(MAP.replace(phase[0]!, '| half built, other | partly: `turn-flow`: read x; missing: y |'), GOOD).out)).toEqual(["NOTE WARN kit: game sheet line 'The phase list' answers not in this game, and the mechanics map has built lines under that question: half built"]);
    });
    it('K584 a kit part no map line under the question names: a warning, exit 0', () => {
      const r = run(MAP, GOOD.replace('| Positions | one hero | `player-board` |', '| Positions | one hero | `automa` |'));
      expect(warns(r.out)).toEqual(["NOTE WARN kit: game sheet line 'Positions' names kit part automa, which no mechanics map line under that question names"]);
      expect(r.code).toBe(0);
    });
    it('K584 the missing question is a NOTE under --kit-optional, exit 0', () => {
      const r = run(MAP, NO_DICE, '--kit-optional');
      expect(r.out).toContain("NOTE kit: game sheet: no row for the line 'dice'");
      expect(r.out).not.toContain('PROBLEM');
      expect(r.code).toBe(0);
    });
    it('K584 map read from --map PATH', () => {
      const m = join(tmp('pc-map-'), 'm.md');
      writeFileSync(m, MAP, 'utf-8');
      const r = run(null, GOOD.replace('| Positions | one hero | `player-board` |', '| Positions | one hero | `automa` |'), '--map', m);
      expect(warns(r.out)).toHaveLength(1);
      expect(r.out).toContain('(115 lines under 22 questions)');
      expect(r.code).toBe(0);
    });
    it('K584 no map file: a NOTE, exit 0', () => {
      const r = run(null, GOOD);
      expect(r.out).toContain('NOTE kit: game sheet NOT checked against the mechanics map');
      expect(r.out).not.toContain('PROBLEM');
      expect(r.code).toBe(0);
    });
    it('K584 --sheet-optional: the map is not read, the warnings are gone', () => {
      const bad = GOOD.replace('| Positions | one hero | `player-board` |', '| Positions | one hero | `automa` |');
      const r = run(MAP, bad, '--sheet-optional');
      expect(r.out).not.toContain('mechanics map');
      expect(r.code).toBe(0);
      expect(run(MAP, bad).out).toContain('mechanics map');
    });
    it('K584 a map with no question headings (an older kit): a NOTE, nothing compared, exit 0', () => {
      const r = run('# Mechanics map\n' + HEAD + '| roll dice, die | `dice-tray`: read its README |\n| market | `market-row`: read its README |\n', GOOD);
      expect(r.out).toContain('groups no line under a game sheet question');
      expect(r.out).toContain('its 2 lines were not compared');
      expect(warns(r.out)).toEqual([]);
      expect(r.out).not.toContain('PROBLEM');
      expect(r.code).toBe(0);
    });
    it('K584 no game sheet table: one warning line beside the missing-table problem', () => {
      const r = run(MAP, GOOD.replace('| Game sheet line |', '| Sheet line |'));
      expect(warns(r.out).filter((l) => l.includes('mechanics map'))).toHaveLength(1);
      expect(r.out).toContain('PROBLEM kit: the reuse map has no game sheet table');
      expect(r.code).toBe(1);
    });
    it('K584 the repository map: 22 questions, each a heading the checker knows, every line under one', () => {
      const real = readFileSync(join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))), 'docs', 'recipes', 'mechanics.md'), 'utf-8');
      expect(real.split(/\r?\n/).filter((l) => l.startsWith('## ')).map((l) => l.slice(3))).toEqual(L);
      const r = run(real, GOOD);
      const n = real.split(/\r?\n/).filter((l) => l.startsWith('| ') && !l.startsWith('| Mechanic')).length;
      expect(n).toBeGreaterThan(100);
      expect(r.out).toContain(`(${n} lines under 22 questions)`);
      expect(r.out).not.toContain('PROBLEM');
      expect(r.code).toBe(0);
    });
    const kit2 = (mech: boolean, state: string): string => {
      const k = tmp('kit531-');
      mkdirSync(join(k, 'docs', 'plan'), { recursive: true });
      mkdirSync(join(k, 'components', 'engine-core'), { recursive: true });
      writeFileSync(join(k, 'docs', 'PLAN.md'), '| # | Batch | Size | State |\n|---|---|---|---|\n');
      writeFileSync(join(k, 'kit.mjs'), '');
      writeFileSync(join(k, 'docs', 'plan', 'K424.md'), `---\nsection: Candidates\nstate: ${state}\n---\n\`sim-pool\` greedy driver with a look-ahead.\n`);
      if (mech) writeFileSync(join(k, 'docs', 'mechanics.json'), JSON.stringify({ lines: [{ words: 'greedy', part: 'greedy-driver', row: 'K424' }] }));
      return k;
    };
    it('K531 closed candidate named: a warning with the part from the mechanics line, exit 0', () => {
      const r = exec(GOOD, FIT, '--kit', kit2(true, 'done'));
      expect(warns(r.out)).toEqual(["NOTE WARN kit: build-own row 'Greedy player' names candidate K424, which the kit closed (state: done): use `greedy-driver`"]);
      expect(r.code).toBe(0);
    });
    it('K531 closed candidate with no mechanics line: the part from the row text', () => {
      expect(warns(exec(GOOD, FIT, '--kit', kit2(false, 'done')).out)).toEqual(["NOTE WARN kit: build-own row 'Greedy player' names candidate K424, which the kit closed (state: done): use `sim-pool`"]);
    });
    it('K531 poor: an open candidate gets no closed warning', () => {
      expect(warns(exec(GOOD, FIT, '--kit', kit2(true, 'candidate')).out)).toEqual([]);
    });
  });
});
