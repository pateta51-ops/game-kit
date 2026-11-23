import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = path.dirname(path.dirname(import.meta.dirname));
const KIT = path.join(ROOT, 'kit.mjs');
const S = '<!-- kit:worker-rules start -->';
const E = '<!-- kit:worker-rules end -->';
const BLOCK = fs.readFileSync(path.join(ROOT, 'docs/worker-rules.md'), 'utf8');
let tmp: string;
let src: string;
const git = (cwd: string, ...a: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd, encoding: 'utf8' });
const run = (cwd: string, ...a: string[]) => spawnSync('node', [KIT, ...a], { cwd, encoding: 'utf8' });
const between = (t: string) => t.slice(t.indexOf(S), t.indexOf(E) + E.length);
const mk = (name: string, agents: string) => {
  const d = path.join(tmp, name);
  fs.mkdirSync(d);
  fs.writeFileSync(path.join(d, 'AGENTS.md'), agents);
  return d;
};

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-test-'));
  src = path.join(tmp, 'src');
  fs.mkdirSync(path.join(src, 'components/alpha'), { recursive: true });
  fs.mkdirSync(path.join(src, 'docs'));
  git(src, 'init', '-q');
  git(src, 'config', 'core.autocrlf', 'false');
  fs.copyFileSync(KIT, path.join(src, 'kit.mjs'));
  fs.writeFileSync(path.join(src, 'components/alpha/a.txt'), 'one\n');
  git(src, 'add', '-A');
  git(src, 'commit', '-qm', 'v0');
  git(src, 'tag', '-a', 'v0', '-m', 'v0');
  fs.copyFileSync(path.join(ROOT, 'docs/worker-rules.md'), path.join(src, 'docs/worker-rules.md'));
  git(src, 'add', '-A');
  git(src, 'commit', '-qm', 'v1');
  git(src, 'tag', '-a', 'v1', '-m', 'v1');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('worker rules block (K714)', () => {
  it('is about 200 words at most', () => {
    expect(BLOCK.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(220);
  });

  it('pull stamps both games identically between the markers and leaves the rest alone; a second pull changes nothing', () => {
    const own = '# Game A\nPorts 6010.\n';
    const a = mk('a', own + '\n' + S + '\nold hand text\n' + E + '\n\nTail line.\n');
    const b = mk('b', own + 'Tail line.\n');
    for (const d of [a, b]) expect(run(d, 'pull', src, 'v1', 'alpha').status).toBe(0);
    const ta = fs.readFileSync(path.join(a, 'AGENTS.md'), 'utf8');
    const tb = fs.readFileSync(path.join(b, 'AGENTS.md'), 'utf8');
    expect(between(ta)).toBe(between(tb));
    expect(between(ta)).toContain('Kit first.');
    expect(ta).not.toContain('old hand text');
    expect(ta.startsWith(own + '\n' + S)).toBe(true);
    expect(ta.endsWith(E + '\n\nTail line.\n')).toBe(true);
    expect(tb.startsWith(own + 'Tail line.\n')).toBe(true);
    expect(tb).toContain('## Worker rules (from the kit)');
    expect(run(a, 'pull', src, 'v1', 'alpha').status).toBe(0);
    expect(run(b, 'pull', src, 'v1', 'alpha').status).toBe(0);
    expect(fs.readFileSync(path.join(a, 'AGENTS.md'), 'utf8')).toBe(ta);
    expect(fs.readFileSync(path.join(b, 'AGENTS.md'), 'utf8')).toBe(tb);
  });

  it('a CRLF AGENTS.md keeps its text outside the markers byte for byte', () => {
    const before = '# G\r\nPorts 6010.\r\n\r\n';
    const after = '\r\nTail.\r\n';
    const d = mk('crlf', before + S + '\r\nold\r\n' + E + after);
    expect(run(d, 'pull', src, 'v1', 'alpha').status).toBe(0);
    const t = fs.readFileSync(path.join(d, 'AGENTS.md'), 'utf8');
    expect(t.startsWith(before + S)).toBe(true);
    expect(t.endsWith(E + after)).toBe(true);
    expect(t).not.toContain('old');
  });

  it('a failed stamp fails the pull and leaves AGENTS.md and kit/ unchanged', () => {
    const d = path.join(tmp, 'bad');
    fs.mkdirSync(path.join(d, 'AGENTS.md'), { recursive: true });
    const r = run(d, 'pull', src, 'v1', 'alpha');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('not stamped');
    expect(fs.statSync(path.join(d, 'AGENTS.md')).isDirectory()).toBe(true);
    expect(fs.existsSync(path.join(d, 'kit'))).toBe(false);
  });

  it('a ref with no worker rules still pulls', () => {
    const d = mk('old', '# G\n');
    expect(run(d, 'pull', src, 'v0', 'alpha').status).toBe(0);
    expect(fs.readFileSync(path.join(d, 'AGENTS.md'), 'utf8')).toBe('# G\n');
  });

  it('--adopt lists hand-written rules outside the markers; check warns and passes', () => {
    const d = mk('c', '# G\n## Reports\nKeep reports to 150 words.\n## Ports\n- Dev 6010\n');
    expect(run(d, 'pull', src, 'v1', 'alpha').status).toBe(0);
    const r = run(d, 'worker-rules', '--adopt', d);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('150 words');
    expect(r.stdout).not.toContain('Dev 6010');
    expect(r.stdout).not.toContain('Kit first.');
    const c = run(d, 'check');
    expect(c.status).toBe(0);
    expect(c.stderr).toContain('outside the kit markers');
    expect(run(d, 'worker-rules').status).toBe(2);
  });
});
