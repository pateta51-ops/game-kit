import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { applyAction, createGame } from '../kit/engine-core/index.ts';
import { moveCard, type Zoned } from '../kit/card-zones/index.ts';
import { BASE_CARDS, CONTENT, GAME, loadContent, referenceRules, type RefState } from '../src/engine/rules.ts';
import { PRINTED, acceptance } from './acceptance.ts';

it('plays the supplied card content through the actual reference action', () => {
  const content = loadContent(BASE_CARDS.map(card => card.id === 'jab' ? { ...card, effect: [{ op: 'hit' as const, n: 4 }] } : card));
  const initial = createGame(GAME, { seed: 'content-evidence', level: 'normal', bots: [], scenario: 'first' }, { life: { 0: 10, 1: 10 }, rounds: 6 }, content).state;
  const arranged = structuredClone(initial) as RefState & Zoned;
  const card = Object.keys(content.cards).find(id => content.cards[id] === 'jab')!;
  moveCard(arranged, card, 'hand:0');
  const main = applyAction(GAME, arranged, { kind: 'answer', promptId: arranged.prompt!.id, picks: ['no'] }, content).state;
  const played = applyAction(GAME, main, { kind: 'answer', promptId: main.prompt!.id, picks: [card] }, content).state;
  expect(played.log.filter(event => event.type === 'hurt').map(event => event.n)).toEqual([4, 1]);
});

it('binds the supplied trigger content in the actual reference timing handlers', () => {
  const content = loadContent(BASE_CARDS.map(card => card.id === 'mend'
    ? { ...card, when: [{ on: 'damage', if: 'mine', optional: true, then: [{ op: 'heal' as const, n: 2 }] }] } : card));
  const rules = referenceRules(content);
  const initial = createGame(rules, { seed: 'trigger-content', level: 'normal', bots: [], scenario: 'first' }, { life: { 0: 10, 1: 10 }, rounds: 6 }, content).state;
  const arranged = structuredClone(initial) as RefState & Zoned;
  const jab = Object.keys(content.cards).find(id => content.cards[id] === 'jab')!;
  const mend = Object.keys(content.cards).find(id => content.cards[id] === 'mend')!;
  moveCard(arranged, jab, 'hand:0');
  moveCard(arranged, mend, 'play:1');
  const main = applyAction(rules, arranged, { kind: 'answer', promptId: arranged.prompt!.id, picks: ['no'] }, content).state;
  const hit = applyAction(rules, main, { kind: 'answer', promptId: main.prompt!.id, picks: [jab] }, content).state;
  expect(hit.life[1]).toBe(8);
  const healed = applyAction(rules, hit, { kind: 'answer', promptId: hit.prompt!.id, picks: ['yes'] }, content).state;
  // The end-of-turn hit follows the first heal, then offers Mend again: 10 - 2 + 2 - 1.
  expect(healed.life[1]).toBe(9);
});

const command = (mode?: string) => spawnSync(process.execPath, [fileURLToPath(new URL('./acceptance.ts', import.meta.url)), ...(mode === undefined ? [] : [`--${mode}`])], { encoding: 'utf8' });
it('executes bounded runtime, mutation and independent rule evidence through the consumer command', () => {
  const result = command();
  expect(result.status, result.stdout + result.stderr).toBe(0);
  const report = JSON.parse(result.stdout) as { scope: string[]; remaining: string[]; runtime: { covered: string[]; mutations: { killed: number } }; rules: { passed: string[] } };
  expect(report.scope).toEqual(['jab.1', 'blow.1']);
  expect(report.remaining).toEqual(['rally.1', 'ward.1', 'mend.1']);
  expect(report.runtime.covered).toEqual(['blow.1', 'jab.1']);
  expect(report.runtime.mutations.killed).toBe(2);
  expect(report.rules.passed).toEqual(['BLOW-01', 'JAB-01', 'PLAY-01']);
});

it.each([
  ['wrong-amount', 'expected delta -2'],
  ['missing-content', 'missing-record'],
  ['missing-evidence', 'missing evidence binding'],
  ['missing-refusal', 'no passing rejected-action control'],
  ['surviving-mutant', 'survived'],
  ['duplicate-instance', 'appears in'],
  ['invalid-content', 'positive integer'],
  ['trigger-cap', 'trigger-cap'],
  ['invalid-mutant', 'invalid-amount: invalid'],
  ['error-mutant', 'unavailable-card: error'],
])('fails the actual consumer command for %s', (mode, diagnostic) => {
  const result = command(mode);
  expect(result.status, result.stdout + result.stderr).toBe(1);
  expect(result.stdout + result.stderr).toContain(diagnostic);
  if (mode === 'invalid-mutant' || mode === 'error-mutant') {
    const report = JSON.parse(result.stdout) as { runtime: { mutations: { killed: number; total: number; results: { status: string }[] } } };
    expect(report.runtime.mutations.killed).toBe(2);
    expect(report.runtime.mutations.total).toBe(3);
    expect(report.runtime.mutations.results.at(-1)?.status).toBe(mode === 'invalid-mutant' ? 'invalid' : 'error');
  }
});

it('discovers an additional validated hit card through the same acceptance entrypoint', () => {
  const card = { id: 'tap', line: 'tap.1', name: 'Tap', copies: 1, effect: [{ op: 'hit' as const, n: 1 }] };
  const report = acceptance('normal', [...BASE_CARDS, card], [...PRINTED, { id: 'tap.1', card: 'tap', text: 'Deal 1 damage.', rule: 'TAP-01', damage: 1 }]);
  expect(report.problems).toEqual([]);
  expect(report.runtime.covered).toContain('tap.1');
  expect(report.runtime.mutations?.killed).toBe(3);
  expect(report.rules?.passed).toContain('TAP-01');
  expect(Object.keys(CONTENT.cards)).toHaveLength(20);
});
