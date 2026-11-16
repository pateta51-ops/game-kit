// The runner, ctx.then, prompts, validateAction and applyAction (the ported kernel),
// on small synthetic handler tables so the kernel is tested apart from the rules.
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  applyActionWith,
  copyJson,
  EngineBugError,
  hashValue,
  IllegalActionError,
  isRevealing,
  makeCtx,
  MAX_TASKS_PER_ACTION,
  run,
  setInvariantChecking,
  validateAction,
  type AnswerAction,
  type Ctx,
  type Draft,
  type HandlerTable,
  type KernelPrompt,
} from './index';
import { bareState, CONTENT, COUNTER, type Counter, type CounterEvent, type CounterState, type CounterTask } from './fake/counter';

type Action = AnswerAction;
type Task = CounterTask;
const task = (kind: string): Task => ({ kind });

function runWith(table: HandlerTable<Counter>, s: Draft<CounterState>, ...first: Task[]): CounterEvent[] {
  const events: CounterEvent[] = [];
  const ctx = makeCtx<Counter>(COUNTER, s, CONTENT, events);
  ctx.then(...first);
  run(ctx, table);
  return events;
}

const PROMPT: Omit<KernelPrompt, 'id'> = {
  options: [
    { id: 'a', enabled: true },
    { id: 'b', enabled: true },
    { id: 'c', enabled: false, why: 'not now' },
  ],
  min: 1,
  max: 2,
};

/** The handler pushes the resume task, then asks. */
const askPrompt = (ctx: Ctx<Counter>): void => {
  ctx.then(task('picked'));
  ctx.ask(PROMPT);
};

/** A state waiting on a prompt, as the engine would leave it. */
function asking(): Draft<CounterState> {
  const s = bareState();
  runWith({ ask: askPrompt }, s, task('ask'));
  return s;
}

describe('runner and ctx', () => {
  it('then(a, b, c) runs a, then b, then c; separate then calls run in reverse', () => {
    const log: string[] = [];
    const rec = (name: string) => () => {
      log.push(name);
    };
    const table: HandlerTable<Counter> = {
      a: rec('a'),
      b: rec('b'),
      c: rec('c'),
      split: (ctx) => {
        ctx.then(task('a'));
        ctx.then(task('b'));
      },
    };
    runWith(table, bareState(), task('a'), task('b'), task('c'));
    expect(log).toEqual(['a', 'b', 'c']);
    log.length = 0;
    runWith(table, bareState(), task('split'));
    expect(log).toEqual(['b', 'a']);
  });

  it('stops at a prompt, and a second prompt while one is open is an engine bug', () => {
    const table: HandlerTable<Counter> = {
      ask: (ctx) => {
        ctx.ask(PROMPT, task('picked'));
      },
      twice: (ctx) => {
        ctx.ask(PROMPT);
        ctx.ask(PROMPT);
      },
      never: () => {
        throw new Error('ran after a prompt');
      },
    };
    const s = bareState();
    runWith(table, s, task('ask'), task('never'));
    expect(s.prompt?.id).toBe(1);
    expect(s.stack).toEqual([task('never'), { kind: 'picked', prompt: 1 }]);
    expect(() => runWith(table, bareState(), task('twice'))).toThrow(EngineBugError);
  });

  it('numbers events from the state sequence counter and prompts from their own counter', () => {
    const table: HandlerTable<Counter> = {
      say: (ctx) => {
        ctx.emit({ type: 'added', n: 1 });
        ctx.emit({ type: 'added', n: 2 });
        ctx.ask(PROMPT, task('picked'));
      },
    };
    const s = bareState();
    const events = runWith(table, s, task('say'));
    expect(events.map((e) => e.seq)).toEqual([1, 2]);
    // the game's stamp fields (the fake game stamps the turn)
    expect(events.map((e) => [e.turn])).toEqual([[0], [0]]);
    expect(s.seq).toBe(3);
    expect(s.prompt?.id).toBe(1);
    expect(s.promptSeq).toBe(2);
    expect(s.log.map((e) => e.seq)).toEqual([1, 2]);
  });

  it('draws only from the seeded rng: the same seed gives the same numbers, and the state records the draws', () => {
    const draw = (seed: string): { values: number[]; rng: CounterState['rng'] } => {
      const s = bareState(seed);
      const values: number[] = [];
      runWith({ d: (ctx) => values.push(ctx.rng.int(1000), ctx.rng.int(1000)) }, s, task('d'));
      return { values, rng: s.rng };
    };
    expect(draw('x')).toEqual(draw('x'));
    expect(draw('x').values).not.toEqual(draw('y').values);
    expect(draw('x').rng).not.toEqual(bareState('x').rng);
  });

  it('a task kind with no handler, and a runaway loop, are engine bugs', () => {
    expect(() => runWith({}, bareState(), task('nothing'))).toThrow(/no handler for task kind "nothing"/);
    const table: HandlerTable<Counter> = { loop: (ctx) => ctx.then(task('loop')) };
    expect(() => runWith(table, bareState(), task('loop'))).toThrow(
      new RegExp(`more than ${String(MAX_TASKS_PER_ACTION)} tasks`),
    );
  });

  it('schedules and asks nothing once the game is over', () => {
    const s = bareState();
    s.result = { kind: 'lost' };
    runWith({ ask: (ctx) => ctx.ask(PROMPT), a: () => undefined }, s, task('ask'), task('a'));
    expect(s.prompt).toBeNull();
    expect(s.stack).toEqual([]);
  });
});

describe('validateAction', () => {
  const answer = (picks: string[], promptId = 1): Action => ({ kind: 'answer', promptId, picks });
  const code = (s: CounterState, a: Action): string | undefined => {
    const r = validateAction<Counter>(s, a);
    return r.ok ? undefined : r.error.split(':')[0];
  };

  it('accepts an answer within min..max to enabled options', () => {
    const s = asking();
    expect(validateAction<Counter>(s, answer(['a'])).ok).toBe(true);
    expect(validateAction<Counter>(s, answer(['b', 'a'])).ok).toBe(true);
  });

  it('refuses a wrong prompt, a bad count, a repeat, an unknown option and a disabled option', () => {
    const s = asking();
    expect(code(s, answer(['a'], 9))).toBe('WRONG_PROMPT');
    expect(code(s, answer([]))).toBe('BAD_CHOICE');
    expect(code(s, answer(['a', 'b', 'c']))).toBe('BAD_CHOICE');
    expect(code(s, answer(['a', 'a']))).toBe('BAD_CHOICE');
    expect(code(s, answer(['zzz']))).toBe('BAD_CHOICE');
    const disabled = validateAction<Counter>(s, answer(['c']));
    expect(code(s, answer(['c']))).toBe('NOT_LEGAL');
    expect(!disabled.ok && disabled.error).toContain('not now');
  });

  it('refuses an answer with no prompt open, any action after the game ended, and unknown action kinds', () => {
    expect(code(bareState(), answer(['a']))).toBe('NO_PROMPT');
    const over = bareState();
    over.result = { kind: 'lost' };
    expect(code(over, answer(['a']))).toBe('GAME_OVER');
    expect(code(bareState(), { kind: 'dance' } as unknown as Action)).toBe('BAD_ACTION');
  });
});

describe('applyAction', () => {
  const answer = (promptId: number, ...picks: string[]): Action => ({ kind: 'answer', promptId, picks });

  it('closes the prompt, runs the resume task with the answer, and returns a frozen state; the input is unchanged', () => {
    const seen: unknown[] = [];
    const table: HandlerTable<Counter> = { picked: (_ctx, t) => seen.push(t.answer) };
    const before = asking();
    const snapshot = copyJson(before);
    const result = applyActionWith(COUNTER, before, answer(1, 'b', 'a'), CONTENT, table);
    expect(seen).toEqual([['b', 'a']]);
    expect(result.state.prompt).toBeNull();
    expect(result.state.stack).toEqual([]);
    expect(Object.isFrozen(result.state)).toBe(true);
    expect(isRevealing(result.events)).toBe(false);
    expect(hashValue(before)).toBe(hashValue(snapshot));
  });

  it('throws an IllegalActionError, not a state, for an answer the prompt refuses', () => {
    const before = asking();
    expect(() => applyActionWith(COUNTER, before, answer(1, 'zzz'), CONTENT, {})).toThrow(IllegalActionError);
    expect(() => applyActionWith(COUNTER, before, answer(1, 'zzz'), CONTENT, {})).toThrow(
      'BAD_CHOICE: "zzz" is not an option of this prompt.',
    );
  });

  it('marks an action revealing when one of its events has reveal: true', () => {
    const table: HandlerTable<Counter> = {
      picked: (ctx) => ctx.emit({ type: 'drawn', card: 1, reveal: true }),
    };
    const result = applyActionWith(COUNTER, asking(), answer(1, 'a'), CONTENT, table);
    expect(isRevealing(result.events)).toBe(true);
  });

  it("fills violations only while invariant checking is on (the game's checks, with the state before)", () => {
    const quiet: HandlerTable<Counter> = { picked: () => undefined };
    expect(applyActionWith(COUNTER, asking(), answer(1, 'a'), CONTENT, quiet).violations).toEqual([]);
    setInvariantChecking(true);
    try {
      const bad: HandlerTable<Counter> = {
        picked: (ctx) => {
          (ctx.s as Draft<CounterState>).counter = -1;
          ctx.then(task('picked'));
          ctx.ask(PROMPT); // the game still waits on a prompt
        },
      };
      const result = applyActionWith(COUNTER, asking(), answer(1, 'a'), CONTENT, bad);
      // C-01: the counter is negative; C-02: it went down from the state before the action
      expect(result.violations.map((v) => v.id)).toEqual(['C-01', 'C-02']);
      expect(COUNTER.invariants?.(asking(), CONTENT, [])).toEqual([]);
    } finally {
      setInvariantChecking(false);
    }
  });

  it("the public applyAction runs the game's handlers: with none registered, an answer is an engine bug", () => {
    expect(() => applyAction({ ...COUNTER, handlers: {} }, asking(), answer(1, 'a'), CONTENT)).toThrow(EngineBugError);
  });
});
