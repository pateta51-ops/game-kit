// BUILD_PLAN §10.1: npm run plancheck finds a Python 3 (python3 first on Linux, python and the py launcher on Windows).
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { candidates, main } from './plancheck';

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
    const f = join(mkdtempSync(join(tmpdir(), 'plancheck-')), 'PLAN.md');
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
