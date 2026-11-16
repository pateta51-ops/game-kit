import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { newGame } from './newgame.js';

type Call = [string, string[]];
function rig(opts: { have?: Set<string>; fail?: string } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'newgame-'));
  const kit = path.join(tmp, 'kit');
  fs.mkdirSync(kit);
  fs.writeFileSync(path.join(kit, 'ports.json'), JSON.stringify({ games: {} }));
  const calls: Call[] = [];
  const have = opts.have ?? new Set<string>();
  const exec = (cmd: string, args: string[]) => {
    const k = cmd + ' ' + args.slice(0, 2).join(' ');
    calls.push([cmd, args]);
    if (opts.fail && k.startsWith(opts.fail)) throw new Error('boom');
    if (k.startsWith('gh api')) return 'me\n';
    if (k.startsWith('git rev-parse') && !have.has('commit')) throw new Error('no HEAD');
    if (k.startsWith('git remote') && !have.has('remote')) throw new Error('no origin');
    if (k.startsWith('gh repo view')) return have.has('dbom') ? 'true\n' : 'false\n';
    return '';
  };
  const scaffold = (o: { dir: string }) => { fs.mkdirSync(o.dir, { recursive: true }); fs.writeFileSync(path.join(o.dir, 'package.json'), '{}'); };
  const go = (extra = {}) => newGame({ dir: path.join(tmp, 'g'), id: 'g', name: 'G', kit, exec, scaffold, log: () => {}, ...extra });
  return { calls, go, tmp };
}
const names = (c: Call[]) => c.map(([a, b]) => (a === 'node' ? 'node' : a + ' ' + b.slice(0, 2).join(' ')));

describe('kit.mjs new (K214)', () => {
  it('runs ports, owner, git init, commit, private repo create, edit in order', () => {
    const r = rig();
    r.go();
    expect(names(r.calls)).toEqual(['node', 'gh api user', 'git init -q', 'git rev-parse --verify', 'git add -A', 'git commit -q', 'git remote get-url', 'gh repo create', 'gh repo view', 'gh repo edit']);
    expect(r.calls[0]![1].slice(1, 3)).toEqual(['add', 'g']);
    const create = r.calls.find(([, a]) => a[1] === 'create')![1];
    expect(create).toContain('--private');
    expect(create[2]).toBe('me/g');
    expect(r.calls.at(-1)![1]).toContain('--delete-branch-on-merge');
  });
  it('re-run skips what is done', () => {
    const r = rig({ have: new Set(['commit', 'remote', 'dbom']) });
    fs.mkdirSync(path.join(r.tmp, 'g/.git'), { recursive: true });
    fs.writeFileSync(path.join(r.tmp, 'g/package.json'), '{}');
    fs.writeFileSync(path.join(r.tmp, 'kit/ports.json'), JSON.stringify({ games: { g: {} } }));
    const out = r.go();
    expect(out.filter((l) => l.includes('skipped')).length).toBe(6);
    expect(names(r.calls).some((c) => c.startsWith('git add') || c.startsWith('gh repo create') || c.startsWith('gh repo edit'))).toBe(false);
  });
  it('keeps an existing package.json byte for byte, and removes the temp one when add fails', () => {
    const r = rig();
    fs.mkdirSync(path.join(r.tmp, 'g'));
    fs.writeFileSync(path.join(r.tmp, 'g/package.json'), '{"name":"mine"}\n');
    r.go({ remote: false, scaffold: () => undefined });
    expect(fs.readFileSync(path.join(r.tmp, 'g/package.json'), 'utf8')).toBe('{"name":"mine"}\n');
    const q = rig({ fail: 'node' });
    expect(() => q.go()).toThrow('step "ports" failed');
    expect(fs.existsSync(path.join(q.tmp, 'g/package.json'))).toBe(false);
  });
  it('a half-built folder is redone, not skipped', () => {
    const r = rig();
    fs.mkdirSync(path.join(r.tmp, 'g'));
    fs.writeFileSync(path.join(r.tmp, 'g/package.json'), '{}');
    fs.writeFileSync(path.join(r.tmp, 'g/.kit-new-partial'), '');
    let n = 0;
    const out = r.go({ scaffold: (o: { dir: string }) => { n++; fs.mkdirSync(o.dir, { recursive: true }); fs.writeFileSync(path.join(o.dir, 'x'), ''); } });
    expect(n).toBe(1);
    expect(out.some((l) => l.startsWith('files: skipped'))).toBe(false);
    expect(fs.existsSync(path.join(r.tmp, 'g/package.json'))).toBe(false);
  });
  it('--no-remote stops after the files', () => {
    const r = rig();
    r.go({ remote: false });
    expect(names(r.calls)).toEqual(['node']);
  });
  it('a failure stops and names the step', () => {
    const r = rig({ fail: 'git commit' });
    expect(() => r.go()).toThrow('step "first commit" failed: boom');
    expect(names(r.calls).some((c) => c.startsWith('gh repo create'))).toBe(false);
  });
  it('--existing (K221): scaffolds into a repo with .git and origin, writes no markers, commits nothing, creates no repo, still sets delete-branch-on-merge', () => {
    const r = rig({ have: new Set(['commit', 'remote']) });
    fs.mkdirSync(path.join(r.tmp, 'g/.git'), { recursive: true });
    fs.writeFileSync(path.join(r.tmp, 'g/README.md'), 'mine');
    let seen: Record<string, unknown> = {};
    r.go({ existing: true, scaffold: (o: Record<string, unknown>) => { seen = o; } });
    expect(seen.existing).toBe(true);
    expect(fs.readdirSync(path.join(r.tmp, 'g')).sort()).toEqual(['.git', 'README.md']);
    const n = names(r.calls);
    expect(n.some((c) => c.startsWith('git add') || c.startsWith('git init') || c.startsWith('gh repo create'))).toBe(false);
    expect(n).toContain('node');
    expect(r.calls.at(-1)![1]).toContain('--delete-branch-on-merge');
  });
  it('--existing without a commit still does not commit', () => {
    const r = rig();
    fs.mkdirSync(path.join(r.tmp, 'g/.git'), { recursive: true });
    r.go({ existing: true, scaffold: () => undefined });
    expect(names(r.calls).some((c) => c.startsWith('git add') || c.startsWith('git commit'))).toBe(false);
  });
  it('--existing refuses, listing every file it would overwrite, and writes nothing', async () => {
    const { scaffold } = await import('./scaffold.js');
    const r = rig();
    const dir = path.join(r.tmp, 'g');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'package.json'), 'mine');
    fs.writeFileSync(path.join(dir, '.gitignore'), 'mine');
    fs.writeFileSync(path.join(r.tmp, 'kit/ports.json'), JSON.stringify({ games: { g: { block: 6000, serve: { local: 4100 } } } }));
    expect(() => scaffold({ dir, id: 'g', name: 'G', kit: path.join(r.tmp, 'kit'), existing: true, ref: 'v0' })).toThrow(/(package.json.*.gitignore|.gitignore.*package.json)/);
    expect(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).toBe('mine');
    expect(fs.readdirSync(dir).sort()).toEqual(['.gitignore', 'package.json']);
  });
  it('commit trailer: default, custom, or none (K221)', () => {
    const msg = (extra = {}) => { const r = rig(); r.go(extra); return r.calls.find(([, a]) => a[0] === 'commit')![1].at(-1)!; };
    expect(msg()).toContain('Co-Authored-By: Claude Sonnet 5.5');
    expect(msg({ trailer: 'Co-Authored-By: X <x@y>' })).toContain('Co-Authored-By: X <x@y>');
    expect(msg({ trailer: '' })).toBe('Start G from game-kit');
  });
  it('the template ignores the marker files and .cache, and the runner label defaults to the id (K221)', () => {
    const t = path.join(import.meta.dirname, 'template');
    expect(fs.readFileSync(path.join(t, 'ignorefile.tpl'), 'utf8')).toContain('.kit-new-*');
    expect(fs.readFileSync(path.join(t, 'ignorefile.tpl'), 'utf8')).toContain('.cache/');
    expect(fs.readFileSync(path.join(import.meta.dirname, 'scaffold.js'), 'utf8')).toContain('runner: o.runner ?? o.id');
  });
  it('--existing refuses on a present .github/workflows/ci.yml, before ports, writing nothing (K221)', () => {
    const r = rig();
    const dir = path.join(r.tmp, 'g');
    fs.mkdirSync(path.join(dir, '.github/workflows'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.github/workflows/ci.yml'), 'mine');
    expect(() => r.go({ existing: true })).toThrow('ci.yml');
    expect(r.calls).toEqual([]);
    expect(fs.readFileSync(path.join(dir, '.github/workflows/ci.yml'), 'utf8')).toBe('mine');
    expect(fs.readdirSync(dir)).toEqual(['.github']);
  });
});
