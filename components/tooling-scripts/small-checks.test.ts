import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { headings, run as docs, section } from './docs-index.ts';
import { moveMap, rewrite, run as move } from './move.ts';

const UP = '.' + '.';
const dir = mkdtempSync(join(tmpdir(), 'small-checks-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const lines: string[] = [];
const io = { out: (l: string) => void lines.push(l), err: (l: string) => void lines.push(l) };
const put = (root: string, rel: string, text: string) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};
const repo = (name: string, files: Record<string, string>) => {
  const root = join(dir, name);
  mkdirSync(root);
  for (const [p, t] of Object.entries(files)) put(root, p, t);
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
};

describe('move (K85)', () => {
  const tracked = ['src/a/x.ts', 'src/a/index.ts', 'src/b/y.ts', 'docs/n.md'];
  const all = new Set(tracked);
  it('maps a folder', () => {
    expect([...moveMap(tracked, 'src/a', 'lib/a')]).toEqual([
      ['src/a/x.ts', 'lib/a/x.ts'],
      ['src/a/index.ts', 'lib/a/index.ts'],
    ]);
  });
  it('rewrites an import of a moved file, an index import, and the moved file own imports', () => {
    const moves = moveMap(tracked, 'src/a', 'lib/a');
    expect(rewrite(`import { x } from '${UP}/a/x';`, 'src/b/y.ts', 'src/b/y.ts', moves, all, 'src/a', 'lib/a')).toBe(`import { x } from '${UP}/${UP}/lib/a/x';`);
    expect(rewrite("import a from './a';", 'src/b.ts', 'src/b.ts', moves, new Set([...all, 'src/b.ts']), 'src/a', 'lib/a')).toBe(`import a from '${UP}/lib/a';`);
    expect(rewrite(`import y from '${UP}/b/y';`, 'src/a/x.ts', 'lib/a/x.ts', moves, all, 'src/a', 'lib/a')).toBe(`import y from '${UP}/${UP}/src/b/y';`);
  });
  it('replaces a written-out path but not a longer name', () => {
    const moves = moveMap(tracked, 'docs/n.md', 'docs/m.md');
    expect(rewrite('see docs/n.md and docs/n.md.bak, [l](./n.md)', 'README.md', 'README.md', moves, all, 'docs/n.md', 'docs/m.md')).toBe('see docs/m.md and docs/n.md.bak, [l](./n.md)');
  });
  it('moves files in a repo and rewrites its paths', () => {
    const root = repo('mv', { 'src/a/x.ts': 'export const x = 1;\n', 'src/b.ts': "import { x } from './a/x';\n", 'README.md': 'code in src/a/x.ts\n' });
    lines.length = 0;
    expect(move(['--repo', root, '--from', 'src/a/x.ts', '--to', 'lib/x.ts'], io)).toBe(0);
    expect(existsSync(join(root, 'lib/x.ts'))).toBe(true);
    expect(existsSync(join(root, 'src/a/x.ts'))).toBe(false);
    expect(readFileSync(join(root, 'src/b.ts'), 'utf8')).toBe(`import { x } from '${UP}/lib/x';\n`);
    expect(readFileSync(join(root, 'README.md'), 'utf8')).toBe('code in lib/x.ts\n');
    expect(move(['--repo', root, '--from', 'nothing', '--to', 'z'], io)).toBe(2);
  });
  it('dry run changes nothing', () => {
    const root = repo('dry', { 'a.ts': 'x\n', 'b.md': 'a.ts\n' });
    expect(move(['--repo', root, '--from', 'a.ts', '--to', 'c.ts', '--dry'], io)).toBe(0);
    expect(existsSync(join(root, 'a.ts'))).toBe(true);
    expect(readFileSync(join(root, 'b.md'), 'utf8')).toBe('a.ts\n');
  });
});

describe('docs-index (K85)', () => {
  const md = '# Top\nintro\n## One\nbody 1\n```\n# not a heading\n```\n### Deep\nd\n## Two\nbody 2\n';
  it('lists headings outside code fences', () => {
    expect(headings(md).map((h) => `${String(h.line)}:${h.text}`)).toEqual(['1:Top', '3:One', '8:Deep', '10:Two']);
  });
  it('reads a section up to the next heading of its level, by exact text or by part', () => {
    expect(section(md, 'one')).toBe('## One\nbody 1\n```\n# not a heading\n```\n### Deep\nd');
    expect(section(md, 'tw')).toBe('## Two\nbody 2');
    expect(section(md, 'absent')).toBeNull();
  });
  it('run prints the index of a folder and one section', () => {
    const root = join(dir, 'docs');
    put(root, 'a.md', md);
    put(root, 'sub/b.md', '# B\n### Skipped at depth 2\n');
    lines.length = 0;
    expect(docs(['--dir', root], io)).toBe(0);
    expect(lines).toEqual(['a.md', '  1: # Top', '  3: ## One', '  10: ## Two', 'sub/b.md', '  1: # B']);
    lines.length = 0;
    expect(docs(['--file', join(root, 'a.md'), '--section', 'Two'], io)).toBe(0);
    expect(lines).toEqual(['## Two\nbody 2']);
    expect(docs(['--file', join(root, 'a.md'), '--section', 'zzz'], io)).toBe(1);
    expect(docs([], io)).toBe(2);
  });
});
