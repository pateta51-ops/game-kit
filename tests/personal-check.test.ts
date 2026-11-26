import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve(import.meta.dirname, '..', 'scripts', 'personal-check.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'personal-test-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
const run = (files: Record<string, string>) => {
  const d = fs.mkdtempSync(path.join(root, 'r-'));
  for (const [f, t] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
    fs.writeFileSync(path.join(d, f), t);
  }
  execFileSync('git', ['init', '-q'], { cwd: d });
  execFileSync('git', ['add', '.'], { cwd: d });
  return spawnSync('node', [SCRIPT], { cwd: d, encoding: 'utf8' });
};

describe('personal-check: local drive path', () => {
  it('a private drive path is a hit, value not printed', () => {
    for (const t of ['see C:/projects/_skills/x.md', 'see C:\\projects\\some-game\\src', 'D:/projects/lotr-lcg']) {
      const r = run({ 'docs/a.md': t });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('docs/a.md:1: local drive path');
      expect(r.stderr).not.toContain('some-game');
    }
  });
  it('the generic examples are not hits', () => {
    const r = run({ 'README.md': "kit 'C:/projects/game-kit' and C:/projects/demo and C:\\projects\\x\\.git and C:/projects/<game>/src" });
    expect(r.status).toBe(0);
  });
  it('the registry files are exempt from this rule only', () => {
    const line = '{"repo": "C:/projects/some-game"}';
    expect(run({ 'ports.json': line, 'tools/game-server/boxes.json': line, 'docs/PORTS.md': line }).status).toBe(0);
    expect(run({ 'ports.json': line + ' C:/Users/realperson/x' }).status).toBe(1);
  });
});

it('excludes only the GitHub-generated test merge from commit identity checks', () => {
  const cwd = fs.mkdtempSync(path.join(root, 'merge-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = (email: string, message: string) => git('-c', 'user.name=Kit test', '-c', `user.email=${email}`, 'commit', '--allow-empty', '-qm', message);
  const createMerge = (base: string, source: string) => git('-c', 'user.name=Kit test', '-c', 'user.email=merge@example.test', 'commit-tree', `${source}^{tree}`, '-p', base, '-p', source, '-m', 'Test merge');
  git('init', '-q');
  commit('test@users.noreply.github.com', 'Base');
  const base = git('rev-parse', 'HEAD');
  git('update-ref', 'refs/remotes/origin/main', base);
  const run = (email: string, fakeHead = false) => {
    git('reset', '--hard', base);
    commit(email, 'PR commit');
    const source = git('rev-parse', 'HEAD');
    const merge = createMerge(base, source);
    git('reset', '--hard', merge);
    const event = path.join(cwd, 'event.json');
    fs.writeFileSync(event, JSON.stringify({ pull_request: { number: 42, base: { sha: base }, head: { sha: fakeHead ? base : source } } }));
    const result = spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: event, GITHUB_REF: 'refs/pull/42/merge', GITHUB_SHA: merge } });
    return { result, merge: merge.slice(0, 7), source: source.slice(0, 7) };
  };
  expect(run('test@users.noreply.github.com').result.status).toBe(0);
  const bad = run('author@example.test');
  expect(bad.result.status).toBe(1);
  expect(bad.result.stderr).toContain(`commit ${bad.source}:`);
  expect(bad.result.stderr).not.toContain(`commit ${bad.merge}:`);
  const mismatched = run('test@users.noreply.github.com', true);
  expect(mismatched.result.status).toBe(1);
  expect(mismatched.result.stderr).toContain(`commit ${mismatched.merge}:`);
});
