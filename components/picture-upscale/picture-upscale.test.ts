import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The tool is Python; run its tests through unittest. The seam tests need numpy: where it is missing, make a venv for it.
const dir = path.join(import.meta.dirname, 'tests');
const run = (py: string) => spawnSync(py, ['-I', '-m', 'unittest', 'discover', '-s', dir, '-v'], { encoding: 'utf8' });
const py = ['python3', 'python'].find((p) => spawnSync(p, ['--version']).status === 0);

describe('picture-upscale (python)', () => {
  it.skipIf(py === undefined)('unit tests pass', { timeout: 240000 }, () => {
    let exe = py ?? 'python3';
    if (spawnSync(exe, ['-c', 'import numpy']).status !== 0) {
      const v = path.join(mkdtempSync(path.join(tmpdir(), 'pu-')), 'venv');
      spawnSync(exe, ['-m', 'venv', v]);
      const vp = path.join(v, 'bin', 'python');
      if (spawnSync(vp, ['-m', 'pip', 'install', '-q', 'numpy']).status === 0) exe = vp;
    }
    const r = run(exe);
    expect(r.stderr + r.stdout).toContain('OK');
    expect(r.stdout + r.stderr).not.toContain('skipped');
    expect(r.status).toBe(0);
  });
});
