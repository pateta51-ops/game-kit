import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('campaign continuation consumer', () => {
  it('executes both declared configurations through the real continuation command', () => {
    const result = spawnSync(process.execPath, ['tests/campaign-acceptance.ts'], { cwd: process.cwd(), encoding: 'utf8' });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as { status: string; observations: { configuration: string }[] };
    expect(report.status).toBe('passed');
    expect(report.observations.map(value => value.configuration)).toEqual(['camp-a', 'camp-b']);
  });
  it('validates archive progress while retaining completed and active retry history', () => {
    const result = spawnSync(process.execPath, ['tests/campaign-progress.ts'], { cwd: process.cwd(), encoding: 'utf8' });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as { status: string; observations: { configuration: string }[] };
    expect(report.status).toBe('passed');
    expect(report.observations.map(value => value.configuration)).toEqual(['camp-a', 'camp-b']);
  });
});
