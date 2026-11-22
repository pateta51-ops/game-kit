import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { flags } from './args.ts';
import { run as art } from './art-check.ts';
import { records, run as gen, splitRow, tableAfter } from './gen-from-table.ts';
import { addGrams, addedLines, diffPath, jsonStrings, leaks, run as leak, type Grams } from './text-leak.ts';

const dir = mkdtempSync(join(tmpdir(), 'tooling-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const lines: string[] = [];
const io = { out: (l: string) => void lines.push(l), err: (l: string) => void lines.push(l) };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const put = (rel: string, text: string) => {
  writeFileSync(join(dir, rel), text);
  return join(dir, rel);
};

describe('flags', () => {
  it('reads pairs, repeats, bools and a config file that flags override', () => {
    expect(flags(['--a', '1', '--a', '2', '--c'], ['a'], ['c'])).toEqual({ a: ['1', '2'], c: ['true'] });
    expect(flags(['--nope', '1'], ['a'])).toBeNull();
    expect(flags(['--a'], ['a'])).toBeNull();
    expect(flags(['a'], ['a'])).toBeNull();
    const cfg = put('flags.json', JSON.stringify({ a: [1, 2], b: 'x', c: false }));
    expect(flags(['--config', cfg, '--b', 'y'], ['a', 'b'], ['c'])).toEqual({ a: ['1', '2'], b: ['y'], config: [cfg] });
    expect(flags(['--config', put('bad.json', '{"zz":1}')], ['a'])).toBeNull();
  });
});

describe('art-check', () => {
  const src = join(dir, 'src');
  const out = join(dir, 'out');
  mkdirSync(src);
  mkdirSync(out);
  writeFileSync(join(src, 'F001-gate.png'), 'gate');
  writeFileSync(join(src, 'F002-well.png'), 'well');
  writeFileSync(join(src, 'notes.txt'), 'ignored');
  writeFileSync(join(out, 'F001.webp'), 'aaaa');
  writeFileSync(join(out, 'F002.webp'), 'bbbbbb');
  const good = {
    F001: { source: 'F001-gate.png', sha256: sha('gate'), bytes: 4, outSha256: sha('aaaa') },
    F002: { source: 'F002-well.png', sha256: sha('well'), bytes: 6 },
  };
  const args = (manifest: object, ...more: string[]) => [
    '--manifest',
    put('manifest.json', JSON.stringify(manifest)),
    '--sources',
    src,
    '--out',
    out,
    '--ext',
    'webp',
    '--source-id',
    '^(F\\d{3})-.+\\.png$',
    ...more,
  ];
  const errors = (manifest: object, ...more: string[]) => {
    lines.length = 0;
    const code = art(args(manifest, ...more), io);
    return { code, text: lines.join('\n') };
  };

  it('passes when the manifest matches sources and outputs', () => {
    expect(errors(good)).toEqual({ code: 0, text: 'enlarged check: 2 faces skipped, no source size; republish to check them\nart-check: ok (2 faces, 10 bytes)' });
    expect(errors(good, '--need', put('need.json', '["F001"]'), '--max-bytes', '10', '--max-file-bytes', '6').code).toBe(0);
  });

  it('reports a changed source, a changed or missing output and a stray entry', () => {
    expect(errors({ ...good, F001: { ...good.F001, sha256: sha('other') } }).text).toContain('F001: the source F001-gate.png changed');
    expect(errors({ ...good, F001: { ...good.F001, bytes: 5 } }).text).toContain('F001: the output F001.webp differs');
    expect(errors({ ...good, F001: { ...good.F001, outSha256: sha('zzzz') } }).text).toContain('F001: the output F001.webp differs');
    expect(errors({ F001: good.F001 }).text).toContain('F002: not in the manifest');
    const stray = errors({ ...good, F009: good.F002 });
    expect(stray.code).toBe(1);
    expect(stray.text).toContain('F009: in the manifest but has no source');
  });

  it('reports a needed id without an output and sizes over the caps', () => {
    expect(errors(good, '--need', put('need.json', '["F001","F007"]')).text).toContain('F007: needed by the game');
    expect(errors(good, '--max-bytes', '9').text).toContain('10 bytes of outputs is over the cap of 9');
    expect(errors(good, '--max-file-bytes', '5').text).toContain('F002.webp: 6 bytes is over the file cap of 5');
  });

  it('exits 2 on bad usage, a missing manifest or a missing folder', () => {
    expect(art([], io)).toBe(2);
    expect(art(['--manifest', join(dir, 'none.json'), '--sources', src, '--out', out, '--ext', 'webp'], io)).toBe(2);
    expect(art(['--manifest', put('manifest.json', '{}'), '--sources', join(dir, 'nowhere'), '--out', out, '--ext', 'webp'], io)).toBe(2);
  });

  it('fails when no source matched, even with an empty manifest', () => {
    mkdirSync(join(dir, 'empty'));
    lines.length = 0;
    expect(art(['--manifest', put('manifest.json', '{}'), '--sources', join(dir, 'empty'), '--out', join(dir, 'empty'), '--ext', 'webp'], io)).toBe(1);
    expect(lines.join('\n')).toContain('no source file in');
  });

  it('exits 2 when a cap is not a non-negative integer', () => {
    for (const bad of ['abc', '-1', '1.5', '']) {
      expect(errors(good, '--max-bytes', bad).code).toBe(2);
      expect(errors(good, '--max-file-bytes', bad).code).toBe(2);
    }
    expect(errors(good, '--max-bytes', '0').code).toBe(1);
  });
});

describe('text-leak', () => {
  const printed = 'When the lantern keeper arrives, each rival must discard two amber tokens or lose a turn.';
  const diff = [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -3,0 +4,2 @@',
    '+const x = 1;',
    "+const t = 'each rival must discard two amber tokens or lose';",
    '@@ -20 +22 @@',
    '-old',
    '+// The lantern keeper arrives late, nothing more',
    '--- a/gone.ts',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-each rival must discard two amber tokens or lose a turn',
  ].join('\n');

  it('reads the added lines of a diff with their line numbers', () => {
    expect(addedLines(diff).map((a) => `${a.file}:${String(a.line)}`)).toEqual(['src/a.ts:4', 'src/a.ts:5', 'src/a.ts:22']);
    expect(addedLines('')).toEqual([]);
  });

  it('tells headers from content by position, and reads quoted and unprefixed paths', () => {
    const tricky = [
      '+++ b/x.ts',
      '@@ -0,0 +1,3 @@',
      '+++ b/fake.ts',
      '+@@ -1 +9 @@',
      '+real',
      '+++ "b/s p/\\303\\251 \\"q\\".ts"',
      '@@ -2 +7 @@',
      '-++ gone',
      '+seven',
      '+++ plain/y.ts\t',
      '@@ -1,0 +3 @@',
      '+three',
    ].join('\n');
    expect(addedLines(tricky)).toEqual([
      { file: 'x.ts', line: 1, text: '++ b/fake.ts' },
      { file: 'x.ts', line: 2, text: '@@ -1 +9 @@' },
      { file: 'x.ts', line: 3, text: 'real' },
      { file: 's p/é "q".ts', line: 7, text: 'seven' },
      { file: 'plain/y.ts', line: 3, text: 'three' },
    ]);
    expect(diffPath('/dev/null')).toBeNull();
    expect(diffPath('"b/a\\tb"')).toBe('a\tb');
  });

  it('finds the longest run and shows only its first five words', () => {
    const grams: Grams = new Map();
    addGrams(grams, printed, 'cards', 6);
    expect(leaks(addedLines(diff), grams, 6)).toEqual([{ file: 'src/a.ts', line: 5, run: 9, src: 'cards', head: 'each rival must discard two' }]);
    expect(leaks(addedLines(diff), new Map(), 6)).toEqual([]);
  });

  it('takes JSON strings under the named keys only', () => {
    const data = { id: 'not this', faces: [{ printed: 'one', note: { text: ['two'] } }] };
    expect(jsonStrings(data, ['printed', 'text'])).toEqual(['one', 'two']);
    expect(jsonStrings(data, [])).toEqual(['not this', 'one', 'two']);
  });

  it('run: exit 1 with hits, 0 without, 2 on bad usage or a missing file', () => {
    mkdirSync(join(dir, 'texts'));
    writeFileSync(join(dir, 'texts', 'cards.json'), JSON.stringify([{ id: 'x', printed }]));
    writeFileSync(join(dir, 'texts', 'rules.txt'), 'A rulebook line that nobody copied anywhere at all.');
    const d = put('a.diff', diff);
    lines.length = 0;
    expect(leak(['--diff', d, '--source', join(dir, 'texts'), '--json-keys', 'printed'], io)).toBe(1);
    expect(lines[0]).toBe('src/a.ts:5: 9 words ~ cards.json | "each rival must discard two ..."');
    expect(leak(['--diff', d, '--source', join(dir, 'texts'), '--json-keys', 'flavor'], io)).toBe(0);
    expect(leak(['--diff', d, '--source', join(dir, 'texts'), '--n', '10'], io)).toBe(0);
    expect(leak(['--diff', put('empty.diff', ''), '--source', join(dir, 'texts')], io)).toBe(0);
    expect(leak(['--diff', d], io)).toBe(2);
    expect(leak(['--source', join(dir, 'texts')], io)).toBe(2);
    expect(leak(['--diff', d, '--base', 'x', '--source', join(dir, 'texts')], io)).toBe(2);
    expect(leak(['--diff', join(dir, 'none.diff'), '--source', join(dir, 'texts')], io)).toBe(2);
    expect(leak(['--diff', d, '--source', join(dir, 'no-texts')], io)).toBe(2);
  });

  it('run exits 2 when no source gave a run of n words', () => {
    const d = put('b.diff', diff);
    mkdirSync(join(dir, 'no-grams'));
    expect(leak(['--diff', d, '--source', join(dir, 'no-grams')], io)).toBe(2);
    writeFileSync(join(dir, 'no-grams', 'cards.json'), JSON.stringify([{ id: 'x', printed }]));
    expect(leak(['--diff', d, '--source', join(dir, 'no-grams'), '--json-keys', 'flavor'], io)).toBe(2);
    expect(leak(['--diff', d, '--source', join(dir, 'no-grams'), '--n', '40'], io)).toBe(2);
    expect(leak(['--diff', d, '--source', join(dir, 'no-grams'), '--json-keys', 'printed'], io)).toBe(1);
  });

  const git = (repo: string, ...a: string[]) =>
    spawnSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8', timeout: 30_000 });
  it.skipIf(spawnSync('git', ['--version'], { timeout: 30_000 }).status !== 0)('run reads the diff from git since --base and leaves out --exclude paths', () => {
    const repo = join(dir, 'repo');
    mkdirSync(join(repo, 'src'), { recursive: true });
    mkdirSync(join(repo, 'texts'));
    git(repo, 'init', '-q');
    writeFileSync(join(repo, 'src', 'a.ts'), 'const a = 1;\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'one');
    writeFileSync(join(repo, 'src', 'a.ts'), "const a = 1;\nconst t = 'each rival must discard two amber tokens or lose';\n");
    writeFileSync(join(repo, 'src', 'é b.ts'), '// ++ lose a turn\n// each rival must discard two amber tokens\n');
    writeFileSync(join(repo, 'texts', 'cards.txt'), `${printed}\n`);
    git(repo, 'add', '.');
    expect(git(repo, 'commit', '-q', '-m', 'two').status).toBe(0);
    const args = ['--base', 'HEAD~1', '--repo', repo, '--source', join(repo, 'texts')];
    lines.length = 0;
    expect(leak([...args, '--exclude', 'texts'], io)).toBe(1);
    expect(lines.slice(0, -1)).toEqual([
      'src/a.ts:2: 9 words ~ cards.txt | "each rival must discard two ..."',
      'src/é b.ts:2: 7 words ~ cards.txt | "each rival must discard two ..."',
    ]);
    lines.length = 0;
    expect(leak(args, io)).toBe(1);
    expect(lines.some((l) => l.startsWith('texts/cards.txt:1: 16 words'))).toBe(true);
    expect(leak(['--base', 'HEAD', '--repo', repo, '--source', join(repo, 'texts')], io)).toBe(0);
    expect(leak(['--base', 'no-such-commit', '--repo', repo, '--source', join(repo, 'texts')], io)).toBe(2);
  });
});

describe('gen-from-table', () => {
  const plan = [
    '# Plan',
    '## 3.1 Other',
    '| Id | Note |',
    '|---|---|',
    '| X-1 | not this |',
    '',
    '## 3.2 Rulings in effect',
    'Some words.',
    '',
    '| Id | In **short** | The decision |',
    '|---|:--|---|',
    '| R-01 | A tie at the `gate` | The **active** seat wins \\| or passes |',
    '| R-02 | `a | b` stays whole | |',
    'After the table.',
    '## 3.3 Empty',
    '| Id | Note |',
    '|---|---|',
    '## 3.4 None',
    'No table here.',
  ].join('\r\n');

  it('splits rows on pipes outside code spans and escapes', () => {
    expect(splitRow('| a | `x | y` | b \\| c |')).toEqual(['a', '`x | y`', 'b | c']);
    expect(splitRow('| a | |')).toEqual(['a', '']);
    expect(splitRow('not a row')).toBeNull();
  });

  it('reads the table under the named heading', () => {
    const table = tableAfter(plan, 'Rulings in effect');
    expect(table === null ? null : records(table)).toEqual([
      { id: 'R-01', in_short: 'A tie at the gate', the_decision: 'The active seat wins | or passes' },
      { id: 'R-02', in_short: 'a | b stays whole', the_decision: '' },
    ]);
    expect(tableAfter(plan, '')?.rows).toEqual([['X-1', 'not this']]);
    expect(tableAfter(plan, '3.3 Empty')?.rows).toEqual([]);
    expect(tableAfter(plan, '3.4 None')).toBeNull();
    expect(tableAfter(plan, 'No such heading')).toBeNull();
    expect(tableAfter('', '')).toBeNull();
  });

  it('run writes the file and --check tells current from stale', () => {
    const p = put('plan.md', plan);
    const out = join(dir, 'rulings.ts');
    const args = ['--plan', p, '--heading', 'Rulings in effect', '--out', out, '--name', 'RULINGS'];
    expect(gen([...args, '--check'], io)).toBe(1);
    expect(gen(args, io)).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe(
      '// GENERATED from plan.md "Rulings in effect" by gen-from-table: do not edit by hand.\nexport const RULINGS = [\n' +
        '  {"id":"R-01","in_short":"A tie at the gate","the_decision":"The active seat wins | or passes"},\n' +
        '  {"id":"R-02","in_short":"a | b stays whole","the_decision":""},\n] as const;\n',
    );
    expect(gen([...args, '--check'], io)).toBe(0);
    writeFileSync(out, readFileSync(out, 'utf8').replace(/\n/g, '\r\n'));
    expect(gen([...args, '--check'], io)).toBe(0);
    put('plan.md', plan.replace('A tie', 'A draw'));
    expect(gen([...args, '--check'], io)).toBe(1);
    const json = join(dir, 'other.json');
    expect(gen(['--plan', p, '--heading', '3.1 Other', '--out', json], io)).toBe(0);
    expect(JSON.parse(readFileSync(json, 'utf8'))).toEqual([{ id: 'X-1', note: 'not this' }]);
  });

  it('run exits 2 on bad usage, a missing table, a missing plan or a failing write', () => {
    const p = put('plan2.md', plan);
    expect(gen(['--plan', p], io)).toBe(2);
    expect(gen(['--plan', p, '--out', join(dir, 'x.ts'), '--name', 'not a name'], io)).toBe(2);
    expect(gen(['--plan', p, '--heading', '3.4 None', '--out', join(dir, 'x.ts')], io)).toBe(2);
    expect(gen(['--plan', join(dir, 'none.md'), '--out', join(dir, 'x.ts')], io)).toBe(2);
    expect(gen(['--plan', p, '--out', join(dir, 'no-folder', 'x.ts')], io)).toBe(2);
    const none = join(dir, 'none.ts');
    expect(gen(['--plan', p, '--heading', '3.3 Empty', '--out', none], io)).toBe(2);
    expect(gen(['--plan', put('twice.md', '| Id | id! |\n|---|---|\n| a | b |\n'), '--out', none], io)).toBe(2);
    expect(existsSync(none)).toBe(false);
  });
});
