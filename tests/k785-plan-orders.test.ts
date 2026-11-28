import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { finish, type Exec } from '../scripts/agent.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'k785-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
const g = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' });
const put = (dir: string, f: string, t = 'x') => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); };
let n = 0;
function game(branch: string, plan: string | Record<string, string>, src: string, rules?: number): string {
  const name = 'g' + n++, bare = path.join(root, `${name}.git`), main = path.join(root, name);
  g(root, 'init', '-q', '--bare', '-b', 'main', bare);
  g(root, 'clone', '-q', bare, main);
  const base = { 'src/engine/a.ts': '', 'package.json': JSON.stringify(rules === undefined ? {} : { kit: { rules } }), ...(typeof plan === 'string' ? { 'docs/BUILD_PLAN.md': plan } : plan) };
  for (const [f, t] of Object.entries(base)) put(main, f, t);
  g(main, 'add', '.');
  g(main, 'commit', '-qm', 'init');
  g(main, 'push', '-q', 'origin', 'HEAD:main');
  g(main, 'switch', '-qc', branch);
  put(main, 'src/engine/a.ts', src);
  g(main, 'add', '.');
  g(main, 'commit', '-qm', 'work');
  return main;
}
function run(main: string, body = '', extra: string[] = []) {
  const out: string[] = [], sent: string[] = [];
  const io = { out: (l: string) => void out.push(l), err: (l: string) => void out.push(l) };
  const bf = path.join(root, `${path.basename(main)}-body.md`);
  fs.writeFileSync(bf, body);
  const exec: Exec = (c, _a, input) => c === 'gh' ? { status: 1, output: '' } : (sent.push(input), { status: 0, output: 'all good' });
  const rc = finish(['--repo', main, '--body', bf, ...extra], io, exec, false);
  return { rc, text: out.join('\n'), ran: sent.some((s) => s.includes('npm run check') || s.includes('echo hi')) };
}
const PLAN = '# Build plan\n\n## Batch B1: other\n\nMust use: card-pile:Pile\n\n## Batch B2: the hand\n\n```\nMust use: saves:fenced\n```\n- **Must use:** `card-zoom:transcribe`, card-hand:*\n\n### B2 notes\n\ntext\n\n## Batch B3: later\n\nMust use: tutorial:Tour\n';
const USES = "import { transcribe } from '../../kit/card-zoom/index'\nimport { CardHand } from '../../kit/card-hand/ui'\ntranscribe; CardHand;";
const HAND = "import { CardHand } from '../../kit/card-hand/ui'\nCardHand;";

describe('K785 finish reads the Must use orders of the batch from the committed build plan', () => {
  it('K785 kit.rules 2: a part the plan orders and the branch does not import fails with an empty PR body, exit 1, naming the plan file and the batch; nothing runs', () => {
    const r = run(game('batch/b2-hand', PLAN, HAND, 2));
    expect(r.rc).toBe(1);
    expect(r.ran).toBe(false);
    expect(r.text).toMatch(/^FAIL [0-9a-f]{40} \(batch\/b2-hand; orders:/);
    expect(r.text).toContain('must use: card-zoom (transcribe) is not imported under src/ from kit/card-zoom/');
    expect(r.text).toContain('docs/BUILD_PLAN.md, Batch b2');
    expect(r.text).toContain('ORDERS 1/2 missing: card-zoom (transcribe)');
    expect(r.text).not.toContain('card-pile');
    expect(r.text).not.toContain('tutorial');
    expect(r.text).not.toContain('saves');
  });
  it('K785 without kit.rules (or below 2) the same problem is a warning: exit 0, the check runs, the PASS and ORDERS lines are as before', () => {
    for (const rules of [undefined, 1]) {
      const r = run(game('batch/b2-hand', PLAN, HAND, rules));
      expect(r.rc).toBe(0);
      expect(r.ran).toBe(true);
      expect(r.text).toMatch(/^PASS [0-9a-f]{40} \(batch\/b2-hand; check passed, clone removed\)\nORDERS 0\/0\nwarning: must use: card-zoom \(transcribe\)/);
      expect(r.text).toContain('docs/BUILD_PLAN.md, Batch b2');
    }
  });
  it('K785 kit.rules 2: every ordered part imported passes, exit 0, ORDERS 2/2', () => {
    const r = run(game('batch/b2-hand', PLAN, USES, 2));
    expect(r.rc).toBe(0);
    expect(r.text).toMatch(/^PASS [0-9a-f]{40} .*\nORDERS 2\/2\n/);
    expect(r.text).not.toContain('warning');
  });
  it('K785 Must use: none in the plan passes, exit 0, ORDERS 0/0', () => {
    const r = run(game('batch/b2-hand', '## Batch B2\n\nMust use: none\n', 'const x = 1', 2));
    expect(r.rc).toBe(0);
    expect(r.text).toMatch(/^PASS [0-9a-f]{40} .*\nORDERS 0\/0\n/);
  });
  it('K785 a Waived line in the PR body clears a plan order; plan and PR body orders are merged', () => {
    const main = game('batch/b2-hand', PLAN, HAND, 2);
    const w = run(main, 'Waived: card-zoom | architect | the icon table lands next batch\n');
    expect(w.rc).toBe(0);
    expect(w.text).toContain('ORDERS 2/2');
    const m = run(main, 'Must use: saves:save\nWaived: card-zoom | architect | later\n');
    expect(m.rc).toBe(1);
    expect(m.text).toContain('ORDERS 2/3 missing: saves (save)');
  });
  it('K785 a codex/s4-actions branch finds "#### Batch S4 — ..." in any docs/BUILD_PLAN*.md; the block ends at a heading of the same or a higher level', () => {
    const plan = { 'docs/BUILD_PLAN_2.md': '## Stage\n\n#### Batch S4 — actions\n\n##### Files\n\nMust use: card-zoom:transcribe\n\n#### Batch S40 — other\n\nMust use: saves:save\n\n### Later\n\nMust use: tutorial:Tour\n' };
    const r = run(game('codex/s4-actions', plan, 'const x = 1', 2));
    expect(r.rc).toBe(1);
    expect(r.text).toContain('docs/BUILD_PLAN_2.md, Batch s4');
    expect(r.text).toContain('ORDERS 0/1 missing: card-zoom (transcribe)');
    expect(run(game('claude/s4-actions', plan, "import { transcribe } from '../../kit/card-zoom/index'\ntranscribe;", 2)).rc).toBe(0);
  });
  it('K785 two Must use lines in one block, or an entry that is not part:export or part:*, fail naming the line (a warning below kit.rules 2)', () => {
    const two = run(game('batch/b2-x', '## Batch B2\nMust use: card-hand:*\nMust use: card-zoom:transcribe\n', USES, 2));
    expect(two.rc).toBe(1);
    expect(two.text).toContain('two Must use lines');
    expect(two.text).toContain('Must use: card-zoom:transcribe');
    const bad = run(game('batch/b2-x', '## Batch B2\nMust use: card-hand:*, the card zoom\n', USES, 2));
    expect(bad.rc).toBe(1);
    expect(bad.text).toContain('"the card zoom"');
    expect(bad.text).toContain('Must use: card-hand:*, the card zoom');
    const soft = run(game('batch/b2-x', '## Batch B2\nMust use: card-hand:*, the card zoom\n', USES));
    expect(soft.rc).toBe(0);
    expect(soft.text).toContain('warning: ');
  });
  it('K785 no batch id in the branch, no plan, no block for the batch, or --check: as before', () => {
    for (const main of [game('k9-hand', PLAN, HAND, 2), game('batch/b2-hand', {}, HAND, 2), game('batch/b7-hand', PLAN, HAND, 2)]) {
      const r = run(main);
      expect(r.rc).toBe(0);
      expect(r.text).toMatch(/^PASS [0-9a-f]{40} .*\nORDERS 0\/0\n/);
      expect(r.text).not.toContain('warning');
    }
    const c = run(game('batch/b2-hand', PLAN, HAND, 2), '', ['--check', 'echo hi']);
    expect(c.rc).toBe(0);
    expect(c.text).toMatch(/^check passed /);
  });
});
