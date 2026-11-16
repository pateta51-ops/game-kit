import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const KIT = path.dirname(path.dirname(import.meta.dirname));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-'));
const ports = path.join(tmp, 'ports.json');
fs.writeFileSync(ports, JSON.stringify({ games: { demo: { name: 'Demo', block: 6990, serve: { local: 4199 } } } }));
const kitMjs = path.join(KIT, 'kit.mjs');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: KIT, encoding: 'utf8' }).trim();
const nm = path.join(KIT, 'node_modules');
const out = path.join(tmp, 'demo');

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('scaffold (K204)', () => {
  it('needs node_modules (CI has them)', () => {
    expect(fs.existsSync(nm)).toBe(true);
  });

  it('refuses an entry with no phone slot (serve.local)', () => {
    const p2 = path.join(tmp, 'p2.json');
    fs.writeFileSync(p2, JSON.stringify({ games: { bare: { name: 'Bare', block: 6980 } } }));
    const r = spawnSync('node', [kitMjs, 'new', path.join(tmp, 'y'), 'bare', 'Bare', '--ports', p2, '--no-install'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('serve.local');
  });

  it('refuses an id that has no ports.json entry', () => {
    const r = spawnSync('node', [kitMjs, 'new', path.join(tmp, 'x'), 'nope', 'Nope', '--ports', ports], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('server.mjs add');
  });

  it('writes a working game: kit checks, workflows, ports, type-check and smoke test', () => {
    const r = spawnSync('node', [kitMjs, 'new', out, 'demo', 'Demo Game', '--ref', head, '--ports', ports, '--link', nm, '--no-install'], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    const pkg = fs.readFileSync(path.join(out, 'package.json'), 'utf8');
    expect(pkg).toContain('--port 4199');
    expect(fs.readFileSync(path.join(out, 'vite.config.ts'), 'utf8')).toContain('port: 6990');
    expect(fs.readFileSync(path.join(out, 'vite.config.ts'), 'utf8')).toContain('port: 6991');
    expect(fs.existsSync(path.join(out, '.github', 'workflows', 'ci.yml'))).toBe(true);
    const run = (...a: string[]) => spawnSync('node', a, { cwd: out, encoding: 'utf8' });
    expect(run('kit/kit.mjs', 'check').status).toBe(0);
    expect(run('kit/ci-templates/render.mjs', '--check').status).toBe(0);
    const chk = spawnSync('npm', ['run', 'check'], { cwd: out, encoding: 'utf8', shell: true });
    expect(chk.stdout + chk.stderr).toContain('1 passed');
    expect(chk.status, chk.stdout + chk.stderr).toBe(0);
  }, 180_000);

  it('refuses a folder that is not empty', () => {
    const r = spawnSync('node', [kitMjs, 'new', out, 'demo', 'Demo Game', '--ports', ports], { encoding: 'utf8' });
    expect(r.status).toBe(1);
  });
});
