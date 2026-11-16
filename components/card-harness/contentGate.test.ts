import { expect, it } from 'vitest';
import { contentGate } from './index';

const err = { code: 'E1', severity: 'error' };
const run = (o: Partial<Parameters<typeof contentGate>[0]>) => {
  const lines: string[] = [];
  const { failed } = contentGate({ readGenerated: () => undefined, ...o }, (l) => lines.push(l));
  return { failed, text: lines.join('\n') };
};
it('a pack with an error fails; warnings fail unless allowed', () => {
  expect(run({ packs: [{ path: 'a', validate: () => [err] }] }).failed).toBe(true);
  const w = [{ code: 'W', severity: 'warning' }];
  expect(run({ packs: [{ path: 'a', validate: () => w }] }).failed).toBe(true);
  expect(run({ packs: [{ path: 'a', validate: () => w, allowWarnings: true }] }).failed).toBe(false);
});
it('a broken pack must report its code and severity', () => {
  expect(run({ broken: [{ file: 'x', ...err, validate: () => [err] }] }).failed).toBe(false);
  const r = run({ broken: [{ file: 'x', ...err, validate: () => [{ code: 'E1', severity: 'warning' }] }] });
  expect(r.failed).toBe(true);
  expect(r.text).toContain('FAIL broken/x reports E1');
});
it('a generated file differing from the generator is stale', () => {
  const r = run({ generated: { 'f.json': 'new' }, readGenerated: () => 'old', regenerate: 'npm run build' });
  expect(r.failed).toBe(true);
  expect(r.text).toContain('f.json is stale: run npm run build');
  expect(run({ generated: { f: 'a' }, readGenerated: () => 'a' }).failed).toBe(false);
});
it('--require-all fails on an unused feature', () => {
  const features = { required: ['a', 'b'], used: ['a'] };
  expect(run({ features }).failed).toBe(false);
  const r = run({ features, requireAll: true });
  expect(r.failed).toBe(true);
  expect(r.text).toContain('unused: b');
});
