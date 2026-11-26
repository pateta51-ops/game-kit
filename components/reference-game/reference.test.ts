// K205: the reference game, generated through the scaffold, must pass its own check (its tests play a sim batch, a
// save / load mid-prompt and a replay round-trip). A component whose interface drifts breaks its typecheck or tests.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { scaffold } from '../scaffold/scaffold.js';

const KIT = path.dirname(path.dirname(import.meta.dirname));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'refgame-'));
const ports = path.join(tmp, 'ports.json');
fs.writeFileSync(ports, JSON.stringify({ games: { reference: { name: 'Reference', block: 6990, serve: { local: 4199 } } } }));
const out = path.join(tmp, 'reference');

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('reference game (K205)', () => {
  it('generates through the scaffold and passes its own check', () => {
    const ref = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: KIT, encoding: 'utf8' }).trim();
    scaffold({ dir: out, id: 'reference', name: 'Reference', kit: KIT, ref, ports, link: path.join(KIT, 'node_modules'), install: false, overlay: [path.join(KIT, 'components/scaffold/courier'), path.join(KIT, 'components/scaffold/reference-cards'), path.join(import.meta.dirname, 'template')], components: ['prompt-host', 'replay-cli', 'card-language', 'card-zones', 'game-store', 'table-panels', 'opponent', 'paced-view', 'turn-flow', 'automa', 'campaign', 'grid-map', 'content-pack', 'traceability'] });
    expect(fs.existsSync(path.join(out, 'tests', 'tactical.test.ts'))).toBe(true);
    const chk = spawnSync('npm', ['run', 'check'], { cwd: out, encoding: 'utf8', shell: true });
    expect(chk.status, chk.stdout + chk.stderr).toBe(0);
  }, 240_000);
});
