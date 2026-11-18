import { describe, expect, it } from 'vitest';
import { CONTENT, COUNTER, RULES, type Counter } from '../engine-core/fake/counter.ts';
import { kernelPort } from '../engine-core/index.ts';
import { lockAt, lockPrompt, playScript, refusal, startRun, tutorialCheck, type TutorialGame, type TutorialPort, type TutorialScript } from './index.ts';

// K390: a game with its own engine: climb to 2; "down" is disabled at 0; string prompt ids, events in its log
interface Climb {
  readonly n: number;
  readonly asks: number;
  readonly log: readonly { readonly type: string; readonly n: number }[];
}
interface ClimbTypes {
  readonly state: Climb;
  readonly prompt: { readonly id: string; readonly options: readonly { readonly id: string; readonly enabled: boolean; readonly why?: string }[] };
  readonly event: { readonly type: string; readonly n: number };
  readonly task: never;
  readonly content: null;
}
const CLIMB: TutorialPort<ClimbTypes> = {
  content: null,
  start: (seed) => ({ n: seed === 'high' ? 1 : 0, asks: 1, log: [] }),
  apply(s, a) {
    if (a.promptId !== `q${String(s.asks)}` || s.n >= 2) return new Error('stale prompt');
    const up = a.picks[0] === 'up';
    if (!up && s.n === 0) return new Error('at zero');
    const n = s.n + (up ? 1 : -1);
    return { n, asks: s.asks + 1, log: [...s.log, { type: up ? 'up' : 'down', n }] };
  },
  settle: (s) => s,
  prompt: (s) => (s.n >= 2 ? null : { id: `q${String(s.asks)}`, options: [{ id: 'up', enabled: true }, s.n === 0 ? { id: 'down', enabled: false, why: 'at zero' } : { id: 'down', enabled: true }] }),
  events: (s) => s.log,
  result: (s) => (s.n >= 2 ? { kind: 'won' } : null),
  promptKind: () => 'climb',
  findOption: (_s, ref) => (ref === 'Up' ? 'up' : ref === 'Down' ? 'down' : undefined),
  optionWords: (_s, id) => (id === 'up' ? 'Climb' : 'Step down'),
  eventWords: (_s, e) => `${e.type} to ${String(e.n)}`,
};
const CLIMB_SCRIPT: TutorialScript = {
  seed: 'low',
  title: 'climb',
  steps: [
    { id: 'intro', narration: 'Climb.', targets: [], do: { kind: 'next' } },
    { id: 'up', narration: 'Up.', targets: [], do: { kind: 'move', prompt: 'climb', choose: ['Up'] }, expect: [{ type: 'up', n: 1 }], items: ['climbing'] },
    { id: 'top', narration: 'Top.', targets: [], do: { kind: 'move', choose: ['Up'] }, expect: [{ type: 'up' }] },
  ],
  end: { kind: 'won' },
};
const io = () => {
  const lines: string[] = [];
  return { lines, io: { out: (l: string) => void lines.push(l), err: (l: string) => void lines.push(`E ${l}`) } };
};

describe('K390 tutorial over an engine port', () => {
  it('playScript plays a script on a game with its own engine', () => {
    const r = playScript(CLIMB, CLIMB_SCRIPT, { items: ['climbing'], evidence: { climbing: ['up'] } });
    expect(r.problems).toEqual([]);
    expect(r.run.actions).toEqual([
      { kind: 'answer', promptId: 'q1', picks: ['up'] },
      { kind: 'answer', promptId: 'q2', picks: ['up'] },
    ]);
    expect(r.run.state.n).toBe(2);
  });
  it('playScript reports failures in the port game words', () => {
    const down = { ...CLIMB_SCRIPT, steps: CLIMB_SCRIPT.steps.map((s) => (s.id === 'up' ? { ...s, do: { kind: 'move' as const, choose: ['Down'] } } : s)) };
    expect(playScript(CLIMB, down).problems).toEqual(['step 2 (up) DISABLED_OPTION: expected an answer Down; instead Down is offered but disabled (at zero)']);
    const missing = { ...CLIMB_SCRIPT, steps: CLIMB_SCRIPT.steps.map((s) => (s.id === 'up' ? { ...s, expect: [{ type: 'down' }] } : s)) };
    expect(playScript(CLIMB, missing).problems[0]).toContain("the step's events were [up to 1]");
    expect(playScript(CLIMB, CLIMB_SCRIPT, { seed: 'high', stopOnFailure: false }).problems[1]).toMatch(/^step 3 \(top\) NO_PROMPT: .*the game is over/);
  });
  it('lockAt locks the port prompt to the scripted answer', () => {
    const { state } = startRun(CLIMB, 'low');
    const lock = lockAt(CLIMB, CLIMB_SCRIPT, 1, state);
    expect(lock.answer).toEqual(['up']);
    expect(lock.asks).toBe('Climb');
    expect(lock.option('down')).toEqual({ enabled: false, why: 'The tutorial asks for Climb.' });
    expect(lock.accepts({ kind: 'answer', promptId: 'q1', picks: ['up'] })).toBe(true);
    expect(refusal(lock, { kind: 'answer', promptId: 'q1', picks: ['down'] })).toBe('The tutorial asks for Climb.');
    const p = CLIMB.prompt(state);
    expect(p && lockPrompt(p, lock).options.map((o) => o.enabled)).toEqual([true, false]);
  });
  it('tutorialCheck passes and fails on the port', () => {
    const ok = io();
    expect(tutorialCheck(CLIMB, CLIMB_SCRIPT, {}, ok.io)).toBe(0);
    expect(ok.lines).toEqual(['tutorial:check: climb on seed low: 3 steps, 2 answers, ended {"kind":"won"}: OK']);
    const bad = io();
    expect(tutorialCheck(CLIMB, { ...CLIMB_SCRIPT, end: { kind: 'lost' } }, {}, bad.io)).toBe(1);
    expect(bad.lines[1]).toBe('E   END: the game ended {"kind":"won"}, the script expects {"kind":"lost"}');
  });
  it('the counter gives the same results through GameRules and through kernelPort', () => {
    const words = { optionWords: (_s: unknown, id: string) => (id === 'add' ? 'Add' : id) };
    const rules: TutorialGame<Counter> = { rules: COUNTER, content: CONTENT, gameRules: RULES, options: (seed) => ({ seed }), ...words };
    const port: TutorialPort<Counter> = { ...kernelPort(COUNTER, CONTENT, { gameRules: RULES }), ...words };
    const script: TutorialScript = {
      seed: 'tut',
      steps: [
        { id: 'add', narration: 'Add.', targets: [], do: { kind: 'move', choose: ['add'] }, expect: [{ type: 'added', n: 1 }] },
        { id: 'draw', narration: 'Draw.', targets: [], do: { kind: 'move', choose: ['draw'] }, expect: [{ type: 'drawn', card: 6 }] },
        { id: 'auto', narration: 'On.', targets: [], do: { kind: 'auto', moves: [['add'], ['draw'], ['draw']] } },
        { id: 'won', narration: 'Won.', targets: [], do: { kind: 'next' } },
      ],
      end: { kind: 'won' },
    };
    const a = playScript(rules, script);
    expect(a.problems).toEqual([]);
    expect(playScript(port, script)).toEqual(a);
    const s = startRun(rules, 'tut').state;
    const la = lockAt(rules, script, 0, s);
    const lb = lockAt(port, script, 0, s);
    expect([lb.answer, lb.asks, lb.option('draw'), lb.button('next')]).toEqual([la.answer, la.asks, la.option('draw'), la.button('next')]);
    const [x, y] = [io(), io()];
    expect([tutorialCheck(port, script, {}, y.io), y.lines]).toEqual([tutorialCheck(rules, script, {}, x.io), x.lines]);
  });
});
