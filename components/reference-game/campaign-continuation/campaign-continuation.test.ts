import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { generateCampaign } from './generate.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const kit = path.dirname(path.dirname(path.dirname(directory)));
const { nextSlot, addGameText } = createRequire(import.meta.url)(path.join(kit, 'tools/game-server/lib.mjs')) as {
  nextSlot: (registry: unknown) => { block: number; local: number; https: number };
  addGameText: (text: string, id: string, entry: Record<string, unknown>) => string;
};

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-consumer-'));
const project = path.join(temporary, 'project');
afterAll(() => fs.rmSync(temporary, { recursive: true, force: true }));

describe('generated campaign continuation', () => {
  it('plays both data configurations, preserves snapshots, and rejects broken consumer adapters', () => {
    const registry = fs.readFileSync(path.join(kit, 'ports.json'), 'utf8');
    const slot = nextSlot(JSON.parse(registry));
    const ports = path.join(temporary, 'ports.json');
    fs.writeFileSync(ports, addGameText(registry, 'campaign-compat', { name: 'Campaign Compatibility', repo: project, block: slot.block,
      serve: { local: slot.local, https: slot.https, build: 'npm run build', start: 'npx vite preview --host 127.0.0.1 --port {port} --strictPort', copyIgnored: [], env: {} } }));
    const generated = generateCampaign({ dir: project, ports });
    expect(generated.ref).toBe(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: kit, encoding: 'utf8' }).trim());
    const run = (args: string[]) => spawnSync(process.execPath, args, { cwd: project, encoding: 'utf8' });
    const accepted = run(['tests/campaign-acceptance.ts']);
    expect(accepted.status, accepted.stdout + accepted.stderr).toBe(0);
    const report = JSON.parse(accepted.stdout) as { variant: string; status: string; observations: { configuration: string; arrivalTerminal: unknown; crossingTerminal: unknown; retryCalendar: string }[] };
    expect(report.variant).toBe('four-card-continuation-v1');
    expect(report.status).toBe('passed');
    expect(report.observations.map(value => value.configuration)).toEqual(['camp-a', 'camp-b']);
    for (const observation of report.observations) {
      expect(observation.arrivalTerminal).not.toBeNull();
      expect(observation.crossingTerminal).not.toBeNull();
      expect(observation.retryCalendar).toBe('noop');
    }
    const progress = run(['tests/campaign-progress.ts']);
    expect(progress.status, progress.stdout + progress.stderr).toBe(0);
    const progressReport = JSON.parse(progress.stdout) as { status: string; observations: { configuration: string; rejected: string[] }[] };
    expect(progressReport.status).toBe('passed');
    expect(progressReport.observations.map(value => value.configuration)).toEqual(['camp-a', 'camp-b']);
    for (const observation of progressReport.observations) expect(observation.rejected).toContain('missing-arrival-completion');
    const sourceFile = path.join(project, 'src/engine/campaign-continuation.ts');
    const source = fs.readFileSync(sourceFile, 'utf8');
    const controls = [
      { from: "const lifeBonus = count(log, key('lifeBonus'));", to: 'const lifeBonus = 0;', failure: 'calendar bonus did not reach live scenario life' },
      { from: 'const log = changeCampaignRoster(save.log, edits, rosterRules(config));', to: 'const log = save.log;', failure: 'Expected values to be strictly deep-equal' },
    ];
    try {
      for (const control of controls) {
        expect(source.split(control.from)).toHaveLength(2);
        fs.writeFileSync(sourceFile, source.replace(control.from, control.to));
        const refused = run(['tests/campaign-acceptance.ts']);
        expect(refused.status, refused.stdout + refused.stderr).toBe(1);
        expect(refused.stdout).toBe('');
        expect(refused.stderr).toContain(control.failure);
      }
    } finally { fs.writeFileSync(sourceFile, source); }
    for (const args of [
      [path.join(kit, 'node_modules/typescript/bin/tsc'), '-b', '--noEmit'],
      [path.join(kit, 'node_modules/eslint/bin/eslint.js'), 'src/engine/campaign-continuation.ts', 'tests/campaign-acceptance.ts', 'tests/campaign-progress.ts', 'tests/campaign.test.ts'],
      [path.join(kit, 'kit.mjs'), 'check', '--source', kit],
    ]) {
      const checked = run(args);
      expect(checked.status, checked.stdout + checked.stderr).toBe(0);
    }
  }, 120_000);
});
