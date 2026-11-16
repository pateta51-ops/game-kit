import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { engineLint, prefixDrift } from './index.js';

const UP = '.'.repeat(2); // check-components reads a quoted parent path as an import
// the fixtures are plain JavaScript, so the default parser reads them
const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: engineLint({ pure: ['src/shared'], allowImports: ['immer', 'a.b'], cow: { owned: ['stack'] }, cardPrefixes: ['core', 'sib', 'x+y'], cardFiles: ['src/**/*.{ts,tsx}'] }),
});
const lint = async (code: string, filePath = 'src/engine/probe.ts') =>
  (await eslint.lintText(code, { filePath }))[0]!.messages.map((m) => m.ruleId ?? m.message);
const bad = async (code: string, rule: string, filePath?: string) => expect(await lint(code, filePath), code).toEqual([rule]);
const ok = async (code: string, filePath?: string) => expect(await lint(code, filePath), code).toEqual([]);

describe('lint-preset', () => {
  it('purity: clock, random, DOM, timers, console, storage, process, Intl are refused in the engine', async () => {
    for (const code of ['Date.now()', 'new Date()', 'performance.now()', 'window.x', 'document.title', 'fetch("a")', 'setTimeout(f, 1)', 'setInterval(f, 1)', 'console.log(1)', 'localStorage.getItem("a")', 'process.env.A', 'new Intl.NumberFormat()', 'globalThis.Math'])
      await bad(`export const a = ${code};\n`, 'no-restricted-globals');
    await bad('export const a = Math.random();\n', 'no-restricted-properties');
    await bad('export const a = Date.now();\n', 'no-restricted-globals', 'src/shared/probe.ts');
    for (const file of ['src/engine/probe.mjs', 'src/engine/probe.js', 'src/engine/probe.tsx']) await bad('export const a = Date.now();\n', 'no-restricted-globals', file);
    await bad(`export const a = import('react');\n`, 'no-restricted-syntax');
    await ok('export const a = Math.floor(1.5);\nexport const date = (Date) => Date;\n');
    await ok('export const a = Date.now();\nconsole.log(Math.random());\n', 'src/ui/probe.ts');
  });

  it('imports: the engine imports its own files and the allowed modules; callers use the api file', async () => {
    for (const from of ['react', 'node:fs', 'zustand', `${UP}/ui/store`, `${UP}/${UP}/ui`]) await bad(`import x from '${from}';\nexport const a = x;\n`, 'no-restricted-imports');
    await ok(`import x from './core/rng';\nimport { produce } from 'immer';\nimport y from '${UP}/shared/ids';\nexport const a = [x, produce, y];\n`);
    await ok(`import x from 'a.b';\nexport const a = x;\n`);
    await bad(`import x from 'axb';\nexport const a = x;\n`, 'no-restricted-imports');
    await ok(`import x from 'react';\nexport const a = x;\n`, 'src/shared/probe.ts');
    await bad(`import x from '${UP}/engine/core/rng';\nexport const a = x;\n`, 'no-restricted-imports', 'src/ui/probe.tsx');
    await ok(`import x from '${UP}/engine/api';\nimport y from '${UP}/engine/api.ts';\nimport z from 'react';\nexport const a = [x, y, z];\n`, 'src/ui/probe.tsx');
  });

  it('copy on write: direct writes below the top level of the shared state are refused', async () => {
    for (const code of ['s.turn.step = 1', 's.a.b.c.d = 1', 'ctx.s.turn.step = 1', 's.turn.n++', 's.turn.n += 1', 'delete ctx.s.tokens.a.side', 's.bag.push(1)', 'ctx.s.a.b.sort()', 'Object.assign(s.turn, {})', 'shuffleInPlace(s.rng, t)', 'shuffleInPlace(ctx.s.rng, [])', 's.stack.items.push(1)', 'Object.assign(s.a.b, {})', 'Object.assign(ctx.s.turn, {})'])
      await bad(`${code};\n`, 'no-restricted-syntax');
    for (const code of ['own(s, "turn").step = 1', 's.n = 1', 's.stack.push(1)', 't.step = 1', 's.bag.map(String)', 'const n = s.turn.step', 'shuffleInPlace(own(s, "rng"), t)', 'Object.assign({}, s.turn)', 's.n++', 'delete s.a', 's.zone.stack.push(1)', 'Object.assign(local.opts, x)'])
      await ok(`${code};\n`);
    await ok('s.turn.step = 1;\n', 'src/ui/probe.ts');
    const plain = new ESLint({ overrideConfigFile: true, overrideConfig: engineLint({ engine: 'src\\engine\\', cow: false }) });
    const rules = async (code: string) => (await plain.lintText(code, { filePath: 'src/engine/probe.ts' }))[0]!.messages.map((m) => m.ruleId);
    expect(await rules('s.turn.step = 1;\n'), 'cow: false').toEqual([]);
    expect(await rules('export const a = Date.now();\n'), 'backslash folder').toEqual(['no-restricted-globals']);
  });

  it('card ids: a literal or template naming a real card is refused, in the engine and in cardFiles', async () => {
    await bad(`export const a = 'sib:04237';\n`, 'no-restricted-syntax');
    await bad('export const a = `core:01001`;\n', 'no-restricted-syntax');
    await bad(`export const a = 'sib:04237';\n`, 'no-restricted-syntax', 'src/ui/probe.ts');
    await bad(`export const a = 'x+y:1';\n`, 'no-restricted-syntax');
    await ok(`export const a = 'xxy:1';\n`);
    await ok(`export const a = 'sibling:one';\nexport const b = 'sib:x';\nexport const c = 'x:01001';\n`);
  });

  it('prefixDrift names the prefixes in one list only', () => {
    expect(prefixDrift(['core', 'sib'], ['sib', 'core'])).toEqual([]);
    expect(prefixDrift(['core', 'old'], ['core', 'new'])).toEqual(['old', 'new']);
  });
});
