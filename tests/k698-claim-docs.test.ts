import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { claimParts, finish, type Exec } from '../scripts/agent.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'k698-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
const g = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' });
const put = (dir: string, f: string, t = 'x') => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); };
// a stand-in for kit/kit.mjs: effects for "playable highlight" prints the real kit's guesses (glow, pulse) and the miss line; anything else misses with an unrelated guess
const fakeKit = `const [cmd, ...a] = process.argv.slice(2), w = a.join(' ')
if (cmd === 'effects' && w.includes('highlight')) console.log('glow: Glows once, then fades back. Use: a target. Words: glow, highlight\\npulse: Pulses a piece. Use: waits. Words: pulse, playable\\nnot in the kit by that name')
else console.log('count: Counts a number up.\\nnot in the kit by that name')
`;
// the kit's own docs/plan, found beside the game's main checkout as game-kit/docs/plan
put(root, 'game-kit/docs/plan/K500.md', '---\nstate: done\n---\nrow\n');
put(root, 'game-kit/docs/plan/K501.md', '---\nstate: open\n---\nrow\n');
let n = 0;
function game(files: Record<string, string>, pkg?: object): string {
  const name = 'g' + n++, bare = path.join(root, `${name}.git`), main = path.join(root, name);
  g(root, 'init', '-q', '--bare', '-b', 'main', bare);
  g(root, 'clone', '-q', bare, main);
  put(main, 'docs/experience/plan.md', '# Experience\n\nold line\n');
  put(main, 'kit/kit.mjs', fakeKit);
  if (pkg) put(main, 'package.json', JSON.stringify(pkg));
  g(main, 'add', '.');
  g(main, 'commit', '-qm', 'init');
  g(main, 'push', '-q', 'origin', 'HEAD:main');
  g(main, 'switch', '-qc', 'batch');
  for (const [f, t] of Object.entries(files)) put(main, f, t);
  g(main, 'add', '.');
  g(main, 'commit', '-qm', 'work');
  return main;
}
function run(main: string) {
  const out: string[] = [], sent: string[] = [];
  const io = { out: (l: string) => void out.push(l), err: (l: string) => void out.push(l) };
  const exec: Exec = (c, _a, input) => c === 'gh' ? { status: 1, output: 'no pull requests found' } : (sent.push(input), { status: 0, output: 'all good' });
  const rc = finish(['--repo', main], io, exec, false);
  return { rc, text: out.join('\n'), ran: sent.some((s) => s.includes('npm run check')) };
}
const doc = (l: string) => ({ 'docs/experience/plan.md': `# Experience\n\nold line\n${l}\n` });
const claim = 'Playable cards light up: a kit gap, we build our own';

describe('K698 finish checks claim lines in the role documents', () => {
  it('K698 a claim line without searches fails before any run, with file and line', () => {
    const r = run(game(doc(claim)));
    expect(r.rc).toBe(1);
    expect(r.ran).toBe(false);
    expect(r.text).toMatch(/^FAIL [0-9a-f]{40} .*kit claims/);
    expect(r.text).toContain('docs/experience/plan.md:4: ' + claim);
    expect(r.text).toContain('a claim needs search:');
  });
  it('K698 a claim whose search finds glow in effects, with no nearest, fails with "check: search finds glow"', () => {
    const r = run(game(doc(claim + ' | search: playable highlight; lit card')));
    expect(r.rc).toBe(1);
    expect(r.ran).toBe(false);
    expect(r.text).toContain('check: search finds glow (effects "playable highlight")');
    expect(r.text).not.toContain('"lit card"');
  });
  it('K698 nearest: glow with a why of five words still fails', () => {
    const r = run(game(doc(claim + ' | search: playable highlight; lit card | nearest: glow | why: it cannot stay lit')));
    expect(r.rc).toBe(1);
    expect(r.text).toContain('check: search finds glow');
  });
  it('K698 good: nearest: glow with a why of six words passes and the check runs', () => {
    const r = run(game(doc(claim + ' | search: playable highlight; lit card | nearest: glow | why: it cannot follow a dragged card')));
    expect(r.text).not.toContain('kit claims');
    expect(r.rc).toBe(0);
    expect(r.ran).toBe(true);
  });
  it('K698 good: a non-claim line and a heading pass', () => {
    const r = run(game({ 'docs/experience/plan.md': '# Experience\n\nold line\nThe board sits in the middle.\n## Built new\n' }));
    expect(r.rc).toBe(0);
    expect(r.ran).toBe(true);
  });
  it('K698 a claim in docs/BUILD_PLAN.md and in docs/handoff/ is checked', () => {
    for (const f of ['docs/BUILD_PLAN.md', 'docs/handoff/director.md']) {
      const r = run(game({ [f]: 'The kit has no dice log.\n' }));
      expect(r.rc).toBe(1);
      expect(r.text).toContain(f + ':1: The kit has no dice log.');
    }
  });
  it('K698 good: a claim in a file outside those globs is ignored', () => {
    const r = run(game({ 'docs/notes/plan.md': claim + '\n', 'docs/experience-old.md': claim + '\n' }));
    expect(r.rc).toBe(0);
    expect(r.ran).toBe(true);
  });
  it('K698 a kit.claimDocs glob is added to the three, never in place of them', () => {
    const pkg = { kit: { claimDocs: ['docs/design/*.md'] } };
    const a = run(game({ 'docs/design/look.md': claim + '\n' }, pkg));
    expect(a.rc).toBe(1);
    expect(a.text).toContain('docs/design/look.md:1:');
    const b = run(game(doc(claim), pkg));
    expect(b.rc).toBe(1);
    expect(b.text).toContain('docs/experience/plan.md:4:');
    const c = run(game({ 'docs/notes/x.md': 'x\n' }, { kit: { claimDocs: 'docs/**' } }));
    expect(c.rc).toBe(1);
    expect(c.text).toContain('kit.claimDocs: must be a list of glob strings');
  });
  it('K698 a claim naming a kit row that is done fails: "the kit row is done: pull it"; an open row passes', () => {
    const tail = ' | search: lit card; shiny tile | nearest: none | why: x';
    const r = run(game(doc('Kit gap K500: lit tile' + tail)));
    expect(r.rc).toBe(1);
    expect(r.text).toContain('the kit row is done: pull it (K500)');
    expect(run(game(doc('Kit gap K501: lit tile' + tail))).rc).toBe(0);
  });
  it('K698 --check runs with no claim check', () => {
    const main = game(doc(claim));
    const sent: string[] = [];
    const exec: Exec = (_c, _a, input) => (sent.push(input), { status: 0, output: 'ok' });
    expect(finish(['--repo', main, '--check', 'npm test'], { out: () => {}, err: () => {} }, exec, false)).toBe(0);
    expect(sent.some((s) => s.includes('npm test'))).toBe(true);
  });
  it('K698 claimParts: after a miss line, only guesses sharing a word with the phrasing count', () => {
    expect(claimParts('count: Counts a number up.\nnot in the kit by that name', 'lit card')).toEqual([]);
    expect(claimParts('glow: x highlight\npulse: x playable\nnot in the kit by that name', 'playable highlight')).toEqual(['glow', 'pulse']);
    expect(claimParts('count: Counts.\nglow: x', 'lit card')).toEqual(['count', 'glow']);
  });
});
