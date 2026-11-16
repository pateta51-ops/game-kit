import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The pure parts are Python; run them through unittest. Skipped where python3 is missing (the kit's CI runner has it).
const dir = path.join(import.meta.dirname, 'tests');
const py = ['python3', 'python'].find((p) => spawnSync(p, ['--version']).status === 0);

describe('audio-gen (python)', () => {
  it.skipIf(py === undefined)('unit tests pass', () => {
    const r = spawnSync(py ?? 'python3', ['-I', '-m', 'unittest', 'discover', '-s', dir, '-v'], { encoding: 'utf8' });
    expect(r.stderr + r.stdout).toContain('OK');
    expect(r.status).toBe(0);
  });
});
