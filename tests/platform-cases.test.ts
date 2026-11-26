import { expect, it } from 'vitest';
import { executedCases } from '../scripts/platform-cases.mjs';

const names = [
  'publication > rejects Windows path aliases before replacing a release: {"manifest":"PUBLIC/ART/OLD.PNG"}',
  'publication > rejects Windows path aliases before replacing a release: {"manifest":"CHOSEN/OLD.PNG."}',
  'publication > rejects Windows path aliases before replacing a release: {"out":"CHOSEN.PUBLISH-NEXT"}',
  'coverage > rejects a case alias of the coverage directory before removing coverage',
  'brief > rejects mixed-case Windows aliases for protected directories',
];
const report = (values = names, status = 'passed') => ({ testResults: [{ assertionResults: values.map(fullName => ({ fullName, status })) }] });
it('requires all five Windows cases to execute, not merely an overall successful report', () => {
  expect(executedCases(report(), 'windows')).toHaveLength(5);
  expect(() => executedCases(report(names.slice(1)), 'windows')).toThrow('did not execute');
  expect(() => executedCases(report(names, 'pending'), 'windows')).toThrow('did not execute');
  expect(() => executedCases(report([...names, names[0]!]), 'windows')).toThrow('did not execute');
});
it('only accepts executed real PDF rendering evidence', () => {
  const pdf = ['art > renders a generated one-page PDF with pdf.js'];
  expect(executedCases(report(pdf), 'pdf')).toHaveLength(1);
  expect(() => executedCases(report(pdf, 'skipped'), 'pdf')).toThrow('did not execute');
  expect(() => executedCases(report(), 'pdf')).toThrow('did not execute');
});
