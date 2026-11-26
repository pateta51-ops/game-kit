import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IllegalActionError, applyAction, createGame, draftOf, formatTriggerCap, type ApplyResult, type GameRules } from '../kit/engine-core/index.ts';
import { moveCard } from '../kit/card-zones/index.ts';
import { runCardSuite, type RuntimeCardSuite } from '../kit/card-harness/runtime.ts';
import { runRuleAssertions, type Json, type RuleAdapter, type RuleCase, type RuleRequirement } from '../kit/traceability/assertions.ts';
import { BASE_CARDS, CARD_PROBE, cardObservation, loadContent, referenceRules, type CardRecord, type Ref, type RefState } from '../src/engine/rules.ts';

export interface PrintedClause {
  readonly id: string;
  readonly card: string;
  readonly text: string;
  readonly rule?: string;
  readonly damage?: number;
}
// Authored expectations from the reference's printed rules, independent of executable effects.
export const PRINTED: readonly PrintedClause[] = [
  { id: 'jab.1', card: 'jab', text: 'Deal 2 damage.', rule: 'JAB-01', damage: 2 },
  { id: 'blow.1', card: 'blow', text: 'Deal 3 damage.', rule: 'BLOW-01', damage: 3 },
  { id: 'rally.1', card: 'rally', text: 'Until end of turn, your hits deal 2 more.' },
  { id: 'ward.1', card: 'ward', text: 'If you would take damage, instead discard this.' },
  { id: 'mend.1', card: 'mend', text: 'When you take damage, you may heal 1.' },
];
export const REMAINING = {
  'rally.1': 'Outside the two-clause scope: duration and boosted follow-up need their own oracle.',
  'ward.1': 'Outside the two-clause scope: replacement and discard need their own oracle.',
  'mend.1': 'Outside the two-clause scope: optional trigger and refusal need their own oracle.',
};
type Mode = 'normal' | 'wrong-amount' | 'missing-content' | 'missing-evidence' | 'missing-refusal' | 'surviving-mutant' | 'duplicate-instance' | 'invalid-content' | 'trigger-cap' | 'invalid-mutant' | 'error-mutant';
interface Fixture { readonly card: string; readonly present?: boolean; readonly duplicate?: boolean; readonly cap?: boolean }
const physical = (content: Ref['content'], card: string): string => {
  const id = Object.keys(content.cards).find(key => content.cards[key] === card);
  if (id === undefined) throw new Error(`No physical instance of ${card}`);
  return id;
};

function fixtureGame(fixture: Fixture, records: readonly CardRecord[], seed = 'card-evidence') {
  const content = loadContent(records);
  const actual = referenceRules(content, fixture.cap === true ? { triggerCap: 0 } : {});
  const rules: GameRules<Ref> = {
    ...actual,
    setup(ctx) {
      actual.setup?.(ctx);
      const state = draftOf(ctx);
      const id = physical(content, fixture.card);
      moveCard(state, id, fixture.present === false ? 'deck' : 'hand:0');
      if (fixture.duplicate === true) state.zones.discard!.cards.push(id);
      if (fixture.cap === true) moveCard(state, physical(content, 'mend'), 'play:1');
    },
  };
  const options: Ref['options'] = { seed, level: 'normal', bots: [], scenario: 'first' };
  const setup: Ref['rules'] = { life: { 0: 10, 1: 10 }, rounds: 6 };
  return { rules, options, setup, content, probe: CARD_PROBE };
}

const validate = (records: readonly CardRecord[]): readonly string[] => {
  try { loadContent(records); return []; } catch (error) { return [String(error)]; }
};
export function runtimeSuite(records: readonly CardRecord[], clauses = PRINTED, mode: Mode = 'normal'): RuntimeCardSuite<PrintedClause, CardRecord, Fixture, Ref> {
  const content = loadContent(records);
  const trials = clauses.filter(clause => clause.damage !== undefined).map(clause => ({
    id: `${clause.id}:one-more`, line: clause.id, recordIndex: records.findIndex(card => card.line === clause.id),
    mutate: (card: CardRecord): CardRecord => ({ ...card, effect: card.effect.map(step => step.op === 'hit' ? { ...step, n: step.n + 1 } : step) }),
  }));
  if (mode === 'surviving-mutant') trials.push({
    id: 'jab.1:equivalent-name', line: 'jab.1', recordIndex: records.findIndex(card => card.id === 'jab'),
    mutate: card => ({ ...card, name: `${card.name} alternate label` }),
  });
  if (mode === 'invalid-mutant') trials.push({
    id: 'jab.1:invalid-amount', line: 'jab.1', recordIndex: records.findIndex(card => card.id === 'jab'),
    mutate: card => ({ ...card, effect: [{ op: 'hit', n: -1 }] }),
  });
  if (mode === 'error-mutant') trials.push({
    id: 'jab.1:unavailable-card', line: 'jab.1', recordIndex: records.findIndex(card => card.id === 'jab'),
    mutate: card => ({ ...card, id: 'unavailable-jab' }),
  });
  return {
    clauses, records, lineOf: card => card.line, exempt: REMAINING,
    familyOf: (clause, group) => clause.damage !== undefined && group.length === 1 && group[0]?.id === clause.card
      && group[0].effect.length === 1 && group[0].effect[0]?.op === 'hit' && !group[0].stay && !group[0].when ? 'hit' : undefined,
    families: { hit: clause => [{
      name: 'printed damage', kind: 'resolve', layout: { card: clause.card, duplicate: mode === 'duplicate-instance', cap: mode === 'trigger-cap' },
      answers: [['no'], [physical(content, clause.card)]], end: 'next-seat draw',
      expect: [{ key: 'life1', delta: -(clause.damage ?? 0) }],
    }] },
    start: fixtureGame,
    observe: cardObservation,
    settled: (state, end) => end === 'next-seat draw' && state.flow?.seat === '1' && state.flow.phase === 'draw'
      && state.prompt?.kind === 'may' && state.prompt.seat === '1'
      && state.stack.at(-1)?.kind === 'verb'
      && (state.stack.at(-1) as { readonly step?: { readonly op?: string } }).step?.op === 'may'
      && state.prompt.options.some(option => option.id === 'yes') && state.prompt.options.some(option => option.id === 'no'),
    mutations: { trials, validate },
  };
}

const json = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json;
function clean(result: ApplyResult<Ref>): RefState {
  if (result.triggerCap !== undefined) throw new Error(formatTriggerCap({ ...result.triggerCap, actionIndex: null }));
  if (result.violations.length) throw new Error(result.violations.map(v => v.message).join('; '));
  return result.state;
}
function ruleEvidence(records: readonly CardRecord[], clauses: readonly PrintedClause[], mode: Mode) {
  const content = loadContent(records);
  const rules = referenceRules(content);
  const adapter: RuleAdapter<Fixture, string, RefState> = {
    setup(fixture, seed) {
      const game = fixtureGame(fixture, records, seed);
      const initial = clean(createGame(game.rules, game.options, game.setup, game.content));
      return clean(applyAction(game.rules, initial, { kind: 'answer', promptId: initial.prompt?.id ?? -1, picks: ['no'] }, game.content));
    },
    observe: json,
    act(state, pick) {
      try {
        const result = applyAction(rules, state, { kind: 'answer', promptId: state.prompt?.id ?? -1, picks: [pick] }, content);
        return { accepted: true, state: clean(result), events: result.events.map(json) };
      } catch (error) {
        if (!(error instanceof IllegalActionError)) throw error;
        return { accepted: false, state, events: [] };
      }
    },
  };
  const requirements: RuleRequirement[] = [{ id: 'PLAY-01', kind: 'action', requireRefusal: true }];
  const cases: RuleCase<Fixture, string>[] = [];
  for (const clause of clauses) {
    if (clause.rule === undefined || clause.damage === undefined) continue;
    requirements.push({ id: clause.rule, kind: 'action' });
    cases.push({
      id: clause.id, seed: 'rule-evidence', fixture: { card: clause.card }, rules: [clause.rule, 'PLAY-01'],
      steps: [{ action: physical(content, clause.card), accepted: true, checks: [
        { source: 'events', path: [1, 'n'], op: 'equals', value: clause.damage },
        { source: 'state', path: ['flow', 'seat'], op: 'equals', value: '1' },
      ] }],
      evidence: mode === 'missing-evidence' && clause.card === 'blow' ? [] : [
        { rule: clause.rule, kind: 'action', step: 0, assertion: 0 },
        { rule: 'PLAY-01', kind: 'action', step: 0, assertion: 1 },
      ],
    });
  }
  if (mode !== 'missing-refusal') cases.push({
    id: 'card-not-in-hand', seed: 'rule-evidence', fixture: { card: 'jab', present: false }, rules: ['PLAY-01'],
    steps: [{ action: physical(content, 'jab'), accepted: false, checks: [{ source: 'state', path: ['life', '1'], op: 'equals', value: 10 }] }],
    evidence: [{ rule: 'PLAY-01', kind: 'action', step: 0, assertion: 0 }],
  });
  return runRuleAssertions(adapter, requirements, cases);
}

export function acceptance(mode: Mode = 'normal', cards = BASE_CARDS, clauses = PRINTED) {
  const records = cards.filter(card => mode !== 'missing-content' || card.id !== 'jab').map(card =>
    card.id === 'jab' && (mode === 'wrong-amount' || mode === 'invalid-content')
      ? { ...card, effect: [{ op: 'hit' as const, n: mode === 'wrong-amount' ? 4 : -1 }] } : card);
  const content = loadContent(records);
  const loaded = Object.values(content.defs);
  const runtime = runCardSuite(runtimeSuite(loaded, clauses, mode));
  const rules = runtime.problems.length ? null : ruleEvidence(loaded, clauses, mode);
  return {
    scope: clauses.filter(clause => clause.damage !== undefined).map(clause => clause.id), remaining: Object.keys(REMAINING),
    runtime, rules,
    problems: [...runtime.problems, ...(rules?.problems ?? [])],
  };
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = (process.argv[2]?.replace(/^--/, '') ?? 'normal') as Mode;
  if (!['normal', 'wrong-amount', 'missing-content', 'missing-evidence', 'missing-refusal', 'surviving-mutant', 'duplicate-instance', 'invalid-content', 'trigger-cap', 'invalid-mutant', 'error-mutant'].includes(mode)) {
    console.error('Unknown acceptance control'); process.exitCode = 2;
  } else {
    try {
      const report = acceptance(mode);
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.problems.length ? 1 : 0;
    } catch (error) {
      console.error(String(error)); process.exitCode = 1;
    }
  }
}
