import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { afterAll, describe, expect, it } from 'vitest';
import { scaffold } from '../scaffold/scaffold.js';

const kit = path.dirname(path.dirname(import.meta.dirname));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'expedition-reference-'));
const ports = path.join(temporary, 'ports.json');
fs.writeFileSync(ports, JSON.stringify({ games: { expedition: { name: 'Expedition', block: 6990, serve: { local: 4199 } } } }));
const dir = path.join(temporary, 'expedition');
afterAll(() => fs.rmSync(temporary, { recursive: true, force: true }));

describe('generated expedition compatibility', () => {
  it('runs the fresh consumer check with actual combat, growing topology, refusals, saves and store/simulation parity', () => {
    const ref = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: kit, encoding: 'utf8' }).trim();
    scaffold({ dir, id: 'expedition', name: 'Expedition', kit, ref, ports, link: path.join(kit, 'node_modules'), install: false,
      overlay: [path.join(import.meta.dirname, 'expedition')], components: ['combat', 'growing-map', 'board-model', 'replay-cli'] });
    const check = spawnSync('npm', ['run', 'check'], { cwd: dir, encoding: 'utf8', shell: process.platform === 'win32' });
    expect(check.status, check.stdout + check.stderr).toBe(0);
  }, 180_000);

  it.skipIf(!process.env['PW_CHROMIUM_PATH'] && !fs.existsSync(chromium.executablePath()) && !process.env['CI'])('plays both actual browser routes and rejects a disconnected action control', () => {
    const run = () => spawnSync(process.execPath, ['kit/ci-templates/full-gate.mjs', 'e2e'], {
      cwd: dir, encoding: 'utf8', timeout: 60_000, env: { ...process.env, E2E_SCRIPTS: 'test:e2e' },
    });
    const good = run();
    expect(good.status, good.stdout + good.stderr).toBe(0);
    expect(good.stdout).toContain('Expedition browser acceptance passed');
    const file = path.join(dir, 'src/ui/App.tsx');
    const before = fs.readFileSync(file, 'utf8');
    expect(before).toContain('store.answer([option.id], view.prompt!.id)');
    fs.writeFileSync(file, before.replace('store.answer([option.id], view.prompt!.id)', 'false'));
    const broken = run();
    expect(broken.status, broken.stdout + broken.stderr).toBe(1);
  }, 90_000);
});
