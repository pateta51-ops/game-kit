import { expect, it } from 'vitest';
import { runRuleAssertions } from '../kit/traceability/assertions.ts';
import suite from './rule-evidence.ts';

it('executes the independent courier rule fixtures', () => {
  const report = runRuleAssertions(suite.adapter, suite.rules, suite.cases);
  expect(report.problems).toEqual([]);
  expect(report.passed).toEqual(['COU-01', 'COU-02', 'COU-03', 'COU-04', 'COU-05', 'COU-06', 'COU-07']);
});
