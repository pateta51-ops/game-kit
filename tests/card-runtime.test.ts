import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { createProbe } from '../components/card-harness/index.ts';
import { runCardSuite } from '../components/card-harness/runtime.ts';
import { baseCards, currentPack, extraPrint, printed, suite, validateRecords } from './fixtures/card-runtime/pack.ts';

it('finds the newly admitted expansion card through the same validated loader and suite', () => {
  const base = runCardSuite(suite(currentPack(baseCards)));
  expect(base.problems).toEqual([]);
  const expanded = runCardSuite(suite(currentPack(baseCards, true), [...printed, extraPrint]));
  expect(expanded.problems).toEqual([]);
  expect(expanded.cases.map(c => [c.line, c.name, c.status])).toEqual([
    ['late.1', 'full resolve', 'passed'],
    ['pump.1', 'full resolve', 'passed'],
    ['pump.1', 'insufficient resource', 'passed'],
    ['scoop.1', 'full resolve', 'passed'],
    ['spark.1', 'full resolve', 'passed'],
  ]);
});

it('uses the command exit status to reject a loader-valid wrong amount', () => {
  const file = fileURLToPath(new URL('./fixtures/card-runtime/pack.ts', import.meta.url));
  const run = (args: string[]) => spawnSync(process.execPath, [file, ...args], { encoding: 'utf8' });
  expect(run([]).status).toBe(0);
  const bad = run(['--bad']);
  expect(bad.status).toBe(1);
  expect(bad.stdout).toContain('spark.1');
  expect(bad.stdout).toContain('expected delta 2');
  const invalid = run(['--invalid']);
  expect(invalid.status).toBe(1);
  expect(invalid.stdout).toContain('doesNotExist');
  expect(invalid.stdout).not.toContain('full resolve');
});

it('checks poor eligibility even when the player takes a legal pass', () => {
  const cheaper = [...baseCards.slice(0, 2), {
    id: 'pump', clause: 'pump.1', effects: [{ op: 'payThen', cost: [{ op: 'pay', res: 'fuel', amount: 1 }], then: [{ op: 'draw', count: 1 }] }],
  }];
  const report = runCardSuite(suite(currentPack(cheaper)));
  expect(report.covered).toEqual(['scoop.1', 'spark.1']);
  expect(report.cases).toContainEqual({ line: 'pump.1', name: 'insufficient resource', status: 'assertion-failed', detail: 'the clause option was offered' });
});

it('reports missing and unsupported separately and accepts an explicit game adapter', () => {
  const unsupported = { id: 'whistle', clause: 'whistle.1', effects: [{ op: 'custom', name: 'whistle' }] };
  const inventory = [...printed.slice(0, 2), { ...extraPrint, id: 'whistle.1', rule: { kind: 'gain', meter: 'fuel', amount: 1 } as const }];
  const input = suite(currentPack([baseCards[0], unsupported]), inventory);
  const report = runCardSuite(input);
  expect(report.cases.map(c => [c.line, c.status])).toEqual([
    ['scoop.1', 'missing-record'], ['spark.1', 'passed'], ['whistle.1', 'unsupported'],
  ]);
  const adapted = runCardSuite({
    ...input,
    families: { ...input.families, custom: input.families['gainResource']! },
    exempt: { 'scoop.1': 'This selected pack does not contain the trial scoop yet.' },
  });
  expect(adapted.covered).toEqual(['spark.1', 'whistle.1']);
  expect(adapted.problems).toEqual([]);
  expect(adapted.cases[0]?.status).toBe('exempt');
});

it('requires dispatch proof and a finite script', () => {
  const input = suite(currentPack([baseCards[0]]), [printed[0]!]);
  const noProof = runCardSuite({ ...input, start: (...args) => ({ ...input.start(...args), probe: createProbe() }) });
  expect(noProof.covered).toEqual([]);
  expect(noProof.cases[0]?.status).toBe('missing-evidence');
  const tooLong = runCardSuite({
    ...input,
    families: {
      gainResource: () => [{ name: 'loop', kind: 'resolve', layout: { line: 'spark.1', fuel: 1, cards: 1 },
        answers: Array.from({ length: 65 }, () => ['inspect']), expect: [{ key: 'fuel', delta: 2 }] }],
    },
    start: () => { throw new Error('an over-budget case must be rejected before setup'); },
  });
  expect(tooLong.cases[0]?.status).toBe('missing-case');
});

it('runs clause mutations against the cases derived from original content', () => {
  const input = suite(currentPack([baseCards[0]]), [printed[0]!]);
  const report = runCardSuite({
    ...input,
    mutations: {
      validate: validateRecords,
      trials: [
        { id: 'one-too-many', line: 'spark.1', recordIndex: 0, mutate: card => ({ ...card, effects: [{ op: 'gainResource', res: 'fuel', amount: 3 } as const] }) },
      ],
    },
  });
  expect(report.problems).toEqual([]);
  expect(report.mutations?.results[0]).toMatchObject({ status: 'killed', details: ['"fuel" expected delta 2, got 3'] });
});
