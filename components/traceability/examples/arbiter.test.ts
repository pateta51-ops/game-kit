import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assertRuleCoverage, runRuleAssertions } from '../assertions.ts';
import suite from './arbiter.ts';

describe('documented token game arbiter', () => {
  it('checks real payment, atomic refusal and missing refusal evidence', () => {
    const { adapter, rules, cases } = suite;
    expect(runRuleAssertions(adapter, [], [])).toMatchObject({ problems: [], missing: [] });
    expect(runRuleAssertions(adapter, rules, cases).passed).toEqual(['PAY-01']);
    expect(() => assertRuleCoverage(runRuleAssertions(adapter, rules, cases.slice(0, 1)))).toThrow(/PAY-01/);
    expect(runRuleAssertions(adapter, [...rules, 'COMBAT-01'], cases).missing).toEqual(['COMBAT-01']);
  });

  it('propagates kernel errors and detects a corrupt refusal', () => {
    const { adapter, rules, cases } = suite;
    const state = adapter.setup({ tokens: 3 }, 'tokens');
    expect(() => adapter.act({ ...state, stack: [] }, 'buy')).toThrow();
    const corrupt: typeof adapter = { ...adapter, act(s, pick) {
      const result = adapter.act(s, pick);
      return result.accepted ? result : { ...result, state: { ...s, tokens: 0 }, events: ['paid'] };
    } };
    expect(runRuleAssertions(corrupt, rules, cases).problems).toContain('unaffordable: step 1: rejected action changed state or emitted events');
  });

  it('runs the exact documented suite through the release command', () => {
    const root = mkdtempSync(join(tmpdir(), 'arbiter-example-'));
    try {
      mkdirSync(join(root, 'tests'));
      writeFileSync(join(root, 'tests', 'tokens.test.ts'), "it('PAY-01 validates payment', () => {});\n");
      writeFileSync(join(root, 'plan.md'), '# Plan\n## 3. Rules\n- **PAY-01** Pay two tokens to buy.\n');
      writeFileSync(join(root, 'trace.config.json'), JSON.stringify({
        plan: 'plan.md', requireComment: false, families: ['PAY'], executableSuite: 'arbiter.mjs',
        executableRuleIds: ['PAY-01'],
      }));
      const example = JSON.stringify(pathToFileURL(join(import.meta.dirname, 'arbiter.ts')).href);
      writeFileSync(join(root, 'arbiter.mjs'), `export { default } from ${example};\n`);
      const command = join(import.meta.dirname, '..', 'check-traceability.ts');
      const run = () => spawnSync(process.execPath, [command, '--strict', '--release'], { cwd: root, encoding: 'utf8' });
      const passed = run();
      expect(passed.status, passed.stdout + passed.stderr).toBe(0);
      writeFileSync(join(root, 'arbiter.mjs'), `import suite from ${example}; export default { ...suite, cases: [] };\n`);
      const failed = run();
      expect(failed.status).toBe(1);
      expect(failed.stderr).toContain('PAY-01: no passing accepted-action evidence');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
