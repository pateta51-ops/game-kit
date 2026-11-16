import { describe, expect, it } from 'vitest';
import { addStep, applyAction, createGame, createSave, draftOf, hashValue, newSteps, own, restoreSave, seedRng, undoStep, type AnswerAction, type GameRules, type KernelPrompt, type KernelState, type KernelTask } from '../engine-core/index';
import { beatProblems, beatQuestion, READ_ON, storyHandlers, storyTask, type AskBeat, type Story } from './index';

const long: AskBeat = { id: 'long', lines: [{ text: 'one' }, { text: 'two' }, { speaker: 'cap', text: 'three', fallback: 'Someone speaks.' }], split: 1, ask: { kind: 'choose', choices: [{ id: 'east', label: 'Go east' }, { id: 'west', label: 'Go west', enabled: false, why: 'Bridge out' }] } };
const S: Story = {
  speakers: [{ id: 'cap', name: 'Cap' }],
  scenarios: [{
    id: 's1', title: 'One',
    slots: { intro: [long] },
    sheet: [{ id: 'before', beats: [{ id: 'pick', lines: [{ text: 'Pick one' }], ask: { kind: 'card', cards: [{ id: 'c1' }, { id: 'c2', faceDown: true }] } } as AskBeat] }],
  }],
};

type St = KernelState & { readonly picked: readonly string[]; readonly stack: readonly (KernelTask & { scenario?: string; beat?: string; part?: number })[]; readonly prompt: (KernelPrompt & { story?: unknown }) | null };
interface G { state: St; action: AnswerAction; task: St['stack'][number]; prompt: KernelPrompt; event: { seq: number }; stamped: never; content: Story; options: { seed: string }; rules: object }

const GAME: GameRules<G> = {
  handlers: {
    ...storyHandlers<G>({ story: (ctx) => ctx.content, answered: (ctx, _t, picks) => { own(draftOf(ctx), 'picked').push(...picks); } }),
    end: (ctx) => { draftOf(ctx).result = 'done'; },
  },
  blank: (o) => { const [a, b, c, d] = seedRng(o.seed); return { rng: { a, b, c, d }, stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [], picked: [] }; },
  setup: (ctx) => ctx.then(storyTask('s1', 'long'), storyTask('s1', 'pick'), { kind: 'end' }),
  contentHash: (c) => hashValue(c),
};
const answer = (s: St, ...picks: string[]): AnswerAction => ({ kind: 'answer', promptId: (s.prompt as KernelPrompt).id, picks });

describe('story beats as engine questions (K153)', () => {
  it('a long beat asks read on part by part, then its question; the answer reaches the game', () => {
    let s = createGame(GAME, { seed: 'x' }, {}, S).state;
    expect(s.prompt?.options.map((o) => o.id)).toEqual([READ_ON]);
    expect(s.prompt?.story).toEqual({ scenario: 's1', beat: 'long', part: 0 });
    s = applyAction(GAME, s, answer(s, READ_ON), S).state;
    s = applyAction(GAME, s, answer(s, READ_ON), S).state;
    expect(s.prompt?.options).toEqual([{ id: 'east', enabled: true }, { id: 'west', enabled: false, why: 'Bridge out' }]);
    expect(beatQuestion(S, { scenario: 's1', beat: 'long', part: 2 }, [])?.beat.lines.map((l) => l.text)).toEqual(['Someone speaks.']);
    expect(() => applyAction(GAME, s, answer(s, 'west'), S)).toThrow();
    s = applyAction(GAME, s, answer(s, 'east'), S).state;
    expect(beatQuestion(S, { scenario: 's1', beat: 'pick', part: 0 }, [])).toMatchObject({ of: 1, min: 1, max: 1, ask: { kind: 'card' } });
    expect(s.prompt?.options.map((o) => o.id)).toEqual(['c1', 'down:1']);
    const acts = [answer(s, 'down:1')];
    expect(JSON.stringify([s.prompt, s.log, acts])).not.toContain('c2');
    s = applyAction(GAME, s, acts[0] as AnswerAction, S).state;
    expect(JSON.stringify(s.log)).not.toContain('c2');
    expect(s.picked).toEqual(['east', 'c2']);
    expect(s.result).toBe('done');
  });
  it('a save between parts resumes at the part reached; undo takes one part back', () => {
    const s0 = createGame(GAME, { seed: 'x' }, {}, S).state;
    const actions = [answer(s0, READ_ON)];
    const save = createSave(GAME, { options: { seed: 'x' }, rules: {}, actions, undoUsed: false, savedAt: 't' }, S);
    const r = restoreSave(GAME, JSON.parse(JSON.stringify(save)), S);
    expect(r.ok && r.state.prompt?.story).toEqual({ scenario: 's1', beat: 'long', part: 1 });
    let h = newSteps<G>(s0);
    h = addStep(GAME, h, actions[0] as AnswerAction, S).history;
    h = undoStep(GAME, h, 'safe', S).history;
    expect(h.state).toEqual(s0);
  });
  it('a save after an answered choice and a face-down pick replays to the same state', () => {
    let s = createGame(GAME, { seed: 'x' }, {}, S).state;
    const actions: AnswerAction[] = [];
    for (const p of [READ_ON, READ_ON, 'east', 'down:1']) { const a = answer(s, p); actions.push(a); s = applyAction(GAME, s, a, S).state; }
    const save = createSave(GAME, { options: { seed: 'x' }, rules: {}, actions, undoUsed: false, savedAt: 't' }, S);
    const r = restoreSave(GAME, JSON.parse(JSON.stringify(save)), S);
    expect(r.ok && r.state).toEqual(s);
    expect(r.ok && r.state.picked).toEqual(['east', 'c2']);
  });
  it('beatProblems', () => {
    expect(beatProblems(S)).toEqual([]);
    const bad: Story = { speakers: [], scenarios: [{ id: 'b', title: 'B', sheet: [{ id: 'p', beats: [{ lines: [], ask: { kind: 'card', cards: [], min: 2, max: 1 } } as unknown as AskBeat, { id: 'x', lines: [] }, { id: 'x', lines: [] }] }] }] };
    expect(beatProblems(bad)).toEqual(['b: duplicate beat id', 'b: a question beat has no id', 'b/undefined: min above max']);
  });
});
