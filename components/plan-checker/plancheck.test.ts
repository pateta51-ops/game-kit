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
  const run = (text: string, ...flags: string[]): number => main(['--plan', plan(text), ...flags]);
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
    spawnSync(py[0] ?? 'python', [...py.slice(1), fileURLToPath(new URL('./plancheck.py', import.meta.url)), f, '--sessions-optional', ...a], { encoding: 'utf-8' }).stdout;
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
