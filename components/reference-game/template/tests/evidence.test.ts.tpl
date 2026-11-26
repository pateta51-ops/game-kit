import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
  const report = JSON.parse(result.stdout) as { scope: string[]; remaining: string[]; runtime: { covered: string[]; mutations: { killed: number } }; rules: { passed: string[] }; hidden: { problems: string[]; shapes: string[]; seats: string[]; records: { paired: number; varied: number }[] } };
  expect(report.scope).toEqual(['jab.1', 'blow.1', 'rally.1', 'ward.1', 'mend.1']);
  expect(report.remaining).toEqual([]);
  expect(report.runtime.covered).toEqual(['blow.1', 'jab.1', 'mend.1', 'rally.1', 'ward.1']);
  expect(report.runtime.mutations.killed).toBe(8);
  expect(report.rules.passed).toEqual(['BLOW-01', 'JAB-01', 'MEND-01', 'PLAY-01', 'RALLY-01', 'WARD-01']);
  expect(report.hidden.problems).toEqual([]);
  expect(report.hidden.shapes).toEqual(['may:draw', 'may:heal', 'pick']);
  expect(report.hidden.seats).toEqual(['0', '1']);
  expect(report.hidden.records).toHaveLength(12);
  expect(report.hidden.records.every(record => record.paired > 0 && record.varied > 0)).toBe(true);
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
  ['hidden-policy', 'driver answered differently'],
  ['hidden-answers', 'legal answers changed in order or payload'],
  ['hidden-no-variation', 'insufficient paired hidden variation'],
  ['hidden-missing', 'the game has no reshuffleHidden'],
  ['hidden-truncated', 'no result after 1 actions'],
  ['hidden-error', 'deliberate alternate-world failure'],
  ['hidden-empty', 'unexecuted prompt shape'],
])('fails the actual consumer command for %s', (mode, diagnostic) => {
  const result = command(mode);
  expect(result.status, result.stdout + result.stderr).toBe(1);
  expect(result.stdout + result.stderr).toContain(diagnostic);
  if (mode === 'invalid-mutant' || mode === 'error-mutant') {
    const report = JSON.parse(result.stdout) as { runtime: { mutations: { killed: number; total: number; results: { status: string }[] } } };
    expect(report.runtime.mutations.killed).toBe(8);
    expect(report.runtime.mutations.total).toBe(9);
    expect(report.runtime.mutations.results.at(-1)?.status).toBe(mode === 'invalid-mutant' ? 'invalid' : 'error');
  }
});

it('discovers an additional validated hit card through the same acceptance entrypoint', () => {
  const card = { id: 'tap', line: 'tap.1', name: 'Tap', copies: 1, effect: [{ op: 'hit' as const, n: 1 }] };
  const report = acceptance('normal', [...BASE_CARDS, card], [...PRINTED, { id: 'tap.1', card: 'tap', text: 'Deal 1 damage.', rule: 'TAP-01', damage: 1 }]);
  expect(report.problems).toEqual([]);
  expect(report.runtime.covered).toContain('tap.1');
  expect(report.runtime.mutations?.killed).toBe(9);
  expect(report.rules?.passed).toContain('TAP-01');
  expect(Object.keys(CONTENT.cards)).toHaveLength(20);
});


it.each([
  ['Rally expiry', "duration: { until: 'endOfTurn' }", "duration: { until: 'endOfRound' }", 'rally.1'],
  ['Rally owner', "target: env?.seat ?? '', value: step.n", "target: other(env?.seat ?? ''), value: step.n", 'rally.1'],
  ['Ward discard', "moveCard(draftOf(ctx), `c${String(r.id)}`, 'discard');", 'void draftOf(ctx);', 'ward.1'],
  ['Ward zone', "cardsIn(s, seatZone('play', seat)).find", "cardsIn(s, seatZone('hand', seat)).find", 'ward.1'],
  ['Ward owner', "wardOf(s, o.keys.player ?? '', content)", "wardOf(s, other(o.keys.player ?? ''), content)", 'ward.1'],
])('rejects the valid consumer source mutation: %s', (_name, original, replacement, diagnostic) => {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-mutant-'));
  try {
    for (const dir of ['src', 'tests']) fs.cpSync(path.join(root, dir), path.join(copy, dir), { recursive: true });
    fs.copyFileSync(path.join(root, 'package.json'), path.join(copy, 'package.json'));
    for (const dir of ['kit', 'node_modules']) fs.symlinkSync(path.join(root, dir), path.join(copy, dir), process.platform === 'win32' ? 'junction' : 'dir');
    const file = path.join(copy, 'src/engine/rules.ts');
    const source = fs.readFileSync(file, 'utf8');
    expect(source.split(original)).toHaveLength(2);
    fs.writeFileSync(file, source.replace(original, replacement));
    const result = spawnSync(process.execPath, [path.join(copy, 'tests/acceptance.ts')], { cwd: copy, encoding: 'utf8' });
    expect(result.status, result.stdout + result.stderr).toBe(1);
    const report = JSON.parse(result.stdout) as { problems: string[] };
    expect(report.problems.some(problem => problem.includes(diagnostic)), result.stdout).toBe(true);
  } finally { fs.rmSync(copy, { recursive: true, force: true }); }
});


it('rejects an extra effect that falls outside the declared card family', () => {
  const records = BASE_CARDS.map(card => card.id === 'rally' ? { ...card, effect: [...card.effect, { op: 'draw' as const, count: 1 }] } : card);
  const report = acceptance('normal', records);
  expect(report.problems.some(problem => problem.includes('rally.1 coverage: unsupported'))).toBe(true);
  expect(report.rules).toBeNull();
});
