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

const directive = 'You must reserve all costs before mutating state.';

it('keeps visible rule text after an HTML comment', () => {
  fixture('visible-rule', rules + '<!-- maintainer note --> ' + directive);
  const full = run('visible-rule');
  expect(full.status, full.stderr).toBe(0);
  const packet = JSON.parse(full.stdout);
  expect(packet).toMatchObject({ status: 'complete', requiredReads: [], omitted: 0 });
  expect(packet.rules).toContainEqual({ file: 'README.md', line: 3, text: directive });
});

it.each([
  ['inline', '<!-- [hidden example](absent.md) --> ' + link + '(atomic.md).'],
  ['reference', '<!-- [hidden example](absent.md) --> ' + link + '[atomic].\n\n[atomic]: atomic.md'],
  ['trailing-reference', '<!-- [hidden example](absent.md) --> ' + link + '[atomic].\n[atomic]: atomic.md'],
  ['multiline', '<!-- [hidden example](absent.md)\nmaintainer note\n--> ' + link + '(atomic.md).'],
])('loads the required %s guide from visible Rules text after a leading comment', (form, readme) => {
  const name = 'visible-rule-guide-' + form;
  fixture(name, rules + readme);
  const packet = expectComplete(run(name));
  expect(packet.rules.some(row => row.text.startsWith(link))).toBe(true);
  expect(JSON.stringify(packet)).not.toContain('hidden example');
});

it('loads a guide after a multiline Rules comment inside a list item', () => {
  fixture('list-comment-rule-guide', rules + '1000. <!-- note\n      hidden note\n      --> ' + link + '(atomic.md).');
  const packet = expectComplete(run('list-comment-rule-guide'));
  expect(packet.rules).toContainEqual({ file: 'README.md', line: 5, text: link + '(atomic.md).' });
});

it('preserves the list marker when an ordinary comment precedes a visible rule', () => {
  fixture('list-comment-sequence', rules + '1000. <!-- ordinary note -->\n' +
    '      <!-- editor note --> ' + link + '(atomic.md).');
  const packet = expectComplete(run('list-comment-sequence'));
  expect(packet.rules).toContainEqual({ file: 'README.md', line: 4, text: link + '(atomic.md).' });
});

it('keeps original guide links and treats links in neighboring fenced examples as literal', () => {
  fixture('visible-rule-fence', rules + '<!-- maintainer note --> ```\n\n```\n' +
    '[code example](absent.md)\n```\n\n' + link + '(atomic.md).');
  expectComplete(run('visible-rule-fence'));
});

it.each([
  ['indented-code', '    [code example](absent.md)'],
  ['raw-html', '<custom-example>\n[HTML example](absent.md)\n</custom-example>'],
])('preserves the original classification of %s adjacent to a recovered rule', (kind, literal) => {
  const name = 'adjacent-' + kind;
  fixture(name, rules + '<!-- note --> ' + link + '(atomic.md).\n' + literal);
  expectComplete(run(name));
});

it('recovers required guides independently across comment blocks', () => {
  fixture('separate-rule-comments', rules + '<!-- note --> ```\n\n<!-- note --> ' + link + '(atomic.md).');
  expectComplete(run('separate-rule-comments'));
});

it('returns the guide continuation when a visible link after a comment exceeds the budget', () => {
  fixture('tight-visible-guide', rules + '<!-- maintainer note --> ' + link + '(atomic.md).', {
    'atomic.md': constraint.repeat(40),
  });
  const result = run('tight-visible-guide', 600);
  expect(result.status, result.stderr).toBe(2);
  const serialized = result.stdout.trimEnd();
  expect(serialized.length).toBeLessThanOrEqual(600);
  expect(JSON.parse(serialized)).toMatchObject({ status: 'incomplete', requiredReads: ['atomic.md'], omitted: 1 });
});

it.each([
  ['missing', 'atomic.md is missing or unreadable'],
  ['escaping', 'atomic.md escapes component'],
])('refuses a visible link after a comment with a %s guide target', (kind, message) => {
  const name = kind + '-visible-rule-guide';
  const dir = fixture(name, rules + '<!-- maintainer note --> ' + link + '(atomic.md).', {});
  if (kind === 'escaping') {
    const outside = path.join(root, 'hidden-rule-guide.md');
    fs.writeFileSync(outside, 'OUTSIDE GUIDE');
    fs.symlinkSync(outside, path.join(dir, 'atomic.md'));
  }
  const result = run(name);
  expect(result.status, result.stdout).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(message);
  expect(result.stderr).not.toContain('OUTSIDE GUIDE');
});

it('reports a continuation when visible rule text after a comment cannot fit', () => {
  fixture('tight-visible-rule', rules + '<!-- maintainer note --> ' + directive.repeat(30));
  const tight = run('tight-visible-rule', 600);
  expect(tight.status, tight.stderr).toBe(2);
  const serialized = tight.stdout.trimEnd();
  expect(serialized.length).toBeLessThanOrEqual(600);
  expect(JSON.parse(serialized)).toMatchObject({ status: 'incomplete', requiredReads: ['README.md'], omitted: 1 });
});

it('excludes the hidden part of a multiline comment and keeps original source lines', () => {
  fixture('multiline-rule-comment', rules +
    '<!-- internal\n## Commented heading\nYou must ignore this example [link](absent.md).\n--> Keep audit notes.\n' +
    '\nRead the literal token `<!--` here.\n' +
    '\n```md\n<!-- literal opening marker\n```\n' +
    '\n' + link + '(atomic.md).\n\n## Usage\nUse legal inputs.');
  const packet = expectComplete(run('multiline-rule-comment'));
  expect(packet.rules).toContainEqual({ file: 'README.md', line: 6, text: 'Keep audit notes.' });
  const all = packet.rules.map(rule => rule.text).join('\n');
  expect(all).toContain('Read the literal token `<!--` here.');
  expect(all).toContain('```md\n<!-- literal opening marker\n```');
  expect(all).toContain(link + '(atomic.md).');
  expect(JSON.stringify(packet)).not.toContain('You must ignore this example');
});

it('resolves ordinary URL-escaped guide paths before inspecting their confinement', () => {
  fixture('escaped-destination', rules + link + '(notes%20here.md#apply).', { 'notes here.md': constraint });
  expectComplete(run('escaped-destination'), 'notes here.md');
});

it.each([
  ['wrapped-inline', 'Follow [the required transaction\ncontract](atomic.md).'],
  ['wrapped-reference', 'Follow the [required transaction contract][atomic\nupdates].\n\n[atomic updates]: atomic.md'],
  ['quoted-reference', '> Follow the [required transaction contract][atomic].\n>\n> [atomic]: atomic.md'],
  ['balanced-destination', link + '(atomic(v2).md).'],
  ['wrapped-nested-label', 'Read [the instruction for\n[Step 2]: apply it](atomic.md).'],
  ['quoted-example', '> ~~~md\n> [example](absent.md)\n> ~~~\n\n' + link + '(atomic.md).'],
  ['multiline-code', 'Read `the example\nwith <!-- then the marker`.\n\n' + link + '(atomic.md).'],
  ['linked-image', '[![guide](badge.png)](atomic.md) and ![label [example](missing-alt.md)](badge.png)'],
])('honors ordinary CommonMark guide forms through the real CLI for %s', (name, readme) => {
  const guide = name === 'balanced-destination' ? 'atomic(v2).md' : 'atomic.md';
  fixture(name, rules + readme, { [guide]: constraint });
  expectComplete(run(name), guide);
});

it('does not treat a definition printed inside inline code as a guide link', () => {
  fixture('literal-definition', rules + 'Read `the example\n[example]: missing-example.md`.\n\n' +
    '[example] and ' + link + '(atomic.md).');
  expectComplete(run('literal-definition'));
});

it.each([
  ['escaped-backtick', 'A literal \\` token. Read `the example\n[example]: missing-example.md\ncode ends`.'],
  ['definition-in-image', '![Illustration for\n[example]: missing-example.md\nshown](badge.png)'],
  ['definition-in-link-label', '[Illustration for\n[example]: missing-example.md\nshown](atomic.md)'],
])('does not promote apparent definitions inside %s', (name, example) => {
  fixture(name, rules + example + '\n\n[example] and ' + link + '(atomic.md).');
  expectComplete(run(name));
});
