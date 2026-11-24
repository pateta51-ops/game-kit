import { describe, expect, it } from 'vitest';
import { runRuleAssertions, type RuleAdapter, type RuleCase } from './assertions.ts';

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
  steps: [{ action: { spend: 2 }, accepted: true, checks: [
    { source: 'state', path: ['tokens'], op: 'equals', value: 1 },
    { source: 'events', path: [0,'amount'], op: 'equals', value: 2 },
  ] }],
};
const refusal: RuleCase<Fixture, Action> = {
  id: 'refusal', rules: ['PAY-02'], seed: 'arbiter-2', fixture: { tokens: 1 },
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
    const c: typeof spend={...spend,steps:[],initial:[
      {source:'state',path:['missing'],op:'notEquals',value:0},
      {source:'state',path:['constructor'],op:'exists'},
    ]};
    const report=runRuleAssertions(adapter,['PAY-01'],[c]);
    expect(report.cases[0]?.problems).toHaveLength(2);
  });
  it('does not hide failed evidence behind another passing case for the same rule',()=>{
    const failed: typeof spend={...spend,id:'failed',steps:[],initial:[{source:'state',path:['tokens'],op:'equals',value:99}]};
    expect(runRuleAssertions(adapter,['PAY-01'],[spend,failed]).missing).toEqual(['PAY-01']);
  });
});
