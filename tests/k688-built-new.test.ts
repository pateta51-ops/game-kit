import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { finish, searchPart, searchParts, type Exec } from '../scripts/agent.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'k688-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
const g = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' });
const put = (dir: string, f: string, t = 'x') => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); };
// a stand-in for the game's kit/kit.mjs search: "dice" finds dice-tray, "deck" a mechanics line naming card-zones, anything else misses
const fakeKit = `const w = process.argv.slice(3).join(' ')
if (process.argv[2] !== 'search') process.exit(2)
if (w.includes('pile')) console.log('Dice tray (\`dice-tray\`): Use: rolls dice\\nCard pile (\`card-zones\`): Use: piles\\ncount: Counts.\\nhand-fan: Fans a hand.')
else if (w.includes('dice')) console.log('Dice tray (\`dice-tray\`): Use: rolls dice')
else if (w.includes('deck')) console.log('mechanic: deck of cards -> \`card-zones\`: read its README')
else console.log('count: Counts a number up.\\nnot in the kit by that name')
`;
let n = 0;
function game(files: Record<string, string>, opts: { base?: Record<string, string>; pkg?: object; kit?: boolean } = {}): string {
  const name = 'g' + n++, bare = path.join(root, `${name}.git`), main = path.join(root, name);
  g(root, 'init', '-q', '--bare', '-b', 'main', bare);
  g(root, 'clone', '-q', bare, main);
  for (const [f, t] of Object.entries({ 'src/old.ts': 'export const a = 1\nfunction tick() {}\n', ...opts.base })) put(main, f, t);
  if (opts.pkg) put(main, 'package.json', JSON.stringify(opts.pkg));
  if (opts.kit) put(main, 'kit/kit.mjs', fakeKit);
  g(main, 'add', '.');
  g(main, 'commit', '-qm', 'init');
  g(main, 'push', '-q', 'origin', 'HEAD:main');
  g(main, 'switch', '-qc', 'batch');
  for (const [f, t] of Object.entries(files)) put(main, f, t);
  g(main, 'add', '.');
  g(main, 'commit', '-qm', 'work');
  return main;
}
function run(main: string, body: string | null) {
  const out: string[] = [], sent: string[] = [], gh: string[][] = [];
  const io = { out: (l: string) => void out.push(l), err: (l: string) => void out.push(l) };
  const bf = path.join(root, `${path.basename(main)}-body.md`);
  if (body !== null) fs.writeFileSync(bf, body);
  const exec: Exec = (c, a, input) => c === 'gh' ? (gh.push(a), { status: 1, output: 'no pull requests found' }) : (sent.push(input), { status: 0, output: 'all good' });
  const rc = finish(['--repo', main, ...(body !== null ? ['--body', bf] : [])], io, exec, false);
  return { rc, text: out.join('\n'), ran: sent.some((s) => s.includes('npm run check')), gh };
}
const sec = (...l: string[]) => '## Built new\n' + l.map((x) => '- ' + x).join('\n') + '\n\n## Checks\n';

describe('K688 finish runs each Built new line\'s two searches again', () => {
  it('K688 a search whose first line names another part than nearest fails with "check: search finds <part>"', () => {
    const main = game({ 'src/play/roll.ts': '' }, { kit: true });
    const r = run(main, sec('src/play/roll.ts | search: roll some dice; throw cubes | nearest: card-zones | why: x'));
    expect(r.rc).toBe(1);
    expect(r.ran).toBe(false);
    expect(r.text).toContain('check: search finds dice-tray for "roll some dice"');
    expect(r.text).not.toContain('"throw cubes"');
  });
  it('K688 nearest: none while a search (a mechanics line) finds a part fails', () => {
    const main = game({ 'src/play/deal.ts': '' }, { kit: true });
    const r = run(main, sec('src/play/deal.ts | search: deal a deck; hand out | nearest: none | why: x'));
    expect(r.rc).toBe(1);
    expect(r.text).toContain('check: search finds card-zones for "deal a deck"');
  });
  it('K688 good: nearest names the found part, or both searches miss with nearest: none; the check runs', () => {
    const main = game({ 'src/play/roll.ts': '' }, { kit: true });
    const a = run(main, sec('src/play/roll.ts | search: roll some dice; throw cubes | nearest: `dice-tray` | why: it cannot reroll one die'));
    expect(a.rc).toBe(0);
    expect(a.ran).toBe(true);
    expect(run(main, sec('src/play/roll.ts | search: flip a coin; toss heads | nearest: none | why: x')).rc).toBe(0);
  });
  it('K688 nearest is accepted when it is the second of the first 3 parts a search prints; a part after the third does not count', () => {
    const main = game({ 'src/play/pile.ts': '' }, { kit: true });
    expect(run(main, sec('src/play/pile.ts | search: pile of cards; stack pile | nearest: card-zones | why: x')).rc).toBe(0);
    const r = run(main, sec('src/play/pile.ts | search: pile of cards; stack pile | nearest: hand-fan | why: x'));
    expect(r.rc).toBe(1);
    expect(r.text).toContain('check: search finds dice-tray for "pile of cards"');
  });
  it('K688 searchPart reads the first line: a part, a sub-part, an effect, a mechanics line; null for a miss, a candidate or "not in the kit"', () => {
    expect(searchPart('Dice tray (`dice-tray`): Use: x')).toBe('dice-tray');
    expect(searchPart('dash-line: Draws a line. Use: x')).toBe('dash-line');
    expect(searchPart('light-teleport (was warp-transfer): x')).toBe('light-teleport');
    expect(searchPart('mechanic: a, b -> partly: `engine-core` does it')).toBe('engine-core');
    expect(searchPart('mechanic: a -> not in the kit; build it in the game')).toBeNull();
    expect(searchPart('candidate K123, wanted by x: y')).toBeNull();
    expect(searchParts('count: Counts.\nnot in the kit by that name')).toEqual([]);
    expect(searchParts('a (`p1`): x\ncandidate K1, wanted by y: z\nb (`p2`): x\nc (`p3`): x')).toEqual(['p1', 'p2']);
  });
});

describe('K688 kit.builtNew.ignore entries need a glob and a reason', () => {
  const ok = { glob: 'src/data/*.json', why: 'card data' };
  for (const [what, ignore, msg] of [
    ['a bare string', ['src/data/*.json'], 'needs { "glob"'],
    ['a missing why', [{ glob: 'src/data/*.json' }], 'src/data/*.json needs a non-empty why'],
    ['an empty why', [{ glob: 'src/data/*.json', why: ' ' }], 'needs a non-empty why'],
    ...['src/**', '**', 'src/*', 'src/**/*.ts', 'src/**/*.tsx', '**/*.js'].map((x) => [x, [{ glob: x, why: 'x' }], x + ' covers most of src/'] as const),
    ['11 entries', Array.from({ length: 11 }, (_, i) => ({ glob: `src/d${i}/*.json`, why: 'x' })), '11 entries, at most 10'],
  ] as const) it(`K688 ${what} fails before any run, even with nothing new`, () => {
    const main = game({ 'notes.md': 'x' }, { pkg: { kit: { builtNew: { ignore: ignore } } } });
    const r = run(main, null);
    expect(r.rc).toBe(1);
    expect(r.ran).toBe(false);
    expect(r.text).toMatch(/^FAIL [0-9a-f]{40} .*kit\.builtNew\.ignore is not valid/);
    expect(r.text).toContain(msg);
  });
  it('K688 good: ten entries with reasons pass and their globs are skipped', () => {
    const ignore = [ok, ...Array.from({ length: 9 }, (_, i) => ({ glob: `src/d${i}/*.json`, why: 'x' }))];
    const main = game({ 'src/data/cards.json': '{}' }, { pkg: { kit: { builtNew: { ignore } } } });
    const r = run(main, '');
    expect(r.rc).toBe(0);
    expect(r.ran).toBe(true);
    expect(run(game({ 'notes.md': 'x' }, { pkg: { kit: { builtNew: { ignore: [{ glob: 'src/**/*.json', why: 'data' }, { glob: 'src/gen/**/*.ts', why: 'generated' }] } } } }), '').rc).toBe(0);
  });
});

describe('K688 new top-level exports and timers in changed files need a line', () => {
  it('K688 a new export function in an old file fails, naming <file>#<export>', () => {
    const main = game({ 'src/old.ts': 'export const a = 1\nfunction tick() {}\nexport function shuffle() {}\n' });
    const r = run(main, '## Built new\n');
    expect(r.rc).toBe(1);
    expect(r.ran).toBe(false);
    expect(r.text).toContain('missing: src/old.ts#shuffle');
    expect(r.text).not.toContain('missing: src/old.ts#a');
  });
  it('K688 new export const hook and class count; a line naming <file>#<export> or the file passes', () => {
    const main = game({ 'src/old.ts': 'export const a = 1\nfunction tick() {}\nexport const useDeal = () => 1\nexport class Pool {}\n' });
    const r = run(main, '## Built new' + String.fromCharCode(10));
    expect(r.rc).toBe(1);
    expect(r.text).toContain('missing: src/old.ts#useDeal');
    expect(r.text).toContain('missing: src/old.ts#Pool');
    const line = (p: string) => `- ${p} | search: a b; c d | nearest: none | why: x`;
    expect(run(main, '## Built new\n' + line('src/old.ts#useDeal') + '\n' + line('old.ts#Pool') + '\n').rc).toBe(0);
    expect(run(main, '## Built new\n' + line('src/old.ts') + '\n').rc).toBe(0);
    const one = run(main, '## Built new\n' + line('src/old.ts#useDeal') + '\n');
    expect(one.rc).toBe(1);
    expect(one.text).toContain('missing: src/old.ts#Pool');
  });
  it('K688 a new top-level setInterval fails; one inside a function does not', () => {
    const top = game({ 'src/old.ts': 'export const a = 1\nfunction tick() {}\nsetInterval(tick, 100)\n' });
    const r = run(top, '## Built new' + String.fromCharCode(10));
    expect(r.rc).toBe(1);
    expect(r.text).toContain('missing: src/old.ts#setInterval');
    expect(run(top, '## Built new\n- src/old.ts#clock | search: a b; c d | nearest: none | why: x\n').rc).toBe(0);
    const inner = game({ 'src/old.ts': 'export const a = 1\nfunction tick() {\n  setTimeout(tick, 100)\n}\n' });
    expect(run(inner, '').rc).toBe(0);
  });
  it('K688 removing a plain declaration does not hide a new export as a rename', () => {
    const r = run(game({ 'src/old.ts': 'export const a = 1\nexport function shuffle() {}\n' }), '## Built new\n');
    expect(r.rc).toBe(1);
    expect(r.text).toContain('missing: src/old.ts#shuffle');
  });
  it('K688 export default function, export default arrow, export enum, export abstract class and export const { p } count', () => {
    for (const [t, name] of [
      ['export default function () {}', 'default'], ['export default () => 1', 'default'], ['export default function Board() {}', 'Board'],
      ['export enum Phase { A }', 'Phase'], ['export const enum Side { L }', 'Side'], ['export abstract class Base {}', 'Base'],
      ['export const { p, q: r } = obj', 'p'], ['export const { p, q: r } = obj', 'r'],
    ]) {
      const x = run(game({ 'src/old.ts': 'export const a = 1\nfunction tick() {}\n' + t + '\n' }), '## Built new\n');
      expect(x.rc, t).toBe(1);
      expect(x.text, t).toContain('missing: src/old.ts#' + name + ' ');
    }
  });
  it('K688 a timer in an arrow or function body on a top-level line is not top-level; a top-level assigned one is', () => {
    for (const t of ['const start = () => setTimeout(tick, 100)', 'const stop = () => clearTimeout(setTimeout(tick, 1))', 'function go() { setInterval(tick, 1) }']) {
      const x = run(game({ 'src/old.ts': 'export const a = 1\nfunction tick() {}\n' + t + '\n' }), '## Built new\n');
      expect(x.rc, t).toBe(0);
    }
    const y = run(game({ 'src/old.ts': 'export const a = 1\nfunction tick() {}\nconst id = setTimeout(tick, 100)\n' }), '## Built new\n');
    expect(y.rc).toBe(1);
    expect(y.text).toContain('missing: src/old.ts#setTimeout');
  });
  it('K688 renaming an export, editing one, exporting an old function or an indented export does not count', () => {
    for (const t of [
      'export const b = 1\nfunction tick() {}\n',
      'export const a = 2\nfunction tick() {}\n',
      'export const a = 1\nexport function tick() {}\n',
      'export const a = 1\nfunction tick() {}\nnamespace N {\n  export const z = 1\n}\n',
    ]) {
      const r = run(game({ 'src/old.ts': t }), '');
      expect(r.rc).toBe(0);
      expect(r.gh).toHaveLength(0);
    }
  });
  it('K688 a changed test file or ignored file is not checked', () => {
    const main = game({ 'src/old.test.ts': 'export function h() {}\n', 'src/gen/x.ts': 'export const b = 1\n' }, { base: { 'src/old.test.ts': '', 'src/gen/x.ts': '' }, pkg: { kit: { builtNew: { ignore: [{ glob: 'src/gen/**', why: 'generated' }] } } } });
    expect(run(main, '').rc).toBe(0);
  });
});
