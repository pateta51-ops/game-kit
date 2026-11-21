import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path, { dirname } from 'node:path';
import { afterAll, expect, it } from 'vitest';

const SCRIPT = path.join(dirname(import.meta.dirname), 'scripts', 'state.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
fs.mkdirSync(path.join(root, 'docs'));
fs.mkdirSync(path.join(root, 'docs', 'plan'));
const row = (id: string, section: string, order: number, content: string, state: string, extra = '') => fs.writeFileSync(path.join(root, 'docs', 'plan', id + '.md'), `---
section: ${section}
order: ${order}
state: ${state}
${extra}---
${content}
`);
row('K1', 'Stage A', 10, '(GAPS A1) First thing. More words', 'done');
row('K2', 'Stage A', 20, 'Second thing: details', 'open');
row('K3', 'Wave B', 30, 'Third', 'done (x)');
row('K4', 'Wave B', 40, 'Fourth', 'waits for a game');
fs.mkdirSync(path.join(root, 'docs', 'evaluation'));
fs.writeFileSync(path.join(root, 'docs', 'evaluation', 'GAPS.md'), '# G\n\n- C1: **watch**. Revisit later.\n- C2: done.\n');
const run = () => spawnSync('node', [SCRIPT, root, '--games'], { encoding: 'utf8' });

it('lists open rows by section, counts done, lists watch rows', () => {
  const s = run().stdout;
  expect(s).toContain('Rows done: 2 of 4. Open: 1.');
  expect(s).toContain('### Stage A\n\n- K2: Second thing (open)');
  expect(s).toContain('## Waiting on a game\n\n- K4: Fourth (waits for a game)');
  expect(s).not.toContain('K1');
  expect(s).toContain('- C1: watch. Revisit later.');
  expect(s).not.toContain('C2');
});

it('reopened rows count nowhere', () => {
  row('K5', 'Wave B', 50, 'Fifth', 'reopened as K9');
  const s = run().stdout;
  expect(s).toContain('of 4.');
  expect(s).not.toContain('K5');
});

it('lists open PRs with the component each touches and each games oldest kit pin against the latest tag (K216)', () => {
  const prs = path.join(root, 'prs.json');
  fs.writeFileSync(prs, JSON.stringify([{ number: 7, title: 'K9: thing. more', isDraft: true, files: [{ path: 'components/alpha/a.ts' }, { path: 'components/alpha/b.ts' }, { path: 'docs/PLAN.md' }] }]));
  const games = path.join(root, 'games');
  fs.mkdirSync(path.join(games, 'g1', 'kit'), { recursive: true });
  fs.writeFileSync(path.join(games, 'g1', 'kit', 'kit.lock.json'), JSON.stringify({ components: { a: { ref: 'v0.10.0' }, b: { ref: 'v0.9.2' } } }));
  fs.mkdirSync(path.join(games, 'none'));
  fs.mkdirSync(path.join(games, 'g2', 'kit'), { recursive: true });
  fs.writeFileSync(path.join(games, 'g2', 'kit', 'kit.lock.json'), JSON.stringify({ ref: 'v0.8.1', commit: 'abc', components: { a: { files: {} } } }));
  const s = spawnSync('node', [SCRIPT, root, '--prs-json', prs, '--games', path.join(games, 'g1'), path.join(games, 'none'), path.join(games, 'g2')], { encoding: 'utf8' }).stdout;
  expect(s).toContain('- g2: oldest pin v0.8.1 (latest none)');
  expect(s).toContain('- #7 (draft): K9 [alpha]');
  expect(s).toContain('- g1: oldest pin v0.9.2 (latest none)');
  expect(s).not.toContain('- none:');
});

it('lists candidates under their own heading with the games that want them (K523)', () => {
  row('K6', 'Candidates', 60, 'discard-row: a row of cards', 'candidate', 'wanted-by: A, B\n');
  row('K7', 'Stage A', 70, 'Seventh: old proposal', 'proposed', 'asked-by: C\n');
  const s = run().stdout;
  expect(s).toContain('## Candidates\n\n- K7: Seventh (wanted by: C)\n- K6: discard-row (wanted by: A, B)');
  expect(s).not.toContain('(proposed)');
  expect(s).toContain('Open: 1.');
});
