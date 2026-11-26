import path from 'node:path';
import { PRINTED_CLAUSES } from '../src/engine/card-config.ts';
import { hiddenAcceptance, type HiddenControl } from './hidden-acceptance.ts';
import { fileURLToPath } from 'node:url';
import { IllegalActionError, applyAction, createGame, draftOf, formatTriggerCap, type ApplyResult, sumEffects, type GameRules } from '../kit/engine-core/index.ts';
import { moveCard } from '../kit/card-zones/index.ts';
import { runCardSuite, type RuntimeCardSuite } from '../kit/card-harness/runtime.ts';
import { runClauseMutations, type ClauseMutation } from '../kit/card-harness/mutations.ts';
import type { SpecGame } from '../kit/card-harness/spec.ts';
import { runRuleAssertions, type Json, type RuleAdapter, type RuleCase, type RuleRequirement, type Assertion, type RuleReport, type RuleStep } from '../kit/traceability/assertions.ts';
import { BASE_CARDS, CARD_PROBE, cardObservation, loadContent, referenceRules, type CardRecord, type Ref, type RefState } from '../src/engine/rules.ts';

export interface PrintedClause {
  readonly id: string;
  readonly card: string;
  readonly text: string;
  readonly rule?: string;
  readonly damage?: number;
  readonly family?: 'rally' | 'ward' | 'mend';
  readonly conditional?: boolean;
}
// Authored expectations from the reference's printed rules, independent of executable effects.
export const PRINTED: readonly PrintedClause[] = PRINTED_CLAUSES;
export const REMAINING: Readonly<Record<string, string>> = {};
type Mode = HiddenControl | 'normal' | 'wrong-amount' | 'missing-content' | 'missing-evidence' | 'missing-refusal' | 'surviving-mutant' | 'duplicate-instance' | 'invalid-content' | 'trigger-cap' | 'invalid-mutant' | 'error-mutant';
interface Fixture {
  readonly card: string;
  readonly present?: boolean;
  readonly duplicate?: boolean;
  readonly cap?: boolean;
  readonly nextCard?: string;
  readonly reply?: string;
  readonly passive?: { readonly card: string; readonly zone: string };
}
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
      for (const zone of ['hand:0', 'hand:1']) for (const card of [...(state.zones[zone]?.cards ?? [])]) moveCard(state, card, 'deck');
      const id = physical(content, fixture.card);
      moveCard(state, id, fixture.present === false ? 'deck' : 'hand:0');
      if (fixture.present === false) moveCard(state, physical(content, 'blow'), 'hand:0');
      if (fixture.nextCard !== undefined) moveCard(state, physical(content, fixture.nextCard), 'hand:0');
      if (fixture.reply !== undefined) moveCard(state, physical(content, fixture.reply), 'hand:1');
      if (fixture.passive !== undefined) moveCard(state, physical(content, fixture.passive.card), fixture.passive.zone);
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
  const attack = physical(content, 'rally');
  return {
    clauses, records, lineOf: card => card.line,
    familyOf: (clause, group) => {
      if (group.length !== 1 || group[0]?.id !== clause.card) return undefined;
      const card = group[0];
      if (clause.damage !== undefined && card.effect.length === 1 && card.effect[0]?.op === 'hit' && !card.stay && !card.when) return 'hit';
      if (clause.family === 'rally' && card.id === 'rally' && card.effect.length === 1 && card.effect[0]?.op === 'boost' && !card.stay && !card.when) return 'rally';
      if (clause.family === 'ward' && card.id === 'ward' && card.effect.length === 0 && card.stay && !card.when) return 'ward';
      const trigger = card.when?.[0];
      if (clause.family === 'mend' && card.id === 'mend' && card.effect.length === 0 && card.stay && card.when?.length === 1
        && trigger?.on === 'damage' && trigger.if === 'mine' && trigger.optional === true
        && trigger.then.length === 1 && trigger.then[0]?.op === 'heal'
        && Object.keys(trigger).every(key => ['on', 'if', 'optional', 'then'].includes(key))) return 'mend';
      return undefined;
    },
    families: {
      hit: clause => [{
        name: 'printed damage', kind: 'resolve', layout: { card: clause.card, duplicate: mode === 'duplicate-instance', cap: mode === 'trigger-cap' },
        answers: [['no'], [physical(content, clause.card)]], end: 'draw:1',
        expect: [{ key: 'life1', delta: -(clause.damage ?? 0) }],
      }],
      rally: clause => [{
        name: 'owned boost', kind: 'resolve', layout: { card: clause.card },
        answers: [['no'], [physical(content, clause.card)]], end: 'draw:1',
        expect: [{ key: 'boost0', delta: 2 }, { key: 'boost1', delta: 0 }],
      }],
      ward: clause => [{
        name: 'played shield replaces once', kind: 'resolve', layout: { card: clause.card, reply: 'blow' },
        answers: [['no'], [physical(content, clause.card)], ['no'], [physical(content, 'blow')]], end: 'draw:0',
        expect: [{ key: 'life0', delta: 0 }, { key: 'warded', delta: 1 }, { key: `zone:${physical(content, clause.card)}`, equals: 'discard' }],
      }, {
        name: 'shield in hand is inactive', kind: 'not-fired', layout: { card: 'rally', passive: { card: clause.card, zone: 'hand:1' } },
        answers: [['no'], [attack]], end: 'draw:1',
        expect: [{ key: 'life1', delta: -3 }, { key: 'warded', delta: 0 }, { key: `zone:${physical(content, clause.card)}`, equals: 'hand:1' }],
      }],
      mend: clause => [{
        name: 'accept one heal', kind: 'resolve', layout: { card: 'rally', passive: { card: clause.card, zone: 'play:1' } },
        answers: [['no'], [attack], ['yes']], end: 'draw:1',
        expect: [{ key: 'life1', delta: 1 }, { key: 'life0', delta: 0 }, { key: 'healed', delta: 1 }],
      }, {
        name: 'decline one heal', kind: 'not-fired', layout: { card: 'rally', passive: { card: clause.card, zone: 'play:1' } },
        answers: [['no'], [attack], ['no']], end: 'draw:1',
        expect: [{ key: 'life1', delta: -3 }, { key: 'healed', delta: 0 }],
      }],
    },
    start: fixtureGame,
    observe: cardObservation,
    settled: (state, end) => end === `draw:${state.flow?.seat ?? ''}` && state.flow?.phase === 'draw'
      && state.prompt?.kind === 'may' && state.prompt.seat === state.flow.seat
      && state.stack.at(-1)?.kind === 'verb'
      && (state.stack.at(-1) as { readonly step?: { readonly op?: string } }).step?.op === 'may'
      && state.prompt.options.some(option => option.id === 'yes') && state.prompt.options.some(option => option.id === 'no'),
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
    observe: state => json({ ...state, acceptance: { ...cardObservation(state), activeBoosts: sumEffects(state, 'boost') } }),
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
  const equals = (path: readonly (string | number)[], value: Json): Assertion => ({ source: 'state', path, op: 'equals', value });
  const step = (action: string, checks: readonly Assertion[]): RuleStep<string> => ({ action, accepted: true, checks });
  const add = (rule: string, id: string, fixture: Fixture, steps: readonly RuleStep<string>[]): void => {
    if (!requirements.some(entry => entry.id === rule)) requirements.push({ id: rule, kind: 'action' });
    cases.push({ id, seed: 'rule-evidence', fixture, rules: [rule], steps,
      evidence: steps.flatMap((item, index) => item.checks.map((_check, assertion) => ({ rule, kind: 'action' as const, step: index, assertion }))),
    });
  };
  for (const clause of clauses) {
    if (clause.rule === undefined) continue;
    if (clause.family === 'rally') add(clause.rule, `${clause.id}:duration-owner-expiry`, { card: clause.card, nextCard: 'jab', reply: 'blow' }, [
      step(physical(content, clause.card), [equals(['life', '1'], 7), equals(['life', '0'], 10), equals(['acceptance', 'activeBoosts'], 0), equals(['flow', 'seat'], '1')]),
      step('no', [equals(['flow', 'seat'], '1'), equals(['flow', 'phase'], 'main')]),
      step(physical(content, 'blow'), [equals(['life', '0'], 9 - (clauses.find(item => item.card === 'blow')?.damage ?? 0)), equals(['flow', 'seat'], '0')]),
      step('no', [equals(['flow', 'phase'], 'main')]),
      step(physical(content, 'jab'), [equals(['life', '1'], 6 - (clauses.find(item => item.card === 'jab')?.damage ?? 0)), equals(['acceptance', 'activeBoosts'], 0)]),
    ]);
    if (clause.family === 'ward') {
      const card = physical(content, clause.card);
      add(clause.rule, `${clause.id}:play-replace-discard`, { card: clause.card, reply: 'blow' }, [
        step(card, [equals(['acceptance', `zone:${card}`], 'play:0'), equals(['life', '0'], 10)]),
        step('no', [equals(['flow', 'phase'], 'main')]),
        step(physical(content, 'blow'), [equals(['life', '0'], 9), equals(['acceptance', `zone:${card}`], 'discard'), equals(['acceptance', 'warded'], 1), equals(['flow', 'seat'], '0')]),
      ]);
      for (const zone of ['hand:1', 'discard', 'play:0']) add(clause.rule, `${clause.id}:inactive-${zone}`, { card: 'rally', passive: { card: clause.card, zone } }, [
        step(physical(content, 'rally'), [equals(['life', '1'], 7), equals(['acceptance', `zone:${card}`], zone), equals(['acceptance', 'warded'], 0)]),
      ]);
    }
    if (clause.family === 'mend') {
      for (const answer of ['yes', 'no']) add(clause.rule, `${clause.id}:${answer}`, { card: 'rally', passive: { card: clause.card, zone: 'play:1' } }, [
        step(physical(content, 'rally'), [equals(['life', '1'], 7), equals(['prompt', 'seat'], '1'), equals(['prompt', 'kind'], 'may'), equals(['flow', 'seat'], '0'), equals(['acceptance', 'healed'], 0)]),
        step(answer, [equals(['life', '1'], answer === 'yes' ? 8 : 7), equals(['life', '0'], 10), equals(['acceptance', 'healed'], answer === 'yes' ? 1 : 0), equals(['flow', 'seat'], '1'), equals(['flow', 'phase'], 'draw')]),
      ]);
      for (const zone of ['hand:1', 'discard', 'play:0']) add(clause.rule, `${clause.id}:inactive-${zone}`, { card: 'rally', passive: { card: clause.card, zone } }, [
        step(physical(content, 'rally'), [equals(['life', '1'], 7), equals(['life', '0'], 10), equals(['acceptance', 'healed'], 0), equals(['flow', 'seat'], '1'), equals(['flow', 'phase'], 'draw')]),
      ]);
    }
  }
  if (mode !== 'missing-refusal') cases.push({
    id: 'card-not-in-hand', seed: 'rule-evidence', fixture: { card: 'jab', present: false }, rules: ['PLAY-01'],
    steps: [{ action: physical(content, 'jab'), accepted: false, checks: [{ source: 'state', path: ['life', '1'], op: 'equals', value: 10 }] }],
    evidence: [{ rule: 'PLAY-01', kind: 'action', step: 0, assertion: 0 }],
  });
  return runRuleAssertions(adapter, requirements, cases);
}

function mutations(records: readonly CardRecord[], clauses: readonly PrintedClause[], mode: Mode) {
  const trials: ClauseMutation<CardRecord>[] = [];
  const add = (clause: PrintedClause, name: string, mutate: ClauseMutation<CardRecord>['mutate']): void => {
    trials.push({ id: `${clause.id}:${name}`, line: clause.id, recordIndex: records.findIndex(card => card.line === clause.id), mutate });
  };
  for (const clause of clauses) {
    if (clause.damage !== undefined) add(clause, 'one-more', card => ({ ...card, effect: card.effect.map(effect => effect.op === 'hit' ? { ...effect, n: effect.n + 1 } : effect) }));
    if (clause.family === 'rally') add(clause, 'one-more', card => ({ ...card, effect: [{ op: 'boost', n: 3 }] }));
    if (clause.family === 'ward') add(clause, 'does-not-stay', card => { const { stay: _stay, ...rest } = card; return rest; });
    if (clause.family === 'mend') {
      add(clause, 'wrong-heal', card => ({ ...card, when: (card.when ?? []).map(when => ({ ...when, then: [{ op: 'heal', n: 2 }] })) }));
      add(clause, 'mandatory-heal', card => ({ ...card, when: (card.when ?? []).map(when => ({ ...when, optional: false })) }));
      add(clause, 'duplicate-heal', card => ({ ...card, when: (card.when ?? []).map(when => ({ ...when, then: [{ op: 'heal', n: 1 }, { op: 'heal', n: 1 }] })) }));
      add(clause, 'wrong-owner', card => ({ ...card, when: (card.when ?? []).map(when => { const { if: _test, ...rest } = when; return rest; }) }));
    }
  }
  const jab = clauses.find(clause => clause.card === 'jab');
  if (jab !== undefined) {
    if (mode === 'surviving-mutant') add(jab, 'equivalent-name', card => ({ ...card, name: `${card.name} alternate label` }));
    if (mode === 'invalid-mutant') add(jab, 'invalid-amount', card => ({ ...card, effect: [{ op: 'hit', n: -1 }] }));
    if (mode === 'error-mutant') add(jab, 'unavailable-card', card => ({ ...card, id: 'unavailable-jab' }));
  }
  const game: SpecGame<CardRecord, null, null, string, RuleReport> = {
    records, lineOf: card => card.line,
    play: (_layout, _act, changed) => ruleEvidence(changed, clauses, 'normal'),
    check: (report, rule) => {
      const problems = report.cases.filter(item => item.rules.includes(rule)).flatMap(item => item.problems);
      const error = problems.find(problem => problem.startsWith('adapter error:'));
      if (error !== undefined) throw new Error(error);
      return problems.length ? problems.join('; ') : report.passed.includes(rule) ? undefined : `missing rule evidence ${rule}`;
    },
  };
  return runClauseMutations(game, clauses.map(clause => ({ line: clause.id, layout: null, act: null, expect: clause.rule ?? '' })), trials,
    { validate, requiredLines: clauses.map(clause => clause.id) });
}

export function acceptance(mode: Mode = 'normal', cards = BASE_CARDS, clauses = PRINTED) {
  const records = cards.filter(card => mode !== 'missing-content' || card.id !== 'jab').map(card =>
    card.id === 'jab' && (mode === 'wrong-amount' || mode === 'invalid-content')
      ? { ...card, effect: [{ op: 'hit' as const, n: mode === 'wrong-amount' ? 4 : -1 }] } : card);
  const content = loadContent(records);
  const loaded = Object.values(content.defs);
  const observed = runCardSuite(runtimeSuite(loaded, clauses, mode));
  const tested = observed.problems.length ? undefined : mutations(loaded, clauses, mode);
  const runtime = { ...observed, ...(tested === undefined ? {} : { mutations: tested }), problems: [...observed.problems, ...(tested?.problems ?? [])] };
  const rules = runtime.problems.length ? null : ruleEvidence(loaded, clauses, mode);
  const configured = JSON.stringify(cards) === JSON.stringify(BASE_CARDS) && JSON.stringify(clauses) === JSON.stringify(PRINTED);
  const hidden = !configured || runtime.problems.length || rules?.problems.length ? null : hiddenAcceptance(mode.startsWith('hidden-') ? mode as HiddenControl : 'normal');
  return {
    scope: clauses.map(clause => clause.id), remaining: Object.keys(REMAINING),
    runtime, rules, hidden, hiddenStatus: !configured ? 'not-run-custom-content' : hidden === null ? 'not-run' : hidden.problems.length ? 'failed' : 'executed',
    problems: [...runtime.problems, ...(rules?.problems ?? []), ...(hidden?.problems ?? [])],
  };
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = (process.argv[2]?.replace(/^--/, '') ?? 'normal') as Mode;
  if (!['normal', 'wrong-amount', 'missing-content', 'missing-evidence', 'missing-refusal', 'surviving-mutant', 'duplicate-instance', 'invalid-content', 'trigger-cap', 'invalid-mutant', 'error-mutant', 'hidden-policy', 'hidden-answers', 'hidden-no-variation', 'hidden-missing', 'hidden-truncated', 'hidden-error', 'hidden-empty'].includes(mode)) {
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
