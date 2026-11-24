import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, expect, it } from 'vitest';
import { contextPacket } from './context.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-context-contracts-'));
const cli = path.join(import.meta.dirname, 'context.mjs');
const rules = '# Fixture\n## Rules for agents\nUse immutable legal inputs.\n';
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function fixture(component, files) {
  const dir = path.join(root, component);
  fs.mkdirSync(dir);
  for (const [name, content] of Object.entries({
    'component.json': JSON.stringify({ name: component }),
    'README.md': rules,
    ...files,
  })) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

const read = (component, maxChars = 6000) => contextPacket({ root, component, symbol: 'play', maxChars });
const contract = packet => packet.contracts.map(row => row.signature).join('\n');

it('supplies transitive, private, cyclic and generic dependencies through aliases and re-exports', () => {
  fixture('type-closure', {
    'index.ts': "export { act as play } from './src/impl.js';",
    'src/impl.ts': "import type { Choice } from './barrel.js'; export function act<T extends Choice>(move: T): T { return move; }",
    'src/barrel.ts': "export type { Move as Choice } from './moves.js';",
    'src/moves.ts': 'export interface Move { cost: Cost }; interface Cost { amount: number; prior?: Move }; interface Unrelated { secret: boolean }',
  });
  const packet = read('type-closure');
  expect(packet).toMatchObject({ status: 'complete', requiredReads: [] });
  expect(packet.contracts[0]).toMatchObject({ symbol: 'play', file: 'src/impl.ts', line: 1 });
  const text = contract(packet);
  for (const term of ['T extends Choice', 'Move as Choice', 'interface Move', 'interface Cost', 'prior?: Move']) {
    expect(text).toContain(term);
  }
  expect(text).not.toContain('Unrelated');
  expect(packet).toEqual(read('type-closure'));
});

it('keeps overloads, class instance members, conditional types and mapped types', () => {
  fixture('overloads', {
    'index.ts': `
      type PickResult<T> = T extends string ? { [K in T]: number } : boolean;
      class Counter { constructor(public amount: number) {} take(n: number): number { return this.amount - n; } }
      export function play(n: number): Counter;
      export function play<T extends string>(n: T): PickResult<T>;
      export function play(n: number | string): unknown { return typeof n === 'number' ? new Counter(n) : { [n]: 1 }; }
    `,
  });
  const packet = read('overloads');
  expect(packet.status).toBe('complete');
  const text = contract(packet);
  for (const term of ['play(n: number): Counter', 'play<T extends string>', 'constructor(amount: number)', 'take(n: number): number', 'T extends string ?', '[K in T]']) {
    expect(text).toContain(term);
  }
  expect(text).not.toContain('new Counter');
});

it('prints a class entrypoint with both constructor and public instance API', () => {
  fixture('class-api', { 'index.ts': 'export class play { constructor(public amount: number) {} take(n: number): number { return this.amount - n; } }' });
  const packet = read('class-api');
  expect(packet.status).toBe('complete');
  expect(contract(packet)).toContain('take(n: number): number');
  expect(contract(packet)).toContain('amount: number');
});

it('resolves qualified generic constraints in remapped types without importing unrelated declarations', () => {
  fixture('namespace-constraint', {
    'index.ts': [
      "import type * as Rules from './support.js';",
      'type Form<T extends Rules.Cost> = { [K in keyof T as `cfg_${string & K}`]: T[K] };',
      'export function play<T extends Rules.Cost>(value: T): Form<T> { return value as unknown as Form<T>; }',
    ].join('\n'),
    'support.ts': 'export interface Cost { value: number }; export interface Other { unrelated: never }',
  });
  const packet = read('namespace-constraint');
  expect(packet).toMatchObject({ status: 'complete', requiredReads: [] });
  const text = contract(packet);
  expect(text).toContain('import type * as Rules');
  expect(text).toContain('interface Cost');
  expect(text).toContain('cfg_${string & K}');
  expect(text).not.toContain('interface Other');
});

it('includes nested explicit any but reports inferred any from a confined sibling even at a tight budget', () => {
  fixture('any-intentional', { 'index.ts': 'export function play(): { result: any } { return { result: 3 }; }' });
  fixture('away', { 'index.ts': "export const hidden = 'prohibited fixture sentinel';" });
  fixture('any-unresolved', {
    'index.ts': "export { run as play } from './nested.ts';",
    'nested.ts': "import { hidden } from '../away/index.ts'; export const run = () => ({ result: hidden });",
  });
  expect(read('any-intentional').status).toBe('complete');
  for (const maxChars of [500, 6000]) {
    const packet = read('any-unresolved', maxChars);
    expect(packet.status).toBe('incomplete');
    expect(packet.requiredReads).toContain('nested.ts');
    expect(JSON.stringify(packet)).not.toContain('prohibited fixture sentinel');
    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(maxChars);
  }
});

it('reports a missing explicitly named type in an otherwise well-formed declaration', () => {
  fixture('missing-type', { 'index.ts': "import type { Cost } from './missing.js'; export function play(cost: Cost): number { return 0; }" });
  expect(read('missing-type')).toMatchObject({ status: 'incomplete', requiredReads: ['index.ts'] });
});

it('includes an essential constraint outside Rules for agents or requires the README, with CLI exit 2', () => {
  fixture('usage-constraints', {
    'index.ts': 'export const play = 1;',
    'README.md': rules + '\n## Applying the result\nCommit atomically only after checking all costs. ' + 'More details. '.repeat(50),
  });
  const full = read('usage-constraints');
  expect(full.status).toBe('complete');
  expect(JSON.stringify(full)).toContain('Commit atomically only after checking all costs.');
  const tight = read('usage-constraints', 500);
  expect(tight).toMatchObject({ status: 'incomplete', requiredReads: ['README.md'] });
  expect(JSON.stringify(tight).length).toBeLessThanOrEqual(500);
  const run = spawnSync(process.execPath, [cli, 'usage-constraints', 'play', '--root', root, '--max-chars', '500'], { encoding: 'utf8' });
  expect(run.status, run.stderr).toBe(2);
  expect(JSON.parse(run.stdout)).toEqual(tight);
});

it('preserves the path to a required supporting declaration dropped by the serialized budget', () => {
  fixture('support-budget', {
    'index.ts': "import type { Move } from './support.js'; export function play(move: Move): boolean { return !!move; }",
    'support.ts': `export type Move = '${'m'.repeat(750)}';`,
  });
  const packet = read('support-budget', 550);
  expect(packet.status).toBe('incomplete');
  expect(packet.requiredReads).toContain('support.ts');
  expect(JSON.stringify(packet).length).toBeLessThanOrEqual(550);
});

it('includes or names a Rules-linked usage guide while confining guide symlinks', () => {
  const files = {
    'index.ts': 'export const play = 1;',
    'README.md': rules + 'Follow the [application contract](play.md).',
    'play.md': 'Revalidate the selection before commit. ' + 'Additional policy. '.repeat(70),
  };
  const dir = fixture('local-guide', files);
  fs.renameSync(path.join(dir, 'play.md'), path.join(dir, 'guide.md'));
  fs.symlinkSync('guide.md', path.join(dir, 'play.md'));
  const packet = read('local-guide');
  expect(packet).toMatchObject({ status: 'complete', requiredReads: [] });
  expect(packet.usage).toContainEqual(expect.objectContaining({ file: 'play.md', text: expect.stringContaining('Revalidate') }));
  expect(read('local-guide', 500)).toMatchObject({ status: 'incomplete', requiredReads: ['play.md'] });

  const away = fixture('escape-guide', files);
  fs.unlinkSync(path.join(away, 'play.md'));
  fs.symlinkSync(path.join(dir, 'guide.md'), path.join(away, 'play.md'));
  expect(() => read('escape-guide')).toThrow('play.md escapes component');
});

it('follows required guides through relative links and terminates when they link back', () => {
  fixture('nested-guide', {
    'index.ts': 'export const play = 1;',
    'README.md': rules + 'Follow the [application guide](guides/application.md).',
    'guides/application.md': 'The [atomic application contract](atomic.md) is required.',
    'guides/atomic.md': 'Reserve the cost before changing authoritative state. See [application](application.md).',
  });
  const packet = read('nested-guide');
  expect(packet).toMatchObject({ status: 'complete', requiredReads: [] });
  expect(packet.usage).toContainEqual(expect.objectContaining({
    file: 'guides/atomic.md', text: expect.stringContaining('Reserve the cost before changing authoritative state.'),
  }));
});
