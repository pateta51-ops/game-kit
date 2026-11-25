import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
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
    const r = spawnSync('node', [kitMjs, 'new', path.join(tmp, 'y'), 'bare', 'Bare', '--ports', p2, '--no-install', '--no-remote'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('serve.local');
  });

  it('refuses an id that has no ports.json entry', () => {
    const r = spawnSync('node', [kitMjs, 'new', path.join(tmp, 'x'), 'nope', 'Nope', '--ports', ports, '--no-remote'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('server.mjs add');
  });

  it('writes a working game: kit checks, workflows, ports, type-check and smoke test', () => {
    const r = spawnSync('node', [kitMjs, 'new', out, 'demo', 'Demo Game', '--ref', head, '--ports', ports, '--link', nm, '--no-install', '--no-remote'], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    const pkg = fs.readFileSync(path.join(out, 'package.json'), 'utf8');
    expect(pkg).toContain('--port 4199');
    expect(fs.readFileSync(path.join(out, 'vite.config.ts'), 'utf8')).toContain('port: 6990');
    expect(fs.readFileSync(path.join(out, 'vite.config.ts'), 'utf8')).toContain('port: 6991');
    expect(fs.existsSync(path.join(out, '.github', 'workflows', 'ci.yml'))).toBe(true);
    expect(pkg).toMatch(/"check:chain": ".*repo-gate.*build.*size"/);
    expect(fs.readFileSync(path.join(out, 'scripts/check-runner.config.json'), 'utf8')).toContain('"repo-gate"');
    expect(fs.existsSync(path.join(out, 'repo-gate.config.json'))).toBe(true);
    expect(fs.readFileSync(path.join(out, 'CLAUDE.md'), 'utf8')).toContain('TODO');
    const cm = fs.readFileSync(path.join(out, 'CLAUDE.md'), 'utf8');
    expect(cm).toContain('kit/kit.lock.json');
    expect(cm).toContain('Use pure kit components such as `defineGame` from `kit/game-store/index.ts`.');
    expect(cm).toContain('The UI imports game engine code through `src/engine/api.ts`.');
    expect(fs.readFileSync(path.join(out, 'src/engine/rules.ts'), 'utf8')).toMatch(/from .*kit\/game-store\/index\.ts/);
    expect(cm).not.toMatch(/\bv?\d+\.\d+\.\d+\b/);
    expect(fs.readFileSync(path.join(out, 'AGENTS.md'), 'utf8')).toContain('<!-- kit:worker-rules start -->');
    const app = fs.readFileSync(path.join(out, 'src/ui/App.tsx'), 'utf8');
    for (const r of ['MainMenu', 'SetupForm', 'SettingsScreen', 'SavesScreen']) expect(app).toContain(r);
    expect(fs.existsSync(path.join(out, 'kit/screens/ui.tsx'))).toBe(true);
    execFileSync('git', ['add', '-A'], { cwd: out });
    expect(execFileSync('git', ['ls-files', '--', 'node_modules'], { cwd: out, encoding: 'utf8' })).toBe('');
    const run = (...a: string[]) => spawnSync('node', a, { cwd: out, encoding: 'utf8' });
    expect(run('kit/kit.mjs', 'check').status).toBe(0);
    expect(run('kit/ci-templates/render.mjs', '--check').status).toBe(0);
    const chk = spawnSync('npm', ['run', 'check'], { cwd: out, encoding: 'utf8', shell: true });
    expect(chk.stdout + chk.stderr).toContain('4 passed');
    expect(chk.status, chk.stdout + chk.stderr).toBe(0);
  }, 180_000);

  it.skipIf(!process.env['PW_CHROMIUM_PATH'] && !fs.existsSync(chromium.executablePath()) && !process.env['CI'])('runs the generated browser smoke and rejects a broken step button', () => {
    const browserGame = path.join(tmp, 'browser');
    const generated = spawnSync('node', [kitMjs, 'new', browserGame, 'demo', 'Demo Game', '--ref', head, '--ports', ports, '--link', nm, '--no-install', '--no-remote'], { encoding: 'utf8' });
    expect(generated.status, generated.stderr).toBe(0);
    const smoke = (timeout: string) => spawnSync(process.execPath, ['kit/ci-templates/full-gate.mjs', 'e2e'], {
      cwd: browserGame, encoding: 'utf8',
      env: { ...process.env, E2E_SCRIPTS: 'test:e2e', E2E_TEST_TIMEOUT_MS: timeout },
    });
    const result = smoke('10000');
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toMatch(/e2e port: \d+/);
    expect(result.stdout).toContain('Scaffold browser smoke passed: menu, setup, step, undo');
    const app = path.join(browserGame, 'src/ui/App.tsx');
    const ui = fs.readFileSync(app, 'utf8');
    const handler = "onClick={() => game.answer(['step'], state.prompt?.id ?? 0)}";
    expect(ui).toContain(handler);
    fs.writeFileSync(app, ui.replace(handler, 'onClick={() => undefined}'));
    const broken = smoke('3000');
    expect(broken.status, broken.stdout + broken.stderr).toBe(1);
    expect(broken.stderr).toContain('Steps: 1');
  }, 120_000);

  it('ignores an installed dependency directory as well as a linked one', () => {
    const dir = fs.mkdtempSync(path.join(tmp, 'installed-'));
    const ignore = path.join(KIT, 'components/scaffold/template/ignorefile.tpl');
    fs.copyFileSync(ignore, path.join(dir, '.gitignore'));
    fs.mkdirSync(path.join(dir, 'node_modules'));
    fs.writeFileSync(path.join(dir, 'node_modules', 'dependency.js'), 'export {};\n');
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
    git('init', '-q');
    git('add', '-A');
    expect(git('ls-files', '--', 'node_modules')).toBe('');
  });

  it('refuses a folder that is not empty', () => {
    const r = spawnSync('node', [kitMjs, 'new', out, 'demo', 'Demo Game', '--ports', ports, '--no-remote'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
  });

  it('K233: --existing pulls over an existing kit/ with a lock and merges .gitignore; a second run changes nothing', () => {
    const d = path.join(tmp, 'ex');
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, '.gitignore'), 'mine\nnode_modules/');
    expect(spawnSync('node', [kitMjs, 'pull', KIT, head, 'engine-core'], { cwd: d, encoding: 'utf8' }).status).toBe(0);
    const go = () => spawnSync('node', [kitMjs, 'new', d, 'demo', 'Demo Game', '--existing', '--ref', head, '--ports', ports, '--no-install', '--no-remote'], { encoding: 'utf8' });
    const r = go();
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    const gi = fs.readFileSync(path.join(d, '.gitignore'), 'utf8').split('\n');
    expect(gi.slice(0, 2)).toEqual(['mine', 'node_modules/']);
    expect(gi).toContain('dist/');
    expect(gi.filter((l) => l === 'node_modules/').length).toBe(1);
    const lock = JSON.parse(fs.readFileSync(path.join(d, 'kit/kit.lock.json'), 'utf8')) as { ref: string; components: Record<string, unknown> };
    expect(lock.ref).toBe(head);
    expect(Object.keys(lock.components)).toContain('sim-pool');
    expect(Object.keys(lock.components)).toContain('game-store');
    expect(spawnSync('node', ['kit/kit.mjs', 'check'], { cwd: d, encoding: 'utf8' }).status).toBe(0);
    const before = fs.readFileSync(path.join(d, '.gitignore'), 'utf8');
    expect(go().status).toBe(1);
    expect(fs.readFileSync(path.join(d, '.gitignore'), 'utf8')).toBe(before);
  }, 120_000);
});
