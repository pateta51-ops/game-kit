import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..');
let tmp: string;
let src: string;
let n = 0;
const git = (cwd: string, ...a: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd, encoding: 'utf8' });
const put = (f: string, s: string) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, s);
};
const check = (pulled: string[], files: Record<string, unknown>, branch?: Record<string, unknown>) => {
  const g = path.join(tmp, 'game' + String(++n));
  fs.mkdirSync(g);
  expect(spawnSync('node', [path.join(src, 'kit.mjs'), 'pull', src, 'b1', ...pulled], { cwd: g, encoding: 'utf8' }).status).toBe(0);
  for (const [f, s] of Object.entries(files)) put(path.join(g, f), typeof s === 'string' ? s : JSON.stringify(s));
  if (branch) {
    git(g, 'init', '-q', '-b', 'main');
    git(g, 'add', '-A');
    git(g, 'commit', '-qm', 'main');
    git(g, 'switch', '-qc', 'work');
    for (const [f, s] of Object.entries(branch)) put(path.join(g, f), typeof s === 'string' ? s : JSON.stringify(s));
  }
  return spawnSync('node', [path.join(g, 'kit/kit.mjs'), 'check'], { cwd: g, encoding: 'utf8' });
};
const RULES2 = { kit: { rules: 2 } };
const ENGINE = { 'src/engine/rules.ts': "import { effectTasks } from '../../kit/card-language/index.ts';\nexport const tasks = effectTasks;\n" };
const lanes = (...names: string[]) => ({ checkScript: 'check:chain', first: ['test'], lanes: [names] });

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-k786-'));
  src = path.join(tmp, 'src');
  fs.mkdirSync(src);
  git(src, 'init', '-q');
  git(src, 'config', 'core.autocrlf', 'false');
  fs.copyFileSync(path.join(ROOT, 'kit.mjs'), path.join(src, 'kit.mjs'));
  for (const c of ['engine-core', 'plan-checker', 'traceability']) put(path.join(src, 'components', c, 'component.json'), '{}');
  git(src, 'add', '-A');
  git(src, 'commit', '-qm', 'b1');
  git(src, 'tag', '-a', 'b1', '-m', 'b1');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('K786: kit check fails a guard whose game setting is unset', () => {
  it('K786: an engine file importing card-language without cardIdLiteral fails with rules 2, warns without the marker, passes once set', () => {
    const bad = check(['engine-core'], { ...ENGINE, 'package.json': RULES2, 'repo-gate.config.json': { engineFolders: ['src/engine/'], cardIdLiteral: '' } });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('src/engine/rules.ts imports kit/card-language: set "cardIdLiteral"');
    expect(bad.stderr).toContain('repo-gate.config.json');
    const noConfig = check(['engine-core'], { ...ENGINE, 'package.json': RULES2 });
    expect(noConfig.status).toBe(1);
    const warn = check(['engine-core'], { ...ENGINE, 'package.json': {}, 'repo-gate.config.json': {} });
    expect(warn.status).toBe(0);
    expect(warn.stderr).toContain('warning: src/engine/rules.ts imports kit/card-language: set "cardIdLiteral"');
    expect(warn.stdout).toContain('kit ok at b1');
    const ok = check(['engine-core'], { ...ENGINE, 'package.json': RULES2, 'repo-gate.config.json': { cardIdLiteral: '[\'"`]TOOL-[A-Z]+' } });
    expect(ok.stderr).toBe('');
    expect(ok.status).toBe(0);
    const other = check(['engine-core'], { 'src/ui/cards.ts': ENGINE['src/engine/rules.ts'], 'package.json': RULES2, 'repo-gate.config.json': { engineFolders: ['src/engine/'] } });
    expect(other.stderr).toBe('');
    expect(other.status).toBe(0);
    const folder = check(['engine-core'], { 'src/rules/cards.ts': ENGINE['src/engine/rules.ts'], 'package.json': RULES2, 'repo-gate.config.json': { engineFolders: ['src/rules/'] } });
    expect(folder.status).toBe(1);
    expect(folder.stderr).toContain('src/rules/cards.ts imports kit/card-language');
  });

  it('K786: plan-checker pulled with a docs/BUILD_PLAN*.md and no lane running plancheck.py fails with rules 2, warns without the marker, passes once wired', () => {
    const plan = { 'docs/BUILD_PLAN_v2.md': '# Plan\n' };
    const bad = check(['plan-checker'], { ...plan, 'package.json': RULES2 });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('kit/plan-checker is pulled and docs/BUILD_PLAN_v2.md exists: add a script that runs kit/plan-checker/plancheck.py');
    expect(bad.stderr).toContain('scripts/check-runner.config.json');
    const warn = check(['plan-checker'], { ...plan, 'package.json': {} });
    expect(warn.status).toBe(0);
    expect(warn.stderr).toContain('warning: kit/plan-checker is pulled');
    const scripts = { plancheck: 'python kit/plan-checker/plancheck.py docs/BUILD_PLAN_v2.md', 'check:chain': 'npm run test && npm run plancheck', test: 'vitest run' };
    const ok = check(['plan-checker'], { ...plan, 'package.json': { ...RULES2, scripts }, 'scripts/check-runner.config.json': lanes('plancheck') });
    expect(ok.stderr).toBe('');
    expect(ok.status).toBe(0);
    const unused = check(['plan-checker'], { ...plan, 'package.json': { ...RULES2, scripts: { plancheck: scripts.plancheck, 'check:chain': 'npm run test', test: 'vitest run' } }, 'scripts/check-runner.config.json': lanes('lint') });
    expect(unused.status).toBe(1);
    const wrapped = check(['plan-checker'], { ...plan, 'tools/plan.mjs': "spawnSync('python', ['kit/plan-checker/plancheck.py'])\n", 'package.json': { ...RULES2, scripts: { plan: 'node tools/plan.mjs', 'check:chain': 'npm run plan' } }, 'scripts/check-runner.config.json': lanes('plan') });
    expect(wrapped.stderr).toBe('');
    expect(wrapped.status).toBe(0);
    const noPlan = check(['plan-checker'], { 'docs/PLAN.md': '# Plan\n', 'package.json': RULES2 });
    expect(noPlan.stderr).toBe('');
    expect(noPlan.status).toBe(0);
  });

  it('K786: traceability pulled and run by no lane or script fails with rules 2, warns without the marker, passes once wired', () => {
    const bad = check(['traceability'], { 'package.json': RULES2 });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('kit/traceability is pulled: add a script that runs kit/traceability/check-traceability.ts');
    const warn = check(['traceability'], { 'package.json': {} });
    expect(warn.status).toBe(0);
    expect(warn.stderr).toContain('warning: kit/traceability is pulled');
    const none = check(['traceability'], {});
    expect(none.status).toBe(0);
    expect(none.stderr).toContain('warning: kit/traceability is pulled');
    const scripts = { traceability: 'node kit/traceability/check-traceability.ts --strict', 'check:chain': 'npm run traceability' };
    const ok = check(['traceability'], { 'package.json': { ...RULES2, scripts }, 'scripts/check-runner.config.json': lanes('traceability') });
    expect(ok.stderr).toBe('');
    expect(ok.status).toBe(0);
    const bare = check(['traceability'], { 'package.json': { ...RULES2, scripts: { check: 'npm run trace', trace: 'node kit/traceability/check-traceability.ts' } } });
    expect(bare.stderr).toBe('');
    expect(bare.status).toBe(0);
  });

  it('K786: card-language imported only in an engine test passes with rules 2, and fails with engineTests: true', () => {
    const files = { 'src/engine/rules.test.ts': ENGINE['src/engine/rules.ts'], 'src/engine/__tests__/helper.ts': ENGINE['src/engine/rules.ts'], 'package.json': RULES2 };
    const ok = check(['engine-core'], { ...files, 'repo-gate.config.json': {} });
    expect(ok.stderr).toBe('');
    expect(ok.status).toBe(0);
    const tests = check(['engine-core'], { ...files, 'repo-gate.config.json': { engineTests: true } });
    expect(tests.status).toBe(1);
    expect(tests.stderr).toContain('imports kit/card-language: set "cardIdLiteral"');
  });

  it('K786: a repo-gate.config.json that does not parse is named as unreadable: fails with rules 2, warns without the marker', () => {
    const bad = check(['engine-core'], { ...ENGINE, 'package.json': RULES2, 'repo-gate.config.json': '{ "engineFolders": [' });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/^repo-gate\.config\.json could not be read \(.+\): fix it/m);
    expect(bad.stderr).not.toContain('cardIdLiteral" (');
    const warn = check(['engine-core'], { ...ENGINE, 'package.json': {}, 'repo-gate.config.json': 'nope' });
    expect(warn.status).toBe(0);
    expect(warn.stderr).toMatch(/^warning: repo-gate\.config\.json could not be read \(.+\): fix it/m);
    expect(warn.stderr.trim().split('\n')).toHaveLength(1);
  });

  it('K786: backslashes in engineFolders and in a script command read as forward slashes', () => {
    const folder = check(['engine-core'], { 'src/rules/cards.ts': ENGINE['src/engine/rules.ts'], 'package.json': RULES2, 'repo-gate.config.json': { engineFolders: ['.\\src\\rules\\'] } });
    expect(folder.status).toBe(1);
    expect(folder.stderr).toContain('src/rules/cards.ts imports kit/card-language');
    const script = check(['traceability'], { 'package.json': { ...RULES2, scripts: { trace: 'node kit\\traceability\\check-traceability.ts' } } });
    expect(script.stderr).toBe('');
    expect(script.status).toBe(0);
    const file = check(['traceability'], { 'tools/trace.mjs': "import '../kit/traceability/check-traceability.ts'\n", 'package.json': { ...RULES2, scripts: { trace: 'node tools\\trace.mjs' } } });
    expect(file.stderr).toBe('');
    expect(file.status).toBe(0);
  });

  it('K786: kit.rules lowered on a branch fails naming the old value; raised, equal or outside git is unchanged', () => {
    const lowered = check(['traceability'], { 'package.json': RULES2 }, { 'package.json': {} });
    expect(lowered.status).toBe(1);
    expect(lowered.stderr).toContain('kit.rules lowered from 2: restore it in package.json');
    expect(lowered.stderr).toContain('kit/traceability is pulled');
    const clean = check(['engine-core'], { 'package.json': RULES2 }, { 'package.json': { kit: { rules: 1 } } });
    expect(clean.status).toBe(1);
    expect(clean.stderr).toContain('kit.rules lowered from 2: restore it in package.json');
    const raised = check(['traceability'], { 'package.json': {} }, { 'package.json': RULES2 });
    expect(raised.status).toBe(1);
    expect(raised.stderr).not.toContain('lowered');
    const equal = check(['engine-core'], { 'package.json': RULES2 }, { 'src/a.ts': 'export const a = 1;\n' });
    expect(equal.stderr).toBe('');
    expect(equal.status).toBe(0);
    const never = check(['traceability'], { 'package.json': {} }, { 'src/a.ts': 'export const a = 1;\n' });
    expect(never.status).toBe(0);
    expect(never.stderr).toContain('warning: kit/traceability is pulled');
    expect(never.stderr).not.toContain('lowered');
    const noGit = check(['traceability'], { 'package.json': {} });
    expect(noGit.status).toBe(0);
    expect(noGit.stderr).not.toContain('lowered');
  });

  it('K786: a game with none of the three parts in use is unchanged, with or without the marker', () => {
    for (const pkg of [{}, RULES2]) {
      const c = check(['engine-core'], { 'src/engine/rules.ts': 'export const a = 1;\n', 'package.json': pkg });
      expect(c.stderr).toBe('');
      expect(c.status).toBe(0);
      expect(c.stdout).toContain('kit ok at b1');
    }
  });
});
