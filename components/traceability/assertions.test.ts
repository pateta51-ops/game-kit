import { describe, expect, it } from 'vitest';
import { assertRuleCoverage, runRuleAssertions, type RuleAdapter, type RuleCase, type RuleRequirement } from './assertions.ts';

type Fixture = { tokens: number };
type Action = { spend: number };
const adapter: RuleAdapter<Fixture, Action, Fixture> = {
  setup(fixture) { return fixture; },
  act(state, action) {
    if (action.spend > state.tokens) return { accepted: false, state, events: [] };
    return { accepted: true, state: { tokens: state.tokens - action.spend }, events: [{ kind: 'spent', amount: action.spend }] };
  },
  observe(state) { return { tokens: state.tokens }; },
};
const spend: RuleCase<Fixture, Action> = {
  id: 'pay', rules: ['PAY-01'], seed: 'arbiter-1', fixture: { tokens: 3 },
  evidence: [{ rule: 'PAY-01', kind: 'action', step: 0, assertion: 0 }],
  steps: [{ action: { spend: 2 }, accepted: true, checks: [
    { source: 'state', path: ['tokens'], op: 'equals', value: 1 },
    { source: 'events', path: [0,'amount'], op: 'equals', value: 2 },
  ] }],
};
const refusal: RuleCase<Fixture, Action> = {
  id: 'refusal', rules: ['PAY-02'], seed: 'arbiter-2', fixture: { tokens: 1 },
  evidence: [{ rule: 'PAY-02', kind: 'action', step: 0, assertion: 0 }],
  steps: [{ action: { spend: 2 }, accepted: false, checks: [{ source: 'state', path: ['tokens'], op: 'equals', value: 1 }] }],
};
describe('executable arbiter assertions',()=>{
  it('runs positive and negative cases against the same adapter and credits executed evidence',()=>{
    const report=runRuleAssertions(adapter,['PAY-01','PAY-02'],[spend,refusal]);
    expect(report.passed).toEqual(['PAY-01','PAY-02']);
    expect(report.problems).toEqual([]);
    expect(spend.fixture.tokens).toBe(3);
  });
  it('detects an actual wrong rule even with a valid citation',()=>{
    const bad: typeof adapter={...adapter,act(state,action){ const result=adapter.act(state,action);return result.accepted?{...result,state:{tokens:0}}:result; }};
    const report=runRuleAssertions(bad,['PAY-01'],[spend]);
    expect(report.missing).toEqual(['PAY-01']);
    expect(report.problems.join(' ')).toContain('differs');
  });
  it('does not count crashes, empty assertions or missing rules as evidence',()=>{
    const broken: typeof adapter={...adapter,act(){throw new Error('crash');}};
    expect(runRuleAssertions(broken,['PAY-01'],[spend]).problems.join(' ')).toContain('adapter error');
    const empty={...spend,steps:[{action:{spend:1},accepted:true,checks:[]}]};
    expect(runRuleAssertions(adapter,['PAY-01','PAY-02'],[empty]).missing).toEqual(['PAY-01','PAY-02']);
  });
  it('rejects mutation on an unsuccessful action even when its expected assertion passes',()=>{
    const bad: typeof adapter={...adapter,act(){return {accepted:false,state:{tokens:1},events:[{kind:'leak'}]};}};
    expect(runRuleAssertions(bad,['PAY-02'],[refusal]).problems.join(' ')).toContain('rejected action changed');
  });
  it('rejects missing fields for notEquals and blocks inherited property lookup',()=>{
    const c: typeof spend={...spend,steps:[],evidence:[{rule:'PAY-01',kind:'setup',assertion:0}],initial:[
      {source:'state',path:['missing'],op:'notEquals',value:0},
      {source:'state',path:['constructor'],op:'exists'},
    ]};
    const report=runRuleAssertions(adapter,[{id:'PAY-01',kind:'setup'}],[c]);
    expect(report.cases[0]?.problems).toContain('initial: state:["missing"] is missing');
    expect(report.cases[0]?.problems).toContain('initial: state:["constructor"] is missing');
  });
  it('does not hide failed evidence behind another passing case for the same rule',()=>{
    const failed: typeof spend = { ...spend, id: 'failed', steps: [
      { action: { spend: 2 }, accepted: true, checks: [{ source: 'state', path: ['tokens'], op: 'equals', value: 99 }] },
    ] };
    expect(runRuleAssertions(adapter,['PAY-01'],[spend,failed]).missing).toEqual(['PAY-01']);
  });
});

it('does not credit payment or combat from an unrelated fixture property', () => {
  const rules = ['PAY-01', 'COMBAT-01'];
  const report = runRuleAssertions(adapter, rules, [{
    id: 'unrelated', rules, seed: 'arbiter', fixture: { tokens: 3 },
    initial: [{ source: 'state', path: ['tokens'], op: 'exists' }], steps: [],
  }]);
  expect(report.missing).toEqual(['COMBAT-01', 'PAY-01']);
  expect(report.passed).toEqual([]);
});

it('does not use a bound initial assertion for an action rule', () => {
  const testCase = {
    id: 'initial-only', rules: ['PAY-01'], seed: 'arbiter', fixture: { tokens: 3 },
    initial: [{ source: 'state', path: ['tokens'], op: 'exists' }] as const, steps: [],
    evidence: [{ rule: 'PAY-01', kind: 'setup', assertion: 0 }] as const,
  };
  expect(runRuleAssertions(adapter, ['PAY-01'], [testCase]).missing).toEqual(['PAY-01']);
});

it('identifies a failed referenced assertion and a referenced action that never ran', () => {
  const wrong: typeof spend = { ...spend, steps: [
    { action: { spend: 2 }, accepted: true, checks: [{ source: 'state', path: ['tokens'], op: 'equals', value: 0 }] },
  ] };
  const failed = runRuleAssertions(adapter, ['PAY-01'], [wrong]);
  expect(failed.problems).toContain('pay: PAY-01: evidence failed at step 1:0');
  expect(failed.missing).toEqual(['PAY-01']);
  const skipped: typeof spend = {
    ...spend, steps: [{ action: { spend: 1 }, accepted: true, checks: [] }, ...spend.steps],
    evidence: [{ rule: 'PAY-01', kind: 'action', step: 1, assertion: 0 }],
  };
  const unexecuted = runRuleAssertions(adapter, ['PAY-01'], [skipped]);
  expect(unexecuted.problems).toContain('pay: PAY-01: evidence did not execute at step 2:0');
  expect(unexecuted.missing).toEqual(['PAY-01']);
});

it('credits distinct setup and action evidence in one case', () => {
  const rules: RuleRequirement[] = [{ id: 'SET-01', kind: 'setup' }, { id: 'PAY-01', kind: 'action' }];
  const testCase: typeof spend = {
    ...spend, rules: ['SET-01', 'PAY-01'],
    initial: [{ source: 'state', path: ['tokens'], op: 'equals', value: 3 }],
    evidence: [
      { rule: 'SET-01', kind: 'setup', assertion: 0 },
      { rule: 'PAY-01', kind: 'action', step: 0, assertion: 0 },
    ],
  };
  const report = runRuleAssertions(adapter, rules, [testCase]);
  expect(report.passed).toEqual(['PAY-01', 'SET-01']);
  expect(report.problems).toEqual([]);
  const setup: typeof spend = {
    ...testCase, rules: ['SET-01'], steps: [], evidence: [{ rule: 'SET-01', kind: 'setup', assertion: 0 }],
  };
  expect(runRuleAssertions(adapter, [{ id: 'SET-01', kind: 'setup' }], [setup]).passed).toEqual(['SET-01']);
});

it('requires both successful payment and an atomic refusal when the rule requests a control', () => {
  const requirements: RuleRequirement[] = [{ id: 'PAY-01', kind: 'action', requireRefusal: true }];
  const control: typeof refusal = {
    ...refusal, rules: ['PAY-01'], evidence: [{ rule: 'PAY-01', kind: 'action', step: 0, assertion: 0 }],
  };
  const missing = runRuleAssertions(adapter, requirements, [spend]);
  expect(missing.missing).toEqual(['PAY-01']);
  expect(() => assertRuleCoverage(missing)).toThrow('PAY-01: no passing rejected-action control');
  const complete = runRuleAssertions(adapter, requirements, [spend, control]);
  expect(complete.passed).toEqual(['PAY-01']);
  expect(() => assertRuleCoverage(complete)).not.toThrow();
});

it('rejects duplicate mappings and unknown IDs', () => {
  const invalid: typeof spend = {
    ...spend, evidence: [
      { rule: 'PAY-01', kind: 'action', step: 0, assertion: 0 },
      { rule: 'PAY-01', kind: 'action', step: 0, assertion: 0 },
      { rule: 'FAKE-01', kind: 'action', step: 0, assertion: 1 },
    ],
  };
  const report = runRuleAssertions(adapter, ['PAY-01'], [invalid]);
  expect(report.problems).toContain('pay: PAY-01: duplicate evidence reference step 1:0');
  expect(report.problems).toContain('pay: FAKE-01: evidence names a rule outside this case or inventory');
  expect(report.missing).toEqual(['PAY-01']);
  expect(() => runRuleAssertions(adapter, ['PAY-01', 'PAY-01'], [])).toThrow('duplicate required rule');
});

it('rejects an assertion reference to a nonexistent action step', () => {
  const testCase = {
    ...spend, evidence: [{ rule: 'PAY-01', kind: 'action', step: 4, assertion: 0 }] as const,
  };
  expect(runRuleAssertions(adapter, ['PAY-01'], [testCase]).missing).toEqual(['PAY-01']);
});
