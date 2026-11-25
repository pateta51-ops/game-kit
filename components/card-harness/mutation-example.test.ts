import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const example = fileURLToPath(new URL('./mutation-example.ts', import.meta.url));

it('runs the documented real-engine mutation example through the content gate', () => {
  const run = spawnSync(process.execPath, [example], { encoding: 'utf8' });
  expect(run.stderr).toBe('');
  expect(run.status).toBe(0);
  expect(run.stdout).toContain('award-too-many: killed');
  expect(run.stdout).toContain('qualify-too-early: killed');
  expect(run.stdout).toContain('CARD-REFERENCE: exempt');
  expect(run.stdout).toContain('ok   semantic mutations (0 errors, 0 warnings)');
});

it('distinguishes equivalent, invalid, and crashing mutants from missing coverage', () => {
  const run = spawnSync(process.execPath, [example, '--controls'], { encoding: 'utf8' });
  expect(run.stderr).toBe('');
  expect(run.status).toBe(1);
  expect(run.stdout).toContain('award-too-many: killed');
  expect(run.stdout).toContain('equivalent-condition: survived');
  expect(run.stdout).toContain('negative-award: invalid');
  expect(run.stdout).toContain('oversized-award: error');
  expect(run.stdout).toContain('score exceeds safe integer range');
  expect(run.stdout).toContain('CARD-MISSING: missing');
  expect(run.stdout).toContain('CARD-MISSING: no spec row with executable expectations');
  expect(run.stdout).toContain('CARD-REFERENCE: exempt');
  expect(run.stdout).toContain('FAIL semantic mutations (4 errors, 0 warnings)');
});
