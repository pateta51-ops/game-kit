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
const mfJson = (drop: string[]) => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'components/motion-frame/component.json'), 'utf8')) as { bypass: { id: string }[] };
  j.bypass = j.bypass.filter((p) => !drop.includes(p.id));
  return JSON.stringify(j);
};
const check = (files: Record<string, string>, drop: string[] = []) => {
  const g = path.join(tmp, 'game' + String(++n));
  fs.mkdirSync(g);
  let from = src;
  let tag = 'b1';
  if (drop.length) {
    from = path.join(tmp, 'src' + String(n));
    tag = 'b2';
    fs.mkdirSync(from);
    git(from, 'init', '-q');
    git(from, 'config', 'core.autocrlf', 'false');
    fs.copyFileSync(path.join(ROOT, 'kit.mjs'), path.join(from, 'kit.mjs'));
    put(path.join(from, 'components/motion-frame/component.json'), mfJson(drop));
    git(from, 'add', '-A');
    git(from, 'commit', '-qm', 'b2');
    git(from, 'tag', '-a', 'b2', '-m', 'b2');
  }
  expect(spawnSync('node', [path.join(from, 'kit.mjs'), 'pull', from, tag, 'motion-frame'], { cwd: g, encoding: 'utf8' }).status).toBe(0);
  for (const [f, s] of Object.entries(files)) put(path.join(g, f), s);
  return spawnSync('node', [path.join(g, 'kit/kit.mjs'), 'check'], { cwd: g, encoding: 'utf8' });
};
const MF = "import { createMotionPlayer, skipOnInput } from '../kit/motion-frame/index.ts';\n";
const hits = (s: string) => s.split('\n').filter((l) => /^src\/\S+:\d+ /.test(l));
const TIMER = MF + 'export function go(release: () => void, next: () => void) {\n  setTimeout(release, 800);\n  const t = setInterval(() => next(), 500);\n  return t;\n}\n';
const LISTEN =
  MF +
  'export function wire(p: { skipAll(): void; hurry(): void }) {\n' +
  "  window.addEventListener('keydown', () => { p.skipAll(); });\n" +
  "  document.addEventListener('pointerdown', (e) => p.hurry());\n" +
  '  return <div onPointerDown={() => { p.skipAll(); }} />;\n}\n';

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-k689-'));
  src = path.join(tmp, 'src');
  fs.mkdirSync(src);
  git(src, 'init', '-q');
  git(src, 'config', 'core.autocrlf', 'false');
  fs.copyFileSync(path.join(ROOT, 'kit.mjs'), path.join(src, 'kit.mjs'));
  put(path.join(src, 'components/motion-frame/component.json'), fs.readFileSync(path.join(ROOT, 'components/motion-frame/component.json'), 'utf8'));
  git(src, 'add', '-A');
  git(src, 'commit', '-qm', 'b1');
  git(src, 'tag', '-a', 'b1', '-m', 'b1');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('K689: kit check fails game-side holds, timers and input wrappers around motion-frame', () => {
  it('K689: a setTimeout / setInterval that releases or continues fails with holdUntil / autoContinueMs', () => {
    const c = check({ 'src/hold.ts': TIMER });
    expect(c.status).toBe(1);
    expect(c.stderr).toContain('src/hold.ts:3 hold-on-timer (motion-frame): a beat waits and a hold auto-continues in the motion player: holdUntil to wait, autoContinueMs to continue on its own');
    expect(hits(c.stderr).map((l) => l.split(' ')[0])).toEqual(['src/hold.ts:3', 'src/hold.ts:4']);
  });

  it('K689: skipAll / hurry from a keydown, pointerdown or onPointerDown handler fails with skipOnInput / hurryOnInput', () => {
    const c = check({ 'src/in.tsx': LISTEN });
    expect(c.status).toBe(1);
    expect(c.stderr).toContain('src/in.tsx:3 skip-from-own-listener (motion-frame): an input that skips or hurries beats is bound with skipOnInput / hurryOnInput');
    expect(hits(c.stderr).map((l) => l.split(' ')[0])).toEqual(['src/in.tsx:3', 'src/in.tsx:4', 'src/in.tsx:5']);
  });

  it('K689: removing either pattern lets its fixture pass', () => {
    expect(check({ 'src/hold.ts': TIMER }, ['hold-on-timer']).status).toBe(0);
    expect(check({ 'src/in.tsx': LISTEN }, ['skip-from-own-listener']).status).toBe(0);
  });

  it('K689: holdUntil, autoContinueMs, skipOnInput and unrelated timers pass', () => {
    const c = check({
      'src/ok.ts':
        MF +
        'export function ok(p: ReturnType<typeof createMotionPlayer>, setHint: (s: string) => void, hide: () => void) {\n' +
        "  p.play({ id: 'a', holdUntil: true, autoContinueMs: 2000 } as never);\n" +
        '  const off = skipOnInput(p, window);\n' +
        '  setTimeout(() => setHint(""), 500);\n' +
        '  setTimeout(hide, 300);\n' +
        '  return off;\n}\n',
    });
    expect(c.stderr).toBe('');
    expect(c.status).toBe(0);
  });

  it('K689: a file that does not import motion-frame, and an allow comment with a reason, pass; no reason fails', () => {
    expect(check({ 'src/menu.ts': 'export const later = (next: () => void) => setTimeout(next, 300);\n' }).status).toBe(0);
    const ok = check({ 'src/hold.ts': MF + 'export const h = (next: () => void) => setTimeout(next, 900); // kit-allow hold-on-timer: reading pause, no beat\n' });
    expect(ok.stderr).toBe('');
    const bad = check({ 'src/hold.ts': MF + 'export const h = (next: () => void) => setTimeout(next, 900); // kit-allow hold-on-timer\n' });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('kit-allow hold-on-timer needs a reason');
  });
});
