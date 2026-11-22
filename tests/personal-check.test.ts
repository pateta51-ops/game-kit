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
