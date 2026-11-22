import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

// K523: a row whose section has no rows line in the template fails the plan script (it used to be dropped silently).
const SCRIPT = path.join(path.resolve(import.meta.dirname, '..'), 'scripts', 'plan.mjs');
it('plan.mjs --check exits 1 and names the file for a row with an unknown section', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-test-'));
  try {
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.mkdirSync(path.join(root, 'docs', 'plan'), { recursive: true });
    fs.copyFileSync(SCRIPT, path.join(root, 'scripts', 'plan.mjs'));
    fs.writeFileSync(path.join(root, 'docs', 'plan', '_template.md'), '# P\n\n| Batch | Content | Effort |\n|---|---|---|\n<!-- rows: Known -->\n');
    fs.writeFileSync(path.join(root, 'docs', 'plan', 'K1.md'), '---\nsection: Known\neffort: S\n---\nOne\n');
    const run = (a: string[]) => spawnSync('node', [path.join(root, 'scripts', 'plan.mjs'), ...a], { encoding: 'utf8' });
    expect(run([]).status).toBe(0);
    expect(run(['--check']).status).toBe(0);
    fs.writeFileSync(path.join(root, 'docs', 'plan', 'K2.md'), '---\nsection: Nowhere\neffort: S\n---\nTwo\n');
    const r = run(['--check']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('K2.md');
    expect(run([]).status).toBe(1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
