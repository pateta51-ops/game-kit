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
  it('a tag the kit lacks: the NOTE says to fetch tags', () => {
    const r = exec(GOOD.replace('tag v0.227.1', 'tag v0.999.0'));
    expect(r.out).toContain('tag v0.999.0 not in');
    expect(r.code).toBe(0);
  });

  describe('K531: the game sheet against the mechanics map, closed candidates', () => {
    const MAP = '# Mechanics map\n\n| Mechanic | Answer |\n|---|---|\n| roll dice, die, reroll | `dice-tray`: read its README |\n| market, buy from a line of cards | `market-row`: read its README |\n';
    const FULL = GOOD.replace('| Markets and rows |', '| Roll dice | kit part | `dice-tray` |\n| Market | not in this game | |\n| Markets and rows |');
    const run = (map: string | null, text: string, ...extra: string[]) => {
      mapText = map;
      try { return exec(text, FIT, ...extra); } finally { mapText = null; }
    };
    const warns = (out: string): string[] => out.split(/\r?\n/).filter((l) => l.startsWith('NOTE WARN kit:'));
    it('K531 sheet complete: every map line answered, exit 0', () => {
      const r = run(MAP, FULL);
      expect(r.out).not.toContain('PROBLEM');
      expect(r.out).toContain('NOTE kit: game sheet checked against the mechanics map');
      expect(r.out).toContain('(2 lines)');
      expect(warns(r.out)).toEqual([]);
      expect(r.code).toBe(0);
    });
    it("K567 with the map checked, the map's lines are the sheet: the older fixed lines are not asked for", () => {
      const cut = FULL.split('\n').filter((l) => !l.startsWith('| Markets and rows |')).join('\n');
      expect(run(MAP, cut).out).not.toContain('no row for the line');
      expect(run(null, cut).out).toContain("PROBLEM kit: game sheet: no row for the line 'markets and rows'");
      expect(run(MAP, cut, '--sheet-optional').out).toContain("PROBLEM kit: game sheet: no row for the line 'markets and rows'");
    });
    it('K531 sheet missing one map line: a failure naming its first words', () => {
      const r = run(MAP, FULL.replace('| Market | not in this game | |\n', ''));
      expect(r.out.split(/\r?\n/).filter((l) => l.startsWith('PROBLEM'))).toEqual(["PROBLEM kit: game sheet: 1 mechanics map line(s) unanswered: market. Each mechanics map line needs its own row in the game sheet table, first cell = the line's first phrase; answer a kit part, a build-own row, or 'not in this game'"]);
      expect(r.code).toBe(1);
      expect(main(['--plan', r.f, ...r.args])).toBe(1);
    });
    it('K531 two lines missing: one failure listing both', () => {
      const r = run(MAP, GOOD);
      const p = r.out.split(/\r?\n/).filter((l) => l.startsWith('PROBLEM'));
      expect(p).toHaveLength(1);
      expect(p[0]).toContain('2 mechanics map line(s) unanswered: roll dice, market.');
      expect(r.code).toBe(1);
    });
    it('K531 a row equal to a longer phrase does not answer the line (equality, not prefix)', () => {
      const r = run(MAP, FULL.replace('| Market | not in this game | |', '| Market stall | not in this game | |'));
      expect(r.out).toContain('1 mechanics map line(s) unanswered: market.');
      expect(r.code).toBe(1);
    });
    it('K531 the sheet failure is a NOTE under --kit-optional, exit 0', () => {
      const r = run(MAP, FULL.replace('| Market | not in this game | |\n', ''), '--kit-optional');
      expect(r.out).toContain('NOTE kit: game sheet: 1 mechanics map line(s) unanswered: market.');
      expect(r.out).not.toContain('PROBLEM');
      expect(r.code).toBe(0);
    });
    it('K531 map read from --map PATH', () => {
      const m = join(tmp('pc-map-'), 'm.md');
      writeFileSync(m, MAP, 'utf-8');
      const r = run(null, FULL.replace('| Roll dice | kit part | `dice-tray` |\n', ''), '--map', m);
      expect(r.out).toContain('PROBLEM kit: game sheet: 1 mechanics map line(s) unanswered: roll dice.');
      expect(r.code).toBe(1);
    });
    it('K531 kit part the map line does not name: a warning, exit 0', () => {
      const r = run(MAP, FULL.replace('| kit part | `dice-tray` |', '| kit part | `player-board` |'));
      expect(warns(r.out)).toEqual(["NOTE WARN kit: game sheet line 'Roll dice' answers kit part player-board, which the mechanics map's line does not name"]);
      expect(r.code).toBe(0);
    });
    it('K531 no map file: no sheet check', () => {
      const r = run(null, GOOD);
      expect(r.out).toContain('NOTE kit: game sheet NOT checked against the mechanics map');
      expect(r.out).not.toContain('PROBLEM');
      expect(r.code).toBe(0);
    });
    it('K531 --sheet-optional: no sheet check', () => {
      const r = run(MAP, GOOD, '--sheet-optional');
      expect(r.out).not.toContain('mechanics map');
      expect(r.code).toBe(0);
      expect(run(MAP, GOOD).code).toBe(1);
    });
    it('K531 no game sheet table: one warning line, no map failure', () => {
      const r = run(MAP, GOOD.replace('| Game sheet line |', '| Sheet line |'));
      expect(warns(r.out).filter((l) => l.includes('mechanics map'))).toHaveLength(1);
      expect(r.out).not.toContain('mechanics map line(s) unanswered');
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
