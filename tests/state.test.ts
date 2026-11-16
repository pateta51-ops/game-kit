import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path, { dirname } from 'node:path';
import { afterAll, expect, it } from 'vitest';

const SCRIPT = path.join(dirname(import.meta.dirname), 'scripts', 'state.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
fs.mkdirSync(path.join(root, 'docs'));
fs.writeFileSync(path.join(root, 'docs', 'PLAN.md'), [
  '# Plan', '', '## Stage A', '', '| # | Batch | Size | State |', '|---|---|---|---|',
  '| K1 | (GAPS A1) First thing. More words | S | done |',
  '| K2 | Second thing: details | M | proposed |',
  '', '### Wave B', '', '| Batch | Content | Effort | State |', '|---|---|---|---|',
  '| K3 | Third | S | done (x) |', '| K4 | Fourth | S | waits for a game |', '',
].join('\n'));
fs.mkdirSync(path.join(root, 'docs', 'evaluation'));
fs.writeFileSync(path.join(root, 'docs', 'evaluation', 'GAPS.md'), '# G\n\n- C1: **watch**. Revisit later.\n- C2: done.\n');
const run = () => spawnSync('node', [SCRIPT, root], { encoding: 'utf8' });

it('lists open rows by section, counts done, lists watch rows', () => {
  const s = run().stdout;
  expect(s).toContain('Rows done: 2 of 4. Open: 1.');
  expect(s).toContain('### Stage A\n\n- K2: Second thing (proposed)');
  expect(s).toContain('## Waiting on a game\n\n- K4: Fourth (waits for a game)');
  expect(s).not.toContain('K1');
  expect(s).toContain('- C1: watch. Revisit later.');
  expect(s).not.toContain('C2');
});

it('reopened rows count nowhere', () => {
  fs.appendFileSync(path.join(root, 'docs', 'PLAN.md'), '| K5 | Fifth | S | reopened as K9 |\n');
  const s = run().stdout;
  expect(s).toContain('of 4.');
  expect(s).not.toContain('K5');
});
