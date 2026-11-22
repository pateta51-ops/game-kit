import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { claimParts, claims, claimsCmd, finish, isClaim, type Exec } from '../scripts/agent.mjs';

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
  it('K698 kit.mjs claims <file>: checks every claim line of one file on disk, outside the globs too; exit 1 on a problem, 0 clean', () => {
    const main = game({ 'README.md': 'x' });
    put(main, 'notes/look.md', 'The board.\n' + claim + '\nA kit gap | search: playable highlight; lit card | nearest: glow | why: it cannot follow a dragged card\n');
    const kit = path.resolve(import.meta.dirname, '..', 'kit.mjs');
    const r = spawnSync(process.execPath, [kit, 'claims', path.join(main, 'notes/look.md'), '--repo', main], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('notes/look.md:2: ' + claim);
    expect(r.stdout).toContain('a claim needs search:');
    expect(r.stdout).not.toContain('notes/look.md:3:');
    put(main, 'notes/ok.md', 'The board.\nA kit gap | search: playable highlight; lit card | nearest: glow | why: it cannot follow a dragged card\n');
    const ok = spawnSync(process.execPath, [kit, 'claims', path.join(main, 'notes/ok.md'), '--repo', main], { encoding: 'utf8' });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain('claims ok: notes/ok.md');
    put(main, 'notes/glow.md', 'A kit gap | search: playable highlight; lit card\n');
    const g2 = spawnSync(process.execPath, [kit, 'claims', path.join(main, 'notes/glow.md'), '--repo', main], { encoding: 'utf8' });
    expect(g2.status).toBe(1);
    expect(g2.stdout).toContain('check: search finds glow');
  });
  it('K698 claim forms: a Gap: label (bold or not), kit ships no, no kit part, kit does not have, missing from the kit, not covered by the kit', () => {
    const exact = '**Gap:** the kit ships no look for data-mark legal';
    const r = run(game(doc(exact)));
    expect(r.rc).toBe(1);
    expect(r.text).toContain('docs/experience/plan.md:4: ' + exact);
    for (const l of ['GAP: dice log', 'A row the KIT SHIPS NO look for', 'No kit part draws it', 'The kit does not have a log', 'Missing from the kit: a log', 'Not covered by the kit: a log'])
      expect(isClaim(l), l).toBe(true);
    expect(isClaim('The gap between cards is 4 px')).toBe(false);
  });
  it('K698 claimParts: after a miss line, only guesses sharing a word with the phrasing count', () => {
    expect(claimParts('count: Counts a number up.\nnot in the kit by that name', 'lit card')).toEqual([]);
    expect(claimParts('glow: x highlight\npulse: x playable\nnot in the kit by that name', 'playable highlight')).toEqual(['glow', 'pulse']);
    expect(claimParts('count: Counts.\nglow: x', 'lit card')).toEqual(['count', 'glow']);
  });
});

describe('K698 claims <file>: ordinary text passes, only changed lines, exit codes', () => {
  const cmd = (args: string[], fallback = '') => { const out: string[] = []; const rc = claimsCmd(args, { out: (l) => void out.push(l), err: (l) => void out.push(l) }, fallback); return { rc, text: out.join('\n') }; };
  const dir = () => fs.mkdtempSync(path.join(root, 'plain-'));
  const ordinary = ['```css', 'gap: 8px;', 'The kit has no grid here', '```', 'gap: 8px;', '- [x] The kit has no dice log', '| gap | gap: 12 px |', 'Mind the gap: two rows apart.', '> A kit gap, says the review', 'The button adds a new effect on the button.', 'See the Built new section.', 'The kit cannot be pulled offline.', 'It keeps a game-own copy.', '- [x] kit gap K12 closed', 'Uses `kit gap` as a word.', 'A kit gap was closed in K12.'];
  it('K698 good: code blocks, CSS gap, "Mind the gap:", quotes, prose mentions and checked items are no claims (exit 0)', () => {
    const d = dir();
    put(d, 'doc.md', ordinary.join('\n') + '\n');
    const r = cmd([path.join(d, 'doc.md')]);
    expect(r.text).toBe('claims ok: doc.md');
    expect(r.rc).toBe(0);
  });
  it('K698 real claims still fail: the data-mark Gap: line, a Built new: label, a list under a Built new heading, game-own instead of the kit, a new effect the kit lacks', () => {
    const d = dir();
    const real = ['**Gap:** the kit ships no look for data-mark legal', '- Gap: a dice log', 'Built new: the dice log', 'A game-own log instead of the kit part', 'A new effect: no kit effect does it'];
    put(d, 'doc.md', [...real, '## Built new', '- src/log.ts | nearest: none', '## Next', '- a plain item'].join('\n') + '\n');
    const r = cmd([path.join(d, 'doc.md')]);
    expect(r.rc).toBe(1);
    real.forEach((l, i) => expect(r.text).toContain(`doc.md:${i + 1}: ${l}`));
    expect(r.text).toContain('doc.md:7: - src/log.ts');
    expect(r.text).not.toContain('doc.md:9:');
    expect(r.text.split('\n').pop()).toMatch(/^each claim line carries/);
  });
  it('K698 --before: a claim line already in the old file passes; a new one fails; a missing old file means all lines', () => {
    const d = dir();
    put(d, 'old.md', 'Intro.\nThe kit has no dice log.\n');
    put(d, 'new.md', 'Intro, longer.\nThe kit has no dice log.\n');
    expect(cmd([path.join(d, 'new.md'), '--before', path.join(d, 'old.md')]).rc).toBe(0);
    expect(cmd([path.join(d, 'new.md')]).rc).toBe(1);
    put(d, 'new2.md', 'The kit has no dice log.\nThe kit has no turn timer.\n');
    const r = cmd([path.join(d, 'new2.md'), '--before', path.join(d, 'old.md')]);
    expect(r.rc).toBe(1);
    expect(r.text).toContain('new2.md:2: The kit has no turn timer.');
    expect(r.text).not.toContain('new2.md:1:');
    expect(cmd([path.join(d, 'new2.md'), '--before', path.join(d, 'gone.md')]).text).toContain('new2.md:1:');
  });
  it('K698 exit codes: 2 for usage or a missing file, 0 for an empty file; outside a git repo with no kit the search-line rule still holds', () => {
    const d = dir();
    expect(cmd([]).rc).toBe(2);
    expect(cmd(['--repo', d]).rc).toBe(2);
    expect(cmd([path.join(d, 'x.md'), '--bogus', '1']).rc).toBe(2);
    const m = cmd([path.join(d, 'missing.md')]);
    expect(m.rc).toBe(2);
    expect(m.text).toContain('cannot read');
    put(d, 'empty.md', '');
    expect(cmd([path.join(d, 'empty.md'), '--repo', path.join(d, 'nowhere')]).rc).toBe(0);
    put(d, 'c.md', 'A kit gap | search: playable highlight; lit card\nThe kit has no log.\n');
    const r = cmd([path.join(d, 'c.md')]);
    expect(r.rc).toBe(1);
    expect(r.text).toContain('c.md:2: The kit has no log.');
    expect(r.text).not.toContain('c.md:1:');
  });
  it('K698 kit.mjs claims with no --repo finds the repo from the file and its kit/kit.mjs; no stack trace on a bad path', () => {
    const main = game({ 'README.md': 'x' });
    put(main, 'docs/notes/a.md', 'A kit gap | search: playable highlight; lit card\n');
    const kit = path.resolve(import.meta.dirname, '..', 'kit.mjs');
    const r = spawnSync(process.execPath, [kit, 'claims', path.join(main, 'docs/notes/a.md')], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('docs/notes/a.md:1:');
    expect(r.stdout).toContain('check: search finds glow');
    const b = spawnSync(process.execPath, [kit, 'claims', path.join(main, 'nope.md')], { encoding: 'utf8' });
    expect(b.status).toBe(2);
    expect(b.stderr).not.toMatch(/\n\s+at /);
  });
  it('K698 20 claims against the real kit search (40 distinct phrasings, 80 searches) run in one parallel batch', () => {
    const d = dir();
    put(d, 'many.md', Array.from({ length: 20 }, (_, i) => `The kit has no thing ${i} | search: playable highlight ${i}; lit card ${i} | nearest: none | why: x`).join('\n') + '\n');
    const t0 = Date.now();
    const r = cmd([path.join(d, 'many.md')], path.resolve(import.meta.dirname, '..', 'kit.mjs'));
    const ms = Date.now() - t0;
    expect(r.rc).toBe(1);
    expect(r.text).toContain('check: search finds glow');
    console.log(`K698 20 claims: ${ms} ms`);
    expect(ms).toBeLessThan(15000);
  });
});
describe('K698 claims cache', () => {
  it('K698 each distinct phrasing runs once per command', () => {
    const calls: string[] = [];
    const lines = [1, 2, 3].map((n) => ({ file: 'a.md', n, text: 'The kit has no log | search: dice log; roll record | nearest: none | why: x' }));
    claims(lines, (q: string, c?: string) => (calls.push(c + ' ' + q), 'count: x\nnot in the kit by that name'));
    expect(calls.sort()).toEqual(['effects dice log', 'effects roll record', 'search dice log', 'search roll record']);
  });
});
describe('K698 the checker\'s own searches write no miss log', () => {
  it('K698 kit.mjs search in a game logs a miss, but not with KIT_NO_MISS_LOG=1', () => {
    const d = fs.mkdtempSync(path.join(root, 'log-')), home = path.join(d, 'home'), kit = path.join(d, 'kit');
    fs.mkdirSync(kit);
    fs.copyFileSync(path.resolve(import.meta.dirname, '..', 'kit.mjs'), path.join(kit, 'kit.mjs'));
    fs.copyFileSync(path.resolve(import.meta.dirname, '..', 'docs', 'CATALOG.md'), path.join(kit, 'CATALOG.md'));
    const log = path.join(home, '.game-kit', 'search-misses.log');
    const go = (extra: Record<string, string>) => spawnSync(process.execPath, [path.join(kit, 'kit.mjs'), 'search', 'zqxv', 'wombat'], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, KIT_NO_MISS_LOG: '', ...extra } });
    expect(go({ KIT_NO_MISS_LOG: '1' }).status).toBe(0);
    expect(fs.existsSync(log)).toBe(false);
    expect(go({}).status).toBe(0);
    expect(fs.readFileSync(log, 'utf8')).toContain('zqxv wombat');
  });
  it('K698 claims passes KIT_NO_MISS_LOG=1 to every search it spawns', () => {
    const d = fs.mkdtempSync(path.join(root, 'env-'));
    put(d, 'kit/kit.mjs', "console.log(process.env.KIT_NO_MISS_LOG === '1' ? 'count: x\\nnot in the kit by that name' : 'glow: x highlight')\n");
    put(d, 'a.md', 'A kit gap | search: playable highlight; lit highlight\n');
    const out: string[] = [];
    expect(claimsCmd([path.join(d, 'a.md'), '--repo', d], { out: (l) => void out.push(l), err: (l) => void out.push(l) }, '')).toBe(0);
    expect(out.join('\n')).toBe('claims ok: a.md');
  });
});
