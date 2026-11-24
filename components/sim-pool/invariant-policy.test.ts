import { expect, it } from 'vitest';
import { isChecking } from '../engine-core/index.ts';
import { fuzz, fuzzMain, playOne } from './index.ts';
import { simGame } from './fake/invariant-board.ts';

const module = new URL('./fake/invariant-board.ts', import.meta.url).href;

it('reports strict setup violations in the actual simulator without its global toggle', () => {
  expect(isChecking()).toBe(false);
  expect(playOne(simGame, null, { index: 0, seed: 'bad setup', driver: 'random' })).toMatchObject({
    actions: 0, result: null, violations: [{ id: 'zone:cards' }],
  });
});

it('reports seeded fuzz-generated invalid states rather than recording completed games', async () => {
  expect(isChecking()).toBe(false);
  const run = await fuzz(module, { games: 25, workers: 2 });
  expect(run.findings).toHaveLength(25);
  expect(run.findings.every(f => f.kind === 'violation' && f.step === 1)).toBe(true);
  const ids = run.records.flatMap(r => r.violations?.map(v => v.id) ?? []);
  expect(new Set(ids)).toEqual(new Set(['zone:cards', 'owner:card', 'total:tokens', 'counter:tokens']));
  expect(isChecking()).toBe(false);
});

it('uses the same simulation failure diagnostics in strict and diagnostic modes', () => {
  const spec = { index: 0, seed: 'test-board', driver: 'random' };
  const strict = playOne(simGame, null, spec);
  const diagnostic = playOne({ ...simGame, rules: { ...simGame.rules, invariantPolicy: 'diagnostic' } }, null, spec);
  expect(strict.violations?.length).toBeGreaterThan(0);
  expect(diagnostic.violations).toEqual(strict.violations);
  expect(diagnostic.result).toBeNull();
});

it('fails the fuzz command when a strict invariant rejects a state', async () => {
  const lines: string[] = [];
  expect(await fuzzMain(['--seed', 'bad setup'], module, {}, line => { lines.push(line); })).toBe(1);
  expect(lines).toContain('violation seed bad setup step 0 (random)');
});
