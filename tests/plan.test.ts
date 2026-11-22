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
    fs.writeFileSync(path.join(root, 'docs', 'plan', 'K1.md'), '---\nsection: Known\neffort: S\nstate: open\n---\nOne\n');
    const run = (a: string[]) => spawnSync('node', [path.join(root, 'scripts', 'plan.mjs'), ...a], { encoding: 'utf8' });
    expect(run([]).status).toBe(0);
    expect(run(['--check']).status).toBe(0);
    fs.writeFileSync(path.join(root, 'docs', 'plan', 'K2.md'), '---\nsection: Nowhere\neffort: S\nstate: open\n---\nTwo\n');
    const r = run(['--check']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('K2.md');
    expect(run([]).status).toBe(1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// K673: a row file with no state line, or one whose content or a column says done while its state does not, fails the plan script.
it('K673 plan.mjs exits 1 for a row with no state, or saying done with an open state; done passes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-test-'));
  try {
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.mkdirSync(path.join(root, 'docs', 'plan'), { recursive: true });
    fs.copyFileSync(SCRIPT, path.join(root, 'scripts', 'plan.mjs'));
    fs.writeFileSync(path.join(root, 'docs', 'plan', '_template.md'), '# P\n\n| Batch | Content | Effort |\n|---|---|---|\n<!-- rows: Known -->\n');
    const row = (fm: string, c: string) => fs.writeFileSync(path.join(root, 'docs', 'plan', 'K1.md'), '---\nsection: Known\n' + fm + '---\n' + c + '\n');
    const run = (a: string[] = []) => spawnSync('node', [path.join(root, 'scripts', 'plan.mjs'), ...a], { encoding: 'utf8' });
    row('effort: S\nstate: done\n', 'Motion frame (done)');
    expect(run().status).toBe(0);
    expect(run(['--check']).status).toBe(0);
    row('effort: S\n', 'One');
    let r = run(['--check']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('K1.md: no state: line');
    row('effort: S\nstate: open\n', 'Motion frame (done)');
    r = run(['--check']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('K1.md: says done but its state is "open"');
    row('effort: M (done)\nstate: open\n', 'One');
    expect(run().status).toBe(1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
