import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, expect, it } from 'vitest';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-context-guides-'));
const cli = path.join(import.meta.dirname, 'context.mjs');
const rules = '# Fixture\n## Rules for agents\n';
const link = 'Follow the [required transaction contract]';
const constraint = 'Reserve all costs before mutating authoritative state.';
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function fixture(name, readme, guides = { 'atomic.md': constraint }) {
  const dir = path.join(root, name);
  for (const [file, text] of Object.entries({
    'component.json': JSON.stringify({ name }),
    'index.ts': 'export function play(value: number): number { return value + 1; }',
    'README.md': readme,
    ...guides,
  })) {
    const target = path.join(dir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
  return dir;
}

function run(name, budget = 100000) {
  const result = spawnSync(process.execPath, [cli, name, 'play', '--root', root, '--max-chars', String(budget)], { encoding: 'utf8' });
  expect(result.error).toBeUndefined();
  return result;
}

function expectComplete(result, file = 'atomic.md') {
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).toBe('');
  const packet = JSON.parse(result.stdout);
  expect(packet).toMatchObject({ status: 'complete', requiredReads: [], omitted: 0 });
  expect(packet.contracts[0]?.signature).toContain('play(value: number): number');
  expect(packet.usage).toContainEqual({ file, line: 1, text: constraint });
  return packet;
}

it.each([
  ['generic-later', rules + 'Apply legal inputs only.\n## Atomic updates\n' + link + '(atomic.md).'],
  ['reference-rules', rules + link + '[atomic].\n[atomic]: atomic.md'],
  ['inline-rules', rules + link + '(atomic.md).'],
  ['named-later', rules + 'Apply legal inputs only.\n## Atomic updates for play\n' + link + '(atomic.md).'],
])('includes the required guide through the real CLI for %s', (name, readme) => {
  fixture(name, readme);
  expectComplete(run(name));
});

it('includes nested guides once across normalized reference labels, fragments, and cycles', () => {
  fixture('recursive-guides', rules + 'Follow the [transaction][ Apply Plan ] and [repeat](guides/app.md#again).\n' +
    '## Definitions\n[apply   PLAN]: <guides/app.md#start> "Steps"\n', {
    'guides/app.md': 'See [atomic][] and [atomic].\n\n[ATOMIC]: <../atomic.md#required>',
    'atomic.md': constraint + '\nSee [application](guides/app.md).',
  });
  const first = run('recursive-guides');
  expect(first.status, first.stderr).toBe(0);
  const packet = JSON.parse(first.stdout);
  expect(packet).toMatchObject({ status: 'complete', requiredReads: [] });
  expect(packet.usage.filter(row => row.file !== 'README.md').map(row => row.file)).toEqual(['atomic.md', 'guides/app.md']);
  expect(packet.usage.find(row => row.file === 'atomic.md')?.text).toContain(constraint);
  expect(run('recursive-guides').stdout).toBe(first.stdout);
});

it('returns a bounded continuation when an essential reference guide cannot fit', () => {
  fixture('tight-guide', rules + 'Apply legal inputs only.\n## Atomic updates\n' + link + '[atomic].\n[atomic]: atomic.md', {
    'atomic.md': constraint.repeat(60),
  });
  const result = run('tight-guide', 1000);
  expect(result.status, result.stderr).toBe(2);
  const serialized = result.stdout.trimEnd();
  expect(serialized.length).toBeLessThanOrEqual(1000);
  expect(JSON.parse(serialized)).toMatchObject({ status: 'incomplete', requiredReads: ['atomic.md'], omitted: 1 });
});

it.each([
  ['missing-guide', {}, 'atomic.md is missing or unreadable'],
  ['malformed-guide', { 'atomic.md': Buffer.from([0xff, 0xfe]) }, 'atomic.md is not valid UTF-8 Markdown'],
  ['escaping-guide', { 'atomic.md': constraint }, 'atomic.md escapes component'],
])('reports an invalid required reference target for %s', (name, guides, diagnostic) => {
  const dir = fixture(name, rules + link + '[atomic].\n[atomic]: atomic.md', guides);
  if (name === 'escaping-guide') {
    const outside = path.join(root, 'outside.md');
    fs.writeFileSync(outside, 'UNAUTHORIZED TEXT');
    fs.unlinkSync(path.join(dir, 'atomic.md'));
    fs.symlinkSync(outside, path.join(dir, 'atomic.md'));
  }
  const result = run(name);
  expect(result.status, result.stdout).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(diagnostic);
  expect(result.stderr).not.toContain('UNAUTHORIZED TEXT');
});

it('follows a valid guide symlink and skips out-of-component and example links', () => {
  const dir = fixture('local-guide', rules +
    '[read][atomic] and [outside](../outside.md).\n[atomic]: ./atomic.md#apply\n' +
    '\n```md\n[example](missing-in-fence.md)\n```\n' +
    '<!-- [comment](missing-in-comment.md) -->\n' +
    '`[example](missing-in-code.md)`\n' +
    '![image](missing-image.md)', { 'guides/atomic.md': constraint });
  fs.writeFileSync(path.join(root, 'outside.md'), 'UNAUTHORIZED TEXT');
  fs.symlinkSync('guides/atomic.md', path.join(dir, 'atomic.md'));
  const result = run('local-guide');
  expectComplete(result);
  expect(JSON.parse(result.stdout).usage).not.toContainEqual(expect.objectContaining({ text: 'UNAUTHORIZED TEXT' }));
});

it('keeps prose after comment markers in fenced and inline examples', () => {
  fixture('example-comment', rules + 'An opening marker looks like `<!--`.\n' +
    '```md\n<!--\n```\n\n' + link + '(atomic.md).');
  expectComplete(run('example-comment'));
});

it('resolves ordinary URL-escaped guide paths before inspecting their confinement', () => {
  fixture('escaped-destination', rules + link + '(notes%20here.md#apply).', { 'notes here.md': constraint });
  expectComplete(run('escaped-destination'), 'notes here.md');
});
