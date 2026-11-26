import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { expeditionAcceptance } from './expedition-acceptance.ts';

describe('generated combat and exploration compatibility', () => {
  it('plays both configurations, independent damage/refusals, seeded growth, pending saves and real store/simulation parity', () => {
    const report = expeditionAcceptance();
    expect(report.status).toBe('passed');
    expect(report.records).toHaveLength(8);
  });

  it.each([
    ['wrong-damage', 'amount: config.power }', 'amount: config.power + 1 }', /printed first-hit health/],
    ['invalid-join', 'joins: [{ edge: edge.id, space: spaces[0]!.id }]', 'joins: []', /must join selected edge/],
    ['retained-tile', 'state.map = grown.map as Draft<GrowingMap>;', 'state.map = { ...grown.map, tiles: ctx.s.map.tiles } as Draft<GrowingMap>;', /Physical tile inventory changed/],
  ])('rejects the %s source control in an isolated real consumer', (_name, before, after, diagnostic) => {
    const root = path.dirname(import.meta.dirname);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'expedition-mutant-'));
    try {
      fs.mkdirSync(path.join(tmp, 'src/engine'), { recursive: true });
      fs.mkdirSync(path.join(tmp, 'tests'));
      fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}\n');
      fs.symlinkSync(path.join(root, 'kit'), path.join(tmp, 'kit'), 'junction');
      const original = fs.readFileSync(path.join(root, 'src/engine/expedition.ts'), 'utf8');
      expect(original.split(String(before))).toHaveLength(2);
      fs.writeFileSync(path.join(tmp, 'src/engine/expedition.ts'), original.replace(String(before), String(after)));
      fs.copyFileSync(path.join(root, 'src/expedition-sim.ts'), path.join(tmp, 'src/expedition-sim.ts'));
      fs.copyFileSync(path.join(root, 'tests/expedition-acceptance.ts'), path.join(tmp, 'tests/expedition-acceptance.ts'));
      const run = spawnSync(process.execPath, ['tests/expedition-acceptance.ts'], { cwd: tmp, encoding: 'utf8', timeout: 30_000 });
      expect(run.status, run.stdout + run.stderr).toBe(1);
      expect(run.stderr).toMatch(diagnostic);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });
});
