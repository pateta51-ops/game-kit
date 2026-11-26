import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const kit = path.dirname(path.dirname(import.meta.dirname));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'card-assembly-'));
const source = path.join(tmp, 'source');
const modules = path.join(kit, 'node_modules');
const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: kit, encoding: 'utf8' }).trim();
interface Example {
  version: number; id: string; name: string; opponent: string;
  assembly: { kind: string; version: number; cards: Record<string, unknown>[]; printed: Record<string, unknown>[]; setup: object };
}
const examples = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'reference-cards.examples.json'), 'utf8')) as Record<'standard' | 'varied', Example>;
let ref: string;
const git = (...args: string[]) => execFileSync('git', args, { cwd: source, encoding: 'utf8' }).trim();
const write = (name: string, value: unknown): string => {
  const file = path.join(tmp, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
};
const ports = write('ports', { games: { 'reference-cards-demo': { block: 6990, serve: { local: 4199 } } } });
const run = (command: string, value: unknown, ...args: string[]) => spawnSync(process.execPath,
  [path.join(source, 'kit.mjs'), 'spec', command, write('spec', value), '--ref', ref, ...args], { cwd: source, encoding: 'utf8' });
const generate = (name: string, value: unknown = examples.standard) => {
  const dir = path.join(tmp, name);
  const result = run('generate', value, '--dir', dir, '--ports', ports, '--link', modules);
  expect(result.status, result.stdout + result.stderr).toBe(0);
  return dir;
};
const consumer = (dir: string, ...args: string[]) => spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8' });

beforeAll(() => {
  execFileSync('git', ['clone', '--quiet', '--shared', '--no-checkout', kit, source]);
  git('sparse-checkout', 'set', '--no-cone', '/kit.mjs', '/components/scaffold/', '/ports.json');
  git('checkout', '--quiet', '--detach', base);
  fs.cpSync(path.join(kit, 'components/scaffold'), path.join(source, 'components/scaffold'), { recursive: true });
  git('add', 'components/scaffold');
  ref = git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit-tree', git('write-tree'), '-p', base, '-m', 'Card assembly fixture');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('bounded reference card assembly', () => {
  it('selects the explicit card composition and rejects unsupported profiles or opponents', () => {
    const result = run('resolve', examples.standard);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ assembly: { kind: 'reference-cards', version: 1 }, commit: ref });
    for (const value of [{ ...examples.standard, opponent: 'heuristic' }, { ...examples.standard, profiles: ['lcg'] }]) {
      const refused = run('resolve', value);
      expect(refused.status, refused.stdout + refused.stderr).toBe(1);
    }
  });

  it('rejects unsupported shapes and incorrect independent expectations without publishing a destination', () => {
    const assembly = examples.standard.assembly;
    const invalid = [
      { ...assembly, version: 2 },
      { ...assembly, setup: { life: [10, 10], rounds: 0, level: 'normal' } },
      { ...assembly, cards: assembly.cards.map(card => card.id === 'rally' ? { ...card, effect: [{ op: 'boost', n: 2 }, { op: 'draw', n: 1 }] } : card) },
      { ...assembly, cards: assembly.cards.map(card => card.id === 'mend' ? { ...card, when: [{ on: 'damage', if: 'mine', optional: false, then: [{ op: 'heal', n: 1 }] }] } : card) },
      { ...assembly, printed: assembly.printed.slice(1) },
      // Both sides are individually valid; only real semantic acceptance can reject this mismatch.
      { ...assembly, cards: assembly.cards.map(card => card.id === 'jab' ? { ...card, effect: [{ op: 'hit', n: 4 }] } : card) },
    ];
    for (const [index, value] of invalid.entries()) {
      const dir = path.join(tmp, `invalid-${index}`);
      const result = run('generate', { ...examples.standard, assembly: value }, '--dir', dir, '--ports', ports, '--link', modules);
      expect(result.status, result.stdout + result.stderr).toBe(1);
      expect(result.stderr).toContain('reference-cards');
      expect(fs.existsSync(dir)).toBe(false);
      expect(fs.readdirSync(tmp).filter(file => file.startsWith('.kit-spec-'))).toEqual([]);
    }
  }, 60_000);

  it('runs configured content and setup through the same engine, store, simulation and hidden acceptance', () => {
    for (const name of ['standard', 'varied'] as const) {
      const dir = generate(name, examples[name]);
      for (const args of [
        ['node_modules/typescript/bin/tsc', '-b', '--noEmit'],
        ['node_modules/vitest/vitest.mjs', 'run'],
        ['node_modules/eslint/bin/eslint.js', 'src', 'tests'],
        ['kit/plan-checker/plancheck.ts', '--plan', 'docs/PLAN.md', '--applicability', 'docs/check-applicability.json', '--cover', 'Rules'],
      ]) {
        const checked = consumer(dir, ...args);
        expect(checked.status, args.join(' ') + '\n' + checked.stdout + checked.stderr).toBe(0);
      }
      const accepted = consumer(dir, 'tests/acceptance.ts');
      expect(accepted.status, accepted.stdout + accepted.stderr).toBe(0);
      const evidence = JSON.parse(accepted.stdout) as { scope: string[]; hiddenStatus: string; hidden: { problems: string[] } };
      expect(evidence.scope).toEqual(examples[name].assembly.printed.map(clause => clause.id));
      expect(evidence.hiddenStatus).toBe('executed');
      expect(evidence.hidden.problems).toEqual([]);
      const wrong = consumer(dir, 'tests/acceptance.ts', '--wrong-amount');
      expect(wrong.status, wrong.stdout + wrong.stderr).toBe(1);
      const wrongEvidence = JSON.parse(wrong.stdout) as { runtime: { cases: { line: string; status: string }[]; problems: string[] } };
      expect(wrongEvidence.runtime.cases.some(result => result.line === 'jab.1' && result.status === 'assertion-failed')).toBe(true);
      expect(wrongEvidence.runtime.problems.length).toBeGreaterThan(0);
    }
    for (const file of ['src/engine/rules.ts', 'src/engine/game.ts', 'src/engine/sim.ts', 'src/ui/store.ts', 'tests/acceptance.ts'])
      expect(fs.readFileSync(path.join(tmp, 'standard', file), 'utf8')).toBe(fs.readFileSync(path.join(tmp, 'varied', file), 'utf8'));
  }, 180_000);

  it('keeps the native acceptance command separate from bootstrap and binds its declared rule inputs', () => {
    const dir = generate('receipt-contract');
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['test:acceptance']).toContain('acceptance-runner.config.json');
    expect(pkg.scripts['test:bootstrap']).toContain('bootstrap-runner.config.json');
    const full = JSON.parse(fs.readFileSync(path.join(dir, 'scripts/acceptance-runner.config.json'), 'utf8')) as { last: string[]; receipt: object };
    expect(full.last).toEqual(['test:e2e']);
    expect(full.receipt).toEqual({ output: 'evidence/acceptance.json', spec: 'docs/game-spec.json', acceptance: 'docs/acceptance.json' });
    const definition = JSON.parse(fs.readFileSync(path.join(dir, 'docs/acceptance.json'), 'utf8')) as { componentObservations: unknown[] };
    expect(definition.componentObservations).toContainEqual({ id: 'store-simulation', component: 'game-store', script: 'test', behavior: 'A configured reference card game reaches the same terminal state and answer trace through the live store and simulation.', consumerKind: 'reference' });
  });

  it('lints the authored project while excluding retained generated consumers in evidence', () => {
    const dir = generate('lint-evidence');
    const nested = path.join(dir, 'evidence', 'variant-consumer');
    const generated = run('generate', examples.varied, '--dir', nested, '--ports', ports, '--link', modules);
    expect(generated.status, generated.stdout + generated.stderr).toBe(0);
    fs.writeFileSync(path.join(nested, 'retained-failure.mjs'), 'retainedUndefined();\n');
    const lint = () => consumer(dir, 'node_modules/eslint/bin/eslint.js', '.');
    const passed = lint();
    expect(passed.status, passed.stdout + passed.stderr).toBe(0);
    fs.writeFileSync(path.join(dir, 'scripts', 'authored-failure.mjs'), 'authoredUndefined();\n');
    const refused = lint();
    expect(refused.status, refused.stdout + refused.stderr).toBe(1);
    expect(refused.stdout).toContain('authoredUndefined');
  }, 60_000);

  it('uses the selected pin and refuses an older pin that lacks this adapter', () => {
    // The selected pin cannot borrow this adapter from the dirty checkout.
    const file = path.join(source, 'components/scaffold/reference-cards/src/engine/rules.ts.tpl');
    fs.appendFileSync(file, '\nthrow new Error("dirty template must not run");\n');
    try { expect(generate('pinned')).toBeTypeOf('string'); } finally { fs.writeFileSync(file, fs.readFileSync(path.join(kit, 'components/scaffold/reference-cards/src/engine/rules.ts.tpl'))); }
    // A checkout after this capability lands may have it at base; an explicit pre-adapter pin is stable.
    const prior = spawnSync(process.execPath, [path.join(source, 'kit.mjs'), 'spec', 'resolve', write('prior-spec', examples.standard), '--ref', 'v0.286.0'], { cwd: source, encoding: 'utf8' });
    expect(prior.status, prior.stdout + prior.stderr).toBe(1);
    expect(prior.stderr).toContain('assembly');
  });

  it.skipIf(!process.env['PW_CHROMIUM_PATH'] && !fs.existsSync(chromium.executablePath()) && !process.env['CI'])('plays the actual browser game and rejects a disconnected card button', () => {
    const dir = generate('browser');
    const play = () => spawnSync(process.execPath, ['kit/ci-templates/full-gate.mjs', 'e2e'], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, E2E_SCRIPTS: 'test:e2e' },
    });
    const good = play();
    expect(good.status, good.stdout + good.stderr).toBe(0);
    expect(good.stdout).toContain('Card browser acceptance passed');
    const file = path.join(dir, 'src/ui/App.tsx');
    const before = fs.readFileSync(file, 'utf8');
    expect(before).toContain('game.answer(picks, id)');
    fs.writeFileSync(file, before.replace('game.answer(picks, id)', 'false'));
    const broken = play();
    expect(broken.status, broken.stdout + broken.stderr).toBe(1);
  }, 90_000);
});
