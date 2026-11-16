import { describe, expect, it } from 'vitest';
import { CONTENT, COUNTER, RULES, type Counter } from '../engine-core/fake/counter';
import { answerWords, buildScript, driverLine, lineDump, NEXT, playScript, playTutorialE2E, scriptDoc, stepSelector, type TutorialGame, type TutorialPage, type TutorialStep } from './index';

const GAME: TutorialGame<Counter> = {
  rules: COUNTER,
  content: CONTENT,
  gameRules: RULES,
  options: (seed) => ({ seed }),
  promptKind: () => 'turn',
  optionWords: (_s, id) => (id === 'add' ? 'Add {plus}' : id === 'draw' ? 'Draw a card' : id),
};
const SEED = 'build';
const line = driverLine(GAME, (s) => ({ kind: 'answer', promptId: (s.prompt as { id: number }).id, picks: ['add'] }), 3)(SEED);
const PLAN = [
  { id: 'hello', n: 0, narration: 'Hello.' },
  { id: 'first', n: 1, narration: 'Add.', targets: ['counter'], items: ['add'] },
  { id: 'rest', n: 2, auto: true, narration: 'Twice more.' },
];
const keep = (e: Counter['event']): boolean => e.type === 'added';
const strip = ({ seq: _s, turn: _t, ...rest }: Counter['event']) => rest;

describe('buildScript', () => {
  it('takes the line step by step, with the asked words and expected events, and replays clean', () => {
    const script = buildScript(GAME, line.actions, PLAN, { seed: SEED, title: 'T', keep, strip });
    expect(script.steps.map((s) => s.do)).toEqual([{ kind: 'next' }, { kind: 'move', prompt: 'turn', choose: ['add'] }, { kind: 'auto', moves: [['add'], ['add']] }]);
    expect(script.steps[1]).toMatchObject({ asks: 'Add {plus}', targets: ['counter'], items: ['add'], expect: [{ type: 'added' }] });
    expect(script.steps[2]?.expect).toHaveLength(2);
    expect(playScript(GAME, script, { items: ['add'] }).failures).toEqual([]);
  });
  it('refuses steps that do not take the whole line', () => {
    expect(() => buildScript(GAME, line.actions, PLAN.slice(0, 2), { seed: SEED })).toThrow(/take 1 answers; the line has 3/);
    expect(() => buildScript(GAME, line.actions.slice(0, 1), PLAN, { seed: SEED })).toThrow(/rest: the line has only 1/);
  });
});

describe('answerWords and the document', () => {
  it('lists each step in on-screen words and puts them in the document', () => {
    const script = buildScript(GAME, line.actions, PLAN, { seed: SEED });
    const played = answerWords(GAME, script, (w) => w.replace('{plus}', '[Plus]'));
    expect(played).toEqual([[], ['Add [Plus]'], ['Add [Plus]', 'Add [Plus]']]);
    const doc = scriptDoc(script, { title: 'T', source: 'test', played });
    expect(doc).toContain('- **The player:** Next (the step only explains)');
    expect(doc).toContain('- **The player:** answers "Add [Plus]"');
    expect(doc).toContain('- **The player:** presses Next; the game answers by itself: Add [Plus]; then Add [Plus]');
  });
  it('dumps a line', () => {
    const d = lineDump(GAME, SEED, line.actions, (s) => `c${String(s.counter)}`);
    expect(d[0]).toBe('#0 [c0] turn: add  {add=Add {plus} | draw=Draw a card | skip(x)=skip}');
    expect(d[1]).toMatch(/^ {4}\{"type":"added"/);
  });
});

describe('playTutorialE2E', () => {
  it('waits for each step, presses Next or hands the move to the game, then waits for the end words', async () => {
    const script = buildScript(GAME, line.actions, PLAN, { seed: SEED });
    const log: string[] = [];
    const page: TutorialPage = {
      waitForSelector: (s) => Promise.resolve(log.push(`wait ${s}`)),
      click: (s) => Promise.resolve(void log.push(`click ${s}`)),
    };
    await playTutorialE2E(page, script, { answer: (_p, choose, _s, n) => Promise.resolve(void log.push(`answer ${String(n)} ${choose.join()}`)), over: 'Done' });
    expect(log).toEqual([`wait ${stepSelector(1)}`, `click ${NEXT}`, `wait ${stepSelector(2)}`, 'answer 2 add', `wait ${stepSelector(3)}`, `click ${NEXT}`, 'wait [data-tutorial-panel] >> text=Done']);
  });
});

describe('review cases', () => {
  it('a 1-answer auto step keeps its asks and an empty expect when the step had events', () => {
    const s = buildScript(GAME, line.actions.slice(0, 1), [{ id: 'a', n: 1, auto: true, narration: 'A.' }], { seed: SEED });
    expect(s.steps[0]).toMatchObject({ do: { kind: 'auto', moves: [['add']] }, asks: 'Add {plus}', expect: [] });
  });
  it('reads refs through findOption', () => {
    const g: TutorialGame<Counter> = { ...GAME, findOption: (_s, ref) => (ref === 'plus' ? 'add' : undefined) };
    const s = buildScript(g, [{ ...line.actions[0], picks: ['plus'] } as (typeof line.actions)[number]], [{ id: 'p', n: 1, narration: 'P.' }], { seed: SEED });
    expect(s.steps[0]).toMatchObject({ do: { kind: 'move', prompt: 'turn', choose: ['plus'] }, asks: 'Add {plus}' });
    expect(answerWords(g, s)).toEqual([['Add {plus}']]);
    expect(playScript(g, s).failures).toEqual([]);
  });
  it('answerWords stops at a refused answer', () => {
    const s = buildScript(GAME, line.actions, PLAN, { seed: SEED });
    const [, one, rest] = s.steps as [TutorialStep, TutorialStep, TutorialStep];
    const bad = { ...s, steps: [one, { ...one, id: 'bad', do: { kind: 'move' as const, choose: ['skip'] } }, rest] };
    expect(answerWords(GAME, bad)).toEqual([['Add {plus}'], ['skip']]);
  });
  it('playTutorialE2E starts at from and calls before', async () => {
    const script = buildScript(GAME, line.actions, PLAN, { seed: SEED });
    const log: string[] = [];
    const page: TutorialPage = { waitForSelector: (s) => Promise.resolve(log.push(`wait ${s}`)), click: (s) => Promise.resolve(void log.push(`click ${s}`)) };
    await playTutorialE2E(page, script, { from: 3, over: false, before: (_p, s, n) => Promise.resolve(void log.push(`before ${String(n)} ${s.id}`)), answer: () => Promise.resolve() });
    expect(log).toEqual([`wait ${stepSelector(3)}`, 'before 3 rest', `click ${NEXT}`]);
  });
});
