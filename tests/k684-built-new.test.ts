import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { finish, type Exec } from '../scripts/agent.mjs';

const KIT = path.resolve(import.meta.dirname, '..', 'kit.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'k684-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
const g = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' });
const put = (dir: string, f: string, t = 'x') => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); };
const uiPackage = { scripts: { 'test:e2e': 'playwright test' } };

function game(name: string, files: Record<string, string>, pkg?: object): string {
  const bare = path.join(root, `${name}.git`), main = path.join(root, name);
  g(root, 'init', '-q', '--bare', '-b', 'main', bare);
  g(root, 'clone', '-q', bare, main);
  put(main, 'src/old.ts', 'export const a = 1');
  if (pkg) put(main, 'package.json', JSON.stringify(pkg));
  g(main, 'add', '.');
  g(main, 'commit', '-qm', 'init');
  g(main, 'push', '-q', 'origin', 'HEAD:main');
  g(main, 'switch', '-qc', 'batch');
  for (const [f, t] of Object.entries(files)) put(main, f, t);
  g(main, 'add', '.');
  g(main, 'commit', '-qm', 'work');
  return main;
}
function run(main: string, body: string | null, viaGh = false) {
  const out: string[] = [], sent: string[] = [], gh: string[][] = [];
  const io = { out: (l: string) => void out.push(l), err: (l: string) => void out.push(l) };
  const bf = path.join(root, `${path.basename(main)}-body.md`);
  if (body !== null && !viaGh) fs.writeFileSync(bf, body);
  const exec: Exec = (c, a, input) => c === 'gh' ? (gh.push(a), body === null ? { status: 1, output: 'no pull requests found' } : { status: 0, output: body }) : (sent.push(input), { status: 0, output: 'all good' });
  const rc = finish(['--repo', main, ...(body !== null && !viaGh ? ['--body', bf] : [])], io, exec, false);
  return { rc, text: out.join('\n'), ran: sent.some((s) => s.includes('npm run check')), gh };
}
const ok = '## Built new\n- src/deck/shuffle.ts | search: shuffle a deck; random order cards | nearest: card-zones | why: needs a seeded riffle the zones lack\n\n## Checks\n';

describe('K684 finish: every new src file is listed under Built new', () => {
  it('K684 a new src file and no Built new section fails before any run, naming the file and the line format', () => {
    const main = game('a', { 'src/deck/shuffle.ts': 'export {}' });
    const r = run(main, '## Summary\nstuff\n');
    expect(r.rc).toBe(1);
    expect(r.ran).toBe(false);
    expect(r.text).toMatch(/^FAIL [0-9a-f]{40} /);
    expect(r.text).toContain('no "Built new" section');
    expect(r.text).toContain('missing: src/deck/shuffle.ts');
    expect(r.text).toContain('| search: <words>; <other words> | nearest: <kit part or none> | why:');
  });
  it('K684 a well-formed section passes and the check runs; a folder line covers the files in it', () => {
    const main = game('b', { 'src/cards/deck/shuffle.ts': 'export {}', 'src/cards/deck/cut.ts': 'export {}' });
    const r = run(main, ok.replace('src/deck/shuffle.ts', '`src/cards/deck/`'));
    expect(r.rc).toBe(0);
    expect(r.ran).toBe(true);
    expect(r.text).toMatch(/^PASS [0-9a-f]{40} /);
  });
  it('K684 malformed lines fail: one phrasing, or no reason', () => {
    const main = game('c', { 'src/deck/shuffle.ts': 'export {}' });
    const one = run(main, ok.replace('shuffle a deck; random order cards', 'shuffle a deck'));
    expect(one.rc).toBe(1);
    expect(one.ran).toBe(false);
    expect(one.text).toContain('malformed: - src/deck/shuffle.ts');
    expect(one.text).toContain('two search phrasings');
    const noWhy = run(main, ok.replace(' | why: needs a seeded riffle the zones lack', ''));
    expect(noWhy.rc).toBe(1);
    expect(noWhy.text).toContain('needs why: <reason>');
  });
  it('K684 a modified-only change, a test file and a .d.ts pass with no section; finish behaves as before', () => {
    const main = game('d', { 'src/old.ts': 'export const a = 2', 'src/x.test.ts': '', 'src/tests/h.ts': '', 'src/t.d.ts': '' });
    const r = run(main, '');
    expect(r.rc).toBe(0);
    expect(r.gh).toHaveLength(0);
    expect(r.text).toMatch(/^PASS /);
  });
  it('K684 files matching package.json kit.builtNew.ignore globs pass', () => {
    const main = game('e', { 'src/data/cards.json': '{}', 'src/assets/a/b.png': 'p' }, { kit: { builtNew: { ignore: [{ glob: 'src/data/*.json', why: 'card data' }, { glob: 'src/assets/**', why: 'images' }] } } });
    expect(run(main, '').rc).toBe(0);
    const other = game('f', { 'src/data/cards.ts': '' }, { kit: { builtNew: { ignore: [{ glob: 'src/data/*.json', why: 'card data' }] } } });
    expect(run(other, null).rc).toBe(1);
  });
  it('K684 with no --body it reads the PR body through gh pr view; no PR and no --body fails', () => {
    const main = game('g', { 'src/deck/shuffle.ts': 'export {}' });
    const r = run(main, ok, true);
    expect(r.gh[0]).toEqual(['pr', 'view', 'batch', '--json', 'body', '-q', '.body']);
    expect(r.rc).toBe(0);
    const none = run(main, null);
    expect(none.rc).toBe(1);
    expect(none.text).toContain('pass --body <file>');
  });
  it('K684 a file moved with git mv is not new: passes with no section', () => {
    const main = game('i', { 'notes.md': 'x' }, uiPackage);
    fs.mkdirSync(path.join(main, 'src/ui'));
    g(main, 'mv', 'src/old.ts', 'src/ui/old.ts');
    g(main, 'commit', '-qm', 'move');
    const r = run(main, '');
    expect(r.rc).toBe(0);
    expect(r.gh).toHaveLength(0);
    expect(r.text).toContain('E2E: runs');
  });
  it('K684 a bare src/ line or a one-level folder covers nothing; a folder two levels below src/ does', () => {
    const main = game('j', { 'src/ui/motion/a.ts': '', 'src/ui/motion/b.ts': '' }, uiPackage);
    const line = (p: string) => `## Built new\n- ${p} | search: a b; c d | nearest: none | why: x\n`;
    for (const p of ['src/', 'src', 'ui/', 'src/ui']) {
      const r = run(main, line(p));
      expect(r.rc).toBe(1);
      expect(r.text).toContain('too broad');
      expect(r.text).toContain('missing: src/ui/motion/a.ts');
    }
    expect(run(main, line('src/ui/motion/')).rc).toBe(0);
    expect(run(main, line('ui/motion')).rc).toBe(0);
  });
  it('K684 no merge base with main fails with a clear message and runs nothing', () => {
    const main = path.join(root, 'k');
    fs.mkdirSync(main);
    g(main, 'init', '-q', '-b', 'work');
    put(main, 'src/a.ts');
    g(main, 'add', '.');
    g(main, 'commit', '-qm', 'one');
    const r = run(main, null);
    expect(r.rc).toBe(1);
    expect(r.ran).toBe(false);
    expect(r.text).toMatch(/^FAIL [0-9a-f]{40} .*no merge base with origin\/main or main/);
  });
  it('K684 kit.mjs finish exits 1 on the CLI for a new file without a section', () => {
    const main = game('h', { 'src/a.ts': '' });
    fs.writeFileSync(path.join(root, 'h.md'), 'no section');
    const r = spawnSync('node', [KIT, 'finish', '--body', path.join(root, 'h.md')], { cwd: main, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('missing: src/a.ts');
  });
});
